#!/usr/bin/env python3
"""Build the two shippable artifacts from source:
  sapienize.html   <- src/sapienize_shell.html + browser-safe shared modules
  sapienize.skill  <- skill/sapienize/ + shared sources in skill/runtime-files.json
Run after any edit to src/ or skill/, then run the tests."""
import re, pathlib, subprocess, zipfile, json

root = pathlib.Path(__file__).parent
TEXT_SUFFIXES = {".html", ".js", ".cjs", ".json", ".md", ".txt", ".yaml", ".yml"}


def read_lf_text(path):
    """Read UTF-8 text with an explicit platform-independent LF representation."""
    return path.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n")


def reproducible_bytes(path):
    if path.suffix.lower() in TEXT_SUFFIXES:
        return read_lf_text(path).encode("utf-8")
    return path.read_bytes()

BROWSER_MODULES = [
    "src/analysis/scoring.js",
    "src/engine.js",  # backward-compatible globals used by the v1 UI
    "src/analysis/stylistic-signals.js",
    "src/analysis/detector-estimate.js",
    "src/voice/schema.js",
    "src/voice/profile.js",
    "src/voice/compare.js",
    "src/rewrite/semantic.js",
    "src/provenance/anthropic-watermark.js",
    "src/provenance/index.js",
    "src/rewrite/verify.js",
    "src/rewrite/prompt.js",
    "src/rewrite/rank.js",
    "src/providers/base.js",
    "src/providers/anthropic.js",
    "src/providers/openai.js",
    "src/providers/openrouter.js",
    "src/providers/index.js",
    "src/detectors/adapter.js",
    "src/detectors/gptzero.js",
    "src/detectors/index.js",
    "src/core/types.js",
    "src/core/analyze.js",
    "src/rewrite/detector-refinement.js",
    "src/core/index.js",
]

shell = read_lf_text(root / "src/sapienize_shell.html")
assert '/*__ENGINE__*/' in shell, "engine placeholder missing from shell"
missing = [path for path in BROWSER_MODULES if not (root / path).is_file()]
assert not missing, "browser module(s) missing: " + ", ".join(missing)
bundle = "\n\n".join(read_lf_text(root / path) for path in BROWSER_MODULES)
html = shell.replace('/*__ENGINE__*/', bundle)
(root / "sapienize.html").write_bytes(html.encode("utf-8"))
scripts = re.findall(r'<script>(.*?)</script>', html, re.S)

# The phrase tables in tells.md are rendered from SAPIENIZE_TELLS so the skill
# reference cannot drift from the executable library.
subprocess.run(["node", "src/analysis/tell-reference.js", "--write", "skill/sapienize/references/tells.md"], cwd=root, check=True)

skill_root = root / "skill/sapienize"
# Explicit file classes and a runtime allowlist prevent local data/credentials
# from becoming package contents. Runtime files are never maintained as copies.
members = {"sapienize/SKILL.md": skill_root / "SKILL.md"}
for pattern in ("references/*.md", "scripts/*.cjs"):
    for p in skill_root.glob(pattern):
        members["sapienize/" + p.relative_to(skill_root).as_posix()] = p
for relative in json.loads((root / "skill/runtime-files.json").read_text())["files"]:
    p = pathlib.PurePosixPath(relative)
    assert not p.is_absolute() and not any(part.startswith(".") for part in p.parts), "unsafe runtime member"
    assert p.suffix == ".js" or relative == "LICENSE", "runtime member must be source or license"
    members["sapienize/runtime/" + relative] = root / relative

with zipfile.ZipFile(root / "sapienize.skill", "w", zipfile.ZIP_STORED) as z:
    for member, p in sorted(members.items()):
        if p.is_file():
            # Git does not preserve source mtimes. Fixed metadata keeps the skill
            # byte-for-byte reproducible across clean checkouts and machines.
            info = zipfile.ZipInfo(member, (1980, 1, 1, 0, 0, 0))
            # Stored members avoid zlib-version variance; pin Unix creator metadata
            # so Windows and Unix builds produce the same central-directory bytes.
            info.compress_type = zipfile.ZIP_STORED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            z.writestr(info, reproducible_bytes(p))
        else:
            raise FileNotFoundError(p)

print(f"built sapienize.html ({len(scripts)} script blocks) and sapienize.skill")
