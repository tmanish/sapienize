"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const semantic = require("../src/rewrite/semantic.js");
const verifier = require("../src/rewrite/verify.js");
const watermark = require("../src/provenance/anthropic-watermark.js");
const provenance = require("../src/provenance/index.js");

let passes = 0;
function test(name, fn) {
  try {
    fn();
    console.log("PASS:", name);
    passes++;
  } catch (error) {
    console.error("FAIL:", name);
    throw error;
  }
}

test("identical text passes with an explicitly descriptive score", () => {
  const result = semantic.verifySemanticIntegrity("A careful claim with enough words.", "A careful claim with enough words.");
  assert.strictEqual(result.status, "pass");
  assert.strictEqual(result.score, 100);
  assert.strictEqual(result.preservation, 1);
  assert.strictEqual(result.criticalDifferenceCount, 0);
  assert.strictEqual(result.scoreScale.calibrated, false);
  assert.match(result.scoreInterpretation, /not a probability/i);
});

test("reordering preserves numbers, URLs, dates, quotations, and named entities", () => {
  const original = "On August 17, 2026, Acme Labs enrolled 120 patients. The protocol is at https://example.org/trial. Dr. Rivera said, “The trial met its goal.”";
  const rewrite = "Acme Labs enrolled 120 patients on August 17, 2026. See the protocol at https://example.org/trial. “The trial met its goal.” That was Dr. Rivera's assessment.";
  const result = semantic.verifySemanticIntegrity(original, rewrite);
  assert.strictEqual(result.status, "pass", JSON.stringify(result.differences));
  ["numbers", "urls", "dates", "quotations", "named_entities"].forEach(name => assert.strictEqual(result.checks[name].status, "match", name));
});

test("material fact changes produce typed critical differences", () => {
  const original = "On August 17, 2026, Acme Labs enrolled 120 patients. Read https://example.org/trial. Dr. Rivera said, “The trial met its goal.”";
  const rewrite = "On August 18, 2026, Beta Works enrolled 125 patients. Read https://example.org/other. Dr. Rivera said, “The trial missed its goal.”";
  const result = semantic.verifySemanticIntegrity(original, rewrite);
  const types = new Set(result.differences.map(item => item.type));
  assert.strictEqual(result.status, "fail");
  ["number", "url", "date", "quotation", "named_entity"].forEach(type => assert(types.has(type), type));
  assert(result.criticalDifferenceCount >= 5);
  assert.strictEqual(result.accepted, false);
});

test("numeric identifiers, units, number words, and month-day dates stay protected", () => {
  const changedPairs = [
    ["The schema version is v2 and remains stable for all clients.", "The schema version is v3 and remains stable for all clients."],
    ["The package weighs 10kg and ships in the standard box.", "The package weighs 20kg and ships in the standard box."],
    ["The engine is an X100 model used in every current unit.", "The engine is an X200 model used in every current unit."],
    ["The release target is Node20 for all supported deployments.", "The release target is Node22 for all supported deployments."],
    ["The team shipped twelve units to the customer on schedule.", "The team shipped thirteen units to the customer on schedule."],
    ["The trial enrolled one hundred patients in the first cohort.", "The trial enrolled two hundred patients in the first cohort."],
    ["The first cohort completed the scheduled review and published the final report on time.", "The second cohort completed the scheduled review and published the final report on time."],
    ["The team completed a single review before publishing the final report.", "The team completed a double review before publishing the final report."],
    ["The meeting is scheduled for July 4 at the main office.", "The meeting is scheduled for August 4 at the main office."]
  ];
  changedPairs.forEach(([original, rewrite]) => {
    const result = semantic.verifySemanticIntegrity(original, rewrite);
    assert.strictEqual(result.status, "fail", JSON.stringify({ original, differences: result.differences }));
  });

  const equivalent = semantic.verifySemanticIntegrity(
    "The team shipped twelve units to the customer on schedule.",
    "The team shipped 12 units to the customer on schedule."
  );
  assert.strictEqual(equivalent.checks.numbers.status, "match", JSON.stringify(equivalent.differences));
  const equivalentQuantity = semantic.verifySemanticIntegrity(
    "The team completed a single review before publishing the final report.",
    "The team completed one review before publishing the final report."
  );
  assert.strictEqual(equivalentQuantity.checks.numbers.status, "match", JSON.stringify(equivalentQuantity.differences));
  [
    ["The first cohort completed the scheduled review.", "The 1st cohort completed the scheduled review."],
    ["The second cohort completed the scheduled review.", "The 2nd cohort completed the scheduled review."]
  ].forEach(([original, rewrite]) => {
    const ordinal = semantic.verifySemanticIntegrity(original, rewrite);
    assert.strictEqual(ordinal.checks.numbers.status, "match", JSON.stringify(ordinal.differences));
  });
  const sameDate = semantic.verifySemanticIntegrity(
    "The meeting is scheduled for July 4 at the main office.",
    "The meeting is scheduled for July 4th at the main office."
  );
  assert.strictEqual(sameDate.checks.dates.status, "match", JSON.stringify(sameDate.differences));
});

test("sentence-initial capitalized substitutions require review", () => {
  [
    ["Alice approved the release after reviewing all test results.", "Bob approved the release after reviewing all test results."],
    ["London hosts the annual conference for the entire research team.", "Paris hosts the annual conference for the entire research team."],
    ["Microsoft released the update after completing the security review.", "Google released the update after completing the security review."],
    ["Alice launched the product after the final review.", "Bob launched the product following the final review."]
  ].forEach(([original, rewrite]) => {
    const result = semantic.verifySemanticIntegrity(original, rewrite);
    assert.notStrictEqual(result.status, "pass", JSON.stringify(result.differences));
    assert(result.differences.some(item => item.type === "named_entity" && item.change === "possible_substitution"));
  });

  const unrelated = semantic.verifySemanticIntegrity(
    "Alice launched the product after the final review.",
    "Bob redesigned the deployment architecture during an emergency meeting."
  );
  assert(!unrelated.differences.some(item => item.type === "named_entity" && item.change === "possible_substitution"), JSON.stringify(unrelated.differences));
});

test("exact text bypasses quadratic claim matching", () => {
  const text = Array.from({ length: 500 }, (_value, index) => "The service handles request " + index + " successfully.").join(" ");
  const result = semantic.verifySemanticIntegrity(text, text);
  assert.strictEqual(result.status, "pass");
  assert.strictEqual(result.checks.claims.method, "exact text shortcut");
});

test("obvious removed and added claims are surfaced for review", () => {
  const original = "The team shipped the release on schedule. Customers received the repaired package that afternoon.";
  const rewrite = "The team shipped the release on schedule. The release cures every security problem forever.";
  const result = semantic.verifySemanticIntegrity(original, rewrite);
  assert(result.differences.some(item => item.type === "claim" && item.change === "removed"), JSON.stringify(result.differences));
  assert(result.differences.some(item => item.type === "claim" && item.change === "added"), JSON.stringify(result.differences));
  assert.notStrictEqual(result.status, "pass");

  const base = "The product shipped after the final review and reached every scheduled customer.";
  const shortAdded = semantic.verifySemanticIntegrity(base, base + " Sales fell.");
  assert(shortAdded.differences.some(item => item.type === "claim" && item.change === "added" && item.rewrite === "Sales fell."), JSON.stringify(shortAdded.differences));
  const shortRemoved = semantic.verifySemanticIntegrity(base + " Patients died.", base);
  assert(shortRemoved.differences.some(item => item.type === "claim" && item.change === "removed" && item.original === "Patients died."), JSON.stringify(shortRemoved.differences));

  ["Next steps.", "Sales report.", "Patients waiting."].forEach(fragment => {
    const fragmentResult = semantic.verifySemanticIntegrity(base, base + " " + fragment);
    assert(!fragmentResult.differences.some(item => item.type === "claim" && item.rewrite === fragment), JSON.stringify({ fragment, differences: fragmentResult.differences }));
  });
});

test("negation and obvious opposing terms cannot silently pass", () => {
  const negated = semantic.verifySemanticIntegrity("The medicine is safe for adults.", "The medicine is not safe for adults.");
  const opposed = semantic.verifySemanticIntegrity("Demand will increase next year.", "Demand will decrease next year.");
  assert(negated.differences.some(item => item.type === "claim_polarity"));
  assert(opposed.differences.some(item => item.type === "claim_polarity"));
  assert.strictEqual(negated.status, "fail");
  assert.strictEqual(opposed.status, "fail");
});

test("non-negating not-only parallelism can be simplified without a false polarity failure", () => {
  const result = semantic.verifySemanticIntegrity(
    "The tool is not only useful but also fast.",
    "The tool is useful and fast."
  );
  assert(!result.differences.some(item => item.type === "claim_polarity"), JSON.stringify(result.differences));
  assert.notStrictEqual(result.status, "fail");
});

test("short and malformed inputs are explicit rather than silently accepted", () => {
  assert.strictEqual(semantic.verifySemanticIntegrity("", "").status, "insufficient");
  assert.strictEqual(semantic.verifySemanticIntegrity(null, "text").status, "invalid");
  const short = semantic.verifySemanticIntegrity("Cats sleep.", "Cats fly.");
  assert.strictEqual(short.requiresReview, true);
  assert(short.differences.some(item => item.type === "semantic_signal"));
});

test("rewrite verification composes injected style and optional voice checks", () => {
  let styleCalls = 0;
  let voiceCalls = 0;
  const result = verifier.verify("The project is ready today.", "The project is ready today.", {
    styleAnalyzer(text) { styleCalls++; return { length: text.length }; },
    voiceProfile: { id: "voice-1" },
    compareVoice(text, profile) { voiceCalls++; return { profileId: profile.id, similarity: 0.8 }; }
  });
  assert.strictEqual(result.status, "pass");
  assert.strictEqual(result.style.status, "complete");
  assert.strictEqual(result.voice.status, "complete");
  assert.strictEqual(result.documentIntegrity.status, "clean");
  assert.strictEqual(styleCalls, 2);
  assert.strictEqual(voiceCalls, 1);

  const tolerated = verifier.verify("Same content here.", "Same content here.", {
    styleAnalyzer() { throw new Error("fixture analyzer failed"); }
  });
  assert.strictEqual(tolerated.status, "review");
  assert.strictEqual(tolerated.style.status, "error");
  assert.strictEqual(tolerated.semanticIntegrity.status, "pass");
});

test("Anthropic watermark stays unsupported without an official verifier", () => {
  const result = watermark.checkAnthropicWatermark("ordinary text");
  assert.strictEqual(result.status, "unsupported");
  assert.strictEqual(result.evidenceSource, "none");
  assert.strictEqual(watermark.validateAnthropicWatermarkResult(result).valid, true);
  assert.match(result.reason, /API not configured/);
  assert.match(result.limitations[0], /does not infer/i);
});

test("Anthropic watermark results enforce a JSON-safe round-trip contract", () => {
  const unsupported = watermark.checkAnthropicWatermark("ordinary text");
  const official = watermark.checkAnthropicWatermark("ordinary text", {
    verifier: () => ({ status: "verified", verified: true, evidenceSource: "official_api" })
  });
  [unsupported, official].forEach(result => {
    assert.strictEqual(watermark.validateAnthropicWatermarkResult(result).valid, true);
    assert.strictEqual(provenance.validateAnthropicWatermarkResult(result).valid, true);
    const decoded = JSON.parse(JSON.stringify(result));
    assert.strictEqual(watermark.validateAnthropicWatermarkResult(decoded).valid, true);
    assert.strictEqual(provenance.validateAnthropicWatermarkResult(decoded).valid, true);
  });

  const missingPublishedFields = {
    kind: "watermark_provenance",
    provider: "anthropic",
    scheme: "synthid-text",
    status: "unsupported",
    evidenceSource: "none"
  };
  const inherited = Object.create(official);
  const nonEnumerable = { ...official };
  Object.defineProperty(nonEnumerable, "evidenceSource", {
    configurable: true,
    enumerable: false,
    value: "official_api",
    writable: true
  });
  let accessorRead = false;
  const accessorBacked = { ...official };
  Object.defineProperty(accessorBacked, "raw", {
    configurable: true,
    enumerable: true,
    get() {
      accessorRead = true;
      throw new Error("watermark raw getter must not run");
    }
  });
  const inheritedRaw = { ...official, raw: Object.create({ confidence: 0.99 }) };
  const undefinedRaw = { ...official, raw: { confidence: 0.99, omitted: undefined } };
  const cyclicRaw = { confidence: 0.99 };
  cyclicRaw.self = cyclicRaw;
  const cyclic = { ...official, raw: cyclicRaw };

  [missingPublishedFields, inherited, nonEnumerable, accessorBacked, inheritedRaw, undefinedRaw, cyclic].forEach(result => {
    assert.strictEqual(watermark.validateAnthropicWatermarkResult(result).valid, false);
    assert.strictEqual(provenance.validateAnthropicWatermarkResult(result).valid, false);
  });
  assert.strictEqual(accessorRead, false, "validators inspect descriptors without invoking accessors");
});

test("non-JSON-safe official verifier output fails closed without contaminating the report", () => {
  let accessorRead = false;
  const accessorResult = {
    verified: true,
    evidenceSource: "official_api"
  };
  Object.defineProperty(accessorResult, "status", {
    configurable: true,
    enumerable: true,
    get() {
      accessorRead = true;
      throw new Error("official status getter must not run");
    }
  });
  const direct = watermark.checkAnthropicWatermark("ordinary text", { verifier: () => accessorResult });
  assert.strictEqual(accessorRead, false);
  assert.strictEqual(direct.status, "error");
  assert.strictEqual(direct.raw, null);
  assert.strictEqual(watermark.validateAnthropicWatermarkResult(direct).valid, true);
  assert.strictEqual(watermark.validateAnthropicWatermarkResult(JSON.parse(JSON.stringify(direct))).valid, true);

  const cyclicResult = {
    kind: "watermark_provenance",
    provider: "anthropic",
    scheme: "synthid-text",
    status: "verified",
    verified: true,
    evidenceSource: "official_api",
    raw: null,
    limitations: ["Official fixture result."]
  };
  cyclicResult.raw = cyclicResult;
  const originalCheck = watermark.checkAnthropicWatermark;
  watermark.checkAnthropicWatermark = () => cyclicResult;
  let report;
  try {
    report = provenance.checkProvenance("ordinary text");
  } finally {
    watermark.checkAnthropicWatermark = originalCheck;
  }
  assert.strictEqual(report.status, "error");
  assert.strictEqual(report.anthropicWatermark.raw, null);
  assert.strictEqual(provenance.validateAnthropicWatermarkResult(report.anthropicWatermark).valid, true);
  assert.doesNotThrow(() => JSON.stringify(report));
});

test("malformed and contradictory official verifier results cannot fabricate provenance", () => {
  [
    { status: "banana", verified: "yes" },
    { status: "verified", verified: false },
    { status: "unsupported", verified: true }
  ].forEach(injected => {
    const direct = watermark.checkAnthropicWatermark("ordinary text", { verifier: () => injected });
    assert.strictEqual(direct.status, "error", JSON.stringify(direct));
    assert.strictEqual(direct.evidenceSource, "none");
    assert.strictEqual(Object.prototype.hasOwnProperty.call(direct, "verified"), false);
    assert.strictEqual(watermark.validateAnthropicWatermarkResult(direct).valid, true);

    const report = provenance.checkProvenance("ordinary text", { anthropic: { verifier: () => injected } });
    assert.strictEqual(report.status, "error", JSON.stringify(report));
    assert.strictEqual(report.provenanceStatus, "error");
    assert.strictEqual(report.anthropicWatermark.status, "error");
    assert.strictEqual(report.anthropicWatermark.evidenceSource, "none");
    assert.deepStrictEqual(report.explicitSignals, []);
  });
});

test("malformed optional official verifier metadata fails closed at every adapter boundary", () => {
  [
    { status: "verified", verified: true, evidenceSource: "official_api", date: "not-a-date" },
    { status: "verified", verified: true, evidenceSource: "official_api", verifierVersion: "" }
  ].forEach(injected => {
    const direct = watermark.checkAnthropicWatermark("ordinary text", { verifier: () => injected });
    assert.strictEqual(direct.status, "error", JSON.stringify(direct));
    assert.strictEqual(direct.evidenceSource, "none");
    assert.strictEqual(Object.prototype.hasOwnProperty.call(direct, "verified"), false);
    assert.strictEqual(watermark.validateAnthropicWatermarkResult(direct).valid, true);

    const report = provenance.checkProvenance("ordinary text", { anthropic: { verifier: () => injected } });
    assert.strictEqual(report.status, "error", JSON.stringify(report));
    assert.strictEqual(report.anthropicWatermark.status, "error");
    assert.strictEqual(report.anthropicWatermark.evidenceSource, "none");
    assert.deepStrictEqual(report.explicitSignals, []);
    assert.strictEqual(provenance.validateAnthropicWatermarkResult(report.anthropicWatermark).valid, true);
  });
});

test("official results require a boolean verified field and explicit evidence source", () => {
  [
    { status: "verified", verified: "yes", evidenceSource: "official_api" },
    { status: "verified", verified: true },
    { status: "verified", verified: true, evidenceSource: "none" }
  ].forEach(injected => {
    const result = watermark.checkAnthropicWatermark("ordinary text", { verifier: () => injected });
    assert.strictEqual(result.status, "error", JSON.stringify(result));
    assert.strictEqual(result.evidenceSource, "none");
  });

  const invalidNormalized = {
    kind: "watermark_provenance",
    provider: "anthropic",
    scheme: "synthid-text",
    status: "verified",
    verified: true,
    evidenceSource: "none"
  };
  let validation;
  assert.doesNotThrow(() => { validation = watermark.validateAnthropicWatermarkResult(invalidNormalized); });
  assert.strictEqual(validation.valid, false);
  assert.strictEqual(watermark.isAnthropicWatermarkResult(invalidNormalized), false);
  assert.strictEqual(provenance.validateAnthropicWatermarkResult(invalidNormalized).valid, false);
  assert.strictEqual(provenance.isAnthropicWatermarkResult(invalidNormalized), false);
});

test("valid official positive, negative, and inconclusive results retain explicit evidence", () => {
  [
    { status: "verified", verified: true, evidenceSource: "official_api" },
    { status: "not_verified", verified: false, evidenceSource: "official_api" },
    { status: "inconclusive", verified: false, evidenceSource: "official_api" }
  ].forEach(injected => {
    const direct = watermark.checkAnthropicWatermark("ordinary text", { verifier: () => injected });
    assert.strictEqual(direct.status, injected.status);
    assert.strictEqual(direct.verified, injected.verified);
    assert.strictEqual(direct.evidenceSource, "official_api");
    assert.strictEqual(watermark.validateAnthropicWatermarkResult(direct).valid, true);
    assert.strictEqual(watermark.isAnthropicWatermarkResult(direct), true);
    assert.strictEqual(provenance.validateAnthropicWatermarkResult(direct).valid, true);

    const report = provenance.checkProvenance("ordinary text", { anthropic: { verifier: () => injected } });
    assert.strictEqual(report.status, injected.status);
    assert.strictEqual(report.provenanceStatus, injected.status);
    assert.strictEqual(report.explicitSignals.length, 1);
    assert.strictEqual(report.explicitSignals[0].status, injected.status);
    assert.strictEqual(report.explicitSignals[0].evidenceSource, "official_api");
  });
});

test("provenance report boundary rejects an unnormalized fabricated adapter status", () => {
  const originalCheck = watermark.checkAnthropicWatermark;
  watermark.checkAnthropicWatermark = () => ({
    kind: "watermark_provenance",
    provider: "anthropic",
    scheme: "synthid-text",
    status: "banana",
    verified: true,
    evidenceSource: "official_api"
  });
  let report;
  try {
    report = provenance.checkProvenance("ordinary text");
  } finally {
    watermark.checkAnthropicWatermark = originalCheck;
  }
  assert.strictEqual(report.status, "error");
  assert.strictEqual(report.anthropicWatermark.status, "error");
  assert.strictEqual(report.anthropicWatermark.evidenceSource, "none");
  assert.deepStrictEqual(report.explicitSignals, []);
});

test("invisible characters are separate document-integrity findings", () => {
  const result = provenance.checkProvenance("visi\u200bble");
  assert.strictEqual(result.status, "unknown");
  assert.strictEqual(result.anthropicWatermark.status, "unsupported");
  assert.strictEqual(result.documentIntegrity.status, "review");
  assert.strictEqual(result.documentIntegrity.invisibleCharacterCount, 1);
  assert.strictEqual(result.documentIntegrity.provenanceInterpretation, "separate_signal");
  assert.deepStrictEqual(result.explicitSignals, []);

  ["\u061c", "\u200e", "\u200f", "\u2061", "\u2062", "\u2063", "\u2064"].forEach(mark => {
    const bidi = provenance.checkProvenance("left" + mark + "right");
    assert.strictEqual(bidi.documentIntegrity.status, "review");
    assert.strictEqual(bidi.documentIntegrity.invisibleCharacterCount, 1);
  });

  const verification = verifier.verify("visible text remains unchanged", "visi\u200bble text remains unchanged");
  assert.strictEqual(verification.documentIntegrity.status, "review");
  assert.strictEqual(verification.accepted, false);
  assert.strictEqual(verification.requiresReview, true);
});

test("classic-browser scripts expose stable Sapienize globals", () => {
  const context = vm.createContext({ console, Promise, Date, setTimeout, clearTimeout });
  [
    "src/rewrite/semantic.js",
    "src/provenance/anthropic-watermark.js",
    "src/provenance/index.js",
    "src/rewrite/verify.js"
  ].forEach(file => vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file }));
  assert.strictEqual(typeof context.SapienizeSemantic.verifySemanticIntegrity, "function");
  assert.strictEqual(typeof context.SapienizeVerify.verify, "function");
  assert.strictEqual(typeof context.SapienizeProvenance.checkProvenance, "function");
  assert.strictEqual(context.SapienizeProvenance.checkAnthropicWatermark("x").status, "unsupported");
});

console.log("Integrity suites green:", passes, "tests");
