"use strict";
const assert = require('assert');
const core = require('../src/core');
const semantic = require('../src/rewrite/semantic');
const prompts = require('../src/rewrite/prompt');
const refinement = require('../src/rewrite/detector-refinement');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { JSDOM } = require('jsdom');
const { run } = require('../src/cli/sapienize');
const facts = 'The room reopened on Monday. Repairs cost 40 pounds. Miss Reed kept admission free. The notice said, “Come inside.”';
const scene = facts + '\n\n“Is it dry?” asked a visitor. “Quite dry,” Miss Reed replied. She put a book on the desk.';
const sample = ('Well, we don’t rush; we have time to do it properly. We check the work—and then we check again. A very small change can matter.\n\n').repeat(25);

function detectorFetch(humanScores, versions = []) {
  let calls = 0;
  const fetch = async (_url, options) => {
    assert.strictEqual(options.headers['x-api-key'], 'detector-test-key');
    assert.ok(JSON.parse(options.body).document);
    const index = calls++, human = humanScores[Math.min(index, humanScores.length - 1)];
    return { ok: true, status: 200, json: async () => ({ version: versions[index] || 'test-version', result_message: 'RAW_VENDOR_INSTRUCTION_SENTINEL',
      documents: [{ predicted_class: human > 0.5 ? 'human' : 'ai', class_probabilities: { human, ai: 1 - human, mixed: 0 } }] }) };
  };
  return { fetch, calls: () => calls };
}

(async () => {
  const fiction = semantic.verifyGeneration(facts, scene, { contentMode: 'fiction' });
  assert.strictEqual(fiction.status, 'review');
  assert.strictEqual(fiction.criticalDifferenceCount, 0);
  assert(fiction.permittedAdditions.some(d => d.type === 'quotation'));
  const factual = semantic.verifyGeneration(facts, scene);
  assert.strictEqual(factual.permittedAdditions.length, 0);
  assert(factual.differences.some(d => d.type === 'quotation' && d.change === 'added'));
  for (const altered of [scene.replace('40', '400'), scene.replace('Monday', 'Tuesday'), scene.replaceAll('Miss Reed', 'Miss Lane'), scene.replace('Come inside.', 'Go away.'), scene.replace('kept admission free', 'did not keep admission free')]) {
    assert.strictEqual(semantic.verifyGeneration(facts, altered, { contentMode: 'fiction' }).status, 'fail', altered);
  }
  assert.strictEqual(semantic.verifyGeneration(facts, scene + ' Repairs cost 400 pounds.', { contentMode: 'fiction' }).status, 'fail', 'correct anchor elsewhere must not conceal conflicting near-match');
  assert.strictEqual(semantic.verifyGeneration('Alice approved the release.', 'Bob approved the release.', { contentMode: 'fiction' }).status, 'fail');
  assert.strictEqual(semantic.verifySemanticIntegrity(facts, scene).status, 'fail', 'rewrite checks remain strict');

  const profile = core.createVoiceProfile(sample);
  const guide = prompts.buildGenerationPrompt('Write a scene.', { voiceProfile: profile, contentMode: 'fiction', targetWords: 400 });
  assert(guide.includes('<voice_guidance>'));
  assert(guide.includes('lower/upper quartiles'));
  assert(guide.includes('Explicit fiction mode'));
  assert(!guide.includes(sample));
  let voiceCalls = 0, secondPrompt;
  const baseline = 'The project is a comprehensive initiative. It is important to note that every activity requires careful consideration.';
  const generated = await core.generate('Write a fictional scene.', { voiceProfile: profile, contentMode: 'fiction', maxVoicePasses: 2,
    provider: { rewrite: async prompt => { voiceCalls++; if (voiceCalls === 2) secondPrompt = prompt; return voiceCalls === 1 ? baseline : sample; } } });
  assert.strictEqual(voiceCalls, 2);
  assert(secondPrompt.includes('largest weighted voice differences'));
  assert(secondPrompt.includes('<previous_draft>'));
  assert(generated.voiceRefinement.selectedScore >= generated.voiceRefinement.initialScore);
  assert.strictEqual(generated.accepted, false);
  // Even a perfect sample-like candidate cannot outrank a source-fact violation.
  let n = 0;
  const gated = await core.generate('Write.', { voiceProfile: profile, sourceFacts: facts, maxVoicePasses: 2,
    provider: { rewrite: async () => ++n === 1 ? facts : sample } });
  assert.strictEqual(gated.text, facts);
  assert.strictEqual(gated.candidates[1].ranking.eligible, false);
  for (const invalid of [{contentMode:'maybe'}, {maxVoicePasses:0}, {maxVoicePasses:4}, {detectorRefinement:{}}, {detectorRefinement:{apiKey:'x',maxPasses:4}}]) {
    await assert.rejects(core.generate('Write.', { voiceProfile:profile, provider:{rewrite:async()=>{throw Error('Must not call provider');}}, ...invalid }));
  }

  const original = 'The team shipped 12 units on 4 July 2026.';
  const revision = 'On 4 July 2026, the team shipped 12 units.';
  const detector = detectorFetch([0.2, 0.8]);
  let calls = 0, measuredPrompt;
  const result = await core.rewrite(original, { maxPasses: 1,
    provider:{rewrite:async p=>{calls++; if(calls===2)measuredPrompt=p; return calls===1?original:revision;}},
    detectorRefinement:{apiKey:'detector-test-key',fetch:detector.fetch,maxPasses:2} });
  assert.strictEqual(result.text, revision);
  assert.strictEqual(result.detectorRefinement.status, 'improved_vendor_score');
  assert.strictEqual(result.detectorRefinement.before.normalized.classProbabilities.human, 0.2);
  assert.strictEqual(result.detectorRefinement.after.normalized.classProbabilities.human, 0.8);
  assert.strictEqual(detector.calls(), 2);
  assert.strictEqual(result.passCount, 2);
  assert(measuredPrompt.includes('explicitly enabled experimental detector-aware refinement'));
  assert(!measuredPrompt.includes('Do not optimize for an AI detector'));
  assert(!measuredPrompt.includes('RAW_VENDOR_INSTRUCTION_SENTINEL'));
  assert(!measuredPrompt.includes('detector-test-key'));

  for (const variant of ['fact-change', 'version-change', 'unavailable', 'unknown']) {
    const d = detectorFetch([0.2,0.9], variant==='version-change'?['v1','v2']:variant==='unknown'?['unknown']:[]);
    let writers = 0;
    const r = await core.rewrite(original, { maxPasses:1,
      provider:{rewrite:async()=>++writers===1?original:variant==='fact-change'?revision.replace('12','120'):revision},
      detectorRefinement:{apiKey:'detector-test-key',maxPasses:2,fetch:variant==='unavailable'?async()=>{throw Error('secret');}:d.fetch} });
    assert.strictEqual(r.text, original, variant);
    if (variant==='fact-change') assert.strictEqual(d.calls(),1);
    if (variant==='unknown') assert.strictEqual(writers,1);
    if (variant==='unavailable') assert(!JSON.stringify(r).includes('secret'));
  }
  const d = detectorFetch([0.2,0.99]);
  const candidate = (score, text) => ({text, verification:{semanticIntegrity:{status:'pass',score:100,criticalDifferenceCount:0},voiceMatch:{score},documentIntegrity:{status:'clean'}}});
  const voiceGated = await refinement.run({session:refinement.createSession({apiKey:'detector-test-key',fetch:d.fetch}),initial:candidate(90,'Initial'),revise:async()=>candidate(80,'Weak voice')});
  assert.strictEqual(voiceGated.best.text,'Initial');
  assert.strictEqual(d.calls(),1);
  assert.strictEqual(voiceGated.report.candidates[0].eligible,false);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sapienize-refinement-'));
  try {
    fs.writeFileSync(path.join(directory, 'brief.txt'), 'Write a fictional scene.');
    fs.writeFileSync(path.join(directory, 'sample.txt'), sample);
    fs.writeFileSync(path.join(directory, 'facts.txt'), facts);
    let output = '', errors = '';
    const io = {cwd:directory,env:{},stdout:x=>{output+=x;},stderr:x=>{errors+=x;}};
    const args = ['generate','brief.txt','--samples','sample.txt','--facts','facts.txt','--content-mode','fiction','--voice-passes','2'];
    const code = await run(args,io,{provider:{rewrite:async()=>scene}});
    assert.strictEqual(code,4,errors);
    assert.strictEqual(JSON.parse(output).verification.semanticIntegrity.criticalDifferenceCount,0);
    output='';errors='';
    assert.strictEqual(await run([...args,'--detector-passes','2'],io,{provider:{rewrite:async()=>{throw Error('must not call');}}}),1);
    assert(errors.includes('GPTZERO_API_KEY'));
  } finally { fs.rmSync(directory,{recursive:true,force:true}); }

  const dom = new JSDOM(fs.readFileSync(path.join(__dirname,'../sapienize.html'),'utf8'),{runScripts:'dangerously',pretendToBeVisual:true});
  const w=dom.window,$=id=>w.document.getElementById(id);
  function input(id,value){$(id).value=value;$(id).dispatchEvent(new w.Event('input'));}
  function select(id,value){$(id).value=value;$(id).dispatchEvent(new w.Event('change'));}
  async function settle(){for(let i=0;i<100;i++){if(!$('generateBtn').disabled)return;await new Promise(r=>setTimeout(r,10));}throw Error('UI did not settle');}
  select('provider','openai');input('apiKey','writer-test-key');input('voice',sample);input('sourceFacts',facts);input('brief','Write a fictional scene.');select('contentMode','fiction');select('voicePasses','2');
  let requests=0;
  w.fetch=async()=>{requests++;return{ok:true,json:async()=>w.JSON.parse(JSON.stringify({choices:[{message:{content:scene},finish_reason:'stop'}]}))};};
  $('generateBtn').click();await settle();
  assert.strictEqual(requests,2);
  assert($('rwReview').textContent.includes('fictional additions allowed'));
  assert(!$('rwReview').textContent.includes('Semantic review · fail'));
  select('contentMode','factual');
  assert($('rwResult').classList.contains('hidden'),'changing fiction permission invalidates old results');
  $('detectorRefine').checked=true;$('detectorRefine').dispatchEvent(new w.Event('change'));
  const beforeRequests=requests;
  $('generateBtn').click();await settle();
  assert.strictEqual(requests,beforeRequests,'missing detector key is checked before paid writing');
  assert($('rwStatus').textContent.includes('GPTZero API key'));
  dom.window.close();
  console.log('PASS: fiction source preservation, voice-guided passes and explicit detector refinement with fidelity/voice/version/credential gates');
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
