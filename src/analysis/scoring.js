/* Sapienize v2 style-heuristic scoring. This is not an authorship probability. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SapienizeScoring = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function assertSignalInput(input) {
    if (!input || typeof input !== "object") throw new TypeError("style signal input must be an object");
    if (!Number.isFinite(input.words) || input.words < 0) throw new TypeError("words must be a non-negative number");
    if (!Array.isArray(input.inline) || !Array.isArray(input.global)) throw new TypeError("inline and global must be arrays");
  }

  function classify(value) {
    if (value >= 82) {
      return {
        band: "Few configured style signals",
        note: "This text triggers few of Sapienize's configured stylistic patterns."
      };
    }
    if (value >= 62) {
      return {
        band: "Some configured style signals",
        note: "A small number of configured stylistic patterns are present."
      };
    }
    if (value >= 40) {
      return {
        band: "Many configured style signals",
        note: "Several configured patterns are present; review the findings in context."
      };
    }
    return {
      band: "Dense configured style signals",
      note: "Configured patterns are dense in this sample. This does not establish who or what wrote it."
    };
  }

  function scoreStyleSignals(input) {
    assertSignalInput(input);
    var inlinePenalty = input.inline.reduce(function (sum, finding) {
      return sum + (Number(finding && finding.sev) || 0) * 1.4;
    }, 0);
    if (input.words > 0) inlinePenalty *= Math.min(1, 400 / Math.max(input.words, 120));
    var globalPenalty = input.global.reduce(function (sum, finding) {
      return sum + (Number(finding && finding.sev) || 0) * 4;
    }, 0);
    var value = Math.max(4, Math.min(100, Math.round(100 - inlinePenalty - globalPenalty)));
    var classification = classify(value);
    return {
      value: value,
      scale: { min: 0, max: 100 },
      kind: "uncalibrated_style_heuristic",
      label: "Style heuristic",
      higherMeans: "fewer configured stylistic signals",
      calibrated: false,
      isProbability: false,
      band: classification.band,
      note: classification.note
    };
  }

  return {
    scoreStyleSignals: scoreStyleSignals,
    classifyStyleHeuristic: classify
  };
});
