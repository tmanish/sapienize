/* Local detector-estimate contract. No calibrated detector ships in v2. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SapienizeDetectorEstimate = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function isJsonSafeValue(value) {
    function inspect(current, ancestors) {
      if (current === null || typeof current === "string" || typeof current === "boolean") return true;
      if (typeof current === "number") return Number.isFinite(current);
      if (!current || typeof current !== "object") return false;
      if (ancestors.indexOf(current) !== -1) return false;
      ancestors.push(current);
      var prototype = Object.getPrototypeOf(current);
      var names = Object.getOwnPropertyNames(current);
      var symbols = typeof Object.getOwnPropertySymbols === "function" ? Object.getOwnPropertySymbols(current) : [];
      if (symbols.length) { ancestors.pop(); return false; }
      if (Array.isArray(current)) {
        var lengthDescriptor = Object.getOwnPropertyDescriptor(current, "length");
        if (prototype !== Array.prototype || !lengthDescriptor ||
            !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value") ||
            !Number.isInteger(lengthDescriptor.value) || lengthDescriptor.value < 0 ||
            names.length !== lengthDescriptor.value + 1 || names.indexOf("length") === -1) {
          ancestors.pop();
          return false;
        }
        for (var index = 0; index < lengthDescriptor.value; index++) {
          if (!Object.prototype.hasOwnProperty.call(current, index)) { ancestors.pop(); return false; }
          var itemDescriptor = Object.getOwnPropertyDescriptor(current, String(index));
          if (!itemDescriptor || !itemDescriptor.enumerable || !Object.prototype.hasOwnProperty.call(itemDescriptor, "value") ||
              !inspect(itemDescriptor.value, ancestors)) { ancestors.pop(); return false; }
        }
        ancestors.pop();
        return true;
      }
      if (prototype !== Object.prototype && prototype !== null) {
        ancestors.pop();
        return false;
      }
      for (var nameIndex = 0; nameIndex < names.length; nameIndex++) {
        var descriptor = Object.getOwnPropertyDescriptor(current, names[nameIndex]);
        if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, "value") ||
            !inspect(descriptor.value, ancestors)) { ancestors.pop(); return false; }
      }
      ancestors.pop();
      return true;
    }
    try { return inspect(value, []); }
    catch (_) { return false; }
  }

  function unavailableDetectorEstimate(reason) {
    return {
      kind: "detector_estimate",
      status: "unavailable",
      source: "local",
      calibrated: false,
      probability: null,
      label: null,
      reason: reason || "No calibrated local detector is configured.",
      observations: [],
      limitations: [
        "Stylistic signals are not converted into a detector probability.",
        "External detector scores must retain their own detector and version context."
      ]
    };
  }

  function detectorEstimateFromObservations(observations) {
    if (!Array.isArray(observations)) throw new TypeError("detector observations must be an array");
    observations.forEach(function (observation, index) {
      var jsonSafe = isJsonSafeValue(observation);
      var requiredFieldsOwn = jsonSafe && [
        "kind", "name", "version", "date", "raw", "normalized", "calibrated",
        "calibrationStatus", "limitations", "comparability"
      ].every(function (field) { return Object.prototype.hasOwnProperty.call(observation, field); });
      var normalizedFieldsOwn = requiredFieldsOwn && observation.normalized &&
        Object.prototype.hasOwnProperty.call(observation.normalized, "providerSpecific") &&
        Object.prototype.hasOwnProperty.call(observation.normalized, "semantics");
      var calibrationConsistent = jsonSafe && observation && typeof observation.calibrated === "boolean" &&
        ((observation.calibrated === true && observation.calibrationStatus === "provider_declared") ||
         (observation.calibrated === false && observation.calibrationStatus === "not_calibrated"));
      var normalizedCalibrationConsistent = observation && observation.normalized &&
        (!Object.prototype.hasOwnProperty.call(observation.normalized, "calibrated") ||
          observation.normalized.calibrated === observation.calibrated) &&
        (observation.calibrated === true ||
          (!Object.prototype.hasOwnProperty.call(observation.normalized, "calibratedProbability") &&
           !Object.prototype.hasOwnProperty.call(observation.normalized, "calibrated_probability")));
      var valid = jsonSafe && requiredFieldsOwn && normalizedFieldsOwn && observation && observation.kind === "external_detector_observation" &&
        typeof observation.name === "string" && observation.name.trim() &&
        typeof observation.version === "string" && observation.version.trim() &&
        typeof observation.date === "string" && observation.date.trim() && Number.isFinite(Date.parse(observation.date)) &&
        Object.prototype.hasOwnProperty.call(observation, "raw") && observation.raw !== undefined &&
        isJsonSafeValue(observation.raw) &&
        observation.normalized && typeof observation.normalized === "object" && !Array.isArray(observation.normalized) &&
        isJsonSafeValue(observation.normalized) &&
        observation.normalized.providerSpecific === true &&
        typeof observation.normalized.semantics === "string" && observation.normalized.semantics.trim() &&
        calibrationConsistent && normalizedCalibrationConsistent &&
        Array.isArray(observation.limitations) && observation.limitations.every(function (item) { return typeof item === "string" && item.trim(); }) &&
        observation.comparability === "provider_specific";
      if (!valid) throw new TypeError("detector observations[" + index + "] does not satisfy the external detector observation contract");
    });
    return {
      kind: "detector_estimate",
      status: observations.length ? "observed" : "unavailable",
      source: "external_observations",
      calibrated: false,
      probability: null,
      label: null,
      reason: observations.length ? "External observations are retained without combining their provider-specific scales." : "No external detector observations were supplied.",
      observations: observations.slice(),
      limitations: [
        "No cross-detector probability is inferred.",
        "Each observation must be interpreted using its named detector, version, date, and provider documentation."
      ]
    };
  }

  return {
    unavailableDetectorEstimate: unavailableDetectorEstimate,
    detectorEstimateFromObservations: detectorEstimateFromObservations
  };
});
