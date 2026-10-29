/* Renders the phrase-level tables in skill/sapienize/references/tells.md from
 * SAPIENIZE_TELLS so the executable library is the only source of truth.
 * Node-only build helper; not bundled into the standalone page.
 *
 *   node src/analysis/tell-reference.js --write <tells.md>   regenerate in place
 *   node src/analysis/tell-reference.js --check <tells.md>   exit 1 on drift
 */
"use strict";

const BEGIN = "<!-- BEGIN GENERATED: SAPIENIZE_TELLS. Edit src/engine.js and run `npm run build`; do not edit by hand. -->";
const END = "<!-- END GENERATED: SAPIENIZE_TELLS -->";

const CATEGORIES = [
  { cat: "lexical", title: "Lexical", blurb: "Stock words and phrases. Domain usage can be correct; judge each in context." },
  { cat: "structure", title: "Structural", blurb: "Templated sentence frames, hooks, and signposting." },
  { cat: "rhythm", title: "Rhythm", blurb: "Connector and opener habits that flatten cadence." },
  {
    cat: "residue",
    title: "Chat-assistant residue",
    blurb: "These phrases usually survive when text is pasted out of a chat assistant's reply. They say nothing about whether the surrounding prose is the author's; they mean a conversational wrapper was left in. Confirm with the author before deleting, and never treat them as proof of authorship."
  }
];

function cell(text) {
  return String(text).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function example(t) {
  const ex = t.examples || {};
  let out = ex.hit && ex.hit.length ? "\"" + ex.hit[0] + "\"" : "";
  if (ex.miss && ex.miss.length) out += "; not flagged: \"" + ex.miss[0] + "\"";
  return cell(out);
}

function renderTellReference(tells) {
  const known = CATEGORIES.map(function (c) { return c.cat; });
  const stray = tells.filter(function (t) { return known.indexOf(t.cat) === -1; });
  if (stray.length) throw new Error("tell category has no reference section: " + stray[0].cat + " (" + stray[0].label + ")");
  const out = [BEGIN, ""];
  out.push(tells.length + " executable entries. Rows are ordered by severity, then library order. Examples are regression fixtures: the first quoted example is flagged with that label, and a \"not flagged\" example must not be.");
  CATEGORIES.forEach(function (c) {
    const rows = tells
      .map(function (t, i) { return { t: t, i: i }; })
      .filter(function (r) { return r.t.cat === c.cat; })
      .sort(function (a, b) { return b.t.sev - a.t.sev || a.i - b.i; });
    if (!rows.length) return;
    out.push("", "### " + c.title + " (`" + c.cat + "`)", "", c.blurb, "");
    out.push("| Tell | Sev | Replace with | Example |", "|---|---|---|---|");
    rows.forEach(function (r) {
      out.push("| " + cell(r.t.label) + " | " + r.t.sev + " | " + cell(r.t.fix) + " | " + example(r.t) + " |");
    });
  });
  out.push("", END);
  return out.join("\n");
}

function spliceTellReference(markdown, tells) {
  const start = markdown.indexOf(BEGIN);
  const end = markdown.indexOf(END);
  if (start === -1 || end === -1 || end < start) throw new Error("tells.md is missing the generated-section markers");
  return markdown.slice(0, start) + renderTellReference(tells) + markdown.slice(end + END.length);
}

module.exports = { renderTellReference: renderTellReference, spliceTellReference: spliceTellReference, BEGIN: BEGIN, END: END };

if (require.main === module) {
  const fs = require("fs");
  const mode = process.argv[2];
  const file = process.argv[3];
  if ((mode !== "--write" && mode !== "--check") || !file) {
    console.error("usage: tell-reference.js --write|--check <tells.md>");
    process.exit(2);
  }
  const tells = require("../engine.js").SAPIENIZE_TELLS;
  const current = fs.readFileSync(file, "utf8").replace(/\r\n?/g, "\n");
  const next = spliceTellReference(current, tells);
  if (mode === "--check") {
    if (next !== current) {
      console.error(file + " is out of date with SAPIENIZE_TELLS; run `npm run build`.");
      process.exit(1);
    }
  } else if (next !== current) {
    fs.writeFileSync(file, next);
  }
}
