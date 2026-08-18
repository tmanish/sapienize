(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SapienizeDetectorSurrogate = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  function words(text) {
    return String(text).toLowerCase().match(/[a-zà-öø-ÿ0-9]+(?:['’][a-zà-öø-ÿ0-9]+)*/g) || [];
  }

  function sentenceCount(text) {
    var trimmed = String(text).trim();
    if (!trimmed) return 0;
    var endings = trimmed.match(/[.!?]+(?=\s|$)/g);
    return endings && endings.length ? endings.length : 1;
  }

  function basicTextFeatures(text) {
    if (typeof text !== "string") throw new TypeError("text must be a string");
    var tokens = words(text);
    var unique = Object.create(null);
    var wordCharacters = 0;
    tokens.forEach(function (token) { unique[token] = true; wordCharacters += token.length; });
    var letters = (text.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) || []).length;
    var digits = (text.match(/[0-9]/g) || []).length;
    var punctuation = (text.match(/[.,;:!?—–-]/g) || []).length;
    var lines = text ? text.split(/\r\n?|\n/).length : 0;
    return {
      character_count: text.length,
      letter_count: letters,
      digit_count: digits,
      punctuation_count: punctuation,
      line_count: lines,
      word_count: tokens.length,
      unique_word_count: Object.keys(unique).length,
      sentence_count: sentenceCount(text),
      mean_word_length: tokens.length ? wordCharacters / tokens.length : 0,
      lexical_diversity: tokens.length ? Object.keys(unique).length / tokens.length : 0
    };
  }

  function featureFamily(value, index) {
    if (typeof value === "function") return { name: value.featureFamilyName || value.name || ("custom_" + index), version: "unknown", extract: value };
    if (!value || typeof value !== "object" || typeof value.extract !== "function") throw new TypeError("feature family must be a function or an object with extract(text, record)");
    return {
      name: typeof value.name === "string" && value.name.trim() ? value.name.trim() : ("custom_" + index),
      version: value.version == null ? "unknown" : String(value.version),
      extract: value.extract
    };
  }

  function flattenNumeric(value, prefix, output, strict) {
    if (typeof value === "number") {
      if (!isFinite(value)) throw new TypeError("feature " + prefix + " must be finite");
      output[prefix || "value"] = value;
      return;
    }
    if (typeof value === "boolean") {
      output[prefix || "value"] = value ? 1 : 0;
      return;
    }
    if (value == null) return;
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) flattenNumeric(value[i], prefix + "." + i, output, strict);
      return;
    }
    if (typeof value === "object") {
      Object.keys(value).sort().forEach(function (key) {
        flattenNumeric(value[key], prefix ? prefix + "." + key : key, output, strict);
      });
      return;
    }
    if (strict) throw new TypeError("feature " + prefix + " must be numeric, boolean, null, an array, or an object of those values");
  }

  function sortedObject(value) {
    var out = Object.create(null);
    Object.keys(value).sort().forEach(function (key) { out[key] = value[key]; });
    return out;
  }

  function normalizeRecord(record, index) {
    if (typeof record === "string") return { id: String(index), text: record, metadata: {} };
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new TypeError("dataset record at index " + index + " must be an object or string");
    if (typeof record.text !== "string") throw new TypeError("dataset record " + (record.id == null ? index : record.id) + " must contain string text");
    return record;
  }

  function configuredFamilies(options) {
    options = options || {};
    var supplied = options.featureFamilies || options.extractors || [];
    if (!Array.isArray(supplied)) throw new TypeError("featureFamilies must be an array");
    var families = [];
    if (options.includeBasic !== false) families.push({ name: "surface", version: "1", extract: basicTextFeatures });
    supplied.forEach(function (value, index) { families.push(featureFamily(value, index)); });
    return families;
  }

  function prepareFeatureRow(record, options, index) {
    options = options || {};
    index = index == null ? 0 : index;
    record = normalizeRecord(record, index);
    var features = Object.create(null);
    var families = configuredFamilies(options);
    var familyVersions = Object.create(null);
    families.forEach(function (family) {
      familyVersions[family.name] = family.version;
      var extracted = family.extract(record.text, record);
      var flattened = Object.create(null);
      flattenNumeric(extracted, "", flattened, options.strictFeatures !== false);
      Object.keys(flattened).sort().forEach(function (key) {
        var featureName = family.name + "." + key.replace(/^\./, "");
        if (Object.prototype.hasOwnProperty.call(features, featureName)) throw new Error("duplicate feature name: " + featureName);
        features[featureName] = flattened[key];
      });
    });
    return {
      id: record.id == null ? String(index) : String(record.id),
      source_type: record.source_type == null ? null : String(record.source_type),
      model: record.model == null ? null : String(record.model),
      domain: record.domain == null ? null : String(record.domain),
      author_id: record.author_id == null ? null : String(record.author_id),
      features: sortedObject(features),
      featureFamilies: sortedObject(familyVersions)
    };
  }

  function prepareFeatureRows(records, options) {
    if (!Array.isArray(records)) throw new TypeError("records must be an array");
    var rows = records.map(function (record, index) { return prepareFeatureRow(record, options, index); });
    if (options && options.sortById) rows.sort(function (a, b) { return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0); });
    return rows;
  }

  function prepareSurrogateDataset(records, options) {
    var rows = prepareFeatureRows(records, options || {});
    var featureNames = rows.length ? Object.keys(rows[0].features) : [];
    rows.forEach(function (row) {
      var names = Object.keys(row.features);
      if (JSON.stringify(names) !== JSON.stringify(featureNames)) throw new Error("all feature rows must share one deterministic schema");
    });
    return {
      kind: "detector_surrogate_dataset",
      schemaVersion: 1,
      status: "prepared",
      rows: rows,
      featureNames: featureNames,
      targetField: "source_type",
      calibrated: false,
      accuracy: null,
      accuracyClaim: null,
      note: "Prepared features are research inputs only. No detector accuracy or calibration is claimed."
    };
  }

  function predictionResult(surrogate, row, rawOutput) {
    return {
      kind: "detector_surrogate_output",
      name: surrogate.name,
      version: surrogate.version,
      status: "unvalidated",
      featureRow: row,
      rawOutput: rawOutput,
      calibrated: false,
      accuracy: null,
      accuracyClaim: null,
      interpretation: "Experimental provider-local output; not a probability or external detector observation."
    };
  }

  function DetectorSurrogate(options) {
    if (!(this instanceof DetectorSurrogate)) return new DetectorSurrogate(options);
    options = options || {};
    this.name = typeof options.name === "string" && options.name.trim() ? options.name.trim() : "Unconfigured detector surrogate";
    this.version = options.version == null ? "research" : String(options.version);
    this.predictor = typeof options.predict === "function" ? options.predict : (typeof options.predictor === "function" ? options.predictor : null);
    this.featureOptions = {
      includeBasic: options.includeBasic !== false,
      featureFamilies: options.featureFamilies || options.extractors || [],
      strictFeatures: options.strictFeatures !== false
    };
  }

  DetectorSurrogate.prototype.prepare = function (records, options) {
    var merged = Object.create(null);
    var base = this.featureOptions;
    Object.keys(base).forEach(function (key) { merged[key] = base[key]; });
    Object.keys(options || {}).forEach(function (key) { merged[key] = options[key]; });
    return prepareSurrogateDataset(records, merged);
  };

  DetectorSurrogate.prototype.predict = function (text, metadata) {
    var record = Object.create(null);
    Object.keys(metadata || {}).forEach(function (key) { record[key] = metadata[key]; });
    record.text = text;
    var row = prepareFeatureRow(record, this.featureOptions, 0);
    if (!this.predictor) {
      return {
        kind: "detector_surrogate_output",
        name: this.name,
        version: this.version,
        status: "not_configured",
        featureRow: row,
        rawOutput: null,
        calibrated: false,
        accuracy: null,
        accuracyClaim: null,
        interpretation: "No predictor is configured; this hook only prepares deterministic features."
      };
    }
    var output = this.predictor(row.features, row);
    var self = this;
    if (output && typeof output.then === "function") return output.then(function (raw) { return predictionResult(self, row, raw); });
    return predictionResult(this, row, output);
  };

  function createDetectorSurrogate(options) {
    return new DetectorSurrogate(options);
  }

  return {
    basicTextFeatures: basicTextFeatures,
    prepareFeatureRow: prepareFeatureRow,
    prepareFeatureRows: prepareFeatureRows,
    prepareSurrogateDataset: prepareSurrogateDataset,
    prepareDataset: prepareSurrogateDataset,
    DetectorSurrogate: DetectorSurrogate,
    createDetectorSurrogate: createDetectorSurrogate
  };
}));
