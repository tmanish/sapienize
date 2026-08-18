/* Provider-neutral structured analysis. */
(function (root, factory) {
  var api = typeof module === "object" && module.exports
    ? factory(
        require("./types.js"),
        require("../analysis/stylistic-signals.js"),
        require("../analysis/detector-estimate.js"),
        require("../voice/profile.js"),
        require("../voice/compare.js"),
        require("../provenance/index.js")
      )
    : factory(
        root.SapienizeTypes,
        root.SapienizeStylisticSignals,
        root.SapienizeDetectorEstimate,
        root.SapienizeVoiceProfile,
        root.SapienizeVoiceCompare,
        root.SapienizeProvenance
      );
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SapienizeAnalyze = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (types, stylistic, detector, voiceProfile, voiceCompare, provenance) {
  "use strict";

  function analyze(text, options) {
    types.validateText(text);
    options = options || {};
    var profile = options.voiceProfile || null;
    if (!profile && options.voiceSamples) profile = voiceProfile.createVoiceProfile(options.voiceSamples);
    var stylisticSignals = stylistic.analyzeStylisticSignals(text);
    var provenanceResult = provenance.checkProvenance(text, options.provenance || {});
    if (provenanceResult && typeof provenanceResult.then === "function") {
      throw new TypeError("analyze() is synchronous and cannot await an asynchronous provenance verifier; call checkProvenance() separately and await it");
    }
    var result = {
      schemaVersion: types.RESULT_SCHEMA_VERSION,
      stylisticSignals: stylisticSignals,
      detectorEstimate: options.detectorObservations
        ? detector.detectorEstimateFromObservations(options.detectorObservations)
        : detector.unavailableDetectorEstimate(),
      voiceMatch: profile
        ? voiceCompare.compareVoice(text, profile)
        : types.unavailable("voice_match", "No VoiceProfile was supplied."),
      semanticIntegrity: types.unavailable("semantic_integrity", "Semantic integrity requires an original and a candidate text."),
      provenance: provenanceResult
    };
    var validation = types.validateAnalysisResult(result);
    if (!validation.valid) throw new Error("Invalid analysis result: " + validation.errors.join("; "));
    return result;
  }

  return { analyze: analyze };
});
