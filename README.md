# Sapienize

Find the machine accent in a draft. Restore your own voice.

## Why

AI detectors answer one narrow question: does this text statistically resemble model output? They know nothing about the work behind it. Not the idea you carried around for months, not the sleepless nights spent fixing what the model got wrong, not the hundred prompts it took to get your own thinking onto the page. In an age when using AI well is simply how work gets done, a writer who did all of that can still get flagged, and a score from a black box becomes the verdict on their effort. Sapienize is an attempt to push back on that flawed mechanic. If you did the work, the words should sound like you, and no classifier should get the last word on your authorship.

## Keeping it current

AI writing habits shift and detectors retrain, so the tell library needs a cadence. It is plain data: the `SAPIENIZE_TELLS` array in `src/engine.js` and `skill/sapienize/references/tells.md`. Every two weeks: generate a few fresh samples from current models, run them through the app, add unflagged patterns as new entries, retire entries the models stopped using, then `python3 build.py && bash tests/run_all.sh` before shipping. The GitHub Actions workflow in `.github/workflows/biweekly-refresh.yml` runs the regression suite on every push and opens a reminder issue on the 1st and 15th of each month.

## What's here

- `sapienize.html`: the app. Open it in any browser. Built artifact; the source is `src/`.
- `sapienize.skill`: a Claude skill that runs the same scan-rewrite-verify loop in chat. Built artifact; the source is `skill/`.
- `src/`, `skill/`, `tests/`, `build.py`: the source. `python3 build.py` rebuilds both artifacts from it; `bash tests/run_all.sh` builds and runs the regression suite (needs Node and `npm install` for jsdom). Edit the source, never the artifacts.

## Using the app

1. Paste a draft, click **Run forensics**. Analysis is fully client-side; nothing leaves the page. No key, no account, works for anyone.
2. Optional voice source: pick a **persona** (preset or custom, e.g. "solicitor, 64, UK") and/or paste 100 to 300 words you wrote yourself. Personas shape style only and never invent facts; your own sample wins over the persona on conflicts.
3. Click **Rewrite in my voice**.
   - Inside a Claude.ai artifact: works with no key.
   - Anywhere else (local file, hosted): open **API settings**, pick a provider (Anthropic, OpenAI, or OpenRouter), set the model if you want, and paste your own key. Each user brings their own. Keys stay in memory for that tab only, never stored, sent only to the selected provider.
4. **Use as new specimen** feeds the rewrite back in for another pass.

## Running it inside Claude (no key)

- Attach `sapienize.html` to a claude.ai chat and ask: "render this file as an artifact." It runs in the preview panel on the right with keyless rewrites.
- Or paste the file's code into a chat with the same request.
- To share: open the artifact in claude.ai and click Publish. Anyone signed in to claude.ai can then use the link with keyless rewrites billed to their own Claude plan.

## Using the skill

Install `sapienize.skill` in Claude, then ask: "sapienize this draft" or "make this sound like me." Attach a voice sample for best results.

## Honest limits

Sapienize measures and removes stylistic AI fingerprints and restores the author's voice. AI detectors are black boxes that change without notice, so no tool can guarantee their output, this one included.
