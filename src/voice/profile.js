/* Sapienize v2 voice fingerprint extraction. No DOM and no dependencies. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./schema.js"));
  } else {
    root.SapienizeVoiceProfile = factory(root.SapienizeVoiceSchema);
  }
}(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this), function (Schema) {
  "use strict";

  if (!Schema) throw new Error("SapienizeVoiceSchema must be loaded before SapienizeVoiceProfile");

  var RECOMMENDED_MINIMUM_WORDS = 300;
  var WORD_RE;
  try {
    WORD_RE = new RegExp("[\\p{L}\\p{M}]+(?:['\u2019][\\p{L}\\p{M}]+)*", "gu");
  } catch (error) {
    WORD_RE = /[A-Za-z\u00C0-\u024F\u0370-\u052F]+(?:['\u2019][A-Za-z\u00C0-\u024F\u0370-\u052F]+)*/g;
  }

  var ABBREVIATIONS = {
    mr: 1, mrs: 1, ms: 1, dr: 1, prof: 1, sr: 1, jr: 1, st: 1, vs: 1,
    etc: 1, eg: 1, ie: 1, fig: 1, no: 1, inc: 1, ltd: 1, co: 1
  };

  var PRONOUN_GROUPS = {
    firstPerson: ["i", "me", "my", "mine", "myself", "we", "us", "our", "ours", "ourselves"],
    secondPerson: ["you", "your", "yours", "yourself", "yourselves"],
    thirdPerson: ["he", "him", "his", "himself", "she", "her", "hers", "herself", "they", "them", "their", "theirs", "themselves", "it", "its", "itself"]
  };

  var FUNCTION_WORDS = [
    "a", "about", "after", "all", "also", "an", "and", "any", "as", "at", "be", "because",
    "before", "but", "by", "can", "do", "for", "from", "had", "has", "have", "if", "in",
    "into", "is", "it", "just", "like", "not", "of", "on", "or", "so", "than", "that", "the",
    "then", "there", "this", "to", "too", "up", "was", "we", "were", "what", "when", "which",
    "while", "with", "would", "yet", "you"
  ];

  var CONJUNCTION_GROUPS = {
    coordinating: ["and", "but", "or", "nor", "for", "yet", "so"],
    subordinating: ["although", "because", "before", "if", "once", "since", "though", "unless", "until", "when", "whenever", "where", "whereas", "while"],
    correlative: ["either", "neither", "both", "whether"]
  };

  var TRANSITIONS = [
    "also", "additionally", "after all", "as a result", "at the same time", "besides", "by contrast",
    "consequently", "finally", "first", "firstly", "for example", "for instance", "furthermore",
    "however", "in addition", "in conclusion", "in contrast", "in fact", "in other words", "instead",
    "likewise", "meanwhile", "moreover", "nevertheless", "next", "nonetheless", "on the other hand",
    "otherwise", "second", "secondly", "similarly", "still", "then", "therefore", "thus", "ultimately"
  ];

  var HEDGES = [
    "apparently", "arguably", "around", "assume", "fairly", "generally", "guess", "in general",
    "it seems", "likely", "maybe", "might", "more or less", "often", "perhaps", "possibly",
    "probably", "roughly", "seem", "seems", "somewhat", "sort of", "suggest", "typically"
  ];

  var INTENSIFIERS = [
    "absolutely", "completely", "deeply", "especially", "entirely", "extremely", "highly", "incredibly",
    "particularly", "quite", "really", "remarkably", "seriously", "so", "strongly", "totally", "truly",
    "utterly", "very"
  ];

  var DISCOURSE_MARKERS = [
    "actually", "anyway", "basically", "frankly", "here is the thing", "honestly", "i mean",
    "in short", "look", "of course", "okay", "right", "so", "the point is", "to be fair",
    "well", "you know"
  ];

  var FORMAL_WORDS = [
    "accordingly", "consequently", "furthermore", "hence", "however", "moreover", "nevertheless",
    "notwithstanding", "therefore", "thus", "whereas", "whilst", "shall", "ought", "regarding",
    "concerning", "demonstrate", "facilitate", "obtain", "require", "sufficient", "utilise", "utilize"
  ];

  var INFORMAL_WORDS = [
    "awesome", "basically", "cool", "dumb", "folks", "gonna", "gotta", "guess", "honestly", "kind of",
    "maybe", "okay", "pretty", "stuff", "thing", "tiny", "totally", "wanna", "yeah", "yep"
  ];

  function createFrequencyMap() {
    return Object.create(null);
  }

  function hasOwn(map, key) {
    return map !== null && map !== undefined && Object.prototype.hasOwnProperty.call(map, key);
  }

  function mapValue(map, key) {
    return hasOwn(map, key) ? map[key] : 0;
  }

  var STOP_WORDS = createFrequencyMap();
  (FUNCTION_WORDS.concat([
    "am", "are", "been", "being", "could", "did", "does", "he", "her", "hers", "herself", "him",
    "himself", "his", "how", "i", "its", "itself", "may", "might", "mine", "must", "my", "myself",
    "our", "ours", "ourselves", "shall", "she", "should", "their", "theirs", "them", "themselves",
    "these", "they", "those", "through", "us", "will", "would", "your", "yours", "yourself", "yourselves"
  ])).forEach(function (word) { STOP_WORDS[word] = 1; });

  var VERB_WORDS = {
    am: 1, are: 1, is: 1, was: 1, were: 1, be: 1, been: 1, being: 1,
    have: 1, has: 1, had: 1, do: 1, does: 1, did: 1, can: 1, could: 1,
    may: 1, might: 1, must: 1, shall: 1, should: 1, will: 1, would: 1,
    go: 1, goes: 1, went: 1, come: 1, came: 1, get: 1, got: 1, make: 1, made: 1,
    know: 1, knew: 1, think: 1, thought: 1, say: 1, said: 1, see: 1, saw: 1,
    take: 1, took: 1, give: 1, gave: 1, find: 1, found: 1, tell: 1, told: 1,
    feel: 1, felt: 1, become: 1, became: 1, leave: 1, left: 1, put: 1, keep: 1,
    let: 1, begin: 1, began: 1, seem: 1, help: 1, show: 1, hear: 1, heard: 1,
    run: 1, ran: 1, write: 1, wrote: 1, read: 1, build: 1, break: 1, broke: 1,
    work: 1, use: 1, need: 1, want: 1, try: 1, ask: 1, mean: 1, matter: 1,
    save: 1, stop: 1, start: 1, ship: 1, steal: 1
  };

  var UK_US_PAIRS = [
    ["colour", "color"], ["colours", "colors"], ["favourite", "favorite"], ["favourites", "favorites"],
    ["behaviour", "behavior"], ["behaviours", "behaviors"], ["centre", "center"], ["centres", "centers"],
    ["theatre", "theater"], ["theatres", "theaters"], ["metre", "meter"], ["metres", "meters"],
    ["defence", "defense"], ["offence", "offense"], ["travelling", "traveling"], ["travelled", "traveled"],
    ["cancelled", "canceled"], ["cancelling", "canceling"], ["catalogue", "catalog"], ["catalogues", "catalogs"],
    ["programme", "program"], ["programmes", "programs"], ["licence", "license"], ["grey", "gray"],
    ["analyse", "analyze"], ["analysed", "analyzed"], ["organise", "organize"], ["organised", "organized"],
    ["realise", "realize"], ["realised", "realized"]
  ];

  function round(value, places) {
    var factor = Math.pow(10, places === undefined ? 6 : places);
    return Math.round((value + (Number.EPSILON || 0)) * factor) / factor;
  }

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function normalizeWord(word) {
    var value = String(word).toLowerCase().replace(/\u2019/g, "'");
    return typeof value.normalize === "function" ? value.normalize("NFC") : value;
  }

  function tokenize(text) {
    var matches = String(text).match(WORD_RE) || [];
    return matches.map(normalizeWord);
  }

  function splitSentences(text) {
    var input = String(text).replace(/\r\n?/g, "\n").trim();
    if (!input) return [];
    var sentences = [];
    var start = 0;
    var i;
    for (i = 0; i < input.length; i++) {
      var ch = input.charAt(i);
      if (ch !== "." && ch !== "!" && ch !== "?" && ch !== "\u2026") continue;
      if (ch === "." && /\d/.test(input.charAt(i - 1)) && /\d/.test(input.charAt(i + 1))) continue;

      var before = input.slice(start, i).match(/([A-Za-z]+)$/);
      var priorWord = before ? before[1].toLowerCase() : "";
      if (ch === "." && (hasOwn(ABBREVIATIONS, priorWord) || priorWord.length === 1)) continue;

      var end = i + 1;
      while (end < input.length && /[.!?\u2026]/.test(input.charAt(end))) end++;
      while (end < input.length && /["'\u2019\u201D)\]}]/.test(input.charAt(end))) end++;
      if (end < input.length && !/\s/.test(input.charAt(end))) continue;

      var sentence = input.slice(start, end).trim();
      if (sentence) sentences.push(sentence);
      while (end < input.length && /\s/.test(input.charAt(end))) end++;
      start = end;
      i = end - 1;
    }
    var remainder = input.slice(start).trim();
    if (remainder) sentences.push(remainder);
    return sentences;
  }

  function paragraphs(text) {
    return String(text).replace(/\r\n?/g, "\n").split(/\n\s*\n+/).map(function (paragraph) {
      return paragraph.replace(/\s+/g, " ").trim();
    }).filter(Boolean);
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function quantile(values, q) {
    if (!values.length) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var position = (sorted.length - 1) * q;
    var base = Math.floor(position);
    var remainder = position - base;
    return sorted[base + 1] === undefined ? sorted[base] : sorted[base] + remainder * (sorted[base + 1] - sorted[base]);
  }

  function statistics(values) {
    if (!values.length) return { count: 0, mean: 0, median: 0, standardDeviation: 0, minimum: 0, maximum: 0 };
    var average = mean(values);
    var variance = mean(values.map(function (value) { return Math.pow(value - average, 2); }));
    return {
      count: values.length,
      mean: round(average),
      median: round(quantile(values, 0.5)),
      standardDeviation: round(Math.sqrt(variance)),
      minimum: Math.min.apply(null, values),
      maximum: Math.max.apply(null, values)
    };
  }

  function increment(map, key, amount) {
    map[key] = mapValue(map, key) + (amount === undefined ? 1 : amount);
  }

  function countMap(tokens) {
    var counts = createFrequencyMap();
    tokens.forEach(function (token) { increment(counts, token); });
    return counts;
  }

  function rateMap(counts, denominator, multiplier, includeKeys) {
    var result = createFrequencyMap();
    (includeKeys || Object.keys(counts)).forEach(function (key) {
      result[key] = denominator ? round(mapValue(counts, key) * multiplier / denominator) : 0;
    });
    return result;
  }

  function countPhrase(tokens, phrase) {
    var parts = tokenize(phrase);
    var found = 0;
    var i;
    var j;
    for (i = 0; i <= tokens.length - parts.length; i++) {
      for (j = 0; j < parts.length && tokens[i + j] === parts[j]; j++) { /* scan */ }
      if (j === parts.length) found++;
    }
    return found;
  }

  function phraseFeature(tokens, phrases, recurringOnly) {
    var frequencies = createFrequencyMap();
    var total = 0;
    phrases.forEach(function (phrase) {
      var count = countPhrase(tokens, phrase);
      if (count) {
        frequencies[phrase] = count;
        total += count;
      }
    });
    var ordered = Object.keys(frequencies).sort(function (a, b) {
      return frequencies[b] - frequencies[a] || (a < b ? -1 : 1);
    });
    return {
      count: total,
      perThousandWords: tokens.length ? round(total * 1000 / tokens.length) : 0,
      frequencies: frequencies,
      preferred: ordered.slice(0, 8),
      recurring: recurringOnly ? ordered.filter(function (phrase) { return frequencies[phrase] >= 2; }) : ordered.slice(0, 8)
    };
  }

  function movingAverageTypeTokenRatio(tokens, windowSize) {
    if (!tokens.length) return 0;
    var size = Math.min(windowSize, tokens.length);
    if (tokens.length === size) return Object.keys(countMap(tokens)).length / size;
    var total = 0;
    var windows = 0;
    var i;
    for (i = 0; i <= tokens.length - size; i++) {
      total += Object.keys(countMap(tokens.slice(i, i + size))).length / size;
      windows++;
    }
    return total / windows;
  }

  function hasFiniteVerb(tokens) {
    return tokens.some(function (token) {
      if (hasOwn(VERB_WORDS, token)) return true;
      if (/n't$/.test(token) || /'(?:m|re|ve|ll|d)$/.test(token)) return true;
      return token.length > 3 && /(?:ed|ing|ise|ize|ises|izes|ifies|ified)$/.test(token);
    });
  }

  function isLikelyFragment(sentence) {
    var tokens = tokenize(sentence);
    if (!tokens.length) return false;
    if (tokens.length === 1) return true;
    return tokens.length <= 12 && !hasFiniteVerb(tokens);
  }

  function countCharacters(text, regex) {
    return (String(text).match(regex) || []).length;
  }

  function contractionFeature(text, tokens) {
    var forms = createFrequencyMap();
    var contractions = 0;
    var contractionPattern = /(?:n't$|^(?:i'm|i've|i'll|i'd|you're|you've|you'll|you'd|we're|we've|we'll|we'd|they're|they've|they'll|they'd|he's|he'll|he'd|she's|she'll|she'd|it's|it'll|it'd|that's|that'll|there's|there'll|there'd|what's|what'll|who's|who'll|let's|here's|could've|would've|should've|must've|might've))$/;
    tokens.forEach(function (token) {
      if (contractionPattern.test(token)) {
        contractions++;
        increment(forms, token);
      }
    });
    var expandedPhrases = [
      "am not", "are not", "is not", "was not", "were not", "do not", "does not", "did not",
      "have not", "has not", "had not", "cannot", "can not", "could not", "will not", "would not",
      "shall not", "should not", "must not", "might not", "i am", "i have", "i will", "i would",
      "you are", "you have", "you will", "you would", "we are", "we have", "we will", "we would",
      "they are", "they have", "they will", "they would", "he is", "he will", "he would", "she is",
      "she will", "she would", "it is", "it will", "it would", "that is", "there is", "what is"
    ];
    var expanded = expandedPhrases.reduce(function (sum, phrase) { return sum + countPhrase(tokens, phrase); }, 0);
    var opportunities = contractions + expanded;
    return {
      count: contractions,
      expandedCount: expanded,
      opportunities: opportunities,
      rate: opportunities ? round(contractions / opportunities) : null,
      perThousandWords: tokens.length ? round(contractions * 1000 / tokens.length) : 0,
      forms: forms,
      preference: opportunities === 0 ? "no-evidence" : (contractions / opportunities >= 0.65 ? "frequent" : (contractions / opportunities >= 0.25 ? "mixed" : "expanded"))
    };
  }

  function punctuationFeature(text, wordCount) {
    var counts = {
      period: countCharacters(text, /(?:^|[^.])\.(?!\.)/g),
      comma: countCharacters(text, /,/g),
      semicolon: countCharacters(text, /;/g),
      colon: countCharacters(text, /:/g),
      emDash: countCharacters(text, /\u2014/g),
      enDash: countCharacters(text, /\u2013/g),
      hyphen: countCharacters(text, /-/g),
      ellipsis: countCharacters(text, /(?:\.\.\.|\u2026)/g),
      exclamation: countCharacters(text, /!/g),
      question: countCharacters(text, /\?/g),
      apostrophe: countCharacters(text, /['\u2019]/g),
      doubleQuote: countCharacters(text, /["\u201C\u201D]/g)
    };
    return { counts: counts, perThousandWords: rateMap(counts, wordCount, 1000) };
  }

  function pronounFeature(tokens, wordCount) {
    var tokenCounts = countMap(tokens);
    var counts = createFrequencyMap();
    var forms = createFrequencyMap();
    Object.keys(PRONOUN_GROUPS).forEach(function (group) {
      counts[group] = 0;
      PRONOUN_GROUPS[group].forEach(function (word) {
        var count = mapValue(tokenCounts, word);
        counts[group] += count;
        if (count) forms[word] = count;
      });
    });
    return { counts: counts, perHundredWords: rateMap(counts, wordCount, 100, Object.keys(PRONOUN_GROUPS)), forms: forms };
  }

  function functionWordFeature(tokens, wordCount) {
    var tokenCounts = countMap(tokens);
    var counts = createFrequencyMap();
    FUNCTION_WORDS.forEach(function (word) { counts[word] = mapValue(tokenCounts, word); });
    return {
      counts: counts,
      perHundredWords: rateMap(counts, wordCount, 100, FUNCTION_WORDS),
      totalRate: wordCount ? round(Object.keys(counts).reduce(function (sum, key) { return sum + counts[key]; }, 0) / wordCount) : 0
    };
  }

  function conjunctionFeature(tokens, wordCount) {
    var tokenCounts = countMap(tokens);
    var counts = createFrequencyMap();
    var preferences = createFrequencyMap();
    Object.keys(CONJUNCTION_GROUPS).forEach(function (group) {
      counts[group] = 0;
      CONJUNCTION_GROUPS[group].forEach(function (word) {
        counts[group] += mapValue(tokenCounts, word);
        if (mapValue(tokenCounts, word)) preferences[word] = mapValue(tokenCounts, word);
      });
    });
    return {
      counts: counts,
      perHundredWords: rateMap(counts, wordCount, 100, Object.keys(CONJUNCTION_GROUPS)),
      preferences: rateMap(preferences, wordCount, 100)
    };
  }

  function spellingFeature(tokens) {
    var counts = countMap(tokens);
    var evidence = createFrequencyMap();
    var ukCount = 0;
    var usCount = 0;
    UK_US_PAIRS.forEach(function (pair) {
      var uk = mapValue(counts, pair[0]);
      var us = mapValue(counts, pair[1]);
      if (uk) { ukCount += uk; evidence[pair[0]] = uk; }
      if (us) { usCount += us; evidence[pair[1]] = us; }
    });
    var classification = "undetermined";
    if (ukCount && usCount) classification = "mixed";
    else if (ukCount) classification = "uk";
    else if (usCount) classification = "us";
    return { classification: classification, ukCount: ukCount, usCount: usCount, evidence: evidence };
  }

  function registerFeature(tokens, contractions, pronouns) {
    var formal = phraseFeature(tokens, FORMAL_WORDS, false);
    var informal = phraseFeature(tokens, INFORMAL_WORDS, false);
    var wordCount = tokens.length || 1;
    var contractionRate = contractions.rate === null ? 0.35 : contractions.rate;
    var secondPersonRate = pronouns.perHundredWords.secondPerson;
    var formality = 0.54 + formal.count * 8 / wordCount - informal.count * 7 / wordCount - contractionRate * 0.24 - Math.min(0.1, secondPersonRate * 0.015);
    formality = round(clamp(formality, 0, 1));
    return {
      label: formality >= 0.62 ? "formal" : (formality <= 0.38 ? "conversational" : "neutral"),
      formality: formality,
      formalMarkerCount: formal.count,
      informalMarkerCount: informal.count,
      formalMarkers: formal.frequencies,
      informalMarkers: informal.frequencies,
      method: "descriptive lexical and contraction heuristic"
    };
  }

  function startsWithPhrase(tokens, phrases) {
    var joined = tokens.slice(0, 5).join(" ");
    return phrases.some(function (phrase) { return joined === phrase || joined.indexOf(phrase + " ") === 0; });
  }

  function sentenceOpeningFeature(sentences) {
    var typeCounts = {
      firstPerson: 0, secondPerson: 0, thirdPerson: 0, article: 0, conjunction: 0,
      transition: 0, questionWord: 0, adverb: 0, other: 0
    };
    var openingWords = createFrequencyMap();
    sentences.forEach(function (sentence) {
      var words = tokenize(sentence);
      if (!words.length) return;
      var first = words[0];
      increment(openingWords, first);
      if (PRONOUN_GROUPS.firstPerson.indexOf(first) !== -1) typeCounts.firstPerson++;
      else if (PRONOUN_GROUPS.secondPerson.indexOf(first) !== -1) typeCounts.secondPerson++;
      else if (PRONOUN_GROUPS.thirdPerson.indexOf(first) !== -1) typeCounts.thirdPerson++;
      else if (["a", "an", "the"].indexOf(first) !== -1) typeCounts.article++;
      else if (CONJUNCTION_GROUPS.coordinating.indexOf(first) !== -1) typeCounts.conjunction++;
      else if (startsWithPhrase(words, TRANSITIONS)) typeCounts.transition++;
      else if (["how", "what", "when", "where", "which", "who", "why"].indexOf(first) !== -1) typeCounts.questionWord++;
      else if (/ly$/.test(first)) typeCounts.adverb++;
      else typeCounts.other++;
    });
    return {
      counts: typeCounts,
      typeRates: rateMap(typeCounts, sentences.length, 1, Object.keys(typeCounts)),
      openingWords: rateMap(openingWords, sentences.length, 1),
      preferred: Object.keys(openingWords).sort(function (a, b) {
        return openingWords[b] - openingWords[a] || (a < b ? -1 : 1);
      }).slice(0, 10)
    };
  }

  function vocabularyFeature(tokens) {
    var content = tokens.filter(function (word) { return !hasOwn(STOP_WORDS, word) && word.length > 2; });
    var contentCounts = countMap(content);
    var totalLetters = tokens.reduce(function (sum, word) { return sum + word.replace(/['\u2019]/g, "").length; }, 0);
    var longWords = tokens.filter(function (word) { return word.replace(/['\u2019]/g, "").length >= 8; }).length;
    var lengthDistribution = { oneToFour: 0, fiveToSeven: 0, eightToTen: 0, elevenPlus: 0 };
    tokens.forEach(function (word) {
      var length = word.replace(/['\u2019]/g, "").length;
      if (length <= 4) lengthDistribution.oneToFour++;
      else if (length <= 7) lengthDistribution.fiveToSeven++;
      else if (length <= 10) lengthDistribution.eightToTen++;
      else lengthDistribution.elevenPlus++;
    });
    var top = Object.keys(contentCounts).sort(function (a, b) {
      return contentCounts[b] - contentCounts[a] || (a < b ? -1 : 1);
    }).slice(0, 20).map(function (word) {
      return { word: word, count: contentCounts[word], perThousandWords: tokens.length ? round(contentCounts[word] * 1000 / tokens.length) : 0 };
    });
    return {
      averageWordLength: tokens.length ? round(totalLetters / tokens.length) : 0,
      longWordRate: tokens.length ? round(longWords / tokens.length) : 0,
      contentWordRate: tokens.length ? round(content.length / tokens.length) : 0,
      wordLengthDistribution: rateMap(lengthDistribution, tokens.length, 1, Object.keys(lengthDistribution)),
      topContentWords: top
    };
  }

  function rhythmFeature(sentenceLengths, sentenceStats) {
    var adjacent = [];
    var alternations = 0;
    var i;
    for (i = 1; i < sentenceLengths.length; i++) {
      adjacent.push(Math.abs(sentenceLengths[i] - sentenceLengths[i - 1]));
      if ((sentenceLengths[i] <= 7 && sentenceLengths[i - 1] >= 20) || (sentenceLengths[i - 1] <= 7 && sentenceLengths[i] >= 20)) alternations++;
    }
    var cv = sentenceStats.mean ? sentenceStats.standardDeviation / sentenceStats.mean : 0;
    return {
      coefficientOfVariation: round(cv),
      burstiness: sentenceStats.mean + sentenceStats.standardDeviation ? round(sentenceStats.standardDeviation / (sentenceStats.mean + sentenceStats.standardDeviation)) : 0,
      meanAdjacentChange: sentenceStats.mean && adjacent.length ? round(mean(adjacent) / sentenceStats.mean) : 0,
      shortLongAlternationRate: adjacent.length ? round(alternations / adjacent.length) : 0,
      interquartileRange: round(quantile(sentenceLengths, 0.75) - quantile(sentenceLengths, 0.25)),
      lengthSequence: sentenceLengths.slice()
    };
  }

  function normalizeSamples(samples) {
    var values;
    if (typeof samples === "string") values = [samples];
    else if (Array.isArray(samples)) values = samples.slice();
    else throw new TypeError("samples must be a string or a non-empty array of strings");
    if (!values.length) throw new TypeError("samples must be a string or a non-empty array of strings");
    values.forEach(function (sample, index) {
      if (typeof sample !== "string") throw new TypeError("samples[" + index + "] must be a string");
      if (!sample.trim()) throw new TypeError("samples[" + index + "] must not be empty");
    });
    return values;
  }

  function createVoiceProfile(samples) {
    var sampleList = normalizeSamples(samples);
    var text = sampleList.join("\n\n");
    var tokens = tokenize(text);
    var sentences = splitSentences(text);
    var paragraphList = paragraphs(text);
    var sentenceLengths = sentences.map(function (sentence) { return tokenize(sentence).length; }).filter(function (length) { return length > 0; });
    var paragraphWordLengths = paragraphList.map(function (paragraph) { return tokenize(paragraph).length; });
    var paragraphSentenceLengths = paragraphList.map(function (paragraph) { return splitSentences(paragraph).length; });
    var sentenceStats = statistics(sentenceLengths);
    var tokenCounts = countMap(tokens);
    var uniqueCount = Object.keys(tokenCounts).length;

    var sentenceDistribution = { veryShort: 0, short: 0, medium: 0, long: 0, veryLong: 0 };
    sentenceLengths.forEach(function (length) {
      if (length <= 5) sentenceDistribution.veryShort++;
      else if (length <= 10) sentenceDistribution.short++;
      else if (length <= 20) sentenceDistribution.medium++;
      else if (length <= 30) sentenceDistribution.long++;
      else sentenceDistribution.veryLong++;
    });
    sentenceStats.p10 = round(quantile(sentenceLengths, 0.1));
    sentenceStats.p25 = round(quantile(sentenceLengths, 0.25));
    sentenceStats.p75 = round(quantile(sentenceLengths, 0.75));
    sentenceStats.p90 = round(quantile(sentenceLengths, 0.9));
    sentenceStats.distribution = sentenceDistribution;
    sentenceStats.distributionRates = rateMap(sentenceDistribution, sentenceLengths.length, 1, Object.keys(sentenceDistribution));

    var fragments = sentences.filter(isLikelyFragment).length;
    var shortSentences = sentenceLengths.filter(function (length) { return length <= 7; }).length;
    var contractionData = contractionFeature(text, tokens);
    var pronounData = pronounFeature(tokens, tokens.length);
    var punctuationData = punctuationFeature(text, tokens.length);
    var roundPairs = Math.min(countCharacters(text, /\(/g), countCharacters(text, /\)/g));
    var squarePairs = Math.min(countCharacters(text, /\[/g), countCharacters(text, /\]/g));
    var dashPairs = Math.floor(punctuationData.counts.emDash / 2);
    var questionCount = sentences.filter(function (sentence) { return /\?[?!]*["'\u2019\u201D)\]}]*\s*$/.test(sentence); }).length;
    var hapax = Object.keys(tokenCounts).filter(function (token) { return tokenCounts[token] === 1; }).length;

    var warnings = [];
    if (tokens.length < RECOMMENDED_MINIMUM_WORDS) {
      warnings.push({
        code: "VOICE_SAMPLE_TOO_SHORT",
        severity: "warning",
        message: "Voice profiles are more reliable with at least 300 words; received " + tokens.length + ".",
        actualWords: tokens.length,
        recommendedMinimumWords: RECOMMENDED_MINIMUM_WORDS
      });
    }

    var profile = {
      type: Schema.VOICE_PROFILE_TYPE,
      schemaVersion: Schema.VOICE_PROFILE_SCHEMA_VERSION,
      sample: {
        sampleCount: sampleList.length,
        wordCount: tokens.length,
        sentenceCount: sentences.length,
        paragraphCount: paragraphList.length,
        recommendedMinimumWords: RECOMMENDED_MINIMUM_WORDS,
        meetsRecommendedMinimum: tokens.length >= RECOMMENDED_MINIMUM_WORDS
      },
      warnings: warnings,
      features: {
        sentenceLength: sentenceStats,
        paragraphLength: {
          count: paragraphList.length,
          words: statistics(paragraphWordLengths),
          sentences: statistics(paragraphSentenceLengths),
          wordDistribution: paragraphWordLengths.slice(),
          sentenceDistribution: paragraphSentenceLengths.slice()
        },
        fragments: {
          fragmentCount: fragments,
          fragmentRate: sentences.length ? round(fragments / sentences.length) : 0,
          shortSentenceCount: shortSentences,
          shortSentenceRate: sentences.length ? round(shortSentences / sentences.length) : 0,
          shortSentenceMaximumWords: 7,
          method: "heuristic: twelve words or fewer without an apparent finite verb"
        },
        lexicalDiversity: {
          tokenCount: tokens.length,
          uniqueTokenCount: uniqueCount,
          typeTokenRatio: tokens.length ? round(uniqueCount / tokens.length) : 0,
          rootTypeTokenRatio: tokens.length ? round(uniqueCount / Math.sqrt(tokens.length)) : 0,
          movingAverageTypeTokenRatio: round(movingAverageTypeTokenRatio(tokens, 50)),
          movingAverageWindow: Math.min(50, tokens.length),
          hapaxRate: tokens.length ? round(hapax / tokens.length) : 0
        },
        contractions: contractionData,
        punctuation: punctuationData,
        parentheticals: {
          count: roundPairs + squarePairs + dashPairs,
          roundCount: roundPairs,
          squareCount: squarePairs,
          dashPairCount: dashPairs,
          perHundredSentences: sentences.length ? round((roundPairs + squarePairs + dashPairs) * 100 / sentences.length) : 0
        },
        questions: { count: questionCount, rate: sentences.length ? round(questionCount / sentences.length) : 0 },
        pronouns: pronounData,
        functionWords: functionWordFeature(tokens, tokens.length),
        conjunctions: conjunctionFeature(tokens, tokens.length),
        transitions: phraseFeature(tokens, TRANSITIONS, false),
        hedges: phraseFeature(tokens, HEDGES, false),
        intensifiers: phraseFeature(tokens, INTENSIFIERS, false),
        discourseMarkers: phraseFeature(tokens, DISCOURSE_MARKERS, true),
        spellingConvention: spellingFeature(tokens),
        register: registerFeature(tokens, contractionData, pronounData),
        sentenceOpenings: sentenceOpeningFeature(sentences),
        vocabulary: vocabularyFeature(tokens),
        rhythm: rhythmFeature(sentenceLengths, sentenceStats)
      }
    };

    Schema.assertVoiceProfile(profile);
    return profile;
  }

  return {
    RECOMMENDED_MINIMUM_WORDS: RECOMMENDED_MINIMUM_WORDS,
    createVoiceProfile: createVoiceProfile,
    splitSentences: splitSentences,
    tokenize: tokenize
  };
}));
