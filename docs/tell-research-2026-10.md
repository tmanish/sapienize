# Stylistic-signal research review — 2026-10-29

These are suggestions for contextual review and future evaluation. They are not additions to `SAPIENIZE_TELLS`, authorship evidence, or measured Sapienize performance. Publication date is distinct from the model version tested: none of these studies establishes a reliable tell for every current release of a vendor's models.

## Recent evidence

**Generated and edited writing need separate baselines.** Shan, Lee and Hao's September 22, 2026 revision finds that generation and editing do not leave the same stylometric pattern. It studies eight open-weight generators across five domains, with additional generation experiments on Gemini 3 Flash and GPT-5.4-mini. Entropy and lexical diversity are informative for generation; secondary features depend on domain and generator. For Sapienize, this supports evaluating human writing, model output, and assisted edits separately. It does not justify declaring a particular diversity score inherently human or imposing a universal rhythm target. [Paper and methods](https://arxiv.org/html/2608.27855v2)

**Narrative structure deserves review alongside words.** StoryScope's August 10, 2026 revision studies parallel fiction from Claude Sonnet 4.6, GPT-5.4, Gemini 3 Flash, DeepSeek V3.2 and Kimi K2.5. It reports excessive explanation of themes and more orderly plots in generated fiction. Its full-text model analysis describes:

| Tested model | Observed tendency in this fiction corpus | Potential review question |
|---|---|---|
| Claude Sonnet 4.6 | Low escalation and unusually consistent narrative voice | Does the draft flatten the author's intended changes in pace or intensity? |
| GPT-5.4 | Social rumor mechanisms and retrospective framing | Was this framing present in the original, or introduced during rewriting? |
| Gemini 3 Flash | Tidy resolutions and extended closing passages | Does the ending repeat the theme or resolve uncertainty the original retained? |

These findings concern fiction, not universal email or essay signatures. The full text and abstract differ on one GPT example, so use the full-text analysis and avoid treating any single example as a stable vendor fingerprint. [StoryScope, full text](https://arxiv.org/html/2604.03136v6)

**Familiar lexical clues are older and context-sensitive.** The COLING 2025 study examines lexical overrepresentation in scientific writing, including words Sapienize already tracks such as “delve” and “intricate.” It supplies research context for testing those entries, not evidence that each occurrence deserves a rewrite. [Juzek and Ward, COLING 2025](https://aclanthology.org/2025.coling-main.426/)

**Document patterns are worth testing.** Russell, Karpinska and Iyyer's ACL 2025 study of GPT-4o, Claude 3.5 Sonnet and o1 articles records reviewers' use of repetitive sentence structures, vague optimistic endings, over-explanation and mechanically placed quotations. Those observations also produced false positives. Treat them as candidate review categories with domain-specific counterexamples. [Paper and annotation analysis](https://arxiv.org/html/2501.15654v2)

## Proposed additions to evaluate

The following examples are newly written illustrations, not model outputs or benchmark evidence. Keep these manual/context-only until a representative evaluation supports an executable rule.

| Candidate | Illustrative review case | Counterexample that should remain valid |
|---|---|---|
| Repeated explanation of an already demonstrated point | A scene shows a character returning a lost wallet, followed by several sentences explaining the same moral. | A teacher explicitly explaining a lesson to learners. |
| Unsupported optimistic closing paragraph | A draft about an unresolved failure ends with an added assurance of future success. | The author supplied a supported forecast and wants to retain it. |
| Formulaic quotation placement | Every paragraph ends with a similarly structured quote, regardless of the argument's needs. | An interview digest or publication template requires that format. |
| Voice drift across a rewrite | The rewrite makes all paragraphs similarly paced despite a representative sample's deliberate variation. | The original author consistently uses that cadence in this genre. |

For the first and third candidates, measure document-level repetition/position and inspect context; a word regex cannot establish the issue. Unsupported assurances belong primarily in semantic verification. Never fix a narrative pattern by inventing events, deleting uncertainty, changing quotations, or changing the author's claims. Model-specific narrative preferences are research observations, not automatic rewrite objectives.

Before promoting any candidate: collect licensed or consented examples, record exact model versions and generation settings, include authentic human counterexamples, freeze development/evaluation splits, audit duplicates, and measure false positives by genre and source type. Every executable tell still needs hit/miss examples in `src/engine.js`, regenerated reference tables, and regression coverage. Avoid adding broad rules for ordinary words, names, em dashes, or sentence length merely because one model used them.
