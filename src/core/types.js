/* Runtime result schemas and validation for the provider-neutral core. */
(function (root, factory) {
  var api = typeof module === "object" && module.exports
    ? factory(require("../voice/schema.js"), require("../provenance/index.js"))
    : factory(root.SapienizeVoiceSchema, root.SapienizeProvenance);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SapienizeTypes = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (voiceSchema, provenanceSchema) {
  "use strict";

  var RESULT_SCHEMA_VERSION = "2.0.0";
  var OFFICIAL_PROVENANCE_STATUSES = provenanceSchema && Array.isArray(provenanceSchema.SUPPORTED_OFFICIAL_STATUSES)
    ? provenanceSchema.SUPPORTED_OFFICIAL_STATUSES.slice()
    : ["verified", "not_verified", "inconclusive"];
  var INTERNAL_PROVENANCE_STATUSES = provenanceSchema && Array.isArray(provenanceSchema.INTERNAL_RESULT_STATUSES)
    ? provenanceSchema.INTERNAL_RESULT_STATUSES.slice()
    : ["unsupported", "invalid", "error"];
  var WATERMARK_STATUSES = OFFICIAL_PROVENANCE_STATUSES.concat(INTERNAL_PROVENANCE_STATUSES);
  var REPORT_PROVENANCE_STATUSES = ["unknown", "verified", "not_verified", "inconclusive", "invalid", "error"];
  var NON_EMPTY_STRING_SCHEMA = { type: "string", minLength: 1 };

  var INLINE_FINDING_SCHEMA = {
    type: "object",
    required: ["start", "end", "label", "cat", "sev", "fix", "snippet"],
    properties: {
      start: { type: "integer", minimum: 0 },
      end: { type: "integer", minimum: 0 },
      label: NON_EMPTY_STRING_SCHEMA,
      cat: NON_EMPTY_STRING_SCHEMA,
      sev: { type: "integer", minimum: 1, maximum: 3 },
      fix: NON_EMPTY_STRING_SCHEMA,
      snippet: { type: "string" }
    }
  };

  var DOCUMENT_FINDING_SCHEMA = {
    type: "object",
    required: ["label", "cat", "sev", "detail"],
    properties: {
      label: NON_EMPTY_STRING_SCHEMA,
      cat: NON_EMPTY_STRING_SCHEMA,
      sev: { type: "integer", minimum: 1, maximum: 3 },
      detail: NON_EMPTY_STRING_SCHEMA
    }
  };

  var STYLE_HEURISTIC_SCHEMA = {
    type: "object",
    required: ["value", "scale", "kind", "label", "higherMeans", "calibrated", "isProbability", "band", "note"],
    properties: {
      value: { type: "number", minimum: 0, maximum: 100 },
      scale: {
        type: "object",
        required: ["min", "max"],
        properties: { min: { const: 0 }, max: { const: 100 } }
      },
      kind: { const: "uncalibrated_style_heuristic" },
      label: { const: "Style heuristic" },
      higherMeans: { const: "fewer configured stylistic signals" },
      calibrated: { const: false },
      isProbability: { const: false },
      band: NON_EMPTY_STRING_SCHEMA,
      note: NON_EMPTY_STRING_SCHEMA
    }
  };

  var STYLE_SIGNALS_SCHEMA = {
    type: "object",
    required: ["kind", "version", "text", "counts", "metrics", "findings", "heuristicStyleScore", "limitations"],
    properties: {
      kind: { const: "stylistic_signals" },
      version: { const: RESULT_SCHEMA_VERSION },
      text: { type: "string" },
      counts: {
        type: "object",
        required: ["words", "sentences"],
        properties: {
          words: { type: "integer", minimum: 0 },
          sentences: { type: "integer", minimum: 0 }
        }
      },
      metrics: {
        type: "object",
        required: ["meanSentenceLength", "sentenceLengthBurstiness", "emDashCount", "emDashesPerThousandWords", "contractionRatio"],
        properties: {
          meanSentenceLength: { type: "number", minimum: 0 },
          sentenceLengthBurstiness: { type: "number", minimum: 0 },
          emDashCount: { type: "integer", minimum: 0 },
          emDashesPerThousandWords: { type: "number", minimum: 0 },
          contractionRatio: { type: ["number", "null"], minimum: 0, maximum: 1 }
        }
      },
      findings: {
        type: "object",
        required: ["inline", "document"],
        properties: {
          inline: { type: "array", items: INLINE_FINDING_SCHEMA },
          document: { type: "array", items: DOCUMENT_FINDING_SCHEMA }
        }
      },
      heuristicStyleScore: STYLE_HEURISTIC_SCHEMA,
      limitations: { type: "array", minItems: 1, items: NON_EMPTY_STRING_SCHEMA }
    }
  };

  var EXTERNAL_OBSERVATION_SCHEMA = {
    type: "object",
    required: [
      "kind", "name", "version", "date", "raw", "normalized", "calibrated",
      "calibrationStatus", "limitations", "comparability"
    ],
    properties: {
      kind: { const: "external_detector_observation" },
      schemaVersion: { const: 1 },
      name: NON_EMPTY_STRING_SCHEMA,
      version: NON_EMPTY_STRING_SCHEMA,
      date: { type: "string", format: "date-time" },
      detector: {
        type: "object",
        required: ["name", "version"],
        properties: { name: NON_EMPTY_STRING_SCHEMA, version: NON_EMPTY_STRING_SCHEMA }
      },
      raw: {},
      normalized: {
        type: "object",
        required: ["providerSpecific", "semantics"],
        properties: {
          providerSpecific: { const: true },
          semantics: NON_EMPTY_STRING_SCHEMA,
          calibrated: { type: "boolean" }
        }
      },
      calibrated: { type: "boolean" },
      calibrationStatus: { enum: ["provider_declared", "not_calibrated"] },
      limitations: { type: "array", items: NON_EMPTY_STRING_SCHEMA },
      comparability: { const: "provider_specific" },
      note: NON_EMPTY_STRING_SCHEMA
    },
    allOf: [
      {
        if: { properties: { calibrated: { const: true } }, required: ["calibrated"] },
        then: { properties: { calibrationStatus: { const: "provider_declared" } } },
        else: { properties: { calibrationStatus: { const: "not_calibrated" } } }
      }
    ]
  };

  var DETECTOR_ESTIMATE_SCHEMA = {
    type: "object",
    required: ["kind", "status", "source", "calibrated", "probability", "label", "reason", "observations", "limitations"],
    properties: {
      kind: { const: "detector_estimate" },
      status: { enum: ["unavailable", "observed"] },
      source: { enum: ["local", "external_observations"] },
      calibrated: { const: false },
      probability: { type: "null" },
      label: { type: "null" },
      reason: NON_EMPTY_STRING_SCHEMA,
      observations: { type: "array", items: EXTERNAL_OBSERVATION_SCHEMA },
      limitations: { type: "array", minItems: 1, items: NON_EMPTY_STRING_SCHEMA }
    },
    allOf: [
      {
        if: { properties: { status: { const: "observed" } }, required: ["status"] },
        then: {
          properties: {
            source: { const: "external_observations" },
            observations: { minItems: 1 }
          }
        },
        else: { properties: { observations: { maxItems: 0 } } }
      }
    ]
  };

  function unavailableSchema(kind) {
    return {
      type: "object",
      required: ["kind", "status", "reason"],
      properties: {
        kind: { const: kind },
        status: { const: "not_applicable" },
        reason: NON_EMPTY_STRING_SCHEMA
      }
    };
  }

  var VOICE_COMPARISON_RESULT_SCHEMA = voiceSchema && voiceSchema.VOICE_COMPARISON_SCHEMA
    ? voiceSchema.VOICE_COMPARISON_SCHEMA
    : {
        type: "object",
        required: ["type", "schemaVersion", "score", "calibrated", "authorshipProbability"],
        properties: {
          type: { const: "VoiceComparison" },
          schemaVersion: { const: "1.0.0" },
          score: { type: "number", minimum: 0, maximum: 100 },
          calibrated: { const: false },
          authorshipProbability: { type: "null" }
        }
      };

  var WATERMARK_SCHEMA = {
    type: "object",
    required: ["kind", "provider", "scheme", "status", "evidenceSource", "raw", "limitations"],
    properties: {
      kind: { const: "watermark_provenance" },
      provider: { const: "anthropic" },
      scheme: { const: "synthid-text" },
      status: { enum: WATERMARK_STATUSES },
      verified: { type: "boolean" },
      reason: { type: ["string", "null"] },
      evidenceSource: NON_EMPTY_STRING_SCHEMA,
      raw: {},
      limitations: { type: "array", minItems: 1, items: NON_EMPTY_STRING_SCHEMA },
      verifierVersion: NON_EMPTY_STRING_SCHEMA,
      date: { type: "string", format: "date-time" }
    },
    oneOf: [
      {
        required: ["verified"],
        properties: { status: { const: "verified" }, verified: { const: true }, evidenceSource: { not: { const: "none" } } }
      },
      {
        required: ["verified"],
        properties: { status: { enum: ["not_verified", "inconclusive"] }, verified: { const: false }, evidenceSource: { not: { const: "none" } } }
      },
      {
        not: { required: ["verified"] },
        properties: { status: { enum: INTERNAL_PROVENANCE_STATUSES }, evidenceSource: { const: "none" } }
      }
    ]
  };

  var DOCUMENT_INTEGRITY_SCHEMA = {
    type: "object",
    required: ["kind", "status", "findings", "invisibleCharacterCount", "countsByCodePoint", "provenanceInterpretation"],
    properties: {
      kind: { const: "document_integrity" },
      status: { enum: ["clean", "review", "invalid"] },
      findings: {
        type: "array",
        items: {
          type: "object",
          required: ["type", "severity", "message"],
          properties: {
            type: { enum: ["invisible_character", "input"] },
            severity: { enum: ["warning", "error"] },
            message: NON_EMPTY_STRING_SCHEMA,
            index: { type: "integer", minimum: 0 },
            codePoint: { type: "string", pattern: "^U\\+[0-9A-F]{4,6}$" },
            name: NON_EMPTY_STRING_SCHEMA
          }
        }
      },
      invisibleCharacterCount: { type: "integer", minimum: 0 },
      countsByCodePoint: {
        type: "object",
        propertyNames: { pattern: "^U\\+[0-9A-F]{4,6}$" },
        additionalProperties: { type: "integer", minimum: 1 }
      },
      provenanceInterpretation: { enum: ["separate_signal", "not_evaluated"] },
      note: NON_EMPTY_STRING_SCHEMA
    }
  };

  var PROVENANCE_REPORT_SCHEMA = {
    type: "object",
    required: [
      "kind", "status", "provenanceStatus", "watermarks", "anthropicWatermark",
      "documentIntegrity", "explicitSignals", "limitations"
    ],
    properties: {
      kind: { const: "provenance_report" },
      status: { enum: REPORT_PROVENANCE_STATUSES },
      provenanceStatus: { enum: REPORT_PROVENANCE_STATUSES },
      watermarks: {
        type: "object",
        required: ["anthropic"],
        properties: { anthropic: WATERMARK_SCHEMA }
      },
      anthropicWatermark: WATERMARK_SCHEMA,
      documentIntegrity: DOCUMENT_INTEGRITY_SCHEMA,
      explicitSignals: { type: "array", maxItems: 1, items: WATERMARK_SCHEMA },
      limitations: { type: "array", minItems: 1, items: NON_EMPTY_STRING_SCHEMA }
    }
  };

  var ANALYSIS_RESULT_SCHEMA = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://sapienize.dev/schema/analysis-result-v2.json",
    type: "object",
    required: ["schemaVersion", "stylisticSignals", "detectorEstimate", "voiceMatch", "semanticIntegrity", "provenance"],
    properties: {
      schemaVersion: { const: RESULT_SCHEMA_VERSION },
      stylisticSignals: STYLE_SIGNALS_SCHEMA,
      detectorEstimate: DETECTOR_ESTIMATE_SCHEMA,
      voiceMatch: { oneOf: [unavailableSchema("voice_match"), { $ref: "#/$defs/voiceComparison" }] },
      semanticIntegrity: unavailableSchema("semantic_integrity"),
      provenance: PROVENANCE_REPORT_SCHEMA
    },
    $defs: {
      inlineStyleFinding: INLINE_FINDING_SCHEMA,
      documentStyleFinding: DOCUMENT_FINDING_SCHEMA,
      styleHeuristic: STYLE_HEURISTIC_SCHEMA,
      externalDetectorObservation: EXTERNAL_OBSERVATION_SCHEMA,
      watermarkProvenance: WATERMARK_SCHEMA,
      documentIntegrity: DOCUMENT_INTEGRITY_SCHEMA,
      voiceComparison: VOICE_COMPARISON_RESULT_SCHEMA
    }
  };

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
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
      if (symbols.length) { ancestors.pop(); return false; }
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
          if (!Object.prototype.hasOwnProperty.call(current, index)) { ancestors.pop(); return false; }
          var itemDescriptor = Object.getOwnPropertyDescriptor(current, String(index));
          if (!itemDescriptor || !itemDescriptor.enumerable || !Object.prototype.hasOwnProperty.call(itemDescriptor, "value") ||
              !inspect(itemDescriptor.value, ancestors)) { ancestors.pop(); return false; }
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
            !inspect(descriptor.value, ancestors)) { ancestors.pop(); return false; }
      }
      ancestors.pop();
      return true;
    }
    try { return inspect(value, []); }
    catch (_) { return false; }
  }

  function hasOwn(value, key) {
    return isObject(value) && Object.prototype.hasOwnProperty.call(value, key);
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function isNonNegativeInteger(value) {
    return Number.isInteger(value) && value >= 0;
  }

  function checkObject(value, path, errors) {
    if (!isObject(value)) {
      errors.push(path + " must be an object");
      return false;
    }
    return true;
  }

  function checkNonEmptyString(value, path, errors) {
    if (typeof value !== "string" || !value.trim()) errors.push(path + " must be a non-empty string");
  }

  function checkStringArray(value, path, errors, minimumLength) {
    if (!Array.isArray(value)) {
      errors.push(path + " must be an array");
      return false;
    }
    if (minimumLength && value.length < minimumLength) errors.push(path + " must not be empty");
    value.forEach(function (entry, index) { checkNonEmptyString(entry, path + "[" + index + "]", errors); });
    return true;
  }

  function checkScore(value, path, errors) {
    if (!isFiniteNumber(value) || value < 0 || value > 100) errors.push(path + " must be between 0 and 100");
  }

  function validateStyleFinding(finding, path, inline, textLength, errors) {
    if (!checkObject(finding, path, errors)) return;
    checkNonEmptyString(finding.label, path + ".label", errors);
    checkNonEmptyString(finding.cat, path + ".cat", errors);
    if (!Number.isInteger(finding.sev) || finding.sev < 1 || finding.sev > 3) errors.push(path + ".sev must be an integer from 1 to 3");
    if (inline) {
      if (!isNonNegativeInteger(finding.start)) errors.push(path + ".start must be a non-negative integer");
      if (!isNonNegativeInteger(finding.end)) errors.push(path + ".end must be a non-negative integer");
      if (isNonNegativeInteger(finding.start) && isNonNegativeInteger(finding.end) &&
          (finding.end < finding.start || finding.end > textLength)) {
        errors.push(path + " span must be ordered and within stylisticSignals.text");
      }
      checkNonEmptyString(finding.fix, path + ".fix", errors);
      if (typeof finding.snippet !== "string") errors.push(path + ".snippet must be a string");
    } else {
      checkNonEmptyString(finding.detail, path + ".detail", errors);
    }
  }

  function validateStylisticSignals(signals, errors) {
    var path = "stylisticSignals";
    if (!checkObject(signals, path, errors)) return;
    if (signals.kind !== "stylistic_signals") errors.push(path + ".kind must be stylistic_signals");
    if (signals.version !== RESULT_SCHEMA_VERSION) errors.push(path + ".version must be " + RESULT_SCHEMA_VERSION);
    if (typeof signals.text !== "string") errors.push(path + ".text must be a string");

    if (checkObject(signals.counts, path + ".counts", errors)) {
      ["words", "sentences"].forEach(function (key) {
        if (!isNonNegativeInteger(signals.counts[key])) errors.push(path + ".counts." + key + " must be a non-negative integer");
      });
    }

    if (checkObject(signals.metrics, path + ".metrics", errors)) {
      ["meanSentenceLength", "sentenceLengthBurstiness", "emDashesPerThousandWords"].forEach(function (key) {
        if (!isFiniteNumber(signals.metrics[key]) || signals.metrics[key] < 0) errors.push(path + ".metrics." + key + " must be a non-negative finite number");
      });
      if (!isNonNegativeInteger(signals.metrics.emDashCount)) errors.push(path + ".metrics.emDashCount must be a non-negative integer");
      if (signals.metrics.contractionRatio !== null &&
          (!isFiniteNumber(signals.metrics.contractionRatio) || signals.metrics.contractionRatio < 0 || signals.metrics.contractionRatio > 1)) {
        errors.push(path + ".metrics.contractionRatio must be null or between 0 and 1");
      }
      if (!hasOwn(signals.metrics, "contractionRatio")) errors.push(path + ".metrics.contractionRatio is required");
    }

    if (checkObject(signals.findings, path + ".findings", errors)) {
      ["inline", "document"].forEach(function (group) {
        var findings = signals.findings[group];
        if (!Array.isArray(findings)) {
          errors.push(path + ".findings." + group + " must be an array");
          return;
        }
        findings.forEach(function (finding, index) {
          validateStyleFinding(finding, path + ".findings." + group + "[" + index + "]", group === "inline", typeof signals.text === "string" ? signals.text.length : 0, errors);
        });
      });
    }

    var heuristic = signals.heuristicStyleScore;
    if (checkObject(heuristic, path + ".heuristicStyleScore", errors)) {
      checkScore(heuristic.value, path + ".heuristicStyleScore.value", errors);
      if (checkObject(heuristic.scale, path + ".heuristicStyleScore.scale", errors) &&
          (heuristic.scale.min !== 0 || heuristic.scale.max !== 100)) {
        errors.push(path + ".heuristicStyleScore.scale must be exactly 0 to 100");
      }
      if (heuristic.kind !== "uncalibrated_style_heuristic") errors.push(path + ".heuristicStyleScore.kind must be uncalibrated_style_heuristic");
      if (heuristic.label !== "Style heuristic") errors.push(path + ".heuristicStyleScore.label must be Style heuristic");
      if (heuristic.higherMeans !== "fewer configured stylistic signals") errors.push(path + ".heuristicStyleScore.higherMeans must describe fewer configured signals");
      if (heuristic.calibrated !== false) errors.push(path + ".heuristicStyleScore.calibrated must be false");
      if (heuristic.isProbability !== false) errors.push(path + ".heuristicStyleScore.isProbability must be false");
      checkNonEmptyString(heuristic.band, path + ".heuristicStyleScore.band", errors);
      checkNonEmptyString(heuristic.note, path + ".heuristicStyleScore.note", errors);
    }
    checkStringArray(signals.limitations, path + ".limitations", errors, 1);
  }

  function validateExternalObservation(observation, path, errors) {
    if (!checkObject(observation, path, errors)) return;
    if (!isJsonSafeValue(observation)) errors.push(path + " must contain only JSON-safe values");
    [
      "kind", "name", "version", "date", "raw", "normalized", "calibrated",
      "calibrationStatus", "limitations", "comparability"
    ].forEach(function (field) {
      if (!hasOwn(observation, field)) errors.push(path + "." + field + " must be an own property");
    });
    if (observation.kind !== "external_detector_observation") errors.push(path + ".kind must be external_detector_observation");
    if (hasOwn(observation, "schemaVersion") && observation.schemaVersion !== 1) errors.push(path + ".schemaVersion must be 1 when present");
    checkNonEmptyString(observation.name, path + ".name", errors);
    checkNonEmptyString(observation.version, path + ".version", errors);
    if (typeof observation.date !== "string" || !observation.date.trim() || !Number.isFinite(Date.parse(observation.date))) {
      errors.push(path + ".date must be a valid timestamp");
    }
    if (!hasOwn(observation, "raw")) errors.push(path + ".raw is required");
    else if (observation.raw === undefined || !isJsonSafeValue(observation.raw)) errors.push(path + ".raw must contain only JSON-safe values");
    if (hasOwn(observation, "detector")) {
      if (checkObject(observation.detector, path + ".detector", errors)) {
        if (observation.detector.name !== observation.name || observation.detector.version !== observation.version) {
          errors.push(path + ".detector identity must match name and version");
        }
      }
    }

    if (checkObject(observation.normalized, path + ".normalized", errors)) {
      if (!isJsonSafeValue(observation.normalized)) errors.push(path + ".normalized must contain only JSON-safe values");
      ["providerSpecific", "semantics"].forEach(function (field) {
        if (!hasOwn(observation.normalized, field)) errors.push(path + ".normalized." + field + " must be an own property");
      });
      if (observation.normalized.providerSpecific !== true) errors.push(path + ".normalized.providerSpecific must be true");
      checkNonEmptyString(observation.normalized.semantics, path + ".normalized.semantics", errors);
      if (hasOwn(observation.normalized, "calibrated") && observation.normalized.calibrated !== observation.calibrated) {
        errors.push(path + ".normalized.calibrated must match calibrated");
      }
      if (observation.calibrated === false &&
          (hasOwn(observation.normalized, "calibratedProbability") || hasOwn(observation.normalized, "calibrated_probability"))) {
        errors.push(path + " cannot contain a calibrated probability when calibrated is false");
      }
    }
    if (typeof observation.calibrated !== "boolean") errors.push(path + ".calibrated must be a boolean");
    var expectedCalibration = observation.calibrated === true ? "provider_declared" : "not_calibrated";
    if (observation.calibrationStatus !== expectedCalibration) errors.push(path + ".calibrationStatus is inconsistent with calibrated");
    checkStringArray(observation.limitations, path + ".limitations", errors, 0);
    if (observation.comparability !== "provider_specific") errors.push(path + ".comparability must be provider_specific");
    if (hasOwn(observation, "note")) checkNonEmptyString(observation.note, path + ".note", errors);
  }

  function validateDetectorEstimate(estimate, errors) {
    var path = "detectorEstimate";
    if (!checkObject(estimate, path, errors)) return;
    if (estimate.kind !== "detector_estimate") errors.push(path + ".kind must be detector_estimate");
    if (["unavailable", "observed"].indexOf(estimate.status) === -1) errors.push(path + ".status must be unavailable or observed");
    if (["local", "external_observations"].indexOf(estimate.source) === -1) errors.push(path + ".source must be local or external_observations");
    if (estimate.calibrated !== false) errors.push(path + ".calibrated must be false for the aggregate estimate");
    if (!hasOwn(estimate, "probability") || estimate.probability !== null) errors.push(path + ".probability must be null");
    if (!hasOwn(estimate, "label") || estimate.label !== null) errors.push(path + ".label must be null");
    checkNonEmptyString(estimate.reason, path + ".reason", errors);
    checkStringArray(estimate.limitations, path + ".limitations", errors, 1);
    if (!Array.isArray(estimate.observations)) {
      errors.push(path + ".observations must be an array");
      return;
    }
    estimate.observations.forEach(function (observation, index) {
      validateExternalObservation(observation, path + ".observations[" + index + "]", errors);
    });
    if (estimate.status === "observed") {
      if (estimate.source !== "external_observations") errors.push(path + ".source must be external_observations when status is observed");
      if (!estimate.observations.length) errors.push(path + ".observations must not be empty when status is observed");
    } else if (estimate.status === "unavailable" && estimate.observations.length) {
      errors.push(path + ".observations must be empty when status is unavailable");
    }
  }

  function validateUnavailable(value, path, kind, errors) {
    if (!checkObject(value, path, errors)) return;
    if (value.kind !== kind) errors.push(path + ".kind must be " + kind);
    if (value.status !== "not_applicable") errors.push(path + ".status must be not_applicable");
    checkNonEmptyString(value.reason, path + ".reason", errors);
  }

  function validateVoiceMatch(value, errors) {
    if (!checkObject(value, "voiceMatch", errors)) return;
    if (value.type !== "VoiceComparison") {
      validateUnavailable(value, "voiceMatch", "voice_match", errors);
      return;
    }
    if (!voiceSchema || typeof voiceSchema.validateVoiceComparison !== "function") {
      errors.push("voiceMatch could not be validated because the VoiceComparison validator is unavailable");
      return;
    }
    var validation = voiceSchema.validateVoiceComparison(value);
    if (!validation || validation.valid !== true) {
      var comparisonErrors = validation && Array.isArray(validation.errors) ? validation.errors : ["comparison is invalid"];
      comparisonErrors.forEach(function (error) { errors.push("voiceMatch." + error); });
    }
  }

  function validateWatermark(value, path, errors) {
    if (!checkObject(value, path, errors)) return false;
    var contractValidation = provenanceSchema && typeof provenanceSchema.validateAnthropicWatermarkResult === "function"
      ? provenanceSchema.validateAnthropicWatermarkResult(value)
      : null;
    if (contractValidation && contractValidation.valid !== true) {
      (Array.isArray(contractValidation.errors) ? contractValidation.errors : ["invalid watermark result"]).forEach(function (error) {
        errors.push(path + "." + error);
      });
    } else if (!contractValidation) {
      if (value.kind !== "watermark_provenance" || value.provider !== "anthropic" || value.scheme !== "synthid-text") {
        errors.push(path + " must be an Anthropic synthid-text watermark result");
      }
      if (WATERMARK_STATUSES.indexOf(value.status) === -1) errors.push(path + ".status is unsupported");
      var official = OFFICIAL_PROVENANCE_STATUSES.indexOf(value.status) !== -1;
      if (official && (typeof value.verified !== "boolean" || value.verified !== (value.status === "verified"))) {
        errors.push(path + ".verified is inconsistent with status");
      }
      if (official && (typeof value.evidenceSource !== "string" || !value.evidenceSource.trim() || value.evidenceSource.trim().toLowerCase() === "none")) {
        errors.push(path + ".evidenceSource must identify explicit official evidence");
      }
      if (!official && (value.evidenceSource !== "none" || hasOwn(value, "verified"))) {
        errors.push(path + " internal statuses cannot claim explicit verification");
      }
    }
    if (!hasOwn(value, "raw")) errors.push(path + ".raw is required");
    checkStringArray(value.limitations, path + ".limitations", errors, 1);
    if (hasOwn(value, "reason") && value.reason !== null && typeof value.reason !== "string") errors.push(path + ".reason must be a string or null");
    if (hasOwn(value, "verifierVersion")) checkNonEmptyString(value.verifierVersion, path + ".verifierVersion", errors);
    if (hasOwn(value, "date") && (typeof value.date !== "string" || !Number.isFinite(Date.parse(value.date)))) errors.push(path + ".date must be a valid timestamp");
    return contractValidation ? contractValidation.valid === true : errors.length === 0;
  }

  function sameJsonValue(left, right) {
    if (left === right) return true;
    if (left === null || right === null || typeof left !== typeof right) return false;
    if (Array.isArray(left) || Array.isArray(right)) {
      if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
      for (var index = 0; index < left.length; index++) {
        if (!sameJsonValue(left[index], right[index])) return false;
      }
      return true;
    }
    if (!isObject(left) || !isObject(right)) return false;
    var leftKeys = Object.keys(left).sort();
    var rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length) return false;
    for (var keyIndex = 0; keyIndex < leftKeys.length; keyIndex++) {
      if (leftKeys[keyIndex] !== rightKeys[keyIndex] ||
          !sameJsonValue(left[leftKeys[keyIndex]], right[rightKeys[keyIndex]])) return false;
    }
    return true;
  }

  function sameWatermarkContract(left, right) {
    return sameJsonValue(left, right);
  }

  function validateDocumentIntegrity(value, errors) {
    var path = "provenance.documentIntegrity";
    if (!checkObject(value, path, errors)) return;
    if (value.kind !== "document_integrity") errors.push(path + ".kind must be document_integrity");
    if (["clean", "review", "invalid"].indexOf(value.status) === -1) errors.push(path + ".status must be clean, review, or invalid");
    if (!isNonNegativeInteger(value.invisibleCharacterCount)) errors.push(path + ".invisibleCharacterCount must be a non-negative integer");
    if (!Array.isArray(value.findings)) errors.push(path + ".findings must be an array");
    if (!checkObject(value.countsByCodePoint, path + ".countsByCodePoint", errors)) return;

    var total = 0;
    Object.keys(value.countsByCodePoint).forEach(function (key) {
      var count = value.countsByCodePoint[key];
      if (!/^U\+[0-9A-F]{4,6}$/.test(key) || !Number.isInteger(count) || count < 1) {
        errors.push(path + ".countsByCodePoint." + key + " must be a positive integer keyed by an uppercase code point");
      } else {
        total += count;
      }
    });
    if (isNonNegativeInteger(value.invisibleCharacterCount) && total !== value.invisibleCharacterCount) {
      errors.push(path + ".countsByCodePoint must total invisibleCharacterCount");
    }

    if (Array.isArray(value.findings)) {
      var findingCounts = Object.create(null);
      value.findings.forEach(function (finding, index) {
        var findingPath = path + ".findings[" + index + "]";
        if (!checkObject(finding, findingPath, errors)) return;
        checkNonEmptyString(finding.message, findingPath + ".message", errors);
        if (value.status === "invalid") {
          if (finding.type !== "input" || finding.severity !== "error") errors.push(findingPath + " must be an input error for invalid document integrity");
          return;
        }
        if (finding.type !== "invisible_character" || finding.severity !== "warning") errors.push(findingPath + " must be an invisible-character warning");
        if (!isNonNegativeInteger(finding.index)) errors.push(findingPath + ".index must be a non-negative integer");
        if (typeof finding.codePoint !== "string" || !/^U\+[0-9A-F]{4,6}$/.test(finding.codePoint)) errors.push(findingPath + ".codePoint must be an uppercase code point");
        else findingCounts[finding.codePoint] = (findingCounts[finding.codePoint] || 0) + 1;
        checkNonEmptyString(finding.name, findingPath + ".name", errors);
      });
      Object.keys(findingCounts).forEach(function (key) {
        if (findingCounts[key] !== value.countsByCodePoint[key]) errors.push(path + ".findings and countsByCodePoint disagree for " + key);
      });
    }

    if (value.status === "clean") {
      if (value.invisibleCharacterCount !== 0 || (Array.isArray(value.findings) && value.findings.length !== 0)) errors.push(path + " clean status cannot contain findings");
      if (value.provenanceInterpretation !== "separate_signal") errors.push(path + ".provenanceInterpretation must be separate_signal");
      checkNonEmptyString(value.note, path + ".note", errors);
    } else if (value.status === "review") {
      if (!(value.invisibleCharacterCount > 0) || !Array.isArray(value.findings) || value.findings.length !== value.invisibleCharacterCount) {
        errors.push(path + " review status must contain one finding per invisible character");
      }
      if (value.provenanceInterpretation !== "separate_signal") errors.push(path + ".provenanceInterpretation must be separate_signal");
      checkNonEmptyString(value.note, path + ".note", errors);
    } else if (value.status === "invalid") {
      if (value.invisibleCharacterCount !== 0 || !Array.isArray(value.findings) || !value.findings.length) errors.push(path + " invalid status must contain an input error and no invisible-character count");
      if (value.provenanceInterpretation !== "not_evaluated") errors.push(path + ".provenanceInterpretation must be not_evaluated");
    }
  }

  function validateProvenance(report, errors) {
    var path = "provenance";
    if (!checkObject(report, path, errors)) return;
    if (report.kind !== "provenance_report") errors.push(path + ".kind must be provenance_report");
    if (REPORT_PROVENANCE_STATUSES.indexOf(report.status) === -1) errors.push(path + ".status is unsupported");
    if (report.provenanceStatus !== report.status) errors.push(path + ".provenanceStatus must equal status");
    checkStringArray(report.limitations, path + ".limitations", errors, 1);
    validateDocumentIntegrity(report.documentIntegrity, errors);

    var nested = null;
    if (checkObject(report.watermarks, path + ".watermarks", errors)) nested = report.watermarks.anthropic;
    validateWatermark(nested, path + ".watermarks.anthropic", errors);
    validateWatermark(report.anthropicWatermark, path + ".anthropicWatermark", errors);
    if (!sameWatermarkContract(nested, report.anthropicWatermark)) errors.push(path + ".watermarks.anthropic and anthropicWatermark must describe the same result");

    var child = isObject(report.anthropicWatermark) ? report.anthropicWatermark : null;
    if (child && WATERMARK_STATUSES.indexOf(child.status) !== -1) {
      var expectedStatus = child.status === "unsupported" ? "unknown" : child.status;
      if (report.status !== expectedStatus) errors.push(path + ".status is inconsistent with anthropicWatermark.status");
    }

    if (!Array.isArray(report.explicitSignals)) {
      errors.push(path + ".explicitSignals must be an array");
      return;
    }
    var official = child && OFFICIAL_PROVENANCE_STATUSES.indexOf(child.status) !== -1;
    if (official) {
      if (report.explicitSignals.length !== 1) errors.push(path + ".explicitSignals must contain the explicit official result");
      if (report.explicitSignals.length) {
        validateWatermark(report.explicitSignals[0], path + ".explicitSignals[0]", errors);
        if (!sameWatermarkContract(child, report.explicitSignals[0])) errors.push(path + ".explicitSignals[0] must match anthropicWatermark");
      }
    } else if (report.explicitSignals.length !== 0) {
      errors.push(path + ".explicitSignals must be empty without an official verifier result");
    }
  }

  function validateText(text, name) {
    if (typeof text !== "string") throw new TypeError((name || "text") + " must be a string");
    return text;
  }

  function validateAnalysisResult(result) {
    var errors = [];
    try {
      if (!isObject(result)) return { valid: false, errors: ["result must be an object"] };
      if (!isJsonSafeValue(result)) {
        return {
          valid: false,
          errors: ["result must be a JSON-safe record tree with own enumerable data properties"]
        };
      }
      if (result.schemaVersion !== RESULT_SCHEMA_VERSION) errors.push("schemaVersion must be " + RESULT_SCHEMA_VERSION);
      validateStylisticSignals(result.stylisticSignals, errors);
      validateDetectorEstimate(result.detectorEstimate, errors);
      validateVoiceMatch(result.voiceMatch, errors);
      validateUnavailable(result.semanticIntegrity, "semanticIntegrity", "semantic_integrity", errors);
      validateProvenance(result.provenance, errors);
    } catch (_) {
      errors.push("result could not be inspected safely");
    }
    return { valid: errors.length === 0, errors: errors };
  }

  function unavailable(kind, reason) {
    return { kind: kind, status: "not_applicable", reason: reason };
  }

  return {
    RESULT_SCHEMA_VERSION: RESULT_SCHEMA_VERSION,
    ANALYSIS_RESULT_SCHEMA: ANALYSIS_RESULT_SCHEMA,
    validateText: validateText,
    validateAnalysisResult: validateAnalysisResult,
    unavailable: unavailable
  };
});
