#!/usr/bin/env python3
"""Build the two shippable artifacts from source:
  sapienize.html   <- src/sapienize_shell.html + src/engine.js
  sapienize.skill  <- skill/sapienize/
Run after any edit to src/ or skill/, then run the tests."""
import re, pathlib, zipfile

root = pathlib.Path(__file__).parent

EXPORT_LINE = 'if (typeof module !== "undefined") { module.exports = { analyzeText: analyzeText, SAPIENIZE_TELLS: SAPIENIZE_TELLS, splitSentences: splitSentences }; }'

shell = (root / "src/sapienize_shell.html").read_text()
engine = (root / "src/engine.js").read_text()
assert EXPORT_LINE in engine, "module.exports line missing or reformatted in src/engine.js; update EXPORT_LINE to match"
engine = engine.replace(EXPORT_LINE, '')
assert '/*__ENGINE__*/' in shell, "engine placeholder missing from shell"
(root / "sapienize.html").write_text(shell.replace('/*__ENGINE__*/', engine))
scripts = re.findall(r'<script>(.*?)</script>', (root / "sapienize.html").read_text(), re.S)

with zipfile.ZipFile(root / "sapienize.skill", "w", zipfile.ZIP_DEFLATED) as z:
    for p in sorted((root / "skill/sapienize").rglob("*")):
        if p.is_file():
            z.write(p, p.relative_to(root / "skill"))

print(f"built sapienize.html ({len(scripts)} script blocks) and sapienize.skill")
