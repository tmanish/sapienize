"use strict";
const { JSDOM } = require("jsdom");
const fs = require("fs");
const dom = new JSDOM(fs.readFileSync(__dirname + "/../sapienize.html", "utf8"), { runScripts: "dangerously", pretendToBeVisual: true });
const w = dom.window, d = w.document;
let fail = 0;
const assert = (c, m) => { console.log((c ? "PASS: " : "FAIL: ") + m); if (!c) fail++; };
let cap = null;
const okOpenAI = { ok: true, json: () => Promise.resolve({ choices: [{ finish_reason: "stop", message: { content: "Rewritten plainly. Short. It commits to claims and skips the paste." } }] }) };
w.fetch = (url, opts) => { cap = { url, opts }; return Promise.resolve(okOpenAI); };

d.getElementById("loadSample").dispatchEvent(new w.Event("click"));
d.getElementById("analyzeBtn").dispatchEvent(new w.Event("click"));

// settings toggle
d.getElementById("settingsBtn").dispatchEvent(new w.Event("click"));
assert(!d.getElementById("keyRow").classList.contains("hidden"), "API settings toggle reveals the row");

// provider change prefills model
d.getElementById("provider").value = "openrouter";
d.getElementById("provider").dispatchEvent(new w.Event("change"));
assert(d.getElementById("modelName").value === "openai/gpt-4o-mini", "provider change prefills OpenRouter model");

// non-anthropic without key is blocked before any request
cap = null;
d.getElementById("rewriteBtn").dispatchEvent(new w.Event("click"));
setTimeout(() => {
  assert(cap === null, "no request fired without a key for OpenRouter");
  assert(/needs your own API key/.test(d.getElementById("rwStatus").textContent), "key-required message shown");

  // OpenRouter request shape
  d.getElementById("apiKey").value = "sk-or-test";
  d.getElementById("rewriteBtn").dispatchEvent(new w.Event("click"));
  setTimeout(() => {
    assert(/openrouter\.ai\/api\/v1\/chat\/completions/.test(cap.url), "OpenRouter URL used");
    assert(cap.opts.headers["Authorization"] === "Bearer sk-or-test", "Bearer auth sent");
    const body = JSON.parse(cap.opts.body);
    assert(body.model === "openai/gpt-4o-mini", "model name passed through");
    assert(body.max_tokens > 1000, "dynamic token budget for BYOK provider");
    assert(/Rewritten plainly/.test(d.getElementById("rwText").textContent), "OpenAI-schema response parsed");

    // OpenAI URL path + truncation via finish_reason length
    d.getElementById("provider").value = "openai";
    d.getElementById("provider").dispatchEvent(new w.Event("change"));
    d.getElementById("apiKey").value = "sk-test";
    w.fetch = (url, opts) => { cap = { url, opts }; return Promise.resolve({ ok: true, json: () => Promise.resolve({ choices: [{ finish_reason: "length", message: { content: "cut mid" } }] }) }); };
    d.getElementById("rewriteBtn").dispatchEvent(new w.Event("click"));
    setTimeout(() => {
      assert(/api\.openai\.com\/v1\/chat\/completions/.test(cap.url), "OpenAI URL used");
      assert(/token cap/.test(d.getElementById("rwStatus").textContent), "finish_reason length maps to truncation warning");

      // 404 model error message
      w.fetch = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: { message: "model not found" } }) });
      d.getElementById("rewriteBtn").dispatchEvent(new w.Event("click"));
      setTimeout(() => {
        assert(/Model not found/.test(d.getElementById("rwStatus").textContent), "404 maps to model-name hint");
        // anthropic keyless path unchanged: no auth headers
        d.getElementById("provider").value = "anthropic";
        d.getElementById("provider").dispatchEvent(new w.Event("change"));
        d.getElementById("apiKey").value = "";
        w.fetch = (url, opts) => { cap = { url, opts }; return Promise.resolve({ ok: true, json: () => Promise.resolve({ stop_reason: "end_turn", content: [{ type: "text", text: "Fine. Short. Done well." }] }) }); };
        d.getElementById("rewriteBtn").dispatchEvent(new w.Event("click"));
        setTimeout(() => {
          assert(/api\.anthropic\.com/.test(cap.url) && !cap.opts.headers["x-api-key"], "anthropic keyless sends no key header");
          assert(JSON.parse(cap.opts.body).max_tokens === 1000, "keyless keeps 1000 token cap");
          process.exit(fail ? 1 : 0);
        }, 30);
      }, 30);
    }, 30);
  }, 30);
}, 30);
