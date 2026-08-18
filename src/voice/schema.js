/* Sapienize v2 VoiceProfile schema and dependency-free validation. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SapienizeVoiceSchema = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  var VOICE_PROFILE_SCHEMA_VERSION = "1.0.0";
  var VOICE_PROFILE_TYPE = "VoiceProfile";
  var VOICE_COMPARISON_SCHEMA_VERSION = "1.0.0";
  var VOICE_COMPARISON_TYPE = "VoiceComparison";

  // This intentionally stays small enough to ship in the classic-browser build.
  // Runtime validation below checks the detailed numeric feature contract.
  var VOICE_PROFILE_SCHEMA = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://sapienize.dev/schemas/voice-profile-1.0.0.json",
    title: "Sapienize VoiceProfile",
    type: "object",
    required: ["type", "schemaVersion", "sample", "warnings", "features"],
    properties: {
      type: { const: VOICE_PROFILE_TYPE },
      schemaVersion: { const: VOICE_PROFILE_SCHEMA_VERSION },
      sample: {
        type: "object",
        required: ["sampleCount", "wordCount", "sentenceCount", "paragraphCount", "recommendedMinimumWords", "meetsRecommendedMinimum"]
      },
      warnings: { type: "array" },
      features: {
        type: "object",
        required: [
          "sentenceLength", "paragraphLength", "fragments", "lexicalDiversity",
          "contractions", "punctuation", "parentheticals", "questions", "pronouns",
          "functionWords", "conjunctions", "transitions", "hedges", "intensifiers",
          "discourseMarkers", "spellingConvention", "register", "sentenceOpenings",
          "vocabulary", "rhythm"
        ]
      }
    }
  };

  var REQUIRED_FEATURES = VOICE_PROFILE_SCHEMA.properties.features.required.slice();

  var VOICE_COMPARISON_SCHEMA = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://sapienize.dev/schemas/voice-comparison-1.0.0.json",
    title: "Sapienize VoiceComparison",
    type: "object",
    required: [
      "type", "schemaVersion", "score", "similarity", "aggregateSimilarity",
      "normalizedSimilarity", "calibrated", "authorshipProbability", "disclaimer",
      "referenceSample", "observedSample", "warnings", "components", "differences", "methodology"
    ],
    properties: {
      type: { const: VOICE_COMPARISON_TYPE },
      schemaVersion: { const: VOICE_COMPARISON_SCHEMA_VERSION },
      score: { type: "number", minimum: 0, maximum: 100 },
      similarity: { type: "number", minimum: 0, maximum: 100 },
      aggregateSimilarity: { type: "number", minimum: 0, maximum: 100 },
      normalizedSimilarity: { type: "number", minimum: 0, maximum: 1 },
      calibrated: { const: false },
      authorshipProbability: { type: "null" },
      disclaimer: { type: "string", minLength: 1 },
      referenceSample: {
        type: "object",
        required: ["wordCount", "sentenceCount", "paragraphCount"]
      },
      observedSample: {
        type: "object",
        required: ["wordCount", "sentenceCount", "paragraphCount"]
      },
      warnings: { type: "array" },
      components: { type: "object" },
      differences: { type: "array" },
      methodology: {
        type: "object",
        required: ["name", "version", "calibrated", "purpose"]
      }
    }
  };

  var REQUIRED_COMPARISON_COMPONENTS = [
    "sentenceLength", "paragraphLength", "fragments", "lexicalDiversity", "contractions",
    "punctuation", "parentheticalsAndQuestions", "pronouns", "functionWords", "connectors",
    "hedges", "intensifiers", "discourseMarkers", "spellingConvention", "register",
    "sentenceOpenings", "vocabulary", "rhythm"
  ];
  VOICE_COMPARISON_SCHEMA.properties.components.required = REQUIRED_COMPARISON_COMPONENTS.slice();

  function isObject(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    try {
      var prototype = Object.getPrototypeOf(value);
      return prototype === Object.prototype || prototype === null;
    } catch (_) {
      return false;
    }
  }

  // Profiles and comparisons are public JSON contracts. Reject values whose
  // live property lookup differs from their serialized representation (for
  // example inherited fields, accessors, sparse arrays, or undefined values).
  function isJsonSafeValue(value) {
    function inspect(current, ancestors) {
      if (current === null || typeof current === "string" || typeof current === "boolean") return true;
      if (typeof current === "number") return isFinite(current);
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
        if (names.length !== current.length + 1 || names.indexOf("length") === -1) {
          ancestors.pop();
          return false;
        }
        for (var index = 0; index < current.length; index++) {
          if (!Object.prototype.hasOwnProperty.call(current, index)) {
            ancestors.pop();
            return false;
          }
          var itemDescriptor = Object.getOwnPropertyDescriptor(current, String(index));
          if (!itemDescriptor || !itemDescriptor.enumerable ||
              !Object.prototype.hasOwnProperty.call(itemDescriptor, "value") ||
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
        if (!descriptor || !descriptor.enumerable ||
            !Object.prototype.hasOwnProperty.call(descriptor, "value") ||
            !inspect(descriptor.value, ancestors)) {
          ancestors.pop();
          return false;
        }
      }
      ancestors.pop();
      return true;
    }

    try {
      return inspect(value, []);
    } catch (_) {
      return false;
    }
  }

  function hasOwn(value, key) {
    return isObject(value) && Object.prototype.hasOwnProperty.call(value, key);
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  function checkNonNegativeNumber(value, path, errors, nullable) {
    if (nullable && value === null) return;
    if (!isFiniteNumber(value) || value < 0) errors.push(path + " must be a non-negative finite number");
  }

  function checkRate(value, path, errors, nullable) {
    if (nullable && value === null) return;
    if (!isFiniteNumber(value) || value < 0 || value > 1) errors.push(path + " must be between 0 and 1");
  }

  function checkScore(value, path, errors) {
    if (!isFiniteNumber(value) || value < 0 || value > 100) errors.push(path + " must be between 0 and 100");
  }

  function checkPositiveNumber(value, path, errors) {
    if (!isFiniteNumber(value) || value <= 0) errors.push(path + " must be a positive finite number");
  }

  function checkString(value, path, errors) {
    if (typeof value !== "string" || !value.trim()) errors.push(path + " must be a non-empty string");
  }

  function checkStringArray(value, path, errors) {
    if (!Array.isArray(value)) {
      errors.push(path + " must be an array");
      return;
    }
    value.forEach(function (entry, index) {
      checkString(entry, path + "[" + index + "]", errors);
    });
  }

  function checkNumberArray(value, path, errors) {
    if (!Array.isArray(value)) {
      errors.push(path + " must be an array");
      return;
    }
    value.forEach(function (entry, index) {
      checkNonNegativeNumber(entry, path + "[" + index + "]", errors, false);
    });
  }

  function checkNumericMap(value, path, errors, requiredKeys) {
    if (!isObject(value)) {
      errors.push(path + " must be an object");
      return;
    }
    Object.keys(value).forEach(function (key) {
      checkNonNegativeNumber(value[key], path + "." + key, errors, false);
    });
    (requiredKeys || []).forEach(function (key) {
      if (!hasOwn(value, key)) errors.push(path + "." + key + " is required");
    });
  }

  function checkStatistics(value, path, errors) {
    if (!isObject(value)) {
      errors.push(path + " must be an object");
      return;
    }
    ["count", "mean", "median", "standardDeviation", "minimum", "maximum"].forEach(function (key) {
      checkNonNegativeNumber(value[key], path + "." + key, errors, false);
    });
  }

  function checkSampleSummary(value, path, errors, includeRecommendation) {
    if (!isObject(value)) {
      errors.push(path + " must be an object");
      return;
    }
    ["wordCount", "sentenceCount", "paragraphCount"].forEach(function (key) {
      checkNonNegativeNumber(value[key], path + "." + key, errors, false);
    });
    if (includeRecommendation) {
      checkNonNegativeNumber(value.sampleCount, path + ".sampleCount", errors, false);
      checkNonNegativeNumber(value.recommendedMinimumWords, path + ".recommendedMinimumWords", errors, false);
      if (typeof value.meetsRecommendedMinimum !== "boolean") {
        errors.push(path + ".meetsRecommendedMinimum must be a boolean");
      }
    }
  }

  function checkPhraseFeature(value, path, errors) {
    checkNonNegativeNumber(value.count, path + ".count", errors, false);
    checkNonNegativeNumber(value.perThousandWords, path + ".perThousandWords", errors, false);
    checkNumericMap(value.frequencies, path + ".frequencies", errors);
    checkStringArray(value.preferred, path + ".preferred", errors);
    checkStringArray(value.recurring, path + ".recurring", errors);
  }

  function checkTopContentWords(value, path, errors) {
    if (!Array.isArray(value)) {
      errors.push(path + " must be an array");
      return;
    }
    value.forEach(function (entry, index) {
      var entryPath = path + "[" + index + "]";
      if (!isObject(entry)) {
        errors.push(entryPath + " must be an object");
        return;
      }
      checkString(entry.word, entryPath + ".word", errors);
      checkNonNegativeNumber(entry.count, entryPath + ".count", errors, false);
      checkNonNegativeNumber(entry.perThousandWords, entryPath + ".perThousandWords", errors, false);
    });
  }

  function validateVoiceProfile(profile) {
    var errors = [];
    if (!isObject(profile)) return { valid: false, errors: ["profile must be an object"] };
    if (!isJsonSafeValue(profile)) {
      return { valid: false, errors: ["profile must contain only own, enumerable JSON-safe data properties"] };
    }

    if (profile.type !== VOICE_PROFILE_TYPE) errors.push("type must be " + VOICE_PROFILE_TYPE);
    if (profile.schemaVersion !== VOICE_PROFILE_SCHEMA_VERSION) {
      errors.push("schemaVersion must be " + VOICE_PROFILE_SCHEMA_VERSION);
    }

    checkSampleSummary(profile.sample, "sample", errors, true);

    if (!Array.isArray(profile.warnings)) errors.push("warnings must be an array");
    if (!isObject(profile.features)) {
      errors.push("features must be an object");
      return { valid: false, errors: errors };
    }

    var featuresReady = true;
    REQUIRED_FEATURES.forEach(function (name) {
      if (!isObject(profile.features[name])) {
        errors.push("features." + name + " must be an object");
        featuresReady = false;
      }
    });
    if (!featuresReady) return { valid: false, errors: errors };

    var f = profile.features;
    checkStatistics(f.sentenceLength, "features.sentenceLength", errors);
    ["p10", "p25", "p75", "p90"].forEach(function (key) {
      checkNonNegativeNumber(f.sentenceLength[key], "features.sentenceLength." + key, errors, false);
    });
    checkNumericMap(f.sentenceLength.distribution, "features.sentenceLength.distribution", errors);
    checkNumericMap(f.sentenceLength.distributionRates, "features.sentenceLength.distributionRates", errors);

    checkNonNegativeNumber(f.paragraphLength.count, "features.paragraphLength.count", errors, false);
    ["words", "sentences"].forEach(function (unit) {
      checkStatistics(f.paragraphLength[unit], "features.paragraphLength." + unit, errors);
    });
    checkNumberArray(f.paragraphLength.wordDistribution, "features.paragraphLength.wordDistribution", errors);
    checkNumberArray(f.paragraphLength.sentenceDistribution, "features.paragraphLength.sentenceDistribution", errors);

    ["fragmentCount", "shortSentenceCount", "shortSentenceMaximumWords"].forEach(function (key) {
      checkNonNegativeNumber(f.fragments[key], "features.fragments." + key, errors, false);
    });
    ["fragmentRate", "shortSentenceRate"].forEach(function (key) {
      checkRate(f.fragments[key], "features.fragments." + key, errors, false);
    });
    checkString(f.fragments.method, "features.fragments.method", errors);

    ["typeTokenRatio", "movingAverageTypeTokenRatio", "hapaxRate"].forEach(function (key) {
      checkRate(f.lexicalDiversity[key], "features.lexicalDiversity." + key, errors, false);
    });
    checkNonNegativeNumber(f.lexicalDiversity.rootTypeTokenRatio, "features.lexicalDiversity.rootTypeTokenRatio", errors, false);
    ["tokenCount", "uniqueTokenCount", "movingAverageWindow"].forEach(function (key) {
      checkNonNegativeNumber(f.lexicalDiversity[key], "features.lexicalDiversity." + key, errors, false);
    });

    ["count", "expandedCount", "opportunities", "perThousandWords"].forEach(function (key) {
      checkNonNegativeNumber(f.contractions[key], "features.contractions." + key, errors, false);
    });
    checkRate(f.contractions.rate, "features.contractions.rate", errors, true);
    checkNumericMap(f.contractions.forms, "features.contractions.forms", errors);
    if (["no-evidence", "frequent", "mixed", "expanded"].indexOf(f.contractions.preference) === -1) {
      errors.push("features.contractions.preference is invalid");
    }

    checkNumericMap(f.punctuation.counts, "features.punctuation.counts", errors);
    checkNumericMap(f.punctuation.perThousandWords, "features.punctuation.perThousandWords", errors, [
      "period", "comma", "semicolon", "colon", "emDash", "enDash", "hyphen", "ellipsis",
      "exclamation", "question", "apostrophe", "doubleQuote"
    ]);
    ["count", "roundCount", "squareCount", "dashPairCount", "perHundredSentences"].forEach(function (key) {
      checkNonNegativeNumber(f.parentheticals[key], "features.parentheticals." + key, errors, false);
    });
    checkNonNegativeNumber(f.questions.count, "features.questions.count", errors, false);
    checkRate(f.questions.rate, "features.questions.rate", errors, false);

    checkNumericMap(f.pronouns.counts, "features.pronouns.counts", errors, ["firstPerson", "secondPerson", "thirdPerson"]);
    checkNumericMap(f.pronouns.perHundredWords, "features.pronouns.perHundredWords", errors, ["firstPerson", "secondPerson", "thirdPerson"]);
    checkNumericMap(f.pronouns.forms, "features.pronouns.forms", errors);
    checkNumericMap(f.functionWords.counts, "features.functionWords.counts", errors);
    checkNumericMap(f.functionWords.perHundredWords, "features.functionWords.perHundredWords", errors);
    checkRate(f.functionWords.totalRate, "features.functionWords.totalRate", errors, false);
    checkNumericMap(f.conjunctions.counts, "features.conjunctions.counts", errors);
    checkNumericMap(f.conjunctions.perHundredWords, "features.conjunctions.perHundredWords", errors);
    checkNumericMap(f.conjunctions.preferences, "features.conjunctions.preferences", errors);
    ["transitions", "hedges", "intensifiers", "discourseMarkers"].forEach(function (key) {
      checkPhraseFeature(f[key], "features." + key, errors);
    });

    if (["uk", "us", "mixed", "undetermined"].indexOf(f.spellingConvention.classification) === -1) {
      errors.push("features.spellingConvention.classification is invalid");
    }
    checkNonNegativeNumber(f.spellingConvention.ukCount, "features.spellingConvention.ukCount", errors, false);
    checkNonNegativeNumber(f.spellingConvention.usCount, "features.spellingConvention.usCount", errors, false);
    checkNumericMap(f.spellingConvention.evidence, "features.spellingConvention.evidence", errors);

    if (["conversational", "neutral", "formal"].indexOf(f.register.label) === -1) {
      errors.push("features.register.label is invalid");
    }
    checkRate(f.register.formality, "features.register.formality", errors, false);
    checkNonNegativeNumber(f.register.formalMarkerCount, "features.register.formalMarkerCount", errors, false);
    checkNonNegativeNumber(f.register.informalMarkerCount, "features.register.informalMarkerCount", errors, false);
    checkNumericMap(f.register.formalMarkers, "features.register.formalMarkers", errors);
    checkNumericMap(f.register.informalMarkers, "features.register.informalMarkers", errors);
    checkString(f.register.method, "features.register.method", errors);

    var openingTypes = ["firstPerson", "secondPerson", "thirdPerson", "article", "conjunction", "transition", "questionWord", "adverb", "other"];
    checkNumericMap(f.sentenceOpenings.counts, "features.sentenceOpenings.counts", errors, openingTypes);
    checkNumericMap(f.sentenceOpenings.typeRates, "features.sentenceOpenings.typeRates", errors, openingTypes);
    checkNumericMap(f.sentenceOpenings.openingWords, "features.sentenceOpenings.openingWords", errors);
    checkStringArray(f.sentenceOpenings.preferred, "features.sentenceOpenings.preferred", errors);
    checkNonNegativeNumber(f.vocabulary.averageWordLength, "features.vocabulary.averageWordLength", errors, false);
    checkRate(f.vocabulary.longWordRate, "features.vocabulary.longWordRate", errors, false);
    checkRate(f.vocabulary.contentWordRate, "features.vocabulary.contentWordRate", errors, false);
    checkNumericMap(f.vocabulary.wordLengthDistribution, "features.vocabulary.wordLengthDistribution", errors, ["oneToFour", "fiveToSeven", "eightToTen", "elevenPlus"]);
    checkTopContentWords(f.vocabulary.topContentWords, "features.vocabulary.topContentWords", errors);
    ["coefficientOfVariation", "burstiness", "meanAdjacentChange", "shortLongAlternationRate", "interquartileRange"].forEach(function (key) {
      checkNonNegativeNumber(f.rhythm[key], "features.rhythm." + key, errors, false);
    });
    checkNumberArray(f.rhythm.lengthSequence, "features.rhythm.lengthSequence", errors);

    return { valid: errors.length === 0, errors: errors };
  }

  function isVoiceProfile(profile) {
    return validateVoiceProfile(profile).valid;
  }

  function assertVoiceProfile(profile) {
    var validation = validateVoiceProfile(profile);
    if (!validation.valid) throw new TypeError("Invalid VoiceProfile: " + validation.errors.join("; "));
    return profile;
  }

  function validateVoiceComparison(comparison) {
    var errors = [];
    if (!isObject(comparison)) return { valid: false, errors: ["comparison must be an object"] };
    if (!isJsonSafeValue(comparison)) {
      return { valid: false, errors: ["comparison must contain only own, enumerable JSON-safe data properties"] };
    }

    if (comparison.type !== VOICE_COMPARISON_TYPE) errors.push("type must be " + VOICE_COMPARISON_TYPE);
    if (comparison.schemaVersion !== VOICE_COMPARISON_SCHEMA_VERSION) {
      errors.push("schemaVersion must be " + VOICE_COMPARISON_SCHEMA_VERSION);
    }
    ["score", "similarity", "aggregateSimilarity"].forEach(function (key) {
      checkScore(comparison[key], key, errors);
    });
    checkRate(comparison.normalizedSimilarity, "normalizedSimilarity", errors, false);
    if (comparison.calibrated !== false) errors.push("calibrated must be false");
    if (comparison.authorshipProbability !== null) errors.push("authorshipProbability must be null");
    checkString(comparison.disclaimer, "disclaimer", errors);
    checkSampleSummary(comparison.referenceSample, "referenceSample", errors, false);
    checkSampleSummary(comparison.observedSample, "observedSample", errors, false);
    if (!Array.isArray(comparison.warnings)) errors.push("warnings must be an array");

    if (!isObject(comparison.components)) {
      errors.push("components must be an object");
    } else {
      REQUIRED_COMPARISON_COMPONENTS.forEach(function (key) {
        if (!hasOwn(comparison.components, key)) errors.push("components." + key + " is required");
      });
      Object.keys(comparison.components).forEach(function (key) {
        var component = comparison.components[key];
        var path = "components." + key;
        if (!isObject(component)) {
          errors.push(path + " must be an object");
          return;
        }
        checkString(component.label, path + ".label", errors);
        checkScore(component.similarity, path + ".similarity", errors);
        checkScore(component.difference, path + ".difference", errors);
        if (!isObject(component.reference)) errors.push(path + ".reference must be an object");
        if (!isObject(component.observed)) errors.push(path + ".observed must be an object");
        checkString(component.summary, path + ".summary", errors);
        checkPositiveNumber(component.weight, path + ".weight", errors);
      });
    }

    if (!Array.isArray(comparison.differences)) {
      errors.push("differences must be an array");
    } else {
      comparison.differences.forEach(function (difference, index) {
        var path = "differences[" + index + "]";
        if (!isObject(difference)) {
          errors.push(path + " must be an object");
          return;
        }
        checkString(difference.component, path + ".component", errors);
        checkString(difference.label, path + ".label", errors);
        checkScore(difference.similarity, path + ".similarity", errors);
        checkScore(difference.difference, path + ".difference", errors);
        checkString(difference.summary, path + ".summary", errors);
      });
    }

    if (!isObject(comparison.methodology)) {
      errors.push("methodology must be an object");
    } else {
      checkString(comparison.methodology.name, "methodology.name", errors);
      checkString(comparison.methodology.version, "methodology.version", errors);
      if (comparison.methodology.calibrated !== false) errors.push("methodology.calibrated must be false");
      checkString(comparison.methodology.purpose, "methodology.purpose", errors);
    }

    if (isFiniteNumber(comparison.score) && isFiniteNumber(comparison.similarity) && comparison.score !== comparison.similarity) {
      errors.push("score and similarity must match");
    }
    if (isFiniteNumber(comparison.aggregateSimilarity) && isFiniteNumber(comparison.similarity) && comparison.aggregateSimilarity !== comparison.similarity) {
      errors.push("aggregateSimilarity and similarity must match");
    }
    if (isFiniteNumber(comparison.normalizedSimilarity) && isFiniteNumber(comparison.similarity) &&
        Math.abs(comparison.normalizedSimilarity - comparison.similarity / 100) > 0.000001) {
      errors.push("normalizedSimilarity must equal similarity divided by 100");
    }

    return { valid: errors.length === 0, errors: errors };
  }

  function isVoiceComparison(comparison) {
    return validateVoiceComparison(comparison).valid;
  }

  function assertVoiceComparison(comparison) {
    var validation = validateVoiceComparison(comparison);
    if (!validation.valid) throw new TypeError("Invalid VoiceComparison: " + validation.errors.join("; "));
    return comparison;
  }

  return {
    VOICE_PROFILE_SCHEMA_VERSION: VOICE_PROFILE_SCHEMA_VERSION,
    VOICE_PROFILE_TYPE: VOICE_PROFILE_TYPE,
    VOICE_PROFILE_SCHEMA: VOICE_PROFILE_SCHEMA,
    REQUIRED_FEATURES: REQUIRED_FEATURES,
    validateVoiceProfile: validateVoiceProfile,
    isVoiceProfile: isVoiceProfile,
    assertVoiceProfile: assertVoiceProfile,
    VOICE_COMPARISON_SCHEMA_VERSION: VOICE_COMPARISON_SCHEMA_VERSION,
    VOICE_COMPARISON_TYPE: VOICE_COMPARISON_TYPE,
    VOICE_COMPARISON_SCHEMA: VOICE_COMPARISON_SCHEMA,
    REQUIRED_COMPARISON_COMPONENTS: REQUIRED_COMPARISON_COMPONENTS.slice(),
    validateVoiceComparison: validateVoiceComparison,
    isVoiceComparison: isVoiceComparison,
    assertVoiceComparison: assertVoiceComparison
  };
}));
