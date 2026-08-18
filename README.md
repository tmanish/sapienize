# Sapienize

Sapienize is a local-first voice-restoration toolkit. Its north star is to help people turn an assisted or generic draft into writing that reflects their authentic habits while preserving meaning, facts, claims, names, numbers, dates, URLs, quotations, uncertainty, and scope. When no authentic sample is available, a requested persona may guide register and diction, but it is not a substitute for the author's voice and must not invent identity or experience.

Stylistic analysis, detector observations, and provenance checks support review and product evaluation. They are deliberately independent from the rewrite objective: Sapienize does not use a detector or watermark result to choose words, rank candidates, or decide that a rewrite is finished. Robust measurement across changing detectors is a research direction, not a current accuracy claim. Any future claim must be supported by a representative, licensed benchmark with leakage-safe held-out evaluation.

**Open the browser app:** https://tmanish.github.io/sapienize/

The standalone app runs analysis in the browser. Text is sent to a model provider only when you request a rewrite. The browser rewrite path supports Anthropic, OpenAI, and OpenRouter with user-supplied credentials; Anthropic can also work without a key inside a compatible Claude artifact.

## Get it

- Use the hosted browser app at https://tmanish.github.io/sapienize/.
- Download [`sapienize.html`](https://github.com/tmanish/sapienize/raw/main/sapienize.html) for a standalone file that works offline for analysis.
- Download [`sapienize.skill`](https://github.com/tmanish/sapienize/raw/main/sapienize.skill) to install the current thin Claude host adapter, then ask to “sapienize this draft” or “make this sound like me.” A packaged ChatGPT/Codex or Gemini skill is not shipped yet.

To use Anthropic's keyless artifact path, attach `sapienize.html` to a Claude.ai chat and ask Claude to render it as an artifact. On the hosted page or from a local file, use **API settings** and supply your own provider credential.

## What the results mean

| Result | Question it answers | Current status | What it does not mean |
|---|---|---|---|
| Stylistic signals | Which configured phrases, structures, punctuation habits, and rhythm patterns occur? | Available locally | Proof that AI wrote the text |
| Style heuristic | How densely does the text trigger the configured signal library? | Available as a backward-compatible, uncalibrated 0–100 score; higher means fewer configured signals | Probability of human authorship, detector confidence, or quality |
| Local detector estimate | What would a calibrated local AI-text detector conclude? | Unavailable until a detector is trained and evaluated on suitable data | The style heuristic with a new label |
| External detector observation | What did a particular external detector/version report on a particular date? | Adapter-ready; requires legitimate access and credentials | A score directly comparable with another detector's score, or a rewrite target |
| Voice similarity | How closely do measured writing habits match an authentic `VoiceProfile`? | Available with aggregate and component-level differences | Identity verification or authorship probability |
| Semantic integrity | What protected facts or claims changed between an original and a rewrite? | Available for numbers, URLs, dates, quotations, likely named entities, lexical similarity, and obvious claim changes | A guarantee that every subtle implication is unchanged |
| Provenance | Is there explicit, supported evidence about tool participation? | Structured interface available; the current Anthropic compatibility boundary reports `unsupported` unless an official verifier is configured | Something that can be inferred from stock phrases or invisible characters, or certification that text is watermark-free |
| Document integrity | Does the text contain invisible or directional formatting characters worth reviewing? | Available locally | Watermark or AI-authorship evidence |

These result families remain separate in the API and in evaluation. External detector and provenance results are observations only. Sapienize never uses them to rank rewrites.

### Claude marks and copied text

Do not assume that copying generated text removes an embedded text mark. Claude-supported output may carry a mark in the generated token sequence, so copying the visible text can preserve it; it is not necessarily API-envelope metadata that disappears with copy and paste. A rewrite generated through Claude may also carry a new Claude mark. Anthropic says public detection details are forthcoming, and Sapienize currently has neither an official Claude text verifier nor a basis for certifying output as watermark-free. An `unsupported` result means unknown, not absent. See [Anthropic's current marking documentation](https://support.claude.com/en/articles/16266773-how-claude-marks-ai-generated-content).

## Browser workflow

1. Paste a draft and select **Run forensics**. The scan is local and highlights configured signals with contextual findings.
2. Optionally choose a requested persona and, preferably, provide at least **300 words of authentic writing**. Shorter samples are accepted with a warning because their measured habits are less stable. A genuine sample takes precedence over persona assumptions.
3. Select **Rewrite in my voice** and configure Anthropic, OpenAI, or OpenRouter if needed. API keys remain in the page's memory for the current tab and are sent only to the selected provider.
4. Review the rewrite's semantic differences, document-integrity findings, and voice comparison. Automated checks can miss subtle changes, so the author remains the final reviewer.
5. Use **Use as new specimen** to rescan a candidate.

The rewrite objective is ordered: preserve meaning and protected facts, match the supplied voice, then reduce generic or model-associated patterns where that does not conflict with the first two goals. Sapienize does not impose universal rules such as banning em dashes; punctuation is compared with the author's actual profile when one is available.

## Core and CLI

The provider-neutral core exposes these operations:

```js
sapienize.analyze(text, options)
sapienize.createVoiceProfile(samples)
sapienize.compareVoice(text, profile)
sapienize.rewrite(text, options)
sapienize.verify(original, rewrite, options)
sapienize.checkProvenance(text, options)
```

The command-line surface covers the main file-oriented workflows:

```bash
sapienize scan draft.txt
sapienize profile samples/
sapienize rewrite draft.txt --voice profile.json
sapienize verify original.txt rewrite.txt
sapienize provenance draft.txt
sapienize eval eval/fixtures/public-synthetic.jsonl
```

Run `sapienize --help` for the installed command's complete options. Scanning, profiling, verification, and the built-in integrity checks are local. Rewriting requires an explicitly selected provider. The proposed MCP mapping is documented in [`docs/mcp-interface.md`](docs/mcp-interface.md); an MCP server is not shipped in this release.

From a repository checkout, use `npm run sapienize -- <command>` instead of a globally installed `sapienize` binary. Rewrite credentials are read from `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `OPENROUTER_API_KEY` by default; `--api-key-env` selects a different environment variable. Keys are not accepted as command arguments and are redacted from CLI output.

## Voice profiles

`createVoiceProfile(samples)` measures sentence and paragraph distributions, fragments and short sentences, lexical diversity, contractions, punctuation and parentheticals, questions, pronouns, function words, conjunctions, transitions, hedges, intensifiers, discourse markers, spelling convention, register, sentence openings, vocabulary, and rhythm.

`compareVoice(text, profile)` returns an uncalibrated descriptive similarity and component differences. It does not identify a person. Use authentic, representative samples from the relevant register; combining unrelated genres or AI-edited samples produces a misleading target. Sapienize recommends 300 or more words and reports a warning below that amount.

## Evaluation

Evaluation records use JSON or JSONL:

```json
{
  "id": "public-human-001",
  "text": "...",
  "source_type": "human",
  "model": "optional",
  "domain": "email",
  "author_id": "optional-pseudonym",
  "metadata": {}
}
```

Supported source types are `human`, `ai`, `human_ai_polished`, `ai_human_edited`, and `mixed`. Do not commit private author samples. The evaluator can report classification metrics when real predictions are supplied, calibration error only for explicitly calibrated probabilities, grouped performance, voice similarity, and semantic preservation. The included synthetic fixture tests plumbing; it is not evidence of detector accuracy.

Evaluation datasets can also carry a separately versioned governance manifest. The committed [`public-synthetic.manifest.json`](eval/fixtures/public-synthetic.manifest.json) binds the fixture to its license, consent basis, collection method, privacy handling, lineage, provider/model versions, exact dataset fingerprint, and frozen split assignments. It remains plumbing-only. See the normative [`evaluation-data protocol`](docs/evaluation-data-protocol.md) before collecting or evaluating non-synthetic data; keep private material and raw detector responses under the ignored `eval/.local/` boundary.

The manifest API validates the governance record and its binding to the exact dataset before a split is selected:

```js
const { loadDataset } = require("./eval/dataset.js");
const { loadDatasetManifest, selectDatasetSplit } = require("./eval/manifest.js");

const records = loadDataset("eval/fixtures/public-synthetic.jsonl");
const manifest = loadDatasetManifest(
  "eval/fixtures/public-synthetic.manifest.json",
  { records }
);
const evaluationRecords = selectDatasetSplit(records, manifest, "evaluation");
```

```bash
npm run eval -- eval/fixtures/public-synthetic.jsonl
```

No accuracy, calibration, or cross-detector equivalence is claimed without representative evaluation data.

## Product-aligned next path

The next milestone is data and evaluation, not more heuristic rules:

1. **Create the evaluation-data protocol.** Add dataset manifests covering licensing, consent, collection method, edit history, domain, model/version, and leakage-safe train/evaluation splits.
2. **Assemble a representative benchmark.** Cover genuine human writing, AI output, grammar-corrected writing, mixed documents, human-edited AI output, and voice-restored output across domains and lengths. Keep private voice material local.
3. **Integrate one legitimate external detector.** Use it strictly as a versioned evaluation observation. Preserve its raw response, score semantics, threshold, calibration status, and date; never feed it into rewrite ranking.
4. **Use benchmark failures to improve voice and semantic verification.** Prioritize stronger named-entity and claim handling, genre-aware voice comparisons, author-held-out evaluation, and scalable matching for long documents.
5. **Consider a calibrated local detector only after sufficient data exists.** Ship it only if held-out evaluation supports defensible performance and calibration claims.
6. **Implement MCP afterward.** The interface is documented; implementation should follow once the core schemas and evaluation workflow have remained stable through real use.

Progress, decision boundaries, and the cross-host delivery sequence are maintained in [`docs/product-path.md`](docs/product-path.md).

## Detector and provenance integrations

`src/detectors/adapter.js` defines the external observation contract; no paid vendor integration or credential is bundled. The mock adapter supports deterministic tests. Surrogate hooks prepare feature rows for later research but ship no trained model, prediction claim, or calibration.

Every external observation retains its detector name, version when known, date, raw response, provider-specific normalized representation, explicit calibration status, and limitations. These observations may be evaluated, but never optimized during rewriting.

Provenance is a separate subsystem. The current Anthropic compatibility boundary accepts only an official configured verifier; without one it returns `unsupported`. It is not a working Claude watermark detector, and public technical detection details are not assumed. Sapienize does not infer a watermark from regexes, phrasing, or hidden characters. Document-integrity checks surface invisible/directional characters independently and do not treat them as provenance evidence.

## Cross-host direction

The long-term `/sapienize` experience should come from one host-neutral workflow and shared schemas, with thin delivery adapters for each host. Today, the provider-neutral core and CLI are reusable, the browser can rewrite through Anthropic, OpenAI, or OpenRouter, and the generated `.skill` package is Claude-oriented. ChatGPT/Codex packaging, Gemini packaging, and a working MCP server remain planned work; availability and invocation syntax will depend on each host rather than being implied by the current Claude artifact.

## Repository layout

- `src/analysis/`: stylistic signals, the legacy style heuristic, and the explicit unavailable local-detector result.
- `src/detectors/`: external detector observation adapters, deterministic mocks, and unvalidated surrogate-research hooks.
- `src/voice/`: `VoiceProfile` extraction, validation, and comparison.
- `src/rewrite/`: provider-neutral prompts, semantic verification, rewrite verification, and candidate ranking.
- `src/providers/`: Anthropic, OpenAI, and OpenRouter adapters behind one provider interface.
- `src/provenance/`: document-integrity checks and provenance/watermark adapter boundaries.
- `src/core/`: structured provider-neutral API and result validation.
- `src/engine.js`: backward-compatible v1 analysis facade and tell library.
- `eval/`: dataset and governance-manifest validation, metrics, evaluator, and public synthetic fixtures.
- `skill/sapienize/`: current Claude-oriented skill source, implemented as a thin host workflow over the shared concepts; host-neutral packaging is planned.
- `src/sapienize_shell.html`: authoritative browser UI source.
- `sapienize.html` and `sapienize.skill`: generated release artifacts. Do not edit them directly.
- `build.py`: browser/skill artifact builder.
- `tests/`: unit, integration, browser, provider, and artifact regressions.

See [`AGENTS.md`](AGENTS.md) for architectural invariants and contribution commands.

## Development

```bash
npm install
npm run build
npm test
npm run eval -- eval/fixtures/public-synthetic.jsonl
```

`npm test` first checks that generated artifacts match their sources, then verifies that rebuilding is byte-for-byte reproducible. After changing `src/` or `skill/`, run `npm run build` before the suite; never patch the generated HTML or skill archive directly.

The executable tell library currently has two maintained representations: entries in `src/engine.js` and their host-readable counterparts in `skill/sapienize/references/tells.md`. Keep executable labels, severities, and guidance aligned until they are generated from one shared data file; reference-only advice must be explicitly marked `Manual/context-only`.

## Limitations and safety

- Stylistic patterns have false positives, vary by domain, and change over time. A genuine author may use any configured pattern.
- The legacy style heuristic is manually weighted and uncalibrated. It must never be presented as a probability or detector result.
- Voice similarity is sensitive to sample length, genre, language variety, and topic. It is descriptive, not biometric.
- Semantic verification is conservative but heuristic. Review flagged differences and reread important rewrites yourself.
- Named-entity extraction is approximate, especially across languages and specialist domains.
- An unavailable provenance verifier means provenance is unknown, not absent. Copying text is not proof that an embedded mark was removed, and Sapienize cannot currently certify output as watermark-free. Invisible characters are reported separately and are not treated as watermark evidence.
- External detectors require their own credentials and terms-compliant use. Record detector name, version when known, observation date, raw response, and any normalized view.
- Sapienize does not use named-detector optimization or watermark removal as rewrite objectives, and it does not promise that a rewrite will receive a particular detector result.
- The project does not claim detector accuracy until reproducible evaluation on representative, legally usable data supports it.

Sapienize is a review aid, not an authorship adjudicator.
