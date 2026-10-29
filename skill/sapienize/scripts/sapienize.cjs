#!/usr/bin/env node
"use strict";
const path = require('path');
try {
  const { runtimeRoot } = require('./runtime.cjs');
  const cli = require(path.join(runtimeRoot(), 'src/cli/sapienize.js'));
  cli.installExecutableOutputHandlers(process);
  cli.main().catch(() => { console.error('Sapienize command failed.'); process.exitCode = 1; });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
