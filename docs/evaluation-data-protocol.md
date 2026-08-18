# Sapienize evaluation-data protocol

This document defines the minimum governance, lineage, split, coverage, and reporting requirements for data used to evaluate Sapienize. The keywords **must**, **must not**, **should**, and **may** are normative.

The protocol serves two separate evaluation goals:

1. measure detector behavior as a versioned external observation; and
2. measure whether voice-restored text preserves the source while moving toward an authentic `VoiceProfile`.

Detector observations, provenance results, and watermark results must not enter rewrite prompts, candidate ranking, convergence criteria, or candidate selection. Evaluation measures product behavior; it is not a detector-evasion objective.

## Dataset manifest and rights

Every evaluation dataset must have a versioned manifest that binds governance metadata to an exact set of records. A releaseable manifest must contain:

- a schema version and stable dataset identifier;
- a dataset version, description, record count, and SHA-256 fingerprint;
- the source ledger and per-record source reference;
- the frozen split policy and complete split assignments; and
- enough metadata to reproduce supported coverage slices.

Each source entry must document:

- the license identifier, scope, and source URL when applicable;
- the consent status and a concise basis for that status;
- the collection method and collection description;
- the privacy classification, whether personal data is present, and required handling; and
- an explicit list of permitted uses that includes evaluation, plus separate redistribution, attribution, and withdrawal handling. Detector training requires its own affirmative permission and is never implied by evaluation permission.

Licensing and consent are different. Public availability does not by itself grant permission to redistribute or train on text. A manifest may represent an unknown status while work is in progress, but records with unknown, contradictory, or insufficient rights must not enter a released benchmark, a trained detector, or a public performance claim.

The dataset fingerprint must cover the canonical dataset records; the separately computed manifest fingerprint covers governance annotations and split assignments as well. Changing record text, metadata, membership, governance, or split assignment requires a new dataset version and updated applicable fingerprint. Source attribution and withdrawal instructions must remain traceable without publishing personal contact details.

## Records, lineage, and edit history

The existing record fields and source types remain backward-compatible. The manifest supplies the richer history needed for reliable evaluation instead of forcing a multi-stage document into one label.

Every manifest record must identify its source, domain, language, and ordered lineage. When applicable, it must also carry pseudonymous grouping identifiers for the author, originating document or lineage, prompt family, model, and voice profile. Group identifiers must not contain names, email addresses, paths, or other direct identifiers.

Each lineage stage must record:

- its sequence;
- the actor type, such as human, model, tool, or mixed;
- the operation, such as drafting, generation, grammar correction, human editing, mixing, or voice restoration; and
- a description sufficient to distinguish the degree and purpose of the change.

An AI generation stage must retain the provider, model, and version or snapshot. Collection date, prompt-template identifier, decoding configuration, and tool version should be retained when legitimately available. Missing model details must be reported as unknown rather than guessed.

The representative benchmark must distinguish at least these paths:

- genuine human writing;
- direct AI output;
- human writing grammar-corrected or lightly polished with AI;
- AI output subsequently edited by a human;
- mixed human and AI documents;
- output restored against an authentic author profile; and
- persona-guided output without an authentic author profile.

Authentic-profile restoration and persona guidance are different conditions. A persona must never be recorded as evidence of a real author or authentic voice.

## Frozen, leakage-safe splits

Every benchmark split policy must be frozen and must assign each record exactly once. Split names are implementation-defined, but their purposes must distinguish data used for development, threshold or calibration work, and final evaluation.

At minimum, split validation must enforce these rules:

- all records from one author group stay in one partition;
- all outputs from one held-out model group stay in one partition;
- an originating document and every derivative in its lineage stay together;
- prompt families and source-document families do not cross partitions when they could create leakage;
- exact normalized duplicates do not cross partitions; and
- a documented near-duplicate audit is completed before a benchmark is frozen.

Author-held-out and model-held-out questions may require separate named split protocols. Each protocol must publish its grouping keys and frozen assignments. Voice-profile reference samples may be from the same evaluation author, but they must be distinct from the target document and its derivatives; that author must remain absent from training and development partitions in an author-held-out evaluation.

Thresholds, calibration artifacts, feature selection, and prompt or rule changes must be fitted on training or development data only. Final evaluation data must not be used to select a threshold, tune a detector, choose a rewrite, or decide which results to publish. Revising a frozen assignment creates a new dataset version.

## Benchmark coverage

The manifest must declare the intended coverage matrix and the observed counts. Coverage must be reviewed across:

- source and transformation path;
- domain and genre or register;
- document length, including long documents;
- language and locale;
- author groups; and
- provider, model, and model version for AI-involved records.

No author, source collection, model, or prompt family should dominate a reported result. Every published classification slice must contain the required ground-truth classes and meet a preregistered minimum sample size. A slice that lacks sufficient support must be reported as unavailable, not silently pooled or shown as zero.

Language scope must be explicit. If the benchmark covers only English, results must not imply multilingual support. Length buckets may remain compatible with the evaluator defaults, but the benchmark should add a declared very-long-document slice when testing scalable semantic and voice matching.

### Public synthetic fixture

`eval/fixtures/public-synthetic.jsonl` is **plumbing-only**. Its purpose is to test parsing, fingerprinting, source-type handling, unavailable metrics, grouping, and deterministic report generation. It is not representative data and must never be cited as evidence of detector accuracy, calibration, voice fidelity, semantic performance, or product effectiveness.

## Private-local handling

`eval/.local/` is the designated ignored location for:

- private voice samples and profiles;
- consent records and withdrawal material;
- restricted datasets and prompts;
- raw external-detector responses; and
- local evaluation reports and run artifacts.

These materials must not be committed, added to public fixtures, embedded in generated release artifacts, or copied into tests. Private record identifiers must be pseudonymous. Default reports must not emit source text, authentic samples, personal identifiers, or local filesystem paths.

External-detector raw responses may echo submitted text. They must therefore inherit the source record's privacy handling and remain under `eval/.local/` unless an explicit redistribution review permits otherwise. Retention, deletion, and consent withdrawal must be applied to source text, derivatives, profiles, cached observations, and reports together.

## Evaluator requirements

The evaluator should evolve without weakening its current strict validation, deterministic canonical ordering, seeded execution, JSON-safe observation handling, or honest unavailable states. Benchmark-capable evaluation must:

- validate the manifest, records, source references, count, fingerprint, and split assignments together;
- reject author, model, lineage, source-family, exact-duplicate, and known near-duplicate leakage;
- record the dataset and manifest fingerprints, split protocol, evaluator version, seed, threshold provenance, calibration provenance, and run configuration;
- use an explicit ground-truth policy rather than assuming that every kind of AI participation has identical semantics;
- report coverage and supported slices by source path, domain, model version, document length, and language;
- report sample counts and uncertainty alongside aggregate metrics;
- compute calibration metrics only from values explicitly declared calibrated; and
- preserve unavailable or unsupported results as unavailable or unsupported.

Detector observations must retain the detector name, version when known, observation date, raw response, normalized provider-specific meaning, threshold provenance, calibration status, and limitations. Different detector versions or incompatible score meanings must be evaluated separately. Default tests and evaluation runs must not make paid or live detector calls.

Voice-restoration evaluation must be paired with its source and, when used, its authentic profile. It should report protected-content failures, semantic-integrity differences, aggregate and component voice differences, genre or register limitations, and long-document behavior. Detector observations may be reported for the same frozen outputs, but must remain separate from voice and semantic objectives.

## Claim gates

No detector accuracy, calibration, cross-detector equivalence, voice-restoration quality, or supported-domain claim may ship unless all of the following are true:

1. the data is legally usable for the claimed purpose;
2. the manifest and frozen split protocol validate;
3. the result comes from untouched held-out data with documented leakage checks;
4. sample counts, uncertainty, false-positive behavior, limitations, and supported slices are reported;
5. detector identity, version, score semantics, threshold, and observation date are retained; and
6. the run is reproducible from its fingerprints and configuration.

A calibrated local detector may ship only when the training data is permitted for training and held-out results support the stated calibration and domain scope. Unsupported domains must remain unavailable or explicitly limited.

Absence of detector or provenance evidence does not prove human authorship. Watermark or provenance claims require an official supported verifier or explicit signed evidence; they must not be inferred from style, invisible characters, or detector scores. Sapienize must not certify text as watermark-free when verification is unsupported or inconclusive.
