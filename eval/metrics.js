"use strict";

const DEFAULT_CALIBRATION_BINS = 10;
const DOCUMENT_LENGTH_BUCKETS = Object.freeze([
  Object.freeze({ name: "short", minWords: 0, maxWords: 99 }),
  Object.freeze({ name: "medium", minWords: 100, maxWords: 499 }),
  Object.freeze({ name: "long", minWords: 500, maxWords: Infinity })
]);

function booleanLabel(value, label) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  throw new TypeError(label + " values must be booleans or 0/1");
}

function validatePairs(actual, predicted, predictedLabel) {
  if (!Array.isArray(actual) || !Array.isArray(predicted)) {
    throw new TypeError("actual and " + predictedLabel + " must be arrays");
  }
  if (actual.length !== predicted.length) {
    throw new RangeError("actual and " + predictedLabel + " must have the same length");
  }
}

function confusionMatrix(actual, predicted) {
  validatePairs(actual, predicted, "predicted");
  const matrix = { tp: 0, tn: 0, fp: 0, fn: 0, total: actual.length };
  for (let index = 0; index < actual.length; index += 1) {
    const truth = booleanLabel(actual[index], "actual");
    const guess = booleanLabel(predicted[index], "predicted");
    if (truth && guess) matrix.tp += 1;
    else if (!truth && !guess) matrix.tn += 1;
    else if (!truth && guess) matrix.fp += 1;
    else matrix.fn += 1;
  }
  return matrix;
}

function isMatrix(value) {
  return value && ["tp", "tn", "fp", "fn"].every(key => Number.isInteger(value[key]) && value[key] >= 0);
}

function divide(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

function classificationMetrics(actualOrMatrix, predicted) {
  const matrix = isMatrix(actualOrMatrix)
    ? Object.assign({}, actualOrMatrix)
    : confusionMatrix(actualOrMatrix, predicted);
  matrix.total = matrix.tp + matrix.tn + matrix.fp + matrix.fn;
  return {
    confusionMatrix: matrix,
    accuracy: divide(matrix.tp + matrix.tn, matrix.total),
    precision: divide(matrix.tp, matrix.tp + matrix.fp),
    recall: divide(matrix.tp, matrix.tp + matrix.fn),
    f1: divide(2 * matrix.tp, 2 * matrix.tp + matrix.fp + matrix.fn),
    falsePositiveRate: divide(matrix.fp, matrix.fp + matrix.tn),
    falseNegativeRate: divide(matrix.fn, matrix.fn + matrix.tp)
  };
}

function validateNumericScores(scores, label, probability) {
  return scores.map((value, index) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError(label + "[" + index + "] must be a finite number");
    }
    if (probability && (value < 0 || value > 1)) {
      throw new RangeError(label + "[" + index + "] must be between 0 and 1");
    }
    return value;
  });
}

/** Returns null when ROC-AUC is undefined because either class is absent. */
function rocAuc(actual, scores) {
  validatePairs(actual, scores, "scores");
  const labels = actual.map(value => booleanLabel(value, "actual"));
  const numericScores = validateNumericScores(scores, "scores", false);
  const positives = labels.filter(Boolean).length;
  const negatives = labels.length - positives;
  if (positives === 0 || negatives === 0) return null;

  const ranked = numericScores.map((score, index) => ({ score, positive: labels[index] }));
  ranked.sort((left, right) => left.score - right.score);
  let positiveRankSum = 0;
  let start = 0;
  while (start < ranked.length) {
    let end = start + 1;
    while (end < ranked.length && ranked[end].score === ranked[start].score) end += 1;
    const averageRank = ((start + 1) + end) / 2;
    for (let index = start; index < end; index += 1) {
      if (ranked[index].positive) positiveRankSum += averageRank;
    }
    start = end;
  }
  return (positiveRankSum - positives * (positives + 1) / 2) / (positives * negatives);
}

/**
 * Expected calibration error for probabilities of the positive (AI-involved)
 * class. This function does not decide whether inputs are calibrated; the
 * evaluator calls it only for explicitly calibrated probabilities.
 */
function expectedCalibrationError(actual, probabilities, options) {
  validatePairs(actual, probabilities, "probabilities");
  if (actual.length === 0) return null;
  const labels = actual.map(value => booleanLabel(value, "actual"));
  const values = validateNumericScores(probabilities, "probabilities", true);
  const requestedBins = typeof options === "number" ? options : options && options.bins;
  const bins = requestedBins === undefined ? DEFAULT_CALIBRATION_BINS : requestedBins;
  if (!Number.isInteger(bins) || bins < 1) throw new RangeError("bins must be a positive integer");

  const totals = Array.from({ length: bins }, () => ({ count: 0, probability: 0, positives: 0 }));
  values.forEach((probability, index) => {
    const binIndex = Math.min(bins - 1, Math.floor(probability * bins));
    const bin = totals[binIndex];
    bin.count += 1;
    bin.probability += probability;
    if (labels[index]) bin.positives += 1;
  });

  let error = 0;
  for (const bin of totals) {
    if (bin.count === 0) continue;
    const meanProbability = bin.probability / bin.count;
    const observedRate = bin.positives / bin.count;
    error += (bin.count / values.length) * Math.abs(meanProbability - observedRate);
  }
  return error;
}

function arithmeticMean(values) {
  if (!Array.isArray(values)) throw new TypeError("values must be an array");
  if (values.length === 0) return null;
  const numeric = validateNumericScores(values, "values", false);
  return numeric.reduce((total, value) => total + value, 0) / numeric.length;
}

function countWords(text) {
  if (typeof text !== "string") throw new TypeError("text must be a string");
  const words = text.trim().match(/\S+/g);
  return words ? words.length : 0;
}

function validateLengthBuckets(buckets) {
  if (!Array.isArray(buckets) || buckets.length === 0) {
    throw new TypeError("lengthBuckets must be a non-empty array");
  }
  let expectedMinimum = 0;
  const names = new Set();
  for (const bucket of buckets) {
    if (!bucket || typeof bucket.name !== "string" || !bucket.name.trim()) {
      throw new TypeError("each length bucket must have a non-empty name");
    }
    if (names.has(bucket.name)) throw new TypeError("length bucket names must be unique");
    if (bucket.minWords !== expectedMinimum ||
        (!Number.isInteger(bucket.maxWords) && bucket.maxWords !== Infinity) ||
        bucket.maxWords < bucket.minWords) {
      throw new RangeError("length buckets must be contiguous, ordered, and start at zero");
    }
    names.add(bucket.name);
    expectedMinimum = bucket.maxWords + 1;
  }
  if (buckets[buckets.length - 1].maxWords !== Infinity) {
    throw new RangeError("the final length bucket must end at Infinity");
  }
  return buckets;
}

function documentLengthBucket(text, buckets) {
  const selectedBuckets = buckets || DOCUMENT_LENGTH_BUCKETS;
  validateLengthBuckets(selectedBuckets);
  const words = countWords(text);
  const match = selectedBuckets.find(bucket => words >= bucket.minWords && words <= bucket.maxWords);
  return match.name;
}

module.exports = {
  DEFAULT_CALIBRATION_BINS,
  DOCUMENT_LENGTH_BUCKETS,
  confusionMatrix,
  classificationMetrics,
  rocAuc,
  expectedCalibrationError,
  calibrationError: expectedCalibrationError,
  arithmeticMean,
  countWords,
  validateLengthBuckets,
  documentLengthBucket
};
