"use strict";

/**
 * Versioned governance manifests for evaluation datasets.
 *
 * A manifest records where data came from, how it may be used, its edit
 * lineage, and immutable split assignments. It is deliberately separate from
 * the record schema so existing JSON/JSONL datasets remain valid.
 */

const fs = require("fs");
const crypto = require("crypto");
const {
  AI_INVOLVED_SOURCE_TYPES,
  DatasetValidationError,
  isPlainObject,
  validateRecords
} = require("./schema.js");
const { datasetFingerprint } = require("./dataset.js");

const DATASET_MANIFEST_SCHEMA_VERSION = 1;
const CONSENT_STATUSES = Object.freeze([
  "explicit",
  "contributed_for_evaluation",
  "license_authorized",
  "not_applicable_synthetic",
  "not_applicable_public_domain",
  "unknown"
]);
const PRIVACY_CLASSIFICATIONS = Object.freeze([
  "public",
  "restricted",
  "confidential",
  "private_local"
]);
const LINEAGE_ACTOR_TYPES = Object.freeze(["human", "ai", "tool", "mixed"]);
const REDISTRIBUTION_STATUSES = Object.freeze(["permitted", "conditional", "prohibited"]);
const LEAKAGE_GROUP_KEYS = Object.freeze([
  "author_group",
  "model_group",
  "lineage_group",
  "source_document_group"
]);
const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

const MANIFEST_FIELDS = Object.freeze([
  "schema_version", "dataset", "sources", "records", "split_policy", "splits"
]);
const DATASET_FIELDS = Object.freeze([
  "id", "version", "description", "record_count", "fingerprint"
]);
const SOURCE_FIELDS = Object.freeze([
  "id", "license", "consent", "collection", "privacy", "rights"
]);
const RECORD_REQUIRED_FIELDS = Object.freeze([
  "id", "source_id", "domain", "language", "lineage_group", "source_document_group", "lineage"
]);
const RECORD_OPTIONAL_FIELDS = Object.freeze([
  "author_group", "model_group", "generation"
]);

class DatasetManifestValidationError extends DatasetValidationError {
  constructor(message, context) {
    super(message, context);
    this.name = "DatasetManifestValidationError";
  }
}

function fail(message, context) {
  throw new DatasetManifestValidationError(message, context);
}

function validateNonEmptyString(value, path, context) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail("`" + path + "` must be a non-empty string", context);
  }
}

function validateJsonValue(value, path, context, ancestors) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("`" + path + "` must contain only finite numbers", context);
    return;
  }
  if (typeof value !== "object") fail("`" + path + "` must contain only JSON values", context);
  if (ancestors.has(value)) fail("`" + path + "` must not contain circular references", context);

  let array;
  let prototype;
  let names;
  let symbols;
  try {
    array = Array.isArray(value);
    prototype = Object.getPrototypeOf(value);
    names = Object.getOwnPropertyNames(value);
    symbols = Object.getOwnPropertySymbols(value);
  } catch (_error) {
    fail("`" + path + "` could not be safely inspected", context);
  }
  if (symbols.length) fail("`" + path + "` must not contain symbol properties", context);

  ancestors.add(value);
  if (array) {
    if (prototype !== Array.prototype) fail("`" + path + "` must use the standard Array prototype", context);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!lengthDescriptor || !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value") ||
        !Number.isInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) {
      fail("`" + path + "` must have a standard array length", context);
    }
    const length = lengthDescriptor.value;
    if (names.length !== length + 1 || !names.includes("length")) {
      fail("`" + path + "` must not contain sparse arrays or extra properties", context);
    }
    for (let index = 0; index < length; index += 1) {
      const key = String(index);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor) fail("`" + path + "` must not contain sparse arrays", context);
      if (!descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        fail("`" + path + "[" + index + "]` must be an enumerable data property", context);
      }
      validateJsonValue(descriptor.value, path + "[" + index + "]", context, ancestors);
    }
  } else {
    if (prototype !== Object.prototype && prototype !== null) {
      fail("`" + path + "` must contain plain JSON objects", context);
    }
    for (const key of names) {
      if (UNSAFE_KEYS.has(key)) fail("`" + path + "` contains unsafe key `" + key + "`", context);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        fail("`" + path + "." + key + "` must be an enumerable data property", context);
      }
      validateJsonValue(descriptor.value, path + "." + key, context, ancestors);
    }
  }
  ancestors.delete(value);
}

function validateAllowedFields(value, required, optional, path, context) {
  if (!isPlainObject(value)) fail("`" + path + "` must be a plain object", context);
  const allowed = new Set(required.concat(optional || []));
  const unknown = Object.keys(value).filter(key => !allowed.has(key)).sort();
  if (unknown.length) {
    fail("`" + path + "` has unknown field" + (unknown.length === 1 ? "" : "s") + ": " + unknown.join(", "), context);
  }
  for (const field of required) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) {
      fail("`" + path + "` is missing required field `" + field + "`", context);
    }
  }
}

function validateStringArray(value, path, context) {
  if (!Array.isArray(value) || value.length === 0) {
    fail("`" + path + "` must be a non-empty array", context);
  }
  const seen = new Set();
  value.forEach((item, index) => {
    validateNonEmptyString(item, path + "[" + index + "]", context);
    if (seen.has(item)) fail("`" + path + "` must not contain duplicate `" + item + "`", context);
    seen.add(item);
  });
}

function validateFingerprint(fingerprint, context) {
  validateAllowedFields(fingerprint, ["algorithm", "value"], [], "dataset.fingerprint", context);
  if (fingerprint.algorithm !== "sha256") fail("`dataset.fingerprint.algorithm` must be `sha256`", context);
  if (typeof fingerprint.value !== "string" || !/^[a-f0-9]{64}$/.test(fingerprint.value)) {
    fail("`dataset.fingerprint.value` must be a lowercase SHA-256 digest", context);
  }
}

function validateSource(source, index, context) {
  const prefix = "sources[" + index + "]";
  validateAllowedFields(source, SOURCE_FIELDS, [], prefix, context);
  validateNonEmptyString(source.id, prefix + ".id", context);

  validateAllowedFields(source.license, ["identifier", "scope"], ["url"], prefix + ".license", context);
  validateNonEmptyString(source.license.identifier, prefix + ".license.identifier", context);
  validateNonEmptyString(source.license.scope, prefix + ".license.scope", context);
  if (Object.prototype.hasOwnProperty.call(source.license, "url")) {
    validateNonEmptyString(source.license.url, prefix + ".license.url", context);
    let parsed;
    try { parsed = new URL(source.license.url); }
    catch (_error) { fail("`" + prefix + ".license.url` must be an absolute URL", context); }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      fail("`" + prefix + ".license.url` must use HTTP or HTTPS", context);
    }
  }

  validateAllowedFields(source.consent, ["status", "basis"], [], prefix + ".consent", context);
  if (!CONSENT_STATUSES.includes(source.consent.status)) {
    fail("`" + prefix + ".consent.status` must be one of: " + CONSENT_STATUSES.join(", "), context);
  }
  validateNonEmptyString(source.consent.basis, prefix + ".consent.basis", context);

  validateAllowedFields(
    source.rights,
    ["permitted_uses", "redistribution", "attribution", "withdrawal"],
    [],
    prefix + ".rights",
    context
  );
  validateStringArray(source.rights.permitted_uses, prefix + ".rights.permitted_uses", context);
  if (!source.rights.permitted_uses.includes("evaluation")) {
    fail("`" + prefix + ".rights.permitted_uses` must include `evaluation`", context);
  }
  validateAllowedFields(
    source.rights.redistribution,
    ["status", "conditions"],
    [],
    prefix + ".rights.redistribution",
    context
  );
  if (!REDISTRIBUTION_STATUSES.includes(source.rights.redistribution.status)) {
    fail(
      "`" + prefix + ".rights.redistribution.status` must be one of: " + REDISTRIBUTION_STATUSES.join(", "),
      context
    );
  }
  validateNonEmptyString(
    source.rights.redistribution.conditions,
    prefix + ".rights.redistribution.conditions",
    context
  );
  validateAllowedFields(
    source.rights.attribution,
    ["required", "instructions"],
    [],
    prefix + ".rights.attribution",
    context
  );
  if (typeof source.rights.attribution.required !== "boolean") {
    fail("`" + prefix + ".rights.attribution.required` must be a boolean", context);
  }
  validateNonEmptyString(source.rights.attribution.instructions, prefix + ".rights.attribution.instructions", context);
  validateAllowedFields(
    source.rights.withdrawal,
    ["supported", "handling"],
    [],
    prefix + ".rights.withdrawal",
    context
  );
  if (typeof source.rights.withdrawal.supported !== "boolean") {
    fail("`" + prefix + ".rights.withdrawal.supported` must be a boolean", context);
  }
  validateNonEmptyString(source.rights.withdrawal.handling, prefix + ".rights.withdrawal.handling", context);

  validateAllowedFields(source.collection, ["method", "description"], [], prefix + ".collection", context);
  validateNonEmptyString(source.collection.method, prefix + ".collection.method", context);
  validateNonEmptyString(source.collection.description, prefix + ".collection.description", context);

  validateAllowedFields(
    source.privacy,
    ["classification", "contains_personal_data", "storage", "handling"],
    [],
    prefix + ".privacy",
    context
  );
  if (!PRIVACY_CLASSIFICATIONS.includes(source.privacy.classification)) {
    fail("`" + prefix + ".privacy.classification` must be one of: " + PRIVACY_CLASSIFICATIONS.join(", "), context);
  }
  if (typeof source.privacy.contains_personal_data !== "boolean") {
    fail("`" + prefix + ".privacy.contains_personal_data` must be a boolean", context);
  }
  validateNonEmptyString(source.privacy.storage, prefix + ".privacy.storage", context);
  validateNonEmptyString(source.privacy.handling, prefix + ".privacy.handling", context);
  if (source.privacy.classification === "private_local" && source.privacy.storage !== "eval/.local/") {
    fail("private-local sources must use `eval/.local/` storage", context);
  }
}

function validateManifestRecord(record, index, sourceIds, context) {
  const prefix = "records[" + index + "]";
  validateAllowedFields(record, RECORD_REQUIRED_FIELDS, RECORD_OPTIONAL_FIELDS, prefix, context);
  validateNonEmptyString(record.id, prefix + ".id", context);
  validateNonEmptyString(record.source_id, prefix + ".source_id", context);
  if (!sourceIds.has(record.source_id)) {
    fail("`" + prefix + ".source_id` references unknown source `" + record.source_id + "`", context);
  }
  validateNonEmptyString(record.domain, prefix + ".domain", context);
  validateNonEmptyString(record.language, prefix + ".language", context);
  if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(record.language)) {
    fail("`" + prefix + ".language` must be a BCP 47-style language tag", context);
  }

  for (const groupKey of LEAKAGE_GROUP_KEYS) {
    if (Object.prototype.hasOwnProperty.call(record, groupKey)) {
      validateNonEmptyString(record[groupKey], prefix + "." + groupKey, context);
    }
  }

  if (!Array.isArray(record.lineage) || record.lineage.length === 0) {
    fail("`" + prefix + ".lineage` must be a non-empty array", context);
  }
  record.lineage.forEach((stage, stageIndex) => {
    const stagePath = prefix + ".lineage[" + stageIndex + "]";
    validateAllowedFields(stage, ["sequence", "actor_type", "operation"], ["description"], stagePath, context);
    if (stage.sequence !== stageIndex + 1) {
      fail("`" + stagePath + ".sequence` must be " + (stageIndex + 1), context);
    }
    if (!LINEAGE_ACTOR_TYPES.includes(stage.actor_type)) {
      fail("`" + stagePath + ".actor_type` must be one of: " + LINEAGE_ACTOR_TYPES.join(", "), context);
    }
    validateNonEmptyString(stage.operation, stagePath + ".operation", context);
    if (Object.prototype.hasOwnProperty.call(stage, "description")) {
      validateNonEmptyString(stage.description, stagePath + ".description", context);
    }
  });

  if (Object.prototype.hasOwnProperty.call(record, "generation")) {
    validateAllowedFields(record.generation, ["provider", "model", "version"], [], prefix + ".generation", context);
    for (const field of ["provider", "model", "version"]) {
      validateNonEmptyString(record.generation[field], prefix + ".generation." + field, context);
    }
  }
}

function validateSplitPolicy(policy, context) {
  validateAllowedFields(policy, ["frozen", "assignment", "leakage_group_keys"], [], "split_policy", context);
  if (policy.frozen !== true) fail("`split_policy.frozen` must be true", context);
  if (policy.assignment !== "exactly_once") fail("`split_policy.assignment` must be `exactly_once`", context);
  validateStringArray(policy.leakage_group_keys, "split_policy.leakage_group_keys", context);
  const unknown = policy.leakage_group_keys.filter(key => !LEAKAGE_GROUP_KEYS.includes(key));
  if (unknown.length) {
    fail("`split_policy.leakage_group_keys` contains unsupported key `" + unknown[0] + "`", context);
  }
  const missing = LEAKAGE_GROUP_KEYS.filter(key => !policy.leakage_group_keys.includes(key));
  if (missing.length) fail("`split_policy.leakage_group_keys` must include " + missing.join(" and "), context);
}

function validateStructure(manifest, context) {
  validateJsonValue(manifest, "manifest", context, new Set());
  validateAllowedFields(manifest, MANIFEST_FIELDS, [], "manifest", context);
  if (manifest.schema_version !== DATASET_MANIFEST_SCHEMA_VERSION) {
    fail("unsupported `schema_version`; expected " + DATASET_MANIFEST_SCHEMA_VERSION, context);
  }

  validateAllowedFields(manifest.dataset, DATASET_FIELDS, [], "dataset", context);
  validateNonEmptyString(manifest.dataset.id, "dataset.id", context);
  validateNonEmptyString(manifest.dataset.version, "dataset.version", context);
  validateNonEmptyString(manifest.dataset.description, "dataset.description", context);
  if (!Number.isInteger(manifest.dataset.record_count) || manifest.dataset.record_count < 1) {
    fail("`dataset.record_count` must be a positive integer", context);
  }
  validateFingerprint(manifest.dataset.fingerprint, context);

  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
    fail("`sources` must be a non-empty array", context);
  }
  const sourceIds = new Set();
  manifest.sources.forEach((source, index) => {
    validateSource(source, index, context);
    if (sourceIds.has(source.id)) fail("duplicate source id `" + source.id + "`", context);
    sourceIds.add(source.id);
  });

  if (!Array.isArray(manifest.records) || manifest.records.length === 0) {
    fail("`records` must be a non-empty array", context);
  }
  if (manifest.records.length !== manifest.dataset.record_count) {
    fail("`records` length must equal `dataset.record_count`", context);
  }
  const manifestRecords = new Map();
  manifest.records.forEach((record, index) => {
    validateManifestRecord(record, index, sourceIds, context);
    if (manifestRecords.has(record.id)) fail("duplicate manifest record id `" + record.id + "`", context);
    manifestRecords.set(record.id, record);
  });

  validateSplitPolicy(manifest.split_policy, context);
  if (!Array.isArray(manifest.splits) || manifest.splits.length === 0) {
    fail("`splits` must be a non-empty array", context);
  }
  const splitNames = new Set();
  const splitForRecord = new Map();
  manifest.splits.forEach((split, index) => {
    const prefix = "splits[" + index + "]";
    validateAllowedFields(split, ["name", "purpose", "record_ids"], [], prefix, context);
    validateNonEmptyString(split.name, prefix + ".name", context);
    validateNonEmptyString(split.purpose, prefix + ".purpose", context);
    if (splitNames.has(split.name)) fail("duplicate split name `" + split.name + "`", context);
    splitNames.add(split.name);
    validateStringArray(split.record_ids, prefix + ".record_ids", context);
    split.record_ids.forEach(id => {
      if (!manifestRecords.has(id)) fail("split `" + split.name + "` references unknown record `" + id + "`", context);
      if (splitForRecord.has(id)) {
        fail("record `" + id + "` is assigned to both `" + splitForRecord.get(id) + "` and `" + split.name + "`", context);
      }
      splitForRecord.set(id, split.name);
    });
  });
  const unassigned = Array.from(manifestRecords.keys()).filter(id => !splitForRecord.has(id)).sort();
  if (unassigned.length) {
    fail("unassigned manifest record" + (unassigned.length === 1 ? "" : "s") + ": " + unassigned.join(", "), context);
  }

  for (const groupKey of manifest.split_policy.leakage_group_keys) {
    const splitForGroup = new Map();
    manifest.records.forEach(record => {
      if (!Object.prototype.hasOwnProperty.call(record, groupKey)) return;
      const group = record[groupKey];
      const split = splitForRecord.get(record.id);
      if (splitForGroup.has(group) && splitForGroup.get(group) !== split) {
        fail(
          "`" + groupKey + "` `" + group + "` leaks across frozen splits `" +
            splitForGroup.get(group) + "` and `" + split + "`",
          context
        );
      }
      splitForGroup.set(group, split);
    });
  }
}

function validateDatasetBinding(manifest, records, context) {
  validateRecords(records, context);
  if (records.length !== manifest.dataset.record_count) {
    fail("dataset record count does not match the manifest", context);
  }
  const actualFingerprint = datasetFingerprint(records);
  if (actualFingerprint !== manifest.dataset.fingerprint.value) {
    fail("dataset fingerprint does not match the manifest", context);
  }

  const recordById = new Map(records.map(record => [record.id, record]));
  for (const annotation of manifest.records) {
    const record = recordById.get(annotation.id);
    if (!record) fail("manifest references missing dataset record `" + annotation.id + "`", context);
    if (record.domain !== undefined && record.domain !== annotation.domain) {
      fail("domain for `" + record.id + "` does not match the manifest", context);
    }
    if (record.author_id !== undefined && record.author_id !== annotation.author_group) {
      fail("author group for `" + record.id + "` does not match `author_id`", context);
    }

    const aiInvolved = AI_INVOLVED_SOURCE_TYPES.includes(record.source_type);
    const lineageHasAi = annotation.lineage.some(stage => stage.actor_type === "ai" || stage.actor_type === "mixed");
    if (aiInvolved) {
      if (!Object.prototype.hasOwnProperty.call(annotation, "model_group") ||
          !Object.prototype.hasOwnProperty.call(annotation, "generation")) {
        fail("AI-involved record `" + record.id + "` must declare model grouping and generation metadata", context);
      }
      if (!lineageHasAi) fail("AI-involved record `" + record.id + "` must include AI lineage", context);
      if (record.model !== undefined && record.model !== annotation.generation.model) {
        fail("model for `" + record.id + "` does not match the manifest", context);
      }
    } else if (lineageHasAi) {
      fail("human record `" + record.id + "` must not declare AI lineage", context);
    }
  }

  const splitForRecord = new Map();
  manifest.splits.forEach(split => split.record_ids.forEach(id => splitForRecord.set(id, split.name)));
  const firstByNormalizedText = new Map();
  for (const record of records) {
    const normalizedText = record.text.normalize("NFC").replace(/\s+/gu, " ").trim();
    const first = firstByNormalizedText.get(normalizedText);
    const split = splitForRecord.get(record.id);
    if (first && first.split !== split) {
      fail(
        "exact normalized duplicate text for `" + first.id + "` and `" + record.id +
          "` crosses frozen splits `" + first.split + "` and `" + split + "`",
        context
      );
    }
    if (!first) firstByNormalizedText.set(normalizedText, { id: record.id, split });
  }
}

function validateDatasetManifest(manifest, records, context) {
  const details = context || {};
  validateStructure(manifest, details);
  if (records !== undefined) validateDatasetBinding(manifest, records, details);
  return manifest;
}

function parseDatasetManifest(input, options) {
  const settings = options || {};
  if (typeof input !== "string" && !Buffer.isBuffer(input)) {
    throw new TypeError("manifest input must be a string or Buffer");
  }
  const source = settings.source || "dataset manifest";
  let manifest;
  try {
    manifest = JSON.parse(String(input).replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new DatasetManifestValidationError("invalid JSON: " + error.message, { source });
  }
  return validateDatasetManifest(manifest, settings.records, { source });
}

function loadDatasetManifest(filePath, options) {
  if (typeof filePath !== "string" || filePath.length === 0) {
    throw new TypeError("filePath must be a non-empty string");
  }
  const settings = Object.assign({}, options, { source: (options && options.source) || filePath });
  return parseDatasetManifest(fs.readFileSync(filePath, "utf8"), settings);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const output = {};
    for (const key of Object.keys(value).sort()) output[key] = canonicalize(value[key]);
    return output;
  }
  return value;
}

function datasetManifestFingerprint(manifest) {
  validateDatasetManifest(manifest);
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(manifest)), "utf8").digest("hex");
}

function selectDatasetSplit(records, manifest, splitName) {
  validateNonEmptyString(splitName, "splitName", {});
  validateDatasetManifest(manifest, records);
  const split = manifest.splits.find(candidate => candidate.name === splitName);
  if (!split) throw new RangeError("unknown dataset split `" + splitName + "`");
  const recordById = new Map(records.map(record => [record.id, record]));
  return split.record_ids.map(id => recordById.get(id));
}

module.exports = {
  DATASET_MANIFEST_SCHEMA_VERSION,
  CONSENT_STATUSES,
  PRIVACY_CLASSIFICATIONS,
  LINEAGE_ACTOR_TYPES,
  REDISTRIBUTION_STATUSES,
  LEAKAGE_GROUP_KEYS,
  DatasetManifestValidationError,
  validateDatasetManifest,
  validateManifest: validateDatasetManifest,
  parseDatasetManifest,
  loadDatasetManifest,
  datasetManifestFingerprint,
  selectDatasetSplit
};
