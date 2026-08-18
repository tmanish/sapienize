"use strict";

const { SOURCE_TYPES, AI_INVOLVED_SOURCE_TYPES } = require("./schema.js");
const { canonicalRecordOrder, datasetFingerprint } = require("./dataset.js");
const {
  DEFAULT_CALIBRATION_BINS,
  DOCUMENT_LENGTH_BUCKETS,
  classificationMetrics,
  rocAuc,
  expectedCalibrationError,
  arithmeticMean,
  documentLengthBucket,
  validateLengthBuckets
} = require("./metrics.js");

const UNSPECIFIED_GROUP = "(unspecified)";

function isJsonSafeValue(value) {
  function inspect(current, ancestors) {
    if (current === null || typeof current === "string" || typeof current === "boolean") return true;
    if (typeof current === "number") return Number.isFinite(current);
    if (!current || typeof current !== "object") return false;
    if (ancestors.includes(current)) return false;
    ancestors.push(current);
    const prototype = Object.getPrototypeOf(current);
    const names = Object.getOwnPropertyNames(current);
    const symbols = typeof Object.getOwnPropertySymbols === "function" ? Object.getOwnPropertySymbols(current) : [];
    if (symbols.length) { ancestors.pop(); return false; }
    if (Array.isArray(current)) {
      const lengthDescriptor = Object.getOwnPropertyDescriptor(current, "length");
      if (prototype !== Array.prototype || !lengthDescriptor ||
          !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value") ||
          !Number.isInteger(lengthDescriptor.value) || lengthDescriptor.value < 0 ||
          names.length !== lengthDescriptor.value + 1 || !names.includes("length")) {
        ancestors.pop();
        return false;
      }
      for (let index = 0; index < lengthDescriptor.value; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(current, index)) { ancestors.pop(); return false; }
        const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
        if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, "value") ||
            !inspect(descriptor.value, ancestors)) { ancestors.pop(); return false; }
      }
      ancestors.pop();
      return true;
    }
    if (prototype !== Object.prototype && prototype !== null) {
      ancestors.pop();
      return false;
    }
    for (const name of names) {
      const descriptor = Object.getOwnPropertyDescriptor(current, name);
      if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, "value") ||
          !inspect(descriptor.value, ancestors)) { ancestors.pop(); return false; }
    }
    ancestors.pop();
    return true;
  }
  try { return inspect(value, []); }
  catch (_) { return false; }
}

function firstDefined(object, paths) {
  for (const path of paths) {
    let value = object;
    let present = true;
    for (const key of path) {
      if (value === null || typeof value !== "object" || !Object.prototype.hasOwnProperty.call(value, key)) {
        present = false;
        break;
      }
      value = value[key];
    }
    if (present && value !== undefined && value !== null) return value;
  }
  return undefined;
}

function optionalFinite(value, name, bounds) {
  if (value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(name + " must be a finite number when supplied");
  }
  if (bounds && (value < bounds[0] || value > bounds[1])) {
    throw new RangeError(name + " must be between " + bounds[0] + " and " + bounds[1]);
  }
  return value;
}

function optionalSimilarity(value, name) {
  const numeric = optionalFinite(value, name, [0, 100]);
  if (numeric === null) return null;
  return numeric > 1 ? numeric / 100 : numeric;
}

function normalizePrediction(value) {
  if (value === undefined) return null;
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "ai" || normalized === "ai_involved") return true;
    if (normalized === "human") return false;
  }
  throw new TypeError("prediction must be a boolean, 0/1, `ai`, or `human`");
}

function normalizeScoreScale(value, name) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    if (!value.trim()) throw new TypeError(name + " must not be empty");
    return value;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(name + " must be a non-empty string or an object");
  }
  const hasMinimum = Object.prototype.hasOwnProperty.call(value, "min");
  const hasMaximum = Object.prototype.hasOwnProperty.call(value, "max");
  if (hasMinimum !== hasMaximum) throw new TypeError(name + " must provide both `min` and `max`");
  if (hasMinimum) {
    if (typeof value.min !== "number" || !Number.isFinite(value.min) ||
        typeof value.max !== "number" || !Number.isFinite(value.max) || value.max <= value.min) {
      throw new RangeError(name + " min/max must be finite numbers with max greater than min");
    }
  }
  if (Object.prototype.hasOwnProperty.call(value, "higherMeans") &&
      (typeof value.higherMeans !== "string" || !value.higherMeans.trim())) {
    throw new TypeError(name + ".higherMeans must be a non-empty string");
  }
  return value;
}

function assertWithinScale(value, scale, name) {
  if (value === null || !scale || typeof scale !== "object" ||
      !Object.prototype.hasOwnProperty.call(scale, "min")) return;
  if (value < scale.min || value > scale.max) {
    throw new RangeError(name + " must be within the declared score scale");
  }
}

function externalObservationIdentity(observation, id) {
  if (!observation || observation.kind !== "external_detector_observation") return null;
  if (!isJsonSafeValue(observation)) {
    throw new TypeError("external observation for `" + id + "` must contain only JSON-safe values");
  }
  const requiredFields = [
    "kind", "name", "version", "date", "raw", "normalized", "calibrated",
    "calibrationStatus", "limitations", "comparability"
  ];
  if (requiredFields.some(field => !Object.prototype.hasOwnProperty.call(observation, field))) {
    throw new TypeError("external observation for `" + id + "` must retain required fields as own properties");
  }
  if (typeof observation.name !== "string" || !observation.name.trim()) {
    throw new TypeError("external observation for `" + id + "` must contain a detector name");
  }
  if (typeof observation.version !== "string" || !observation.version.trim()) {
    throw new TypeError("external observation for `" + id + "` must contain a detector version or `unknown`");
  }
  if (typeof observation.date !== "string" || !observation.date.trim() || !Number.isFinite(Date.parse(observation.date))) {
    throw new TypeError("external observation for `" + id + "` must contain a valid observation date");
  }
  if (!Object.prototype.hasOwnProperty.call(observation, "raw") || observation.raw === undefined || !isJsonSafeValue(observation.raw)) {
    throw new TypeError("external observation for `" + id + "` must retain a JSON-safe raw result");
  }
  if (!observation.normalized || typeof observation.normalized !== "object" || Array.isArray(observation.normalized)) {
    throw new TypeError("external observation for `" + id + "` must contain a normalized representation");
  }
  if (!isJsonSafeValue(observation.normalized)) {
    throw new TypeError("external observation for `" + id + "` must contain a JSON-safe normalized representation");
  }
  if (!Object.prototype.hasOwnProperty.call(observation.normalized, "providerSpecific") ||
      !Object.prototype.hasOwnProperty.call(observation.normalized, "semantics")) {
    throw new TypeError("external observation for `" + id + "` must retain normalized fields as own properties");
  }
  if (observation.normalized.providerSpecific !== true || observation.comparability !== "provider_specific") {
    throw new TypeError("external observation for `" + id + "` must retain provider-specific semantics");
  }
  if (typeof observation.normalized.semantics !== "string" || !observation.normalized.semantics.trim()) {
    throw new TypeError("external observation for `" + id + "` must document its normalized semantics");
  }
  if (typeof observation.calibrated !== "boolean" ||
      typeof observation.calibrationStatus !== "string" || !observation.calibrationStatus.trim() ||
      !Array.isArray(observation.limitations) ||
      observation.limitations.some(item => typeof item !== "string" || !item.trim())) {
    throw new TypeError("external observation for `" + id + "` must retain calibration status and limitations");
  }
  const calibrationConsistent = (observation.calibrated === true && observation.calibrationStatus === "provider_declared") ||
    (observation.calibrated === false && observation.calibrationStatus === "not_calibrated");
  if (!calibrationConsistent ||
      (Object.prototype.hasOwnProperty.call(observation.normalized, "calibrated") &&
       observation.normalized.calibrated !== observation.calibrated)) {
    throw new TypeError("external observation for `" + id + "` has contradictory calibration metadata");
  }
  return {
    name: observation.name.trim(),
    version: observation.version.trim()
  };
}

/**
 * Normalize only explicitly named detector outputs. A generic `score` is not
 * consumed because Sapienize's legacy style score is not an AI probability.
 */
function normalizeObservation(id, observation, configuredThreshold) {
  if (observation === null || observation === undefined) observation = {};
  if (typeof observation === "boolean") observation = { predictedAi: observation };
  if (typeof observation !== "object" || Array.isArray(observation)) {
    throw new TypeError("observation for `" + id + "` must be an object or boolean");
  }
  if (observation.id !== undefined && observation.id !== id) {
    throw new TypeError("observation id `" + observation.id + "` does not match `" + id + "`");
  }

  const externalIdentity = externalObservationIdentity(observation, id);
  const external = externalIdentity !== null;
  const predictionValue = firstDefined(observation, external ? [
    ["normalized", "predictedAi"], ["normalized", "predicted_ai"]
  ] : [
    ["predictedAi"], ["predicted_ai"], ["prediction"], ["label"],
    ["detectorEstimate", "predictedAi"], ["detectorEstimate", "prediction"]
  ]);
  const scoreValue = firstDefined(observation, external ? [
    ["normalized", "aiScore"], ["normalized", "ai_score"]
  ] : [
    ["aiScore"], ["ai_score"], ["detectorEstimate", "aiScore"], ["detectorEstimate", "ai_score"]
  ]);
  const ordinaryProbability = firstDefined(observation, external ? [
    ["normalized", "aiProbability"], ["normalized", "ai_probability"], ["normalized", "probability"]
  ] : [
    ["aiProbability"], ["ai_probability"], ["probability"],
    ["detectorEstimate", "aiProbability"], ["detectorEstimate", "probability"]
  ]);
  const explicitCalibratedProbability = firstDefined(observation, external ? [
    ["normalized", "calibratedProbability"], ["normalized", "calibrated_probability"]
  ] : [
    ["calibratedProbability"], ["calibrated_probability"],
    ["detectorEstimate", "calibratedProbability"], ["detectorEstimate", "calibrated_probability"]
  ]);

  let aiScore = optionalFinite(scoreValue, "aiScore");
  const probability = optionalFinite(ordinaryProbability, "aiProbability", [0, 1]);
  const explicitCalibrated = optionalFinite(explicitCalibratedProbability, "calibratedProbability", [0, 1]);
  if (external && explicitCalibrated !== null && observation.calibrated !== true) {
    throw new TypeError("external calibratedProbability for `" + id + "` requires calibrated: true");
  }
  if (aiScore === null && probability !== null) aiScore = probability;
  if (aiScore === null && explicitCalibrated !== null) aiScore = explicitCalibrated;

  let calibratedProbability = explicitCalibrated;
  const declaredCalibrated = observation.calibrated === true ||
    Boolean(observation.detectorEstimate && observation.detectorEstimate.calibrated === true) ||
    Boolean(observation.normalized && observation.normalized.calibrated === true);
  if (calibratedProbability === null && declaredCalibrated && probability !== null) {
    calibratedProbability = probability;
  }

  const scoreScaleValue = firstDefined(observation, external ? [
    ["normalized", "scoreScale"], ["normalized", "score_scale"]
  ] : [
    ["scoreScale"], ["score_scale"], ["detectorEstimate", "scoreScale"]
  ]);
  let scoreScale = normalizeScoreScale(scoreScaleValue, "scoreScale");
  if (scoreScale === null && (probability !== null || calibratedProbability !== null)) {
    scoreScale = { min: 0, max: 1, higherMeans: "greater AI-involvement probability" };
  }
  assertWithinScale(aiScore, scoreScale, "aiScore");

  const observationThresholdValue = firstDefined(observation, external ? [
    ["normalized", "threshold"]
  ] : [
    ["threshold"], ["detectorEstimate", "threshold"]
  ]);
  const observationThreshold = optionalFinite(observationThresholdValue, "observation threshold");
  const normalizedConfiguredThreshold = configuredThreshold === null
    ? null
    : optionalFinite(configuredThreshold, "configured threshold");
  const appliedThreshold = observationThreshold !== null ? observationThreshold : normalizedConfiguredThreshold;
  assertWithinScale(appliedThreshold, scoreScale, "threshold");

  let predictedAi = normalizePrediction(predictionValue);
  let predictionThreshold = null;
  if (predictedAi === null && aiScore !== null && appliedThreshold !== null) {
    predictedAi = aiScore >= appliedThreshold;
    predictionThreshold = appliedThreshold;
  }

  const voiceValue = firstDefined(observation, [
    ["voiceSimilarity"], ["voice_similarity"], ["voiceMatch", "normalizedSimilarity"],
    ["voiceMatch", "similarity"], ["voiceMatch", "score"]
  ]);
  const semanticValue = firstDefined(observation, [
    ["semanticPreservation"], ["semantic_preservation"],
    ["semanticIntegrity", "preservation"], ["semanticIntegrity", "similarity"], ["semanticIntegrity", "score"]
  ]);

  return {
    predictedAi,
    aiScore,
    calibratedProbability,
    voiceSimilarity: optionalSimilarity(voiceValue, "voiceSimilarity"),
    semanticPreservation: optionalSimilarity(semanticValue, "semanticPreservation"),
    scoreScale,
    scoreSemantics: external ? observation.normalized.semantics : null,
    predictionThreshold,
    externalDetector: external ? {
      name: externalIdentity.name,
      version: externalIdentity.version,
      date: observation.date
    } : null,
    externalObservation: external ? observation : null
  };
}

function observationsToMap(observations) {
  const result = new Map();
  if (observations === undefined || observations === null) return result;

  if (observations instanceof Map) {
    for (const [id, observation] of observations) addObservation(result, String(id), observation);
    return result;
  }
  if (Array.isArray(observations)) {
    observations.forEach((observation, index) => {
      if (!observation || typeof observation.id !== "string" || !observation.id) {
        throw new TypeError("observations[" + index + "] must contain a non-empty `id`");
      }
      addObservation(result, observation.id, observation);
    });
    return result;
  }
  if (typeof observations === "object") {
    for (const id of Object.keys(observations)) addObservation(result, id, observations[id]);
    return result;
  }
  throw new TypeError("observations must be an array, object, or Map");
}

function addObservation(map, id, observation) {
  if (!id) throw new TypeError("observation id must be non-empty");
  if (map.has(id)) throw new TypeError("duplicate observation id `" + id + "`");
  map.set(id, observation);
}

function analyzerFunction(analyzer) {
  if (analyzer === undefined || analyzer === null) return null;
  if (typeof analyzer === "function") return analyzer;
  if (typeof analyzer.analyze === "function") return analyzer.analyze.bind(analyzer);
  throw new TypeError("analyzer must be a function or expose an `analyze` function");
}

function normalizeOptions(options) {
  const settings = options || {};
  const thresholdExplicit = Object.prototype.hasOwnProperty.call(settings, "threshold");
  const threshold = thresholdExplicit ? settings.threshold : null;
  if (thresholdExplicit && (typeof threshold !== "number" || !Number.isFinite(threshold))) {
    throw new TypeError("threshold must be a finite number when supplied");
  }
  const positiveSourceTypes = settings.positiveSourceTypes === undefined
    ? AI_INVOLVED_SOURCE_TYPES.slice()
    : Array.from(settings.positiveSourceTypes);
  if (new Set(positiveSourceTypes).size !== positiveSourceTypes.length) {
    throw new TypeError("positiveSourceTypes must not contain duplicates");
  }
  for (const type of positiveSourceTypes) {
    if (!SOURCE_TYPES.includes(type)) throw new TypeError("unknown positive source type `" + type + "`");
  }
  const calibrationBins = settings.calibrationBins === undefined
    ? DEFAULT_CALIBRATION_BINS
    : settings.calibrationBins;
  if (!Number.isInteger(calibrationBins) || calibrationBins < 1) {
    throw new RangeError("calibrationBins must be a positive integer");
  }
  const lengthBuckets = settings.lengthBuckets || DOCUMENT_LENGTH_BUCKETS;
  validateLengthBuckets(lengthBuckets);
  return {
    threshold,
    thresholdExplicit,
    positiveSourceTypes,
    calibrationBins,
    lengthBuckets,
    seed: settings.seed === undefined ? 0 : settings.seed,
    analyzer: analyzerFunction(settings.analyzer),
    providedObservations: observationsToMap(settings.observations)
  };
}

function verifyObservationIds(records, observationMap) {
  const recordIds = new Set(records.map(record => record.id));
  const unknown = Array.from(observationMap.keys()).filter(id => !recordIds.has(id)).sort();
  if (unknown.length) throw new TypeError("observations contain unknown id" + (unknown.length === 1 ? "" : "s") + ": " + unknown.join(", "));
}

function collectSync(records, settings) {
  const raw = new Map(settings.providedObservations);
  verifyObservationIds(records, raw);
  if (settings.analyzer) {
    records.forEach((record, index) => {
      if (raw.has(record.id)) return;
      const output = settings.analyzer(record.text, record, { seed: settings.seed, index });
      if (output && typeof output.then === "function") {
        throw new TypeError("analyzer returned a Promise; use `evaluateDatasetAsync`");
      }
      raw.set(record.id, output);
    });
  }
  return raw;
}

async function collectAsync(records, settings) {
  const raw = new Map(settings.providedObservations);
  verifyObservationIds(records, raw);
  if (settings.analyzer) {
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      if (!raw.has(record.id)) {
        raw.set(record.id, await settings.analyzer(record.text, record, { seed: settings.seed, index }));
      }
    }
  }
  return raw;
}

function availability(value, sampleCount, reason) {
  return value === null
    ? { available: false, sampleCount, reason }
    : { available: true, sampleCount };
}

function performanceForRows(rows) {
  const predictedRows = rows.filter(row => row.predictedAi !== null);
  const scoredRows = rows.filter(row => row.aiScore !== null);
  let result;
  if (predictedRows.length) {
    result = classificationMetrics(
      predictedRows.map(row => row.actualAi),
      predictedRows.map(row => row.predictedAi)
    );
  } else {
    result = {
      confusionMatrix: null,
      accuracy: null,
      precision: null,
      recall: null,
      f1: null,
      falsePositiveRate: null,
      falseNegativeRate: null
    };
  }
  const auc = rocAuc(
    scoredRows.map(row => row.actualAi),
    scoredRows.map(row => row.aiScore)
  );
  result.rocAuc = auc;
  result.recordCount = rows.length;
  result.predictionCount = predictedRows.length;
  result.scoreCount = scoredRows.length;

  const matrix = result.confusionMatrix;
  result.availability = {
    confusionMatrix: availability(matrix, predictedRows.length, "no predictions were supplied"),
    accuracy: availability(result.accuracy, predictedRows.length, "no predictions were supplied"),
    precision: availability(result.precision, predictedRows.length,
      matrix && matrix.tp + matrix.fp === 0 ? "no positive predictions" : "no predictions were supplied"),
    recall: availability(result.recall, predictedRows.length,
      matrix && matrix.tp + matrix.fn === 0 ? "no positive ground-truth records" : "no predictions were supplied"),
    f1: availability(result.f1, predictedRows.length, "no positive ground truth or predictions"),
    falsePositiveRate: availability(result.falsePositiveRate, predictedRows.length,
      matrix && matrix.fp + matrix.tn === 0 ? "no negative ground-truth records" : "no predictions were supplied"),
    falseNegativeRate: availability(result.falseNegativeRate, predictedRows.length,
      matrix && matrix.fn + matrix.tp === 0 ? "no positive ground-truth records" : "no predictions were supplied"),
    rocAuc: availability(auc, scoredRows.length,
      scoredRows.length === 0 ? "no AI-likelihood scores were supplied" : "ROC-AUC requires both ground-truth classes")
  };
  return result;
}

function groupRows(rows, valueForRow) {
  const groups = new Map();
  for (const row of rows) {
    const value = valueForRow(row);
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(row);
  }
  const result = {};
  const names = Array.from(groups.keys()).sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  for (const name of names) {
    Object.defineProperty(result, name, {
      value: performanceForRows(groups.get(name)),
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  return result;
}

function aggregate(rows, field) {
  const values = rows.map(row => row[field]).filter(value => value !== null);
  const value = arithmeticMean(values);
  return {
    value,
    availability: availability(value, values.length, "no " + field + " observations were supplied")
  };
}

function canonicalMetadata(value) {
  if (Array.isArray(value)) return value.map(canonicalMetadata);
  if (value && typeof value === "object") {
    const output = Object.create(null);
    for (const key of Object.keys(value).sort()) output[key] = canonicalMetadata(value[key]);
    return output;
  }
  return value;
}

function buildReport(records, settings, rawObservations) {
  const positive = new Set(settings.positiveSourceTypes);
  const detectorKeys = new Map();
  rawObservations.forEach((observation, id) => {
    const identity = externalObservationIdentity(observation, id);
    if (!identity) return;
    const key = JSON.stringify([identity.name, identity.version]);
    detectorKeys.set(key, identity);
  });
  if (detectorKeys.size > 1) {
    throw new TypeError("external detector observations from different detector names or versions must be evaluated separately");
  }
  const externalDetector = detectorKeys.size ? Array.from(detectorKeys.values())[0] : null;
  const rows = records.map(record => {
    const hasObservation = rawObservations.has(record.id) && rawObservations.get(record.id) !== undefined && rawObservations.get(record.id) !== null;
    const normalized = normalizeObservation(record.id, rawObservations.get(record.id), settings.threshold);
    return Object.assign({
      id: record.id,
      sourceType: record.source_type,
      domain: record.domain || UNSPECIFIED_GROUP,
      model: record.model || UNSPECIFIED_GROUP,
      documentLength: documentLengthBucket(record.text, settings.lengthBuckets),
      actualAi: positive.has(record.source_type),
      hasObservation
    }, normalized);
  });
  if (externalDetector && rows.some(row => !row.externalObservation &&
      (row.predictedAi !== null || row.aiScore !== null || row.calibratedProbability !== null))) {
    throw new TypeError("external detector observations cannot be pooled with unidentified detector measurements");
  }
  const externalScoreContracts = new Set(rows.filter(row => row.externalObservation && row.aiScore !== null)
    .map(row => JSON.stringify(canonicalMetadata({
      semantics: row.scoreSemantics,
      scale: row.scoreScale
    }))));
  if (externalScoreContracts.size > 1) {
    throw new TypeError("external detector observations with different score scales or semantics must be evaluated separately");
  }

  const calibratedRows = rows.filter(row => row.calibratedProbability !== null);
  const calibrationError = expectedCalibrationError(
    calibratedRows.map(row => row.actualAi),
    calibratedRows.map(row => row.calibratedProbability),
    { bins: settings.calibrationBins }
  );
  const voice = aggregate(rows, "voiceSimilarity");
  const semantic = aggregate(rows, "semanticPreservation");
  const missingObservationIds = rows.filter(row => !row.hasObservation).map(row => row.id).sort();
  const missingPredictionIds = rows.filter(row => row.predictedAi === null).map(row => row.id).sort();

  return {
    schemaVersion: 1,
    configuration: {
      threshold: settings.threshold,
      thresholdExplicit: settings.thresholdExplicit,
      externalDetector,
      recordOrder: "id_ascending",
      positiveSourceTypes: settings.positiveSourceTypes.slice(),
      calibrationBins: settings.calibrationBins,
      seed: settings.seed,
      documentLengthBuckets: settings.lengthBuckets.map(bucket => ({
        name: bucket.name,
        minWords: bucket.minWords,
        // null is the JSON-safe representation of an open-ended final bucket.
        maxWords: bucket.maxWords === Infinity ? null : bucket.maxWords
      }))
    },
    dataset: {
      recordCount: records.length,
      fingerprint: datasetFingerprint(records)
    },
    coverage: {
      observationCount: rows.length - missingObservationIds.length,
      predictionCount: rows.filter(row => row.predictedAi !== null).length,
      scoreCount: rows.filter(row => row.aiScore !== null).length,
      calibratedProbabilityCount: calibratedRows.length,
      voiceSimilarityCount: voice.availability.sampleCount,
      semanticPreservationCount: semantic.availability.sampleCount,
      missingObservationIds,
      missingPredictionIds
    },
    metrics: {
      overall: performanceForRows(rows),
      calibrationError,
      voiceSimilarity: voice.value,
      semanticPreservation: semantic.value,
      perDomain: groupRows(rows, row => row.domain),
      perModel: groupRows(rows, row => row.model),
      perDocumentLength: groupRows(rows, row => row.documentLength)
    },
    metricAvailability: {
      calibrationError: availability(calibrationError, calibratedRows.length,
        "no explicitly calibrated probabilities were supplied"),
      voiceSimilarity: voice.availability,
      semanticPreservation: semantic.availability
    },
    results: rows.map(row => ({
      id: row.id,
      sourceType: row.sourceType,
      actualAi: row.actualAi,
      predictedAi: row.predictedAi,
      aiScore: row.aiScore,
      calibratedProbability: row.calibratedProbability,
      voiceSimilarity: row.voiceSimilarity,
      semanticPreservation: row.semanticPreservation,
      scoreScale: row.scoreScale,
      scoreSemantics: row.scoreSemantics,
      predictionThreshold: row.predictionThreshold,
      externalDetector: row.externalDetector,
      externalObservation: row.externalObservation
    }))
  };
}

function evaluateDataset(records, options) {
  const orderedRecords = canonicalRecordOrder(records);
  const settings = normalizeOptions(options);
  return buildReport(orderedRecords, settings, collectSync(orderedRecords, settings));
}

async function evaluateDatasetAsync(records, options) {
  const orderedRecords = canonicalRecordOrder(records);
  const settings = normalizeOptions(options);
  return buildReport(orderedRecords, settings, await collectAsync(orderedRecords, settings));
}

class Evaluator {
  constructor(options) {
    this.options = Object.assign({}, options);
  }

  evaluate(records, options) {
    return evaluateDataset(records, Object.assign({}, this.options, options));
  }

  evaluateAsync(records, options) {
    return evaluateDatasetAsync(records, Object.assign({}, this.options, options));
  }
}

module.exports = {
  UNSPECIFIED_GROUP,
  normalizeObservation,
  evaluateDataset,
  evaluate: evaluateDataset,
  evaluateDatasetAsync,
  evaluateAsync: evaluateDatasetAsync,
  Evaluator
};
