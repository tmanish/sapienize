"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const core = require("../src/core/index.js");
const { EXIT_CODES, run } = require("../src/cli/sapienize.js");

let failures = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log("PASS:", name);
  } catch (error) {
    failures += 1;
    console.error("FAIL:", name);
    console.error(error && error.stack || error);
  }
}

function capture(cwd, extra) {
  let stdout = "";
  let stderr = "";
  const io = Object.assign({
    cwd,
    env: {},
    stdin: "",
    stdout: value => { stdout += value; },
    stderr: value => { stderr += value; }
  }, extra || {});
  return {
    io,
    stdout: () => stdout,
    stderr: () => stderr,
    json: () => JSON.parse(stdout)
  };
}

async function withTempDirectory(fn) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sapienize-cli-"));
  try {
    await fn(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

(async () => {
  await test("executable shebang prints command help", () => {
    const cli = path.join(__dirname, "..", "src", "cli", "sapienize.js");
    assert.strictEqual(fs.readFileSync(cli, "utf8").split("\n")[0], "#!/usr/bin/env node");
    const result = spawnSync(cli, ["--help"], { encoding: "utf8" });
    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stdout, /sapienize scan/);
  });

  await test("executable exits quietly when a downstream stdout pipe closes", async () => {
    const cli = path.join(__dirname, "..", "src", "cli", "sapienize.js");
    const largeInput = path.join(__dirname, "..", "sapienize.html");
    const child = spawn(process.execPath, [cli, "scan", largeInput], {
      cwd: path.join(__dirname, ".."),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.stdout.once("data", () => { child.stdout.destroy(); });
    const outcome = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    assert.strictEqual(outcome.signal, null);
    assert.strictEqual(outcome.code, EXIT_CODES.success, stderr);
    assert.doesNotMatch(stderr, /Unhandled 'error' event|EPIPE|node:events/);
  });

  await test("scan reads a file and emits structured JSON", () => withTempDirectory(async directory => {
    fs.writeFileSync(path.join(directory, "draft.txt"), "I shipped 12 units on 4 July 2026.");
    const output = capture(directory);
    const code = await run(["scan", "draft.txt"], output.io);
    assert.strictEqual(code, EXIT_CODES.success);
    const result = output.json();
    assert.strictEqual(result.schemaVersion, "2.0.0");
    assert.ok(result.stylisticSignals);
    assert.strictEqual(output.stderr(), "");
  }));

  await test("raw text input preserves a leading BOM for document-integrity review", async () => {
    const output = capture(process.cwd(), { stdin: "\uFEFFVisible text" });
    const code = await run(["provenance", "-"], output.io);
    assert.strictEqual(code, EXIT_CODES.success);
    assert.strictEqual(output.json().documentIntegrity.status, "review");
    assert.strictEqual(output.json().documentIntegrity.countsByCodePoint["U+FEFF"], 1);
  });

  await test("JSON redaction preserves shared result aliases without treating them as cycles", async () => {
    const output = capture(process.cwd(), { stdin: "Ordinary text." });
    const code = await run(["provenance", "-"], output.io);
    assert.strictEqual(code, EXIT_CODES.success);
    const result = output.json();
    assert.strictEqual(typeof result.watermarks.anthropic, "object");
    assert.strictEqual(typeof result.anthropicWatermark, "object");
    assert.deepStrictEqual(result.anthropicWatermark, result.watermarks.anthropic);
  });

  await test("profile reads directory files in deterministic filename order", () => withTempDirectory(async directory => {
    const samples = path.join(directory, "samples");
    fs.mkdirSync(samples);
    fs.writeFileSync(path.join(samples, "b.txt"), "second sample");
    fs.writeFileSync(path.join(samples, "a.txt"), "first sample");
    let received;
    const mockCore = {
      createVoiceProfile(values) {
        received = values;
        return { type: "VoiceProfile", sampleCount: values.length };
      }
    };
    const output = capture(directory);
    const code = await run(["profile", "samples"], output.io, { core: mockCore });
    assert.strictEqual(code, EXIT_CODES.success);
    assert.deepStrictEqual(received, ["first sample", "second sample"]);
    assert.deepStrictEqual(output.json(), { type: "VoiceProfile", sampleCount: 2 });
  }));

  await test("verify reports success and a distinct semantic-failure exit code", () => withTempDirectory(async directory => {
    fs.writeFileSync(path.join(directory, "original.txt"), "Acme shipped 12 units.");
    fs.writeFileSync(path.join(directory, "same.txt"), "Acme shipped 12 units.");
    fs.writeFileSync(path.join(directory, "changed.txt"), "Acme shipped 99 units.");

    const passing = capture(directory);
    assert.strictEqual(await run(["verify", "original.txt", "same.txt"], passing.io), EXIT_CODES.success);
    assert.strictEqual(passing.json().semanticIntegrity.status, "pass");

    const failing = capture(directory);
    assert.strictEqual(
      await run(["verify", "original.txt", "changed.txt"], failing.io),
      EXIT_CODES.verificationFailed
    );
    assert.strictEqual(failing.json().semanticIntegrity.status, "fail");
  }));

  await test("verify uses the review exit code when evidence is insufficient", () => withTempDirectory(async directory => {
    fs.writeFileSync(path.join(directory, "empty-original.txt"), "");
    fs.writeFileSync(path.join(directory, "empty-rewrite.txt"), "");
    const output = capture(directory);
    assert.strictEqual(
      await run(["verify", "empty-original.txt", "empty-rewrite.txt"], output.io),
      EXIT_CODES.reviewRequired
    );
    assert.strictEqual(output.json().status, "review");
    assert.strictEqual(output.json().semanticIntegrity.status, "insufficient");
  }));

  await test("commands reject ambiguous reuse of one stdin stream", async () => {
    const cases = [
      ["verify", "-", "-"],
      ["rewrite", "-", "--voice", "-"],
      ["eval", "-", "--observations", "-"]
    ];
    for (const args of cases) {
      const output = capture(process.cwd(), { stdin: "Acme shipped 12 units.\n" });
      const code = await run(args, output.io);
      assert.strictEqual(code, EXIT_CODES.usageError, args.join(" "));
      assert.match(JSON.parse(output.stderr()).error.message, /more than one input from stdin/i);
      assert.strictEqual(output.stdout(), "");
    }
  });

  await test("malformed JSON and unknown commands fail without throwing", () => withTempDirectory(async directory => {
    fs.writeFileSync(path.join(directory, "draft.txt"), "A draft.");
    fs.writeFileSync(path.join(directory, "bad-profile.json"), "{not-json}");
    const malformed = capture(directory, { env: { ANTHROPIC_API_KEY: "not-printed" } });
    const malformedCode = await run([
      "rewrite", "draft.txt", "--voice", "bad-profile.json"
    ], malformed.io, { core });
    assert.strictEqual(malformedCode, EXIT_CODES.operationalError);
    assert.match(JSON.parse(malformed.stderr()).error.message, /invalid JSON/);
    assert.doesNotMatch(malformed.stderr(), /not-printed/);

    const unknown = capture(directory);
    assert.strictEqual(await run(["frobnicate", "draft.txt"], unknown.io), EXIT_CODES.usageError);
    assert.match(JSON.parse(unknown.stderr()).error.message, /unknown command/);
  }));

  await test("rewrite accepts an injected provider and never emits its environment key", () => withTempDirectory(async directory => {
    fs.writeFileSync(path.join(directory, "draft.txt"), "We shipped 12 units.");
    fs.writeFileSync(path.join(directory, "voice.json"), JSON.stringify({ type: "VoiceProfile", schemaVersion: "1.0.0" }));
    const secret = "test-secret-that-must-stay-private";
    let received;
    const provider = { name: "fixture", rewrite: async () => "unused" };
    const mockCore = {
      async rewrite(text, options) {
        received = { text, options };
        return {
          kind: "rewrite_result",
          status: "complete",
          accepted: true,
          text: "We shipped 12 units, right on time.",
          debug: { apiKey: options.apiKey, message: "credential=" + options.apiKey }
        };
      }
    };
    const output = capture(directory, { env: { FIXTURE_KEY: secret } });
    const code = await run([
      "rewrite", "draft.txt", "--voice", "voice.json",
      "--provider", "openai", "--api-key-env", "FIXTURE_KEY",
      "--model", "fixture-model", "--persona", "concise"
    ], output.io, { core: mockCore, provider });
    assert.strictEqual(code, EXIT_CODES.success);
    assert.strictEqual(received.options.provider, provider);
    assert.strictEqual(received.options.apiKey, secret);
    assert.strictEqual(received.options.model, "fixture-model");
    assert.strictEqual(received.options.persona, "concise");
    assert.doesNotMatch(output.stdout(), new RegExp(secret));
    assert.strictEqual(output.json().debug.apiKey, "[REDACTED]");
    assert.match(output.json().debug.message, /\[REDACTED\]/);
  }));

  await test("eval accepts JSONL plus observation JSON", () => withTempDirectory(async directory => {
    fs.writeFileSync(path.join(directory, "dataset.jsonl"), JSON.stringify({
      id: "one", text: "A small public fixture.", source_type: "human",
      domain: "__proto__", model: "constructor"
    }) + "\n");
    fs.writeFileSync(path.join(directory, "observations.json"), JSON.stringify({
      one: { predictedAi: false, aiScore: 0.1 }
    }));
    const output = capture(directory);
    const code = await run([
      "eval", "dataset.jsonl", "--observations", "observations.json"
    ], output.io);
    assert.strictEqual(code, EXIT_CODES.success);
    assert.strictEqual(output.json().dataset.recordCount, 1);
    assert.strictEqual(output.json().metrics.overall.accuracy, 1);
    assert.strictEqual(output.json().metrics.perDomain.__proto__.recordCount, 1);
    assert.strictEqual(output.json().metrics.perModel.constructor.recordCount, 1);
  }));

  process.exitCode = failures ? 1 : 0;
})();
