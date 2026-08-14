---
name: sapienize
description: De-AI-ify a draft. Detect and remove AI-writing tells (stock phrases like "delve" and "tapestry", em dash overuse, flat sentence rhythm, missing contractions, formulaic transitions and structure) and rewrite the text in the author's own voice while preserving every fact. Use this skill whenever the user asks to humanize, de-AI, naturalize, or "make this sound like me," says a draft "sounds like ChatGPT" or "reads AI-generated," mentions an AI detector flagging their writing, or asks for a voice pass on any article, essay, post, email, or README, even if they don't use the word "sapienize."
---

# Sapienize

Restore a human author's voice to a draft. The workflow is a generate-verify-refine loop: scan, report, rewrite, re-scan, converge.

Scope note: this skill improves the authenticity of prose. Don't claim the output will pass any named AI detector, and where the user's context explicitly requires sole-authorship declarations with no AI use, say so once and proceed with what's legitimate: a genuine voice pass with disclosed assistance.

## Step 1: Intake

Collect the draft plus one optional voice source:

1. **The draft.** Required. This can be pasted prose OR a file/artifact: a README, an HTML page, a Word document, a blog post file, code with prose comments and docstrings. If the user points at a file or a previously generated artifact, operate on that file directly.
2. **A voice source.** Optional but high leverage. Two kinds, and a writing sample beats a persona wherever they conflict:
   - **Writing sample**: ask once: "Got 100 to 300 words you wrote yourself with no AI? An old post, a long email, a Slack rant. I'll match its rhythm and vocabulary."
   - **Persona**: the user names an author profile, e.g. "project manager, 52, California" or "solicitor, 64, UK." Derive a register spec from it: sentence habits, vocabulary range, hedging style, spelling convention (UK/US/Indian professional English). A persona shapes register, rhythm, and word choice ONLY. Never invent biographical details, credentials, anecdotes, or opinions that are not in the draft.

If neither is given, proceed with a neutral-conversational register and say that's what you're doing.

## Step 2: Scan

Read `references/tells.md` and check the draft against all four categories:

1. **Lexical tells**: the stock vocabulary list (delve, tapestry, leverage, seamless, pivotal, and the rest).
2. **Structural tells**: "not only X but also Y," "it's not just X, it's Y," "whether you're X or Y," rule-of-three overload, "In conclusion," uniform paragraph blocks, bolded-label list formatting where prose was requested.
3. **Rhythm tells**: flat sentence-length variance, Moreover/Furthermore/Additionally openers, three or more consecutive sentences of near-identical length, repeated sentence openers.
4. **Voice tells**: near-zero contractions, em dash rate above roughly 4 per 1,000 words, hedged abstractions where a specific would do, zero first-person presence in a piece that claims personal experience.

Tally findings with counts. Compute the rough rhythm numbers by hand: average sentence length, and whether lengths visibly vary.

## Step 3: Report

Before rewriting, show the user a compact findings table: tell, category, count, suggested fix. This is the deliverable half the time; some users only want the diagnosis. Ask nothing here; proceed to the rewrite unless the user asked for analysis only.

## Step 4: Rewrite

Rules, in priority order:

1. Preserve every fact, claim, number, name, and link. Add no new claims. Keep length within 15% of the original unless asked otherwise.
2. Remove every flagged tell. Replace with the fixes in `references/tells.md` or with plain speech.
3. Vary rhythm deliberately: mix long sentences with short ones. Include at least one sentence under five words per few paragraphs. Break one "perfect" paragraph.
4. Contract wherever the author would contract out loud, unless the voice sample is formal.
5. Match the voice sample: sentence length habits, favorite connectors, punctuation habits, register, and any recurring idiom. Borrow its habits, not its sentences.
6. Prefer concrete specifics over abstract intensifiers: replace "significantly improved" with the number, "a wide range of" with three named items.
7. Use zero em dashes: convert each one to a comma, a period, or parentheses. American English unless the draft, sample, or persona says otherwise.
8. **Files and artifacts**: when the draft is a file, edit the prose in place and return the updated file, not a chat transcript of it. Rewrite only human-readable prose: paragraphs, headings, README body, docstrings and comments if asked. Never alter code logic, markup structure, tags, attributes, links, front matter keys, or data. For HTML, rewrite visible copy inside elements and leave everything else byte-identical where possible.
9. **Persona register**: apply the derived spec consistently across the whole piece: spelling convention, hedging style, sentence habits. Style only; zero fabricated facts.

## Step 5: Verify and converge

Re-run the Step 2 scan on the rewrite. Convergence criteria:

- Zero severity-3 lexical tells remain.
- No Moreover/Furthermore/Additionally sentence openers.
- Sentence lengths visibly vary (at least one sentence of 6 words or fewer, at least one over 25, in any piece longer than 150 words).
- Zero em dashes remain.

If any criterion fails, refine and re-scan. Maximum 3 passes. If the same criterion fails twice, replan: rewrite that section from scratch instead of patching it. Report the pass count honestly.

As a final sweep, reread once asking: which single sentence still sounds most machine-made? Fix that one even if no checklist row names it.

## Step 6: Deliver

Output three things:

1. The restored draft.
2. A short change log: what was removed, grouped by category, with counts.
3. One line of residuals: anything intentionally kept (for example, a technical term that looks like a tell but is domain-correct) and why.

Close with an invitation for one round of author edits. The author's ear is the real acceptance test; the loop raises the floor, it doesn't certify the ceiling.
