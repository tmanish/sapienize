#!/usr/bin/env python3
"""Check committed artifact parity, then rebuild to prove reproducibility."""
import hashlib
import pathlib
import subprocess
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
TEXT_SUFFIXES = {".html", ".js", ".json", ".md", ".txt", ".yaml", ".yml"}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def reproducible_bytes(path):
    data = path.read_bytes()
    if path.suffix.lower() in TEXT_SUFFIXES:
        data = data.replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    return data


html = (ROOT / "sapienize.html").read_text(encoding="utf-8")
assert b"\r\n" not in (ROOT / "sapienize.html").read_bytes(), "standalone HTML must use reproducible LF endings"
assert "/*__ENGINE__*/" not in html, "engine placeholder leaked into generated HTML"
assert "root.SapienizeCore = api" in html, "provider-neutral core missing from standalone HTML"
assert "root.SapienizeProviders = api" in html, "provider adapters missing from standalone HTML"
assert "Uncalibrated style heuristic" in html, "standalone UI still exposes ambiguous score language"

with zipfile.ZipFile(ROOT / "sapienize.skill") as archive:
    names = sorted(archive.namelist())
    expected = ["sapienize/SKILL.md", "sapienize/references/tells.md"]
    assert names == expected, f"unexpected skill members: {names}"
    for name in names:
        info = archive.getinfo(name)
        assert info.create_system == 3, f"{name} has platform-dependent ZIP creator metadata"
        assert info.compress_type == zipfile.ZIP_STORED, f"{name} uses platform-dependent compression"
        source = ROOT / "skill" / name
        member = archive.read(name)
        assert member == reproducible_bytes(source), f"{name} differs from its authoritative source"
        if source.suffix.lower() in TEXT_SUFFIXES:
            assert b"\r\n" not in member, f"{name} must use reproducible LF endings"

committed = (digest(ROOT / "sapienize.html"), digest(ROOT / "sapienize.skill"))
subprocess.run([sys.executable, str(ROOT / "build.py")], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
first_build = (digest(ROOT / "sapienize.html"), digest(ROOT / "sapienize.skill"))
assert committed == first_build, "committed artifacts differ from their authoritative sources"
subprocess.run([sys.executable, str(ROOT / "build.py")], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
second_build = (digest(ROOT / "sapienize.html"), digest(ROOT / "sapienize.skill"))
assert first_build == second_build, "two fresh builds from unchanged sources produced different artifacts"
print("PASS: standalone HTML and Claude skill are reproducible source-derived artifacts")
