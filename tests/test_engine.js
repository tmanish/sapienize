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

// Sanitizer: em dash removal is a code guarantee, not a model behavior.
assert(sanitizeRewrite("A — B—C —.") === "A, B, C.", "em dashes collapse to commas without punctuation artifacts (got '" + sanitizeRewrite("A — B—C —.") + "')");
assert(sanitizeRewrite("One — two.\n\nThree — four.") === "One, two.\n\nThree, four.", "paragraph breaks survive sanitizing");
assert(analyzeText(sanitizeRewrite("Plan — test — ship — repeat — always.")).emDashes === 0, "sanitized text always counts zero em dashes");
process.exit(fail ? 1 : 0);
