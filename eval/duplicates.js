"use strict";

const { canonicalRecordOrder, datasetFingerprint } = require("./dataset.js");

// Versioned, fixed policy: changing these values changes the audit protocol.
const DUPLICATE_POLICY = Object.freeze({
  version: 1,
  normalization: "NFKC_lowercase_unicode_words",
  method: "word_shingle_jaccard",
  shingleSize: 3,
  minimumTokens: 8,
  threshold: 0.8
});

function textFeatures(text) {
  const normalized = text.normalize("NFKC").toLowerCase();
  const tokens = normalized.match(/[\p{L}\p{M}\p{N}]+/gu) || [];
  // Preserve punctuation-only input instead of treating every such text as equal.
  const key = tokens.length ? JSON.stringify(tokens) : normalized.replace(/\s+/gu, " ").trim();
  const shingles = new Set();
  if (tokens.length >= DUPLICATE_POLICY.minimumTokens) {
    for (let index = 0; index <= tokens.length - DUPLICATE_POLICY.shingleSize; index += 1) {
      shingles.add(JSON.stringify(tokens.slice(index, index + DUPLICATE_POLICY.shingleSize)));
    }
  }
  return { key, shingles, tokenCount: tokens.length };
}

/** Local deterministic audit. Splits are assigned by the manifest layer. */
function auditDuplicates(records, splitForRecord) {
  const ordered = canonicalRecordOrder(records);
  const assignments = splitForRecord || new Map();
  const features = ordered.map(record => textFeatures(record.text));
  const exactIndex = new Map();
  const shingleIndex = new Map();
  const pairs = [];
  let comparedPairCount = 0;

  ordered.forEach((record, index) => {
    const feature = features[index];
    const exactMatches = new Set(exactIndex.get(feature.key) || []);
    const intersections = new Map();
    // An inverted index skips disjoint documents without approximating similarity.
    for (const shingle of feature.shingles) {
      for (const previous of shingleIndex.get(shingle) || []) {
        intersections.set(previous, (intersections.get(previous) || 0) + 1);
      }
    }
    const candidates = new Set([...exactMatches, ...intersections.keys()]);
    for (const previous of Array.from(candidates).sort((a, b) => a - b)) {
      comparedPairCount += 1;
      const exact = exactMatches.has(previous);
      const intersection = intersections.get(previous) || 0;
      const union = feature.shingles.size + features[previous].shingles.size - intersection;
      const similarity = exact ? 1 : intersection / union;
      if (!exact && similarity < DUPLICATE_POLICY.threshold) continue;
      const left = ordered[previous].id;
      const right = record.id;
      const leftSplit = assignments.get(left) || null;
      const rightSplit = assignments.get(right) || null;
      pairs.push({
        recordIds: [left, right],
        kind: exact ? "normalized_exact" : "near_duplicate",
        similarity,
        splits: [leftSplit, rightSplit],
        crossesSplits: leftSplit !== null && rightSplit !== null && leftSplit !== rightSplit
      });
    }
    if (!exactIndex.has(feature.key)) exactIndex.set(feature.key, []);
    exactIndex.get(feature.key).push(index);
    for (const shingle of feature.shingles) {
      if (!shingleIndex.has(shingle)) shingleIndex.set(shingle, []);
      shingleIndex.get(shingle).push(index);
    }
  });
  pairs.sort((a, b) => a.recordIds[0] < b.recordIds[0] ? -1 : a.recordIds[0] > b.recordIds[0] ? 1 :
    a.recordIds[1] < b.recordIds[1] ? -1 : a.recordIds[1] > b.recordIds[1] ? 1 : 0);
  const crossSplitPairCount = pairs.filter(pair => pair.crossesSplits).length;
  return {
    schemaVersion: 1,
    status: crossSplitPairCount ? "fail" : pairs.length ? "review" : "pass",
    policy: Object.assign({}, DUPLICATE_POLICY),
    datasetFingerprint: datasetFingerprint(ordered),
    recordCount: ordered.length,
    comparedPairCount,
    crossSplitPairCount,
    withinSplitPairCount: pairs.filter(pair => pair.splits[0] !== null && !pair.crossesSplits).length,
    shortRecordIds: ordered.filter((_record, index) => features[index].tokenCount < DUPLICATE_POLICY.minimumTokens)
      .map(record => record.id),
    pairs,
    limitations: [
      "Heuristic lexical audit; a pass does not prove absence of leakage or semantic paraphrases.",
      "Texts below eight Unicode word tokens receive normalized exact checks only; unsegmented languages may have limited coverage.",
      "Common boilerplate can cause matches; inspect same-split matches and keep related documents together.",
      "The inverted index avoids disjoint pairs but highly repetitive corpora can still require quadratic work."
    ]
  };
}

module.exports = { DUPLICATE_POLICY, auditDuplicates };
