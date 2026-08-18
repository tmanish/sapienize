(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SapienizeSemantic = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this), function () {
  "use strict";

  var MONTHS = {
    january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
    april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
    august: 8, aug: 8, september: 9, sept: 9, sep: 9,
    october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12
  };
  var MONTH_PATTERN = "(?:January|Jan(?:uary)?|February|Feb(?:ruary)?|March|Mar(?:ch)?|April|Apr(?:il)?|May|June|Jun(?:e)?|July|Jul(?:y)?|August|Aug(?:ust)?|September|Sept?|October|Oct(?:ober)?|November|Nov(?:ember)?|December|Dec(?:ember)?)";
  var STOP_WORDS = makeSet([
    "a", "an", "and", "are", "as", "at", "be", "been", "being", "but", "by",
    "did", "do", "does", "for", "from", "had", "has", "have", "he", "her", "hers",
    "him", "his", "i", "if", "in", "into", "is", "it", "its", "me", "my", "nor",
    "of", "on", "or", "our", "ours", "she", "so", "than", "that", "the", "their",
    "theirs", "them", "they", "this", "those", "to", "too", "us", "was", "we", "were",
    "what", "when", "where", "which", "while", "who", "whom", "why", "with", "you",
    "your", "yours"
  ]);
  var ENTITY_STOP_WORDS = makeSet([
    "A", "An", "And", "As", "At", "But", "By", "For", "From", "He", "Her", "His",
    "I", "If", "In", "It", "Its", "My", "No", "Not", "Of", "On", "Or", "Our",
    "She", "So", "That", "The", "Their", "There", "These", "They", "This", "Those",
    "To", "We", "What", "When", "Where", "Which", "While", "Who", "Why", "With", "You", "Your"
  ]);
  var NEGATIONS = makeSet(["no", "not", "never", "neither", "without", "cannot", "can't", "cant", "won't", "wont", "isn't", "isnt", "wasn't", "wasnt", "didn't", "didnt", "doesn't", "doesnt", "don't", "dont"]);
  var UNCERTAIN = makeSet(["may", "might", "could", "perhaps", "possibly", "likely", "apparently", "seems", "seem", "appears", "appear"]);
  var CERTAIN = makeSet(["must", "will", "always", "certainly", "definitely", "proves", "proven", "guarantees", "guaranteed"]);
  var SHORT_CLAIM_PREDICATES = makeSet([
    "fell", "falls", "rose", "rises", "grew", "grows", "shrank", "shrinks", "declined", "declines",
    "dropped", "drops", "increased", "increases", "decreased", "decreases", "improved", "improves",
    "worsened", "worsens", "died", "dies", "survived", "survives", "failed", "fails", "succeeded",
    "succeeds", "passed", "passes", "shipped", "ships", "launched", "launches", "arrived", "arrives",
    "departed", "departs", "ended", "ends", "began", "begins", "started", "starts", "stopped", "stops",
    "continued", "continues", "remained", "remains", "worked", "works", "broke", "breaks", "collapsed",
    "collapses", "recovered", "recovers", "won", "wins", "lost", "loses", "closed", "closes", "opened",
    "opens", "approved", "approves", "rejected", "rejects", "resigned", "resigns"
  ]);
  var POLAR_PAIRS = [
    ["increase", "decrease"], ["rise", "fall"], ["gain", "lose"], ["accept", "reject"],
    ["approve", "deny"], ["allow", "prohibit"], ["safe", "unsafe"], ["true", "false"],
    ["before", "after"], ["more", "less"], ["higher", "lower"], ["best", "worst"],
    ["success", "failure"], ["succeed", "fail"], ["include", "exclude"], ["start", "stop"],
    ["open", "close"], ["present", "absent"], ["support", "oppose"], ["like", "hate"]
  ];
  var NUMBER_WORD_VALUES = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
    seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
    sixty: 60, seventy: 70, eighty: 80, ninety: 90
  };
  var ORDINAL_WORD_VALUES = {
    first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8,
    ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14,
    fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19,
    twentieth: 20
  };
  var QUANTITY_WORD_VALUES = {
    single: "1", double: "2", triple: "3", quadruple: "4",
    pair: "2", dozen: "12", half: "fraction:1/2", quarter: "fraction:1/4"
  };
  var NUMBER_WORD_SCALES = { hundred: 100, thousand: 1000, million: 1000000, billion: 1000000000, trillion: 1000000000000 };
  var NUMBER_WORD_PATTERN = Object.keys(NUMBER_WORD_VALUES).concat(Object.keys(NUMBER_WORD_SCALES)).join("|");
  var ENGLISH_NUMBER_RE = new RegExp("\\b(?:" + NUMBER_WORD_PATTERN + ")(?:[ -]+(?:and[ -]+)?(?:" + NUMBER_WORD_PATTERN + "))*\\b", "gi");
  var PROTECTED_QUANTITY_RE = new RegExp("\\b(?:" + Object.keys(ORDINAL_WORD_VALUES).concat(Object.keys(QUANTITY_WORD_VALUES)).join("|") + ")\\b", "gi");
  var DIGIT_ORDINAL_RE = /\b\d+(?:st|nd|rd|th)\b/gi;
  var ALPHANUMERIC_NUMBER_RE = /\b(?=[A-Za-z0-9._/-]*\d)(?=[A-Za-z0-9._/-]*[A-Za-z])[A-Za-z0-9]+(?:[._/-][A-Za-z0-9]+)*\b/g;

  function makeSet(values) {
    var out = Object.create(null);
    for (var i = 0; i < values.length; i++) out[values[i]] = true;
    return out;
  }

  function pad2(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function cleanText(text) {
    return String(text).replace(/\r\n?/g, "\n");
  }

  function trimTrailingPunctuation(value) {
    var out = value;
    while (/[.,;:!?]$/.test(out)) out = out.slice(0, -1);
    while (/[)\]}]$/.test(out)) {
      var closer = out.charAt(out.length - 1);
      var opener = closer === ")" ? "(" : (closer === "]" ? "[" : "{");
      var opens = (out.match(new RegExp("\\" + opener, "g")) || []).length;
      var closes = (out.match(new RegExp("\\" + closer, "g")) || []).length;
      if (closes <= opens) break;
      out = out.slice(0, -1);
    }
    return out;
  }

  function collectMatches(text, regexes, normalizer) {
    var matches = [];
    for (var r = 0; r < regexes.length; r++) {
      var regex = regexes[r];
      regex.lastIndex = 0;
      var match;
      while ((match = regex.exec(text)) !== null) {
        var raw = match[0];
        matches.push({
          raw: raw,
          normalized: normalizer ? normalizer(raw) : raw,
          index: match.index,
          end: match.index + raw.length
        });
        if (regex.lastIndex === match.index) regex.lastIndex++;
      }
    }
    matches.sort(function (a, b) {
      return a.index - b.index || (b.end - b.index) - (a.end - a.index);
    });
    var nonOverlapping = [];
    for (var i = 0; i < matches.length; i++) {
      var candidate = matches[i];
      var overlaps = false;
      for (var j = 0; j < nonOverlapping.length; j++) {
        var kept = nonOverlapping[j];
        if (candidate.index < kept.end && kept.index < candidate.end) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) nonOverlapping.push(candidate);
    }
    nonOverlapping.sort(function (a, b) { return a.index - b.index; });
    return nonOverlapping;
  }

  function maskRanges(text, ranges) {
    if (!ranges.length) return text;
    var chars = text.split("");
    for (var i = 0; i < ranges.length; i++) {
      for (var p = ranges[i].index; p < ranges[i].end; p++) chars[p] = " ";
    }
    return chars.join("");
  }

  function normalizeUrl(raw) {
    return trimTrailingPunctuation(raw.trim());
  }

  function urlOccurrences(text) {
    var regex = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
    regex.lastIndex = 0;
    var out = [];
    var match;
    while ((match = regex.exec(text)) !== null) {
      var raw = trimTrailingPunctuation(match[0]);
      out.push({ raw: raw, normalized: normalizeUrl(raw), index: match.index, end: match.index + raw.length });
      if (regex.lastIndex === match.index) regex.lastIndex++;
    }
    return out;
  }

  function normalizeDate(raw) {
    var value = raw.toLowerCase().replace(/\b(\d{1,2})(?:st|nd|rd|th)\b/g, "$1").replace(/,/g, " ").replace(/\s+/g, " ").trim();
    var match = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (match) return match[1] + "-" + pad2(Number(match[2])) + "-" + pad2(Number(match[3]));
    match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (match) return "numeric:" + Number(match[1]) + "/" + Number(match[2]) + "/" + match[3];
    match = value.match(/^([a-z]+) (\d{1,2}) (\d{4})$/);
    if (match && MONTHS[match[1]]) return match[3] + "-" + pad2(MONTHS[match[1]]) + "-" + pad2(Number(match[2]));
    match = value.match(/^(\d{1,2}) ([a-z]+) (\d{4})$/);
    if (match && MONTHS[match[2]]) return match[3] + "-" + pad2(MONTHS[match[2]]) + "-" + pad2(Number(match[1]));
    match = value.match(/^([a-z]+) (\d{4})$/);
    if (match && MONTHS[match[1]]) return match[2] + "-" + pad2(MONTHS[match[1]]);
    match = value.match(/^([a-z]+) (\d{1,2})$/);
    if (match && MONTHS[match[1]]) return "month-day:" + pad2(MONTHS[match[1]]) + "-" + pad2(Number(match[2]));
    match = value.match(/^(\d{1,2}) ([a-z]+)$/);
    if (match && MONTHS[match[2]]) return "month-day:" + pad2(MONTHS[match[2]]) + "-" + pad2(Number(match[1]));
    return value;
  }

  function dateOccurrences(text) {
    var withoutUrls = maskRanges(text, urlOccurrences(text));
    return collectMatches(withoutUrls, [
      new RegExp("\\b" + MONTH_PATTERN + "\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,\\s*|\\s+)\\d{4}\\b", "gi"),
      new RegExp("\\b\\d{1,2}(?:st|nd|rd|th)?\\s+" + MONTH_PATTERN + "(?:,\\s*|\\s+)\\d{4}\\b", "gi"),
      new RegExp("\\b" + MONTH_PATTERN + "\\s+\\d{1,2}(?:st|nd|rd|th)?\\b", "gi"),
      new RegExp("\\b\\d{1,2}(?:st|nd|rd|th)?\\s+" + MONTH_PATTERN + "\\b", "gi"),
      /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/g,
      /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,
      new RegExp("\\b" + MONTH_PATTERN + "\\s+\\d{4}\\b", "gi")
    ], normalizeDate);
  }

  function normalizeNumber(raw) {
    var value = raw.toLowerCase().replace(/\u202f/g, " ").replace(/\s+/g, "").replace(/,/g, "");
    value = value.replace(/percent$/, "%").replace(/percent$/, "%").replace(/percent$/, "%");
    return value;
  }

  function normalizeEnglishNumber(raw) {
    var tokens = raw.toLowerCase().split(/[ -]+/).filter(function (token) { return token && token !== "and"; });
    var total = 0;
    var current = 0;
    tokens.forEach(function (token) {
      if (Object.prototype.hasOwnProperty.call(NUMBER_WORD_VALUES, token)) {
        current += NUMBER_WORD_VALUES[token];
      } else if (token === "hundred") {
        current = (current || 1) * NUMBER_WORD_SCALES.hundred;
      } else if (Object.prototype.hasOwnProperty.call(NUMBER_WORD_SCALES, token)) {
        total += (current || 1) * NUMBER_WORD_SCALES[token];
        current = 0;
      }
    });
    return String(total + current);
  }

  function normalizeProtectedQuantity(raw) {
    var word = raw.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(ORDINAL_WORD_VALUES, word)) return "ordinal:" + ORDINAL_WORD_VALUES[word];
    return QUANTITY_WORD_VALUES[word];
  }

  function normalizeDigitOrdinal(raw) {
    return "ordinal:" + Number(raw.replace(/(?:st|nd|rd|th)$/i, ""));
  }

  function numberOccurrences(text) {
    var masked = maskRanges(text, urlOccurrences(text).concat(dateOccurrences(text)));
    var regex = /(?:[$€£¥]\s*)?[+-]?(?:\d{1,3}(?:[,\u202F ]\d{3})+|\d+)(?:\.\d+)?(?:\s*(?:%|percent|per\s+cent|thousand|million|billion|trillion|bn|k))?/gi;
    regex.lastIndex = 0;
    var out = [];
    var match;
    while ((match = regex.exec(masked)) !== null) {
      var before = match.index > 0 ? masked.charAt(match.index - 1) : "";
      var after = masked.charAt(match.index + match[0].length);
      if (!/[A-Za-z0-9_]/.test(before) && !/[A-Za-z0-9_]/.test(after)) {
        out.push({ raw: match[0], normalized: normalizeNumber(match[0]), index: match.index, end: match.index + match[0].length });
      }
      if (regex.lastIndex === match.index) regex.lastIndex++;
    }
    ENGLISH_NUMBER_RE.lastIndex = 0;
    while ((match = ENGLISH_NUMBER_RE.exec(masked)) !== null) {
      out.push({ raw: match[0], normalized: normalizeEnglishNumber(match[0]), index: match.index, end: match.index + match[0].length });
      if (ENGLISH_NUMBER_RE.lastIndex === match.index) ENGLISH_NUMBER_RE.lastIndex++;
    }
    PROTECTED_QUANTITY_RE.lastIndex = 0;
    while ((match = PROTECTED_QUANTITY_RE.exec(masked)) !== null) {
      out.push({ raw: match[0], normalized: normalizeProtectedQuantity(match[0]), index: match.index, end: match.index + match[0].length });
      if (PROTECTED_QUANTITY_RE.lastIndex === match.index) PROTECTED_QUANTITY_RE.lastIndex++;
    }
    DIGIT_ORDINAL_RE.lastIndex = 0;
    while ((match = DIGIT_ORDINAL_RE.exec(masked)) !== null) {
      out.push({ raw: match[0], normalized: normalizeDigitOrdinal(match[0]), index: match.index, end: match.index + match[0].length });
      if (DIGIT_ORDINAL_RE.lastIndex === match.index) DIGIT_ORDINAL_RE.lastIndex++;
    }
    ALPHANUMERIC_NUMBER_RE.lastIndex = 0;
    while ((match = ALPHANUMERIC_NUMBER_RE.exec(masked)) !== null) {
      if (!/^\d+(?:st|nd|rd|th)$/i.test(match[0])) {
        out.push({ raw: match[0], normalized: match[0].toLowerCase(), index: match.index, end: match.index + match[0].length });
      }
      if (ALPHANUMERIC_NUMBER_RE.lastIndex === match.index) ALPHANUMERIC_NUMBER_RE.lastIndex++;
    }
    out.sort(function (left, right) { return left.index - right.index || right.end - left.end; });
    return out;
  }

  function quotationOccurrences(text) {
    var patterns = [
      /“([^”\n]{1,1000})”/g,
      /"([^"\n]{1,1000})"/g,
      /«([^»\n]{1,1000})»/g,
      /(?:^|[\s(])'([^'\n]{3,1000})'(?=$|[\s.,;:!?)])/g,
      /(?:^|[\s(])‘([^’\n]{3,1000})’(?=$|[\s.,;:!?)])/g
    ];
    var out = [];
    for (var p = 0; p < patterns.length; p++) {
      var regex = patterns[p];
      regex.lastIndex = 0;
      var match;
      while ((match = regex.exec(text)) !== null) {
        var raw = match[0];
        var leading = /^[\s(]/.test(raw) ? 1 : 0;
        var quotedRaw = leading ? raw.slice(1) : raw;
        var content = match[1];
        out.push({
          raw: quotedRaw,
          normalized: cleanText(content),
          index: match.index + leading,
          end: match.index + raw.length
        });
        if (regex.lastIndex === match.index) regex.lastIndex++;
      }
    }
    out.sort(function (a, b) { return a.index - b.index; });
    var kept = [];
    for (var i = 0; i < out.length; i++) {
      if (!kept.some(function (item) { return out[i].index < item.end && item.index < out[i].end; })) kept.push(out[i]);
    }
    return kept;
  }

  function normalizeEntity(raw) {
    return raw.replace(/[’']s\b/g, "").replace(/\s+/g, " ").replace(/[.,]+$/g, "").trim().toLowerCase();
  }

  function entityOccurrences(text) {
    var masked = maskRanges(text, urlOccurrences(text).concat(quotationOccurrences(text)));
    var candidates = [];
    var multi = /\b(?:[A-ZÀ-Þ][A-Za-zÀ-ÿ0-9'’.-]*)(?:\s+(?:of|the|and|&|de|van|von|[A-ZÀ-Þ][A-Za-zÀ-ÿ0-9'’.-]*)){1,4}\b/g;
    var match;
    while ((match = multi.exec(masked)) !== null) {
      var words = match[0].split(/\s+/);
      var capitalized = words.filter(function (word) { return /^[A-ZÀ-Þ]/.test(word); });
      if (capitalized.length >= 2 && !ENTITY_STOP_WORDS[capitalized[0]]) {
        candidates.push({ raw: match[0], normalized: normalizeEntity(match[0]), index: match.index, end: match.index + match[0].length });
      }
      if (multi.lastIndex === match.index) multi.lastIndex++;
    }

    var acronym = /\b[A-Z][A-Z0-9&.-]{1,11}\b/g;
    while ((match = acronym.exec(masked)) !== null) {
      if (/[A-Z].*[A-Z]/.test(match[0]) && !/^I$/.test(match[0])) {
        candidates.push({ raw: match[0], normalized: normalizeEntity(match[0]), index: match.index, end: match.index + match[0].length });
      }
      if (acronym.lastIndex === match.index) acronym.lastIndex++;
    }

    var camel = /\b[A-Z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*\b/g;
    while ((match = camel.exec(masked)) !== null) {
      candidates.push({ raw: match[0], normalized: normalizeEntity(match[0]), index: match.index, end: match.index + match[0].length });
      if (camel.lastIndex === match.index) camel.lastIndex++;
    }

    var titled = /\b(?:Dr|Mr|Mrs|Ms|Prof|Professor|President|Senator|Governor)\.?\s+[A-ZÀ-Þ][A-Za-zÀ-ÿ'’-]+\b/g;
    while ((match = titled.exec(masked)) !== null) {
      candidates.push({ raw: match[0], normalized: normalizeEntity(match[0]), index: match.index, end: match.index + match[0].length });
      if (titled.lastIndex === match.index) titled.lastIndex++;
    }

    var single = /\b[A-ZÀ-Þ][A-Za-zÀ-ÿ'’-]{2,}\b/g;
    while ((match = single.exec(masked)) !== null) {
      var previous = match.index > 0 ? masked.slice(0, match.index) : "";
      var atSentenceStart = match.index === 0 || /[.!?]\s*$/.test(previous) || /\n\s*$/.test(previous);
      if (!atSentenceStart && !ENTITY_STOP_WORDS[match[0]] && !MONTHS[match[0].toLowerCase()]) {
        candidates.push({ raw: match[0], normalized: normalizeEntity(match[0]), index: match.index, end: match.index + match[0].length });
      }
      if (single.lastIndex === match.index) single.lastIndex++;
    }

    candidates.sort(function (a, b) { return a.index - b.index || (b.end - b.index) - (a.end - a.index); });
    var kept = [];
    for (var i = 0; i < candidates.length; i++) {
      var candidate = candidates[i];
      if (!kept.some(function (item) { return candidate.index < item.end && item.index < candidate.end; })) kept.push(candidate);
    }
    return kept;
  }

  function extractRaw(occurrences) {
    return occurrences.map(function (item) { return item.raw; });
  }

  function extractNumbers(text) { return extractRaw(numberOccurrences(cleanText(text))); }
  function extractUrls(text) { return extractRaw(urlOccurrences(cleanText(text))); }
  function extractDates(text) { return extractRaw(dateOccurrences(cleanText(text))); }
  function extractQuotations(text) { return extractRaw(quotationOccurrences(cleanText(text))); }
  function extractNamedEntities(text) { return extractRaw(entityOccurrences(cleanText(text))); }

  function tokenize(text, removeStopWords) {
    var matches = cleanText(text).toLowerCase().match(/[a-zà-öø-ÿ0-9]+(?:['’][a-zà-öø-ÿ0-9]+)*/g) || [];
    if (!removeStopWords) return matches;
    return matches.filter(function (token) { return !STOP_WORDS[token]; });
  }

  function countTokens(tokens) {
    var counts = Object.create(null);
    for (var i = 0; i < tokens.length; i++) counts[tokens[i]] = (counts[tokens[i]] || 0) + 1;
    return counts;
  }

  function lexicalSimilarity(original, rewrite) {
    var left = tokenize(original, true);
    var right = original === rewrite ? left : tokenize(rewrite, true);
    if (!left.length && !right.length) {
      var same = cleanText(original).trim() === cleanText(rewrite).trim();
      return { score: same ? 1 : 0, multisetF1: same ? 1 : 0, jaccard: same ? 1 : 0, cosine: same ? 1 : 0, originalTokenCount: 0, rewriteTokenCount: 0 };
    }
    var a = countTokens(left);
    var b = countTokens(right);
    var keys = Object.keys(a);
    Object.keys(b).forEach(function (key) { if (!Object.prototype.hasOwnProperty.call(a, key)) keys.push(key); });
    var overlap = 0;
    var union = 0;
    var dot = 0;
    var normA = 0;
    var normB = 0;
    for (var i = 0; i < keys.length; i++) {
      var ca = a[keys[i]] || 0;
      var cb = b[keys[i]] || 0;
      overlap += Math.min(ca, cb);
      union += Math.max(ca, cb);
      dot += ca * cb;
      normA += ca * ca;
      normB += cb * cb;
    }
    var precision = right.length ? overlap / right.length : 0;
    var recall = left.length ? overlap / left.length : 0;
    var f1 = precision + recall ? 2 * precision * recall / (precision + recall) : 0;
    var cosine = normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
    return {
      score: (f1 + cosine) / 2,
      multisetF1: f1,
      jaccard: union ? overlap / union : 0,
      cosine: cosine,
      originalTokenCount: left.length,
      rewriteTokenCount: right.length
    };
  }

  function multisetDelta(original, rewrite) {
    var left = Object.create(null);
    var right = Object.create(null);
    original.forEach(function (item) {
      var key = item.normalized;
      if (!left[key]) left[key] = [];
      left[key].push(item.raw);
    });
    rewrite.forEach(function (item) {
      var key = item.normalized;
      if (!right[key]) right[key] = [];
      right[key].push(item.raw);
    });
    var removed = [];
    var added = [];
    Object.keys(left).forEach(function (key) {
      var difference = left[key].length - (right[key] ? right[key].length : 0);
      for (var i = 0; i < difference; i++) removed.push(left[key][i]);
    });
    Object.keys(right).forEach(function (key) {
      var difference = right[key].length - (left[key] ? left[key].length : 0);
      for (var i = 0; i < difference; i++) added.push(right[key][i]);
    });
    return { removed: removed, added: added };
  }

  function addPrimitiveCheck(checks, differences, name, original, rewrite, severity) {
    var delta = multisetDelta(original, rewrite);
    var singularNames = { numbers: "number", urls: "url", dates: "date", quotations: "quotation", named_entities: "named_entity" };
    var singular = singularNames[name] || name.replace(/s$/, "");
    var comparisonCount = Math.max(original.length, rewrite.length);
    var matchedCount = Math.max(0, original.length - delta.removed.length);
    checks[name] = {
      status: delta.removed.length || delta.added.length ? "changed" : "match",
      original: extractRaw(original),
      rewrite: extractRaw(rewrite),
      removed: delta.removed,
      added: delta.added,
      matchedCount: matchedCount,
      comparisonCount: comparisonCount,
      preservation: comparisonCount ? matchedCount / comparisonCount : null
    };
    delta.removed.forEach(function (value) {
      differences.push({ type: singular, change: "removed", severity: severity, original: value, rewrite: null, message: "Rewrite removed " + singular.replace(/_/g, " ") + ": " + value });
    });
    delta.added.forEach(function (value) {
      differences.push({ type: singular, change: "added", severity: severity, original: null, rewrite: value, message: "Rewrite added " + singular.replace(/_/g, " ") + ": " + value });
    });
  }

  function splitSentences(text) {
    var normalized = cleanText(text).replace(/\n{2,}/g, ". ");
    var matches = normalized.match(/[^.!?]+(?:[.!?]+(?:["”’']+)?(?=\s|$)|$)/g) || [];
    return matches.map(function (sentence) { return sentence.trim(); }).filter(Boolean);
  }

  function sentenceInitialEntityCandidate(sentence) {
    var match = String(sentence).match(/^\s*["'\u2018\u201C(\[]*([A-Z\u00C0-\u00DE][A-Za-z\u00C0-\u00FF'\u2019\u2013\u2014-]{2,})\b/);
    if (!match || ENTITY_STOP_WORDS[match[1]] || MONTHS[match[1].toLowerCase()]) return null;
    var tokens = tokenize(sentence, false);
    return {
      raw: match[1],
      normalized: normalizeEntity(match[1]),
      remainder: tokens.slice(1).join(" "),
      remainderTokens: tokens.slice(1),
      sentence: sentence
    };
  }

  function sentenceInitialRemainderMatch(original, rewrite) {
    if (original.remainder === rewrite.remainder) return { matches: true, similarity: 1, method: "exact_remainder" };
    var minimumTokens = Math.min(original.remainderTokens.length, rewrite.remainderTokens.length);
    if (minimumTokens < 4) return { matches: false, similarity: 0, method: "insufficient_context" };
    var similarity = uniqueSimilarity(original.remainderTokens, rewrite.remainderTokens);
    return {
      matches: similarity >= 0.78,
      similarity: similarity,
      method: "high_overlap_remainder"
    };
  }

  function analyzeSentenceInitialEntities(original, rewrite, checks, differences) {
    var originalCandidates = splitSentences(original).map(sentenceInitialEntityCandidate).filter(Boolean);
    var rewriteCandidates = splitSentences(rewrite).map(sentenceInitialEntityCandidate).filter(Boolean);
    var substitutions = [];
    var seen = Object.create(null);
    originalCandidates.forEach(function (candidate) {
      if (!candidate.remainder) return;
      var matches = rewriteCandidates.map(function (counterpart) {
        return { counterpart: counterpart, comparison: sentenceInitialRemainderMatch(candidate, counterpart) };
      }).filter(function (entry) { return entry.comparison.matches; });
      if (matches.some(function (entry) { return entry.counterpart.normalized === candidate.normalized; })) return;
      matches = matches.filter(function (entry) { return entry.counterpart.normalized !== candidate.normalized; });
      if (!matches.length) return;
      matches.sort(function (left, right) {
        return right.comparison.similarity - left.comparison.similarity ||
          Math.abs(candidate.remainderTokens.length - left.counterpart.remainderTokens.length) - Math.abs(candidate.remainderTokens.length - right.counterpart.remainderTokens.length);
      });
      var counterpart = matches[0].counterpart;
      var comparison = matches[0].comparison;
      var key = candidate.normalized + "\u0000" + counterpart.normalized + "\u0000" + candidate.remainder + "\u0000" + counterpart.remainder;
      if (seen[key]) return;
      seen[key] = true;
      substitutions.push({
        original: candidate.raw,
        rewrite: counterpart.raw,
        originalSentence: candidate.sentence,
        rewriteSentence: counterpart.sentence,
        remainderSimilarity: comparison.similarity,
        matchMethod: comparison.method
      });
    });
    checks.sentence_initial_entities = {
      status: substitutions.length ? "review" : "match",
      substitutions: substitutions,
      method: "capitalized sentence starters with exact or conservatively high-overlap remainders"
    };
    if (substitutions.length && checks.named_entities) {
      checks.named_entities.status = "changed";
      checks.named_entities.candidateSubstitutions = substitutions;
    }
    substitutions.forEach(function (substitution) {
      differences.push({
        type: "named_entity",
        change: "possible_substitution",
        severity: "warning",
        original: substitution.original,
        rewrite: substitution.rewrite,
        message: "A possible sentence-initial named entity changed from " + substitution.original + " to " + substitution.rewrite + "."
      });
    });
  }

  function stemToken(token) {
    if (token.length > 5 && /ing$/.test(token)) return token.slice(0, -3);
    if (token.length > 4 && /ed$/.test(token)) return token.slice(0, -2);
    if (token.length > 4 && /(?:sses|shes|ches|xes|zes|oes)$/.test(token)) return token.slice(0, -2);
    if (token.length > 3 && /s$/.test(token)) return token.slice(0, -1);
    return token;
  }

  function claimTokens(sentence, ignorePolarity) {
    return tokenize(sentence, true).filter(function (token) {
      return !ignorePolarity || (!NEGATIONS[token] && !UNCERTAIN[token] && !CERTAIN[token]);
    }).map(stemToken);
  }

  function uniqueSimilarity(left, right) {
    var a = makeSet(left);
    var b = makeSet(right);
    var keysA = Object.keys(a);
    var keysB = Object.keys(b);
    if (!keysA.length && !keysB.length) return 1;
    var overlap = keysA.filter(function (key) { return b[key]; }).length;
    return keysA.length + keysB.length ? (2 * overlap) / (keysA.length + keysB.length) : 0;
  }

  function sentenceHasFact(sentence) {
    return numberOccurrences(sentence).length || urlOccurrences(sentence).length || dateOccurrences(sentence).length || quotationOccurrences(sentence).length || entityOccurrences(sentence).length;
  }

  function isShortSubjectPredicateClaim(sentence) {
    if (tokenize(sentence, false).length !== 2) return false;
    var predicateMatch = String(sentence).trim().match(/([A-Za-z\u00C0-\u00FF]+(?:['\u2019][A-Za-z\u00C0-\u00FF]+)*)[.!?]+(?:["\u2019\u201D')\]]+)?$/);
    if (!predicateMatch || /^[A-Z\u00C0-\u00DE]/.test(predicateMatch[1])) return false;
    return Boolean(SHORT_CLAIM_PREDICATES[predicateMatch[1].toLowerCase().replace(/\u2019/g, "'")]);
  }

  function claimSentences(text) {
    return splitSentences(text).filter(function (sentence) {
      var content = claimTokens(sentence, false);
      var polarityNeutral = claimTokens(sentence, true);
      return Boolean(sentenceHasFact(sentence)) || isShortSubjectPredicateClaim(sentence) ||
        (tokenize(sentence, false).length >= 3 && polarityNeutral.length >= 2) ||
        (tokenize(sentence, false).length >= 4 && content.length >= 3);
    });
  }

  function tokenCoverage(tokens, otherTokens) {
    if (!tokens.length) return 1;
    var other = makeSet(otherTokens);
    var unique = Object.keys(makeSet(tokens));
    var found = unique.filter(function (token) { return other[token]; }).length;
    return unique.length ? found / unique.length : 1;
  }

  function negationParity(sentence) {
    var tokens = tokenize(sentence, false);
    var count = 0;
    for (var i = 0; i < tokens.length; i++) {
      var nonNegatingParallelism = (tokens[i] === "not" || /n't$/.test(tokens[i])) && (tokens[i + 1] === "only" || tokens[i + 1] === "just");
      if (!nonNegatingParallelism && (NEGATIONS[tokens[i]] || /n't$/.test(tokens[i]))) count++;
    }
    return count % 2;
  }

  function modality(sentence) {
    var tokens = tokenize(sentence, false);
    var uncertain = 0;
    var certain = 0;
    tokens.forEach(function (token) {
      if (UNCERTAIN[token]) uncertain++;
      if (CERTAIN[token]) certain++;
    });
    return uncertain ? "qualified" : (certain ? "assertive" : "neutral");
  }

  function polarContradiction(leftTokens, rightTokens) {
    var left = makeSet(leftTokens.map(stemToken));
    var right = makeSet(rightTokens.map(stemToken));
    for (var i = 0; i < POLAR_PAIRS.length; i++) {
      var a = stemToken(POLAR_PAIRS[i][0]);
      var b = stemToken(POLAR_PAIRS[i][1]);
      if ((left[a] && right[b]) || (left[b] && right[a])) return POLAR_PAIRS[i];
    }
    return null;
  }

  function analyzeClaims(original, rewrite, checks, differences) {
    var originalClaims = claimSentences(original);
    var rewriteClaims = claimSentences(rewrite);
    var allOriginalTokens = claimTokens(original, true);
    var allRewriteTokens = claimTokens(rewrite, true);
    var removed = [];
    var added = [];

    originalClaims.forEach(function (claim) {
      var tokens = claimTokens(claim, true);
      var best = 0;
      rewriteClaims.forEach(function (candidate) { best = Math.max(best, uniqueSimilarity(tokens, claimTokens(candidate, true))); });
      var coverage = tokenCoverage(tokens, allRewriteTokens);
      if (best < 0.3 && coverage < 0.35) removed.push({ text: claim, bestSimilarity: best, tokenCoverage: coverage });
    });
    rewriteClaims.forEach(function (claim) {
      var tokens = claimTokens(claim, true);
      var best = 0;
      originalClaims.forEach(function (candidate) { best = Math.max(best, uniqueSimilarity(tokens, claimTokens(candidate, true))); });
      var coverage = tokenCoverage(tokens, allOriginalTokens);
      if (best < 0.3 && coverage < 0.35) added.push({ text: claim, bestSimilarity: best, tokenCoverage: coverage });
    });

    removed.forEach(function (claim) {
      differences.push({ type: "claim", change: "removed", severity: "warning", original: claim.text, rewrite: null, similarity: claim.bestSimilarity, message: "A claim from the original has no clear counterpart in the rewrite." });
    });
    added.forEach(function (claim) {
      differences.push({ type: "claim", change: "added", severity: "warning", original: null, rewrite: claim.text, similarity: claim.bestSimilarity, message: "The rewrite contains a claim with no clear counterpart in the original." });
    });

    var polarityChanges = [];
    var qualifierChanges = [];
    originalClaims.forEach(function (left) {
      var best = 0;
      var counterpart = null;
      rewriteClaims.forEach(function (right) {
        var similarity = uniqueSimilarity(claimTokens(left, true), claimTokens(right, true));
        if (similarity > best) { best = similarity; counterpart = right; }
      });
      if (!counterpart || best < 0.5) return;
      if (negationParity(left) !== negationParity(counterpart)) {
        polarityChanges.push({ original: left, rewrite: counterpart, similarity: best, reason: "negation" });
      } else {
        var polar = polarContradiction(tokenize(left, true), tokenize(counterpart, true));
        if (polar) polarityChanges.push({ original: left, rewrite: counterpart, similarity: best, reason: "opposing terms: " + polar.join(" / ") });
      }
      var before = modality(left);
      var after = modality(counterpart);
      if (before !== after && best >= 0.65) qualifierChanges.push({ original: left, rewrite: counterpart, similarity: best, before: before, after: after });
    });

    polarityChanges.forEach(function (change) {
      differences.push({ type: "claim_polarity", change: "changed", severity: "error", original: change.original, rewrite: change.rewrite, similarity: change.similarity, message: "A closely matched claim changed polarity (" + change.reason + ")." });
    });
    qualifierChanges.forEach(function (change) {
      differences.push({ type: "claim_qualifier", change: "changed", severity: "warning", original: change.original, rewrite: change.rewrite, similarity: change.similarity, message: "A claim changed from " + change.before + " to " + change.after + "." });
    });

    checks.claims = {
      status: removed.length || added.length || polarityChanges.length || qualifierChanges.length ? "changed" : "match",
      originalCount: originalClaims.length,
      rewriteCount: rewriteClaims.length,
      removed: removed,
      added: added,
      polarityChanges: polarityChanges,
      qualifierChanges: qualifierChanges
    };
  }

  function invalidResult(original, rewrite) {
    var issues = [];
    if (typeof original !== "string") issues.push("original must be a string");
    if (typeof rewrite !== "string") issues.push("rewrite must be a string");
    return {
      kind: "semantic_integrity",
      status: "invalid",
      accepted: false,
      requiresReview: true,
      differences: issues.map(function (message) { return { type: "input", change: "invalid", severity: "error", message: message }; }),
      checks: {},
      score: 0,
      preservation: 0,
      scoreScale: { min: 0, max: 100, calibrated: false },
      scoreKind: "descriptive_semantic_integrity",
      calibrated: false,
      isProbability: false,
      scoreInterpretation: "Descriptive preservation evidence, not a probability.",
      criticalDifferenceCount: issues.length,
      summary: { errors: issues.length, warnings: 0, differences: issues.length },
      limitations: ["No semantic comparison was performed because the inputs were invalid."]
    };
  }

  function verifySemanticIntegrity(original, rewrite, options) {
    options = options || {};
    if (typeof original !== "string" || typeof rewrite !== "string") return invalidResult(original, rewrite);
    original = cleanText(original);
    rewrite = cleanText(rewrite);
    var checks = {};
    var differences = [];
    var originalTrimmed = original.trim();
    var rewriteTrimmed = rewrite.trim();
    var exactMatch = original === rewrite;

    if (!originalTrimmed || !rewriteTrimmed) {
      var bothEmpty = !originalTrimmed && !rewriteTrimmed;
      differences.push({
        type: "input",
        change: bothEmpty ? "insufficient" : (!originalTrimmed ? "original_empty" : "rewrite_empty"),
        severity: bothEmpty ? "warning" : "error",
        message: bothEmpty ? "Both texts are empty; semantic integrity cannot be assessed." : "One text is empty, so content preservation failed."
      });
    }

    var originalNumbers = numberOccurrences(original);
    var originalUrls = urlOccurrences(original);
    var originalDates = dateOccurrences(original);
    var originalQuotations = quotationOccurrences(original);
    var originalEntities = entityOccurrences(original);
    addPrimitiveCheck(checks, differences, "numbers", originalNumbers, exactMatch ? originalNumbers : numberOccurrences(rewrite), "error");
    addPrimitiveCheck(checks, differences, "urls", originalUrls, exactMatch ? originalUrls : urlOccurrences(rewrite), "error");
    addPrimitiveCheck(checks, differences, "dates", originalDates, exactMatch ? originalDates : dateOccurrences(rewrite), "error");
    addPrimitiveCheck(checks, differences, "quotations", originalQuotations, exactMatch ? originalQuotations : quotationOccurrences(rewrite), "error");
    addPrimitiveCheck(checks, differences, "named_entities", originalEntities, exactMatch ? originalEntities : entityOccurrences(rewrite), "error");

    var lexical = lexicalSimilarity(original, rewrite);
    var failThreshold = typeof options.lexicalFailThreshold === "number" ? options.lexicalFailThreshold : 0.25;
    var reviewThreshold = typeof options.lexicalReviewThreshold === "number" ? options.lexicalReviewThreshold : 0.55;
    checks.lexicalSimilarity = {
      status: lexical.score < failThreshold ? "divergent" : (lexical.score < reviewThreshold ? "review" : "similar"),
      score: lexical.score,
      multisetF1: lexical.multisetF1,
      jaccard: lexical.jaccard,
      cosine: lexical.cosine,
      originalTokenCount: lexical.originalTokenCount,
      rewriteTokenCount: lexical.rewriteTokenCount,
      interpretation: "Descriptive lexical overlap; not a calibrated semantic probability."
    };
    if (originalTrimmed !== rewriteTrimmed && lexical.score < failThreshold) {
      differences.push({ type: "lexical_similarity", change: "divergent", severity: "error", original: lexical.originalTokenCount, rewrite: lexical.rewriteTokenCount, value: lexical.score, message: "Major lexical overlap is very low." });
    } else if (originalTrimmed !== rewriteTrimmed && lexical.score < reviewThreshold) {
      differences.push({ type: "lexical_similarity", change: "low", severity: "warning", original: lexical.originalTokenCount, rewrite: lexical.rewriteTokenCount, value: lexical.score, message: "Lexical overlap is low enough to require review." });
    }
    if (originalTrimmed !== rewriteTrimmed && Math.min(lexical.originalTokenCount, lexical.rewriteTokenCount) < 4) {
      differences.push({ type: "semantic_signal", change: "insufficient", severity: "warning", message: "The changed text is too short for a reliable lexical comparison." });
    }

    if (exactMatch) {
      checks.sentence_initial_entities = { status: "match", substitutions: [], method: "exact text shortcut" };
      checks.claims = {
        status: "match",
        originalCount: null,
        rewriteCount: null,
        removed: [],
        added: [],
        polarityChanges: [],
        qualifierChanges: [],
        method: "exact text shortcut"
      };
    } else {
      analyzeSentenceInitialEntities(original, rewrite, checks, differences);
      analyzeClaims(original, rewrite, checks, differences);
    }

    var errors = differences.filter(function (difference) { return difference.severity === "error"; }).length;
    var warnings = differences.filter(function (difference) { return difference.severity === "warning"; }).length;
    var primitiveNames = ["numbers", "urls", "dates", "quotations", "named_entities"];
    var matchedFacts = 0;
    var comparedFacts = 0;
    primitiveNames.forEach(function (name) {
      matchedFacts += checks[name].matchedCount;
      comparedFacts += checks[name].comparisonCount;
    });
    var factualPreservation = comparedFacts ? matchedFacts / comparedFacts : null;
    var preservation = factualPreservation == null ? lexical.score : (lexical.score + factualPreservation) / 2;
    if (!originalTrimmed && !rewriteTrimmed) preservation = 0;
    var descriptiveScore = Math.max(0, Math.min(100, Math.round(preservation * 100)));
    var status;
    if (!originalTrimmed && !rewriteTrimmed) status = "insufficient";
    else if (errors) status = "fail";
    else if (warnings) status = "review";
    else status = "pass";
    return {
      kind: "semantic_integrity",
      status: status,
      accepted: status === "pass",
      requiresReview: status !== "pass",
      exactMatch: exactMatch,
      score: descriptiveScore,
      preservation: preservation,
      scoreScale: { min: 0, max: 100, calibrated: false },
      scoreKind: "descriptive_semantic_integrity",
      calibrated: false,
      isProbability: false,
      scoreInterpretation: comparedFacts
        ? "Uncalibrated descriptive average of lexical overlap and explicit fact-anchor preservation; not a probability."
        : "Uncalibrated descriptive lexical preservation score; no explicit fact anchors were available and this is not a probability.",
      criticalDifferenceCount: errors,
      differences: differences,
      checks: checks,
      summary: { errors: errors, warnings: warnings, differences: differences.length },
      limitations: [
        "This deterministic verifier checks textual evidence and obvious claim changes; it does not prove semantic equivalence.",
        "Named-entity extraction is deliberately conservative and may miss entities that require contextual language models.",
        "Lexical similarity is descriptive overlap, not a calibrated probability."
      ]
    };
  }

  return {
    verifySemanticIntegrity: verifySemanticIntegrity,
    compareSemanticIntegrity: verifySemanticIntegrity,
    extractNumbers: extractNumbers,
    extractUrls: extractUrls,
    extractDates: extractDates,
    extractQuotations: extractQuotations,
    extractNamedEntities: extractNamedEntities,
    extractNumberOccurrences: function (text) { return numberOccurrences(cleanText(text)); },
    extractUrlOccurrences: function (text) { return urlOccurrences(cleanText(text)); },
    extractDateOccurrences: function (text) { return dateOccurrences(cleanText(text)); },
    extractQuotationOccurrences: function (text) { return quotationOccurrences(cleanText(text)); },
    extractNamedEntityOccurrences: function (text) { return entityOccurrences(cleanText(text)); },
    lexicalSimilarity: lexicalSimilarity,
    splitSentences: splitSentences
  };
}));
