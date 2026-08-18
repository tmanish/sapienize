(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SapienizeAnthropicWatermark = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  var UNSUPPORTED_REASON = "Anthropic watermark verification API not configured";
  var SUPPORTED_OFFICIAL_STATUSES = ["verified", "not_verified", "inconclusive"];
  var INTERNAL_RESULT_STATUSES = ["unsupported", "invalid", "error"];
  var WATERMARK_RESULT_STATUSES = SUPPORTED_OFFICIAL_STATUSES.concat(INTERNAL_RESULT_STATUSES);
  var REQUIRED_RESULT_FIELDS = [
    "kind", "provider", "scheme", "status", "evidenceSource", "raw", "limitations"
  ];

  function isJsonSafeValue(value) {
    function inspect(current, ancestors) {
      if (current === null || typeof current === "string" || typeof current === "boolean") return true;
      if (typeof current === "number") return Number.isFinite(current);
      if (!current || typeof current !== "object") return false;
      if (ancestors.indexOf(current) !== -1) return false;
      ancestors.push(current);

      var names = Object.getOwnPropertyNames(current);
      var symbols = typeof Object.getOwnPropertySymbols === "function" ? Object.getOwnPropertySymbols(current) : [];
      if (symbols.length) {
        ancestors.pop();
        return false;
      }

      if (Array.isArray(current)) {
        if (Object.getPrototypeOf(current) !== Array.prototype ||
            names.length !== current.length + 1 || names.indexOf("length") === -1) {
          ancestors.pop();
          return false;
        }
        for (var index = 0; index < current.length; index++) {
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

      var prototype = Object.getPrototypeOf(current);
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

  function hasOwn(value, key) {
    return value !== null && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key);
  }

  function supportedOfficialStatus(status) {
    return SUPPORTED_OFFICIAL_STATUSES.indexOf(status) !== -1;
  }

  function explicitEvidenceSource(value) {
    return typeof value === "string" && value.trim().length > 0 && value.trim().toLowerCase() !== "none";
  }

  function statusMatchesVerified(status, verified) {
    return verified === (status === "verified");
  }

  function baseResult(status, reason, evidenceSource) {
    return {
      kind: "watermark_provenance",
      provider: "anthropic",
      scheme: "synthid-text",
      status: status,
      reason: reason,
      evidenceSource: evidenceSource || "none",
      raw: null,
      limitations: ["Sapienize does not infer Anthropic watermarks from wording, regexes, or invisible characters."]
    };
  }

  function failedOfficialResult(status, reason, raw) {
    var failed = baseResult(status, reason, "none");
    failed.raw = isJsonSafeValue(raw) ? raw : null;
    return failed;
  }

  function isExplicitOfficialResult(result) {
    try {
      return supportedOfficialStatus(result && result.status) && validateAnthropicWatermarkResult(result).valid;
    } catch (error) {
      return false;
    }
  }

  function validateAnthropicWatermarkResult(result) {
    var errors = [];
    try {
      if (!result || typeof result !== "object" || Array.isArray(result)) {
        return { valid: false, errors: ["result must be an object"] };
      }
      if (!isJsonSafeValue(result)) errors.push("result must contain only JSON-safe own enumerable data properties");
      REQUIRED_RESULT_FIELDS.forEach(function (field) {
        if (!hasOwn(result, field)) errors.push(field + " is required as an own property");
      });
      if (!hasOwn(result, "kind") || result.kind !== "watermark_provenance") errors.push("kind must be watermark_provenance");
      if (!hasOwn(result, "provider") || result.provider !== "anthropic") errors.push("provider must be anthropic");
      if (!hasOwn(result, "scheme") || result.scheme !== "synthid-text") errors.push("scheme must be synthid-text");
      if (!hasOwn(result, "status") || WATERMARK_RESULT_STATUSES.indexOf(result.status) === -1) errors.push("status is unsupported");
      if (!Array.isArray(result.limitations) || !result.limitations.length || result.limitations.some(function (item) {
        return typeof item !== "string" || !item.trim();
      })) {
        errors.push("limitations must be a non-empty array of strings");
      }
      if (hasOwn(result, "reason") && result.reason !== null && typeof result.reason !== "string") {
        errors.push("reason must be a string or null");
      }
      if (hasOwn(result, "verifierVersion") && (typeof result.verifierVersion !== "string" || !result.verifierVersion.trim())) {
        errors.push("verifierVersion must be a non-empty string");
      }
      if (hasOwn(result, "date") && (typeof result.date !== "string" || !Number.isFinite(Date.parse(result.date)))) {
        errors.push("date must be a valid timestamp");
      }

      if (supportedOfficialStatus(result.status)) {
        if (!hasOwn(result, "verified") || typeof result.verified !== "boolean") errors.push("verified must be a boolean for an official result");
        else if (!statusMatchesVerified(result.status, result.verified)) errors.push("status and verified are contradictory");
        if (!hasOwn(result, "evidenceSource") || !explicitEvidenceSource(result.evidenceSource)) errors.push("official results require a non-none evidenceSource");
      } else if (INTERNAL_RESULT_STATUSES.indexOf(result.status) !== -1) {
        if (!hasOwn(result, "evidenceSource") || result.evidenceSource !== "none") errors.push("non-official results must use evidenceSource none");
        if (hasOwn(result, "verified")) errors.push("non-official results must not claim verified");
      }
    } catch (error) {
      return { valid: false, errors: ["result could not be inspected safely"] };
    }
    return { valid: errors.length === 0, errors: errors };
  }

  function isAnthropicWatermarkResult(result) {
    return validateAnthropicWatermarkResult(result).valid;
  }

  function normalizeOfficialResult(result) {
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      return failedOfficialResult("error", "Configured watermark verifier returned no structured result.", result);
    }
    if (!isJsonSafeValue(result)) {
      return failedOfficialResult("error", "Configured watermark verifier returned non-JSON-safe result data.", null);
    }
    if (!hasOwn(result, "status") || typeof result.status !== "string" || !result.status.trim()) {
      return failedOfficialResult("error", "Configured watermark verifier did not provide an explicit status.", result);
    }
    var status = result.status.trim().toLowerCase();
    if (!supportedOfficialStatus(status)) {
      return failedOfficialResult("error", "Configured watermark verifier returned unsupported status: " + status + ".", result);
    }
    if (!hasOwn(result, "verified") || typeof result.verified !== "boolean") {
      return failedOfficialResult("error", "Configured watermark verifier must provide a boolean verified field.", result);
    }
    if (!statusMatchesVerified(status, result.verified)) {
      return failedOfficialResult("error", "Configured watermark verifier returned contradictory status and verified fields.", result);
    }
    if (!hasOwn(result, "evidenceSource") || !explicitEvidenceSource(result.evidenceSource)) {
      return failedOfficialResult("error", "Configured watermark verifier must provide an explicit non-none evidenceSource.", result);
    }

    var normalized = baseResult(
      status,
      !hasOwn(result, "reason") || result.reason == null ? null : String(result.reason),
      result.evidenceSource.trim()
    );
    normalized.raw = result;
    normalized.verified = result.verified;
    if (hasOwn(result, "verifierVersion") && result.verifierVersion != null) normalized.verifierVersion = String(result.verifierVersion);
    if (hasOwn(result, "date") && result.date != null) normalized.date = String(result.date);
    if (!validateAnthropicWatermarkResult(normalized).valid) {
      return failedOfficialResult(
        "error",
        "Configured watermark verifier returned metadata that does not satisfy the provenance result contract.",
        result
      );
    }
    return normalized;
  }

  function configuredVerifier(options) {
    if (!options) return null;
    if (typeof options.verifier === "function") return options.verifier;
    if (typeof options.verify === "function") return options.verify;
    if (typeof options.check === "function") return options.check;
    return null;
  }

  function checkAnthropicWatermark(text, options) {
    if (typeof text !== "string") return baseResult("invalid", "text must be a string");
    var verifier = configuredVerifier(options);
    if (!verifier) return baseResult("unsupported", UNSUPPORTED_REASON);
    try {
      var result = verifier(text, options || {});
      if (result && typeof result.then === "function") {
        return result.then(normalizeOfficialResult).catch(function (error) {
          return baseResult("error", error && error.message ? error.message : String(error));
        });
      }
      return normalizeOfficialResult(result);
    } catch (error) {
      return baseResult("error", error && error.message ? error.message : String(error));
    }
  }

  function createAnthropicWatermarkAdapter(options) {
    options = options || {};
    return {
      name: "Anthropic watermark verifier",
      provider: "anthropic",
      scheme: "synthid-text",
      configured: Boolean(configuredVerifier(options)),
      check: function (text) { return checkAnthropicWatermark(text, options); }
    };
  }

  return {
    UNSUPPORTED_REASON: UNSUPPORTED_REASON,
    SUPPORTED_OFFICIAL_STATUSES: SUPPORTED_OFFICIAL_STATUSES.slice(),
    INTERNAL_RESULT_STATUSES: INTERNAL_RESULT_STATUSES.slice(),
    WATERMARK_RESULT_STATUSES: WATERMARK_RESULT_STATUSES.slice(),
    checkAnthropicWatermark: checkAnthropicWatermark,
    createAnthropicWatermarkAdapter: createAnthropicWatermarkAdapter,
    normalizeOfficialResult: normalizeOfficialResult,
    isJsonSafeValue: isJsonSafeValue,
    isExplicitOfficialResult: isExplicitOfficialResult,
    validateAnthropicWatermarkResult: validateAnthropicWatermarkResult,
    isAnthropicWatermarkResult: isAnthropicWatermarkResult
  };
}));
