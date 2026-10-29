/* Explicit, bounded vendor-score experiment. Default writing never enters here. */
(function (root, factory) {
  var api = typeof module === "object" && module.exports
    ? factory(require("../detectors/index.js"), require("../core/analyze.js"), require("./rank.js"))
    : factory(root.SapienizeDetectors, root.SapienizeAnalyze, root.SapienizeRewriteRank);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SapienizeDetectorRefinement = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (detectors, analyzer, rank) {
  "use strict";
  function createSession(config) {
    if (config === undefined || config === null || config === false) return null;
    if (!config || typeof config !== "object" || Array.isArray(config)) throw new TypeError("detectorRefinement must be a configuration object");
    var passes = config.maxPasses === undefined ? 2 : config.maxPasses;
    if (!Number.isInteger(passes) || passes < 1 || passes > 3) throw new RangeError("detectorRefinement.maxPasses must be 1 to 3 (including the initial measurement)");
    if (config.detector !== undefined && config.detector !== "gptzero") throw new TypeError("Detector refinement currently supports only GPTZero's three-class contract");
    if (typeof config.apiKey !== "string" || !config.apiKey.trim()) throw new TypeError("Detector refinement requires a configured GPTZero API key");
    return { detector: detectors.createDetector("gptzero", config), maxPasses: passes };
  }
  function semanticPriority(candidate) {
    var s = candidate.verification.semanticIntegrity.status;
    return s === "pass" ? 3 : s === "review" ? 2 : s === "not_applicable" ? 1 : 0;
  }
  function voice(candidate) {
    var v = candidate.verification.voiceMatch;
    return v && Number.isFinite(v.score) ? v.score : null;
  }
  function eligible(candidate, initial) {
    var s = candidate.verification.semanticIntegrity;
    var original = initial.verification.semanticIntegrity;
    return !rank.providerExclusionReason(candidate) && !rank.hasCriticalDifference(s) &&
      (!candidate.verification.documentIntegrity || candidate.verification.documentIntegrity.status !== "review") &&
      semanticPriority(candidate) >= semanticPriority(initial) &&
      (!Number.isFinite(original.score) || (Number.isFinite(s.score) && s.score >= original.score)) &&
      (voice(initial) === null || (voice(candidate) !== null && voice(candidate) >= voice(initial) - 3));
  }
  async function run(options) {
    var initial = options.initial, best = initial;
    var observations = [], candidates = [], bestObservation = null;
    var result = { status: "unavailable", objective: "maximize_gptzero_human_class_probability", voiceTolerance: 3,
      maxPasses: options.session.maxPasses, providerCalls: 0, detectorCalls: 0, observations: observations, candidates: candidates,
      limitations: ["Experimental vendor-specific refinement, not proof of human authorship or a guarantee against institutional detectors.", "Human, AI-only and mixed are distinct vendor classes. Comparisons require the same known detector version.", "Only candidates preserving semantic checks and staying within 3 voice-similarity points of the initial draft are considered."] };
    if (!eligible(initial, initial)) {
      result.status = "blocked_by_verification";
      return { best: best, report: result };
    }
    async function observe(candidate) {
      result.detectorCalls++;
      var observation = await options.session.detector.analyze(candidate.text);
      analyzer.analyze(candidate.text, { detectorObservations: [observation] });
      var p = observation.normalized && observation.normalized.classProbabilities;
      if (!p || !Number.isFinite(p.human) || !Number.isFinite(p.ai) || !Number.isFinite(p.mixed)) throw new Error("Unsupported class probabilities");
      observations.push({ candidate: candidates.length, observation: observation });
      return observation;
    }
    try {
      bestObservation = await observe(initial);
      result.before = bestObservation;
      result.after = bestObservation;
      if (!bestObservation.detector.version || bestObservation.detector.version === "unknown") {
        result.status = "unknown_detector_version";
        return { best: initial, report: result };
      }
      for (var pass = 1; pass < options.session.maxPasses; pass++) {
        // Only the normalized class summary enters the prompt, never raw output,
        // credentials, document provenance or untrusted vendor response text.
        var feedback = {
          detector: bestObservation.detector.name, version: bestObservation.detector.version,
          classProbabilities: bestObservation.normalized.classProbabilities
        };
        result.providerCalls++;
        var candidate = await options.revise(best, feedback, pass);
        var entry = { text: candidate.text, verification: candidate.verification, eligible: eligible(candidate, initial), selected: false };
        candidates.push(entry);
        if (!entry.eligible || candidate.text === best.text) continue;
        var observation = await observe(candidate);
        entry.observation = observation;
        if (observation.detector.version !== bestObservation.detector.version || observation.detector.name !== bestObservation.detector.name) {
          result.status = "detector_version_changed";
          break;
        }
        if (observation.normalized.classProbabilities.human > bestObservation.normalized.classProbabilities.human) {
          best = candidate;
          bestObservation = observation;
          result.after = observation;
        }
      }
      candidates.forEach(function (c) { c.selected = c.text === best.text; });
      if (result.status === "unavailable") result.status = best === initial ? "no_improvement" : "improved_vendor_score";
    } catch (_) {
      // Optional measurement failures never destroy the usable original draft.
      result.status = "unavailable";
      result.reason = "The optional detector experiment could not complete. No unmeasured candidate was selected.";
    }
    return { best: best, report: result };
  }
  return { createSession: createSession, run: run };
});
