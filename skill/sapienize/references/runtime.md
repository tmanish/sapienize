# Runtime commands

The generated skill includes the shared source modules, CLI and license. Scripts require Node 20.19+. Run commands from the installed skill directory or use absolute script paths. Inputs/outputs belong in the user's working directory. Do not assume a global `sapienize` executable or install npm packages.

## Local operations

```bash
node scripts/sapienize.cjs scan /working/draft.txt
node scripts/sapienize.cjs profile /working/samples/ --output /working/profile.json
node scripts/sapienize.cjs verify /working/original.txt /working/candidate.txt
node scripts/check.cjs /working/request.json
```

`scan` reports configured stylistic signals and an uncalibrated style heuristic; local AI-detection probability remains unavailable. `verify` checks semantics without a voice profile. Use `check.cjs` to combine voice, semantic and ranking checks for Claude-native candidate files. These commands make no network calls.

### Rewrite check request

```json
{
  "mode": "rewrite",
  "originalPath": "original.txt",
  "samplePaths": ["samples/first.txt", "samples/second.txt"],
  "candidatePaths": ["candidate-1.txt", "candidate-2.txt"]
}
```

All paths resolve relative to the request JSON file, not the current directory. Supply one to three `candidatePaths`. Use either a nonempty `samplePaths` array or `"profilePath": "profile.json"`, never both. Unknown request keys are rejected; this helper has no provider or detector configuration.

The helper returns full candidate measurements, semantic-first ranking, `selectedPath`, the original voice score, target status and `sampleWarnings`. `origin` explicitly identifies host-authored candidates measured locally. `networkCalls` is zero. A named file is not proof of generation completeness: reject a visibly cut-off host draft before measuring it.

### Generation check request

```json
{
  "mode": "generation",
  "sourceFactsPath": "facts.txt",
  "contentMode": "fiction",
  "samplePaths": ["samples/first.txt"],
  "candidatePaths": ["scene-1.txt", "scene-2.txt"]
}
```

Default `contentMode` is `factual`; fiction requires user authorization. `sourceFactsPath` is optional; without it, grounding is unverified. Do not supply `originalPath` for generation or `sourceFactsPath` for rewriting. Generation checks supplied anchors and separately records new fictional material; it does not demand equivalence to a short fact list. All eligible generation outputs remain review-required.

`check.cjs` exit codes:

- **0:** eligible rewrite, semantic checks pass, descriptive voice target met. Still reread it.
- **1:** missing runtime, bad request or unreadable/invalid input. No useful result produced.
- **3:** no eligible candidate; report protected-content failures instead of silently delivering the selected file as approved.
- **4:** usable measurements and a draft requiring review, including all generation and below-target rewrites. Read stdout JSON; do not retry solely because the exit code is nonzero.

Redirect stdout to a report file if useful. Do not use `&&` chaining that discards review results just because the first command exits 4.

## Explicit external writing

Prefer native host writing unless the user selects an external provider. With available credentials and network access:

```bash
node scripts/sapienize.cjs rewrite /working/draft.txt --samples /working/samples/ --provider openrouter --model vendor/exact-model-id
node scripts/sapienize.cjs generate /working/brief.txt --samples /working/samples/ --facts /working/facts.txt --words 400 --content-mode fiction --voice-passes 2 --provider openrouter --model vendor/exact-model-id
```

Replace `vendor/exact-model-id` with an available, explicitly selected model. The CLI also supports `anthropic` and `openai`. Credentials come from `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` respectively, configured outside chat. Use `--voice /working/profile.json` instead of `--samples` for profile-only guidance.

Raw sample guidance is capped at three excerpts and 8,000 characters total. The runtime preserves facts/quotations, feeds back voice differences, retains the best eligible candidate and reports `voiceRefinement`. Default rewriting permits three attempts and targets descriptive similarity 80; this is not calibrated authenticity. BYOK calls include reasoning headroom, while the browser's Claude-artifact keyless path retains its 1,000-token cap. That keyless artifact transport is not a credential-free CLI transport. Never silently rerun billable calls on truncation, failure or exit 4.

The CLI exits 0 for success, 1 for operational/data errors, 2 for usage errors, 3 for failed `verify`, and 4 for review-required writing/verification. Always inspect its structured JSON. In particular, CLI `generate` returns 4 even when generation completed successfully.

## Requested external detection

```bash
node scripts/sapienize.cjs detect /working/draft.txt
```

Requires `GPTZERO_API_KEY` and reachable service access. It sends the text to GPTZero. A Claude subscription or writing-provider key does not supply that detector credential. No key or blocked network means unavailable, never a fabricated score. Preserve all three class probabilities and vendor/version/date metadata. Do not expose credentials in logs or shell arguments.

For explicitly requested experimental detector-aware refinement, add `--detector-passes 2` to a provider-backed write. That budget includes the baseline: at most two GPTZero measurements and one extra writing call. Same-version, semantic and voice-loss gates apply; retain failures/rejected candidates. These observations cannot establish results on untested institutional detectors. Copyleaks/Originality study adapters are not exposed by this skill CLI.

## Governed evaluation

```bash
node scripts/sapienize.cjs audit /working/dataset.jsonl --manifest /working/manifest.json
node scripts/sapienize.cjs eval /working/dataset.jsonl --manifest /working/manifest.json --split test
```

Supply the complete dataset: governance and duplicate checks precede frozen-split selection. Non-synthetic corpora require declared provenance/rights and a valid manifest. Cross-split duplicates block evaluation; same-split matches require review. Synthetic fixtures verify plumbing only. Keep private writing, manifests, detector responses and credentials out of version control and the installed skill directory. The shared runtime reports missing metrics as unavailable, not zero.
