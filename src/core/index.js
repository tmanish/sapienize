/* Public provider-neutral Sapienize v2 API. */
(function (root, factory) {
  var api = typeof module === "object" && module.exports
    ? factory(
        require("./types.js"), require("./analyze.js"),
        require("../analysis/stylistic-signals.js"),
        require("../voice/profile.js"), require("../voice/compare.js"),
        require("../rewrite/semantic.js"), require("../rewrite/verify.js"),
        require("../rewrite/prompt.js"), require("../rewrite/rank.js"),
        require("../providers/index.js"), require("../provenance/index.js")
      )
    : factory(
        root.SapienizeTypes, root.SapienizeAnalyze, root.SapienizeStylisticSignals,
        root.SapienizeVoiceProfile, root.SapienizeVoiceCompare,
        root.SapienizeSemantic, root.SapienizeVerify,
        root.SapienizeRewritePrompt, root.SapienizeRewriteRank,
        root.SapienizeProviders, root.SapienizeProvenance
      );
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.SapienizeCore = api;
    root.sapienize = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (types, analyzer, stylistic, voiceProfile, voiceCompare, semantic, verifier, prompt, rank, providers, provenance) {
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

  async function rewrite(text, options) {
    types.validateText(text);
    if (!text.trim()) throw new TypeError("text must be non-empty for rewrite");
    options = options || {};
    var profile = resolveProfile(options);
    var before = analyzer.analyze(text, { voiceProfile: profile });
    var provider = resolveProvider(options);
    var requestedPasses = options.maxPasses === undefined ? 3 : options.maxPasses;
    if (!Number.isInteger(requestedPasses) || requestedPasses < 1 || requestedPasses > 3) throw new RangeError("maxPasses must be an integer from 1 to 3");
    var candidates = [];
    var feedback = "";
    var constraints = semanticConstraints(text);
    for (var pass = 1; pass <= requestedPasses; pass++) {
      var rewritePrompt = prompt.buildRewritePrompt(text, {
        voiceProfile: profile,
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
      var current = rank.rankCandidates(candidates, { voiceProfile: profile }).best;
      if (incomplete) break;
      if (current.ranking.eligible && current.verification.semanticIntegrity.status === "pass" && strongFindingCount(current.verification.stylisticSignals) === 0) break;
      feedback = verificationFeedback(checked);
    }
    var ranking = rank.rankCandidates(candidates, { voiceProfile: profile });
    var best = ranking.best;
    var complete = best.ranking.eligible && !best.truncated && best.verification.status === "pass" && best.verification.semanticIntegrity.status === "pass";
    return {
      kind: "rewrite_result",
      status: complete ? "complete" : "review_required",
      accepted: complete,
      text: best.text,
      originalAnalysis: before,
      verification: best.verification,
      ranking: best.ranking,
      candidates: ranking.candidates,
      passCount: candidates.length,
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
    verify: verify,
    checkProvenance: provenance.checkProvenance,
    semanticConstraints: semanticConstraints,
    schemas: { analysisResult: types.ANALYSIS_RESULT_SCHEMA }
  };
  return api;
});
