# Sapienize v2 implementation plan

Baseline: v1 at `b39dd51` builds reproducibly and passes all 71 existing assertions.

1. Preserve `src/engine.js` as a compatibility facade while classifying its numeric result as an uncalibrated style heuristic.
2. Introduce browser-safe, dependency-free modules for stylistic signals, detector estimates, voice profiles, semantic verification, provenance, providers, prompts, and candidate ranking.
3. Expose one provider-neutral core API and route the existing standalone browser UI through it without changing the product's visual design or local-analysis behavior.
4. Add external-detector observations, surrogate research hooks, a reproducible evaluation subsystem, and a CLI. Keep detector and provenance results outside rewrite objectives.
5. Package the Claude skill as a thin workflow adapter, document a future MCP surface, and rebuild both generated artifacts exclusively from their sources.
6. Add fixture, unit, browser, CLI, evaluation, Unicode, length, malformed-input, and artifact tests; run the full suite and build after each coherent slice.

Rewrite ranking gates candidates on protected facts and semantic integrity, then considers voice similarity, then the style heuristic. It never considers external detector or watermark results.
