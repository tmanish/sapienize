# Sapienize

Sapienize combines AI-text detection with sample-guided drafting and rewriting. Check a text with GPTZero for vendor-reported human, AI-only and mixed probabilities, or generate and rewrite prose using your own or another author's representative writing samples. Writing preserves supplied facts, meaning, uncertainty and scope while matching measured habits. Samples guide voice, not identity, biography or copied passages. Local stylistic analysis remains available offline.

Stylistic analysis, detector observations, and provenance checks support review and product evaluation. They are deliberately independent from the rewrite objective: Sapienize does not use a detector or watermark result to choose words, rank candidates, or decide that a rewrite is finished. Robust measurement across changing detectors is a research direction, not a current accuracy claim. Any future claim must be supported by a representative, licensed benchmark with leakage-safe held-out evaluation.

> I designed and released this concept long before Google did.

**Open the browser app:** https://tmanish.github.io/sapienize/

The standalone app runs style and integrity checks in the browser. Detection sends the specimen to GPTZero only when requested. Generation and rewriting send the brief/draft, supplied source facts and measured voice profile to the selected writing provider only when requested. Writing supports Anthropic, OpenAI and OpenRouter with user-supplied credentials; Anthropic also has a keyless path inside a compatible Claude artifact. Browser keys remain in tab memory.

## Get it

- Use the hosted browser app at https://tmanish.github.io/sapienize/.
- Download [`sapienize.html`](https://github.com/tmanish/sapienize/raw/main/sapienize.html) for a standalone file that works offline for analysis.
- Download [`sapienize.skill`](https://github.com/tmanish/sapienize/raw/main/sapienize.skill) to install the Claude workflow with its bundled local scoring runtime, then ask to “sapienize this draft” or “make this sound like me.” A packaged ChatGPT/Codex or Gemini skill is not shipped yet.

To use Anthropic's keyless artifact path, attach `sapienize.html` to a Claude.ai chat and ask Claude to render it as an artifact. On the hosted page or from a local file, use **API settings** and supply your own provider credential.

### Use the web app

Scanning needs no account or key. Open the hosted app (or the downloaded `sapienize.html`), paste a draft, and select **Run forensics**. Everything in the scan runs in your browser.

Rewriting calls a model, so it needs one of these:

- **Your own API key.** Select **API settings**, pick a provider, and paste a key. Get one from the [Anthropic Console](https://console.anthropic.com/), [OpenAI](https://platform.openai.com/api-keys), or [OpenRouter](https://openrouter.ai/keys). The provider bills you for each rewrite. Default models are `claude-sonnet-4-6`, `gpt-4o-mini`, and `openai/gpt-4o-mini`; you can type any model name your key can use. The key stays in memory for that tab. It isn't saved, and it's sent only to the provider you picked.
- **No key, inside Claude.** Attach `sapienize.html` to a claude.ai chat and ask Claude to open it as an artifact. Rewrites then run on your Claude plan. This path caps the response at 1,000 tokens, so drafts over roughly 650 words can come back cut off; split long pieces into sections or use a key. It only works inside an artifact, not on the hosted page.

For detection, enter your GPTZero API key in **AI detection · GPTZero** and select **Check with GPTZero**. Detection uses a separate account/key from the writing provider. If your browser or account blocks direct API access, use the CLI. The integration follows [GPTZero's documented text endpoint](https://docs.gptzero.me/quickstart/); no paid request or independent accuracy benchmark was run during implementation.

For a new draft, add samples, expand **Generate a new draft from a brief**, and enter the brief, optional source facts and target length. The [browser workflow](#browser-workflow) covers review and rewriting.

### Install the skill

`sapienize.skill` is a ZIP containing a `sapienize/` folder with instructions, references, executable helpers and the shared source-derived runtime. With code execution and Node 20.19+, Claude can draft in its current session and measure voice similarity and semantic differences locally, without a repository checkout, npm installation or additional writing-provider key. External generation and detector calls require separately configured access. Without Node, the skill supports qualitative review and reports numeric scores unavailable. The extracted package is tested locally; live Claude-host installation and instruction-following remain unverified.

**Claude apps (web, desktop, and Claude Code on the same account).** Skills must be enabled for your account.

1. Download [`sapienize.skill`](https://github.com/tmanish/sapienize/raw/main/sapienize.skill).
2. In claude.ai, open **Customize → Skills**, choose **Create skill → Upload a skill**, and upload the archive. If the picker requires `.zip`, rename a copy of `sapienize.skill` to `sapienize.zip`; it is already a ZIP archive.
3. Start a new chat and ask Claude to "sapienize this draft" or "draft from this brief using these writing samples." Claude Code account sync requires a supported version and account sign-in; API-key sessions and disabled sync require a local install. See the [current Claude skill guide](https://support.claude.com/en/articles/12512180-use-skills-in-claude).

**Claude Code only, without uploading to your account.** Unzip it into your personal skills folder:

```bash
mkdir -p ~/.claude/skills && unzip -o sapienize.skill -d ~/.claude/skills/
```

To share it with one project instead, unzip it into that project's `.claude/skills/` folder. Start a new Claude Code session and type `/sapienize` to check it's loaded.

Use one of these, not both. A local copy doesn't update when you upload a new version to your account, so you'd end up with two skills and one of them stale.

### Update the skill

Download the latest `sapienize.skill` and repeat the same install step in **Customize → Skills**, or unzip it again over the local copy. Start a new chat/session afterward. The [validation record](docs/skill-validation.md) distinguishes local package/contract checks from live Claude-host behavior.

## What the results mean

| Result | Question it answers | Current status | What it does not mean |
|---|---|---|---|
| Stylistic signals | Which configured phrases, structures, punctuation habits, and rhythm patterns occur? | Available locally | Proof that AI wrote the text |
| Style heuristic | How densely does the text trigger the configured signal library? | Available as a backward-compatible, uncalibrated 0–100 score; higher means fewer configured signals | Probability of human authorship, detector confidence, or quality |
| Local detector estimate | What would a calibrated local AI-text detector conclude? | Unavailable until a detector is trained and evaluated on suitable data | The style heuristic with a new label |
| External detector observation | What did a particular external detector/version report on a particular date? | GPTZero API integration with separate human/AI-only/mixed probabilities; requires your API key | Independently validated Sapienize accuracy, proof of authorship, a percentage of generated words, or a rewrite target |
| Voice similarity | How closely do measured writing habits match an authentic `VoiceProfile`? | Available with aggregate and component-level differences | Identity verification or authorship probability |
| Semantic integrity | What protected facts or claims changed between an original and a rewrite? | Available for numbers, URLs, dates, quotations, likely named entities, lexical similarity, and obvious claim changes | A guarantee that every subtle implication is unchanged |
| Provenance | Is there explicit, supported evidence about tool participation? | Structured interface available; the current Anthropic compatibility boundary reports `unsupported` unless an official verifier is configured | Something that can be inferred from stock phrases or invisible characters, or certification that text is watermark-free |
| Document integrity | Does the text contain invisible or directional formatting characters worth reviewing? | Available locally | Watermark or AI-authorship evidence |

These result families remain separate in the API and in evaluation. Default writing does not use detector results. Explicit opt-in detector-aware refinement can compare one vendor/version's observations after fact and voice gates. Provenance never guides rewriting.

### Claude marks and copied text

Do not assume that copying generated text removes an embedded text mark. Claude-supported output may carry a mark in the generated token sequence, so copying the visible text can preserve it; it is not necessarily API-envelope metadata that disappears with copy and paste. A rewrite generated through Claude may also carry a new Claude mark. Anthropic says public detection details are forthcoming, and Sapienize currently has neither an official Claude text verifier nor a basis for certifying output as watermark-free. An `unsupported` result means unknown, not absent. See [Anthropic's current marking documentation](https://support.claude.com/en/articles/16266773-how-claude-marks-ai-generated-content).

## Browser workflow

1. Paste a draft and select **Run forensics**. The scan is local and highlights configured signals with contextual findings.
2. Optionally choose a requested persona and, preferably, provide at least **300 words of authentic writing**. Shorter samples are accepted with a warning because their measured habits are less stable. A genuine sample takes precedence over persona assumptions.
3. Select **Rewrite in my voice** and configure Anthropic, OpenAI, or OpenRouter if needed. API keys remain in the page's memory for the current tab and are sent only to the selected provider.
4. Review the rewrite's semantic differences, document-integrity findings, and voice comparison. Automated checks can miss subtle changes, so the author remains the final reviewer.
5. Use **Use as new specimen** to rescan a candidate.

For new content, paste or upload representative `.txt`/`.md` samples, provide a brief and optional source facts, then select **Generate in selected voice**. Samples are required for generation; 300+ words from the target genre are recommended. Generation uses a single provider request with a configurable 50–3000-word target, compares the output with the measured profile and checks supplied facts. It always returns a draft requiring review. Without source facts, factual grounding is explicitly unverified; with them, checks remain heuristic and can flag additions or omissions during expansion. Output truncation/refusal remains visible and never counts as accepted content.

GPTZero detection is an independent action on the specimen. Its three probabilities are displayed together so a high mixed score is not mistaken for a low chance of AI participation merely because the AI-only score is low. Detection does not run automatically after writing and does not select or revise candidates.

The rewrite objective is ordered: preserve meaning and protected facts, match the supplied voice, then reduce generic or model-associated patterns where that does not conflict with the first two goals. Sapienize does not impose universal rules such as banning em dashes; punctuation is compared with the author's actual profile when one is available.

## Core and CLI

The provider-neutral core exposes these operations:

```js
sapienize.analyze(text, options)
sapienize.detect(text, { detector: "gptzero", apiKey })
sapienize.createVoiceProfile(samples)
sapienize.compareVoice(text, profile)
sapienize.rewrite(text, options)
sapienize.generate(brief, { voiceSamples, sourceFacts, targetWords: 400, provider, apiKey })
sapienize.verify(original, rewrite, options)
sapienize.checkProvenance(text, options)
```

The command-line surface covers the main file-oriented workflows:

```bash
sapienize scan draft.txt
sapienize detect draft.txt
sapienize profile samples/
sapienize rewrite draft.txt --voice profile.json
sapienize rewrite draft.txt --samples samples/ --provider anthropic
sapienize generate brief.txt --samples samples/ --facts facts.txt --words 400 --provider anthropic
sapienize verify original.txt rewrite.txt
sapienize provenance draft.txt
sapienize eval eval/fixtures/public-synthetic.jsonl
sapienize audit dataset.jsonl --manifest dataset.manifest.json
sapienize eval dataset.jsonl --manifest dataset.manifest.json --split evaluation
```

Run `sapienize --help` for complete options. Scanning, profiling, verification and integrity checks are local. Detection and writing make explicitly requested API calls. `--voice profile.json` and `--samples <file|directory|->` are mutually exclusive writing inputs. `generate` returns exit 4 with a valid draft requiring review; this is distinct from operational failure (exit 1). The proposed MCP mapping is documented in [`docs/mcp-interface.md`](docs/mcp-interface.md); an MCP server is not shipped.

From a repository checkout, use `npm run sapienize -- <command>`. Writing credentials are read from `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `OPENROUTER_API_KEY`; detection uses `GPTZERO_API_KEY`. `--api-key-env` selects a different environment variable. Keys are not accepted as command arguments and are redacted from CLI output. Never commit keys, samples or raw detector responses.

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

The evaluator validates the complete dataset and manifest before selecting an explicit frozen split or calling any analyzer. Non-synthetic evaluation requires a manifest; manifest-free runs accept only records explicitly marked `metadata.synthetic: true` and report `synthetic_only` governance. Unresolved consent/license metadata blocks evaluation.

Audit duplicates before running a governed evaluation:

```bash
npm run sapienize -- audit eval/fixtures/public-synthetic.jsonl --manifest eval/fixtures/public-synthetic.manifest.json
npm run eval -- eval/fixtures/public-synthetic.jsonl --manifest eval/fixtures/public-synthetic.manifest.json --split evaluation
```

The local audit reports normalized exact matches and near duplicates using a versioned three-word-shingle Jaccard policy (threshold 0.8). Cross-split matches block evaluation, including matches outside the requested split. Same-split matches remain visible review items; no records are automatically removed or reassigned. Short texts receive exact checks, and paraphrases or unsegmented languages may require additional manual review. Audit output contains record IDs and similarity values, not source text.

`audit` exits 0 for no matches, 4 for matches requiring review, and 1 for cross-split leakage or invalid data. `eval` exits 1 on invalid data or leakage without writing a metric report. Both support `--output`; `eval` also accepts `--observations`, `--seed`, and an explicit `--threshold` on the detector's own scale. Observations for known records outside the selected split are excluded and listed in the report; unknown IDs fail validation.

The same workflow is available through the synchronous and asynchronous evaluator APIs:

```js
const { loadDataset } = require("./eval/dataset.js");
const { loadDatasetManifest } = require("./eval/manifest.js");
const { evaluateDataset } = require("./eval/evaluator.js");

const records = loadDataset("eval/fixtures/public-synthetic.jsonl");
const manifest = loadDatasetManifest(
  "eval/fixtures/public-synthetic.manifest.json",
  { records }
);
const report = evaluateDataset(records, { manifest, split: "evaluation", seed: 42 });
```

Reports retain the evaluated subset's `dataset.fingerprint` and add `evaluatorVersion` plus `governance`: full-dataset fingerprint/count, manifest fingerprint/version, frozen split membership/policy, duplicate audit and excluded observation IDs. Metrics include source type, language, author group, provider/model/version, domain, model, and length slices. Missing measurements remain unavailable. The seed does not create or reshuffle splits. `selectDatasetSplit` remains available and also rejects cross-split duplicates.

```bash
npm run eval -- eval/fixtures/public-synthetic.jsonl
```

No accuracy, calibration, or cross-detector equivalence is claimed without representative evaluation data.

## Product-aligned next path

The core detection and voice-writing paths are now implemented. Their next validation milestones are:

1. **Evaluation-data protocol and workflow are implemented.** Manifests, explicit frozen splits, dataset/manifest fingerprints, and a local lexical near-duplicate audit are integrated into evaluation. These checks support reproducibility; they do not establish benchmark quality.
2. **Assemble a representative benchmark.** Cover genuine human writing, AI output, grammar-corrected writing, mixed documents, human-edited AI output, and voice-restored output across domains and lengths. Keep private voice material local.
3. **Validate the GPTZero integration with legitimate access.** The documented adapter and mocked tests are implemented. Live account/browser compatibility and representative accuracy remain to be evaluated; observations never feed rewrite ranking.
4. **Use benchmark failures to improve voice and semantic verification.** Prioritize stronger named-entity and claim handling, genre-aware voice comparisons, author-held-out evaluation, and scalable matching for long documents.
5. **Consider a calibrated local detector only after sufficient data exists.** Ship it only if held-out evaluation supports defensible performance and calibration claims.
6. **Implement MCP afterward.** The interface is documented; implementation should follow once the core schemas and evaluation workflow have remained stable through real use.

Progress, decision boundaries, and the cross-host delivery sequence are maintained in [`docs/product-path.md`](docs/product-path.md).

## Detector and provenance integrations

`src/detectors/adapter.js` defines the external observation contract; `src/detectors/gptzero.js` implements GPTZero's fixed `POST /v2/predict/text` endpoint behind the detector factory. No credential is bundled. The adapter retains raw results, model version when returned, timestamp and separate class probabilities. It rejects malformed probabilities, errors and over-limit input without substituting a heuristic or silently truncating text. Network errors are sanitized. Tests use mocks and make no paid calls. Surrogate hooks ship no trained model or calibration claim.

The normalized `aiScore` is the vendor's AI-only class probability on a 0–1 scale. A mixed verdict has `predictedAi: null` (binary abstention), while human/AI-only verdicts map to false/true. Choose evaluation ground truth deliberately; an AI-only score is not a universal AI-involvement score. Observations are marked `calibrated: false` because Sapienize has not independently established calibration. The aggregate `detectorEstimate.probability` remains null and the vendor values live under `detectorEstimate.observations`; no local model is implied. The documented contract is summarized in [GPTZero's quickstart](https://docs.gptzero.me/quickstart/).

Every external observation retains its detector name, version when known, date, raw response, provider-specific normalized representation, explicit calibration status, and limitations. These observations may be evaluated or used in explicitly enabled detector-aware refinement; raw responses and credentials never enter writing prompts.

Provenance is a separate subsystem. The current Anthropic compatibility boundary accepts only an official configured verifier; without one it returns `unsupported`. It is not a working Claude watermark detector, and public technical detection details are not assumed. Sapienize does not infer a watermark from regexes, phrasing, or hidden characters. Document-integrity checks surface invisible/directional characters independently and do not treat them as provenance evidence.

## Cross-host direction

The long-term `/sapienize` experience should come from one host-neutral workflow and shared schemas, with thin delivery adapters for each host. Today, the provider-neutral core and CLI are reusable, the browser can rewrite through Anthropic, OpenAI, or OpenRouter, and the generated `.skill` package is Claude-oriented. ChatGPT/Codex packaging, Gemini packaging, and a working MCP server remain planned work; availability and invocation syntax will depend on each host rather than being implied by the current Claude artifact.

## Voice refinement, fiction and detector-aware refinement

Generation accepts `contentMode: "factual" | "fiction"` (default `factual`) and `maxVoicePasses: 1..3` (default 1). Voice guidance translates the measured profile into sentence-length variation, contraction, paragraph, punctuation and register guidance. Extra passes use the largest weighted voice differences, retaining the best semantically eligible candidate; the similarity formula is unchanged. Each pass may incur a provider charge.

When `voiceSamples` are supplied, writing also sends up to three deterministic reference excerpts (8,000 characters total) to the selected provider for diction, narration and dialogue guidance. Excerpts are treated as reference data, not commands or material to copy. They are not embedded in exported `VoiceProfile` objects. Profile-only requests remain supported without raw excerpts; CLI `--samples` preserves the excerpts, while `--voice` supplies only the saved profile.

Rewriting uses the original's measured voice differences from pass one and refines the best eligible candidate. It no longer stops merely because semantic/style checks pass while voice similarity is weak. `voiceTargetScore` defaults to 80 (API override: 0–100), an operational target, not a calibrated authenticity threshold. A rewrite below that target stays `review_required`; `voiceRefinement` records initial/selected scores, target status, pass budget and stopping reason. Calls remain bounded by `maxPasses` (1–3, default 3), and a repeated candidate or incomplete response stops the loop. Critical semantic changes still gate eligibility and semantic integrity still ranks before voice.

BYOK writing requests now reserve output space for reasoning as well as visible prose: `min(16000, max(4096, round(words * 3) + 2048))` tokens. A 400-word request permits 4,096 output tokens. This is a ceiling, not a promise of complete output or a fixed bill; truncation remains an explicit failure and does not trigger an unbounded paid retry. The Claude artifact keyless path remains capped at 1,000 tokens.

```bash
npm run sapienize -- generate brief.txt --samples samples/ --facts facts.txt --content-mode fiction --voice-passes 2
npm run sapienize -- rewrite draft.txt --samples samples/ --detector-passes 2
```

Fiction mode explicitly permits invented dialogue, characters and actions. Generation checks source-anchor inclusion, omissions and obvious contradictions rather than requiring lexical equivalence to a short fact list. New fictional material is recorded under `permittedAdditions`; missing/changed protected source facts and supplied quotations remain errors. Generation is always `review_required`; neither anchor coverage nor a clean check proves correctness. `core.verifyGeneration(facts, draft, {contentMode})` exposes the check directly. Rewrite verification remains strict.

Semantic checks compare supported clause boundaries so neighboring negation does not contaminate a joined sentence. Equivalent negative constructions such as “nothing” and “not anything” share a comparison form. Name-count changes are excused only for a locally established subject/pronoun binding and an exact predicate match, recorded in `checks.named_entities.equivalentMentions`; ambiguous references and unsupported repetitions remain flagged. Named-subject swaps on otherwise unchanged predicates are critical differences, including when the global name/number inventory is unchanged. Contradictions are checked in both directions. Numbers, dates, URLs and quotation multiplicity retain their strict checks. This is conservative heuristic evidence, not a general coreference or semantic-equivalence model.

`detectorRefinement: { apiKey, maxPasses: 2, detector: "gptzero", fetch? }` enables a separate experimental stage for generation or rewriting. The browser checkbox uses the GPTZero key already entered in the detector card. CLI `--detector-passes 1..3` uses `GPTZERO_API_KEY`. The budget includes the initial measurement: 2 permits at most two detector calls and one additional writing call. This sends drafts to GPTZero and may incur charges; it is off by default.

The objective is a higher **GPTZero human-class probability**, not a claim about actual authorship. A candidate must pass protected-content/completion checks, not regress semantic status or coverage, and remain within 3 descriptive voice points of the initial draft. Only the same known detector version can be compared. Results retain all three probabilities, raw observations, timestamps, rejected candidates, call counts and errors under `detectorRefinement`. A failed optional integration retains a usable measured/baseline draft. No live effectiveness or institutional-detector bypass has been established. Provenance is never an optimization objective.

The [independent effectiveness study runbook](docs/independent-effectiveness-study.md) prepares a public-domain pilot with real model API outputs, paired original/voice/refined arms, and Copyleaks and Originality.ai held out from refinement. Run `npm run study -- plan eval/study/pilot.json` for a network-free credential and call-budget check. Live runs require configured keys, explicit model IDs and `--live`; mocked tests are not effectiveness evidence.

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
- `skill/sapienize/`: Claude instructions, references and local checking/CLI helpers. The build packages shared runtime sources selected by `skill/runtime-files.json`; no separate scoring implementation is maintained.
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

The tell library lives in one place: `SAPIENIZE_TELLS` in `src/engine.js`. Each entry includes hit and miss examples that the test suite runs, and `npm run build` generates the phrase tables in `skill/sapienize/references/tells.md` from it. A stale table fails the tests. Hand-written advice in that file is marked `Manual/context-only`.

The [October 2026 stylistic-signal research review](docs/tell-research-2026-10.md) records recent evidence, tested model versions, and proposed contextual signals. These suggestions have not been added to the executable tell library.

## Limitations and safety

- Stylistic patterns have false positives, vary by domain, and change over time. A genuine author may use any configured pattern.
- The legacy style heuristic is manually weighted and uncalibrated. It must never be presented as a probability or detector result.
- Voice similarity is sensitive to sample length, genre, language variety, and topic. It is descriptive, not biometric.
- Semantic verification is conservative but heuristic. Review flagged differences and reread important rewrites yourself.
- Named-entity extraction is approximate, especially across languages and specialist domains.
- An unavailable provenance verifier means provenance is unknown, not absent. Copying text is not proof that an embedded mark was removed, and Sapienize cannot currently certify output as watermark-free. Invisible characters are reported separately and are not treated as watermark evidence.
- External detectors require their own credentials and terms-compliant use. Record detector name, version when known, observation date, raw response, and any normalized view.
- Experimental detector-aware refinement is opt-in and limited to configured GPTZero observations. It does not remove watermarks or promise an institutional detector outcome.
- The project does not claim detector accuracy until reproducible evaluation on representative, legally usable data supports it.

Sapienize is a review aid, not an authorship adjudicator.
