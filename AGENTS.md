# Sapienize contributor guide

Sapienize v2 evolves a working v1. Preserve the standalone browser experience and the legacy result fields while moving new work through the provider-neutral modules. Do not replace working behavior wholesale to make a refactor easier.

## Commands

Run these from the repository root:

```bash
npm install
npm run build
npm test
npm run eval -- eval/fixtures/public-synthetic.jsonl
```

- `npm test` is the full regression command. It checks source/artifact parity and build reproducibility before running engine, module, provider, evaluation, CLI, and jsdom/browser tests.
- `npm run build` regenerates the standalone browser app and Claude skill.
- `npm run eval -- <dataset.jsonl>` runs the reproducible evaluator. The committed synthetic fixture verifies evaluator plumbing; it is not an accuracy benchmark.
- For governed evaluation, use `npm run eval -- <dataset.jsonl> --manifest <manifest.json> --split <name>`. The complete dataset is validated before selection. Manifest-free evaluation is restricted to explicitly synthetic records.
- `npm run sapienize -- audit <dataset.jsonl> --manifest <manifest.json>` reports normalized exact and lexical near duplicates without analyzing prose. Cross-split matches block evaluation; same-split matches require review and remain in the dataset.
- Run the relevant focused test after each coherent change, then run the full suite and build before handoff.

CLI smoke tests should cover the shared surface:

```bash
npm run sapienize -- scan draft.txt
npm run sapienize -- detect draft.txt
npm run sapienize -- profile samples/
npm run sapienize -- rewrite draft.txt --voice profile.json
npm run sapienize -- generate brief.txt --samples samples/ --facts facts.txt
npm run sapienize -- verify original.txt rewrite.txt
```

Detection and writing smoke tests use injected adapters/mocks unless a live run is explicitly configured. `detect` reads `GPTZERO_API_KEY`; `generate` always returns a review-required draft (exit 4), including when completion succeeded.

## Architecture and ownership

Authoritative source files:

- `src/analysis/`: stylistic-signal extraction, legacy heuristic classification, and local detector-estimate contracts.
- `src/detectors/`: external detector observation contract, mock adapter, and unvalidated surrogate-research hooks.
- `src/voice/`: `VoiceProfile` schema, extraction, and descriptive comparison.
- `src/rewrite/`: semantic checks, verification orchestration, prompt construction, and candidate ranking.
- `src/providers/`: provider interface plus Anthropic, OpenAI, and OpenRouter implementations.
- `src/provenance/`: document-integrity inspection and official provenance-verifier boundaries.
- `src/core/`: provider-neutral public API and structured result validation.
- `src/engine.js`: backward-compatible v1 facade and executable `SAPIENIZE_TELLS` library.
- `src/analysis/tell-reference.js`: Node-only renderer for the generated tables in `tells.md`.
- `src/sapienize_shell.html`: browser UI, styles, and browser workflow.
- `eval/`: dataset and governance-manifest validation, metrics, evaluator, and non-private fixtures.
- `skill/sapienize/`: Claude skill instructions, references and executable helpers.
- `skill/runtime-files.json`: explicit allowlist of shared source files bundled into the Claude skill; never include credentials, local results or private samples.
- `tests/`: regression and integration tests.
- `build.py`: the authoritative bundle/package recipe.
- `index.html`: the GitHub Pages redirect to the standalone app.

Generated release artifacts:

- `sapienize.html` is assembled from `src/sapienize_shell.html` and the browser-safe modules listed by `build.py`.
- `sapienize.skill` is a ZIP generated from the instructions/references/helpers in `skill/sapienize/` plus shared runtime sources listed in `skill/runtime-files.json`. Do not maintain duplicate runtime sources in the skill directory. Test the extracted package outside the repository with `tests/test_skill_package.js`.
- The phrase tables between the `GENERATED: SAPIENIZE_TELLS` markers in `skill/sapienize/references/tells.md` are rendered from `src/engine.js`.

**Never edit `sapienize.html` or `sapienize.skill` directly.** Change their sources and run `npm run build`. Commit regenerated artifacts when the release files are expected to change.

`SAPIENIZE_TELLS` in `src/engine.js` is the single source of truth for the tell library. Every entry carries `examples: { hit: [...], miss: [...] }`: each hit must surface with that label in `analyzeText`, each miss must not, and context-sensitive entries need at least one miss. `npm run build` renders the phrase tables in `skill/sapienize/references/tells.md` from the engine through `src/analysis/tell-reference.js`; never edit the generated block by hand. The rest of `tells.md` (document-level signals and explicitly marked `Manual/context-only` advice) stays hand-written. Severity is review priority inside the legacy heuristic, not confidence of AI authorship.

## Result boundaries

The structured analysis result keeps these concepts separate:

```js
{
  stylisticSignals: {},
  detectorEstimate: {},
  voiceMatch: {},
  semanticIntegrity: {},
  provenance: {}
}
```

Architectural invariants:

1. `stylisticSignals` reports configured, explainable observations. A finding can be appropriate for a particular author or domain.
2. `heuristicStyleScore` is the backward-compatible manually weighted score. It is uncalibrated, non-probabilistic, and higher only means fewer configured signals. Never label it as human probability, detector confidence, or writing quality.
3. `detectorEstimate` remains explicitly `unavailable` until a local model is trained and evaluated. Do not synthesize a probability from regexes or the style heuristic.
4. External detector results are observations tied to a detector name, detector/model version when known, date, raw response, and normalized representation. Never assume two vendors' percentages have the same meaning.
5. `voiceMatch` is descriptive feature similarity, not identity verification or authorship probability.
6. `semanticIntegrity` compares an original and a candidate. It must flag protected-content changes rather than silently accept them.
7. `provenance` requires explicit supported evidence. An unavailable verifier means unknown, not absent. Invisible or directional characters belong to `documentIntegrity`, not watermark inference.
8. By default, detector observations remain separate from writing. Explicitly requested detector-aware refinement may use validated observations from a configured detector. Keep credentials and raw responses out of prompts, retain vendor semantics, and enforce protected-content and voice-preservation gates before comparing detector results. Provenance signals never guide rewriting or ranking.
9. Detector-aware refinement is an opt-in experimental feature, not a promise to evade institutional detectors. Report the detector/version, before/after observations, call budget and limitations. Do not infer or remove watermarks or provenance from prose.
10. Do not fabricate benchmark data, accuracy, calibration, or support for an API that is not configured.

## VoiceProfile

Use `createVoiceProfile(samples)` to extract measurable habits and `compareVoice(text, profile)` to report aggregate and component differences. The profile is descriptive: it records punctuation, contractions, long sentences, fragments, spelling, register, and other authentic habits rather than enforcing a generic idea of human prose.

- Recommend at least 300 authentic, representative words. Keep shorter input valid but return its sample-size warning.
- Do not commit private writing samples. Public fixtures must be licensed, synthetic, or contributed specifically for testing.
- Keep the profile and comparison schemas versioned and runtime-validated.
- Treat genre/register mismatch as a limitation. A technical memo and personal email from one author are not interchangeable reference samples.
- Do not impose universal punctuation rules. If a profile uses em dashes, semicolons, formal expansions, or long sentences, the rewrite should be allowed to preserve those habits.

## Rewrite and verification

Rewrite priorities are fixed:

1. Preserve meaning, facts, claims, names, numbers, dates, URLs, and quotations.
2. Match an authentic `VoiceProfile` when supplied.
3. Reduce generic/model-associated stylistic patterns only when this does not conflict with the first two priorities.

Persona is optional and used only when requested. It may guide register and diction but must not invent biography, credentials, anecdotes, facts, or opinions; the authentic profile wins on conflict.

Every rewrite candidate must be verified against the original. Critical protected-content changes make a candidate ineligible. Normal ranking prioritizes semantic integrity, voice similarity, then the uncalibrated style heuristic. Explicit detector refinement may compare eligible candidates using one vendor/version's documented class probabilities only after semantic and voice-preservation gates. Never compare different vendors' scores as a shared scale. Automated semantic checks are heuristic, so expose differences for human review.

Generation uses directional source preservation, not rewrite equivalence. `contentMode: "fiction"` explicitly permits new dialogue, characters and actions while preserving supplied facts and quotations. Record permitted additions separately, retain source-conflict checks and keep every generated draft review-required. Voice refinement may use up to three bounded provider passes with measured component feedback; do not alter comparison weights just to improve a demonstration score.

When samples are supplied, writing can send bounded reference prose to the selected provider (three excerpts, 8,000 characters total); never add raw prose to exported profiles. Rewrite feedback starts with the original's voice differences. Semantic/style success alone must not stop refinement below the configured voice target (default 80, descriptive and uncalibrated). Below-target results remain review-required; expose the stopping reason and retain the pass cap. Preserve incomplete-output gates and the 1,000-token keyless artifact cap when adjusting BYOK reasoning/output headroom.

Preserve clause-local polarity checks and evidence-backed name/pronoun equivalences. Do not replace entity multiplicity checks with a global set comparison: actor substitutions can preserve the same name inventory. Any allowed mention-count change must retain its established subject binding and exact-predicate evidence. Keep adversarial tests for ambiguous references, actor swaps, negation changes and all protected primitives alongside benign restructuring cases.

Generation is a separate `generate(brief, options)` operation: require writing samples or a validated profile, keep source facts separate from brief instructions, compare the generated voice, and check supplied facts. Without source facts, factual grounding is explicitly not verified. A new draft always requires review; do not certify it by comparing it with itself or treating brief instructions as an original document. The sample may belong to the user or another selected author; borrow habits, not identity, biography or passages.

## Provider adapters

Provider-specific HTTP, authentication, request shape, response parsing, truncation detection, and error handling belong in `src/providers/`. Core analysis, voice, semantic, and ranking modules must not branch on provider names.

An adapter implements the shared rewrite contract and returns normalized text/truncation/provider metadata while retaining raw provider output for diagnostics. Preserve these compatibility behaviors unless a tested migration replaces them:

- Anthropic supports a Claude-artifact keyless path with a restricted token budget and an Anthropic BYOK browser path.
- OpenAI and OpenRouter use user-supplied bearer credentials and their existing chat-completions-compatible response handling.
- Browser credentials remain in memory and must never be persisted, logged, added to prompts, fixtures, or error messages.
- The Claude artifact path intentionally avoids adding an `AbortSignal` to `fetch`; a regression test covers postMessage cloning compatibility.
- Provider tests use fixtures/mocks and must not make paid or live network calls.

Add providers through the registry/factory and shared interface, not through new UI-specific branches.

## Detector adapters and evaluation

External detector adapters retain a measurement contract. The explicit opt-in refinement orchestrator may consume validated observations; default writing remains detector-independent. Each normalized observation must retain:

- detector name;
- detector/model version when known;
- observation timestamp;
- raw result;
- normalized fields with documented meaning;
- calibration status and limitations.

Credentials and legitimate API access are supplied by the user/environment. Unit tests use mocks. Do not call paid services in the default test or evaluation suite.

GPTZero is the first configured detector adapter. Preserve human, AI-only and mixed class probabilities separately. Its normalized `aiScore` means AI-only class probability, not the fraction of generated words; a mixed verdict abstains from binary `predictedAi`. Local detector estimates remain unavailable. Keep the fixed credential destination, reject malformed output and retain explicit calibration limitations.

Evaluation records must conform to `eval/schema.js`. Non-synthetic benchmark data must also use the governance protocol in `docs/evaluation-data-protocol.md` and a manifest validated by `eval/manifest.js`. Keep runs reproducible, include seed/configuration and dataset/manifest fingerprints, and report unavailable metrics as unavailable rather than zero. Calibration error is valid only for values explicitly declared calibrated. Report per-domain, per-model, and document-length slices when the data supports them. Never commit private author data; keep it under the ignored `eval/.local/` boundary.

`eval/duplicates.js` owns the versioned lexical duplicate policy. Evaluation must audit all frozen partitions before invoking analyzers, even when only one split is requested. Never silently regenerate splits, remove duplicate records, or lower the audit threshold to make a run pass. Reports retain the selected-subset and full-dataset identities separately.

## Browser compatibility

The release remains a downloadable single HTML file. Browser-bundled modules must therefore be dependency-free and work both as CommonJS modules under Node and as ordered globals in the generated page. Keep `build.py`'s module order synchronized with dependencies.

Preserve the normalized-text/span contract: inline finding offsets refer to the normalized text returned by analysis, and highlighting must render against that same string. Keep output escaped before inserting user text into HTML. Retain the sentence-splitting fallback for engines without regex lookbehind.

The old `analyzeText` export and legacy result fields remain compatibility surfaces while v2 consumers migrate to the structured core. When changing a DOM id, provider request shape, legacy threshold, or artifact behavior, update or add a regression test deliberately.

## Documentation discipline

- Use “style heuristic,” not “human score,” for the legacy number.
- Say “unavailable” or “unsupported” when a detector/verifier is not configured.
- State that voice similarity and semantic integrity are heuristic/descriptive where appropriate.
- Do not promise detector outcomes or imply that absence of a signal proves human authorship.
- Keep `README.md`, this file, the Claude skill, CLI help, schemas, and `docs/mcp-interface.md` consistent with the actual public API.
