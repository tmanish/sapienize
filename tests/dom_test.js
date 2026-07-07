"use strict";
const { JSDOM } = require("jsdom");
const fs = require("fs");
const html = fs.readFileSync(__dirname + "/../sapienize.html", "utf8");
const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true });
const d = dom.window.document;
let fail = 0;
const assert = (c, m) => { console.log((c ? "PASS: " : "FAIL: ") + m); if (!c) fail++; };

d.getElementById("loadSample").dispatchEvent(new dom.window.Event("click"));
assert(d.getElementById("input").value.length > 200, "sample loads into textarea");
d.getElementById("analyzeBtn").dispatchEvent(new dom.window.Event("click"));
const scoreHtml = d.getElementById("scoreArea").innerHTML;
assert(/SAPIEN/.test(scoreHtml) && /<svg/.test(scoreHtml), "score dial renders");
assert(d.querySelectorAll("#specArea mark").length >= 12, "specimen view inks 12+ tells (got " + d.querySelectorAll("#specArea mark").length + ")");
assert(d.querySelectorAll("#findingsArea .finding").length >= 8, "findings list populated (got " + d.querySelectorAll("#findingsArea .finding").length + ")");
assert(!d.getElementById("rewriteBtn").disabled, "rewrite button enables after analysis");
// XSS: text with script tag must be escaped in specimen
d.getElementById("input").value = 'A crucial <script>window.pwned=1<\/script> test of a robust escape.';
d.getElementById("analyzeBtn").dispatchEvent(new dom.window.Event("click"));
assert(!dom.window.pwned, "pasted script tags are escaped, not executed");
assert(d.getElementById("specArea").innerHTML.indexOf("&lt;script&gt;") !== -1, "script tag shown as escaped text");
process.exit(fail ? 1 : 0);
