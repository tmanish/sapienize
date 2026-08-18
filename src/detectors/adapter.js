(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SapienizeDetectorAdapter = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  function requireNonEmptyString(value, field) {
    if (typeof value !== "string" || !value.trim()) throw new TypeError(field + " must be a non-empty string");
    return value.trim();
  }

  function isoDate(value) {
    var date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) throw new TypeError("date must be a valid date");
    return date.toISOString();
  }

  function isJsonSafeValue(value) {
    function inspect(current, ancestors) {
      if (current === null || typeof current === "string" || typeof current === "boolean") return true;
      if (typeof current === "number") return Number.isFinite(current);
      if (!current || typeof current !== "object") return false;
      if (ancestors.indexOf(current) !== -1) return false;
      ancestors.push(current);

      var prototype = Object.getPrototypeOf(current);
      var names = Object.getOwnPropertyNames(current);
      var symbols = typeof Object.getOwnPropertySymbols === "function" ? Object.getOwnPropertySymbols(current) : [];
      if (symbols.length) {
        ancestors.pop();
        return false;
      }

      if (Array.isArray(current)) {
        var lengthDescriptor = Object.getOwnPropertyDescriptor(current, "length");
        if (prototype !== Array.prototype || !lengthDescriptor ||
            !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value") ||
            !Number.isInteger(lengthDescriptor.value) || lengthDescriptor.value < 0 ||
            names.length !== lengthDescriptor.value + 1 || names.indexOf("length") === -1) {
          ancestors.pop();
          return false;
        }
        for (var index = 0; index < lengthDescriptor.value; index++) {
          if (!Object.prototype.hasOwnProperty.call(current, index)) {
            ancestors.pop();
            return false;
          }
          var itemDescriptor = Object.getOwnPropertyDescriptor(current, String(index));
          if (!itemDescriptor || !itemDescriptor.enumerable || !Object.prototype.hasOwnProperty.call(itemDescriptor, "value") ||
              !inspect(itemDescriptor.value, ancestors)) {
            ancestors.pop();
            return false;
          }
        }
        ancestors.pop();
        return true;
      }

      if (prototype !== Object.prototype && prototype !== null) {
        ancestors.pop();
        return false;
      }
      for (var nameIndex = 0; nameIndex < names.length; nameIndex++) {
        var descriptor = Object.getOwnPropertyDescriptor(current, names[nameIndex]);
        if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, "value") ||
            !inspect(descriptor.value, ancestors)) {
          ancestors.pop();
          return false;
        }
      }
      ancestors.pop();
      return true;
    }

    try { return inspect(value, []); }
    catch (_) { return false; }
  }

  function normalizeRepresentation(normalized, detectorName) {
    if (normalized === undefined) normalized = null;
    if (!isJsonSafeValue(normalized)) throw new TypeError("normalized must contain only JSON-safe values");
    var result;
    if (normalized && typeof normalized === "object" && !Array.isArray(normalized)) {
      result = Object.create(null);
      Object.keys(normalized).forEach(function (key) { result[key] = normalized[key]; });
    } else {
      result = { value: normalized == null ? null : normalized };
    }
    result.providerSpecific = true;
    if (!Object.prototype.hasOwnProperty.call(result, "semantics")) {
      result.semantics = "Interpret only according to " + detectorName + "'s documented scale.";
    }
    if (!isJsonSafeValue(result)) throw new TypeError("normalized must contain only JSON-safe values");
    return result;
  }

  function createDetectorObservation(details) {
    details = details || {};
    var name = requireNonEmptyString(details.name, "name");
    var version = details.version == null || details.version === "" ? "unknown" : String(details.version);
    var date = isoDate(details.date == null ? new Date() : details.date);
    var calibrated = details.calibrated === true;
    var limitations = Array.isArray(details.limitations) ? details.limitations.slice() : [
      "Provider-specific values are not comparable with values from other detectors.",
      calibrated
        ? "Calibration is declared by the integration and must be supported by detector-specific evaluation."
        : "No calibrated probability is supplied by this observation."
    ];
    if (!isJsonSafeValue(limitations) || limitations.some(function (item) {
      return typeof item !== "string" || !item.trim();
    })) {
      throw new TypeError("limitations must be an array of non-empty JSON-safe strings");
    }
    var raw = Object.prototype.hasOwnProperty.call(details, "raw") ? details.raw : null;
    if (raw === undefined) raw = null;
    if (!isJsonSafeValue(raw)) throw new TypeError("raw must contain only JSON-safe values");
    var normalized = normalizeRepresentation(details.normalized, name);
    if (Object.prototype.hasOwnProperty.call(normalized, "calibrated") && normalized.calibrated !== calibrated) {
      throw new TypeError("normalized.calibrated must agree with the observation calibration status");
    }
    if (!calibrated && (Object.prototype.hasOwnProperty.call(normalized, "calibratedProbability") ||
        Object.prototype.hasOwnProperty.call(normalized, "calibrated_probability"))) {
      throw new TypeError("calibratedProbability requires calibrated: true on the observation");
    }
    normalized.calibrated = calibrated;
    var observation = {
      kind: "external_detector_observation",
      schemaVersion: 1,
      name: name,
      version: version,
      date: date,
      detector: { name: name, version: version },
      raw: raw,
      normalized: normalized,
      calibrated: calibrated,
      calibrationStatus: calibrated ? "provider_declared" : "not_calibrated",
      limitations: limitations,
      comparability: "provider_specific",
      note: "This observation preserves the detector's own semantics; values from different providers are not interchangeable."
    };
    if (!isJsonSafeValue(observation)) throw new TypeError("detector observation must contain only JSON-safe values");
    return observation;
  }

  function DetectorAdapter(options) {
    if (!(this instanceof DetectorAdapter)) return new DetectorAdapter(options);
    options = options || {};
    this.name = requireNonEmptyString(options.name, "name");
    this.version = options.version == null || options.version === "" ? "unknown" : String(options.version);
    this._request = typeof options.request === "function" ? options.request : null;
    this._normalizer = typeof options.normalize === "function" ? options.normalize : null;
    this._clock = typeof options.clock === "function" ? options.clock : function () { return new Date(); };
    this.calibrated = options.calibrated === true;
    this.limitations = Array.isArray(options.limitations) ? options.limitations.slice() : null;
  }

  DetectorAdapter.prototype.fetch = function (text, context) {
    if (this._request) return this._request(text, context || {});
    var error = new Error("DetectorAdapter.fetch() must be implemented by an adapter.");
    error.code = "DETECTOR_NOT_IMPLEMENTED";
    return Promise.reject(error);
  };

  DetectorAdapter.prototype.normalize = function (raw, context) {
    if (this._normalizer) return this._normalizer(raw, context || {});
    return {
      status: "uninterpreted",
      value: null,
      semantics: "No provider-specific normalizer was configured; inspect raw."
    };
  };

  DetectorAdapter.prototype.makeObservation = function (raw, normalized, date) {
    return createDetectorObservation({
      name: this.name,
      version: this.version,
      date: date == null ? this._clock() : date,
      raw: raw,
      normalized: normalized,
      calibrated: this.calibrated,
      limitations: this.limitations
    });
  };

  DetectorAdapter.prototype.analyze = function (text, context) {
    var self = this;
    context = context || {};
    if (typeof text !== "string") return Promise.reject(new TypeError("text must be a string"));
    var fetched;
    try { fetched = self.fetch(text, context); }
    catch (error) { return Promise.reject(error); }
    return Promise.resolve(fetched).then(function (raw) {
      return Promise.resolve(self.normalize(raw, context)).then(function (normalized) {
        return self.makeObservation(raw, normalized, context.date);
      });
    });
  };

  DetectorAdapter.prototype.describe = function () {
    return {
      name: this.name,
      version: this.version,
      outputKind: "external_detector_observation",
      comparability: "provider_specific",
      calibrated: this.calibrated,
      limitations: this.limitations ? this.limitations.slice() : []
    };
  };

  function isDetectorObservation(value) {
    try {
      var requiredFields = [
        "kind", "name", "version", "date", "raw", "normalized", "calibrated",
        "calibrationStatus", "limitations", "comparability"
      ];
      if (!value || !isJsonSafeValue(value) || requiredFields.some(function (field) {
        return !Object.prototype.hasOwnProperty.call(value, field);
      })) return false;
      if (!value.normalized || typeof value.normalized !== "object" || Array.isArray(value.normalized) ||
          !isJsonSafeValue(value.normalized) ||
          !Object.prototype.hasOwnProperty.call(value.normalized, "providerSpecific") ||
          !Object.prototype.hasOwnProperty.call(value.normalized, "semantics")) return false;
      var calibrationConsistent =
        ((value.calibrated === true && value.calibrationStatus === "provider_declared") ||
         (value.calibrated === false && value.calibrationStatus === "not_calibrated"));
      var normalizedConsistent =
        value.normalized.providerSpecific === true &&
        typeof value.normalized.semantics === "string" && value.normalized.semantics.trim() &&
        (!Object.prototype.hasOwnProperty.call(value.normalized, "calibrated") || value.normalized.calibrated === value.calibrated) &&
        (value.calibrated === true ||
          (!Object.prototype.hasOwnProperty.call(value.normalized, "calibratedProbability") &&
           !Object.prototype.hasOwnProperty.call(value.normalized, "calibrated_probability")));
      return Boolean(value.kind === "external_detector_observation" && typeof value.name === "string" && value.name.trim() && typeof value.version === "string" && value.version.trim() && typeof value.date === "string" && Number.isFinite(Date.parse(value.date)) && value.raw !== undefined && isJsonSafeValue(value.raw) && normalizedConsistent && calibrationConsistent && Array.isArray(value.limitations) && value.limitations.every(function (item) { return typeof item === "string" && item.trim(); }) && value.comparability === "provider_specific");
    } catch (_) {
      return false;
    }
  }

  return {
    DetectorAdapter: DetectorAdapter,
    createDetectorObservation: createDetectorObservation,
    isDetectorObservation: isDetectorObservation,
    isJsonSafeValue: isJsonSafeValue,
    normalizeRepresentation: normalizeRepresentation
  };
}));
