# Proposed Sapienize MCP interface

Status: **follow-up scaffold; no MCP server ships in this release.**

This document maps the provider-neutral Sapienize core to a future Model Context Protocol server. It is a contract proposal, not a claim that the tools are currently registered. The first implementation should be a thin transport adapter over the shared core rather than a second analysis or rewrite engine.

## Design rules

- Keep stylistic signals, the uncalibrated style heuristic, detector observations, voice similarity, semantic integrity, provenance, and document integrity distinct in every response.
- Local scan/profile/compare/verify operations must not make network requests.
- Rewriting may call only the provider explicitly selected by the client. Credentials come from server configuration or a credential reference, never a tool argument that could be logged.
- Official provenance verification and external detector observations may use configured integrations, but their raw and normalized results remain measurement-only.
- Detector and provenance values must never enter rewrite prompts, convergence criteria, or candidate ranking.
- Do not expose watermark-removal, detector-evasion, or named-detector optimization tools.
- Preserve schema versions, explicit `unavailable`/`unsupported` states, warnings, and limitations from the core.

## Tool surface

### `sapienize.scan`

Analyze one text locally.

Input:

```json
{
  "text": "Required text",
  "include_document_integrity": true
}
```

`voice_profile` is optional. Output is the versioned structured analysis result:

```json
{
  "schemaVersion": "2.0.0",
  "stylisticSignals": {
    "kind": "stylistic_signals",
    "heuristicStyleScore": {
      "kind": "uncalibrated_style_heuristic",
      "calibrated": false,
      "isProbability": false
    }
  },
  "detectorEstimate": {
    "kind": "detector_estimate",
    "status": "unavailable",
    "probability": null,
    "calibrated": false,
    "reason": "No calibrated local detector is configured."
  },
  "voiceMatch": {
    "kind": "voice_match",
    "status": "not_applicable",
    "reason": "No VoiceProfile was supplied."
  },
  "semanticIntegrity": {
    "kind": "semantic_integrity",
    "status": "not_applicable",
    "reason": "A scan has no original/candidate pair."
  },
  "provenance": {
    "kind": "provenance_report",
    "status": "unknown",
    "limitations": ["No official provenance verifier is configured."]
  }
}
```

The style heuristic, when included under `stylisticSignals`, must remain marked `calibrated: false` and `isProbability: false`.

### `sapienize.create_voice_profile`

Create a reusable descriptive profile from authentic samples.

Input:

```json
{
  "samples": ["First authentic sample", "Second authentic sample"],
  "metadata": {
    "register": "optional client note"
  }
}
```

Output is a validated `VoiceProfile` with sample counts, feature measurements, schema version, and warnings. Fewer than 300 words remains valid but produces `VOICE_SAMPLE_TOO_SHORT`. The server must not retain samples or profiles unless persistence is separately configured and disclosed.

### `sapienize.compare_voice`

Compare text with an existing `VoiceProfile`.

Input:

```json
{
  "text": "Text to compare",
  "voice_profile": {}
}
```

Output includes aggregate descriptive similarity, component similarities/differences, sample-size warnings, `calibrated: false`, and `authorshipProbability: null`. Clients must not relabel this result as identity verification.

### `sapienize.rewrite`

Produce and verify voice-restoration candidates through an explicitly configured provider.

Input:

```json
{
  "text": "Original text",
  "voice_profile": {},
  "persona": "Optional, only when requested",
  "semantic_constraints": {
    "protected_passages": [],
    "length_tolerance": 0.15
  },
  "provider": {
    "name": "anthropic",
    "model": "configured-model",
    "credential_ref": "server-managed-reference"
  },
  "max_candidates": 3
}
```

`voice_profile`, `persona`, and `semantic_constraints` are optional; `provider.name` is required for a network rewrite. `credential_ref` is an opaque server-side reference and must never be echoed.

Output:

```json
{
  "original": "Original text",
  "best": {
    "text": "Candidate text",
    "verification": {},
    "ranking": {
      "eligible": true,
      "method": "lexicographic",
      "priorities": ["semanticStatus", "semanticIntegrity", "voiceSimilarity", "styleHeuristic"],
      "components": {
        "semanticStatus": "pass",
        "semanticIntegrity": 100,
        "voiceSimilarity": 82,
        "styleHeuristic": 76
      },
      "policy": "protected-content changes gate eligibility; semantic status and integrity rank first, then voice similarity, then style; detector/provenance scores are excluded"
    }
  },
  "candidates": [],
  "provider": {
    "name": "anthropic",
    "model": "configured-model"
  }
}
```

Protected-content differences make a candidate ineligible. If every candidate is ineligible, return them with their differences and no silently accepted `best` result. Persona never supplies biography or claims, and a supplied authentic profile wins on conflict.

### `sapienize.verify`

Compare an original with a candidate locally.

Input:

```json
{
  "original": "Original text",
  "rewrite": "Candidate text",
  "voice_profile": {},
  "include_style": true
}
```

Output is the shared rewrite-verification object containing semantic integrity, optional voice comparison, optional before/after stylistic analysis, dependency errors, and limitations. Checks include protected numbers, URLs, dates, quotations, likely named entities, lexical similarity, and obvious claim additions/removals. They are heuristic and must remain reviewable.

### `sapienize.check_provenance`

Return provenance and document-integrity results without attempting inference from style.

Input:

```json
{
  "text": "Text to inspect",
  "verifiers": ["anthropic"]
}
```

Without an official configured verifier, Anthropic watermark status is `unsupported` with the configured reason. That means provenance is unknown, not absent. Invisible and directional characters are returned under `documentIntegrity`; they are never treated as watermark evidence.

## Errors and availability

Use MCP protocol errors for malformed tool arguments and transport failures. Domain availability belongs in successful structured results where possible:

```json
{
  "status": "unavailable",
  "reason": "No calibrated local detector is configured."
}
```

Do not substitute `0`, `false`, or an empty object for an unavailable metric. Provider failures should include provider name, model, safe status/category, and a user-actionable message, but never credentials or full sensitive request bodies.

## External detector extension

External detectors are intentionally not part of the initial tool list. If a later measurement tool is added, each observation must retain:

```json
{
  "kind": "external_detector_observation",
  "name": "detector-name",
  "version": "version-if-known",
  "date": "ISO-8601 timestamp",
  "raw": {},
  "normalized": {},
  "calibrated": false,
  "calibrationStatus": "not_calibrated",
  "limitations": []
}
```

The adapter must document the detector's own scale. Normalization is for consistent storage, not a claim that different detector percentages are equivalent.

## Implementation checklist

1. Stabilize and export the shared core operations and JSON-safe schemas.
2. Implement one MCP transport adapter with no duplicated scoring or prompt logic.
3. Add schema tests for every tool and explicit malformed/unavailable cases.
4. Add local-only integration tests for scan/profile/compare/verify/provenance.
5. Add mocked provider tests for rewrite; never require paid credentials in CI.
6. Threat-model credential handling, prompt/sample retention, logs, maximum payload size, timeouts, and cancellation.
7. Document server installation and client configuration only after the implementation exists.

Until these steps are complete, integrations should use the shared JavaScript API or CLI rather than advertising an MCP server.
