/* Sapienize v2 descriptive voice comparison. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./schema.js"), require("./profile.js"));
  } else {
    root.SapienizeVoiceCompare = factory(root.SapienizeVoiceSchema, root.SapienizeVoiceProfile);
  }
}(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this), function (Schema, VoiceProfile) {
  "use strict";

  if (!Schema || !VoiceProfile) {
    throw new Error("SapienizeVoiceSchema and SapienizeVoiceProfile must be loaded before SapienizeVoiceCompare");
  }

  var DISCLAIMER = "Descriptive feature similarity only. This score is not calibrated and is not a probability of authorship or identity.";

  function round(value, places) {
    var factor = Math.pow(10, places === undefined ? 2 : places);
    return Math.round((value + (Number.EPSILON || 0)) * factor) / factor;
  }

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function createFrequencyMap() {
    return Object.create(null);
  }

  function hasOwn(map, key) {
    return map !== null && map !== undefined && Object.prototype.hasOwnProperty.call(map, key);
  }

  function mapValue(map, key) {
    return hasOwn(map, key) ? map[key] : 0;
  }

  function average(values) {
    if (!values.length) return 100;
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function scalarSimilarity(reference, observed, tolerance) {
    if (reference === observed) return 100;
    if (typeof reference !== "number" || typeof observed !== "number" || !isFinite(reference) || !isFinite(observed)) return 50;
    return 100 * Math.exp(-Math.abs(reference - observed) / Math.max(tolerance, 0.000001));
  }

  function nullableRateSimilarity(reference, observed, tolerance) {
    if (reference === null && observed === null) return 100;
    if (reference === null || observed === null) return 70;
    return scalarSimilarity(reference, observed, tolerance);
  }

  function distributionSimilarity(reference, observed) {
    var keys = createFrequencyMap();
    Object.keys(reference || {}).forEach(function (key) { keys[key] = 1; });
    Object.keys(observed || {}).forEach(function (key) { keys[key] = 1; });
    var referenceTotal = Object.keys(keys).reduce(function (sum, key) { return sum + mapValue(reference, key); }, 0);
    var observedTotal = Object.keys(keys).reduce(function (sum, key) { return sum + mapValue(observed, key); }, 0);
    if (!referenceTotal && !observedTotal) return 100;
    if (!referenceTotal || !observedTotal) return 0;
    var distance = Object.keys(keys).reduce(function (sum, key) {
      return sum + Math.abs(mapValue(reference, key) / referenceTotal - mapValue(observed, key) / observedTotal);
    }, 0) / 2;
    return 100 * clamp(1 - distance, 0, 1);
  }

  function rateMapSimilarity(reference, observed, emptyMismatchScore) {
    var keys = createFrequencyMap();
    Object.keys(reference || {}).forEach(function (key) { keys[key] = 1; });
    Object.keys(observed || {}).forEach(function (key) { keys[key] = 1; });
    var referenceTotal = 0;
    var observedTotal = 0;
    var absoluteDifference = 0;
    Object.keys(keys).forEach(function (key) {
      var a = mapValue(reference, key);
      var b = mapValue(observed, key);
      referenceTotal += a;
      observedTotal += b;
      absoluteDifference += Math.abs(a - b);
    });
    if (!referenceTotal && !observedTotal) return 100;
    if (!referenceTotal || !observedTotal) return emptyMismatchScore === undefined ? 25 : emptyMismatchScore;
    return 100 * clamp(1 - absoluteDifference / (referenceTotal + observedTotal), 0, 1);
  }

  function normalizedPhraseRates(feature, wordCount) {
    var rates = createFrequencyMap();
    Object.keys(feature.frequencies || {}).forEach(function (phrase) {
      rates[phrase] = wordCount ? mapValue(feature.frequencies, phrase) * 1000 / wordCount : 0;
    });
    return rates;
  }

  function weightedAverage(parts) {
    var total = 0;
    var weights = 0;
    parts.forEach(function (part) {
      total += part[0] * part[1];
      weights += part[1];
    });
    return weights ? total / weights : 100;
  }

  function punctuationSimilarity(reference, observed) {
    var tolerances = {
      period: 12, comma: 14, semicolon: 3, colon: 3, emDash: 3, enDash: 2,
      hyphen: 7, ellipsis: 2, exclamation: 3, question: 4, apostrophe: 12, doubleQuote: 5
    };
    var importance = {
      period: 0.5, comma: 1, semicolon: 1, colon: 0.8, emDash: 1.5, enDash: 0.5,
      hyphen: 0.6, ellipsis: 0.8, exclamation: 0.8, question: 0.5, apostrophe: 0.5, doubleQuote: 0.5
    };
    return weightedAverage(Object.keys(tolerances).map(function (key) {
      return [scalarSimilarity(mapValue(reference, key), mapValue(observed, key), tolerances[key]), importance[key]];
    }));
  }

  function spellingSimilarity(reference, observed) {
    var a = reference.classification;
    var b = observed.classification;
    if (a === b) return 100;
    if (a === "undetermined" || b === "undetermined") return 70;
    if (a === "mixed" || b === "mixed") return 55;
    return 0;
  }

  function topVocabularyMap(feature) {
    var result = createFrequencyMap();
    (feature.topContentWords || []).forEach(function (entry) { result[entry.word] = entry.perThousandWords; });
    return result;
  }

  function comparisonWarnings(reference, observed) {
    var warnings = [];
    if (!reference.sample.meetsRecommendedMinimum) {
      warnings.push({
        code: "REFERENCE_VOICE_SAMPLE_TOO_SHORT",
        severity: "warning",
        message: "The reference VoiceProfile contains fewer than 300 words, so its measured habits may be unstable.",
        actualWords: reference.sample.wordCount,
        recommendedMinimumWords: reference.sample.recommendedMinimumWords
      });
    }
    if (!observed.sample.meetsRecommendedMinimum) {
      warnings.push({
        code: "COMPARISON_TEXT_TOO_SHORT",
        severity: "warning",
        message: "The comparison text contains fewer than 300 words, so its measured habits may be unstable.",
        actualWords: observed.sample.wordCount,
        recommendedMinimumWords: observed.sample.recommendedMinimumWords
      });
    }
    return warnings;
  }

  function compareVoice(text, profile) {
    if (typeof text !== "string") throw new TypeError("text must be a non-empty string");
    if (!text.trim()) throw new TypeError("text must be a non-empty string");
    Schema.assertVoiceProfile(profile);

    var observed = VoiceProfile.createVoiceProfile(text);
    var reference = profile.features;
    var target = observed.features;
    var components = {};

    function addComponent(key, label, similarity, referenceValues, observedValues, summary, weight) {
      var score = round(clamp(similarity, 0, 100));
      components[key] = {
        label: label,
        similarity: score,
        difference: round(100 - score),
        reference: referenceValues,
        observed: observedValues,
        summary: summary,
        weight: weight
      };
    }

    addComponent(
      "sentenceLength", "Sentence length",
      weightedAverage([
        [scalarSimilarity(reference.sentenceLength.mean, target.sentenceLength.mean, Math.max(5, reference.sentenceLength.standardDeviation + 2)), 3],
        [scalarSimilarity(reference.sentenceLength.standardDeviation, target.sentenceLength.standardDeviation, 6), 2],
        [distributionSimilarity(reference.sentenceLength.distributionRates, target.sentenceLength.distributionRates), 3]
      ]),
      { mean: reference.sentenceLength.mean, standardDeviation: reference.sentenceLength.standardDeviation, distribution: reference.sentenceLength.distributionRates },
      { mean: target.sentenceLength.mean, standardDeviation: target.sentenceLength.standardDeviation, distribution: target.sentenceLength.distributionRates },
      "Observed mean " + target.sentenceLength.mean + " words versus reference " + reference.sentenceLength.mean + ".", 12
    );

    addComponent(
      "paragraphLength", "Paragraph length",
      weightedAverage([
        [scalarSimilarity(reference.paragraphLength.words.mean, target.paragraphLength.words.mean, Math.max(18, reference.paragraphLength.words.standardDeviation + 10)), 3],
        [scalarSimilarity(reference.paragraphLength.sentences.mean, target.paragraphLength.sentences.mean, Math.max(1.5, reference.paragraphLength.sentences.standardDeviation + 0.75)), 2],
        [scalarSimilarity(reference.paragraphLength.words.standardDeviation, target.paragraphLength.words.standardDeviation, 25), 1]
      ]),
      { meanWords: reference.paragraphLength.words.mean, meanSentences: reference.paragraphLength.sentences.mean },
      { meanWords: target.paragraphLength.words.mean, meanSentences: target.paragraphLength.sentences.mean },
      "Observed paragraphs average " + target.paragraphLength.words.mean + " words versus reference " + reference.paragraphLength.words.mean + ".", 6
    );

    addComponent(
      "fragments", "Fragments and short sentences",
      average([
        scalarSimilarity(reference.fragments.fragmentRate, target.fragments.fragmentRate, 0.2),
        scalarSimilarity(reference.fragments.shortSentenceRate, target.fragments.shortSentenceRate, 0.25)
      ]),
      { fragmentRate: reference.fragments.fragmentRate, shortSentenceRate: reference.fragments.shortSentenceRate },
      { fragmentRate: target.fragments.fragmentRate, shortSentenceRate: target.fragments.shortSentenceRate },
      "Observed short-sentence rate " + round(target.fragments.shortSentenceRate * 100) + "% versus reference " + round(reference.fragments.shortSentenceRate * 100) + "%.", 6
    );

    addComponent(
      "lexicalDiversity", "Lexical diversity",
      weightedAverage([
        [scalarSimilarity(reference.lexicalDiversity.movingAverageTypeTokenRatio, target.lexicalDiversity.movingAverageTypeTokenRatio, 0.18), 3],
        [scalarSimilarity(reference.lexicalDiversity.hapaxRate, target.lexicalDiversity.hapaxRate, 0.2), 1],
        [scalarSimilarity(reference.lexicalDiversity.typeTokenRatio, target.lexicalDiversity.typeTokenRatio, 0.25), 1]
      ]),
      { movingAverageTypeTokenRatio: reference.lexicalDiversity.movingAverageTypeTokenRatio, hapaxRate: reference.lexicalDiversity.hapaxRate },
      { movingAverageTypeTokenRatio: target.lexicalDiversity.movingAverageTypeTokenRatio, hapaxRate: target.lexicalDiversity.hapaxRate },
      "Observed moving-average diversity " + target.lexicalDiversity.movingAverageTypeTokenRatio + " versus reference " + reference.lexicalDiversity.movingAverageTypeTokenRatio + ".", 8
    );

    addComponent(
      "contractions", "Contraction behaviour",
      weightedAverage([
        [nullableRateSimilarity(reference.contractions.rate, target.contractions.rate, 0.35), 3],
        [scalarSimilarity(reference.contractions.perThousandWords, target.contractions.perThousandWords, 12), 2]
      ]),
      { rate: reference.contractions.rate, perThousandWords: reference.contractions.perThousandWords, preference: reference.contractions.preference },
      { rate: target.contractions.rate, perThousandWords: target.contractions.perThousandWords, preference: target.contractions.preference },
      "Observed contraction preference is " + target.contractions.preference + "; reference is " + reference.contractions.preference + ".", 8
    );

    addComponent(
      "punctuation", "Punctuation habits",
      punctuationSimilarity(reference.punctuation.perThousandWords, target.punctuation.perThousandWords),
      reference.punctuation.perThousandWords,
      target.punctuation.perThousandWords,
      "Observed em-dash rate " + target.punctuation.perThousandWords.emDash + " per 1,000 words versus reference " + reference.punctuation.perThousandWords.emDash + ".", 10
    );

    addComponent(
      "parentheticalsAndQuestions", "Parentheticals and questions",
      weightedAverage([
        [scalarSimilarity(reference.parentheticals.perHundredSentences, target.parentheticals.perHundredSentences, 15), 1],
        [scalarSimilarity(reference.questions.rate, target.questions.rate, 0.2), 2]
      ]),
      { parentheticalsPerHundredSentences: reference.parentheticals.perHundredSentences, questionRate: reference.questions.rate },
      { parentheticalsPerHundredSentences: target.parentheticals.perHundredSentences, questionRate: target.questions.rate },
      "Observed question rate " + round(target.questions.rate * 100) + "% versus reference " + round(reference.questions.rate * 100) + "%.", 4
    );

    addComponent(
      "pronouns", "Pronoun tendencies",
      rateMapSimilarity(reference.pronouns.perHundredWords, target.pronouns.perHundredWords, 20),
      reference.pronouns.perHundredWords,
      target.pronouns.perHundredWords,
      "Compares first-, second-, and third-person pronoun rates.", 7
    );

    addComponent(
      "functionWords", "Function-word preferences",
      rateMapSimilarity(reference.functionWords.perHundredWords, target.functionWords.perHundredWords, 25),
      reference.functionWords.perHundredWords,
      target.functionWords.perHundredWords,
      "Compares the relative use of common grammatical words.", 8
    );

    var conjunctionScore = rateMapSimilarity(reference.conjunctions.perHundredWords, target.conjunctions.perHundredWords, 25);
    var transitionScore = weightedAverage([
      [scalarSimilarity(reference.transitions.perThousandWords, target.transitions.perThousandWords, 10), 2],
      [rateMapSimilarity(normalizedPhraseRates(reference.transitions, profile.sample.wordCount), normalizedPhraseRates(target.transitions, observed.sample.wordCount), 35), 1]
    ]);
    addComponent(
      "connectors", "Conjunctions and transitions",
      weightedAverage([[conjunctionScore, 2], [transitionScore, 1]]),
      { conjunctions: reference.conjunctions.perHundredWords, transitionsPerThousandWords: reference.transitions.perThousandWords, preferredTransitions: reference.transitions.preferred },
      { conjunctions: target.conjunctions.perHundredWords, transitionsPerThousandWords: target.transitions.perThousandWords, preferredTransitions: target.transitions.preferred },
      "Observed transition rate " + target.transitions.perThousandWords + " per 1,000 words versus reference " + reference.transitions.perThousandWords + ".", 6
    );

    [
      ["hedges", "Hedging", 4],
      ["intensifiers", "Intensifiers", 3],
      ["discourseMarkers", "Discourse markers", 3]
    ].forEach(function (definition) {
      var key = definition[0];
      var phraseScore = weightedAverage([
        [scalarSimilarity(reference[key].perThousandWords, target[key].perThousandWords, 8), 2],
        [rateMapSimilarity(normalizedPhraseRates(reference[key], profile.sample.wordCount), normalizedPhraseRates(target[key], observed.sample.wordCount), 40), 1]
      ]);
      addComponent(
        key, definition[1], phraseScore,
        { perThousandWords: reference[key].perThousandWords, preferred: reference[key].preferred },
        { perThousandWords: target[key].perThousandWords, preferred: target[key].preferred },
        "Observed rate " + target[key].perThousandWords + " per 1,000 words versus reference " + reference[key].perThousandWords + ".", definition[2]
      );
    });

    addComponent(
      "spellingConvention", "Spelling convention",
      spellingSimilarity(reference.spellingConvention, target.spellingConvention),
      { classification: reference.spellingConvention.classification, evidence: reference.spellingConvention.evidence },
      { classification: target.spellingConvention.classification, evidence: target.spellingConvention.evidence },
      "Observed convention is " + target.spellingConvention.classification + "; reference is " + reference.spellingConvention.classification + ".", 4
    );

    addComponent(
      "register", "Register",
      scalarSimilarity(reference.register.formality, target.register.formality, 0.28),
      { label: reference.register.label, formality: reference.register.formality },
      { label: target.register.label, formality: target.register.formality },
      "Observed register is " + target.register.label + "; reference is " + reference.register.label + ".", 6
    );

    addComponent(
      "sentenceOpenings", "Sentence openings",
      weightedAverage([
        [distributionSimilarity(reference.sentenceOpenings.typeRates, target.sentenceOpenings.typeRates), 4],
        [rateMapSimilarity(reference.sentenceOpenings.openingWords, target.sentenceOpenings.openingWords, 30), 1]
      ]),
      { types: reference.sentenceOpenings.typeRates, preferred: reference.sentenceOpenings.preferred },
      { types: target.sentenceOpenings.typeRates, preferred: target.sentenceOpenings.preferred },
      "Compares grammatical opener types, with a light weight on repeated opening words.", 4
    );

    addComponent(
      "vocabulary", "Vocabulary characteristics",
      weightedAverage([
        [scalarSimilarity(reference.vocabulary.averageWordLength, target.vocabulary.averageWordLength, 1.4), 3],
        [scalarSimilarity(reference.vocabulary.longWordRate, target.vocabulary.longWordRate, 0.15), 2],
        [scalarSimilarity(reference.vocabulary.contentWordRate, target.vocabulary.contentWordRate, 0.16), 2],
        [distributionSimilarity(reference.vocabulary.wordLengthDistribution, target.vocabulary.wordLengthDistribution), 2],
        [rateMapSimilarity(topVocabularyMap(reference.vocabulary), topVocabularyMap(target.vocabulary), 25), 1]
      ]),
      { averageWordLength: reference.vocabulary.averageWordLength, longWordRate: reference.vocabulary.longWordRate, contentWordRate: reference.vocabulary.contentWordRate },
      { averageWordLength: target.vocabulary.averageWordLength, longWordRate: target.vocabulary.longWordRate, contentWordRate: target.vocabulary.contentWordRate },
      "Observed average word length " + target.vocabulary.averageWordLength + " versus reference " + reference.vocabulary.averageWordLength + ".", 7
    );

    addComponent(
      "rhythm", "Rhythm and cadence",
      weightedAverage([
        [scalarSimilarity(reference.rhythm.coefficientOfVariation, target.rhythm.coefficientOfVariation, 0.45), 2],
        [scalarSimilarity(reference.rhythm.burstiness, target.rhythm.burstiness, 0.18), 2],
        [scalarSimilarity(reference.rhythm.meanAdjacentChange, target.rhythm.meanAdjacentChange, 0.45), 2],
        [scalarSimilarity(reference.rhythm.shortLongAlternationRate, target.rhythm.shortLongAlternationRate, 0.2), 1],
        [scalarSimilarity(reference.rhythm.interquartileRange, target.rhythm.interquartileRange, 8), 1]
      ]),
      { coefficientOfVariation: reference.rhythm.coefficientOfVariation, burstiness: reference.rhythm.burstiness, meanAdjacentChange: reference.rhythm.meanAdjacentChange },
      { coefficientOfVariation: target.rhythm.coefficientOfVariation, burstiness: target.rhythm.burstiness, meanAdjacentChange: target.rhythm.meanAdjacentChange },
      "Observed burstiness " + target.rhythm.burstiness + " versus reference " + reference.rhythm.burstiness + ".", 8
    );

    var aggregate = weightedAverage(Object.keys(components).map(function (key) {
      return [components[key].similarity, components[key].weight];
    }));
    var similarity = round(clamp(aggregate, 0, 100));
    var differences = Object.keys(components).map(function (key) {
      return {
        component: key,
        label: components[key].label,
        similarity: components[key].similarity,
        difference: components[key].difference,
        summary: components[key].summary
      };
    }).sort(function (a, b) {
      return b.difference - a.difference || (a.component < b.component ? -1 : 1);
    });

    var comparison = {
      type: Schema.VOICE_COMPARISON_TYPE,
      schemaVersion: Schema.VOICE_COMPARISON_SCHEMA_VERSION,
      score: similarity,
      similarity: similarity,
      aggregateSimilarity: similarity,
      normalizedSimilarity: similarity / 100,
      calibrated: false,
      authorshipProbability: null,
      disclaimer: DISCLAIMER,
      referenceSample: {
        wordCount: profile.sample.wordCount,
        sentenceCount: profile.sample.sentenceCount,
        paragraphCount: profile.sample.paragraphCount
      },
      observedSample: {
        wordCount: observed.sample.wordCount,
        sentenceCount: observed.sample.sentenceCount,
        paragraphCount: observed.sample.paragraphCount
      },
      warnings: comparisonWarnings(profile, observed),
      components: components,
      differences: differences,
      methodology: {
        name: "descriptive-feature-distance",
        version: "1.0.0",
        calibrated: false,
        purpose: "Compare measured writing habits; do not infer who wrote the text."
      }
    };
    Schema.assertVoiceComparison(comparison);
    return comparison;
  }

  return { DISCLAIMER: DISCLAIMER, compareVoice: compareVoice };
}));
