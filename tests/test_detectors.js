"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const adapter = require("../src/detectors/adapter.js");
const mock = require("../src/detectors/mock.js");
const surrogate = require("../src/detectors/surrogate.js");

let passes = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log("PASS:", name);
    passes++;
  } catch (error) {
    console.error("FAIL:", name);
    throw error;
  }
}

async function main() {
  await test("mock observations retain detector identity, date, raw, and provider-specific normalization", async () => {
    const detector = new mock.MockDetectorAdapter({
      name: "Fixture Labs",
      version: "model-2026-08",
      fixtures: [{
        id: "sample-1",
        text: "fixture text",
        date: "2026-08-17T12:30:00.000Z",
        raw: { vendorScore: 73, verdict: "vendor-ai" },
        normalized: { label: "vendor-ai", score: { value: 73, scale: "Fixture Labs percent" } }
      }]
    });
    const result = await detector.analyze("fixture text");
    assert.strictEqual(adapter.isDetectorObservation(result), true);
    assert.strictEqual(result.name, "Fixture Labs");
    assert.strictEqual(result.version, "model-2026-08");
    assert.strictEqual(result.date, "2026-08-17T12:30:00.000Z");
    assert.deepStrictEqual(result.raw, { vendorScore: 73, verdict: "vendor-ai" });
    assert.strictEqual(result.normalized.score.value, 73);
    assert.strictEqual(result.normalized.providerSpecific, true);
    assert.strictEqual(result.calibrated, false);
    assert.strictEqual(result.calibrationStatus, "not_calibrated");
    assert(result.limitations.some(item => /No calibrated probability/.test(item)));
    assert.strictEqual(result.comparability, "provider_specific");
    assert.strictEqual(detector.history.length, 1);
  });

  await test("equal numbers from different detectors retain different semantics", async () => {
    const first = adapter.createDetectorObservation({
      name: "Detector One", version: "1", date: "2026-08-17T00:00:00Z", raw: { p: 0.8 },
      normalized: { score: 0.8, semantics: "likelihood on Detector One's internal scale" }
    });
    const second = adapter.createDetectorObservation({
      name: "Detector Two", version: "9", date: "2026-08-17T00:00:00Z", raw: { confidence: 0.8 },
      normalized: { score: 0.8, semantics: "confidence for Detector Two's selected label" }
    });
    assert.strictEqual(first.normalized.score, second.normalized.score);
    assert.notStrictEqual(first.normalized.semantics, second.normalized.semantics);
    assert.strictEqual(first.note, second.note);
    assert(!Object.prototype.hasOwnProperty.call(first, "humanProbability"));
    assert.strictEqual(first.calibrated, false);
    assert(Array.isArray(first.limitations) && first.limitations.length > 0);
  });

  await test("observations preserve their contract across JSON round trips", async () => {
    const undefinedRaw = adapter.createDetectorObservation({
      name: "Round-trip Fixture",
      version: "1",
      date: "2026-08-17T00:00:00Z",
      raw: undefined,
      normalized: { value: null, semantics: "fixture null result" }
    });
    assert.strictEqual(undefinedRaw.raw, null, "explicit raw undefined is normalized before serialization");
    assert.strictEqual(adapter.isDetectorObservation(undefinedRaw), true);
    const roundTripped = JSON.parse(JSON.stringify(undefinedRaw));
    assert.strictEqual(adapter.isDetectorObservation(roundTripped), true);
    assert.strictEqual(roundTripped.raw, null);

    const nullRaw = adapter.createDetectorObservation({
      name: "Round-trip Fixture",
      version: "1",
      date: "2026-08-17T00:00:00Z",
      raw: null,
      normalized: { value: 0, semantics: "fixture zero result" }
    });
    assert.strictEqual(nullRaw.raw, null);
    assert.strictEqual(adapter.isDetectorObservation(nullRaw), true);

    const nestedUndefined = { response: undefined };
    assert.throws(() => adapter.createDetectorObservation({
      name: "Unsafe Fixture", version: "1", raw: nestedUndefined, normalized: { value: 1 }
    }), /raw.*JSON-safe/);
    assert.throws(() => adapter.createDetectorObservation({
      name: "Unsafe Fixture", version: "1", raw: { value: 1 }, normalized: { value: Infinity }
    }), /normalized.*JSON-safe/);
    const circular = {};
    circular.self = circular;
    assert.throws(() => adapter.createDetectorObservation({
      name: "Unsafe Fixture", version: "1", raw: circular, normalized: { value: 1 }
    }), /raw.*JSON-safe/);
    const inheritedRaw = Object.create({ vendorValue: 87 });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(inheritedRaw)), {});
    assert.throws(() => adapter.createDetectorObservation({
      name: "Unsafe Fixture", version: "1", raw: inheritedRaw, normalized: { value: 1 }
    }), /raw.*JSON-safe/);
    const normalizedWithInheritedExtras = Object.assign(Object.create({ vendorValue: 87 }), {
      value: 87,
      providerSpecific: true,
      semantics: "fixture score"
    });
    assert.strictEqual(JSON.parse(JSON.stringify(normalizedWithInheritedExtras)).vendorValue, undefined);
    assert.throws(() => adapter.createDetectorObservation({
      name: "Unsafe Fixture", version: "1", raw: null, normalized: normalizedWithInheritedExtras
    }), /normalized.*JSON-safe/);

    const handcraftedUndefined = Object.assign({}, nullRaw, { raw: undefined });
    const handcraftedNested = Object.assign({}, nullRaw, { raw: { response: undefined } });
    const handcraftedInheritedRaw = Object.assign({}, nullRaw, { raw: inheritedRaw });
    const handcraftedNormalized = Object.assign({}, nullRaw, {
      normalized: Object.assign({}, nullRaw.normalized, { nonFinite: NaN })
    });
    const handcraftedInheritedNormalized = Object.assign({}, nullRaw, { normalized: normalizedWithInheritedExtras });
    assert.strictEqual(adapter.isDetectorObservation(handcraftedUndefined), false);
    assert.strictEqual(adapter.isDetectorObservation(handcraftedNested), false);
    assert.strictEqual(adapter.isDetectorObservation(handcraftedInheritedRaw), false);
    assert.strictEqual(adapter.isDetectorObservation(handcraftedNormalized), false);
    assert.strictEqual(adapter.isDetectorObservation(handcraftedInheritedNormalized), false);

    const inheritedObservation = Object.create(nullRaw);
    inheritedObservation.raw = null;
    assert.deepStrictEqual(JSON.parse(JSON.stringify(inheritedObservation)), { raw: null });
    assert.strictEqual(adapter.isDetectorObservation(inheritedObservation), false,
      "required observation fields must not disappear during serialization");

    const inheritedNormalized = Object.create(nullRaw.normalized);
    const observationWithInheritedNormalized = Object.assign({}, nullRaw, { normalized: inheritedNormalized });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(inheritedNormalized)), {});
    assert.strictEqual(adapter.isDetectorObservation(observationWithInheritedNormalized), false,
      "required normalized fields must be own properties");
  });

  await test("calibration is explicit and integration limitations are retained", async () => {
    const observation = adapter.createDetectorObservation({
      name: "Calibrated Fixture",
      version: "3",
      date: "2026-08-17T00:00:00Z",
      raw: { probability: 0.72 },
      normalized: { probability: 0.72 },
      calibrated: true,
      limitations: ["Calibrated only on the published fixture population."]
    });
    assert.strictEqual(observation.calibrated, true);
    assert.strictEqual(observation.calibrationStatus, "provider_declared");
    assert.deepStrictEqual(observation.limitations, ["Calibrated only on the published fixture population."]);
    assert.strictEqual(adapter.isDetectorObservation(observation), true);
    assert.throws(() => adapter.createDetectorObservation({
      name: "Contradictory Fixture",
      version: "1",
      date: "2026-08-17T00:00:00Z",
      normalized: { calibratedProbability: 0.8 },
      calibrated: false
    }), /requires calibrated: true/);
  });

  await test("mock tests fail locally when a fixture is absent and never make a paid call", async () => {
    const detector = mock.createMockDetector({ name: "Offline only", fixtures: [] });
    await assert.rejects(detector.analyze("unregistered"), error => error.code === "MOCK_FIXTURE_NOT_FOUND");
  });

  await test("base adapter supports an injected request without imposing cross-provider semantics", async () => {
    const detector = new adapter.DetectorAdapter({
      name: "Injected fixture",
      version: "2",
      clock: () => new Date("2026-08-17T00:00:00Z"),
      request: text => ({ length: text.length }),
      normalize: raw => ({ label: raw.length > 3 ? "long" : "short", providerScale: "fixture length rule" })
    });
    const result = await detector.analyze("hello");
    assert.deepStrictEqual(result.raw, { length: 5 });
    assert.strictEqual(result.normalized.label, "long");
    assert.strictEqual(result.normalized.providerSpecific, true);
  });

  await test("surrogate feature preparation is deterministic with a stable numeric schema", async () => {
    const records = [
      { id: "b", text: "Two short sentences. Really short!", source_type: "human", domain: "note" },
      { id: "a", text: "One longer sentence contains 2026 and several words.", source_type: "ai", domain: "note" }
    ];
    const options = {
      sortById: true,
      featureFamilies: [{
        name: "fixture",
        version: "1",
        extract(text) { return { has_question: /\?/.test(text), nested: { spaces: (text.match(/ /g) || []).length } }; }
      }]
    };
    const first = surrogate.prepareSurrogateDataset(records, options);
    const second = surrogate.prepareSurrogateDataset(records, options);
    assert.deepStrictEqual(first, second);
    assert.deepStrictEqual(first.rows.map(row => row.id), ["a", "b"]);
    assert.deepStrictEqual(first.featureNames, first.featureNames.slice().sort());
    first.rows.forEach(row => Object.values(row.features).forEach(value => assert(Number.isFinite(value))));
    assert.strictEqual(first.accuracy, null);
    assert.strictEqual(first.accuracyClaim, null);
    assert.strictEqual(first.calibrated, false);
  });

  await test("surrogate feature and family maps preserve prototype-reserved names", async () => {
    const reservedFeatures = surrogate.prepareFeatureRow({ id: "reserved-features", text: "Fixture." }, {
      includeBasic: false,
      featureFamilies: [{
        name: "fixture",
        version: "1",
        extract() {
          return JSON.parse('{"__proto__":7,"constructor":9,"toString":11}');
        }
      }]
    });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(reservedFeatures.features)), {
      "fixture.__proto__": 7,
      "fixture.constructor": 9,
      "fixture.toString": 11
    });

    const reservedFamilies = surrogate.prepareFeatureRow({ id: "reserved-families", text: "Fixture." }, {
      includeBasic: false,
      featureFamilies: [
        { name: "__proto__", version: "proto-v1", extract: () => ({ value: 1 }) },
        { name: "constructor", version: "constructor-v1", extract: () => ({ value: 2 }) }
      ]
    });
    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(reservedFamilies.featureFamilies)),
      JSON.parse('{"__proto__":"proto-v1","constructor":"constructor-v1"}')
    );
    assert.deepStrictEqual(JSON.parse(JSON.stringify(reservedFamilies.features)), {
      "__proto__.value": 1,
      "constructor.value": 2
    });
    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(reservedFamilies)),
      JSON.parse(JSON.stringify(surrogate.prepareFeatureRow({ id: "reserved-families", text: "Fixture." }, {
        includeBasic: false,
        featureFamilies: [
          { name: "__proto__", version: "proto-v1", extract: () => ({ value: 1 }) },
          { name: "constructor", version: "constructor-v1", extract: () => ({ value: 2 }) }
        ]
      })))
    );
  });

  await test("surrogate hooks label predictor output unvalidated and make no accuracy claim", async () => {
    const researchHook = new surrogate.DetectorSurrogate({
      name: "Research hook",
      version: "draft-1",
      predict(features) { return { arbitraryMargin: features["surface.word_count"] - 2 }; }
    });
    const result = researchHook.predict("Three words here.", { id: "x" });
    assert.strictEqual(result.status, "unvalidated");
    assert.strictEqual(result.accuracy, null);
    assert.strictEqual(result.accuracyClaim, null);
    assert.strictEqual(result.calibrated, false);
    assert.match(result.interpretation, /not a probability/i);

    const unconfigured = new surrogate.DetectorSurrogate().predict("Text only.");
    assert.strictEqual(unconfigured.status, "not_configured");
  });

  await test("detector modules load as classic-browser globals", async () => {
    const context = vm.createContext({ console, Promise, Date });
    ["src/detectors/adapter.js", "src/detectors/mock.js", "src/detectors/surrogate.js"].forEach(file => {
      vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file });
    });
    assert.strictEqual(typeof context.SapienizeDetectorAdapter.DetectorAdapter, "function");
    assert.strictEqual(typeof context.SapienizeMockDetector.MockDetectorAdapter, "function");
    assert.strictEqual(typeof context.SapienizeDetectorSurrogate.prepareFeatureRows, "function");
  });

  console.log("Detector suites green:", passes, "tests");
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
