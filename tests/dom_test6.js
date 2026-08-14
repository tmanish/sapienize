"use strict";
// Converge loop: a first pass that reintroduces tells or em dashes triggers another
// pass fed with the new findings; the displayed result is sanitized and dash-free.
const { JSDOM } = require("jsdom");
const fs = require("fs");
const dom = new JSDOM(fs.readFileSync(__dirname + "/../sapienize.html", "utf8"), { runScripts: "dangerously", pretendToBeVisual: true });
const w = dom.window, d = w.document;
let fail = 0;
const assert = (c, m) => { console.log((c ? "PASS: " : "FAIL: ") + m); if (!c) fail++; };

const replies = [
  "The result — a deep delve into the numbers — was seamless and robust overall, honestly.",
  "I ran the numbers twice. They held up. Nothing fancy about the method, just care."
];
let calls = [];
w.fetch = (url, opts) => {
  calls.push(JSON.parse(opts.body));
  const t = replies[Math.min(calls.length - 1, replies.length - 1)];
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ stop_reason: "end_turn", content: [{ type: "text", text: t }] }) });
};

d.getElementById("loadSample").dispatchEvent(new w.Event("click"));
d.getElementById("analyzeBtn").dispatchEvent(new w.Event("click"));
d.getElementById("rewriteBtn").dispatchEvent(new w.Event("click"));
setTimeout(() => {
  assert(calls.length === 2, "bad first pass triggers a second pass (got " + calls.length + " calls)");
  const prompt2 = calls[1] && calls[1].messages[0].content;
  assert(prompt2 && /Remove these flagged patterns[^\n]*delve/.test(prompt2), "second pass is told to remove what pass one reintroduced");
  const shown = d.getElementById("rwText").textContent;
  assert(shown.indexOf("—") === -1, "displayed rewrite contains zero em dashes");
  assert(/ran the numbers/.test(shown), "best-scoring pass is the one displayed");
  assert(/2 passes/.test(d.getElementById("rwDelta").textContent), "delta reports the pass count");
  process.exit(fail ? 1 : 0);
}, 60);
