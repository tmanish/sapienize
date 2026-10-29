# Detector effectiveness study

This workflow measures changes in detector responses to real API-generated text. It does not yet demonstrate reliable detector avoidance. The public-domain pilot tests the measurement workflow; a representative modern corpus and human review are required before reliability claims about universities or workplaces.

“Independent” here means that Copyleaks and Originality.ai are held out from refinement. This is an internally conducted study, not an independent third-party certification. GPTZero is the feedback detector and cannot serve as independent evidence of transfer. These integrations do not establish results for Turnitin or other untested services.

## What is prepared

- `eval/study/pilot.json`: six fixed briefs, three model configurations, two target lengths (350 and 700 words), two repetitions: **72 originals**.
- Three paired arms: untouched original, sample-guided voice rewrite, and the **same voice draft** with up to one additional GPTZero-guided revision. Each feedback stage permits at most two detector calls, including its baseline.
- Three judges: GPTZero, Copyleaks, and Originality.ai. All candidates are sealed before any held-out judge is called. Held-out results never enter provider prompts or candidate selection.
- Fifteen authentic historical excerpts have been prepared locally: three reference samples and twelve human controls. Reference authors are Franklin, Darwin and Shelley; control authors are Mill, Faraday and Burnett. Authors and source books do not cross the frozen reference/control splits.
- Source URLs, licensing notes, edition hashes, excerpt boundaries, lineage and dataset fingerprints are retained under ignored `eval/.local/effectiveness/`. The preparer is `eval/study/prepare-public-domain.js`; it consumes the six original Gutenberg files already downloaded into `books/` and refuses to overwrite the prepared corpus.
- Governance validation and lexical near-duplicate checks run before freeze. Candidate sealing also audits references against outputs and retains within-arm/between-arm matches. Expected similarity between paired drafts is reported, not silently deleted. Reference overlap requires review. This lexical audit cannot exclude training-set contamination or semantic copying.

The historical domains are labeled `historical_prose`, `scientific_exposition` and `fiction`. Whole paragraphs are retained, so human controls have varying actual lengths. Do not treat these as a balanced modern workplace/academic benchmark. Public-domain books may also have appeared in model training.

## Credentials and model choices

Fill the blank, ignored file `eval/.local/effectiveness/credentials.env` locally. Do not paste credentials into chat. The committed template is `eval/study/credentials.env.example`.

| Environment variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Original generation and rewriting with an OpenAI model |
| `ANTHROPIC_API_KEY` | Original generation and rewriting with a Claude model |
| `OPENROUTER_API_KEY` | A third model family through OpenRouter, such as Gemini |
| `GPTZERO_API_KEY` | Feedback measurements and final GPTZero observations |
| `COPYLEAKS_API_KEY` and `COPYLEAKS_EMAIL` | Authenticate and run the held-out Copyleaks AI detector |
| `ORIGINALITY_API_KEY` | Run the held-out Originality.ai AI detector |

These must have API access and available credits. Web subscriptions alone do not configure the runner. Copyleaks requires its account email to exchange the API key for a temporary bearer token. Use a normal OpenRouter inference key, not a management key.

Also set `STUDY_OPENAI_MODEL`, `STUDY_ANTHROPIC_MODEL`, and `STUDY_OPENROUTER_MODEL` to explicit account-supported model IDs. Select three different model families. Prefer dated snapshots when available; record requested IDs and returned model metadata. No “latest” alias is silently chosen. The existing writing adapters use their supported messages/chat-completions contracts; the smoke run must establish compatibility with the selected models.

Official references checked during implementation: [OpenAI authentication](https://developers.openai.com/api/reference/overview), [GPTZero quickstart](https://docs.gptzero.me/quickstart/), [Copyleaks authentication](https://docs.copyleaks.com/get-started/quickstart/), [Copyleaks detection API](https://docs.copyleaks.com/reference/actions/writer-detector/check), [Copyleaks response meanings](https://docs.copyleaks.com/reference/data-types/ai-detector/ai-text-detector-response), [Originality.ai API documentation](https://docs.originality.ai/api-v2-), and [OpenRouter key setup](https://openrouter.ai/agents). Vendor schemas are checked against documentation and mocked in tests; successful live integration has not yet been established.

## Run sequence

### Using one OpenRouter key for all writing models

Use `eval/study/smoke-openrouter.json` and `eval/study/pilot-openrouter.json` instead of the default configurations. Both route all three writing-model families through `OPENROUTER_API_KEY`; direct OpenAI and Anthropic keys are unnecessary. Set all three `STUDY_*_MODEL` values to explicit OpenRouter catalog slugs, including their vendor prefixes. The variable names still distinguish the three model families. OpenRouter documents its shared endpoint and model selection in the [quickstart](https://openrouter.ai/docs/quickstart).

For example, run the network-free check with:

```bash
node --env-file=eval/.local/effectiveness/credentials.env eval/study/run.js plan eval/study/smoke-openrouter.json
```

Then substitute `smoke-openrouter.json` or `pilot-openrouter.json` in the corresponding `freeze` command below, using a fresh run directory. Detector credentials are still required for the full study: GPTZero for refinement, and Copyleaks and Originality.ai for held-out measurements. With only an OpenRouter key, the existing app/CLI can test generation, rewriting, descriptive voice similarity and semantic checks; it cannot produce external detector scores or validate detector avoidance. The full study runner deliberately requires GPTZero before production so its refined arm is actually measured.

### Smoke and pilot commands

Run from the repository root with Node 20.19 or later. These commands keep keys out of command arguments and outputs. `plan` and `freeze` make no network calls. Set provider account spending limits before live work; call ceilings are not dollar caps.

```bash
node --env-file=eval/.local/effectiveness/credentials.env eval/study/run.js plan eval/study/smoke.json
node --env-file=eval/.local/effectiveness/credentials.env eval/study/run.js freeze eval/study/smoke.json eval/.local/effectiveness/smoke-001
node --env-file=eval/.local/effectiveness/credentials.env eval/study/run.js produce eval/.local/effectiveness/smoke-001 --live
node --env-file=eval/.local/effectiveness/credentials.env eval/study/run.js judge eval/.local/effectiveness/smoke-001 --live
```

Inspect `smoke-001/report.json` and the sanitized raw responses. The smoke is three originals from one brief: up to 9 writing calls, 6 feedback calls and 63 judging calls including the twelve human controls. It tests transport/schema compatibility, not effectiveness. If schemas or model configuration need repair, do that before freezing a new run. Do not use smoke detector results to tune prompts or thresholds for a claimed untouched pilot.

After smoke compatibility is confirmed, use the full configuration in a new directory:

```bash
node --env-file=eval/.local/effectiveness/credentials.env eval/study/run.js plan eval/study/pilot.json
node --env-file=eval/.local/effectiveness/credentials.env eval/study/run.js freeze eval/study/pilot.json eval/.local/effectiveness/pilot-001
node --env-file=eval/.local/effectiveness/credentials.env eval/study/run.js produce eval/.local/effectiveness/pilot-001 --live
node --env-file=eval/.local/effectiveness/credentials.env eval/study/run.js judge eval/.local/effectiveness/pilot-001 --live
node eval/study/run.js report eval/.local/effectiveness/pilot-001
```

Full pilot ceiling: **216 writing calls, 144 feedback calls, 684 judging calls** (648 candidate calls plus 36 human-control calls), excluding authentication. Fewer revisions may be needed. Paid calls are opt-in and never part of `npm test` or the default evaluator.

The frozen run stores configuration, exact model choices, reference profiles, corpus and manifest snapshots, seed, and source fingerprint. The seed controls order and bootstrap sampling, not stochastic provider outputs. Source/configuration changes invalidate the run. The implementation fingerprint covers JavaScript/JSON under `src/` and `eval/`, excluding hidden local data directories; preserve the full checkout alongside a run for archival reproducibility.

Calls are marked in flight before submission. Existing job/observation files are not silently retried, including failures, so resuming does not blindly resubmit a possibly billed request. A crash with an in-flight generation job requires account-log review and a new run; do not delete the marker to force retries. Failed calls remain visible and count against the planned denominator. Re-running `judge` processes only missing observation files. It does not rescan completed or failed observations.

## Measures and interpretation

The report includes original → voice, original → refined, and voice → refined comparisons. The last comparison isolates the incremental effect of detector feedback. Each detector retains its own raw response, observation date, reported version and normalized scale:

| Detector | Scoring rule frozen for this pilot |
| --- | --- |
| GPTZero | Vendor `human` class passes; `mixed` and `ai` do not. Score changes use its AI-class probability, while refinement targets its human-class probability. |
| Copyleaks | `summary.ai` is the share of words classified AI. A share below 0.05 passes the **study-defined** threshold. |
| Originality.ai | V3 `results.ai.ai_assisted_percent / 100` below 0.05 passes the **study-defined** threshold. Model 5.0 is requested; vendor label is retained separately. |

The 5% thresholds are preregistered research choices, not claims about institutional settings or vendor-recommended decision rules. Copyleaks runs with `sandbox: false` and sensitivity 2. Originality requests only AI detection, with other billable checks and scan storage disabled. Unknown response schemas fail closed. Vendor model labels may still conceal deployment changes.

Scores are never averaged across vendors. Paired comparisons exclude unknown or differing detector versions and report that exclusion. Outputs include paired score changes, flag rates, flips among initially flagged originals, human-control false-positive rates, model/domain/length/version slices, and joint passage of both held-out judges. Inspect version slices if a vendor changes versions during a run.

Automatic qualification requires complete output, no detected critical source/meaning change, descriptive voice similarity no more than three points below the original, and length within 20% of target. These gates are heuristic. `conservativeQualifiedSuccessRate` uses all planned originals as its denominator once any valid pair exists; missing/failed cases contribute no success. With no valid measurements the rate is `null`, not zero. Conditional flip rates apply only to measured, initially flagged pairs and must not be reported as overall success.

Bootstrap 95% intervals cluster by brief (2,000 resamples), keeping repetitions, model outputs and lengths from the same brief together. With fewer than two brief clusters, intervals are unavailable. The pilot has only six brief clusters: intervals are exploratory, not a sufficient basis for a reliability guarantee. Human-control false-positive rates are descriptive; twelve excerpts from three control authors are not twelve independent author samples.

`blind-review.json` contains source facts, original/candidate text, reference samples and blank ratings, without model, arm or detector labels. Keep `blind-review-key.json` away from reviewers. Original text can reveal an unchanged arm, so blinding is limited. Use at least two raters to assess meaning, unsupported additions, voice and readability, then adjudicate disagreements. Ratings are a separate review artifact; the runner does not yet aggregate them. `manualQualityValidatedRate` remains unavailable rather than manufacturing a quality-adjusted result.

## Before reliability claims

Use the pilot to find integration failures and estimate the sample size needed for a separately frozen modern study. Collect licensed or explicitly contributed modern writing across intended genres and language varieties; split by author/document lineage, preserve untouched human controls, and repeat near-duplicate checks. Freeze hypotheses, detector thresholds, minimum acceptable success rate and precision target before observing held-out results. Expand the number of independent briefs/authors, not just repetitions of six briefs.

Any improvement made after inspecting held-out results consumes that evaluation set: create a fresh held-out study. Require blinded human quality validation, report every failure and false positive, and repeat measurements across dates/model updates before making time-stable claims. Results apply only to the actual tested models, detector versions, settings, corpus and date. No pilot result can establish universal detector avoidance.
