/* Documented multi-objective candidate ranking: fidelity, then voice, then style. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SapienizeRewriteRank = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function numberAt(object, paths, fallback) {
    for (var i = 0; i < paths.length; i++) {
      var value = object;
      var path = paths[i];
      for (var j = 0; value != null && j < path.length; j++) value = value[path[j]];
      if (Number.isFinite(value)) return value;
    }
    return fallback;
  }

  function clamp100(value) { return Math.max(0, Math.min(100, value)); }

  function semanticScore(verification) {
    return clamp100(numberAt(verification || {}, [
      ["semanticIntegrity", "score"],
      ["semanticIntegrity", "overallScore"],
      ["semanticIntegrity", "semanticSimilarity"],
      ["semantic", "score"]
    ], 0));
  }

  function voiceScore(verification) {
    return clamp100(numberAt(verification || {}, [
      ["voiceMatch", "score"],
      ["voiceMatch", "similarity"],
      ["voiceMatch", "aggregateSimilarity"],
      ["voice", "score"]
    ], 0));
  }

  function styleScore(verification) {
    return clamp100(numberAt(verification || {}, [
      ["stylisticSignals", "heuristicStyleScore", "value"],
      ["stylisticSignals", "legacy", "score"],
      ["style", "score"],
      ["analysis", "score"]
    ], 0));
  }

  function hasCriticalDifference(semantic) {
    if (!semantic) return true;
    if (semantic.status === "fail" || semantic.status === "failed") return true;
    if (Number.isFinite(semantic.criticalDifferenceCount)) return semantic.criticalDifferenceCount > 0;
    var differences = semantic.differences;
    if (Array.isArray(differences)) return differences.some(function (item) { return item && (item.severity === "critical" || item.critical === true); });
    if (differences && typeof differences === "object") {
      return ["numbers", "urls", "dates", "quotations", "namedEntities"].some(function (key) {
        var value = differences[key];
        return Array.isArray(value) ? value.length > 0 : Boolean(value && (value.added || value.removed));
      });
    }
    return false;
  }

  function semanticStatusPriority(semantic) {
    if (!semantic) return 0;
    if (semantic.status === "pass") return 3;
    if (semantic.status === "review") return 2;
    if (semantic.status === "insufficient") return 1;
    return 0;
  }

  function providerExclusionReason(candidate) {
    if (candidate.refused === true || candidate.completionReason === "refusal") return "provider_output_refused";
    if (candidate.incomplete === true) {
      return candidate.completionReason === "length" || candidate.completionReason === "max_tokens"
        ? "provider_output_truncated"
        : "provider_output_incomplete";
    }
    if (candidate.truncated === true) return "provider_output_truncated";
    return null;
  }

  function rankCandidates(candidates, options) {
    if (!Array.isArray(candidates) || candidates.length === 0) throw new TypeError("candidates must be a non-empty array");
    options = options || {};
    var hasVoice = Boolean(options.voiceProfile);
    var priorities = hasVoice
      ? ["semanticStatus", "semanticIntegrity", "voiceSimilarity", "styleHeuristic"]
      : ["semanticStatus", "semanticIntegrity", "styleHeuristic"];
    var ranked = candidates.map(function (candidate, index) {
      var verification = candidate.verification || {};
      var semantic = verification.semanticIntegrity || verification.semantic;
      var semanticValue = semanticScore(verification);
      var voiceValue = hasVoice ? voiceScore(verification) : 0;
      var styleValue = styleScore(verification);
      var providerReason = providerExclusionReason(candidate);
      var eligible = !hasCriticalDifference(semantic) && !providerReason;
      var statusPriority = semanticStatusPriority(semantic);
      return Object.assign({}, candidate, {
        ranking: {
          eligible: eligible,
          exclusionReason: providerReason || (!eligible ? "critical_semantic_difference" : null),
          score: semanticValue,
          method: "lexicographic",
          priorities: priorities.slice(),
          components: { semanticStatus: semantic && semantic.status || "missing", semanticIntegrity: semanticValue, voiceSimilarity: voiceValue, styleHeuristic: styleValue },
          policy: "protected-content changes and incomplete provider output gate eligibility; semantic status and integrity rank first, then voice similarity, then style; detector/provenance scores are excluded"
        },
        _inputIndex: index
      });
    });
    ranked.sort(function (a, b) {
      return Number(b.ranking.eligible) - Number(a.ranking.eligible) ||
        semanticStatusPriority(b.verification && (b.verification.semanticIntegrity || b.verification.semantic)) - semanticStatusPriority(a.verification && (a.verification.semanticIntegrity || a.verification.semantic)) ||
        b.ranking.components.semanticIntegrity - a.ranking.components.semanticIntegrity ||
        b.ranking.components.voiceSimilarity - a.ranking.components.voiceSimilarity ||
        b.ranking.components.styleHeuristic - a.ranking.components.styleHeuristic ||
        a._inputIndex - b._inputIndex;
    });
    ranked.forEach(function (candidate) { delete candidate._inputIndex; });
    return { best: ranked[0], candidates: ranked, priorities: priorities };
  }

  return {
    rankCandidates: rankCandidates,
    hasCriticalDifference: hasCriticalDifference,
    providerExclusionReason: providerExclusionReason,
    semanticStatusPriority: semanticStatusPriority
  };
});
