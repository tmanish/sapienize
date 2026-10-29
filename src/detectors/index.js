(function (root, factory) {
  var api = typeof module === "object" && module.exports
    ? factory(require("./gptzero.js")) : factory(root.SapienizeGPTZero);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SapienizeDetectors = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (gptzero) {
  "use strict";
  function createDetector(name, options) {
    if (name === "gptzero") return gptzero.createGPTZeroDetector(options);
    throw new RangeError("Unknown detector: " + name);
  }
  return { createDetector: createDetector };
});
