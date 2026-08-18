"use strict";

const assert = require("assert");
const path = require("path");
const {
  SOURCE_TYPES,
  DatasetValidationError,
  validateRecord,
  validateRecords
} = require("../eval/schema.js");
const { parseDataset, loadDataset, datasetFingerprint } = require("../eval/dataset.js");
const {
  confusionMatrix,
  classificationMetrics,
  rocAuc,
  expectedCalibrationError,
  documentLengthBucket
} = require("../eval/metrics.js");
const { evaluateDataset, evaluateDatasetAsync } = require("../eval/evaluator.js");
const { createDetectorObservation } = require("../src/detectors/adapter.js");

let failures = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log("PASS:", name);
  } catch (error) {
    failures += 1;
    console.error("FAIL:", name);
    console.error(error && error.stack || error);
  }
}

function close(actual, expected, tolerance) {
  assert.ok(Math.abs(actual - expected) <= (tolerance || 1e-12), actual + " != " + expected);
}

(async () => {
  await test("schema accepts every documented source type", () => {
    SOURCE_TYPES.forEach((sourceType, index) => validateRecord({
      id: "record-" + index,
      text: "Public synthetic evaluation text.",
      source_type: sourceType,
      metadata: { synthetic: true, nested: [null, 1, "ok"] }
    }));
  });

  await test("schema rejects unknown fields, bad enums, duplicate ids, and non-JSON metadata", () => {
    assert.throws(() => validateRecord({ id: "x", text: "text", source_type: "robot" }), DatasetValidationError);
    assert.throws(() => validateRecord({ id: "x", text: "text", source_type: "human", secret: true }), /unknown field/);
    assert.throws(() => validateRecord({ id: "x", text: "text", source_type: "human", metadata: { bad: Infinity } }), /finite/);
    assert.throws(() => validateRecords([
      { id: "same", text: "one", source_type: "human" },
      { id: "same", text: "two", source_type: "ai" }
    ]), /duplicate/);
  });

  await test("JSON and JSONL parsing are strict and deterministic", () => {
    const json = JSON.stringify([{ id: "one", text: "hello", source_type: "human" }]);
    const jsonl = "\n" + JSON.stringify({ id: "one", text: "hello", source_type: "human" }) + "\r\n";
    const fromJson = parseDataset(json, { format: "json" });
    const fromJsonl = parseDataset(jsonl, { format: "jsonl" });
    assert.deepStrictEqual(fromJson, fromJsonl);
    assert.strictEqual(datasetFingerprint(fromJson), datasetFingerprint(fromJson.slice().reverse()));
    assert.throws(() => parseDataset("{bad json}", { format: "jsonl", source: "inline" }), /inline, line 1/);
  });

  const fixturePath = path.join(__dirname, "..", "eval", "fixtures", "public-synthetic.jsonl");
  const records = loadDataset(fixturePath);

  await test("public fixture is synthetic, licensed, and covers all source types", () => {
    assert.strictEqual(records.length, 5);
    assert.deepStrictEqual(new Set(records.map(record => record.source_type)), new Set(SOURCE_TYPES));
    records.forEach(record => {
      assert.strictEqual(record.metadata.synthetic, true);
      assert.strictEqual(record.metadata.license, "CC0-1.0");
    });
  });

  await test("known confusion-matrix and classification values", () => {
    const matrix = confusionMatrix([true, true, false, false], [true, false, true, false]);
    assert.deepStrictEqual(matrix, { tp: 1, tn: 1, fp: 1, fn: 1, total: 4 });
    const metrics = classificationMetrics(matrix);
    close(metrics.precision, 0.5);
    close(metrics.recall, 0.5);
    close(metrics.f1, 0.5);
    close(metrics.falsePositiveRate, 0.5);
    close(metrics.falseNegativeRate, 0.5);
  });

  await test("known ROC-AUC and tied-score values", () => {
    close(rocAuc([false, false, true, true], [0.1, 0.4, 0.35, 0.8]), 0.75);
    close(rocAuc([false, true], [0.5, 0.5]), 0.5);
    assert.strictEqual(rocAuc([true, true], [0.1, 0.9]), null);
  });

  await test("known expected calibration error", () => {
    close(expectedCalibrationError([true, false, true, false], [0.9, 0.8, 0.2, 0.1], { bins: 2 }), 0.35);
  });

  await test("document-length buckets have exact boundaries", () => {
    assert.strictEqual(documentLengthBucket("word ".repeat(99)), "short");
    assert.strictEqual(documentLengthBucket("word ".repeat(100)), "medium");
    assert.strictEqual(documentLengthBucket("word ".repeat(499)), "medium");
    assert.strictEqual(documentLengthBucket("word ".repeat(500)), "long");
  });

  const observations = {
    "public-human-001": { predictedAi: false, aiScore: 0.1, calibratedProbability: 0.1, voiceSimilarity: 0.9, semanticPreservation: 1 },
    "public-ai-001": { predictedAi: true, aiScore: 0.9, calibratedProbability: 0.9, voiceSimilarity: 0.3, semanticPreservation: 0.95 },
    "public-polished-001": { predictedAi: true, aiScore: 0.8, calibratedProbability: 0.8, voiceSimilarity: 0.7, semanticPreservation: 0.9 },
    "public-edited-001": { predictedAi: false, aiScore: 0.4, calibratedProbability: 0.4, voiceSimilarity: 0.8, semanticPreservation: 0.85 },
    "public-mixed-001": { predictedAi: true, aiScore: 0.6 }
  };

  await test("evaluator returns known overall, grouped, voice, and semantic metrics", () => {
    const report = evaluateDataset(records, { observations });
    assert.deepStrictEqual(report.metrics.overall.confusionMatrix, { tp: 3, tn: 1, fp: 0, fn: 1, total: 5 });
    close(report.metrics.overall.precision, 1);
    close(report.metrics.overall.recall, 0.75);
    close(report.metrics.overall.f1, 6 / 7);
    close(report.metrics.overall.falsePositiveRate, 0);
    close(report.metrics.overall.falseNegativeRate, 0.25);
    close(report.metrics.overall.rocAuc, 1);
    close(report.metrics.calibrationError, 0.25);
    close(report.metrics.voiceSimilarity, 0.675);
    close(report.metrics.semanticPreservation, 0.925);
    assert.strictEqual(report.metrics.perDomain.personal_note.recordCount, 2);
    assert.strictEqual(report.metrics.perModel["fixture-model-b"].recordCount, 2);
    assert.strictEqual(report.metrics.perDocumentLength.short.recordCount, 5);
    assert.strictEqual(report.coverage.calibratedProbabilityCount, 4);
  });

  await test("calibration and optional aggregate metrics are honestly unavailable", () => {
    const report = evaluateDataset(records, {
      observations: Object.fromEntries(records.map(record => [record.id, { predictedAi: record.source_type !== "human" }]))
    });
    assert.strictEqual(report.metrics.calibrationError, null);
    assert.strictEqual(report.metrics.voiceSimilarity, null);
    assert.strictEqual(report.metrics.semanticPreservation, null);
    assert.strictEqual(report.metricAvailability.calibrationError.available, false);
    assert.match(report.metricAvailability.calibrationError.reason, /calibrated/);
  });

  await test("a generic legacy score is never interpreted as an AI probability", () => {
    const report = evaluateDataset([records[0]], { observations: { "public-human-001": { score: 99 } } });
    assert.strictEqual(report.coverage.predictionCount, 0);
    assert.strictEqual(report.metrics.overall.confusionMatrix, null);
    assert.strictEqual(report.metrics.overall.rocAuc, null);
  });

  await test("numeric scores require an explicit threshold before becoming classifications", () => {
    const withoutThreshold = evaluateDataset([records[1]], {
      observations: { "public-ai-001": { aiScore: 0.9 } }
    });
    assert.strictEqual(withoutThreshold.results[0].predictedAi, null);
    assert.strictEqual(withoutThreshold.results[0].predictionThreshold, null);
    assert.strictEqual(withoutThreshold.metrics.overall.rocAuc, null);

    const withThreshold = evaluateDataset([records[1]], {
      threshold: 0.5,
      observations: { "public-ai-001": { aiScore: 0.9, scoreScale: { min: 0, max: 1, higherMeans: "more AI-like" } } }
    });
    assert.strictEqual(withThreshold.results[0].predictedAi, true);
    assert.strictEqual(withThreshold.results[0].predictionThreshold, 0.5);
    assert.strictEqual(withThreshold.configuration.thresholdExplicit, true);
  });

  await test("external adapter observations bridge canonical normalized fields and retain metadata", () => {
    const selected = [records[0], records[1]];
    const external = Object.fromEntries(selected.map((record, index) => [record.id, createDetectorObservation({
      name: "Fixture Detector",
      version: "model-2026-08",
      date: "2026-08-17T12:30:00.000Z",
      raw: { vendorScore: index ? 91 : 8 },
      normalized: {
        predictedAi: index === 1,
        aiScore: index ? 0.91 : 0.08,
        scoreScale: { min: 0, max: 1, higherMeans: "more AI-like" },
        semantics: "Fixture Detector AI-likelihood score"
      }
    })]));
    const report = evaluateDataset(selected, { observations: external });
    assert.strictEqual(report.metrics.overall.accuracy, 1);
    assert.deepStrictEqual(report.configuration.externalDetector, {
      name: "Fixture Detector",
      version: "model-2026-08"
    });
    const aiResult = report.results.find(result => result.id === "public-ai-001");
    assert.strictEqual(aiResult.externalDetector.date, "2026-08-17T12:30:00.000Z");
    assert.deepStrictEqual(aiResult.externalObservation.raw, { vendorScore: 91 });
    assert.strictEqual(aiResult.scoreSemantics, "Fixture Detector AI-likelihood score");
    assert.deepStrictEqual(aiResult.scoreScale, { min: 0, max: 1, higherMeans: "more AI-like" });
  });

  await test("external observations remain JSON-safe through evaluator ingestion", () => {
    const normalizedUndefined = createDetectorObservation({
      name: "JSON Fixture",
      version: "1",
      date: "2026-08-17T00:00:00Z",
      raw: undefined,
      normalized: { predictedAi: false, semantics: "fixture verdict" }
    });
    assert.strictEqual(normalizedUndefined.raw, null);
    const roundTripped = JSON.parse(JSON.stringify(normalizedUndefined));
    const report = evaluateDataset([records[0]], {
      observations: { "public-human-001": roundTripped }
    });
    assert.strictEqual(report.results[0].externalObservation.raw, null);
    assert.strictEqual(report.metrics.overall.accuracy, 1);

    const rawUndefined = Object.assign({}, roundTripped, { raw: undefined });
    const nestedUndefined = Object.assign({}, roundTripped, { raw: { omitted: undefined } });
    const nonFiniteNormalized = Object.assign({}, roundTripped, {
      normalized: Object.assign({}, roundTripped.normalized, { vendorScore: Infinity })
    });
    assert.throws(() => evaluateDataset([records[0]], {
      observations: { "public-human-001": rawUndefined }
    }), /JSON-safe/);
    assert.throws(() => evaluateDataset([records[0]], {
      observations: { "public-human-001": nestedUndefined }
    }), /JSON-safe/);
    assert.throws(() => evaluateDataset([records[0]], {
      observations: { "public-human-001": nonFiniteNormalized }
    }), /JSON-safe/);

    const inheritedObservation = Object.create(roundTripped);
    inheritedObservation.raw = null;
    assert.deepStrictEqual(JSON.parse(JSON.stringify(inheritedObservation)), { raw: null });
    assert.throws(() => evaluateDataset([records[0]], {
      observations: { "public-human-001": inheritedObservation }
    }), /JSON-safe|own properties/);
    const inheritedNormalized = Object.create(roundTripped.normalized);
    const observationWithInheritedNormalized = Object.assign({}, roundTripped, { normalized: inheritedNormalized });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(inheritedNormalized)), {});
    assert.throws(() => evaluateDataset([records[0]], {
      observations: { "public-human-001": observationWithInheritedNormalized }
    }), /JSON-safe|own properties/);

    const inheritedRawPayload = Object.create({ vendorValue: 87 });
    const observationWithInheritedRaw = Object.assign({}, roundTripped, { raw: inheritedRawPayload });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(inheritedRawPayload)), {});
    assert.throws(() => evaluateDataset([records[0]], {
      observations: { "public-human-001": observationWithInheritedRaw }
    }), /JSON-safe/);
    const normalizedWithInheritedExtras = Object.assign(Object.create({ vendorValue: 87 }), {
      predictedAi: false,
      providerSpecific: true,
      semantics: "fixture verdict",
      calibrated: false
    });
    const observationWithInheritedNormalizedExtras = Object.assign({}, roundTripped, {
      normalized: normalizedWithInheritedExtras
    });
    assert.strictEqual(JSON.parse(JSON.stringify(normalizedWithInheritedExtras)).vendorValue, undefined);
    assert.throws(() => evaluateDataset([records[0]], {
      observations: { "public-human-001": observationWithInheritedNormalizedExtras }
    }), /JSON-safe/);

    const circularRaw = {};
    circularRaw.self = circularRaw;
    const circularObservation = Object.assign({}, roundTripped, { raw: circularRaw });
    assert.throws(() => evaluateDataset([records[0]], {
      observations: { "public-human-001": circularObservation }
    }), /JSON-safe/);
  });

  await test("an explicitly calibrated probability is also a ranked score without becoming an implicit label", () => {
    const selected = [records[0], records[1]];
    const external = Object.fromEntries(selected.map((record, index) => [record.id, createDetectorObservation({
      name: "Calibrated Fixture",
      version: "3",
      date: "2026-08-17T00:00:00Z",
      raw: { probability: index ? 0.9 : 0.1 },
      normalized: {
        calibratedProbability: index ? 0.9 : 0.1,
        semantics: "calibrated AI-involvement probability"
      },
      calibrated: true,
      limitations: ["Calibrated only on the synthetic fixture population."]
    })]));
    const report = evaluateDataset(selected, { observations: external });
    assert.strictEqual(report.metrics.overall.rocAuc, 1);
    close(report.metrics.calibrationError, 0.1);
    assert.strictEqual(report.coverage.predictionCount, 0);
    report.results.forEach(result => {
      assert.strictEqual(result.predictedAi, null);
      assert.deepStrictEqual(result.scoreScale, { min: 0, max: 1, higherMeans: "greater AI-involvement probability" });
    });
  });

  await test("contradictory external calibration metadata cannot produce ECE", () => {
    const selected = [records[0], records[1]];
    const observations = Object.fromEntries(selected.map((record, index) => {
      const observation = createDetectorObservation({
        name: "Contradictory Fixture",
        version: "1",
        date: "2026-08-17T00:00:00Z",
        raw: { probability: index ? 0.9 : 0.1 },
        normalized: { semantics: "uncalibrated vendor score" },
        calibrated: false
      });
      observation.normalized.calibratedProbability = index ? 0.9 : 0.1;
      return [record.id, observation];
    }));
    assert.throws(() => evaluateDataset(selected, { observations }), /requires calibrated: true/);
  });

  await test("external score thresholds are provider-declared and detector identities cannot be pooled", () => {
    const withoutThreshold = createDetectorObservation({
      name: "Fixture Detector", version: "1", date: "2026-08-17T00:00:00Z", raw: { value: 73 },
      normalized: { aiScore: 73, scoreScale: { min: 0, max: 100 }, semantics: "vendor percent-like scale" }
    });
    const unavailable = evaluateDataset([records[1]], { observations: { "public-ai-001": withoutThreshold } });
    assert.strictEqual(unavailable.results[0].predictedAi, null);

    const withThreshold = createDetectorObservation({
      name: "Fixture Detector", version: "1", date: "2026-08-17T00:00:00Z", raw: { value: 73 },
      normalized: { aiScore: 73, threshold: 50, scoreScale: { min: 0, max: 100 }, semantics: "vendor percent-like scale" }
    });
    const classified = evaluateDataset([records[1]], { observations: { "public-ai-001": withThreshold } });
    assert.strictEqual(classified.results[0].predictedAi, true);
    assert.strictEqual(classified.results[0].predictionThreshold, 50);

    const otherVersion = createDetectorObservation({
      name: "Fixture Detector", version: "2", date: "2026-08-17T00:00:00Z", raw: { value: 8 },
      normalized: { predictedAi: false, semantics: "version 2 verdict" }
    });
    assert.throws(() => evaluateDataset([records[0], records[1]], {
      observations: { "public-human-001": otherVersion, "public-ai-001": withThreshold }
    }), /different detector names or versions/);

    const incompatibleScale = createDetectorObservation({
      name: "Fixture Detector", version: "1", date: "2026-08-17T00:00:00Z", raw: { value: 0.08 },
      normalized: { aiScore: 0.08, scoreScale: { min: 0, max: 1 }, semantics: "fractional vendor scale" }
    });
    assert.throws(() => evaluateDataset([records[0], records[1]], {
      observations: { "public-human-001": incompatibleScale, "public-ai-001": withThreshold }
    }), /different score scales or semantics/);

    assert.throws(() => evaluateDataset([records[0], records[1]], {
      observations: { "public-human-001": { predictedAi: false }, "public-ai-001": withThreshold }
    }), /cannot be pooled with unidentified/);
  });

  await test("core-style 0-100 voice and semantic scores normalize for aggregation", () => {
    const report = evaluateDataset([records[0]], {
      observations: {
        "public-human-001": {
          predictedAi: false,
          voiceMatch: { score: 75 },
          semanticIntegrity: { score: 92 }
        }
      }
    });
    close(report.metrics.voiceSimilarity, 0.75);
    close(report.metrics.semanticPreservation, 0.92);
  });

  await test("analyzers are injected, seeded, and async analyzers run in canonical id order", async () => {
    const calls = [];
    const report = await evaluateDatasetAsync(records.slice(0, 2), {
      seed: "fixed-seed",
      analyzer: async (_text, record, context) => {
        calls.push([record.id, context.seed, context.index]);
        return { predictedAi: record.source_type !== "human", aiScore: record.source_type === "human" ? 0 : 1 };
      }
    });
    assert.deepStrictEqual(calls, [
      ["public-ai-001", "fixed-seed", 0],
      ["public-human-001", "fixed-seed", 1]
    ]);
    assert.strictEqual(report.metrics.overall.accuracy, 1);
  });

  await test("record order cannot change a report while the dataset fingerprint stays constant", () => {
    const selected = records.slice(0, 2);
    function analyzer(_text, record, context) {
      return {
        predictedAi: record.source_type !== "human",
        aiScore: record.source_type === "human" ? context.index / 10 : 1 - context.index / 10
      };
    }
    const forward = evaluateDataset(selected, { analyzer, seed: "order-safe" });
    const reversed = evaluateDataset(selected.slice().reverse(), { analyzer, seed: "order-safe" });
    assert.strictEqual(forward.dataset.fingerprint, reversed.dataset.fingerprint);
    assert.deepStrictEqual(forward, reversed);
    assert.deepStrictEqual(forward.results.map(result => result.id), ["public-ai-001", "public-human-001"]);
  });

  await test("grouped metrics safely retain prototype-like domain and model names", () => {
    const report = evaluateDataset([{
      id: "prototype-safe", text: "Synthetic text.", source_type: "human",
      domain: "__proto__", model: "constructor", metadata: { synthetic: true }
    }], { observations: { "prototype-safe": { predictedAi: false } } });
    assert.strictEqual(Object.prototype.hasOwnProperty.call(report.metrics.perDomain, "__proto__"), true);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(report.metrics.perModel, "constructor"), true);
    assert.strictEqual(report.metrics.perDomain.__proto__.recordCount, 1);
    assert.strictEqual(JSON.parse(JSON.stringify(report)).metrics.perDomain.__proto__.recordCount, 1);
  });

  await test("identical inputs produce deeply identical reports", () => {
    assert.deepStrictEqual(
      evaluateDataset(records, { observations, seed: 42 }),
      evaluateDataset(records, { observations, seed: 42 })
    );
  });

  process.exitCode = failures ? 1 : 0;
})();
