/* Provider-neutral rewrite prompt construction. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SapienizeRewritePrompt = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function findingLabels(signals) {
    if (!signals) return [];
    var findings = signals.findings || {};
    var inline = findings.inline || signals.inline || [];
    var documentFindings = findings.document || signals.global || [];
    var seen = {};
    return inline.concat(documentFindings).map(function (finding) { return finding && finding.label; })
      .filter(function (label) {
        if (!label || seen[label]) return false;
        seen[label] = true;
        return true;
      });
  }

  function compactProfile(profile) {
    if (!profile) return null;
    return {
      schemaVersion: profile.schemaVersion || profile.version,
      sample: profile.sample || profile.sampleStats || profile.summary,
      quality: profile.quality,
      warnings: profile.warnings,
      features: profile.features || profile.characteristics || profile.metrics
    };
  }

  function buildRewritePrompt(original, options) {
    if (typeof original !== "string" || !original.trim()) throw new TypeError("original text must be a non-empty string");
    options = options || {};
    var profile = compactProfile(options.voiceProfile);
    var labels = findingLabels(options.stylisticSignals);
    var constraints = options.semanticConstraints || {};
    var lines = [
      "You are a careful line editor restoring the author's voice.",
      "Priorities, in order:",
      "1. Preserve meaning, facts, claims, numbers, names, dates, URLs, and quotations.",
      "2. Match the supplied VoiceProfile when one is present.",
      "3. Reduce generic or model-associated stylistic patterns only when doing so does not conflict with priorities 1 or 2.",
      "Do not add claims, examples, credentials, anecdotes, or opinions.",
      "Do not optimize for an AI detector, detector score, watermark, or provenance signal.",
      "Keep quotations exact. Return only the rewritten text."
    ];
    if (Number.isFinite(options.lengthTolerance)) {
      lines.push("Keep length within " + Math.round(options.lengthTolerance * 100) + "% of the original unless fidelity requires otherwise.");
    }
    if (labels.length) lines.push("Review these configured stylistic findings in context: " + labels.join("; ") + ".");
    if (profile) {
      lines.push("The VoiceProfile is descriptive, not a list of generic writing rules. Preserve punctuation, contractions, sentence lengths, spelling, and register when the profile shows they are authentic habits.");
      lines.push("<voice_profile>\n" + JSON.stringify(profile) + "\n</voice_profile>");
    }
    if (options.persona) {
      lines.push("Use this requested persona only for register and diction. The VoiceProfile wins on conflict, and the persona must never create biography or facts.");
      lines.push("<persona>\n" + String(options.persona).trim() + "\n</persona>");
    }
    if (Object.keys(constraints).length) lines.push("<semantic_constraints>\n" + JSON.stringify(constraints) + "\n</semantic_constraints>");
    if (options.feedback) lines.push("A previous candidate had these verification issues; correct them without changing protected content:\n" + String(options.feedback));
    lines.push("<original>\n" + original + "\n</original>");
    return lines.join("\n");
  }

  return {
    buildRewritePrompt: buildRewritePrompt,
    findingLabels: findingLabels,
    compactProfile: compactProfile
  };
});
