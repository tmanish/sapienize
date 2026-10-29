# Claude skill validation — 2026-10-29

## Result and scope

The Claude skill is packaged with the shared scoring runtime and tested after extraction into a temporary directory outside the repository. It is suitable for an experimental release. A live Claude-host upload, actual host instruction-following and detector effectiveness remain unverified.

Source: `skill/sapienize/`. Release: `sapienize.skill`, a ZIP with one `sapienize/` folder containing `SKILL.md`, references, executable helpers and `runtime/`. `skill/runtime-files.json` explicitly selects the runtime sources; the build copies them without maintaining a separate implementation. The package excludes local data, credentials, dependencies and study outputs.

## What changed

- Claude-native drafting is the default. Claude writes candidate files and invokes the bundled `scripts/check.cjs` to measure voice and semantics locally, without a writing-provider API key or repository checkout. This requires code execution and Node 20.19+; numeric measurements are unavailable without them.
- The helper compares up to three candidates using shared semantic-first ranking, reports original/selected descriptive voice scores, and blocks critical protected-content changes. Below-target rewrites and all generation remain review-required. A file alone cannot establish whether the host truncated its output; the instructions require a completion check.
- Source facts and permitted fictional additions are handled separately. Sentence restructuring and narrowly supported name/pronoun replacements use the same checks as the app. No separate relaxed fact checker was added to the skill.
- External provider writing and GPTZero detection are explicit paths through the bundled CLI. Missing access is reported rather than replaced by invented scores. GPTZero human, AI-only and mixed probabilities remain distinct. Experimental detector-aware refinement requires explicit authorization and does not establish institutional-detector effectiveness.
- The instructions use concise workflow guidance with separate command/reference documentation. Installation uses the current [Claude skill upload workflow](https://support.claude.com/en/articles/12512180-use-skills-in-claude); `.skill` may be renamed to `.zip` for the picker. Authoring follows [Anthropic's skill guidance](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices).

## Local validation

| Check | Result and scope |
|---|---|
| Skill frontmatter | `quick_validate.py` passes using an isolated temporary Python environment with PyYAML. |
| Artifact integrity | Exact archive member allowlist, source/archive parity, generated tell tables, fixed metadata and byte-for-byte rebuilds pass `tests/test_artifacts.py`. |
| Independent execution | `tests/test_skill_package.js` extracts the release outside the repository and runs help, scan, profile, local rewrite/generation checks and the real CLI with an injected mock provider. A fetch guard prevents live network calls. |
| Fact protection | Changed numbers are excluded; all-ineligible candidates fail. Authorized fictional additions remain eligible for review. Invalid input and missing detector credentials are covered. |
| Real-example replay | The extracted helper measures the saved public-domain Twain example at **63.74 → 67.38**, with **0 critical semantic differences**. It returns `review_required` because the operational voice target of 80 is unmet. No model or detector calls were made during this replay. |

The replay uses the unchanged text from the prior live OpenRouter run; it is not new Claude-native generation. Local request/results are ignored under `eval/.local/skill-validation-2026-10-29/`. Voice scores describe measured feature similarity, not authentic authorship or a blinded human assessment. The weak Twain result remains a quality limitation.

`npm run build`, the full `npm test` suite, the synthetic evaluator smoke test and `git diff --check` passed after these changes. The full suite includes the package tests alongside core, provider, CLI, browser and evaluation tests. Default regression tests never use paid services. A scan of tracked and non-ignored candidate files found no copy of the configured API key; the archive contained only its 39 allowed members.

## Live acceptance checks still needed

After installation in the intended Claude host, use non-private test material:

1. Confirm the host discovers the skill, resolves its installed script paths and can run Node 20.19+. If code execution is unavailable, confirm it clearly labels numeric scores unavailable.
2. Request a sample-guided rewrite. Confirm the host actually runs the helper, reports its measured scores and preserves facts/quotations. Short samples should produce a warning.
3. Request generation from a brief with authorized fictional dialogue. Confirm it uses source facts when available and returns a reviewable draft without demanding an original document.
4. Request a detector check without credentials; confirm detection is reported unavailable. With legitimately configured access, separately inspect the actual vendor response and all three class probabilities.

These host checks were not executed in this session. Automated package validation and a public-domain replay do not establish production voice quality, calibrated detection accuracy or reliable detector evasion. Independent held-out detector evaluation and a modern corpus are still required before reliability claims.
