"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const core = require("../src/core/index.js");
const { createGPTZeroDetector, normalizeResponse } = require("../src/detectors/gptzero.js");
const { createDetector } = require("../src/detectors/index.js");
const { run, EXIT_CODES } = require("../src/cli/sapienize.js");
const { validateAnalysisResult } = require("../src/core/types.js");
const { evaluateDataset } = require("../eval/evaluator.js");

const key = "fixture-detector-secret-never-log";
const raw = {
  version: "fixture-version", documents: [{
    predicted_class: "mixed", confidence_category: "high",
    class_probabilities: { human: 0.1, ai: 0.2, mixed: 0.7 }
  }]
};
const clock = () => new Date("2026-10-29T12:00:00Z");
const ok = data => ({ ok: true, status: 200, json: async () => data });
const sample = "I check the figures first. Then I call the team. We don't need another meeting; we need a clear answer. ".repeat(20);
const facts = "We shipped 12 units on 4 July 2026.";
let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log("PASS:", name); }
  catch (error) { failures++; console.error("FAIL:", name, error.stack); }
}
async function cli(args, deps, env) {
  let stdout = "", stderr = "";
  const code = await run(args, {
    env: env || {}, cwd: process.cwd(), stdin: "",
    stdout: value => { stdout += value; }, stderr: value => { stderr += value; }
  }, deps);
  return { code, stdout, stderr, json: stdout ? JSON.parse(stdout) : null };
}

(async () => {
  await test("GPTZero uses the documented fixed endpoint and preserves three-class semantics", async () => {
    let call;
    const detector = createDetector("gptzero", {
      apiKey: key, clock, endpoint: "https://untrusted.example/", fetch: async (url, options) => {
        call = { url, options }; return ok(raw);
      }
    });
    const observation = await detector.analyze(facts);
    assert.strictEqual(call.url, "https://api.gptzero.me/v2/predict/text");
    assert.deepStrictEqual(JSON.parse(call.options.body), { document: facts });
    assert.strictEqual(call.options.headers["x-api-key"], key);
    assert.strictEqual(call.options.redirect, "error");
    assert.strictEqual(call.options.credentials, "omit");
    assert.strictEqual(observation.name, "GPTZero");
    assert.strictEqual(observation.version, raw.version);
    assert.strictEqual(observation.date, clock().toISOString());
    assert.deepStrictEqual(observation.raw, raw);
    assert.strictEqual(observation.normalized.aiScore, 0.2);
    assert.strictEqual(observation.normalized.predictedAi, null);
    assert.deepStrictEqual(observation.normalized.classProbabilities, { human: 0.1, ai: 0.2, mixed: 0.7 });
    assert.strictEqual(observation.calibrated, false);
    assert.ok(!JSON.stringify(observation).includes(key));
    const report = evaluateDataset([{ id: "one", text: facts, source_type: "mixed", metadata: { synthetic: true } }], {
      observations: { one: observation }
    });
    assert.strictEqual(report.results[0].predictedAi, null);
    assert.strictEqual(report.metrics.calibrationError, null);
    assert.strictEqual(report.results[0].aiScore, 0.2);
    assert.throws(() => createDetector("unconfigured"), /Unknown detector/);
  });

  await test("detection validates probabilities, inputs, failures, timeouts and secret echoes", async () => {
    for (const value of [null, {}, { documents: [] }, { documents: [raw.documents[0], raw.documents[0]] },
      { documents: [{ ...raw.documents[0], predicted_class: "unknown" }] },
      { documents: [{ ...raw.documents[0], class_probabilities: { human: 1, ai: 1, mixed: 0 } }] },
      { documents: [{ ...raw.documents[0], class_probabilities: { human: NaN, ai: 0, mixed: 0 } }] }]) {
      assert.throws(() => normalizeResponse(value), /GPTZero/);
    }
    let calls = 0;
    const fetch = async () => { calls++; return ok(raw); };
    await assert.rejects(createGPTZeroDetector({ fetch }).analyze(facts), /API key/);
    const detector = createGPTZeroDetector({ apiKey: key, fetch });
    await assert.rejects(detector.analyze(" "), /non-empty/);
    await assert.rejects(detector.analyze("a".repeat(150001)), /not truncated or sent/);
    assert.strictEqual(calls, 0);
    for (const status of [400, 401, 403, 429, 503]) {
      const failed = createGPTZeroDetector({ apiKey: key, fetch: async () => ({
        ok: false, status, json: async () => ({ message: key + facts })
      }) });
      await assert.rejects(failed.analyze(facts), error => {
        assert.strictEqual(error.status, status);
        assert.ok(!JSON.stringify(error).includes(key));
        assert.ok(!error.message.includes(facts));
        return true;
      });
    }
    const malformed = createGPTZeroDetector({ apiKey: key, fetch: async () => ({
      ok: true, json: async () => { throw new Error(key + facts); }
    }) });
    await assert.rejects(malformed.analyze(facts), error => !JSON.stringify(error).includes(key) && !error.message.includes(facts));
    const timeout = createGPTZeroDetector({ apiKey: key, timeoutMs: 1, fetch: () => new Promise(() => {}) });
    await assert.rejects(timeout.analyze(facts), error => error.name === "TimeoutError");
    const echo = createGPTZeroDetector({ apiKey: key, fetch: async () => ok({ ...raw, secret: key }) });
    await assert.rejects(echo.analyze(facts), /unsafe response/);
  });

  await test("core detection exposes an observation without replacing the style heuristic", async () => {
    const report = await core.detect(facts, { apiKey: key, clock, fetch: async () => ok(raw) });
    assert.strictEqual(validateAnalysisResult(report).valid, true);
    assert.strictEqual(report.detectorEstimate.status, "observed");
    assert.strictEqual(report.detectorEstimate.probability, null);
    assert.strictEqual(report.detectorEstimate.observations[0].normalized.aiScore, 0.2);
    assert.deepStrictEqual(report.stylisticSignals, core.analyze(facts).stylisticSignals);
    assert.strictEqual(core.analyze(facts).detectorEstimate.status, "unavailable");
    await assert.rejects(core.detect(facts, { detector: { analyze: async () => ({ score: 0.99 }) } }), /observation/);
  });

  await test("new drafts use measured voice and source facts, with truthful generation review", async () => {
    let received;
    const provider = { name: "fixture", rewrite: async (prompt, options) => {
      received = { prompt, options }; return { text: facts, completionStatus: "complete", completionReason: "stop" };
    } };
    const result = await core.generate("Write a short update for the team.", {
      voiceSamples: [sample], sourceFacts: facts, targetWords: 600, provider,
      detectorObservations: [{ name: "DETECTOR_SENTINEL" }], provenance: "PROVENANCE_SENTINEL"
    });
    assert.strictEqual(result.kind, "generation_result");
    assert.strictEqual(result.status, "review_required");
    assert.strictEqual(result.accepted, false);
    assert.strictEqual(result.completionStatus, "complete");
    assert.strictEqual(received.options.wordCount, 600);
    assert.ok(received.prompt.includes(facts));
    assert.ok(received.prompt.includes("<voice_profile>"));
    assert.ok(!received.prompt.includes(sample));
    assert.ok(!received.prompt.includes("DETECTOR_SENTINEL"));
    assert.ok(!received.prompt.includes("PROVENANCE_SENTINEL"));
    assert.strictEqual(result.verification.semanticIntegrity.status, "pass");
    assert.ok(Number.isFinite(result.verification.voiceMatch.score));
    const withoutFacts = await core.generate("Write a brief note.", { voiceSamples: "Short sample.", provider });
    assert.strictEqual(withoutFacts.verification.semanticIntegrity.status, "not_applicable");
    assert.ok(withoutFacts.verification.voiceMatch.warnings.length);
  });

  await test("generation flags changed facts, refusal and truncation and validates before requests", async () => {
    let calls = 0;
    const provider = { rewrite: async () => { calls++; return { text: facts.replace("12", "120") }; } };
    const result = await core.generate("Write an update.", { voiceSamples: sample, sourceFacts: facts, provider });
    assert.strictEqual(result.verification.semanticIntegrity.status, "fail");
    assert.strictEqual(result.accepted, false);
    const before = calls;
    for (const options of [{}, { voiceProfile: {} }, { voiceSamples: sample, targetWords: 2 },
      { voiceSamples: sample, sourceFacts: {} }, { voiceSamples: sample, targetWords: NaN }]) {
      await assert.rejects(core.generate("Write.", { ...options, provider }));
    }
    assert.strictEqual(calls, before);
    for (const flags of [{ truncated: true }, { refused: true }, { incomplete: true }, { completionStatus: "incomplete" }]) {
      const partial = await core.generate("Write.", { voiceSamples: sample, provider: { rewrite: async () => ({ text: "Partial", ...flags }) } });
      assert.strictEqual(partial.completionStatus, "incomplete");
      assert.strictEqual(partial.accepted, false);
    }
    await assert.rejects(core.generate("Write.", { voiceSamples: sample, provider: { rewrite: async () => ({ text: "" }) } }), /empty draft/);
  });

  await test("CLI detects and writes from sample directories through the actual core", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sapienize-product-"));
    try {
      const input = path.join(directory, "input.txt");
      const samples = path.join(directory, "samples");
      const source = path.join(directory, "facts.txt");
      fs.mkdirSync(samples);
      fs.writeFileSync(path.join(samples, "one.txt"), sample);
      fs.writeFileSync(input, "Write a team update.");
      fs.writeFileSync(source, facts);
      const prompts = [];
      const provider = { name: "fixture", rewrite: async prompt => { prompts.push(prompt); return facts; } };
      const generated = await cli(["generate", input, "--samples", samples, "--facts", source, "--words", "400"], { provider });
      assert.strictEqual(generated.code, EXIT_CODES.reviewRequired, generated.stderr);
      assert.strictEqual(generated.json.verification.semanticIntegrity.status, "pass");
      const rewritten = await cli(["rewrite", source, "--samples", samples], { provider });
      assert.strictEqual(rewritten.code, EXIT_CODES.reviewRequired, rewritten.stderr);
      assert.strictEqual(rewritten.json.voiceRefinement.targetMet, false);
      assert.strictEqual(rewritten.json.verification.semanticIntegrity.status, "pass");
      assert(prompts.every(p=>p.includes('<reference_prose_json>')), '--samples must retain prose context through the CLI');
      const detector = createGPTZeroDetector({ apiKey: key, clock, fetch: async () => ok(raw) });
      const detected = await cli(["detect", source], { detector }, { GPTZERO_API_KEY: key });
      assert.strictEqual(detected.code, EXIT_CODES.success, detected.stderr);
      assert.strictEqual(detected.json.detectorEstimate.observations[0].name, "GPTZero");
      assert.ok(!detected.stdout.includes(key));
      assert.strictEqual((await cli(["detect", source])).code, EXIT_CODES.operationalError);
      for (const args of [
        ["generate", input], ["generate", input, "--samples", samples, "--voice", source],
        ["generate", input, "--samples", samples, "--words", "oops"],
        ["generate", "-", "--samples", "-"], ["detect", input, "--detector", "unsupported"]
      ]) assert.strictEqual((await cli(args, { provider })).code, EXIT_CODES.usageError);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
  process.exitCode = failures ? 1 : 0;
})();
