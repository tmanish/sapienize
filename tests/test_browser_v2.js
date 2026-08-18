"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

function pause(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

(async () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "sapienize.html"), "utf8");
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true });
  const window = dom.window;
  const document = window.document;

  document.getElementById("input").value = "visible\u200b text";
  document.getElementById("analyzeBtn").dispatchEvent(new window.Event("click"));
  assert.match(document.getElementById("scoreArea").textContent, /100/);
  assert.doesNotMatch(document.getElementById("findingsArea").textContent, /invisible|zero width/i);
  assert.match(document.getElementById("integrityArea").textContent, /zero width space/i);
  assert.match(document.getElementById("integrityArea").textContent, /does not affect the style score/i);

  document.getElementById("input").value = "\uFEFFVisible boundary text";
  document.getElementById("analyzeBtn").dispatchEvent(new window.Event("click"));
  assert.match(document.getElementById("integrityArea").textContent, /byte order mark/i);

  document.getElementById("input").value = "\uFEFF";
  document.getElementById("analyzeBtn").dispatchEvent(new window.Event("click"));
  assert.match(document.getElementById("integrityArea").textContent, /byte order mark/i);

  document.getElementById("loadSample").dispatchEvent(new window.Event("click"));
  assert.strictEqual(document.getElementById("rewriteBtn").disabled, true);

  document.getElementById("input").value = "Edited after analysis";
  document.getElementById("input").dispatchEvent(new window.Event("input"));
  assert.strictEqual(document.getElementById("rewriteBtn").disabled, true);
  assert.match(document.getElementById("rwStatus").textContent, /Run forensics again/i);

  document.getElementById("input").value = "";
  document.getElementById("analyzeBtn").dispatchEvent(new window.Event("click"));
  assert.strictEqual(document.getElementById("rewriteBtn").disabled, true);
  assert.match(document.getElementById("scoreArea").textContent, /Paste something first/i);
  assert.strictEqual(document.getElementById("rwResult").classList.contains("hidden"), true);

  document.getElementById("input").value = "It is important to note that this configured pattern is shown for review.";
  document.getElementById("analyzeBtn").dispatchEvent(new window.Event("click"));
  const findingLabels = document.getElementById("findingsArea").textContent;
  assert.doesNotMatch(findingLabels, /strong|moderate|weak/i);
  assert.match(findingLabels, /high-priority|review|context/i);

  document.getElementById("input").value = "We shipped 12 units on 4 July 2026.";
  document.getElementById("analyzeBtn").dispatchEvent(new window.Event("click"));
  document.getElementById("provider").value = "anthropic";
  document.getElementById("apiKey").value = "sk-ant-must-not-cross-providers";
  document.getElementById("provider").value = "openai";
  document.getElementById("provider").dispatchEvent(new window.Event("change"));
  assert.strictEqual(document.getElementById("apiKey").value, "");
  const secret = "fixture-secret-that-must-not-escape";
  document.getElementById("apiKey").value = secret;
  window.fetch = () => Promise.resolve({
    ok: false,
    status: 400,
    json: () => Promise.resolve({ error: { message: "request rejected for key " + secret } })
  });
  document.getElementById("rewriteBtn").dispatchEvent(new window.Event("click"));
  await pause(50);
  const safeStatus = document.getElementById("rwStatus").textContent;
  assert.doesNotMatch(safeStatus, new RegExp(secret));
  assert.match(safeStatus, /HTTP 400/i);

  document.getElementById("voice").value = "I test the build, and then I ship it. That is enough for me.";
  window.fetch = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      choices: [{ finish_reason: "stop", message: { content: "We shipped 13 units on 4 July 2026." } }]
    })
  });
  document.getElementById("rewriteBtn").dispatchEvent(new window.Event("click"));
  await pause(100);
  const review = document.getElementById("rwReview").textContent;
  assert.match(review, /Semantic review · fail/);
  assert.match(review, /Rewrite (removed|added) number/);
  assert.match(review, /Voice comparison details/);
  assert.match(review, /fewer than 300 words/i);

  window.fetch = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      choices: [{ finish_reason: "stop", message: { content: "We ship\u200bped 12 units on 4 July 2026." } }]
    })
  });
  document.getElementById("rewriteBtn").dispatchEvent(new window.Event("click"));
  await pause(100);
  assert.match(document.getElementById("rwStatus").textContent, /document-integrity checks need attention/i);
  assert.match(document.getElementById("rwReview").textContent, /Document integrity review/);
  assert.match(document.getElementById("rwReview").textContent, /U\+200B/);

  window.fetch = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      choices: [{ finish_reason: "content_filter", message: { content: "We shipped 12 units on 4 July 2026." } }]
    })
  });
  document.getElementById("rewriteBtn").dispatchEvent(new window.Event("click"));
  await pause(100);
  assert.match(document.getElementById("rwStatus").textContent, /content filter/i);
  assert.doesNotMatch(document.getElementById("rwStatus").textContent, /token cap/i);

  const privateCompletionReason = "Bearer sk-private-secret-123456";
  window.fetch = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      choices: [{ finish_reason: privateCompletionReason, message: { content: "We shipped 12 units on 4 July 2026." } }]
    })
  });
  document.getElementById("rewriteBtn").dispatchEvent(new window.Event("click"));
  await pause(100);
  assert.match(document.getElementById("rwStatus").textContent, /unknown/i);
  assert.doesNotMatch(document.getElementById("rwStatus").textContent, /sk-private-secret-123456/);

  document.getElementById("input").value = "Acme shipped 12 units on 4 July 2026.";
  document.getElementById("analyzeBtn").dispatchEvent(new window.Event("click"));
  let resolveDelayedFetch;
  window.fetch = () => new Promise(resolve => { resolveDelayedFetch = resolve; });
  document.getElementById("rewriteBtn").dispatchEvent(new window.Event("click"));
  await pause(0);
  assert.strictEqual(typeof resolveDelayedFetch, "function");
  document.getElementById("input").value = "Beta shipped 99 units on 5 July 2026.";
  document.getElementById("analyzeBtn").dispatchEvent(new window.Event("click"));
  resolveDelayedFetch({
    ok: true,
    json: () => Promise.resolve({
      choices: [{ finish_reason: "stop", message: { content: "Acme shipped 12 units on 4 July 2026." } }]
    })
  });
  await pause(100);
  assert.strictEqual(document.getElementById("rwResult").classList.contains("hidden"), true);
  assert.doesNotMatch(document.getElementById("rwStatus").textContent, /Done in/);

  console.log("PASS: browser keeps integrity separate, redacts provider errors, and exposes rewrite review details");
})().catch(error => {
  console.error(error && error.stack || error);
  process.exit(1);
});
