# Sapienize

Find the machine accent in a draft. Restore your own voice.

**Open the app: https://tmanish.github.io/sapienize/** — runs entirely in your browser, nothing to install, no account.

## Get it

- **Use it in the browser**: https://tmanish.github.io/sapienize/. Analysis is fully client-side; your text never leaves the page.
- **Download the app**: grab [sapienize.html](https://github.com/tmanish/sapienize/raw/main/sapienize.html) (right-click, Save Link As) and open it in any browser. Works offline for analysis.
- **Get the Claude skill**: download [sapienize.skill](https://github.com/tmanish/sapienize/raw/main/sapienize.skill) and install it in Claude. Then ask: "sapienize this draft" or "make this sound like me."

## Why

AI detectors answer one narrow question: does this text statistically resemble model output? They know nothing about the work behind it. Not the idea you carried around for months, not the sleepless nights spent fixing what the model got wrong, not the hundred prompts it took to get your own thinking onto the page. In an age when using AI well is simply how work gets done, a writer who did all of that can still get flagged, and a score from a black box becomes the verdict on their effort. Sapienize is an attempt to push back on that flawed mechanic. If you did the work, the words should sound like you, and no classifier should get the last word on your authorship.

## Using the app

1. Paste a draft, click **Run forensics**. Analysis is fully client-side; nothing leaves the page. No key, no account, works for anyone.
2. Optional voice source: pick a **persona** (preset or custom, e.g. "solicitor, 64, UK") and/or paste 100 to 300 words you wrote yourself. Personas shape style only and never invent facts; your own sample wins over the persona on conflicts.
3. Click **Rewrite in my voice**.
   - Inside a Claude.ai artifact: works with no key.
   - Anywhere else (the hosted page, a local file): open **API settings**, pick a provider (Anthropic, OpenAI, or OpenRouter), set the model if you want, and paste your own key. Each user brings their own. Keys stay in memory for that tab only, never stored, sent only to the selected provider.
4. **Use as new specimen** feeds the rewrite back in for another pass.

## Running it inside Claude (no key)

- Attach `sapienize.html` to a claude.ai chat and ask: "render this file as an artifact." It runs in the preview panel on the right with keyless rewrites.
- Or paste the file's code into a chat with the same request.
- To share: open the artifact in claude.ai and click Publish. Anyone signed in to claude.ai can then use the link with keyless rewrites billed to their own Claude plan.

## Using the skill

Install `sapienize.skill` in Claude, then ask: "sapienize this draft" or "make this sound like me." Attach a voice sample for best results. The skill runs the same scan-rewrite-verify loop as the app, but on anything in the chat: pasted prose, files, READMEs, previously generated artifacts.

## For developers

This repo is the source; the two download files above are build outputs.

- `src/`: the analysis engine (`engine.js`, the `SAPIENIZE_TELLS` pattern library) and the app shell.
- `skill/`: the Claude skill source (`SKILL.md` plus the tell reference `tells.md`).
- `tests/`: engine unit tests and jsdom end-to-end tests, `bash tests/run_all.sh` runs everything.
- `build.py`: rebuilds `sapienize.html` and `sapienize.skill` from source. Edit the source, never the artifacts.
- `index.html`: redirects the GitHub Pages root to the app.

## Keeping it current

AI writing habits shift and detectors retrain, so the tell library needs a cadence. It is plain data: the `SAPIENIZE_TELLS` array in `src/engine.js` and `skill/sapienize/references/tells.md`. Every two weeks: generate a few fresh samples from current models, run them through the app, add unflagged patterns as new entries, retire entries the models stopped using, then `python3 build.py && bash tests/run_all.sh` before shipping. The GitHub Actions workflow in `.github/workflows/biweekly-refresh.yml` runs the regression suite on every push and opens a reminder issue on the 1st and 15th of each month.

## Contributing a tell

Spotted AI phrasing that slips through the scan? A tell lives in two places, and both must change together:

1. Add a regex entry to the `SAPIENIZE_TELLS` array in `src/engine.js`: `{ re: /\byour pattern\b/gi, label: "short name", cat: "lexical" | "structure" | "rhythm", sev: 1-3, fix: "plain-speech replacement" }`. Severity: 3 = near-certain machine accent, always remove; 2 = strong signal; 1 = weak signal, fix on repetition.
2. Add the matching row to `skill/sapienize/references/tells.md` in the corresponding section, so the skill flags it too.

Then `python3 build.py && bash tests/run_all.sh`, and open a PR that includes a sample sentence the new tell catches. Same flow applies to retiring a tell current models no longer produce.

## Honest limits

Sapienize measures and removes stylistic AI fingerprints and restores the author's voice. AI detectors are black boxes that change without notice, so no tool can guarantee their output, this one included.
