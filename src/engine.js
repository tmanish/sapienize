/* Sapienize legacy engine facade - pure functions, no DOM. */
"use strict";

var SAPIENIZE_SCORING = (typeof module === "object" && module.exports)
  ? require("./analysis/scoring.js")
  : SapienizeScoring;

const SAPIENIZE_TELLS = [
  // Severity 3: high-priority patterns in the legacy style heuristic.
  { re: /\bdelv(?:e|es|ed|ing)\b/gi, label: "delve", cat: "lexical", sev: 3, fix: "dig into / look at / examine" },
  { re: /\b(?:rich\s+)?tapestry\b/gi, label: "tapestry", cat: "lexical", sev: 3, fix: "mix / range / variety" },
  { re: /\ba testament to\b/gi, label: "a testament to", cat: "lexical", sev: 3, fix: "shows / proves" },
  { re: /\bever[- ]evolving\b/gi, label: "ever-evolving", cat: "lexical", sev: 3, fix: "changing / cut it" },
  { re: /\bin today'?s (?:fast[- ]paced|digital|modern|rapidly changing)\b[^.!?]*/gi, label: "in today's [adjective] world", cat: "lexical", sev: 3, fix: "cut the opener, start with the point" },
  { re: /\bnavigat(?:e|ing) the (?:complexities|landscape|challenges)\b/gi, label: "navigate the complexities", cat: "lexical", sev: 3, fix: "handle / deal with / work through" },
  { re: /\bgame[- ]chang(?:er|ing)\b/gi, label: "game-changer", cat: "lexical", sev: 3, fix: "name the specific change" },
  { re: /\btreasure trove\b/gi, label: "treasure trove", cat: "lexical", sev: 3, fix: "a lot of / a stack of" },
  { re: /\bdouble[- ]edged sword\b/gi, label: "double-edged sword", cat: "lexical", sev: 3, fix: "state the tradeoff directly" },
  { re: /\bparadigm shift\b/gi, label: "paradigm shift", cat: "lexical", sev: 3, fix: "big change, then say what changed" },
  { re: /\bunlock(?:ing)? (?:the|new|your) (?:potential|power|possibilities|value)\b/gi, label: "unlock the potential", cat: "lexical", sev: 3, fix: "say what becomes possible" },
  { re: /\bit(?:'| i)s (?:important|worth) (?:to note|noting) that\b/gi, label: "it's important to note that", cat: "lexical", sev: 3, fix: "delete it, note the thing directly" },
  { re: /\bit should be noted that\b/gi, label: "it should be noted that", cat: "lexical", sev: 3, fix: "delete it" },
  { re: /\belevat(?:e|es|ing) your\b/gi, label: "elevate your", cat: "lexical", sev: 3, fix: "improve / sharpen" },
  { re: /\bseamless(?:ly)?\b/gi, label: "seamless", cat: "lexical", sev: 3, fix: "smooth / without extra steps" },
  { re: /\bsynerg(?:y|ies|istic)\b/gi, label: "synergy", cat: "lexical", sev: 3, fix: "say how the parts help each other" },
  { re: /\bholistic(?:ally)?\b/gi, label: "holistic", cat: "lexical", sev: 2, fix: "whole / end-to-end" },
  { re: /\bstands as a\b/gi, label: "stands as a", cat: "lexical", sev: 3, fix: "is" },
  { re: /\bserves as a\b/gi, label: "serves as a", cat: "lexical", sev: 2, fix: "is / works as" },
  { re: /\bplays a (?:vital|crucial|pivotal|key) role\b/gi, label: "plays a vital role", cat: "lexical", sev: 3, fix: "matters because... / does X" },
  { re: /\bin the (?:realm|world|landscape) of\b/gi, label: "in the realm of", cat: "lexical", sev: 3, fix: "in" },
  { re: /\bboasts\b/gi, label: "boasts", cat: "lexical", sev: 2, fix: "has" },
  { re: /\bmyriad\b/gi, label: "myriad", cat: "lexical", sev: 2, fix: "many" },
  { re: /\bplethora\b/gi, label: "plethora", cat: "lexical", sev: 3, fix: "plenty / a lot" },
  { re: /\bunderscore(?:s|d)?\b/gi, label: "underscore", cat: "lexical", sev: 2, fix: "show / highlight" },
  { re: /\bunderpins?\b/gi, label: "underpin", cat: "lexical", sev: 1, fix: "supports / is behind" },
  { re: /\bharness(?:ing|es)? the\b/gi, label: "harness the", cat: "lexical", sev: 3, fix: "use" },
  { re: /\bleverag(?:e|es|ed|ing)\b/gi, label: "leverage (verb)", cat: "lexical", sev: 2, fix: "use" },
  { re: /\bfoster(?:s|ing|ed)?\b/gi, label: "foster", cat: "lexical", sev: 2, fix: "build / encourage" },
  { re: /\bpivotal\b/gi, label: "pivotal", cat: "lexical", sev: 2, fix: "key / decisive" },
  { re: /\bcrucial\b/gi, label: "crucial", cat: "lexical", sev: 1, fix: "fine once; swap repeats for 'key' or specifics" },
  { re: /\brobust\b/gi, label: "robust", cat: "lexical", sev: 1, fix: "sturdy / reliable, or name the property" },
  { re: /\bcutting[- ]edge\b/gi, label: "cutting-edge", cat: "lexical", sev: 2, fix: "new / latest, or name the technique" },
  { re: /\bstate[- ]of[- ]the[- ]art\b/gi, label: "state-of-the-art", cat: "lexical", sev: 2, fix: "best available / newest" },
  { re: /\brevolutioniz(?:e|es|ed|ing)\b/gi, label: "revolutionize", cat: "lexical", sev: 2, fix: "change / replace, then say how" },
  { re: /\btransformative\b/gi, label: "transformative", cat: "lexical", sev: 2, fix: "say what it transforms into" },
  { re: /\bempower(?:s|ing|ed)?\b/gi, label: "empower", cat: "lexical", sev: 2, fix: "let / help / give X the ability to" },
  { re: /\bstreamlin(?:e|es|ed|ing)\b/gi, label: "streamline", cat: "lexical", sev: 2, fix: "simplify / cut steps" },
  { re: /\bcomprehensive guide\b/gi, label: "comprehensive guide", cat: "lexical", sev: 2, fix: "guide" },
  { re: /\bdive (?:in|into|deep)\b/gi, label: "dive into", cat: "lexical", sev: 2, fix: "look at / start with" },
  { re: /\bdeep dive\b/gi, label: "deep dive", cat: "lexical", sev: 2, fix: "close look" },
  { re: /\blet'?s explore\b/gi, label: "let's explore", cat: "lexical", sev: 2, fix: "here's how X works" },
  { re: /\bembark(?:s|ed|ing)? on\b/gi, label: "embark on", cat: "lexical", sev: 3, fix: "start" },
  { re: /\bat its core\b/gi, label: "at its core", cat: "lexical", sev: 2, fix: "basically / fundamentally, or cut" },
  { re: /\bin essence\b/gi, label: "in essence", cat: "lexical", sev: 2, fix: "cut, or 'basically'" },
  { re: /\bthe key takeaway\b/gi, label: "the key takeaway", cat: "lexical", sev: 2, fix: "the point is" },
  { re: /\bwhen it comes to\b/gi, label: "when it comes to", cat: "lexical", sev: 2, fix: "for / with" },
  { re: /\ba wide (?:range|array|variety) of\b/gi, label: "a wide range of", cat: "lexical", sev: 2, fix: "many / several, or list three" },
  { re: /\bneedless to say\b/gi, label: "needless to say", cat: "lexical", sev: 2, fix: "cut it, then say it anyway or don't" },
  { re: /\bthat being said\b/gi, label: "that being said", cat: "lexical", sev: 1, fix: "still / but" },
  { re: /\bwhether you'?re (?:a |an )?[^.!?]{3,60}? or (?:a |an )?/gi, label: "whether you're X or Y", cat: "structure", sev: 3, fix: "pick one reader and write to them" },
  { re: /\bnot only\b[^.!?]{3,120}?\bbut also\b/gi, label: "not only... but also", cat: "structure", sev: 2, fix: "split into two claims or keep the stronger one" },
  { re: /\b(?:it|this|that)(?:'| i)s not (?:just |only )?(?:about )?[^.!?;]{3,80}?[;,] (?:it|this|that)(?:'| i)s\b/gi, label: "it's not just X, it's Y", cat: "structure", sev: 3, fix: "state Y directly" },
  { re: /\bin conclusion\b/gi, label: "in conclusion", cat: "structure", sev: 3, fix: "just conclude" },
  { re: /\bin summary\b/gi, label: "in summary", cat: "structure", sev: 2, fix: "cut, or 'so:'" },
  { re: /^\s*(?:Moreover|Furthermore|Additionally|In addition),/gim, label: "Moreover/Furthermore/Additionally opener", cat: "rhythm", sev: 2, fix: "and / also / plus, or no connector at all" },
  { re: /\bfirstly\b/gi, label: "firstly", cat: "structure", sev: 2, fix: "first" },
  { re: /\bultimately\b/gi, label: "ultimately", cat: "lexical", sev: 1, fix: "in the end, or cut" },
  { re: /\bhowever, it(?:'| i)s\b/gi, label: "however, it is...", cat: "rhythm", sev: 1, fix: "but it's" },
  { re: /\bthe world of\b/gi, label: "the world of", cat: "lexical", sev: 2, fix: "cut: 'the world of crypto' is 'crypto'" },
  { re: /\bunleash(?:es|ed|ing)?\b/gi, label: "unleash", cat: "lexical", sev: 3, fix: "release / enable" },
  { re: /\bbeacon of\b/gi, label: "beacon of", cat: "lexical", sev: 3, fix: "example of" },
  { re: /\bvibrant\b/gi, label: "vibrant", cat: "lexical", sev: 2, fix: "lively, or describe what you actually see" },
  { re: /\bbustling\b/gi, label: "bustling", cat: "lexical", sev: 2, fix: "busy / crowded" },
  { re: /\bnestled\b/gi, label: "nestled", cat: "lexical", sev: 3, fix: "sits / located" },
  { re: /\bmeticulous(?:ly)?\b/gi, label: "meticulous", cat: "lexical", sev: 2, fix: "careful / exact" },
  { re: /\bintricate\b/gi, label: "intricate", cat: "lexical", sev: 2, fix: "detailed / complex" },
  { re: /\bswift(?:ly)? and\b/gi, label: "swiftly and", cat: "lexical", sev: 1, fix: "fast" },
  { re: /\bfast[- ]paced\b/gi, label: "fast-paced", cat: "lexical", sev: 2, fix: "cut, or name the actual speed" },
  { re: /\bcannot be overstated\b/gi, label: "cannot be overstated", cat: "lexical", sev: 3, fix: "state it at normal volume" },
  { re: /\bsignificant(?:ly)?\b/gi, label: "significant", cat: "lexical", sev: 1, fix: "give the number instead" },
  { re: /\butiliz(?:e|es|ed|ing|ation)\b/gi, label: "utilize", cat: "lexical", sev: 2, fix: "use" },
  { re: /\bfacilitat(?:e|es|ed|ing)\b/gi, label: "facilitate", cat: "lexical", sev: 2, fix: "help / make possible" },
  { re: /\bshowcas(?:e|es|ed|ing)\b/gi, label: "showcase", cat: "lexical", sev: 2, fix: "show" },
  { re: /\bdelight(?:ful|ed)?\b/gi, label: "delightful", cat: "lexical", sev: 1, fix: "say what's good about it" },
  { re: /\bunprecedented\b/gi, label: "unprecedented", cat: "lexical", sev: 2, fix: "new / first, with evidence" },
  { re: /\bstakeholders\b/gi, label: "stakeholders", cat: "lexical", sev: 1, fix: "name the actual people" },
  { re: /\bactionable insights?\b/gi, label: "actionable insights", cat: "lexical", sev: 3, fix: "things you can act on, or name one" },
  { re: /\bbest practices\b/gi, label: "best practices", cat: "lexical", sev: 1, fix: "fine in dev docs; elsewhere name the practice" },
  { re: /\bkey (?:insights?|considerations?|aspects?|factors?)\b/gi, label: "key insights/considerations", cat: "lexical", sev: 2, fix: "name them" },
  { re: /\bhere are (?:some|a few|the top)\b/gi, label: "here are some...", cat: "structure", sev: 1, fix: "go straight to the first item" },
  { re: /\bwithout further ado\b/gi, label: "without further ado", cat: "structure", sev: 3, fix: "cut" },
  { re: /\bhope this (?:helps|email finds you well)\b/gi, label: "hope this helps / finds you well", cat: "structure", sev: 2, fix: "cut or personalize" },
  // 2026 additions: negative parallelism and hook constructions
  { re: /\bnot because [^.!?]{2,60}?[.,] but because\b/gi, label: "not because X, but because Y", cat: "structure", sev: 3, fix: "give the real reason once, plainly" },
  { re: /\bno [\w''-]{1,16}\. no [\w''-]{1,16}\. just\b/gi, label: "No X. No Y. Just Z.", cat: "structure", sev: 3, fix: "one plain sentence about what it is" },
  { re: /\bthat'?s not [^.!?;]{2,40}?[,;] that'?s\b/gi, label: "that's not X, that's Y", cat: "structure", sev: 3, fix: "state Y directly" },
  { re: /\bnot by [\w ''-]{2,40}?, but by\b/gi, label: "not by X, but by Y", cat: "structure", sev: 2, fix: "keep the second half only" },
  { re: /\bAnd the [\w ''-]{1,24}\?/g, label: "And the X? Y.", cat: "structure", sev: 2, fix: "join it to the sentence it answers" },
  { re: /\bThe (?:result|catch|kicker|best part|upshot|problem|takeaway|verdict)\?/gi, label: "The result? (rhetorical fragment)", cat: "structure", sev: 2, fix: "just state the result" },
  { re: /\bhere'?s the (?:thing|kicker|catch|twist|bottom line)\b/gi, label: "here's the kicker", cat: "structure", sev: 2, fix: "delete the drumroll, keep the point" },
  { re: /\bpicture this\b/gi, label: "picture this", cat: "structure", sev: 3, fix: "open with the specific scene itself" },
  { re: /\bas an? [\w ]{3,24}, you know\b/gi, label: "as a [role], you know...", cat: "structure", sev: 2, fix: "say the thing without deputizing the reader" },
  { re: /\blet that sink in\b/gi, label: "let that sink in", cat: "structure", sev: 3, fix: "trust the reader; cut" },
  { re: /\bsound familiar\?/gi, label: "sound familiar?", cat: "structure", sev: 2, fix: "cut" },
  { re: /\blet'?s (?:be honest|face it)\b/gi, label: "let's be honest / face it", cat: "structure", sev: 1, fix: "just be honest without announcing it" },
  { re: /\bone thing is (?:clear|certain)\b/gi, label: "one thing is clear", cat: "structure", sev: 2, fix: "state the clear thing" },
  { re: /\bwhether we like it or not\b/gi, label: "whether we like it or not", cat: "structure", sev: 1, fix: "cut" },
  // 2026 additions: vocabulary
  { re: /\bmultifaceted\b/gi, label: "multifaceted", cat: "lexical", sev: 3, fix: "name two of the facets instead" },
  { re: /\binnovative\b/gi, label: "innovative", cat: "lexical", sev: 2, fix: "say what is new about it" },
  { re: /\boptimiz(?:e|es|ed|ing)\b/gi, label: "optimize", cat: "lexical", sev: 1, fix: "fine in code; in prose, improve / tune / speed up" },
  { re: /\bat the intersection of\b/gi, label: "at the intersection of", cat: "lexical", sev: 3, fix: "combining X and Y" },
  { re: /\bin a world where\b/gi, label: "in a world where", cat: "lexical", sev: 3, fix: "cut the movie-trailer opener" },
  { re: /\bin an era (?:of|where)\b/gi, label: "in an era of", cat: "lexical", sev: 2, fix: "now / today, or cut" },
  { re: /\bat the end of the day\b/gi, label: "at the end of the day", cat: "lexical", sev: 2, fix: "in the end, or cut" },
  { re: /\bmasterclass in\b/gi, label: "masterclass in", cat: "lexical", sev: 2, fix: "a strong example of" },
  { re: /\bsecret sauce\b/gi, label: "secret sauce", cat: "lexical", sev: 2, fix: "name the actual ingredient" },
  { re: /\bfuture[- ]proof(?:ing|ed)?\b/gi, label: "future-proof", cat: "lexical", sev: 2, fix: "durable / built to last, with evidence" },
  { re: /\bsupercharg(?:e|es|ed|ing)\b/gi, label: "supercharge", cat: "lexical", sev: 2, fix: "speed up / boost, with a number" },
  { re: /\bdemocratiz(?:e|es|ed|ing)\b/gi, label: "democratize", cat: "lexical", sev: 2, fix: "make X available to Y" },
  { re: /\bfrictionless\b/gi, label: "frictionless", cat: "lexical", sev: 2, fix: "easy / one step" },
  { re: /\bhere to stay\b/gi, label: "here to stay", cat: "lexical", sev: 2, fix: "not going away, or evidence it persists" },
  { re: /\bperfect storm\b/gi, label: "perfect storm", cat: "lexical", sev: 2, fix: "list the two or three causes" },
  { re: /\bchecks all the boxes\b/gi, label: "checks all the boxes", cat: "lexical", sev: 2, fix: "name the boxes" },
  { re: /\bmore than meets the eye\b/gi, label: "more than meets the eye", cat: "lexical", sev: 2, fix: "say what the hidden part is" },
  { re: /\bblazing(?:ly)?[- ]fast\b/gi, label: "blazing-fast", cat: "lexical", sev: 2, fix: "give the milliseconds" },
  { re: /\b(?:does|doing|do) the heavy lifting\b/gi, label: "does the heavy lifting", cat: "lexical", sev: 2, fix: "say what it actually does" },
  { re: /\bquietly (?:became|become|becoming|powerful|brilliant|revolutionary|impressive)\b/gi, label: "quietly [became/powerful]", cat: "lexical", sev: 2, fix: "drop 'quietly'" },
  { re: /\blook no further\b/gi, label: "look no further", cat: "lexical", sev: 3, fix: "cut" },
  { re: /\bin a nutshell\b/gi, label: "in a nutshell", cat: "lexical", sev: 1, fix: "in short, or cut" },
  { re: /\bstark reminder\b/gi, label: "stark reminder", cat: "lexical", sev: 2, fix: "reminder, or state the fact" },
  { re: /\bgrappl(?:e|es|ing) with\b/gi, label: "grapple with", cat: "lexical", sev: 1, fix: "struggle with / work through" },
  { re: /\bresonat(?:e|es|ed|ing)\b/gi, label: "resonate", cat: "lexical", sev: 1, fix: "land / connect / ring true" },
  { re: /\bjourney\b/gi, label: "journey (metaphorical)", cat: "lexical", sev: 1, fix: "process / path, or the literal thing" },
  { re: /\becosystem\b/gi, label: "ecosystem", cat: "lexical", sev: 1, fix: "fine in biology; elsewhere, platform / toolchain / market" },
  { re: /\blandscape\b/gi, label: "landscape (metaphorical)", cat: "lexical", sev: 1, fix: "market / field / space, or cut" },
  { re: /\bsilver bullet\b/gi, label: "silver bullet", cat: "lexical", sev: 1, fix: "single fix / cure-all" },
  { re: /\btable stakes\b/gi, label: "table stakes", cat: "lexical", sev: 1, fix: "the minimum / expected baseline" },
  { re: /\bnotably,/gi, label: "notably,", cat: "lexical", sev: 1, fix: "cut, or make the point carry its own weight" },
  { re: /\bcrucially,/gi, label: "crucially,", cat: "lexical", sev: 2, fix: "cut; if it's crucial, the sentence should show it" },
  { re: /\bimportantly,/gi, label: "importantly,", cat: "lexical", sev: 1, fix: "cut" },
  { re: /\barguably\b/gi, label: "arguably", cat: "lexical", sev: 1, fix: "commit or attribute the argument" },
  { re: /\bpro tip:/gi, label: "pro tip:", cat: "structure", sev: 1, fix: "just give the tip" },
  { re: /\bspoiler(?: alert)?:/gi, label: "spoiler:", cat: "structure", sev: 1, fix: "cut the wind-up" }
];

let SENT_RE = null;
try { SENT_RE = new RegExp("(?<=[.!?])\\s+(?=[A-Z\"'(\\[])"); } catch (e) { SENT_RE = null; }
let WORD_RE = null;
try { WORD_RE = new RegExp("[\\p{L}\\p{N}]+(?:['’-][\\p{L}\\p{N}]+)*", "gu"); }
catch (e) { WORD_RE = /[A-Za-z0-9'’-]+/g; }

// Invisible characters (zero-width space/joiner, word joiner, BOM, soft hyphen):
// These can alter tokenization or be accidental document-formatting residue.
const HIDDEN_RE = /[\u200B\u200C\u200D\u2060\uFEFF\u00AD]/g;

// Normalize the specimen before any scan so typographic variants (curly quotes,
// exotic spaces) and invisible integrity characters do not alter tell matching.
// Em and en dashes are deliberately NOT normalized: they are signals we count.
function normalizeForScan(text) {
  const hidden = (text.match(HIDDEN_RE) || []).length;
  const clean = text
    .replace(/\r\n?/g, "\n")
    .replace(HIDDEN_RE, "")
    .replace(/[\u2018\u2019\u02BC\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201F]/g, '"')
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F]/g, " ");
  return { text: clean, hidden: hidden };
}

// Legacy deterministic post-pass retained for API compatibility. The v2 rewrite
// pipeline does not call this automatically because punctuation should follow a
// supplied voice profile rather than a universal rule.
function sanitizeRewrite(text) {
  let out = text.replace(/[ \t]*—+[ \t]*/g, ", ");
  out = out.replace(/,\s+,/g, ",");
  out = out.replace(/,\s*([.,;:!?])/g, "$1");
  out = out.replace(/^[ \t]*,[ \t]*/gm, "");
  out = out.replace(/[ \t]+\n/g, "\n");
  out = out.replace(/[ \t]{2,}/g, " ");
  return out;
}

function splitSentences(text) {
  const clean = text.replace(/\r/g, "");
  if (SENT_RE) {
    return clean.split(SENT_RE).map(function (s) { return s.trim(); }).filter(Boolean);
  }
  // Fallback without lookbehind: split on terminator+space, reattach terminators.
  const parts = clean.split(/([.!?]+)\s+/);
  const out = [];
  for (let i = 0; i < parts.length; i += 2) {
    const s = (parts[i] + (parts[i + 1] || "")).trim();
    if (s) out.push(s);
  }
  return out;
}

function wordCount(text) {
  WORD_RE.lastIndex = 0;
  const m = text.match(WORD_RE);
  return m ? m.length : 0;
}

function stddev(arr) {
  if (arr.length < 2) return 0;
  const mean = arr.reduce(function (a, b) { return a + b; }, 0) / arr.length;
  const v = arr.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / arr.length;
  return Math.sqrt(v);
}

function analyzeText(input) {
  const norm = normalizeForScan(input);
  const text = norm.text;
  const findings = [];
  const words = wordCount(text);
  const sentences = splitSentences(text);
  const sentLens = sentences.map(wordCount).filter(function (n) { return n > 0; });
  const meanLen = sentLens.length ? sentLens.reduce(function (a, b) { return a + b; }, 0) / sentLens.length : 0;
  const burstiness = meanLen > 0 ? stddev(sentLens) / meanLen : 0;

  // 1. Lexical and phrase tells with match positions
  SAPIENIZE_TELLS.forEach(function (t) {
    t.re.lastIndex = 0;
    let m;
    while ((m = t.re.exec(text)) !== null) {
      findings.push({ start: m.index, end: m.index + m[0].length, label: t.label, cat: t.cat, sev: t.sev, fix: t.fix, snippet: m[0] });
      if (m.index === t.re.lastIndex) t.re.lastIndex++;
    }
  });

  // Resolve overlapping matches so one span of text yields one finding: higher
  // severity wins, then the longer match, then the earlier one. Keeps the score,
  // the findings tally, and the specimen highlights in agreement.
  findings.sort(function (a, b) {
    return b.sev - a.sev || (b.end - b.start) - (a.end - a.start) || a.start - b.start;
  });
  const inline = [];
  findings.forEach(function (f) {
    const clash = inline.some(function (k) { return f.start < k.end && k.start < f.end; });
    if (!clash) inline.push(f);
  });
  inline.sort(function (a, b) { return a.start - b.start; });

  // 2. Punctuation signals
  const emDashes = (text.match(/\u2014/g) || []).length;
  const emDashRate = words ? (emDashes / words) * 1000 : 0;
  const semis = (text.match(/;/g) || []).length;
  const semiRate = words ? (semis / words) * 1000 : 0;

  // 3. Contraction ratio
  const contractions = (text.match(/\b(?:\w+n['\u2019]t|\w+['\u2019](?:re|ve|ll|d|m)|it['\u2019]s|that['\u2019]s|there['\u2019]s|what['\u2019]s|let['\u2019]s|here['\u2019]s|who['\u2019]s)\b/gi) || []).length;
  const formalPairs = (text.match(/\b(?:do not|does not|did not|is not|are not|was not|were not|cannot|can not|will not|would not|should not|could not|have not|has not|had not|it is|that is|there is|they are|we are|you are|I am|I have|I will|we will|you will)\b/gi) || []).length;
  const contractionRatio = (contractions + formalPairs) > 0 ? contractions / (contractions + formalPairs) : null;

  // 4. Rhythm: monotone stretches (3+ consecutive sentences within +/-3 words of each other)
  let monotoneRuns = 0;
  for (let i = 0; i + 2 < sentLens.length; i++) {
    const a = sentLens[i], b = sentLens[i + 1], c = sentLens[i + 2];
    if (Math.abs(a - b) <= 3 && Math.abs(b - c) <= 3 && a >= 12) { monotoneRuns++; i += 2; }
  }

  // 5. Rule-of-three density
  const triads = sentences.filter(function (s) {
    return /\b[\w'\u2019-]+,\s+[\w'\u2019-]+(?:\s+[\w'\u2019-]+)?,\s+and\s+[\w'\u2019-]+/.test(s);
  }).length;
  const triadShare = sentences.length ? triads / sentences.length : 0;

  // 6. Repeated sentence openers
  const openerCounts = {};
  sentences.forEach(function (s) {
    const w = (s.match(/[A-Za-z'\u2019]+/) || [""])[0].toLowerCase();
    if (w.length > 1) openerCounts[w] = (openerCounts[w] || 0) + 1;
  });
  const repeatedOpeners = Object.keys(openerCounts).filter(function (w) {
    return openerCounts[w] >= 3 && ["the", "a", "i", "it", "this", "and", "but", "so", "we", "you"].indexOf(w) === -1;
  });

  // 7. Paragraph uniformity
  const paras = text.split(/\n\s*\n/).map(function (p) { return splitSentences(p).length; }).filter(function (n) { return n > 0; });
  const paraUniform = paras.length >= 4 && stddev(paras) < 0.75 && paras[0] >= 2;

  // Structural findings (document-level, no span)
  const global = [];
  if (norm.hidden > 0) global.push({ label: "invisible characters", cat: "document_integrity", sev: 3, detail: norm.hidden + " zero-width or invisible character(s) found and stripped before analysis. Review the source document to determine why they are present.", metric: norm.hidden });
  if (emDashRate > 4) global.push({ label: "high em dash frequency", cat: "punctuation", sev: 3, detail: emDashes + " em dashes (" + emDashRate.toFixed(1) + " per 1,000 words), above this configured style threshold. Compare with the author's VoiceProfile before revising.", metric: emDashRate });
  else if (emDashRate > 2) global.push({ label: "em dash frequency", cat: "punctuation", sev: 1, detail: emDashes + " em dashes. Review in context and compare with the author's punctuation habits.", metric: emDashRate });
  if (semiRate > 5) global.push({ label: "semicolon density", cat: "punctuation", sev: 1, detail: semis + " semicolons. This may be normal in the author's register; compare with the VoiceProfile.", metric: semiRate });
  if (contractionRatio !== null && contractionRatio < 0.25 && (contractions + formalPairs) >= 6) global.push({ label: "almost no contractions", cat: "voice", sev: 3, detail: "Contraction ratio " + Math.round(contractionRatio * 100) + "%. This is a formal-register signal; compare it with the authentic VoiceProfile rather than contracting automatically.", metric: contractionRatio });
  else if (contractionRatio !== null && contractionRatio < 0.45 && (contractions + formalPairs) >= 6) global.push({ label: "low contraction rate", cat: "voice", sev: 1, detail: "Contraction ratio " + Math.round(contractionRatio * 100) + "%. Review against the intended register and VoiceProfile.", metric: contractionRatio });
  if (burstiness < 0.32 && sentLens.length >= 6) global.push({ label: "flat sentence rhythm", cat: "rhythm", sev: 3, detail: "Burstiness " + burstiness.toFixed(2) + ". Sentence lengths are similar; compare this distribution with the authentic VoiceProfile.", metric: burstiness });
  else if (burstiness < 0.45 && sentLens.length >= 6) global.push({ label: "even sentence rhythm", cat: "rhythm", sev: 1, detail: "Burstiness " + burstiness.toFixed(2) + ". Sentence-length variation is modest; review in context.", metric: burstiness });
  if (monotoneRuns > 0) global.push({ label: "monotone stretches", cat: "rhythm", sev: 2, detail: monotoneRuns + " run(s) of 3+ back-to-back sentences of nearly identical length.", metric: monotoneRuns });
  if (triadShare > 0.18 && sentences.length >= 8) global.push({ label: "rule-of-three overload", cat: "structure", sev: 2, detail: triads + " of " + sentences.length + " sentences use an 'X, Y, and Z' triple. One is rhetoric. Six is a pattern.", metric: triadShare });
  if (repeatedOpeners.length > 0) global.push({ label: "repeated sentence openers", cat: "rhythm", sev: 1, detail: "3+ sentences each start with: " + repeatedOpeners.join(", ") + ".", metric: repeatedOpeners.length });
  if (paraUniform) global.push({ label: "uniform paragraph blocks", cat: "structure", sev: 2, detail: "Paragraphs are nearly the same size. This can be intentional; compare with the format and VoiceProfile.", metric: 1 });

  // Backward-compatible numeric alias. This is explicitly an uncalibrated style
  // heuristic, never a probability of human authorship.
  const scoreInfo = SAPIENIZE_SCORING.scoreStyleSignals({ words: words, inline: inline, global: global });
  const score = scoreInfo.value;
  const band = scoreInfo.band;
  const bandNote = scoreInfo.note;

  return {
    text: text,
    words: words,
    sentences: sentences.length,
    meanLen: meanLen,
    burstiness: burstiness,
    emDashes: emDashes,
    emDashRate: emDashRate,
    contractionRatio: contractionRatio,
    inline: inline,
    global: global,
    heuristicStyleScore: score,
    scoreInfo: scoreInfo,
    score: score,
    band: band,
    bandNote: bandNote
  };
}

var SapienizeEngine = { analyzeText: analyzeText, SAPIENIZE_TELLS: SAPIENIZE_TELLS, splitSentences: splitSentences, wordCount: wordCount, sanitizeRewrite: sanitizeRewrite, normalizeForScan: normalizeForScan };
if (typeof module !== "undefined") { module.exports = SapienizeEngine; }
