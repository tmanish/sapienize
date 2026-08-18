"use strict";
const assert = require("assert");
const core = require("../src/core/index.js");
const engine = require("../src/engine.js");

const empty = core.analyze("");
assert.strictEqual(empty.stylisticSignals.counts.words, 0);
assert.strictEqual(empty.stylisticSignals.heuristicStyleScore.isProbability, false);

const unicode = "你好世界。 Привет мир. Café naïve, I’m here.";
const unicodeResult = core.analyze(unicode);
assert.ok(unicodeResult.stylisticSignals.counts.words >= 7, "Unicode letters and curly contractions are counted");
assert.ok(engine.normalizeForScan("I’m here").text === "I'm here");

const longText = Array.from({ length: 5000 }, (_, index) => "Sentence " + index + " has concrete words and a value.").join(" ");
const longResult = core.analyze(longText);
assert.ok(longResult.stylisticSignals.counts.words >= 40000, "long input is analyzed without truncation");

const uk = core.createVoiceProfile("The colour of the organised centre is familiar. I’ve analysed the programme and recognised its behaviour.");
const us = core.createVoiceProfile("The color of the organized center is familiar. I've analyzed the program and recognized its behavior.");
assert.strictEqual(uk.features.spellingConvention.classification, "uk");
assert.strictEqual(us.features.spellingConvention.classification, "us");
assert.throws(() => core.createVoiceProfile([]), /sample/i);
assert.throws(() => core.compareVoice("text", {}), /VoiceProfile/);
assert.throws(() => core.verify({}, "text"), /string/);
console.log("PASS: empty, short, long, Unicode, malformed, and English-variety inputs");
