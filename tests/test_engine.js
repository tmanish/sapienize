"use strict";
const { analyzeText, sanitizeRewrite } = require("../src/engine.js");

const aiText = `In today's fast-paced digital landscape, artificial intelligence stands as a testament to human ingenuity. It is important to note that AI is not just a tool; it is a paradigm shift. Whether you're a developer or a designer, leveraging these cutting-edge solutions can unlock the potential of your workflow. Moreover, AI can streamline processes, foster collaboration, and elevate your productivity. Furthermore, it is crucial to delve into the myriad of possibilities. Additionally, organizations cannot afford to ignore this game-changer. In conclusion, the transformative power of AI cannot be overstated. It serves as a beacon of innovation \u2014 seamless, robust, and holistic \u2014 navigating the complexities of the ever-evolving world of technology. Ultimately, embracing AI is pivotal for stakeholders seeking actionable insights.`;

const humanText = `I broke the build twice on Tuesday. Both times it was the same dumb thing: a stale lockfile I'd forgotten to commit. So I wrote a tiny pre-push hook. Twenty lines of bash, nothing clever. It diffs the lockfile against HEAD and yells at me before the push goes out.

Did it save time? Honestly, maybe ten minutes a week. But the real win is smaller and harder to measure. I stopped bracing for that particular failure. That's worth more than the minutes.

If you want the script, it's in the repo under tools/. Steal it.`;

const a = analyzeText(aiText);
const h = analyzeText(humanText);

console.log("AI-flavored: score", a.score, "| band:", a.band, "| inline tells:", a.inline.length, "| global flags:", a.global.length, "| burstiness:", a.burstiness.toFixed(2));
console.log("Human-flavored: score", h.score, "| band:", h.band, "| inline tells:", h.inline.length, "| global flags:", h.global.length, "| burstiness:", h.burstiness.toFixed(2));

let fail = 0;
function assert(cond, msg) { if (!cond) { console.error("FAIL:", msg); fail++; } else { console.log("PASS:", msg); } }

assert(a.score < 45, "AI sample scores below 45 (got " + a.score + ")");
assert(h.score > 75, "Human sample scores above 75 (got " + h.score + ")");
assert(a.inline.length >= 15, "AI sample surfaces 15+ inline tells (got " + a.inline.length + ")");
assert(h.inline.length <= 2, "Human sample has 2 or fewer inline tells (got " + h.inline.length + ")");
assert(a.inline.every(f => f.end > f.start && aiText.slice(f.start, f.end) === f.snippet), "inline spans map back to source text exactly");
assert(a.inline.every((f, i) => i === 0 || f.start >= a.inline[i - 1].end), "inline spans are non-overlapping and position-sorted");
assert(analyzeText("").score >= 90, "empty text does not crash and scores high");

// Overlap resolution: nested matches collapse into one finding so the score,
// the tally, and the specimen highlights all agree.
const nested = analyzeText("In today's fast-paced digital landscape, we thrive.");
assert(nested.inline.length === 1 && nested.inline[0].sev === 3, "nested tells collapse into the strongest span (got " + nested.inline.length + ")");
const inner = analyzeText("It was not only seamless but also fast.");
assert(inner.inline.length === 1 && inner.inline[0].label === "seamless", "higher-severity inner tell beats weaker containing span (got " + inner.inline.map(f => f.label).join(", ") + ")");
const apart = analyzeText("We leverage a robust pipeline.");
assert(apart.inline.length === 2, "non-overlapping tells are all kept (got " + apart.inline.length + ")");

// Unicode robustness: typographic variants and evasion characters cannot dodge the scan.
const straight = "Whether you're a designer or a developer, let's explore the tooling. Here's the thing.";
const curly = straight.replace(/'/g, "’");
const labelsOf = r => JSON.stringify(r.inline.map(f => f.label));
assert(labelsOf(analyzeText(straight)) === labelsOf(analyzeText(curly)), "curly apostrophes produce identical findings to straight ones");
const zw = analyzeText("We de​lve into a sea​mless plan.");
assert(zw.inline.some(f => f.label === "delve") && zw.inline.some(f => f.label === "seamless"), "zero-width characters cannot hide a tell");
assert(zw.global.some(g => g.label === "invisible characters" && g.sev === 3), "hidden characters are themselves flagged as a strong tell");
assert(zw.inline.every(f => zw.text.slice(f.start, f.end) === f.snippet), "spans map exactly onto the normalized text");

// Library integrity: every entry must be safe for the exec loop and render cleanly.
const { SAPIENIZE_TELLS } = require("../src/engine.js");
const seenLabels = new Set();
const knownCats = ["lexical", "structure", "rhythm", "residue"];
SAPIENIZE_TELLS.forEach(t => {
  if (!t.re.global) assert(false, "tell is missing the g flag (exec loop would not advance): " + t.label);
  if (seenLabels.has(t.label)) assert(false, "duplicate tell label: " + t.label);
  if (knownCats.indexOf(t.cat) === -1 || [1, 2, 3].indexOf(t.sev) === -1 || !t.fix) assert(false, "malformed tell entry: " + t.label);
  seenLabels.add(t.label);
});
assert(seenLabels.size === SAPIENIZE_TELLS.length, "tell library entries are unique and well-formed (" + SAPIENIZE_TELLS.length + ")");

const flags = (text, label) => analyzeText(text).inline.some(f => f.label === label);
// Pattern fixes
assert(flags("The tool is fine. Moreover, it is cheap.", "Moreover/Furthermore/Additionally opener"), "Moreover opener is caught mid-paragraph, not only at line start");
assert(!flags("It was moreover, in a sense, cheap.", "Moreover/Furthermore/Additionally opener"), "lowercase mid-sentence 'moreover' is not an opener");
assert(flags("It's not just a tool — it's a mindset.", "it's not just X, it's Y"), "it's not just X — it's Y is caught with an em dash");
assert(flags("It's not just a tool. It's a mindset.", "it's not just X, it's Y"), "it's not just X. It's Y. is caught across a period");
assert(analyzeText("That's not a bug. That's a feature.").inline.some(f => f.sev === 3 && /not .*X, (?:it|that)'s Y/.test(f.label)), "that's not X. That's Y. is caught across a period");
assert(flags("It stands as an example.", "stands as a"), "stands as an is caught");
assert(!flags("She has been a foster parent for years.", "foster"), "foster care/parent vocabulary is not flagged");
assert(flags("We foster collaboration.", "foster"), "foster as a verb is still flagged");
assert(!flags("Use an underscore in the file name.", "underscore"), "the underscore character is not flagged");
assert(flags("The data underscores the risk.", "underscore"), "underscore as a verb is still flagged");
assert(!flags("The union had leverage in the talks.", "leverage (verb)"), "leverage as a noun is not flagged");
assert(flags("Teams can leverage the API.", "leverage (verb)"), "leverage as a verb is still flagged");
assert(flags("In today's interconnected economy, firms adapt.", "in today's [adjective] world"), "newer 'in today's' adjectives are caught");
// 2026-10 additions
assert(flags("As an AI language model, I cannot say.", "as an AI language model"), "chat disclaimer residue is caught");
assert(flags("As of my last knowledge update, the law stood.", "as of my last knowledge update"), "knowledge-cutoff residue is caught");
assert(flags("Certainly! Here is the summary.", "Certainly! (chat opener)"), "chat opener is caught at line start");
assert(!flags("He was certainly! not pleased.", "Certainly! (chat opener)"), "chat opener requires line start");
assert(flags("Great question! The answer is two.", "great question"), "sycophantic opener is caught");
assert(flags("Don't hesitate to reach out.", "don't hesitate to reach out"), "sign-off residue is caught");
assert(flags("In this article, we will cover caching.", "in this article, we will"), "article signposting is caught");
assert(flags("It's not just a library, but a platform.", "not just X, but Y"), "not just X, but Y is caught");
assert(flags("These results shed light on the cause.", "shed light on"), "shed light on is caught");
assert(flags("Imagine a world without passwords.", "imagine a world"), "imagine a world is caught");
assert(analyzeText(humanText).inline.length === 0, "additions do not flag the human sample");

// Sanitizer: em dash removal is a code guarantee, not a model behavior.
assert(sanitizeRewrite("A — B—C —.") === "A, B, C.", "em dashes collapse to commas without punctuation artifacts (got '" + sanitizeRewrite("A — B—C —.") + "')");
assert(sanitizeRewrite("One — two.\n\nThree — four.") === "One, two.\n\nThree, four.", "paragraph breaks survive sanitizing");
assert(analyzeText(sanitizeRewrite("Plan — test — ship — repeat — always.")).emDashes === 0, "sanitized text always counts zero em dashes");
process.exit(fail ? 1 : 0);
