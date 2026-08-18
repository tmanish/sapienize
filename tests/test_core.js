"use strict";
const assert = require("assert");
const sapienize = require("../src/core/index.js");
const types = require("../src/core/types.js");
const detectorAdapter = require("../src/detectors/adapter.js");

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function parentAtPath(value, path) {
  return path.slice(0, -1).reduce((current, key) => current[key], value);
}

function assertInvalidAnalysis(value, label) {
  let validation;
  assert.doesNotThrow(() => { validation = types.validateAnalysisResult(value); }, `${label} must not throw`);
  assert.strictEqual(validation.valid, false, `${label} must be rejected`);
  assert.ok(Array.isArray(validation.errors) && validation.errors.length > 0, `${label} must report validation errors`);
}

async function main() {
  const structured = sapienize.analyze("I shipped 12 units on 4 July 2026.");
  assert.strictEqual(structured.schemaVersion, "2.0.0");
  ["stylisticSignals", "detectorEstimate", "voiceMatch", "semanticIntegrity", "provenance"].forEach(key => assert.ok(structured[key]));
  assert.strictEqual(structured.stylisticSignals.heuristicStyleScore.kind, "uncalibrated_style_heuristic");
  assert.strictEqual(structured.stylisticSignals.heuristicStyleScore.isProbability, false);
  assert.strictEqual(structured.detectorEstimate.status, "unavailable");
  assert.strictEqual(structured.detectorEstimate.probability, null);
  assert.deepStrictEqual(types.validateAnalysisResult(structured), { valid: true, errors: [] });
  assert.ok(types.ANALYSIS_RESULT_SCHEMA.properties.stylisticSignals.required.includes("heuristicStyleScore"));
  assert.strictEqual(types.ANALYSIS_RESULT_SCHEMA.properties.stylisticSignals.properties.heuristicStyleScore.properties.value.maximum, 100);
  assert.strictEqual(types.ANALYSIS_RESULT_SCHEMA.properties.detectorEstimate.properties.probability.type, "null");
  assert.ok(types.ANALYSIS_RESULT_SCHEMA.properties.provenance.required.includes("documentIntegrity"));

  const structuredRoundTrip = JSON.parse(JSON.stringify(structured));
  assert.deepStrictEqual(types.validateAnalysisResult(structuredRoundTrip), { valid: true, errors: [] },
    "a valid generated result remains valid after JSON serialization");
  const nullPrototypeResult = Object.assign(Object.create(null), structuredRoundTrip);
  assert.deepStrictEqual(types.validateAnalysisResult(nullPrototypeResult), { valid: true, errors: [] },
    "null-prototype records are a supported JSON-safe representation");

  const inheritedAnalysis = Object.create(structured);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(inheritedAnalysis)), {});
  assertInvalidAnalysis(inheritedAnalysis, "inherited whole analysis result");

  const inheritedStylisticSignals = cloneJson(structured);
  inheritedStylisticSignals.stylisticSignals = Object.create(structured.stylisticSignals);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(inheritedStylisticSignals)).stylisticSignals, {});
  assertInvalidAnalysis(inheritedStylisticSignals, "inherited stylisticSignals record");

  const inheritedProvenance = cloneJson(structured);
  inheritedProvenance.provenance = Object.create(structured.provenance);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(inheritedProvenance)).provenance, {});
  assertInvalidAnalysis(inheritedProvenance, "inherited provenance report");

  const inheritedWatermarks = cloneJson(structured);
  inheritedWatermarks.provenance.watermarks = Object.create(structured.provenance.watermarks);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(inheritedWatermarks)).provenance.watermarks, {});
  assertInvalidAnalysis(inheritedWatermarks, "inherited provenance watermarks record");

  const nonEnumerableResult = cloneJson(structured);
  Object.defineProperty(nonEnumerableResult, "schemaVersion", {
    configurable: true,
    enumerable: false,
    value: types.RESULT_SCHEMA_VERSION,
    writable: true
  });
  assert.strictEqual(Object.prototype.hasOwnProperty.call(JSON.parse(JSON.stringify(nonEnumerableResult)), "schemaVersion"), false);
  assertInvalidAnalysis(nonEnumerableResult, "non-enumerable top-level field");

  let accessorRead = false;
  const accessorBackedResult = cloneJson(structured);
  Object.defineProperty(accessorBackedResult, "stylisticSignals", {
    configurable: true,
    enumerable: true,
    get() {
      accessorRead = true;
      throw new Error("top-level getter must not run");
    }
  });
  assertInvalidAnalysis(accessorBackedResult, "accessor-backed top-level field");
  assert.strictEqual(accessorRead, false, "validation inspects descriptors without invoking accessors");

  const hostileProxyResult = new Proxy(cloneJson(structured), {
    ownKeys() { throw new Error("hostile ownKeys trap"); }
  });
  assertInvalidAnalysis(hostileProxyResult, "hostile proxy result");
  const revokedResult = Proxy.revocable({}, {});
  revokedResult.revoke();
  assertInvalidAnalysis(revokedResult.proxy, "revoked proxy result");

  const highStyleScore = cloneJson(structured);
  highStyleScore.stylisticSignals.heuristicStyleScore.value = 999;
  assertInvalidAnalysis(highStyleScore, "out-of-range style heuristic");

  const probabilisticStyleClaim = cloneJson(structured);
  probabilisticStyleClaim.stylisticSignals.heuristicStyleScore.calibrated = true;
  probabilisticStyleClaim.stylisticSignals.heuristicStyleScore.isProbability = true;
  probabilisticStyleClaim.stylisticSignals.heuristicStyleScore.kind = "human_probability";
  assertInvalidAnalysis(probabilisticStyleClaim, "fabricated style probability");

  const signaled = sapienize.analyze("It is important to note that this serves as a testament to a vibrant tapestry.");
  assert.ok(signaled.stylisticSignals.findings.inline.length > 0);
  const malformedFinding = cloneJson(signaled);
  malformedFinding.stylisticSignals.findings.inline[0].sev = 9;
  malformedFinding.stylisticSignals.findings.inline[0].end = malformedFinding.stylisticSignals.text.length + 10;
  assertInvalidAnalysis(malformedFinding, "malformed inline style finding");

  const fabricatedDetectorProbability = cloneJson(structured);
  fabricatedDetectorProbability.detectorEstimate.probability = 0.94;
  fabricatedDetectorProbability.detectorEstimate.calibrated = true;
  fabricatedDetectorProbability.detectorEstimate.label = "human";
  assertInvalidAnalysis(fabricatedDetectorProbability, "fabricated aggregate detector probability");

  const emptyUnavailable = cloneJson(structured);
  emptyUnavailable.voiceMatch = {};
  emptyUnavailable.semanticIntegrity = {};
  assertInvalidAnalysis(emptyUnavailable, "empty unavailable voice and semantic results");

  const fabricatedProvenance = cloneJson(structured);
  fabricatedProvenance.provenance.status = "verified";
  fabricatedProvenance.provenance.provenanceStatus = "verified";
  fabricatedProvenance.provenance.anthropicWatermark.verified = true;
  fabricatedProvenance.provenance.watermarks.anthropic.verified = true;
  assertInvalidAnalysis(fabricatedProvenance, "fabricated provenance verification");

  const requiredNonNullPaths = [
    ["schemaVersion"],
    ["stylisticSignals"], ["stylisticSignals", "kind"], ["stylisticSignals", "version"],
    ["stylisticSignals", "text"], ["stylisticSignals", "counts"], ["stylisticSignals", "counts", "words"],
    ["stylisticSignals", "counts", "sentences"], ["stylisticSignals", "metrics"],
    ["stylisticSignals", "findings"], ["stylisticSignals", "findings", "inline"],
    ["stylisticSignals", "findings", "document"], ["stylisticSignals", "heuristicStyleScore"],
    ["stylisticSignals", "heuristicStyleScore", "value"], ["stylisticSignals", "heuristicStyleScore", "scale"],
    ["stylisticSignals", "heuristicStyleScore", "scale", "min"], ["stylisticSignals", "heuristicStyleScore", "scale", "max"],
    ["stylisticSignals", "heuristicStyleScore", "kind"], ["stylisticSignals", "heuristicStyleScore", "label"],
    ["stylisticSignals", "heuristicStyleScore", "higherMeans"], ["stylisticSignals", "heuristicStyleScore", "calibrated"],
    ["stylisticSignals", "heuristicStyleScore", "isProbability"], ["stylisticSignals", "heuristicStyleScore", "band"],
    ["stylisticSignals", "heuristicStyleScore", "note"], ["stylisticSignals", "limitations"],
    ["detectorEstimate"], ["detectorEstimate", "kind"], ["detectorEstimate", "status"],
    ["detectorEstimate", "source"], ["detectorEstimate", "calibrated"], ["detectorEstimate", "reason"],
    ["detectorEstimate", "observations"], ["detectorEstimate", "limitations"],
    ["voiceMatch"], ["voiceMatch", "kind"], ["voiceMatch", "status"], ["voiceMatch", "reason"],
    ["semanticIntegrity"], ["semanticIntegrity", "kind"], ["semanticIntegrity", "status"], ["semanticIntegrity", "reason"],
    ["provenance"], ["provenance", "kind"], ["provenance", "status"], ["provenance", "provenanceStatus"],
    ["provenance", "watermarks"], ["provenance", "watermarks", "anthropic"],
    ["provenance", "anthropicWatermark"], ["provenance", "documentIntegrity"],
    ["provenance", "explicitSignals"], ["provenance", "limitations"],
    ["provenance", "anthropicWatermark", "kind"], ["provenance", "anthropicWatermark", "provider"],
    ["provenance", "anthropicWatermark", "scheme"], ["provenance", "anthropicWatermark", "status"],
    ["provenance", "anthropicWatermark", "evidenceSource"], ["provenance", "anthropicWatermark", "limitations"],
    ["provenance", "watermarks", "anthropic", "kind"], ["provenance", "watermarks", "anthropic", "provider"],
    ["provenance", "watermarks", "anthropic", "scheme"], ["provenance", "watermarks", "anthropic", "status"],
    ["provenance", "watermarks", "anthropic", "evidenceSource"], ["provenance", "watermarks", "anthropic", "limitations"],
    ["provenance", "documentIntegrity", "kind"], ["provenance", "documentIntegrity", "status"],
    ["provenance", "documentIntegrity", "findings"], ["provenance", "documentIntegrity", "invisibleCharacterCount"],
    ["provenance", "documentIntegrity", "countsByCodePoint"],
    ["provenance", "documentIntegrity", "provenanceInterpretation"], ["provenance", "documentIntegrity", "note"]
  ];
  requiredNonNullPaths.forEach(path => {
    for (const operation of ["delete", "null"]) {
      const malformed = cloneJson(structured);
      const parent = parentAtPath(malformed, path);
      const key = path[path.length - 1];
      if (operation === "delete") delete parent[key];
      else parent[key] = null;
      assertInvalidAnalysis(malformed, `${operation} ${path.join(".")}`);
    }
  });
  const nullableButRequiredPaths = [
    ["stylisticSignals", "metrics", "contractionRatio"],
    ["detectorEstimate", "probability"], ["detectorEstimate", "label"],
    ["provenance", "anthropicWatermark", "raw"], ["provenance", "watermarks", "anthropic", "raw"]
  ];
  nullableButRequiredPaths.forEach(path => {
    const malformed = cloneJson(structured);
    delete parentAtPath(malformed, path)[path[path.length - 1]];
    assertInvalidAnalysis(malformed, `delete ${path.join(".")}`);
  });

  const hostileNestedResult = cloneJson(structured);
  Object.defineProperty(hostileNestedResult.stylisticSignals.counts, "words", {
    enumerable: true,
    get() { throw new Error("hostile getter"); }
  });
  assertInvalidAnalysis(hostileNestedResult, "hostile nested result");
  const detectorObservation = detectorAdapter.createDetectorObservation({
    name: "Fixture A",
    version: "1",
    date: "2026-08-17T00:00:00Z",
    raw: { value: 87 },
    normalized: { value: 87 }
  });
  const observed = sapienize.analyze("Text", { detectorObservations: [detectorObservation] });
  assert.strictEqual(observed.detectorEstimate.status, "observed");
  assert.strictEqual(observed.detectorEstimate.probability, null, "external provider scales are not combined into a probability");
  assert.deepStrictEqual(types.validateAnalysisResult(observed), { valid: true, errors: [] });
  const observedRoundTrip = JSON.parse(JSON.stringify(observed));
  assert.deepStrictEqual(types.validateAnalysisResult(observedRoundTrip), { valid: true, errors: [] }, "a validated analysis result remains valid after JSON serialization");

  const undefinedRawObservation = Object.assign({}, detectorObservation, { raw: undefined });
  const nestedUndefinedRawObservation = Object.assign({}, detectorObservation, { raw: { response: undefined } });
  const nonJsonNormalizedObservation = Object.assign({}, detectorObservation, {
    normalized: Object.assign({}, detectorObservation.normalized, { nonFinite: Infinity })
  });
  assert.throws(() => sapienize.analyze("Text", { detectorObservations: [undefinedRawObservation] }), /observation contract/);
  assert.throws(() => sapienize.analyze("Text", { detectorObservations: [nestedUndefinedRawObservation] }), /observation contract/);
  assert.throws(() => sapienize.analyze("Text", { detectorObservations: [nonJsonNormalizedObservation] }), /observation contract/);
  const inheritedObservation = Object.create(detectorObservation);
  inheritedObservation.raw = null;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(inheritedObservation)), { raw: null });
  assert.throws(() => sapienize.analyze("Text", { detectorObservations: [inheritedObservation] }), /observation contract/);
  const inheritedNormalized = Object.create(detectorObservation.normalized);
  const observationWithInheritedNormalized = Object.assign({}, detectorObservation, { normalized: inheritedNormalized });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(inheritedNormalized)), {});
  assert.throws(() => sapienize.analyze("Text", { detectorObservations: [observationWithInheritedNormalized] }), /observation contract/);
  const invalidSerializedBoundary = cloneJson(observed);
  invalidSerializedBoundary.detectorEstimate.observations[0].raw = undefined;
  assertInvalidAnalysis(invalidSerializedBoundary, "external observation with undefined raw");
  const inheritedValidationBoundary = cloneJson(observed);
  inheritedValidationBoundary.detectorEstimate.observations[0] = inheritedObservation;
  assertInvalidAnalysis(inheritedValidationBoundary, "external observation with inherited required fields");
  const inheritedNormalizedBoundary = cloneJson(observed);
  inheritedNormalizedBoundary.detectorEstimate.observations[0].normalized = inheritedNormalized;
  assertInvalidAnalysis(inheritedNormalizedBoundary, "external observation with inherited normalized fields");
  const inheritedRawPayload = Object.create({ vendorValue: 87 });
  const observationWithInheritedRaw = Object.assign({}, detectorObservation, { raw: inheritedRawPayload });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(inheritedRawPayload)), {});
  assert.throws(() => sapienize.analyze("Text", { detectorObservations: [observationWithInheritedRaw] }), /observation contract/);
  const normalizedWithInheritedExtras = Object.assign(Object.create({ vendorValue: 87 }), {
    value: 87,
    providerSpecific: true,
    semantics: "fixture score",
    calibrated: false
  });
  const observationWithInheritedNormalizedExtras = Object.assign({}, detectorObservation, {
    normalized: normalizedWithInheritedExtras
  });
  assert.strictEqual(JSON.parse(JSON.stringify(normalizedWithInheritedExtras)).vendorValue, undefined);
  assert.throws(() => sapienize.analyze("Text", { detectorObservations: [observationWithInheritedNormalizedExtras] }), /observation contract/);
  const inheritedRawValidationBoundary = cloneJson(observed);
  inheritedRawValidationBoundary.detectorEstimate.observations[0].raw = inheritedRawPayload;
  assertInvalidAnalysis(inheritedRawValidationBoundary, "external observation with inherited raw data");
  const inheritedExtrasValidationBoundary = cloneJson(observed);
  inheritedExtrasValidationBoundary.detectorEstimate.observations[0].normalized = normalizedWithInheritedExtras;
  assertInvalidAnalysis(inheritedExtrasValidationBoundary, "external observation with inherited normalized data");

  const nullRawObservation = detectorAdapter.createDetectorObservation({
    name: "Fixture Null",
    version: "1",
    date: "2026-08-17T00:00:00Z",
    raw: null,
    normalized: { value: null }
  });
  const nullRawAnalysis = sapienize.analyze("Text", { detectorObservations: [nullRawObservation] });
  assert.deepStrictEqual(types.validateAnalysisResult(JSON.parse(JSON.stringify(nullRawAnalysis))), { valid: true, errors: [] });
  const miscalibratedObservation = cloneJson(observed);
  miscalibratedObservation.detectorEstimate.observations[0].normalized.calibratedProbability = 0.87;
  assertInvalidAnalysis(miscalibratedObservation, "uncalibrated observation with calibrated probability");
  assert.throws(() => sapienize.analyze("Text", { detectorObservations: ["bogus"] }), /observation contract/);
  assert.throws(() => sapienize.analyze("Text", { detectorObservations: [{
    kind: "external_detector_observation",
    name: "Fixture A",
    version: "",
    date: "not-a-date",
    raw: {},
    normalized: {},
    calibrated: false,
    calibrationStatus: "",
    limitations: [],
    comparability: "provider_specific"
  }] }), /observation contract/);
  assert.strictEqual(types.validateAnalysisResult({
    schemaVersion: "2.0.0",
    stylisticSignals: {},
    detectorEstimate: {},
    voiceMatch: {},
    semanticIntegrity: {},
    provenance: {}
  }).valid, false);
  assert.throws(() => sapienize.analyze(null), /string/);
  assert.throws(() => sapienize.analyze("Text", { provenance: { anthropic: { verifier: async () => ({ status: "verified" }) } } }), /synchronous/);
  const asyncProvenance = await sapienize.checkProvenance("Text", { anthropic: { verifier: async () => ({ status: "verified", verified: true, evidenceSource: "official_api" }) } });
  assert.strictEqual(asyncProvenance.anthropicWatermark.status, "verified");

  const profile = sapienize.createVoiceProfile("I test the build. Then I ship it. That's usually enough for me. I don't add much ceremony.");
  const withVoice = sapienize.analyze("I test it, and then I ship it.", { voiceProfile: profile });
  assert.ok(Number.isFinite(withVoice.voiceMatch.score));
  assert.strictEqual(withVoice.voiceMatch.authorshipProbability, null);
  assert.deepStrictEqual(types.validateAnalysisResult(withVoice), { valid: true, errors: [] });
  const invalidVoiceComparison = cloneJson(withVoice);
  invalidVoiceComparison.voiceMatch.score = 999;
  assertInvalidAnalysis(invalidVoiceComparison, "out-of-range VoiceComparison");

  const officialProvenance = sapienize.analyze("Text", {
    provenance: { anthropic: { verifier: () => ({ status: "not_verified", verified: false, evidenceSource: "official_api" }) } }
  });
  assert.deepStrictEqual(types.validateAnalysisResult(officialProvenance), { valid: true, errors: [] });
  const contradictoryProvenanceAliases = cloneJson(officialProvenance);
  contradictoryProvenanceAliases.provenance.watermarks.anthropic.raw.extra = "left";
  contradictoryProvenanceAliases.provenance.anthropicWatermark.raw.extra = "right";
  contradictoryProvenanceAliases.provenance.explicitSignals[0].raw.extra = "third";
  assertInvalidAnalysis(contradictoryProvenanceAliases, "contradictory duplicated provenance evidence");

  const exact = sapienize.verify("Acme shipped 12 units.", "Acme shipped 12 units.");
  assert.strictEqual(exact.semanticIntegrity.status, "pass");
  assert.strictEqual(exact.semanticIntegrity.score, 100);
  const changed = sapienize.verify("Acme shipped 12 units.", "Acme shipped 99 units.");
  assert.strictEqual(changed.semanticIntegrity.status, "fail");
  assert.ok(changed.semanticIntegrity.criticalDifferenceCount > 0);

  const replies = ["We shipped 99 units on 4 July 2026.", "We shipped 12 units on 4 July 2026."];
  const mockProvider = {
    name: "mock",
    model: "fixture",
    rewrite: async () => ({ text: replies.shift(), truncated: false, provider: "mock", model: "fixture" })
  };
  const rewritten = await sapienize.rewrite("We shipped 12 units on 4 July 2026.", { provider: mockProvider, maxPasses: 3 });
  assert.strictEqual(rewritten.text, "We shipped 12 units on 4 July 2026.");
  assert.strictEqual(rewritten.status, "complete");
  assert.strictEqual(rewritten.passCount, 2);
  assert.strictEqual(rewritten.candidates[0].ranking.eligible, true);
  assert.ok(rewritten.candidates.some(candidate => !candidate.ranking.eligible));

  const truncated = await sapienize.rewrite("We shipped 12 units.", {
    provider: { name: "mock", rewrite: async () => ({
      text: "We shipped 12 units.", truncated: true, incomplete: true,
      completionReason: "content_filter", completionStatus: "incomplete"
    }) },
    maxPasses: 1
  });
  assert.strictEqual(truncated.status, "review_required");
  assert.strictEqual(truncated.accepted, false);
  assert.strictEqual(truncated.ranking.exclusionReason, "provider_output_incomplete");
  assert.strictEqual(truncated.completionReason, "content_filter");
  assert.strictEqual(truncated.completionStatus, "incomplete");
  assert.strictEqual(truncated.incomplete, true);
  assert.strictEqual(truncated.candidates[0].completionReason, "content_filter");

  const privateCompletionReason = "Bearer sk-private-secret-123456";
  const unknownCompletion = await sapienize.rewrite("We shipped 12 units.", {
    provider: { name: "mock", rewrite: async () => ({
      text: "We shipped 12 units.", truncated: true, incomplete: true,
      completionReason: privateCompletionReason, completionStatus: "incomplete"
    }) },
    maxPasses: 1
  });
  assert.strictEqual(unknownCompletion.completionReason, "unknown");
  assert.strictEqual(unknownCompletion.candidates[0].completionReason, "unknown");
  assert.doesNotMatch(JSON.stringify(unknownCompletion), /sk-private-secret-123456/);

  const hiddenOutput = await sapienize.rewrite("The release is ready for review today.", {
    provider: { name: "mock", rewrite: async () => ({ text: "The re\u200blease is ready for review today.", truncated: false }) },
    maxPasses: 1
  });
  assert.strictEqual(hiddenOutput.status, "review_required");
  assert.strictEqual(hiddenOutput.accepted, false);
  assert.strictEqual(hiddenOutput.verification.documentIntegrity.status, "review");

  const boundaryMark = await sapienize.rewrite("The release is ready for review today.", {
    provider: { name: "mock", rewrite: async () => ({ text: "\uFEFFThe release is ready for review today.", truncated: false }) },
    maxPasses: 1
  });
  assert.strictEqual(boundaryMark.status, "review_required");
  assert.strictEqual(boundaryMark.accepted, false);
  assert.strictEqual(boundaryMark.verification.documentIntegrity.invisibleCharacterCount, 1);

  const provenance = sapienize.checkProvenance("clean\u200btext");
  assert.strictEqual(provenance.anthropicWatermark.status, "unsupported");
  assert.strictEqual(provenance.documentIntegrity.invisibleCharacterCount, 1);
  assert.strictEqual(provenance.status, "unknown");
  const withInvisible = sapienize.analyze("visible\u200b text");
  assert.strictEqual(withInvisible.provenance.documentIntegrity.invisibleCharacterCount, 1);
  assert.strictEqual(withInvisible.stylisticSignals.findings.document.some(item => item.cat === "document_integrity"), false);
  assert.strictEqual(withInvisible.stylisticSignals.heuristicStyleScore.value, 100);
  console.log("PASS: structured core API, semantic verification, and provider-neutral rewrite");
}

main().catch(error => { console.error(error); process.exit(1); });
