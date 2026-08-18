"use strict";

/**
 * Dataset schema for reproducible Sapienize evaluations.
 *
 * Validation is intentionally strict: required fields must be present, unknown
 * top-level fields are rejected, and metadata must contain JSON-safe values.
 */

const SOURCE_TYPES = Object.freeze([
  "human",
  "ai",
  "human_ai_polished",
  "ai_human_edited",
  "mixed"
]);

const AI_INVOLVED_SOURCE_TYPES = Object.freeze(SOURCE_TYPES.filter(type => type !== "human"));
const REQUIRED_FIELDS = Object.freeze(["id", "text", "source_type"]);
const OPTIONAL_FIELDS = Object.freeze(["model", "domain", "author_id", "metadata"]);
const ALLOWED_FIELDS = new Set(REQUIRED_FIELDS.concat(OPTIONAL_FIELDS));
const UNSAFE_METADATA_KEYS = new Set(["__proto__", "prototype", "constructor"]);

class DatasetValidationError extends TypeError {
  constructor(message, context) {
    const details = context || {};
    const location = [];
    if (details.source) location.push(String(details.source));
    if (Number.isInteger(details.line)) location.push("line " + details.line);
    if (Number.isInteger(details.index)) location.push("record " + details.index);
    super((location.length ? location.join(", ") + ": " : "") + message);
    this.name = "DatasetValidationError";
    if (details.source) this.source = details.source;
    if (Number.isInteger(details.line)) this.line = details.line;
    if (Number.isInteger(details.index)) this.index = details.index;
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function fail(message, context) {
  throw new DatasetValidationError(message, context);
}

function validateNonEmptyString(value, field, context) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail("`" + field + "` must be a non-empty string", context);
  }
}

function validateJsonValue(value, path, context, ancestors) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("`" + path + "` must contain only finite numbers", context);
    return;
  }
  if (typeof value !== "object") {
    fail("`" + path + "` must contain only JSON values", context);
  }
  if (ancestors.has(value)) fail("`" + path + "` must not contain circular references", context);

  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      validateJsonValue(value[index], path + "[" + index + "]", context, ancestors);
    }
  } else {
    if (!isPlainObject(value)) fail("`" + path + "` must contain plain JSON objects", context);
    for (const key of Object.keys(value)) {
      if (UNSAFE_METADATA_KEYS.has(key)) fail("`" + path + "` contains unsafe key `" + key + "`", context);
      validateJsonValue(value[key], path + "." + key, context, ancestors);
    }
  }
  ancestors.delete(value);
}

function validateRecord(record, context) {
  const details = context || {};
  if (!isPlainObject(record)) fail("dataset record must be a plain object", details);

  const unknown = Object.keys(record).filter(key => !ALLOWED_FIELDS.has(key)).sort();
  if (unknown.length) fail("unknown field" + (unknown.length === 1 ? "" : "s") + ": " + unknown.join(", "), details);

  for (const field of REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) fail("missing required field `" + field + "`", details);
  }

  validateNonEmptyString(record.id, "id", details);
  validateNonEmptyString(record.text, "text", details);
  if (!SOURCE_TYPES.includes(record.source_type)) {
    fail("`source_type` must be one of: " + SOURCE_TYPES.join(", "), details);
  }

  for (const field of ["model", "domain", "author_id"]) {
    if (Object.prototype.hasOwnProperty.call(record, field)) {
      validateNonEmptyString(record[field], field, details);
    }
  }

  if (Object.prototype.hasOwnProperty.call(record, "metadata")) {
    if (!isPlainObject(record.metadata)) fail("`metadata` must be a plain object", details);
    validateJsonValue(record.metadata, "metadata", details, new Set());
  }

  return record;
}

function validateRecords(records, context) {
  const details = context || {};
  if (!Array.isArray(records)) fail("dataset must be an array of records", details);
  if (records.length === 0) fail("dataset must contain at least one record", details);

  const ids = new Map();
  records.forEach((record, index) => {
    const recordContext = Object.assign({}, details, { index });
    validateRecord(record, recordContext);
    if (ids.has(record.id)) {
      fail("duplicate `id` `" + record.id + "` (first seen at record " + ids.get(record.id) + ")", recordContext);
    }
    ids.set(record.id, index);
  });
  return records;
}

function hasAiParticipation(record, positiveSourceTypes) {
  validateRecord(record);
  const positive = positiveSourceTypes === undefined
    ? AI_INVOLVED_SOURCE_TYPES
    : Array.from(positiveSourceTypes);
  for (const type of positive) {
    if (!SOURCE_TYPES.includes(type)) throw new TypeError("unknown positive source type `" + type + "`");
  }
  return positive.includes(record.source_type);
}

module.exports = {
  SOURCE_TYPES,
  AI_INVOLVED_SOURCE_TYPES,
  REQUIRED_FIELDS,
  OPTIONAL_FIELDS,
  DatasetValidationError,
  isPlainObject,
  validateRecord,
  validateDatasetRecord: validateRecord,
  validateRecords,
  validateDataset: validateRecords,
  hasAiParticipation
};
