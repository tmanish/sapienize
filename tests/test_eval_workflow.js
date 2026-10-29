"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { datasetFingerprint, loadDataset } = require("../eval/dataset.js");
const { auditDuplicates } = require("../eval/duplicates.js");
const { validateDatasetManifest, auditDatasetManifest, datasetManifestFingerprint, selectDatasetSplit } = require("../eval/manifest.js");
const { evaluateDataset, evaluateDatasetAsync } = require("../eval/evaluator.js");
const { run, EXIT_CODES } = require("../src/cli/sapienize.js");

const clone = value => JSON.parse(JSON.stringify(value));
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "../eval/fixtures/public-synthetic.manifest.json"), "utf8"));
function dataset(texts) {
  const records = texts.map((text, index) => ({
    id: "record-" + index, text, source_type: "human", metadata: { synthetic: true }
  }));
  const manifest = clone(fixture);
  manifest.dataset.record_count = records.length;
  manifest.dataset.fingerprint.value = datasetFingerprint(records);
  manifest.records = records.map(record => ({
    id: record.id, source_id: manifest.sources[0].id, domain: "test", language: "en",
    author_group: "author-" + record.id, lineage_group: "lineage-" + record.id,
    source_document_group: "document-" + record.id,
    lineage: [{ sequence: 1, actor_type: "human", operation: "synthetic_fixture" }]
  }));
  manifest.splits = records.map((record, index) => ({
    name: index === records.length - 1 ? "evaluation" : "development-" + index,
    purpose: index === records.length - 1 ? "held-out evaluation" : "development",
    record_ids: [record.id]
  }));
  return { records, manifest };
}

const original = "At sunrise the volunteers carried wooden tables through the orchard and arranged fresh apples beside the old stone wall before opening the market gates for the neighbors arriving from nearby villages.";
const edited = original.replace("fresh", "green");
let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log("PASS:", name); }
  catch (error) { failures++; console.error("FAIL:", name, error.stack); }
}

async function cli(args, stdin, dependencies) {
  let stdout = "";
  let stderr = "";
  const code = await run(args, {
    stdin: stdin || "", env: {}, cwd: process.cwd(),
    stdout: value => { stdout += value; }, stderr: value => { stderr += value; }
  }, dependencies);
  return { code, stdout, stderr, result: stdout ? JSON.parse(stdout) : null };
}

(async () => {
  await test("duplicate audit catches edits and Unicode formatting without leaking source text", () => {
    const { records } = dataset([original, edited, original.toUpperCase().replace(/ /g, "\u00a0"), "Unrelated scientific measurements vary."]);
    const report = auditDuplicates(records);
    assert.strictEqual(report.status, "review");
    assert.strictEqual(report.pairs.length, 3);
    assert.ok(report.pairs.some(pair => pair.kind === "near_duplicate" && pair.similarity < 1));
    assert.ok(report.pairs.some(pair => pair.kind === "normalized_exact"));
    assert.deepStrictEqual(report, auditDuplicates(records.slice().reverse()));
    assert.ok(!JSON.stringify(report).includes("orchard"));
    assert.deepStrictEqual(report.shortRecordIds, ["record-3"]);
    const short = dataset(["Café opens!", "CAFE\u0301 OPENS.", "?!", "!!!"]).records;
    assert.deepStrictEqual(auditDuplicates(short).pairs.map(pair => pair.recordIds), [["record-0", "record-1"]]);
    const unrelated = dataset([
      "Thank you for your time. The northern observatory measured distant planets using infrared telescopes.",
      "Thank you for your time. Our bakery offers freshly baked bread each morning to neighbors."
    ]).records;
    assert.strictEqual(auditDuplicates(unrelated).pairs.length, 0);
  });

  await test("near-duplicate leakage blocks validation, split selection, and both evaluators before analysis", async () => {
    // Leakage outside the requested split must still block the run.
    const { records, manifest } = dataset([original, edited, "The telescope measures distant galaxies."]);
    let calls = 0;
    const options = { manifest, split: "evaluation", analyzer: () => { calls++; } };
    assert.throws(() => validateDatasetManifest(manifest, records), /near-duplicate.*crosses frozen splits/);
    assert.throws(() => selectDatasetSplit(records, manifest, "evaluation"), /near-duplicate/);
    assert.throws(() => evaluateDataset(records, options), /near-duplicate/);
    await assert.rejects(evaluateDatasetAsync(records, options), /near-duplicate/);
    assert.strictEqual(calls, 0);
    const audit = auditDatasetManifest(manifest, records);
    assert.strictEqual(audit.status, "fail");
    assert.strictEqual(audit.crossSplitPairCount, 1);
    assert.deepStrictEqual(audit.pairs[0].splits, ["development-0", "development-1"]);
  });

  await test("same-split duplicates remain visible review items without silently changing membership", () => {
    const { records, manifest } = dataset([original, edited, "Separate evaluation prose."]);
    manifest.splits[0].record_ids.push("record-1");
    manifest.splits.splice(1, 1);
    validateDatasetManifest(manifest, records);
    const result = evaluateDataset(records, { manifest, split: "development-0" });
    assert.strictEqual(result.dataset.recordCount, 2);
    assert.strictEqual(result.governance.duplicateAudit.status, "review");
    assert.strictEqual(result.governance.duplicateAudit.withinSplitPairCount, 1);
    assert.deepStrictEqual(result.governance.split.recordIds, ["record-0", "record-1"]);
  });

  await test("full dataset, manifest and selected split identities are distinct and reproducible", async () => {
    const { records, manifest } = dataset([original, "Separate evaluation prose."]);
    const visited = [];
    const analyzer = (_text, record, context) => {
      visited.push([record.id, context.index, context.seed]);
      return { predictedAi: false };
    };
    const options = { manifest, split: "evaluation", seed: "frozen", analyzer };
    const sync = evaluateDataset(records, options);
    assert.deepStrictEqual(visited, [["record-1", 0, "frozen"]]);
    const asyncReport = await evaluateDatasetAsync(records.slice().reverse(), options);
    assert.deepStrictEqual(sync, asyncReport);
    assert.strictEqual(sync.dataset.fingerprint, datasetFingerprint([records[1]]));
    assert.strictEqual(sync.governance.fullDataset.fingerprint, datasetFingerprint(records));
    assert.strictEqual(sync.governance.manifest.fingerprint, datasetManifestFingerprint(manifest));
    assert.strictEqual(sync.metrics.perLanguage.en.recordCount, 1);
    assert.strictEqual(sync.metrics.perDomain.test.recordCount, 1);
    assert.strictEqual(sync.metrics.perAuthor["author-record-1"].recordCount, 1);
    assert.strictEqual(sync.metrics.perSourceType.human.recordCount, 1);
    assert.ok(sync.evaluatorVersion);
    assert.deepStrictEqual(sync, JSON.parse(JSON.stringify(sync)));
    const changed = clone(manifest);
    changed.dataset.version = "1.0.1";
    assert.notStrictEqual(evaluateDataset(records, { ...options, manifest: changed }).governance.manifest.fingerprint,
      sync.governance.manifest.fingerprint);
  });

  await test("observations for other known splits are excluded and unknown IDs are rejected", () => {
    const { records, manifest } = dataset([original, "Separate evaluation prose."]);
    const observations = { "record-0": { predictedAi: true }, "record-1": { predictedAi: false } };
    const report = evaluateDataset(records, { manifest, split: "evaluation", observations });
    assert.strictEqual(report.metrics.overall.accuracy, 1);
    assert.strictEqual(report.coverage.observationCount, 1);
    assert.deepStrictEqual(report.governance.excludedObservationIds, ["record-0"]);
    assert.deepStrictEqual(report.results.map(row => row.id), ["record-1"]);
    assert.throws(() => evaluateDataset(records, { manifest, split: "evaluation", observations: { typo: false } }), /unknown id/);
  });

  await test("missing governance, unknown splits, unresolved rights and changed unselected records fail closed", () => {
    const { records, manifest } = dataset([original, "Separate evaluation prose."]);
    assert.throws(() => evaluateDataset(records, { manifest }), /explicit split/);
    for (const malformed of [null, false, []]) {
      assert.throws(() => evaluateDataset(records, { manifest: malformed, split: "evaluation" }));
    }
    assert.throws(() => evaluateDataset(records, { split: "evaluation" }), /requires a dataset manifest/);
    assert.throws(() => evaluateDataset(records, { manifest, split: "typo" }), /unknown dataset split/);
    const changed = clone(records);
    changed[0].text += " Changed development data.";
    assert.throws(() => evaluateDataset(changed, { manifest, split: "evaluation" }), /fingerprint/);
    const real = records.map(record => ({ ...record, metadata: {} }));
    assert.throws(() => evaluateDataset(real), /non-synthetic/);
    const unresolved = clone(manifest);
    unresolved.sources[0].consent.status = "unknown";
    assert.throws(() => evaluateDataset(records, { manifest: unresolved, split: "evaluation" }), /unresolved rights or consent/);
    assert.throws(() => evaluateDataset(records, { seed: NaN }), /seed/);
    const governed = clone(manifest);
    governed.dataset.fingerprint.value = datasetFingerprint(real);
    assert.throws(() => evaluateDataset(real, { manifest: governed, split: "evaluation" }), /synthetic consent/);
    governed.sources[0].consent = { status: "contributed_for_evaluation", basis: "Mock consent for this test only." };
    assert.strictEqual(evaluateDataset(real, { manifest: governed, split: "evaluation" }).governance.status, "validated");
    assert.strictEqual(evaluateDataset(records).governance.status, "synthetic_only");
  });

  await test("manifest workflow carries provider and version slices", () => {
    const records = loadDataset(path.join(__dirname, "../eval/fixtures/public-synthetic.jsonl"));
    const report = evaluateDataset(records, { manifest: fixture, split: "evaluation" });
    const generation = fixture.records.find(record => record.generation).generation;
    assert.ok(report.metrics.perModelVersion[JSON.stringify([generation.provider, generation.model, generation.version])]);
  });

  await test("CLI evaluates a frozen split and audits leakage with useful exit codes and no analyzer calls", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sapienize-eval-workflow-"));
    try {
      const { records, manifest } = dataset([original, "Separate evaluation prose."]);
      const dataPath = path.join(directory, "records.json");
      const manifestPath = path.join(directory, "manifest.json");
      const observationPath = path.join(directory, "observations.json");
      const outputPath = path.join(directory, "report.json");
      fs.writeFileSync(dataPath, JSON.stringify(records));
      fs.writeFileSync(manifestPath, JSON.stringify(manifest));
      fs.writeFileSync(observationPath, JSON.stringify({ "record-1": { aiScore: 0.2 } }));
      const args = ["eval", dataPath, "--manifest", manifestPath, "--split", "evaluation"];
      const good = await cli([...args, "--observations", observationPath, "--seed", "pilot-1", "--threshold", "0.5"]);
      assert.strictEqual(good.code, 0, good.stderr);
      assert.strictEqual(good.result.configuration.seed, "pilot-1");
      assert.strictEqual(good.result.metrics.overall.accuracy, 1);
      assert.strictEqual(good.result.dataset.recordCount, 1);
      assert.strictEqual((await cli(["eval", "-", "--manifest", manifestPath, "--split", "evaluation"], JSON.stringify(records))).code, 0);
      assert.strictEqual((await cli(["eval", dataPath, "--manifest", "-", "--split", "evaluation"], JSON.stringify(manifest))).code, 0);
      for (const badArgs of [
        ["eval", dataPath, "--manifest", manifestPath],
        ["eval", dataPath, "--split", "evaluation"],
        ["eval", "-", "--manifest", "-", "--split", "evaluation"],
        [...args, "--threshold", "NaN"]
      ]) assert.strictEqual((await cli(badArgs)).code, EXIT_CODES.usageError);
      let calls = 0;
      const deps = { core: { analyze() { calls++; throw new Error("must not analyze"); } } };
      const cleanAudit = await cli(["audit", dataPath, "--manifest", manifestPath], "", deps);
      assert.strictEqual(cleanAudit.code, 0, cleanAudit.stderr);
      records[1].text = edited;
      manifest.dataset.fingerprint.value = datasetFingerprint(records);
      fs.writeFileSync(dataPath, JSON.stringify(records));
      fs.writeFileSync(manifestPath, JSON.stringify(manifest));
      const leaked = await cli(["audit", dataPath, "--manifest", manifestPath], "", deps);
      assert.strictEqual(leaked.code, EXIT_CODES.operationalError);
      assert.strictEqual(leaked.result.crossSplitPairCount, 1);
      assert.strictEqual((await cli(["audit", dataPath], "", deps)).code, EXIT_CODES.reviewRequired);
      const blocked = await cli([...args, "--output", outputPath], "", deps);
      assert.strictEqual(blocked.code, EXIT_CODES.operationalError);
      assert.match(blocked.stderr, /near-duplicate/);
      assert.strictEqual(fs.existsSync(outputPath), false);
      assert.strictEqual(calls, 0);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
  process.exitCode = failures ? 1 : 0;
})();
