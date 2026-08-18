(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./anthropic-watermark.js"));
  } else {
    root.SapienizeProvenance = factory(root.SapienizeAnthropicWatermark);
  }
}(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this), function (anthropicModule) {
  "use strict";

  var INVISIBLE_NAMES = {
    "00ad": "soft hyphen",
    "061c": "arabic letter mark",
    "200b": "zero width space",
    "200c": "zero width non-joiner",
    "200d": "zero width joiner",
    "200e": "left-to-right mark",
    "200f": "right-to-left mark",
    "2060": "word joiner",
    "2061": "function application",
    "2062": "invisible times",
    "2063": "invisible separator",
    "2064": "invisible plus",
    "feff": "byte order mark / zero width no-break space",
    "202a": "left-to-right embedding",
    "202b": "right-to-left embedding",
    "202c": "pop directional formatting",
    "202d": "left-to-right override",
    "202e": "right-to-left override",
    "2066": "left-to-right isolate",
    "2067": "right-to-left isolate",
    "2068": "first strong isolate",
    "2069": "pop directional isolate"
  };
  var INVISIBLE_RE = /[\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
  var OFFICIAL_STATUSES = ["verified", "not_verified", "inconclusive"];
  var INTERNAL_STATUSES = ["unsupported", "invalid", "error"];
  var REQUIRED_WATERMARK_FIELDS = [
    "kind", "provider", "scheme", "status", "evidenceSource", "raw", "limitations"
  ];

  function fallbackJsonSafeValue(value) {
    function inspect(current, ancestors) {
      if (current === null || typeof current === "string" || typeof current === "boolean") return true;
      if (typeof current === "number") return Number.isFinite(current);
      if (!current || typeof current !== "object" || ancestors.indexOf(current) !== -1) return false;
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
          if (!hasOwn(current, index)) {
            ancestors.pop();
            return false;
          }
          var itemDescriptor = Object.getOwnPropertyDescriptor(current, String(index));
          if (!itemDescriptor || !itemDescriptor.enumerable || !hasOwn(itemDescriptor, "value") ||
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
        if (!descriptor || !descriptor.enumerable || !hasOwn(descriptor, "value") ||
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

  function isJsonSafeValue(value) {
    if (anthropicModule && typeof anthropicModule.isJsonSafeValue === "function") {
      try { return anthropicModule.isJsonSafeValue(value); }
      catch (_) { return false; }
    }
    return fallbackJsonSafeValue(value);
  }

  function hasOwn(value, key) {
    return value !== null && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key);
  }

  function validAnthropicEnvelope(result) {
    return Boolean(
      isJsonSafeValue(result) && result && typeof result === "object" && !Array.isArray(result) &&
      hasOwn(result, "kind") && hasOwn(result, "provider") && hasOwn(result, "scheme") && hasOwn(result, "status") &&
      result.kind === "watermark_provenance" && result.provider === "anthropic" && result.scheme === "synthid-text"
    );
  }

  function explicitEvidenceSource(value) {
    return typeof value === "string" && value.trim().length > 0 && value.trim().toLowerCase() !== "none";
  }

  function validExplicitResult(result) {
    if (anthropicModule && typeof anthropicModule.isExplicitOfficialResult === "function") {
      try { return anthropicModule.isExplicitOfficialResult(result); }
      catch (_) { return false; }
    }
    return fallbackValidateAnthropicWatermarkResult(result).valid &&
      OFFICIAL_STATUSES.indexOf(result.status) !== -1 &&
      hasOwn(result, "verified") && hasOwn(result, "evidenceSource") &&
      typeof result.verified === "boolean" &&
      result.verified === (result.status === "verified") &&
      explicitEvidenceSource(result.evidenceSource);
  }

  function fallbackValidateAnthropicWatermarkResult(result) {
    try {
      if (!validAnthropicEnvelope(result)) return { valid: false, errors: ["invalid Anthropic watermark envelope"] };
      for (var index = 0; index < REQUIRED_WATERMARK_FIELDS.length; index++) {
        if (!hasOwn(result, REQUIRED_WATERMARK_FIELDS[index])) {
          return { valid: false, errors: [REQUIRED_WATERMARK_FIELDS[index] + " is required as an own property"] };
        }
      }
      if (!Array.isArray(result.limitations) || !result.limitations.length || result.limitations.some(function (item) {
        return typeof item !== "string" || !item.trim();
      })) return { valid: false, errors: ["limitations must be a non-empty array of strings"] };
      if (hasOwn(result, "reason") && result.reason !== null && typeof result.reason !== "string") {
        return { valid: false, errors: ["reason must be a string or null"] };
      }
      if (hasOwn(result, "verifierVersion") && (typeof result.verifierVersion !== "string" || !result.verifierVersion.trim())) {
        return { valid: false, errors: ["verifierVersion must be a non-empty string"] };
      }
      if (hasOwn(result, "date") && (typeof result.date !== "string" || !Number.isFinite(Date.parse(result.date)))) {
        return { valid: false, errors: ["date must be a valid timestamp"] };
      }
      if (OFFICIAL_STATUSES.indexOf(result.status) !== -1) {
        var validOfficial = hasOwn(result, "verified") && typeof result.verified === "boolean" &&
          result.verified === (result.status === "verified") &&
          hasOwn(result, "evidenceSource") && explicitEvidenceSource(result.evidenceSource);
        return { valid: validOfficial, errors: validOfficial ? [] : ["invalid official Anthropic watermark result"] };
      }
      var validInternal = INTERNAL_STATUSES.indexOf(result.status) !== -1 &&
        result.evidenceSource === "none" && !hasOwn(result, "verified");
      return { valid: validInternal, errors: validInternal ? [] : ["invalid internal Anthropic watermark result"] };
    } catch (_) {
      return { valid: false, errors: ["Anthropic watermark result could not be inspected safely"] };
    }
  }

  function validateAnthropicWatermarkResult(result) {
    try {
      if (anthropicModule && typeof anthropicModule.validateAnthropicWatermarkResult === "function") {
        return anthropicModule.validateAnthropicWatermarkResult(result);
      }
      return fallbackValidateAnthropicWatermarkResult(result);
    } catch (error) {
      return { valid: false, errors: ["Anthropic watermark result could not be inspected safely"] };
    }
  }

  function isAnthropicWatermarkResult(result) {
    return validateAnthropicWatermarkResult(result).valid;
  }

  function boundaryFailure(result) {
    return {
      kind: "watermark_provenance",
      provider: "anthropic",
      scheme: "synthid-text",
      status: "error",
      reason: "Anthropic watermark verifier returned a malformed or unsupported result.",
      evidenceSource: "none",
      raw: isJsonSafeValue(result) ? result : null,
      limitations: ["Sapienize does not infer Anthropic watermarks from wording, regexes, or invisible characters."]
    };
  }

  function normalizeReportResult(result) {
    if (!validateAnthropicWatermarkResult(result).valid) return boundaryFailure(result);
    if (validExplicitResult(result)) return result;
    if (!validAnthropicEnvelope(result)) return boundaryFailure(result);
    if (INTERNAL_STATUSES.indexOf(result.status) !== -1 &&
        result.evidenceSource === "none" && !hasOwn(result, "verified")) {
      return result;
    }
    return boundaryFailure(result);
  }

  function codePointLabel(character) {
    var value = character.charCodeAt(0).toString(16).toUpperCase();
    while (value.length < 4) value = "0" + value;
    return "U+" + value;
  }

  function inspectDocumentIntegrity(text) {
    if (typeof text !== "string") {
      return {
        kind: "document_integrity",
        status: "invalid",
        findings: [{ type: "input", severity: "error", message: "text must be a string" }],
        invisibleCharacterCount: 0,
        countsByCodePoint: {},
        provenanceInterpretation: "not_evaluated"
      };
    }
    INVISIBLE_RE.lastIndex = 0;
    var findings = [];
    var counts = {};
    var match;
    while ((match = INVISIBLE_RE.exec(text)) !== null) {
      var label = codePointLabel(match[0]);
      counts[label] = (counts[label] || 0) + 1;
      findings.push({
        type: "invisible_character",
        severity: "warning",
        index: match.index,
        codePoint: label,
        name: INVISIBLE_NAMES[label.slice(2).toLowerCase()] || "invisible formatting character",
        message: label + " found at UTF-16 index " + match.index + "."
      });
      if (INVISIBLE_RE.lastIndex === match.index) INVISIBLE_RE.lastIndex++;
    }
    return {
      kind: "document_integrity",
      status: findings.length ? "review" : "clean",
      findings: findings,
      invisibleCharacterCount: findings.length,
      countsByCodePoint: counts,
      provenanceInterpretation: "separate_signal",
      note: "Invisible characters are document-integrity findings, not evidence for or against an AI watermark."
    };
  }

  function unsupportedAnthropic() {
    return {
      kind: "watermark_provenance",
      provider: "anthropic",
      scheme: "synthid-text",
      status: "unsupported",
      reason: "Anthropic watermark verification API not configured",
      evidenceSource: "none",
      raw: null,
      limitations: ["Sapienize does not infer Anthropic watermarks from wording, regexes, or invisible characters."]
    };
  }

  function assembleReport(documentIntegrity, anthropic) {
    anthropic = normalizeReportResult(anthropic);
    var provenanceStatus = anthropic.status === "unsupported" ? "unknown" : anthropic.status;
    var hasExplicitResult = validExplicitResult(anthropic);
    return {
      kind: "provenance_report",
      status: provenanceStatus,
      provenanceStatus: provenanceStatus,
      watermarks: { anthropic: anthropic },
      anthropicWatermark: anthropic,
      documentIntegrity: documentIntegrity,
      explicitSignals: hasExplicitResult ? [anthropic] : [],
      limitations: [
        "An unsupported verifier means provenance is unknown, not absent.",
        "Document-integrity findings are reported separately and are never treated as watermark evidence."
      ]
    };
  }

  function checkProvenance(text, options) {
    options = options || {};
    var documentIntegrity = inspectDocumentIntegrity(text);
    var checker = anthropicModule && anthropicModule.checkAnthropicWatermark;
    var anthropic = checker ? checker(text, options.anthropic || options) : unsupportedAnthropic();
    if (anthropic && typeof anthropic.then === "function") {
      return anthropic.then(function (result) { return assembleReport(documentIntegrity, result); });
    }
    return assembleReport(documentIntegrity, anthropic);
  }

  return {
    checkProvenance: checkProvenance,
    inspectDocumentIntegrity: inspectDocumentIntegrity,
    checkDocumentIntegrity: inspectDocumentIntegrity,
    SUPPORTED_OFFICIAL_STATUSES: OFFICIAL_STATUSES.slice(),
    INTERNAL_RESULT_STATUSES: INTERNAL_STATUSES.slice(),
    WATERMARK_RESULT_STATUSES: OFFICIAL_STATUSES.concat(INTERNAL_STATUSES),
    validateAnthropicWatermarkResult: validateAnthropicWatermarkResult,
    isAnthropicWatermarkResult: isAnthropicWatermarkResult,
    checkAnthropicWatermark: anthropicModule && anthropicModule.checkAnthropicWatermark
      ? anthropicModule.checkAnthropicWatermark
      : function () { return unsupportedAnthropic(); }
  };
}));
