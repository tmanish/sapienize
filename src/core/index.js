/* Public provider-neutral Sapienize v2 API. */
(function (root, factory) {
  var api = typeof module === "object" && module.exports
    ? factory(
        require("./types.js"), require("./analyze.js"),
        require("../analysis/stylistic-signals.js"),
        require("../voice/profile.js"), require("../voice/compare.js"),
        require("../rewrite/semantic.js"), require("../rewrite/verify.js"),
        require("../rewrite/prompt.js"), require("../rewrite/rank.js"),
        require("../providers/index.js"), require("../provenance/index.js"), require("../detectors/index.js"), require("../rewrite/detector-refinement.js")
      )
    : factory(
        root.SapienizeTypes, root.SapienizeAnalyze, root.SapienizeStylisticSignals,
        root.SapienizeVoiceProfile, root.SapienizeVoiceCompare,
        root.SapienizeSemantic, root.SapienizeVerify,
        root.SapienizeRewritePrompt, root.SapienizeRewriteRank,
        root.SapienizeProviders, root.SapienizeProvenance, root.SapienizeDetectors, root.SapienizeDetectorRefinement
      );
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.SapienizeCore = api;
    root.sapienize = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (types, analyzer, stylistic, voiceProfile, voiceCompare, semantic, verifier, prompt, rank, providers, provenance, detectors, detectorRefinement) {
  "use strict";

  function createVoiceProfile(samples) { return voiceProfile.createVoiceProfile(samples); }
  function compareVoice(text, profile) { return voiceCompare.compareVoice(text, profile); }

  function semanticConstraints(text) {
    return {
      numbers: semantic.extractNumbers(text),
      urls: semantic.extractUrls(text),
      dates: semantic.extractDates(text),
      quotations: semantic.extractQuotations(text),
      namedEntities: semantic.extractNamedEntities(text)
    };
  }

  function enrichSemantic(result) {
    if (!result || typeof result !== "object") return result;
    var differences = Array.isArray(result.differences) ? result.differences : [];
    var errors = differences.filter(function (item) { return item && item.severity === "error"; }).length;
    var warnings = differences.filter(function (item) { return item && item.severity === "warning"; }).length;
    if (!Number.isFinite(result.criticalDifferenceCount)) result.criticalDifferenceCount = errors;
    if (!Number.isFinite(result.score)) {
      var lexical = result.checks && result.checks.lexicalSimilarity && result.checks.lexicalSimilarity.score;
      lexical = Number.isFinite(lexical) ? Math.max(0, Math.min(1, lexical)) : 0;
      var evidencePreservation = Math.max(0, 1 - errors * 0.25 - warnings * 0.06);
      result.score = Math.round((lexical * 0.65 + evidencePreservation * 0.35) * 100);
      result.scoreKind = "descriptive_semantic_integrity";
      result.calibrated = false;
      result.isProbability = false;
    }
    return result;
  }

  function normalizeVerification(result) {
    result.semanticIntegrity = enrichSemantic(result.semanticIntegrity);
    if (!result.stylisticSignals && result.style && result.style.rewrite) result.stylisticSignals = result.style.rewrite;
    if (result.voice && result.voice.result) result.voiceMatch = result.voice.result;
    return result;
  }

  function verify(original, rewrite, options) {
    types.validateText(original, "original");
    types.validateText(rewrite, "rewrite");
    options = Object.assign({}, options || {}, {
      styleAnalyzer: stylistic.analyzeStylisticSignals,
      voiceComparator: voiceCompare.compareVoice
    });
    return normalizeVerification(verifier.verifyRewrite(original, rewrite, options));
  }

  function resolveProfile(options) {
    if (options.voiceProfile) return options.voiceProfile;
    var samples = options.voiceSamples || options.voiceSample;
    return samples ? createVoiceProfile(samples) : null;
  }

  function resolveProvider(options) {
    if (options.provider && typeof options.provider.rewrite === "function") return options.provider;
    var name = typeof options.provider === "string" ? options.provider : (options.providerName || "anthropic");
    var config = Object.assign({}, options.providerOptions || {}, {
      apiKey: options.apiKey !== undefined ? options.apiKey : (options.providerOptions && options.providerOptions.apiKey),
      model: options.model || (options.providerOptions && options.providerOptions.model),
      fetch: options.fetch || (options.providerOptions && options.providerOptions.fetch),
      timeoutMs: options.timeoutMs || (options.providerOptions && options.providerOptions.timeoutMs)
    });
    return providers.createProvider(name, config);
  }

  function verificationFeedback(result) {
    var messages = [];
    var semanticResult = result.semanticIntegrity || {};
    (semanticResult.differences || []).slice(0, 12).forEach(function (difference) {
      messages.push((difference.type || "semantic") + ": " + (difference.message || difference.change || "review"));
    });
    var signals = result.stylisticSignals;
    if (signals && signals.findings) {
      signals.findings.inline.concat(signals.findings.document).filter(function (finding) { return finding.sev === 3; })
        .slice(0, 12).forEach(function (finding) { messages.push("style finding: " + finding.label); });
    }
    return messages.join("\n");
  }

  function strongFindingCount(signals) {
    if (!signals || !signals.findings) return 0;
    return signals.findings.inline.concat(signals.findings.document).filter(function (finding) { return finding.sev === 3; }).length;
  }

  function stripConventionalBoundaryWhitespace(text) {
    return text.replace(/^[\t\n\r ]+/, "").replace(/[\t\n\r ]+$/, "");
  }

  async function refineWithDetector(session, best, provider, wordCount, buildPrompt, check) {
    if (!session) return { best: best, report: null };
    return detectorRefinement.run({ session: session, initial: best,
      revise: async function (previous, feedback, pass) {
        var raw = await provider.rewrite(buildPrompt(previous, feedback), { wordCount: wordCount, pass: pass, phase: "detector_refinement" });
        if (typeof raw === "string") raw = { text: raw };
        if (!raw || typeof raw.text !== "string" || !raw.text.trim()) throw new Error("Provider returned an empty draft");
        var text = stripConventionalBoundaryWhitespace(raw.text);
        var incomplete = raw.incomplete === true || raw.truncated === true || raw.refused === true ||
          (typeof raw.completionStatus === "string" && raw.completionStatus !== "complete");
        return { text: text, verification: check(text), pass: previous.pass, phase: "detector_refinement", detectorPass: pass,
          provider: raw.provider || provider.name || "custom", model: raw.model || provider.model || null,
          incomplete: incomplete, truncated: incomplete, refused: raw.refused === true,
          completionStatus: incomplete ? "incomplete" : "complete", completionReason: providers.safeCompletionReason(raw.completionReason) };
      }
    });
  }

  async function detect(text, options) {
    types.validateText(text);
    options = options || {};
    if (!text.trim()) throw new TypeError("Detection requires non-empty text");
    var detector = options.detector && typeof options.detector.analyze === "function"
      ? options.detector : detectors.createDetector(options.detector || "gptzero", options);
    var observation = await detector.analyze(text);
    // This path validates the external contract; local estimates stay unavailable.
    return analyzer.analyze(text, { detectorObservations: [observation] });
  }

  async function generate(brief, options) {
    types.validateText(brief, "brief");
    if (!brief.trim()) throw new TypeError("brief must be non-empty");
    options = options || {};
    var profile = resolveProfile(options);
    if (!profile) throw new TypeError("Generation requires writing samples or a VoiceProfile");
    var voiceExcerpts = prompt.selectVoiceExcerpts(options.voiceSamples || options.voiceSample);
    // Validate before sending anything to the provider.
    compareVoice(brief, profile);
    var sourceFacts = options.sourceFacts === undefined ? "" : types.validateText(options.sourceFacts, "sourceFacts");
    var targetWords = options.targetWords === undefined ? 400 : options.targetWords;
    if (!Number.isInteger(targetWords) || targetWords < 50 || targetWords > 3000) {
      throw new RangeError("targetWords must be an integer from 50 to 3000");
    }
    var contentMode = options.contentMode === undefined ? "factual" : options.contentMode;
    if (contentMode !== "factual" && contentMode !== "fiction") throw new TypeError("contentMode must be factual or fiction");
    var maxVoicePasses = options.maxVoicePasses === undefined ? 1 : options.maxVoicePasses;
    if (!Number.isInteger(maxVoicePasses) || maxVoicePasses < 1 || maxVoicePasses > 3) throw new RangeError("maxVoicePasses must be an integer from 1 to 3");
    var detectorSession = detectorRefinement.createSession(options.detectorRefinement);
    var provider = resolveProvider(options);
    var candidates = [], best = null;
    for (var pass = 1; pass <= maxVoicePasses; pass++) {
      var providerResult = await provider.rewrite(prompt.buildGenerationPrompt(brief, {
        voiceProfile: profile, voiceExcerpts: voiceExcerpts, sourceFacts: sourceFacts, targetWords: targetWords, persona: options.persona,
        contentMode: contentMode, previousDraft: best && best.text,
        voiceComparison: best && best.verification.voiceMatch
      }), { wordCount: targetWords, pass: pass });
      if (typeof providerResult === "string") providerResult = { text: providerResult, truncated: false };
      if (!providerResult || typeof providerResult.text !== "string" || !providerResult.text.trim()) {
        throw new Error("Provider returned an empty draft");
      }
      var text = stripConventionalBoundaryWhitespace(providerResult.text);
      var refused = providerResult.refused === true;
      var incomplete = providerResult.incomplete === true || providerResult.truncated === true || refused ||
        (typeof providerResult.completionStatus === "string" && providerResult.completionStatus !== "complete");
      var checked = sourceFacts.trim() ? semantic.verifyGeneration(sourceFacts, text, { contentMode: contentMode }) : null;
      var analysis = analyzer.analyze(text, { voiceProfile: profile });
      var candidate = {
        text: text, pass: pass,
        completionStatus: incomplete ? "incomplete" : "complete", incomplete: incomplete,
        truncated: incomplete, refused: refused,
        completionReason: providers.safeCompletionReason(providerResult.completionReason),
        provider: providerResult.provider || provider.name || "custom",
        model: providerResult.model || provider.model || null,
        verification: {
          status: "review", accepted: false, requiresReview: true,
          semanticIntegrity: checked || types.unavailable("semantic_integrity", "No source facts were supplied; factual grounding was not verified."),
          voiceMatch: analysis.voiceMatch,
          stylisticSignals: analysis.stylisticSignals,
          documentIntegrity: analysis.provenance.documentIntegrity,
          limitations: ["A brief is not an original document. Review factual grounding, placeholders, audience and voice before using this draft; automated checks cannot verify every new claim."]
        }
      };
      candidates.push(candidate);
      var unchanged = best && best.text === candidate.text;
      best = rank.rankCandidates(candidates, { voiceProfile: profile }).best;
      if (incomplete || unchanged) break;
    }
    var refined = await refineWithDetector(detectorSession, best, provider, targetWords, function (previous, feedback) {
      return prompt.buildGenerationPrompt(brief, { voiceProfile: profile, voiceExcerpts: voiceExcerpts, sourceFacts: sourceFacts, targetWords: targetWords,
        contentMode: contentMode, persona: options.persona, previousDraft: previous.text,
        voiceComparison: previous.verification.voiceMatch, detectorFeedback: feedback });
    }, function (text) {
      var analysis = analyzer.analyze(text, { voiceProfile: profile });
      return { status: "review", accepted: false, requiresReview: true,
        semanticIntegrity: sourceFacts.trim() ? semantic.verifyGeneration(sourceFacts, text, { contentMode: contentMode }) : types.unavailable("semantic_integrity", "No source facts were supplied; factual grounding was not verified."),
        voiceMatch: analysis.voiceMatch, stylisticSignals: analysis.stylisticSignals, documentIntegrity: analysis.provenance.documentIntegrity };
    });
    best = refined.best;
    return Object.assign({}, best, {
      kind: "generation_result", schemaVersion: 1, contentMode: contentMode,
      status: "review_required", accepted: false, targetWords: targetWords,
      passCount: candidates.length + (refined.report ? refined.report.providerCalls : 0), selectedPass: best.detectorPass || best.pass,
      selectedPhase: best.phase || "voice",
      detectorRefinement: refined.report,
      candidates: rank.rankCandidates(candidates, { voiceProfile: profile }).candidates,
      voiceRefinement: { initialScore: candidates[0].verification.voiceMatch.score, selectedScore: best.verification.voiceMatch.score, maxPasses: maxVoicePasses }
    });
  }

  async function rewrite(text, options) {
    types.validateText(text);
    if (!text.trim()) throw new TypeError("text must be non-empty for rewrite");
    options = options || {};
    var profile = resolveProfile(options);
    var voiceExcerpts = prompt.selectVoiceExcerpts(options.voiceSamples || options.voiceSample);
    var before = analyzer.analyze(text, { voiceProfile: profile });
    var voiceTarget = options.voiceTargetScore === undefined ? 80 : options.voiceTargetScore;
    if (!Number.isFinite(voiceTarget) || voiceTarget < 0 || voiceTarget > 100) throw new RangeError("voiceTargetScore must be between 0 and 100");
    var detectorSession = detectorRefinement.createSession(options.detectorRefinement);
    var provider = resolveProvider(options);
    var requestedPasses = options.maxPasses === undefined ? 3 : options.maxPasses;
    if (!Number.isInteger(requestedPasses) || requestedPasses < 1 || requestedPasses > 3) throw new RangeError("maxPasses must be an integer from 1 to 3");
    var candidates = [];
    var current = null, stopReason = "budget_exhausted";
    var feedback = "";
    var constraints = semanticConstraints(text);
    for (var pass = 1; pass <= requestedPasses; pass++) {
      var rewritePrompt = prompt.buildRewritePrompt(text, {
        voiceProfile: profile,
        voiceExcerpts: voiceExcerpts,
        voiceComparison: current ? current.verification.voiceMatch : before.voiceMatch,
        previousDraft: current && current.ranking.eligible ? current.text : null,
        stylisticSignals: before.stylisticSignals,
        semanticConstraints: constraints,
        persona: options.persona || "",
        lengthTolerance: options.lengthTolerance === undefined ? 0.15 : options.lengthTolerance,
        feedback: feedback
      });
      var providerResult = await provider.rewrite(rewritePrompt, { wordCount: before.stylisticSignals.counts.words, pass: pass });
      if (typeof providerResult === "string") providerResult = { text: providerResult, truncated: false };
      if (!providerResult || typeof providerResult.text !== "string" || !providerResult.text.trim()) throw new Error("Provider returned an empty rewrite");
      var candidateText = stripConventionalBoundaryWhitespace(providerResult.text);
      var completionReason = providers.safeCompletionReason(providerResult.completionReason);
      var refused = providerResult.refused === true;
      var incomplete = providerResult.incomplete === true || providerResult.truncated === true || refused ||
        (typeof providerResult.completionStatus === "string" && providerResult.completionStatus !== "complete");
      var checked = verify(text, candidateText, { voiceProfile: profile });
      candidates.push({
        text: candidateText,
        verification: checked,
        provider: providerResult.provider || provider.name || "custom",
        model: providerResult.model || provider.model || null,
        truncated: incomplete,
        incomplete: incomplete,
        refused: refused,
        completionReason: completionReason,
        completionStatus: incomplete ? "incomplete" : "complete",
        pass: pass
      });
      var repeated = candidates.slice(0, -1).some(function (c) { return c.text === candidateText; });
      current = rank.rankCandidates(candidates, { voiceProfile: profile }).best;
      if (incomplete) { stopReason = "incomplete_output"; break; }
      var voiceReady = !profile || current.verification.voiceMatch.score >= voiceTarget;
      if (current.ranking.eligible && current.verification.semanticIntegrity.status === "pass" && strongFindingCount(current.verification.stylisticSignals) === 0 && voiceReady) {
        stopReason = profile ? "voice_target_met" : "semantic_and_style_checks_passed"; break;
      }
      if (repeated) { stopReason = "unchanged_candidate"; break; }
      feedback = verificationFeedback(checked);
    }
    var ranking = rank.rankCandidates(candidates, { voiceProfile: profile });
    var best = ranking.best;
    var refined = await refineWithDetector(detectorSession, best, provider, before.stylisticSignals.counts.words, function (previous, feedback) {
      return prompt.buildRewritePrompt(text, { voiceProfile: profile, voiceExcerpts: voiceExcerpts, voiceComparison: previous.verification.voiceMatch,
        stylisticSignals: previous.verification.stylisticSignals, semanticConstraints: constraints, persona: options.persona,
        feedback: "Revise this previous candidate while preserving the original: " + previous.text, detectorFeedback: feedback });
    }, function (candidate) { return verify(text, candidate, { voiceProfile: profile }); });
    best = refined.best;
    best.ranking = rank.rankCandidates([best], { voiceProfile: profile }).best.ranking;
    var voiceMet = !profile || best.verification.voiceMatch.score >= voiceTarget;
    var complete = best.ranking.eligible && !best.truncated && best.verification.status === "pass" && best.verification.semanticIntegrity.status === "pass" && voiceMet;
    return {
      kind: "rewrite_result",
      status: complete ? "complete" : "review_required",
      accepted: complete,
      text: best.text,
      originalAnalysis: before,
      verification: best.verification,
      ranking: best.ranking,
      candidates: ranking.candidates,
      passCount: candidates.length + (refined.report ? refined.report.providerCalls : 0),
      voiceRefinement: { initialScore: profile ? before.voiceMatch.score : null,
        selectedScore: profile ? best.verification.voiceMatch.score : null,
        targetScore: profile ? voiceTarget : null, targetMet: profile ? voiceMet : null,
        status: !profile ? "not_requested" : voiceMet ? "target_met" : "target_not_met",
        stopReason: stopReason, maxPasses: requestedPasses,
        limitation: "Operational refinement target, not a calibrated measure of authentic authorship or writing quality." },
      detectorRefinement: refined.report,
      provider: best.provider,
      model: best.model,
      truncated: best.truncated,
      incomplete: best.incomplete,
      refused: best.refused,
      completionReason: best.completionReason,
      completionStatus: best.completionStatus
    };
  }

  var api = {
    version: "2.0.0",
    analyze: analyzer.analyze,
    scan: analyzer.analyze,
    createVoiceProfile: createVoiceProfile,
    compareVoice: compareVoice,
    rewrite: rewrite,
    generate: generate,
    detect: detect,
    verify: verify,
    verifyGeneration: semantic.verifyGeneration,
    checkProvenance: provenance.checkProvenance,
    semanticConstraints: semanticConstraints,
    schemas: { analysisResult: types.ANALYSIS_RESULT_SCHEMA }
  };
  return api;
});
