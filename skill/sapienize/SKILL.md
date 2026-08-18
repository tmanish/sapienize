---
name: sapienize
description: Analyze explainable stylistic signals, compare prose with an authentic writing sample, and restore the author's voice while preserving meaning. Use when a user asks to sapienize, humanize, naturalize, de-AI, or make prose sound like them; asks why text sounds generic or model-associated; says an AI detector flagged it; or wants a semantic-first voice pass on pasted text or a document. Report the legacy style heuristic only as uncalibrated and non-probabilistic. Never promise a detector outcome.
---

# Sapienize host adapter

Use Sapienize's shared concepts and, when available in the host environment, its provider-neutral core or CLI. This skill is a thin Claude-host workflow, not a second detector or an independent scoring implementation.

The goal is voice restoration in this order: preserve meaning and protected facts, match an authentic voice, then reduce generic/model-associated patterns where those edits do not conflict with the first two priorities.

Do not optimize for a named detector, treat the style heuristic as authorship probability, infer a watermark from wording or invisible characters, remove provenance signals, or claim that a rewrite will receive a particular detector result.

## 1. Establish the request

Collect:

1. **Original text.** Required. It may be pasted prose or a file/artifact.
2. **Authentic voice sample.** Optional but preferred. Recommend at least 300 words written by the user without AI rewriting. Accept less when that is all they have, but warn that measured habits may be unstable.
3. **Persona.** Optional and only when requested. It may guide register, diction, and spelling convention. It must not supply biography, credentials, anecdotes, facts, or opinions. An authentic `VoiceProfile` wins on conflict.
4. **Scope constraints.** Record protected quotations, formatting, terminology, word-count requirements, and passages that must remain unchanged.

If the user requests analysis only, stop after reporting it. If no voice source is supplied, perform a conservative clarity pass rather than pretending to know the user's personal voice.

## 2. Use the shared analysis model

Prefer the shared core/CLI when it is available:

```bash
sapienize scan draft.txt
sapienize profile samples/
sapienize verify original.txt rewrite.txt
```

If it is unavailable, use `references/tells.md` as contextual review guidance and preserve the same result boundaries. Never invent unavailable metrics.

Report each applicable concept separately:

- **Stylistic signals:** configured phrases, structures, punctuation habits, and rhythm observations. They are explainability findings, not proof of model generation.
- **Style heuristic:** the backward-compatible 0–100 number, if the shared engine produced one. Call it an uncalibrated style heuristic; higher means fewer configured signals. Do not call it a human score, probability, detector estimate, or confidence.
- **Local detector estimate:** report `unavailable` unless an evaluated detector actually supplied it.
- **External detector observations:** include only results the user legitimately supplied or explicitly requested through a configured adapter. Preserve detector name, version when known, date, raw result, and normalized interpretation. Do not compare vendor percentages as if they share a scale.
- **Voice similarity:** use only with a `VoiceProfile`; describe aggregate and component differences, never identity or authorship probability.
- **Semantic integrity:** requires an original and candidate. It is not applicable to a one-text scan.
- **Provenance:** use only explicit supported verifier evidence. `unsupported` means unknown, not absent.
- **Document integrity:** report invisible/directional formatting separately. It is not watermark evidence.

For a compact analysis deliverable, show the most material stylistic findings with category, count, excerpt, and contextual revision option. Note authentic/domain-appropriate usages that should remain.

## 3. Create and interpret the VoiceProfile

When an authentic sample is available, use `createVoiceProfile(samples)` or `sapienize profile`. Let the measured profile guide sentence lengths, fragments, paragraph shape, lexical diversity, contractions, punctuation, parentheticals, questions, pronouns, function words, conjunctions, transitions, hedging, intensifiers, discourse markers, spelling, register, openings, vocabulary, and cadence.

The profile is descriptive. Do not force generic rules such as zero em dashes, mandatory contractions, a short sentence quota, American spelling, or a target burstiness. If the author's sample frequently uses em dashes, semicolons, formal expansions, long sentences, or fragments, those may be valid voice features.

Do not borrow sentences, private facts, or distinctive content from the sample. Borrow measured habits only.

## 4. Rewrite through the shared workflow

When the provider-neutral rewrite operation is available, call it with the original, `VoiceProfile`, stylistic findings, semantic constraints, and requested persona. Otherwise apply the same prompt priorities in the current Claude host.

Rules:

1. Preserve every fact, claim, number, date, name, URL, and quotation. Add no claim, example, credential, anecdote, opinion, or first-person experience.
2. Preserve the intended strength, uncertainty, negation, conditions, and scope of each claim.
3. Match the authentic profile where the evidence is reliable. Prefer sample-derived habits over persona assumptions.
4. Review configured stylistic signals in context. Revise only when the change improves the requested voice without damaging meaning.
5. Keep quotations exact unless the user explicitly authorizes editing them.
6. Honor required length and formatting, but never trade factual fidelity for a score.
7. Do not use external detector or provenance observations in the prompt, objective, pass/fail criteria, or candidate ranking.

For files and artifacts, edit human-readable prose in place. Preserve code logic, markup structure, tags, attributes, links, front matter keys, and data unless the user explicitly expands scope.

## 5. Verify before delivery

Run the shared verification operation when available:

```bash
sapienize verify original.txt rewrite.txt
```

Check at minimum:

- numbers, dates, URLs, names, and quotations;
- obvious added or removed claims;
- changes to negation, qualification, certainty, or modality;
- major lexical/semantic divergence;
- voice similarity when a profile exists;
- stylistic findings as a tertiary review layer.

Treat protected-content changes as blockers. Fix them or surface them clearly; do not silently accept them. Rank eligible candidates lexicographically: semantic status and integrity first, then voice similarity, then fewer unwanted configured signals. Detector and provenance scores are never ranking inputs.

Automated checks can miss subtle changes. Reread the original and rewrite side by side, especially for legal, medical, financial, scientific, or policy-sensitive prose.

## 6. Deliver

Return:

1. the restored draft or updated file;
2. a concise summary of meaningful voice/style changes;
3. semantic-integrity warnings or protected differences requiring review;
4. the voice-sample warning when fewer than 300 authentic words were used;
5. residual stylistic findings intentionally kept because they match the author, domain, quotation, or meaning.

Use careful language: the result may better match the supplied voice and trigger fewer configured signals, but it is not certified human-authored and has no promised detector outcome. The author's own review is the acceptance test.
