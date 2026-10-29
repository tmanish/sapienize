#!/usr/bin/env node
"use strict";
// Local verification for prose written by the Claude host. Never calls a provider.
const fs = require('fs');
const path = require('path');
const { runtimeRoot } = require('./runtime.cjs');

function check(spec, directory) {
  const root = runtimeRoot();
  const core = require(path.join(root, 'src/core/index.js'));
  const { rankCandidates } = require(path.join(root, 'src/rewrite/rank.js'));
  const allowed = ['mode', 'originalPath', 'sourceFactsPath', 'candidatePaths', 'samplePaths', 'profilePath', 'contentMode'];
  if (!spec || typeof spec !== 'object' || Array.isArray(spec) || Object.keys(spec).some(k=>!allowed.includes(k))) throw Error('Unsupported check specification.');
  if (!['rewrite', 'generation'].includes(spec.mode)) throw Error('mode must be rewrite or generation.');
  if (!Array.isArray(spec.candidatePaths) || spec.candidatePaths.length < 1 || spec.candidatePaths.length > 3) throw Error('Supply one to three candidatePaths.');
  if (Boolean(spec.samplePaths) === Boolean(spec.profilePath)) throw Error('Supply samplePaths or profilePath, not both.');
  function read(file) {
    if (typeof file !== 'string' || !file.trim()) throw Error('Expected a nonempty file path.');
    return fs.readFileSync(path.resolve(directory, file), 'utf8');
  }
  if (spec.samplePaths && (!Array.isArray(spec.samplePaths) || !spec.samplePaths.length)) throw Error('samplePaths must be a nonempty array.');
  const profile = spec.profilePath ? JSON.parse(read(spec.profilePath)) : core.createVoiceProfile(spec.samplePaths.map(read));
  const original = spec.mode === 'rewrite' ? read(spec.originalPath) : null;
  if (spec.mode === 'generation' && spec.originalPath) throw Error('Generation uses sourceFactsPath, not an original document.');
  if (spec.mode === 'rewrite' && spec.sourceFactsPath) throw Error('Rewrite verification uses originalPath.');
  const facts = spec.sourceFactsPath ? read(spec.sourceFactsPath) : '';
  const contentMode = spec.contentMode || 'factual';
  if (!['factual', 'fiction'].includes(contentMode)) throw Error('contentMode must be factual or fiction.');
  const candidates = spec.candidatePaths.map((file, index) => {
    const text = read(file);
    if (!text.trim()) throw Error('Candidate text must not be empty.');
    let verification;
    if (spec.mode === 'rewrite') verification = core.verify(original, text, {voiceProfile:profile});
    else {
      const analysis = core.analyze(text, {voiceProfile:profile});
      verification = {status:'review', accepted:false, requiresReview:true,
        semanticIntegrity:facts.trim() ? core.verifyGeneration(facts,text,{contentMode}) : analysis.semanticIntegrity,
        voiceMatch:analysis.voiceMatch, stylisticSignals:analysis.stylisticSignals,
        documentIntegrity:analysis.provenance.documentIntegrity};
    }
    return {text, candidatePath:file, pass:index+1, verification, incomplete:false};
  });
  const ranked = rankCandidates(candidates, {voiceProfile:profile});
  const best = ranked.best;
  const voiceTargetMet = best.verification.voiceMatch.score >= 80;
  const failed = !best.ranking.eligible;
  const accepted = !failed && spec.mode === 'rewrite' && voiceTargetMet && best.verification.status === 'pass';
  return {kind:'host_candidate_check', mode:spec.mode, origin:'host_authored_candidates_locally_measured', networkCalls:0,
    status:failed?'fail':accepted?'complete':'review_required', accepted, selectedPath:best.candidatePath,
    originalVoiceScore:original ? core.compareVoice(original,profile).score : null,
    voiceRefinement:{selectedScore:best.verification.voiceMatch.score,targetScore:80,targetMet:voiceTargetMet},
    sampleWarnings:profile.warnings, candidates:ranked.candidates,
    detectorObservation:null, limitations:['Local descriptive checks do not prove authorship, voice authenticity or complete semantic equivalence.',
      'Candidate files are treated as completed host drafts; the helper cannot detect an unreported host truncation. Inspect completion before checking.']};
}

if (require.main === module) {
  try {
    if (process.argv.length !== 3) throw Error('Usage: node scripts/check.cjs request.json');
    const file = path.resolve(process.argv[2]);
    const result = check(JSON.parse(fs.readFileSync(file, 'utf8')), path.dirname(file));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exitCode = result.status === 'fail' ? 3 : result.accepted ? 0 : 4;
  } catch (_) {
    console.error('Local check failed: use Node 20.19+, the extracted skill package, and a valid request with readable files. No network request was made.');
    process.exitCode = 1;
  }
}
module.exports = { check };
