"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const Schema = require("../src/voice/schema.js");
const VoiceProfile = require("../src/voice/profile.js");
const VoiceCompare = require("../src/voice/compare.js");

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log("PASS:", name);
  } catch (error) {
    failures++;
    console.error("FAIL:", name);
    console.error(error && error.stack ? error.stack : error);
  }
}

const HABIT_REFERENCE = [
  "Honestly, I can't leave a rough edge alone—it nags at me. So I fix it.",
  "Tiny patch. Big relief. That's usually how my afternoons go: test, break, repair.",
  "Did it need another pass? Maybe not—but I'd rather know now than wonder later.",
  "I'm not chasing perfect prose (whatever that means). I want the thing to work.",
  "And when it doesn't? I write down why—it saves me from making the same mistake twice."
].join("\n\n");

const HABIT_MATCH = [
  "Honestly, I can't ignore a flaky test—it gets under my skin. So I trace it.",
  "Small clue. Quick check. That's how I spend a debugging hour: poke, observe, adjust.",
  "Could I leave it for tomorrow? Maybe—but I'd rather close the loop tonight.",
  "I'm not after a heroic rewrite (nobody needs that). I want the test to hold.",
  "And when it doesn't? I note the cause—it keeps the next failure boring."
].join("\n\n");

const FORMAL_CONTRAST = [
  "The investigation of intermittent test failures requires a systematic procedure involving the collection of logs, the classification of symptoms, and the careful evaluation of environmental conditions.",
  "Furthermore, engineers should document each observation before implementing a modification; this practice facilitates subsequent analysis and reduces uncertainty during review.",
  "The objective is not merely immediate remediation but also the establishment of a comprehensive and repeatable process for future maintenance activities.",
  "Consequently, the final report should present the evidence, describe the selected intervention, and enumerate any remaining operational risks."
].join("\n\n");

test("createVoiceProfile validates its input", () => {
  assert.throws(() => VoiceProfile.createVoiceProfile(), /string.*array/i);
  assert.throws(() => VoiceProfile.createVoiceProfile([]), /non-empty/i);
  assert.throws(() => VoiceProfile.createVoiceProfile(["valid", 42]), /samples\[1\].*string/i);
  assert.throws(() => VoiceProfile.createVoiceProfile("   "), /must not be empty/i);
});

test("short samples work and carry the 300-word quality warning", () => {
  const profile = VoiceProfile.createVoiceProfile("Short. But usable.");
  assert.strictEqual(profile.sample.wordCount, 3);
  assert.strictEqual(profile.sample.meetsRecommendedMinimum, false);
  assert(profile.warnings.some(warning => warning.code === "VOICE_SAMPLE_TOO_SHORT"));
  assert(profile.warnings.some(warning => /300 words/.test(warning.message)));
  assert.strictEqual(Schema.validateVoiceProfile(profile).valid, true);
});

test("300 or more words satisfy the documented sample recommendation", () => {
  const longSample = Array.from({ length: 305 }, (_, index) => "term" + (index % 17)).join(" ") + ".";
  const profile = VoiceProfile.createVoiceProfile(longSample);
  assert(profile.sample.wordCount >= 300);
  assert.strictEqual(profile.sample.meetsRecommendedMinimum, true);
  assert.strictEqual(profile.warnings.length, 0);
});

test("string arrays preserve sample boundaries and deterministic output", () => {
  const samples = ["I test small changes. Then I stop.", "You can read the notes. They are brief."];
  const first = VoiceProfile.createVoiceProfile(samples);
  const second = VoiceProfile.createVoiceProfile(samples);
  assert.strictEqual(first.sample.sampleCount, 2);
  assert(first.sample.paragraphCount >= 2);
  assert.deepStrictEqual(first, second);
});

test("the profile exposes all requested characteristic families", () => {
  const profile = VoiceProfile.createVoiceProfile(HABIT_REFERENCE);
  Schema.REQUIRED_FEATURES.forEach(feature => assert(profile.features[feature], "missing " + feature));
  assert(profile.features.sentenceLength.distribution.veryShort > 0);
  assert(profile.features.paragraphLength.words.mean > 0);
  assert(profile.features.fragments.shortSentenceRate > 0);
  assert(profile.features.lexicalDiversity.movingAverageTypeTokenRatio > 0);
  assert(profile.features.parentheticals.count > 0);
  assert(profile.features.questions.rate > 0);
  assert(profile.features.pronouns.counts.firstPerson > 0);
  assert(profile.features.functionWords.totalRate > 0);
  assert(profile.features.conjunctions.counts.coordinating > 0);
  assert(profile.features.hedges.frequencies.maybe > 0);
  assert(profile.features.discourseMarkers.frequencies.honestly > 0);
  assert(profile.features.sentenceOpenings.preferred.length > 0);
  assert(profile.features.vocabulary.averageWordLength > 0);
  assert(profile.features.rhythm.coefficientOfVariation > 0);
});

test("genuine em-dash and contraction habits are recorded rather than penalised", () => {
  const profile = VoiceProfile.createVoiceProfile(HABIT_REFERENCE);
  assert(profile.features.punctuation.counts.emDash >= 3);
  assert(profile.features.punctuation.perThousandWords.emDash > 0);
  assert(profile.features.contractions.count >= 5);
  assert(profile.features.contractions.rate > 0.5);
  assert.strictEqual(VoiceCompare.compareVoice(HABIT_REFERENCE, profile).score, 100);

  const retained = VoiceCompare.compareVoice(HABIT_MATCH, profile);
  const removed = VoiceCompare.compareVoice(FORMAL_CONTRAST, profile);
  assert(retained.components.punctuation.similarity > removed.components.punctuation.similarity);
  assert(retained.components.contractions.similarity > removed.components.contractions.similarity);
});

test("self and same-style text compare above a contrasting register", () => {
  const profile = VoiceProfile.createVoiceProfile(HABIT_REFERENCE);
  const self = VoiceCompare.compareVoice(HABIT_REFERENCE, profile);
  const related = VoiceCompare.compareVoice(HABIT_MATCH, profile);
  const contrast = VoiceCompare.compareVoice(FORMAL_CONTRAST, profile);
  assert.strictEqual(self.score, 100);
  assert.strictEqual(self.normalizedSimilarity, 1);
  assert(related.score > contrast.score, related.score + " should exceed " + contrast.score);
  assert(contrast.differences.length === Object.keys(contrast.components).length);
  assert(contrast.differences[0].difference >= contrast.differences[1].difference);
  assert.strictEqual(contrast.calibrated, false);
  assert.strictEqual(contrast.authorshipProbability, null);
  assert(/not calibrated/i.test(contrast.disclaimer));
  assert(/not a probability/i.test(contrast.disclaimer));
});

test("Unicode words, curly contractions, and English spelling varieties survive extraction", () => {
  const uk = VoiceProfile.createVoiceProfile(
    "I’m analysing the café’s colour palette at the theatre. My favourite programme travelled through the city centre; we realised the behaviour looked odd."
  );
  const us = VoiceProfile.createVoiceProfile(
    "I'm analyzing the cafe's color palette at the theater. My favorite program traveled through the city center; we realized the behavior looked odd."
  );
  assert(uk.sample.wordCount >= 20, "Unicode words should be tokenised");
  assert.strictEqual(uk.features.contractions.forms["i'm"], 1);
  assert.strictEqual(uk.features.spellingConvention.classification, "uk");
  assert.strictEqual(us.features.spellingConvention.classification, "us");
  assert(VoiceCompare.compareVoice(HABIT_MATCH.replace(/'/g, "’"), VoiceProfile.createVoiceProfile(HABIT_MATCH)).score > 95);
});

test("prototype-reserved words remain ordinary openings, vocabulary, and fragment tokens", () => {
  const text = "Constructor. toString formats values. Constructor handles output. toString returns text.";
  const profile = VoiceProfile.createVoiceProfile(text);

  assert.strictEqual(profile.sample.sentenceCount, 4, "Constructor must not be mistaken for an inherited abbreviation");
  assert.strictEqual(Object.getPrototypeOf(profile.features.sentenceOpenings.openingWords), null);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(profile.features.sentenceOpenings.openingWords, "constructor"), true);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(profile.features.sentenceOpenings.openingWords, "tostring"), true);
  assert.strictEqual(profile.features.sentenceOpenings.openingWords.constructor, 0.5);
  assert.strictEqual(profile.features.sentenceOpenings.openingWords.tostring, 0.5);

  const constructorWord = profile.features.vocabulary.topContentWords.find(entry => entry.word === "constructor");
  const toStringWord = profile.features.vocabulary.topContentWords.find(entry => entry.word === "tostring");
  assert.deepStrictEqual(constructorWord, { word: "constructor", count: 2, perThousandWords: 200 });
  assert.deepStrictEqual(toStringWord, { word: "tostring", count: 2, perThousandWords: 200 });

  const fragmentProfile = VoiceProfile.createVoiceProfile("The Constructor. It worked.");
  assert.strictEqual(fragmentProfile.features.fragments.fragmentCount, 1, "constructor must not inherit Object.prototype.constructor as a verb");

  const comparison = VoiceCompare.compareVoice("Ordinary words appear. They worked.", profile);
  assert(Number.isFinite(comparison.score));
  assert.strictEqual(Schema.validateVoiceComparison(comparison).valid, true);
});

test("schema and comparison reject malformed profiles", () => {
  const profile = VoiceProfile.createVoiceProfile(HABIT_REFERENCE);
  const malformed = JSON.parse(JSON.stringify(profile));
  delete malformed.features.rhythm;
  const validation = Schema.validateVoiceProfile(malformed);
  assert.strictEqual(validation.valid, false);
  assert(validation.errors.some(error => /rhythm/.test(error)));
  assert.throws(() => VoiceCompare.compareVoice("Some text.", malformed), /Invalid VoiceProfile/);
  assert.throws(() => VoiceCompare.compareVoice("", profile), /non-empty string/);
  assert.throws(() => VoiceCompare.compareVoice(null, profile), /non-empty string/);
});

test("profile validation guards malformed nested fields used by comparison", () => {
  const profile = VoiceProfile.createVoiceProfile(HABIT_REFERENCE);
  const cases = [
    {
      path: "features.pronouns.counts",
      mutate(value) { delete value.features.pronouns.counts; }
    },
    {
      path: "features.vocabulary.wordLengthDistribution",
      mutate(value) { delete value.features.vocabulary.wordLengthDistribution; }
    },
    {
      path: "features.vocabulary.topContentWords",
      mutate(value) { delete value.features.vocabulary.topContentWords; }
    },
    {
      path: "features.rhythm.interquartileRange",
      mutate(value) { delete value.features.rhythm.interquartileRange; }
    }
  ];

  cases.forEach(testCase => {
    const malformed = JSON.parse(JSON.stringify(profile));
    testCase.mutate(malformed);
    let validation;
    assert.doesNotThrow(() => { validation = Schema.validateVoiceProfile(malformed); }, testCase.path);
    assert.strictEqual(validation.valid, false, testCase.path);
    assert(validation.errors.some(error => error.includes(testCase.path)), validation.errors.join("; "));
    assert.throws(() => VoiceCompare.compareVoice("Some comparison text.", malformed), /Invalid VoiceProfile/);
  });
});

test("VoiceComparison has a versioned runtime-validated contract", () => {
  const profile = VoiceProfile.createVoiceProfile(HABIT_REFERENCE);
  let validationCalls = 0;
  const originalAssert = Schema.assertVoiceComparison;
  Schema.assertVoiceComparison = comparison => {
    validationCalls++;
    return originalAssert(comparison);
  };
  let comparison;
  try {
    comparison = VoiceCompare.compareVoice(HABIT_MATCH, profile);
  } finally {
    Schema.assertVoiceComparison = originalAssert;
  }

  assert.strictEqual(validationCalls, 1, "compareVoice must validate its own result");
  assert.strictEqual(comparison.type, Schema.VOICE_COMPARISON_TYPE);
  assert.strictEqual(comparison.schemaVersion, Schema.VOICE_COMPARISON_SCHEMA_VERSION);
  assert.strictEqual(Schema.VOICE_COMPARISON_SCHEMA.$id, "https://sapienize.dev/schemas/voice-comparison-1.0.0.json");
  assert.strictEqual(Schema.validateVoiceComparison(comparison).valid, true);
  assert.strictEqual(Schema.isVoiceComparison(comparison), true);
  assert.strictEqual(Schema.assertVoiceComparison(comparison), comparison);

  const missingComponent = JSON.parse(JSON.stringify(comparison));
  delete missingComponent.components.rhythm;
  assert.strictEqual(Schema.validateVoiceComparison(missingComponent).valid, false);
  assert.throws(() => Schema.assertVoiceComparison(missingComponent), /Invalid VoiceComparison/);

  const malformedNested = JSON.parse(JSON.stringify(comparison));
  delete malformedNested.components.pronouns.reference;
  let nestedValidation;
  assert.doesNotThrow(() => { nestedValidation = Schema.validateVoiceComparison(malformedNested); });
  assert.strictEqual(nestedValidation.valid, false);
  assert(nestedValidation.errors.some(error => /components\.pronouns\.reference/.test(error)));
});

test("voice contracts reject values that cannot round-trip through JSON", () => {
  const profile = VoiceProfile.createVoiceProfile(HABIT_REFERENCE);
  const comparison = VoiceCompare.compareVoice(HABIT_MATCH, profile);

  assert.strictEqual(Schema.validateVoiceProfile(JSON.parse(JSON.stringify(profile))).valid, true);
  assert.strictEqual(Schema.validateVoiceComparison(JSON.parse(JSON.stringify(comparison))).valid, true);
  assert.strictEqual(Schema.validateVoiceProfile(Object.create(profile)).valid, false);
  assert.strictEqual(Schema.validateVoiceComparison(Object.create(comparison)).valid, false);

  const inheritedSample = JSON.parse(JSON.stringify(profile));
  inheritedSample.sample = Object.create(profile.sample);
  assert.strictEqual(Schema.validateVoiceProfile(inheritedSample).valid, false);

  const inheritedFeatures = JSON.parse(JSON.stringify(profile));
  inheritedFeatures.features = Object.create(profile.features);
  assert.strictEqual(Schema.validateVoiceProfile(inheritedFeatures).valid, false);

  const inheritedReference = JSON.parse(JSON.stringify(comparison));
  inheritedReference.referenceSample = Object.create(comparison.referenceSample);
  assert.strictEqual(Schema.validateVoiceComparison(inheritedReference).valid, false);

  const accessorProfile = {};
  Object.keys(profile).forEach(key => {
    Object.defineProperty(accessorProfile, key, { enumerable: true, get: () => profile[key] });
  });
  assert.strictEqual(Schema.validateVoiceProfile(accessorProfile).valid, false);

  const hiddenComparison = {};
  Object.keys(comparison).forEach(key => {
    Object.defineProperty(hiddenComparison, key, { enumerable: false, value: comparison[key] });
  });
  assert.strictEqual(Schema.validateVoiceComparison(hiddenComparison).valid, false);
});

test("classic browser scripts publish the documented UMD globals", () => {
  const context = vm.createContext({ console });
  ["schema.js", "profile.js", "compare.js"].forEach(file => {
    const source = fs.readFileSync(path.join(__dirname, "../src/voice", file), "utf8");
    vm.runInContext(source, context, { filename: file });
  });
  assert(context.SapienizeVoiceSchema);
  assert(context.SapienizeVoiceProfile);
  assert(context.SapienizeVoiceCompare);
  const profile = context.SapienizeVoiceProfile.createVoiceProfile("I can’t wait—can you?");
  const result = context.SapienizeVoiceCompare.compareVoice("I can’t wait—can you?", profile);
  assert.strictEqual(result.score, 100);
});

process.exitCode = failures ? 1 : 0;
