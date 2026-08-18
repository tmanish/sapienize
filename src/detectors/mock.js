(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./adapter.js"));
  } else {
    root.SapienizeMockDetector = factory(root.SapienizeDetectorAdapter);
  }
}(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this), function (adapterModule) {
  "use strict";

  if (!adapterModule || !adapterModule.DetectorAdapter) throw new Error("SapienizeDetectorAdapter must be loaded before SapienizeMockDetector.");
  var DetectorAdapter = adapterModule.DetectorAdapter;

  function asFixtures(fixtures) {
    if (Array.isArray(fixtures)) return fixtures.slice();
    if (!fixtures || typeof fixtures !== "object") return [];
    return Object.keys(fixtures).sort().map(function (key) {
      var value = fixtures[key];
      if (value && typeof value === "object" && !Array.isArray(value) && (Object.prototype.hasOwnProperty.call(value, "raw") || Object.prototype.hasOwnProperty.call(value, "normalized"))) {
        var fixture = {};
        Object.keys(value).forEach(function (field) { fixture[field] = value[field]; });
        if (!fixture.id) fixture.id = key;
        if (!fixture.text) fixture.text = key;
        return fixture;
      }
      return { id: key, text: key, raw: value, normalized: null };
    });
  }

  function MockDetectorAdapter(options) {
    if (!(this instanceof MockDetectorAdapter)) return new MockDetectorAdapter(options);
    options = options || {};
    DetectorAdapter.call(this, {
      name: options.name || "Mock detector",
      version: options.version || "fixture-v1",
      clock: options.clock || function () { return new Date(0); },
      normalize: options.normalize
    });
    this.fixtures = asFixtures(options.fixtures);
    this.history = [];
  }

  MockDetectorAdapter.prototype = Object.create(DetectorAdapter.prototype);
  MockDetectorAdapter.prototype.constructor = MockDetectorAdapter;

  MockDetectorAdapter.prototype.findFixture = function (text, context) {
    context = context || {};
    if (context.fixtureId != null) {
      for (var i = 0; i < this.fixtures.length; i++) {
        if (String(this.fixtures[i].id) === String(context.fixtureId)) return this.fixtures[i];
      }
    }
    for (var j = 0; j < this.fixtures.length; j++) {
      var expected = Object.prototype.hasOwnProperty.call(this.fixtures[j], "text") ? this.fixtures[j].text : this.fixtures[j].input;
      if (expected === text) return this.fixtures[j];
    }
    if (this.fixtures.length === 1 && this.fixtures[0].default === true) return this.fixtures[0];
    return null;
  };

  MockDetectorAdapter.prototype.analyze = function (text, context) {
    context = context || {};
    if (typeof text !== "string") return Promise.reject(new TypeError("text must be a string"));
    var fixture = this.findFixture(text, context);
    if (!fixture) {
      var error = new Error("No mock detector fixture matched the supplied text or fixtureId.");
      error.code = "MOCK_FIXTURE_NOT_FOUND";
      return Promise.reject(error);
    }
    var normalized;
    try {
      normalized = Object.prototype.hasOwnProperty.call(fixture, "normalized")
        ? fixture.normalized
        : DetectorAdapter.prototype.normalize.call(this, fixture.raw, context);
    } catch (error) {
      return Promise.reject(error);
    }
    var date = fixture.date != null ? fixture.date : (context.date != null ? context.date : this._clock());
    var observation = adapterModule.createDetectorObservation({
      name: fixture.name || this.name,
      version: fixture.version || this.version,
      date: date,
      raw: Object.prototype.hasOwnProperty.call(fixture, "raw") ? fixture.raw : null,
      normalized: normalized
    });
    this.history.push({ fixtureId: fixture.id == null ? null : fixture.id, date: observation.date });
    return Promise.resolve(observation);
  };

  function createMockDetector(options) {
    return new MockDetectorAdapter(options);
  }

  return {
    MockDetectorAdapter: MockDetectorAdapter,
    MockDetector: MockDetectorAdapter,
    createMockDetector: createMockDetector
  };
}));
