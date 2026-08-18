# Configured stylistic signals: contextual reference

This is the host-readable companion to the executable `SAPIENIZE_TELLS` library. It supports explanation and revision; it is not an AI detector, a list of forbidden phrases, or evidence of authorship. Every pattern can occur in genuine human writing, and domain context, quotations, and an authentic `VoiceProfile` take precedence over generic advice.

## Contents

- [Lexical signals](#1-lexical-signals)
- [Structural signals](#2-structural-signals)
- [Rhythm signals](#3-rhythm-signals)
- [Voice and document-integrity observations](#4-voice-and-document-integrity-observations)
- [What not to change automatically](#5-what-not-to-change-automatically)
- [2026 additions](#6-2026-additions)

The legacy severity value is a review-priority weight used by the backward-compatible style heuristic:

- **3:** review first because the pattern is highly formulaic in the curated library.
- **2:** review in context.
- **1:** weak/context-sensitive observation, usually relevant only when repeated or mismatched with the requested voice.

Severity is not statistical confidence or probability. A finding may be intentionally kept. The replacement column offers revision ideas, not mandatory substitutions.

## 1. Lexical signals

| Tell | Sev | Replace with |
|---|---|---|
| delve / delving | 3 | dig into, look at, examine |
| tapestry / rich tapestry | 3 | mix, range, variety |
| a testament to | 3 | shows, proves |
| ever-evolving | 3 | changing, or cut |
| in today's fast-paced / digital / modern world | 3 | cut the opener; start with the point |
| navigate the complexities / landscape | 3 | handle, deal with, work through |
| game-changer | 3 | name the specific change |
| treasure trove | 3 | a lot of, a stack of |
| double-edged sword | 3 | state the tradeoff directly |
| paradigm shift | 3 | big change, then say what changed |
| unlock the potential / power | 3 | say what becomes possible |
| it's important to note that / it's worth noting | 3 | delete; note the thing directly |
| it should be noted that | 3 | delete |
| seamless / seamlessly | 3 | smooth, without extra steps |
| synergy / synergistic | 3 | say how the parts help each other |
| stands as a | 3 | is |
| plays a vital / crucial / pivotal role | 3 | does X, matters because |
| in the realm / world / landscape of | 3 | in |
| plethora | 3 | plenty, a lot |
| harness the | 3 | use |
| embark on | 3 | start |
| unleash | 3 | release, enable |
| beacon of | 3 | example of |
| nestled | 3 | sits, located |
| cannot be overstated | 3 | state it at normal volume |
| actionable insights | 3 | things you can act on, or name one |
| without further ado | 3 | cut |
| elevate your | 3 | improve, sharpen |
| leverage (verb) | 2 | use |
| foster | 2 | build, encourage |
| pivotal | 2 | key, decisive |
| cutting-edge / state-of-the-art | 2 | new, latest, or name the technique |
| revolutionize / transformative | 2 | change; say into what |
| empower | 2 | let, help |
| streamline | 2 | simplify, cut steps |
| utilize | 2 | use |
| facilitate | 2 | help, make possible |
| showcase | 2 | show |
| holistic | 2 | whole, end-to-end |
| myriad | 2 | many |
| underscore | 2 | show, highlight |
| dive into / deep dive | 2 | look at, close look |
| let's explore | 2 | here's how X works |
| at its core / in essence | 2 | basically, or cut |
| the key takeaway | 2 | the point is |
| when it comes to | 2 | for, with |
| a wide range / array / variety of | 2 | many, or list three |
| needless to say | 2 | cut |
| comprehensive guide | 2 | guide |
| serves as a | 2 | is, works as |
| vibrant / bustling | 2 | describe what you actually see |
| meticulous / intricate | 2 | careful, detailed |
| fast-paced | 2 | cut, or name the actual speed |
| unprecedented | 2 | new, first, with evidence |
| key insights / considerations / aspects | 2 | name them |
| hope this helps / finds you well | 2 | cut or personalize |
| firstly | 2 | first |
| crucial / robust / significant | 1 | fine once; on repeat, use specifics or numbers |
| boasts | 2 | has |
| ultimately / that being said | 1 | in the end / but, or cut |
| stakeholders / best practices | 1 | name the people / the practice |
| the world of X | 2 | X |
| underpin | 1 | supports, is behind |
| swiftly and | 1 | fast |
| delightful | 1 | say what's good about it |

## 2. Structural signals

- **"Not only X, but also Y"** (sev 2): split into two claims or keep the stronger one.
- **"It's not just X; it's Y"** (sev 3): state Y directly.
- **"Whether you're a X or a Y"** (sev 3): pick one reader and write to them.
- **"In conclusion / In summary"** (sev 3/2): just conclude.
- **Rule-of-three density** (sev 2): repeated "X, Y, and Z" constructions can sound templated. Compare the frequency with the authentic profile and revise only when it is out of character or obscures the point.
- **Uniform paragraph blocks** (sev 2): similarly sized paragraphs are worth reviewing, but may be correct for a constrained format. Let the idea and the author's profile determine paragraph shape.
- **"Here are some..." list preambles** (sev 1): go straight to the first item.
- **Manual/context-only — bold-label bullet formatting** where prose was requested: this is host guidance, not an executable `SAPIENIZE_TELLS` check. Convert to sentences only when the requested format calls for prose.

## 3. Rhythm signals

- **Low sentence-length variation** (sev 3): sentence lengths barely vary. Report the measured distribution and compare it with the authentic profile; do not manufacture a short/long sentence quota when the author's cadence is genuinely even.
- **Moreover / Furthermore / Additionally / In addition sentence openers** (sev 2): use and, also, plus, or no connector.
- **Monotone stretches** (sev 2): 3+ consecutive sentences within a few words of the same length. Break one.
- **Repeated openers** (sev 1): 3+ sentences starting with the same non-trivial word.
- **"However, it is..."** (sev 1): but it's.

## 4. Voice and document-integrity observations

- **Contraction behavior** (legacy sev 3 when near-total expansions trigger the rule): compare "do not," "it is," and similar forms with the requested register and authentic profile. Formal expansions may be genuine voice; do not contract by default.
- **Em dash frequency** (legacy sev 3 above the configured threshold): report density and compare it with the authentic profile. There is no universal zero-em-dash rule. Keep or revise each dash according to meaning and the author's punctuation habits.
- **Invisible or directional characters**: report these through document integrity. They may be intentional formatting, accidental residue, or suspicious manipulation, but they are not evidence of a watermark or AI authorship. Do not remove them merely to change provenance; surface them for review.
- **Semicolon density** (sev 1): contextual, especially across technical, legal, academic, and casual registers.
- **Manual/context-only — abstract intensifiers**: phrases such as "significantly improved" or "greatly enhanced" need evidence-aware review, but this is not an executable check. Prefer a number or concrete effect when the source supports one.
- **Manual/context-only — no first person in a personal piece**: this is host guidance, not an executable check. Ask the author about a possible mismatch; never invent an experience, action, or opinion.
- **Manual/context-only — repeated hedged balance**: this is host guidance, not an executable check. Hedging can be essential, so preserve the original certainty and compare it with the author's register.

## 5. What not to change automatically

- Domain vocabulary that overlaps the list: "robust" in statistics, "leverage" in finance, "pivotal" in a history of hinges. Judgment beats the table.
- The author's measured habits and genuine idioms, even when they overlap a configured signal. The goal is their voice, not generic casual prose.
- Facts, numbers, names, links, quotes. Never paraphrase a quotation.
- Correctness. Never introduce an error to sound casual.
- Negation, uncertainty, modality, conditions, or claim scope.
- Punctuation merely to improve the legacy style heuristic.

Never use this library to optimize against a named detector. External detector observations and provenance signals are measurement-only and do not belong in rewrite objectives.

## 6. 2026 additions

Patterns added to the curated library during 2025-2026 maintenance. They have not been established as calibrated evidence of model generation. Use the same contextual review-priority scale described above.

**Negative parallelism and hook constructions (structure)**

| Tell | Sev | Replace with |
|---|---|---|
| Not because X, but because Y | 3 | give the real reason once, plainly |
| No X. No Y. Just Z. | 3 | one plain sentence about what it is |
| That's not X, that's Y | 3 | state Y directly |
| Not by X, but by Y | 2 | keep the second half only |
| And the X? Y. | 2 | join it to the sentence it answers |
| The result? / The kicker? (rhetorical fragment) | 2 | just state it |
| Here's the kicker / thing / catch | 2 | delete the drumroll, keep the point |
| Picture this | 3 | open with the specific scene itself |
| As a [role], you know... | 2 | say it without deputizing the reader |
| Let that sink in | 3 | trust the reader; cut |
| Sound familiar? | 2 | cut |
| One thing is clear | 2 | state the clear thing |
| Let's be honest / face it | 1 | just be honest without announcing it |
| Whether we like it or not | 1 | cut |

**Vocabulary (lexical)**

| Tell | Sev | Replace with |
|---|---|---|
| multifaceted | 3 | name two of the facets |
| at the intersection of | 3 | combining X and Y |
| in a world where | 3 | cut the movie-trailer opener |
| look no further | 3 | cut |
| innovative | 2 | say what is new about it |
| in an era of/where | 2 | now / today |
| at the end of the day | 2 | in the end, or cut |
| masterclass in | 2 | a strong example of |
| secret sauce | 2 | name the actual ingredient |
| future-proof | 2 | durable, with evidence |
| supercharge | 2 | speed up, with a number |
| democratize | 2 | make X available to Y |
| frictionless | 2 | easy / one step |
| here to stay | 2 | evidence it persists |
| perfect storm | 2 | list the causes |
| checks all the boxes | 2 | name the boxes |
| more than meets the eye | 2 | say what the hidden part is |
| blazing-fast | 2 | give the milliseconds |
| does the heavy lifting | 2 | say what it actually does |
| quietly became / quietly powerful | 2 | drop "quietly" |
| stark reminder | 2 | reminder, or state the fact |
| crucially, | 2 | cut; the sentence should show it |
| optimize / journey / ecosystem / landscape / resonate / grapple with / arguably / notably / importantly / in a nutshell / silver bullet / table stakes / pro tip: / spoiler: | 1 | weak signals; fix on repetition, keep when domain-correct |
