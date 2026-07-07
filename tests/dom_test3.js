"use strict";
const { JSDOM } = require("jsdom");
const fs = require("fs");
const dom = new JSDOM(fs.readFileSync(__dirname + "/../sapienize.html", "utf8"), { runScripts: "dangerously", pretendToBeVisual: true });
const w = dom.window, d = w.document;
let fail = 0;
const assert = (c, m) => { console.log((c ? "PASS: " : "FAIL: ") + m); if (!c) fail++; };
let captured = null;
w.fetch = (url, opts) => { captured = opts; return Promise.resolve({ ok: true, json: () => Promise.resolve({ stop_reason: "end_turn", content: [{ type: "text", text: "Short. Rewritten in persona. It reads plainly and commits to its claims without hedging everything into paste." }] }) }); };
d.getElementById("loadSample").dispatchEvent(new w.Event("click"));
d.getElementById("analyzeBtn").dispatchEvent(new w.Event("click"));
// preset persona flows into prompt
d.getElementById("persona").value = "law";
d.getElementById("rewriteBtn").dispatchEvent(new w.Event("click"));
setTimeout(() => {
  let prompt = JSON.parse(captured.body).messages[0].content;
  assert(/Solicitor, 64, UK/.test(prompt), "preset persona spec lands in prompt");
  assert(/Do not invent biographical details/.test(prompt), "no-fabrication guard present");
  // custom persona path
  d.getElementById("persona").value = "custom";
  d.getElementById("persona").dispatchEvent(new w.Event("change"));
  assert(!d.getElementById("personaCustom").classList.contains("hidden"), "custom field reveals on select");
  d.getElementById("personaCustom").value = "retired teacher, 60, Texas, warm and plain-spoken";
  d.getElementById("rewriteBtn").dispatchEvent(new w.Event("click"));
  setTimeout(() => {
    prompt = JSON.parse(captured.body).messages[0].content;
    assert(/retired teacher, 60, Texas/.test(prompt), "custom persona lands in prompt");
    // sample-wins rule when both provided
    d.getElementById("voice").value = "This is my own writing sample, short and blunt.";
    d.getElementById("rewriteBtn").dispatchEvent(new w.Event("click"));
    setTimeout(() => {
      prompt = JSON.parse(captured.body).messages[0].content;
      assert(/the sample wins/.test(prompt), "sample-wins rule included when both set");
      // no persona, no sample: neither block present
      d.getElementById("persona").value = ""; d.getElementById("personaCustom").value = ""; d.getElementById("voice").value = "";
      d.getElementById("rewriteBtn").dispatchEvent(new w.Event("click"));
      setTimeout(() => {
        prompt = JSON.parse(captured.body).messages[0].content;
        assert(!/<persona>/.test(prompt) && !/<voice_sample>/.test(prompt), "clean prompt when neither is set");
        process.exit(fail ? 1 : 0);
      }, 30);
    }, 30);
  }, 30);
}, 30);
