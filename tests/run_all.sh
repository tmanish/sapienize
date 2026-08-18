#!/usr/bin/env bash
# Run from anywhere: bash tests/run_all.sh
set -e
cd "$(dirname "$0")/.."
# Check the committed/generated artifacts before any command can silently repair
# drift, then rebuild once as part of the reproducibility assertion.
python3 tests/test_artifacts.py
while IFS= read -r source; do node --check "$source"; done < <(find src eval -type f -name '*.js' | sort)
while IFS= read -r suite; do node "$suite"; done < <(find tests -maxdepth 1 -type f -name 'test_*.js' | sort)
for suite in tests/dom_test.js tests/dom_test2.js tests/dom_test3.js tests/dom_test4.js tests/dom_test5.js tests/dom_test6.js; do node "$suite"; done
echo "ALL SUITES GREEN"
