/* Structured stylistic-signal layer over the backward-compatible v1 engine. */
(function (root, factory) {
  var api = typeof module === "object" && module.exports
    ? factory(require("../engine.js"), require("./scoring.js"))
    : factory(root.SapienizeEngine, root.SapienizeScoring);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SapienizeStylisticSignals = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (engine, scoring) {
  "use strict";

  if (!engine || typeof engine.analyzeText !== "function") throw new Error("Sapienize engine dependency is unavailable");

  function analyzeStylisticSignals(text) {
    if (typeof text !== "string") throw new TypeError("text must be a string");
    var legacy = engine.analyzeText(text);
    var documentFindings = legacy.global.filter(function (finding) { return finding.cat !== "document_integrity"; });
    var heuristic = scoring.scoreStyleSignals({ words: legacy.words, inline: legacy.inline, global: documentFindings });
    return {
      kind: "stylistic_signals",
      version: "2.0.0",
      text: legacy.text,
      counts: {
        words: legacy.words,
        sentences: legacy.sentences
      },
      metrics: {
        meanSentenceLength: legacy.meanLen,
        sentenceLengthBurstiness: legacy.burstiness,
        emDashCount: legacy.emDashes,
        emDashesPerThousandWords: legacy.emDashRate,
        contractionRatio: legacy.contractionRatio
      },
      findings: {
        inline: legacy.inline,
        document: documentFindings
      },
      heuristicStyleScore: heuristic,
      limitations: [
        "Configured patterns are explainability signals, not proof of AI generation.",
        "The style heuristic is uncalibrated and is not an authorship probability.",
        "A genuine voice profile may make a flagged habit appropriate for its author."
      ],
      legacy: legacy
    };
  }

  return {
    analyzeStylisticSignals: analyzeStylisticSignals,
    tellLibrary: engine.SAPIENIZE_TELLS
  };
});
