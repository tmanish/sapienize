# Document integrity cleaning: technical and execution plan

Status: proposed. Owner: unassigned. Target: `sapienize clean` + `cleanDocumentIntegrity()`.

## 1. Purpose

Sapienize currently *detects* invisible and directional characters and reports them
under `documentIntegrity`. It cannot *remove* them and return a cleaned document.
This plan adds that operation.

Invisible characters break diffs, search, word counts, screen-reader output, CSV and
JSON round-trips, and copy-paste into code. Removing them is formatting hygiene, and
it is the one legitimate, verifiable layer of the "watermark remover" tool class:
those tools strip Unicode artifacts, which is a different mechanism from a
token-sequence text mark.

### Non-goals (binding, per AGENTS.md 7, 8, 9)

- This feature does not remove, detect, weaken, or disprove any provider's text mark.
- It must not set, influence, or be read as a `provenance` status. `unsupported`
  still means unknown, not absent.
- Its output must not enter rewrite prompts, convergence criteria, or candidate ranking.
- No detector-evasion logic, no named-detector optimization, no watermark inference
  from prose.
- Documentation must not imply that a cleaned document is unmarked or human-authored.

## 2. Defect found while scoping

`src/engine.js:155` currently strips U+200C (ZWNJ) and U+200D (ZWJ) unconditionally:

```js
const HIDDEN_RE = /[​‌‍⁠﻿­]/g;
```

Both are load-bearing in real text:

- **ZWJ** joins emoji sequences. Stripping it turns a single family or profession
  emoji into several unrelated glyphs.
- **ZWNJ / ZWJ** are orthographically required in Indic scripts (Devanagari, Bengali,
  Tamil) and in Persian/Urdu, where they control conjunct and joining forms. Stripping
  them changes the rendered word.

Today this only affects the analysis copy, so the damage is limited to counts. The
moment a `clean` operation writes files, it becomes data loss. **The classifier in
section 3 must land before or with the cleaner**, and `analyze` should adopt it too
so detection and cleaning agree.

## 3. Character classification

Cleaning is context-sensitive, not a character blacklist.

### Always remove

| Code point | Name | Rationale |
|---|---|---|
| U+200B | Zero-width space | No layout role in modern text |
| U+2060 | Word joiner | Invisible, non-orthographic |
| U+FEFF | Zero-width no-break space / BOM | Mid-document BOM is an artifact |
| U+00AD | Soft hyphen | Rendering hint, corrupts search |
| U+180E | Mongolian vowel separator | Deprecated as a space |
| U+2028, U+2029 | Line/paragraph separator | Normalize to `\n` |
| U+202A–U+202E, U+2066–U+2069 | Bidi embedding/override/isolate | Spoofing vector; strip unless the document has RTL content (see below) |
| U+E0000–U+E007F | Tag characters | Only legitimate use is subdivision flags (see preserve) |
| U+E000–U+F8FF, U+F0000–U+10FFFD | Private Use Area | No portable meaning |
| U+FE00–U+FE0F | Variation selectors | Remove only when not adjacent to an emoji base (see preserve) |

### Preserve

| Case | Condition |
|---|---|
| U+200D (ZWJ) | Between two emoji or Extended_Pictographic code points |
| U+200C / U+200D | Adjacent to a character whose script is Devanagari, Bengali, Gurmukhi, Gujarati, Oriya, Tamil, Telugu, Kannada, Malayalam, Sinhala, Arabic, Syriac, Thaana, or Mongolian |
| U+0640 and Arabic `Cf` marks | Always — orthographic, not invisible padding |
| U+FE0F | Immediately after an Extended_Pictographic base (emoji presentation) |
| U+E0020–U+E007F | Inside a valid RGI subdivision flag sequence (Black Flag + tag chars + U+E007F) |
| Bidi controls | When the document contains RTL script and the control is balanced (isolate/embedding opened and closed) |

### Normalize, do not delete

| From | To |
|---|---|
| U+00A0, U+2000–U+200A, U+202F, U+205F, U+3000 | U+0020 |
| U+2028, U+2029 | `\n` |

Implementation note: script detection needs a small lookup table of ranges. Do not add
a dependency; a static range table in `src/analysis/` is ~60 lines and keeps the
package dependency-free and browser-safe.

## 4. API

### Core

```js
sapienize.cleanDocumentIntegrity(text, options) -> { text, report, changed }
```

- `text`: cleaned string.
- `report`: conforms to the existing `documentIntegrity` contract in
  `src/core/types.js:236` — `kind`, `status`, `findings`, `invisibleCharacterCount`,
  `countsByCodePoint`, `provenanceInterpretation`. Note the existing invariants:
  findings length must equal `invisibleCharacterCount` (`types.js:679`), a `clean`
  status must carry no findings (`types.js:675`), and every finding must be an
  invisible-character warning (`types.js:663`).
- `changed`: boolean, `true` when `text` differs from input.
- `options.preserveScriptJoiners` (default `true`), `options.normalizeSpaces`
  (default `true`), `options.dryRun` (default `false`).

The report must gain a `preserved` array parallel to `findings`: each entry records a
code point that was detected but intentionally kept, with the reason
(`emoji_sequence`, `script_joiner`, `subdivision_flag`, `balanced_bidi`). Without
this, users cannot tell "none present" from "present and deliberately kept".

`provenanceInterpretation` keeps its current fixed meaning: these characters say
nothing about authorship or model marking.

### CLI

```bash
sapienize clean draft.txt                 # cleaned text to stdout
sapienize clean draft.txt --in-place      # rewrite the file
sapienize clean draft.txt --report json   # report only, no text
sapienize clean draft.txt --dry-run       # report what would change, exit 0
```

Exit codes: `0` clean or cleaned, `1` unreadable input, `2` invalid options. Local
only; no provider call, no network, consistent with `scan`, `profile`, and `verify`.

## 5. Integration points

| File | Change |
|---|---|
| `src/analysis/unicode-classes.js` | New. Range tables, `classifyInvisible(text, index)`. |
| `src/analysis/document-integrity.js` | New or extended. `inspect()` and `clean()` over the classifier. |
| `src/engine.js:155` | Replace `HIDDEN_RE` blanket strip with the classifier so browser analysis matches the CLI. |
| `src/engine.js:285` | Finding detail should distinguish removed from preserved counts. |
| `src/core/index.js` | Export `cleanDocumentIntegrity`. |
| `src/core/types.js` | Add the `preserved` array to the `documentIntegrity` schema and its validator. |
| `src/cli/sapienize.js` | Add the `clean` command and help text. |
| `src/provenance/anthropic-watermark.js` | **Unchanged.** |
| `src/rewrite/*` | **Unchanged.** The cleaner must not touch ranking or prompts. |

## 6. Test matrix

Extend `tests/test_integrity.js`.

Removal:
1. ZWSP between letters removed; surrounding text byte-identical.
2. Mid-document BOM removed; leading BOM removed.
3. Soft hyphen removed from a hyphenation artifact.
4. PUA character removed.
5. Unbalanced RLO removed.
6. NBSP and en-quad normalized to U+0020; count reported as normalization, not removal.

Preservation (each must fail loudly if the classifier regresses):
7. Family emoji with ZWJ survives byte-identical.
8. Profession emoji (base + ZWJ + object + FE0F) survives.
9. Devanagari conjunct with ZWNJ survives.
10. Persian word with ZWNJ survives.
11. Scottish subdivision flag (tag sequence) survives.
12. Balanced bidi isolates around RTL text survive.

Contract:
13. `findings.length === invisibleCharacterCount`.
14. `status === "clean"` implies zero findings.
15. `countsByCodePoint` totals `invisibleCharacterCount`.
16. `preserved` entries never appear in `findings`.
17. Cleaning is idempotent: `clean(clean(x).text).changed === false`.
18. `dryRun: true` never mutates and reports the same counts as a real run.

Cross-surface:
19. Browser `analyze()` and CLI `clean --dry-run` report identical counts for the
    same input, proving `engine.js` and the core classifier agree.

Guardrails:
20. Cleaning does not alter any `provenance` result: `checkProvenance` returns
    `unsupported` before and after.
21. No rewrite-path module imports the cleaner (assert on the dependency graph or by
    grep in the test).

## 7. Execution plan

**Phase 1 — classifier (no behavior change).** Add `unicode-classes.js` plus tests
7–12 against the classifier directly. Nothing consumes it yet. Ships safely.

**Phase 2 — adopt in analysis.** Route `engine.js` and document-integrity inspection
through the classifier. Fixes the ZWJ/ZWNJ defect in section 2. Counts change for
emoji and Indic text, so update any fixture expectations. Add test 19.

**Phase 3 — cleaner core.** Implement `cleanDocumentIntegrity`, extend the
`documentIntegrity` schema with `preserved`, add tests 1–6 and 13–18.

**Phase 4 — CLI.** Add `clean` with `--in-place`, `--report`, `--dry-run`. `--in-place`
writes atomically: temp file in the same directory, then rename. Never partial-write a
user's document.

**Phase 5 — docs.** README row under "What the results mean"; a note in
`docs/product-path.md`; and an explicit line in both the CLI help and the README:

> Removing invisible characters does not remove, detect, or disprove any model
> provider's text mark, and says nothing about who wrote the text.

**Phase 6 — browser surface (optional).** A "Clean invisible characters" action in
the app that shows the before/after count and the preserved list. Purely local.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Data loss in non-Latin scripts | Phase 1 lands the classifier and its tests before anything writes files. |
| Users read "clean" as "unmarked" | Fixed disclaimer in CLI help, README, and report payload; `preserved`/`removed` split makes the operation legible. |
| Scope creep toward evasion | AGENTS.md 9 stands; test 21 enforces that no rewrite module imports the cleaner. |
| Unicode tables drift | Pin the Unicode version in a comment; revisit when emoji sequence data updates. |
