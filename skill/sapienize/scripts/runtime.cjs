"use strict";
const fs = require('fs');
const path = require('path');

function runtimeRoot() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 20 || (major === 20 && minor < 19)) throw Error('Sapienize requires Node 20.19 or later.');
  const root = path.resolve(__dirname, '../runtime');
  if (!fs.existsSync(path.join(root, 'src/core/index.js'))) {
    throw Error('Bundled runtime missing. Build and extract sapienize.skill; do not install the unbuilt source folder.');
  }
  return root;
}

module.exports = { runtimeRoot };
