"use strict";
// Converge loop: a first pass that retains a configured style signal triggers
// another pass, while semantic integrity remains the ranking gate.
const { JSDOM } = require("jsdom");
const fs = require("fs");
const dom = new JSDOM(fs.readFileSync(__dirname + "/../sapienize.html", "utf8"), { runScripts: "dangerously", pretendToBeVisual: true });
const w = dom.window, d = w.document;
let fail = 0;
const assert = (c, m) => { console.log((c ? "PASS: " : "FAIL: ") + m); if (!c) fail++; };

const replies = [
  "It is important to note that the team shipped 12 units on 4 July 2026. The report is at https://example.com/report.",
  "The team shipped 12 units on 4 July 2026. The report is at https://example.com/report."
];
let calls = [];
w.fetch = (url, opts) => {
  calls.push(JSON.parse(opts.body));
  const t = replies[Math.min(calls.length - 1, replies.length - 1)];
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ stop_reason: "end_turn", content: [{ type: "text", text: t }] }) });
};

d.getElementById("input").value = replies[1];
d.getElementById("analyzeBtn").dispatchEvent(new w.Event("click"));
d.getElementById("rewriteBtn").dispatchEvent(new w.Event("click"));
setTimeout(() => {
  assert(calls.length === 2, "bad first pass triggers a second pass (got " + calls.length + " calls)");
  const prompt2 = calls[1] && calls[1].messages[0].content;
  assert(prompt2 && /style finding: it's important to note that/.test(prompt2), "second pass receives verification feedback from pass one");
  const shown = d.getElementById("rwText").textContent;
  assert(shown === replies[1], "semantic-safe, style-clean pass is displayed");
  assert(/semantic pass/.test(d.getElementById("rwDelta").textContent), "semantic verification result is shown");
  assert(/2 passes/.test(d.getElementById("rwDelta").textContent), "delta reports the pass count");
  process.exit(fail ? 1 : 0);
}, 60);
