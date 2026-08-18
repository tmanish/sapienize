"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DatasetValidationError, validateRecord, validateRecords } = require("./schema.js");

function parseJson(text, source) {
  let decoded;
  try {
    decoded = JSON.parse(text);
  } catch (error) {
    throw new DatasetValidationError("invalid JSON: " + error.message, { source });
  }
  const records = Array.isArray(decoded) ? decoded : [decoded];
  return validateRecords(records, { source });
}

function parseJsonLines(text, source) {
  const records = [];
  const recordLines = [];
  const lines = text.split(/\r?\n/);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex].trim();
    if (!line) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      throw new DatasetValidationError("invalid JSONL record: " + error.message, {
        source,
        line: lineIndex + 1
      });
    }
    validateRecord(record, { source, line: lineIndex + 1, index: records.length });
    records.push(record);
    recordLines.push(lineIndex + 1);
  }
  if (records.length === 0) {
    throw new DatasetValidationError("dataset must contain at least one record", { source });
  }

  const firstLineById = new Map();
  records.forEach((record, index) => {
    if (firstLineById.has(record.id)) {
      throw new DatasetValidationError(
        "duplicate `id` `" + record.id + "` (first seen at line " + firstLineById.get(record.id) + ")",
        { source, line: recordLines[index], index }
      );
    }
    firstLineById.set(record.id, recordLines[index]);
  });
  return records;
}

function normalizeFormat(format) {
  if (format === undefined || format === null || format === "auto") return "auto";
  const normalized = String(format).toLowerCase().replace(/^\./, "");
  if (normalized === "json") return "json";
  if (normalized === "jsonl" || normalized === "ndjson") return "jsonl";
  throw new TypeError("format must be `json`, `jsonl`, or `auto`");
}

function parseDataset(input, options) {
  const settings = options || {};
  if (typeof input !== "string" && !Buffer.isBuffer(input)) {
    throw new TypeError("dataset input must be a string or Buffer");
  }
  const source = settings.source || "dataset";
  const text = String(input).replace(/^\uFEFF/, "");
  let format = normalizeFormat(settings.format);

  if (format === "auto") {
    const trimmed = text.trim();
    if (trimmed.startsWith("[")) {
      format = "json";
    } else {
      try {
        const decoded = JSON.parse(trimmed);
        format = decoded && typeof decoded === "object" ? "json" : "jsonl";
      } catch (_error) {
        format = "jsonl";
      }
    }
  }
  return format === "json" ? parseJson(text, source) : parseJsonLines(text, source);
}

function loadDataset(filePath, options) {
  if (typeof filePath !== "string" || filePath.length === 0) {
    throw new TypeError("filePath must be a non-empty string");
  }
  const settings = Object.assign({}, options);
  if (!settings.format || settings.format === "auto") {
    const extension = path.extname(filePath).toLowerCase();
    if (extension === ".json") settings.format = "json";
    if (extension === ".jsonl" || extension === ".ndjson") settings.format = "jsonl";
  }
  settings.source = settings.source || filePath;
  return parseDataset(fs.readFileSync(filePath, "utf8"), settings);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) sorted[key] = canonicalize(value[key]);
    return sorted;
  }
  return value;
}

function canonicalRecordOrder(records) {
  validateRecords(records);
  return records.slice().sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

function datasetFingerprint(records) {
  const canonicalRecords = canonicalRecordOrder(records).map(canonicalize);
  return crypto.createHash("sha256").update(JSON.stringify(canonicalRecords), "utf8").digest("hex");
}

module.exports = {
  parseDataset,
  parseJsonDataset: parseJson,
  parseJsonLines,
  parseJsonlDataset: parseJsonLines,
  loadDataset,
  loadDatasetSync: loadDataset,
  canonicalRecordOrder,
  datasetFingerprint
};
