"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

async function until(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("Browser operation did not settle");
}

(async () => {
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, "../sapienize.html"), "utf8"), {
    runScripts: "dangerously", pretendToBeVisual: true
  });
  const w = dom.window;
  const $ = id => w.document.getElementById(id);
  const click = id => $(id).click();
  const input = (id, text) => { $(id).value = text; $(id).dispatchEvent(new w.Event("input")); };
  const response = data => ({ ok: true, status: 200, json: async () => w.JSON.parse(JSON.stringify(data)) });
  const raw = { version: "<img src=x onerror=alert(1)>", documents: [{
    predicted_class: "mixed", class_probabilities: { human: 0.1, ai: 0.01, mixed: 0.89 }
  }] };
  const facts = "We shipped 12 units on 4 July 2026.";
  const sample = "We check the figures first. We don't rush. Then we call the team. ".repeat(30);
  let calls = [];
  w.fetch = async (url, options) => { calls.push({ url, options }); return response(raw); };

  input("input", facts);
  click("analyzeBtn");
  assert.strictEqual(calls.length, 0, "local scanning must stay local");
  click("detectBtn");
  assert.strictEqual(calls.length, 0, "detection without credentials must not send text");
  input("detectorKey", "detector-fixture-secret");
  click("detectBtn");
  await until(() => !$("detectBtn").disabled);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, "https://api.gptzero.me/v2/predict/text");
  assert.strictEqual(calls[0].options.headers["x-api-key"], "detector-fixture-secret");
  assert.match($("detectionResult").textContent, /AI-only1.0%/);
  assert.match($("detectionResult").textContent, /Mixed89.0%/);
  assert.match($("detectStatus").textContent, /verdict: mixed/);
  assert.strictEqual($("detectStatus").querySelector("img"), null);

  w.fetch = async () => response({ documents: [] });
  click("detectBtn");
  await until(() => !$("detectBtn").disabled);
  assert.strictEqual($("detectionResult").textContent, "");
  assert.match($("detectStatus").textContent, /unavailable/i);

  let resolveDetection;
  w.fetch = () => new Promise(resolve => { resolveDetection = resolve; });
  click("detectBtn");
  await until(() => resolveDetection);
  input("input", "A different specimen.");
  resolveDetection(response(raw));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.strictEqual($("detectionResult").textContent, "");
  assert.match($("detectStatus").textContent, /Specimen changed/);

  $("provider").value = "openai";
  $("provider").dispatchEvent(new w.Event("change"));
  input("apiKey", "writer-fixture-secret");
  input("brief", "Write a launch update for the team.");
  input("voice", sample);
  input("sourceFacts", facts);
  let completion = facts;
  let reason = "stop";
  let prompts = [];
  w.fetch = async (url, options) => {
    assert.strictEqual(url, "https://api.openai.com/v1/chat/completions");
    assert.strictEqual(options.headers.Authorization, "Bearer writer-fixture-secret");
    assert.ok(!options.body.includes("detector-fixture-secret"));
    prompts.push(JSON.parse(options.body));
    return response({ choices: [{ message: { content: completion }, finish_reason: reason }] });
  };
  click("generateBtn");
  await until(() => !$("generateBtn").disabled);
  assert.strictEqual($("rwText").textContent, facts);
  assert.match($("draftTitle").textContent, /Generated draft/);
  assert.match($("rwReview").textContent, /Semantic review · pass/);
  assert.match($("rwDelta").textContent, /descriptive similarity/);
  assert.match($("rwStatus").textContent, /review/i);
  assert.ok(!JSON.stringify(prompts).includes(sample));

  completion = facts.replace("12", "120");
  click("generateBtn");
  await until(() => !$("generateBtn").disabled);
  assert.match($("rwReview").textContent, /Semantic review · fail/);

  input("sourceFacts", "");
  click("generateBtn");
  await until(() => !$("generateBtn").disabled);
  assert.match($("rwReview").textContent, /factual grounding was not verified/);
  assert.doesNotMatch($("rwReview").textContent, /No differences were found/);

  reason = "length";
  click("generateBtn");
  await until(() => !$("generateBtn").disabled);
  assert.match($("rwStatus").textContent, /token cap/);

  let resolveWriting;
  w.fetch = () => new Promise(resolve => { resolveWriting = resolve; });
  click("generateBtn");
  await until(() => resolveWriting);
  input("voice", "Changed writing sample.");
  resolveWriting(response({ choices: [{ message: { content: "Stale draft" }, finish_reason: "stop" }] }));
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok($("rwResult").classList.contains("hidden"));
  assert.notStrictEqual($("rwText").textContent, "Stale draft");

  const files = [new w.File([sample], "a.txt", { type: "text/plain" }), new w.File(["Another sample."], "b.md", { type: "text/markdown" })];
  Object.defineProperty($("voiceFiles"), "files", { value: files, configurable: true });
  $("voiceFiles").dispatchEvent(new w.Event("change"));
  await until(() => $("voice").value.includes("Another sample."));
  assert.match($("voiceSampleStatus").textContent, /same genre/);
  w.close();
  console.log("PASS: browser detection, generation, sample uploads, review states and stale-result handling");
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
