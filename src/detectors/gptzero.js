/* GPTZero's documented v2 text endpoint. No local accuracy/calibration claim. */
(function (root, factory) {
  var api = typeof module === "object" && module.exports
    ? factory(require("./adapter.js"), require("../providers/base.js"))
    : factory(root.SapienizeDetectorAdapter, root.SapienizeProviderBase);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SapienizeGPTZero = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (contract, http) {
  "use strict";
  var ENDPOINT = "https://api.gptzero.me/v2/predict/text";

  function normalizeResponse(raw) {
    if (!contract.isJsonSafeValue(raw) || !raw || !Array.isArray(raw.documents) || raw.documents.length !== 1) {
      throw new Error("GPTZero returned malformed response data");
    }
    var document = raw.documents[0];
    var probabilities = document && document.class_probabilities;
    var classes = ["human", "ai", "mixed"];
    if (!probabilities || classes.some(function (key) {
      return !Number.isFinite(probabilities[key]) || probabilities[key] < 0 || probabilities[key] > 1;
    }) || Math.abs(probabilities.human + probabilities.ai + probabilities.mixed - 1) > 0.01 ||
        classes.indexOf(document.predicted_class) === -1) {
      throw new Error("GPTZero returned missing or invalid class probabilities");
    }
    return {
      predictedClass: document.predicted_class,
      classProbabilities: { human: probabilities.human, ai: probabilities.ai, mixed: probabilities.mixed },
      aiScore: probabilities.ai,
      predictedAi: document.predicted_class === "mixed" ? null : document.predicted_class === "ai",
      scoreScale: { min: 0, max: 1, higherMeans: "greater GPTZero AI-only class probability" },
      semantics: "GPTZero AI-only class probability, not the proportion of AI-written words. Human, AI-only and mixed probabilities are retained separately; mixed verdicts abstain from binary classification.",
      confidenceCategory: ["low", "medium", "high"].indexOf(document.confidence_category) !== -1
        ? document.confidence_category : "unknown"
    };
  }

  function createGPTZeroDetector(options) {
    options = options || {};
    // Endpoint is intentionally fixed; credentials cannot be redirected by a caller URL.
    var transport = new http.ProviderAdapter({
      name: "gptzero", apiKey: options.apiKey, fetch: options.fetch, timeoutMs: options.timeoutMs
    });
    return {
      name: "gptzero",
      async analyze(text) {
        if (typeof text !== "string" || !text.trim()) throw new TypeError("Detection requires non-empty text");
        if (text.length > 150000) throw new RangeError("GPTZero text exceeds the 150,000-character API limit; text was not truncated or sent");
        if (typeof transport.apiKey !== "string" || !transport.apiKey.trim()) {
          var missing = new Error("GPTZero requires an API key");
          missing.code = "MISSING_API_KEY";
          throw missing;
        }
        var raw = await http.requestJson(transport, ENDPOINT, {
          method: "POST", redirect: "error", credentials: "omit",
          headers: { "Content-Type": "application/json", "x-api-key": transport.apiKey },
          body: JSON.stringify({ document: text })
        });
        var normalized = normalizeResponse(raw);
        // Successful responses are retained for diagnostics, but never retain an echoed key.
        if (JSON.stringify(raw).indexOf(transport.apiKey) !== -1) {
          throw new Error("GPTZero returned an unsafe response; result discarded");
        }
        return contract.createDetectorObservation({
          name: "GPTZero", version: typeof raw.version === "string" && raw.version.trim() ? raw.version : "unknown",
          date: typeof options.clock === "function" ? options.clock() : new Date(),
          raw: raw, normalized: normalized, calibrated: false,
          limitations: [
            "Vendor-reported probabilities; Sapienize has not independently evaluated their calibration or accuracy.",
            "A score is not proof of authorship and does not predict another institution's detector result.",
            "Mixed-class confidence is separate from AI-only confidence; probabilities do not measure the percentage of generated words.",
            "Detection can be less reliable for short, edited, or out-of-domain text. Raw responses may contain submitted text."
          ]
        });
      }
    };
  }
  return { createGPTZeroDetector: createGPTZeroDetector, normalizeResponse: normalizeResponse };
});
