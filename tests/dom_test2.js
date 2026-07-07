"use strict";
const { JSDOM } = require("jsdom");
const fs = require("fs");
const html = fs.readFileSync(__dirname + "/../sapienize.html", "utf8");
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true });
const w = dom.window, d = w.document;
let fail = 0;
const assert = (c, m) => { console.log((c ? "PASS: " : "FAIL: ") + m); if (!c) fail++; };

// Simulate no-network environment: fetch throws TypeError like a browser CORS/network failure
w.fetch = () => Promise.reject(new TypeError("NetworkError when attempting to fetch resource."));
w.AbortController = w.AbortController || class { constructor(){ this.signal = {}; } abort(){} };

d.getElementById("loadSample").dispatchEvent(new w.Event("click"));
d.getElementById("analyzeBtn").dispatchEvent(new w.Event("click"));
assert(!d.getElementById("rewriteBtn").disabled, "rewrite enabled after analysis");
assert(d.getElementById("keyRow").classList.contains("hidden"), "key row hidden before first failure");

d.getElementById("rewriteBtn").dispatchEvent(new w.Event("click"));
setTimeout(() => {
  assert(!d.getElementById("keyRow").classList.contains("hidden"), "key row revealed after network failure");
  assert(/inside a Claude artifact/.test(d.getElementById("rwStatus").textContent), "status explains keyless limitation");
  assert(!d.getElementById("rewriteBtn").disabled, "rewrite button re-enabled after failure");

  // Now simulate a successful BYOK call and verify header construction + iterate flow
  let captured = null;
  w.fetch = (url, opts) => {
    captured = opts;
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ stop_reason: "end_turn", content: [{ type: "text", text: "I broke the build twice on Tuesday. Same dumb thing both times. So I wrote a hook. Twenty lines of bash, nothing clever, and it yells before the push goes out." }] })
    });
  };
  d.getElementById("apiKey").value = "sk-ant-test123";
  d.getElementById("rewriteBtn").dispatchEvent(new w.Event("click"));
  setTimeout(() => {
    assert(captured && captured.headers["x-api-key"] === "sk-ant-test123", "BYOK sends x-api-key header");
    assert(captured.headers["anthropic-dangerous-direct-browser-access"] === "true", "BYOK sends browser-access header");
    assert(captured.headers["anthropic-version"] === "2023-06-01", "BYOK sends anthropic-version header");
    const body = JSON.parse(captured.body);
    assert(body.max_tokens > 1000, "BYOK uses dynamic token budget (got " + body.max_tokens + ")");
    assert(!d.getElementById("rwResult").classList.contains("hidden"), "result panel shows on success");
    assert(/\u2192/.test(d.getElementById("rwDelta").textContent), "score delta rendered");
    // iterate: rewritten text becomes new specimen and re-analysis runs
    d.getElementById("iterateBtn").dispatchEvent(new w.Event("click"));
    assert(/broke the build/.test(d.getElementById("input").value), "iterate copies restored draft into input");
    assert(d.getElementById("rwResult").classList.contains("hidden"), "stale result hidden after re-analysis");
    // truncation path
    w.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ stop_reason: "max_tokens", content: [{ type: "text", text: "cut off mid" }] }) });
    d.getElementById("rewriteBtn").dispatchEvent(new w.Event("click"));
    setTimeout(() => {
      assert(/token cap/.test(d.getElementById("rwStatus").textContent), "truncation warning surfaces");
      // 401 path
      w.fetch = () => Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ error: { message: "invalid x-api-key" } }) });
      d.getElementById("rewriteBtn").dispatchEvent(new w.Event("click"));
      setTimeout(() => {
        assert(/rejected that key/.test(d.getElementById("rwStatus").textContent), "401 maps to key error message");
        process.exit(fail ? 1 : 0);
      }, 30);
    }, 30);
  }, 30);
}, 30);
