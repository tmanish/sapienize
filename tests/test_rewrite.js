"use strict";
const assert = require("assert");
const { buildRewritePrompt } = require("../src/rewrite/prompt.js");
const { rankCandidates } = require("../src/rewrite/rank.js");

const original = "Acme shipped 12 units on 4 July 2026. See https://example.com/report.";
const profile = {
  schemaVersion: "1.0.0",
  features: { punctuation: { emDashesPerThousandWords: 8 }, contractions: { ratio: 0.7 }, spellingConvention: "British" }
};
const prompt = buildRewritePrompt(original, {
  voiceProfile: profile,
  stylisticSignals: { findings: { inline: [{ label: "generic transition" }], document: [] } },
  semanticConstraints: { numbers: ["12"], urls: ["https://example.com/report"] }
});
assert.ok(prompt.includes("<voice_profile>"));
assert.ok(prompt.includes("generic transition"));
assert.ok(prompt.includes("https://example.com/report"));
assert.ok(!/zero em dash/i.test(prompt), "prompt must not contradict an authentic punctuation habit");
assert.ok(!prompt.includes("<persona>"), "persona is omitted unless explicitly requested");
assert.ok(buildRewritePrompt(original, { persona: "Solicitor, UK" }).includes("<persona>"));
assert.throws(() => buildRewritePrompt("", {}), /non-empty/);

const candidates = [
  {
    text: "Fact changed but stylistically clean.",
    verification: {
      semanticIntegrity: { status: "fail", score: 70, criticalDifferenceCount: 1 },
      voiceMatch: { score: 99 },
      stylisticSignals: { heuristicStyleScore: { value: 100 } }
    }
  },
  {
    text: "Facts intact in the author's voice.",
    verification: {
      semanticIntegrity: { status: "pass", score: 96, criticalDifferenceCount: 0 },
      voiceMatch: { score: 85 },
      stylisticSignals: { heuristicStyleScore: { value: 72 } }
    }
  }
];
const ranked = rankCandidates(candidates, { voiceProfile: profile });
assert.strictEqual(ranked.best.text, candidates[1].text, "semantic gate beats a cleaner but fact-changing candidate");
assert.deepStrictEqual(ranked.best.ranking.priorities, ["semanticStatus", "semanticIntegrity", "voiceSimilarity", "styleHeuristic"]);
assert.ok(/detector\/provenance scores are excluded/.test(ranked.best.ranking.policy));

const semanticPriority = rankCandidates([
  { text: "lower fidelity, stronger style", verification: { semanticIntegrity: { status: "review", score: 70, criticalDifferenceCount: 0 }, voiceMatch: { score: 100 }, stylisticSignals: { heuristicStyleScore: { value: 100 } } } },
  { text: "higher fidelity", verification: { semanticIntegrity: { status: "pass", score: 90, criticalDifferenceCount: 0 }, voiceMatch: { score: 10 }, stylisticSignals: { heuristicStyleScore: { value: 10 } } } }
], { voiceProfile: profile });
assert.strictEqual(semanticPriority.best.text, "higher fidelity", "voice and style cannot outweigh semantic status or integrity");

const truncationPriority = rankCandidates([
  { text: "complete", truncated: false, verification: { semanticIntegrity: { status: "pass", score: 90, criticalDifferenceCount: 0 } } },
  { text: "cut off", truncated: true, verification: { semanticIntegrity: { status: "pass", score: 100, criticalDifferenceCount: 0 } } }
]);
assert.strictEqual(truncationPriority.best.text, "complete", "truncated output is never eligible over a complete candidate");
console.log("PASS: voice-aware prompt and semantic-first candidate ranking");
