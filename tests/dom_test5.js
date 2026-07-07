"use strict";
const { JSDOM } = require("jsdom");
const fs = require("fs");
const dom = new JSDOM(fs.readFileSync(__dirname + "/../sapienize.html", "utf8"), { runScripts: "dangerously", pretendToBeVisual: true });
const w = dom.window, d = w.document;
let fail = 0;
const assert = (c, m) => { console.log((c ? "PASS: " : "FAIL: ") + m); if (!c) fail++; };
let cap = null;
// fetch that captures options: verify no signal property is passed (the artifact clone bug)
w.fetch = (url, opts) => { cap = opts; return Promise.resolve({ ok: true, json: () => Promise.resolve({ stop_reason: "end_turn", content: [{ type: "text", text: "Fine. Short. Reads like a person wrote it after coffee." }] }) }); };
d.getElementById("loadSample").dispatchEvent(new w.Event("click"));
d.getElementById("analyzeBtn").dispatchEvent(new w.Event("click"));
d.getElementById("rewriteBtn").dispatchEvent(new w.Event("click"));
setTimeout(() => {
  assert(cap && !("signal" in cap), "fetch options carry no AbortSignal (artifact postMessage safe)");
  assert(!d.getElementById("rwResult").classList.contains("hidden"), "rewrite succeeds on the keyless path");
  process.exit(fail ? 1 : 0);
}, 30);
