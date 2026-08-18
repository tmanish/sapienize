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
- Run the relevant focused test after each coherent change, then run the full suite and build before handoff.

CLI smoke tests should cover the shared surface:

```bash
npm run sapienize -- scan draft.txt
npm run sapienize -- profile samples/
npm run sapienize -- rewrite draft.txt --voice profile.json
npm run sapienize -- verify original.txt rewrite.txt
```

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
- `src/sapienize_shell.html`: browser UI, styles, and browser workflow.
- `eval/`: dataset schema/parser, metrics, evaluator, and non-private fixtures.
- `skill/sapienize/`: Claude skill source and host-readable stylistic reference.
- `tests/`: regression and integration tests.
- `build.py`: the authoritative bundle/package recipe.
- `index.html`: the GitHub Pages redirect to the standalone app.

Generated release artifacts:

- `sapienize.html` is assembled from `src/sapienize_shell.html` and the browser-safe modules listed by `build.py`.
- `sapienize.skill` is a zip archive generated from `skill/sapienize/`.

**Never edit `sapienize.html` or `sapienize.skill` directly.** Change their sources and run `npm run build`. Commit regenerated artifacts when the release files are expected to change.

The tell library currently has two maintained representations: executable entries in `src/engine.js` and their human/host counterparts in `skill/sapienize/references/tells.md`. Keep executable labels, severities, and interpretations aligned. Reference-only advice must be explicitly marked `Manual/context-only`. Severity is review priority inside the legacy heuristic, not confidence of AI authorship.

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
8. Detector observations and provenance signals must never enter rewrite prompts, convergence criteria, or candidate ranking.
9. Do not add detector-evasion logic, named-detector optimization, watermark inference from prose, or watermark-removal features.
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

Every candidate must be verified against the original. Critical protected-content changes make a candidate ineligible. Among eligible candidates, rank semantic integrity first, then voice similarity, then the uncalibrated style heuristic. External detector and provenance results are excluded. Automated semantic checks are heuristic, so expose differences for human review.

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

External detector adapters are measurement integrations, not rewrite integrations. Each normalized observation must retain:

- detector name;
- detector/model version when known;
- observation timestamp;
- raw result;
- normalized fields with documented meaning;
- calibration status and limitations.

Credentials and legitimate API access are supplied by the user/environment. Unit tests use mocks. Do not call paid services in the default test or evaluation suite.

Evaluation records must conform to `eval/schema.js`. Keep runs reproducible, include seed/configuration and a dataset fingerprint, and report unavailable metrics as unavailable rather than zero. Calibration error is valid only for values explicitly declared calibrated. Report per-domain, per-model, and document-length slices when the data supports them. Never commit private author data.

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
