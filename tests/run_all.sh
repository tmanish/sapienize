#!/usr/bin/env bash
# Run from anywhere: bash tests/run_all.sh
set -e
cd "$(dirname "$0")/.."
python3 build.py
node --check src/engine.js
cd tests
for t in test_engine dom_test dom_test2 dom_test3 dom_test4 dom_test5; do node "$t.js"; done
echo "ALL SUITES GREEN"
