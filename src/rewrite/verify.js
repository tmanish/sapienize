(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./semantic.js"), require("../provenance/index.js"));
  } else {
    root.SapienizeVerify = factory(root.SapienizeSemantic, root.SapienizeProvenance);
  }
}(typeof globalThis !== "undefined" ? globalThis : (typeof self !== "undefined" ? self : this), function (semanticModule, provenanceModule) {
  "use strict";

  function isThenable(value) {
    return value && typeof value.then === "function";
  }

  function dependency(options, names) {
    var deps = options.dependencies || options.deps || {};
    for (var i = 0; i < names.length; i++) {
      if (typeof options[names[i]] === "function") return options[names[i]];
      if (typeof deps[names[i]] === "function") return deps[names[i]];
    }
    return null;
  }

  function dependencyError(component, error) {
    return {
      status: "error",
      component: component,
      reason: error && error.message ? error.message : String(error),
      errorCode: error && error.code ? error.code : null
    };
  }

  function unavailable(component, requested) {
    return {
      status: requested ? "unavailable" : "not_run",
      component: component,
      reason: requested ? component + " was requested but no compatible dependency was provided." : "No " + component + " dependency was provided."
    };
  }

  function semanticFailure(reason) {
    return {
      kind: "semantic_integrity",
      status: "error",
      accepted: false,
      requiresReview: true,
      score: 0,
      preservation: 0,
      scoreKind: "descriptive_semantic_integrity",
      calibrated: false,
      isProbability: false,
      criticalDifferenceCount: 1,
      differences: [{ type: "verification", change: "error", severity: "error", message: reason }],
      checks: {},
      summary: { errors: 1, warnings: 0, differences: 1 },
      limitations: ["Semantic verification did not complete."]
    };
  }

  function validateSemanticResult(result) {
    if (!result || typeof result !== "object" || Array.isArray(result) || typeof result.status !== "string") {
      return semanticFailure("Semantic verifier returned a malformed result.");
    }
    return result;
  }

  function resolveStatus(semanticIntegrity, style, voice, voiceRequested, documentIntegrity) {
    if (!semanticIntegrity || ["fail", "invalid", "error"].indexOf(semanticIntegrity.status) !== -1) return "fail";
    if (["review", "insufficient"].indexOf(semanticIntegrity.status) !== -1) return "review";
    if (documentIntegrity && ["review", "invalid", "error"].indexOf(documentIntegrity.status) !== -1) return "review";
    if (style && style.status === "error") return "review";
    if (voiceRequested && voice && ["error", "unavailable"].indexOf(voice.status) !== -1) return "review";
    return "pass";
  }

  function makeResult(semanticIntegrity, style, voice, voiceRequested, documentIntegrity, dependencyErrors) {
    var status = resolveStatus(semanticIntegrity, style, voice, voiceRequested, documentIntegrity);
    return {
      kind: "rewrite_verification",
      status: status,
      accepted: status === "pass",
      requiresReview: status !== "pass",
      semanticIntegrity: semanticIntegrity,
      style: style,
      styleAnalysis: style,
      voice: voice,
      voiceMatch: voice,
      documentIntegrity: documentIntegrity,
      checks: {
        semantic: semanticIntegrity ? semanticIntegrity.status : "error",
        style: style ? style.status : "not_run",
        voice: voice ? voice.status : "not_run",
        documentIntegrity: documentIntegrity ? documentIntegrity.status : "not_run"
      },
      dependencyErrors: dependencyErrors,
      limitations: ["A pass means the configured checks found no material issue; it is not proof of authorship or semantic equivalence."]
    };
  }

  function runSemanticSync(original, rewrite, options, errors) {
    var verifier = dependency(options, ["semanticVerifier", "verifySemanticIntegrity", "compareSemanticIntegrity"]);
    if (!verifier && semanticModule) verifier = semanticModule.verifySemanticIntegrity || semanticModule.compareSemanticIntegrity;
    if (!verifier) return semanticFailure("No semantic verifier is available.");
    try {
      var result = verifier(original, rewrite, options.semanticOptions || options.semantic || {});
      if (isThenable(result)) {
        var asyncError = new Error("Semantic verifier returned a Promise; use verifyAsync().");
        asyncError.code = "ASYNC_DEPENDENCY";
        errors.push(dependencyError("semantic", asyncError));
        return semanticFailure(asyncError.message);
      }
      return validateSemanticResult(result);
    } catch (error) {
      errors.push(dependencyError("semantic", error));
      return semanticFailure(error && error.message ? error.message : String(error));
    }
  }

  function runStyleSync(original, rewrite, options, errors) {
    var comparer = dependency(options, ["styleComparator", "compareStyle", "compareStylisticSignals"]);
    var analyzer = dependency(options, ["styleAnalyzer", "analyzeStyle", "analyzeStylisticSignals", "analyzeText"]);
    try {
      var result;
      if (comparer) {
        result = comparer(original, rewrite, options.styleOptions || {});
        if (isThenable(result)) throwAsync("Style comparator");
        return { status: "complete", comparison: result };
      }
      if (analyzer) {
        var before = analyzer(original, options.styleOptions || {});
        var after = analyzer(rewrite, options.styleOptions || {});
        if (isThenable(before) || isThenable(after)) throwAsync("Style analyzer");
        return { status: "complete", original: before, rewrite: after };
      }
      return unavailable("style analysis", false);
    } catch (error) {
      var failure = dependencyError("style", error);
      errors.push(failure);
      return failure;
    }
  }

  function runVoiceSync(rewrite, options, errors) {
    var profile = options.voiceProfile || options.profile || null;
    var requested = Boolean(profile || options.requireVoice);
    if (!requested) return unavailable("voice comparison", false);
    var comparator = dependency(options, ["voiceComparator", "compareVoice"]);
    if (!comparator) return unavailable("voice comparison", true);
    try {
      var result = comparator(rewrite, profile, options.voiceOptions || {});
      if (isThenable(result)) throwAsync("Voice comparator");
      return { status: "complete", profileId: profile && profile.id ? profile.id : null, result: result };
    } catch (error) {
      var failure = dependencyError("voice", error);
      errors.push(failure);
      return failure;
    }
  }

  function runDocumentIntegritySync(rewrite, options, errors) {
    var inspector = dependency(options, ["documentIntegrityChecker", "inspectDocumentIntegrity", "checkDocumentIntegrity"]);
    if (!inspector && provenanceModule) inspector = provenanceModule.inspectDocumentIntegrity || provenanceModule.checkDocumentIntegrity;
    if (!inspector) return unavailable("document integrity", false);
    try {
      var result = inspector(rewrite, options.documentIntegrityOptions || {});
      if (isThenable(result)) throwAsync("Document-integrity checker");
      if (!result || typeof result !== "object" || Array.isArray(result) || typeof result.status !== "string") {
        throw new TypeError("Document-integrity checker returned a malformed result.");
      }
      return result;
    } catch (error) {
      var failure = dependencyError("document_integrity", error);
      errors.push(failure);
      return failure;
    }
  }

  function throwAsync(label) {
    var error = new Error(label + " returned a Promise; use verifyAsync().");
    error.code = "ASYNC_DEPENDENCY";
    throw error;
  }

  function verify(original, rewrite, options) {
    options = options || {};
    var errors = [];
    var semanticIntegrity = runSemanticSync(original, rewrite, options, errors);
    var style = runStyleSync(original, rewrite, options, errors);
    var voiceRequested = Boolean(options.voiceProfile || options.profile || options.requireVoice);
    var voice = runVoiceSync(rewrite, options, errors);
    var documentIntegrity = runDocumentIntegritySync(rewrite, options, errors);
    return makeResult(semanticIntegrity, style, voice, voiceRequested, documentIntegrity, errors);
  }

  function callMaybeAsync(fn, args) {
    try { return Promise.resolve(fn.apply(null, args)); }
    catch (error) { return Promise.reject(error); }
  }

  function runSemanticAsync(original, rewrite, options, errors) {
    var verifier = dependency(options, ["semanticVerifier", "verifySemanticIntegrity", "compareSemanticIntegrity"]);
    if (!verifier && semanticModule) verifier = semanticModule.verifySemanticIntegrity || semanticModule.compareSemanticIntegrity;
    if (!verifier) return Promise.resolve(semanticFailure("No semantic verifier is available."));
    return callMaybeAsync(verifier, [original, rewrite, options.semanticOptions || options.semantic || {}]).then(validateSemanticResult).catch(function (error) {
      errors.push(dependencyError("semantic", error));
      return semanticFailure(error && error.message ? error.message : String(error));
    });
  }

  function runStyleAsync(original, rewrite, options, errors) {
    var comparer = dependency(options, ["styleComparator", "compareStyle", "compareStylisticSignals"]);
    var analyzer = dependency(options, ["styleAnalyzer", "analyzeStyle", "analyzeStylisticSignals", "analyzeText"]);
    if (!comparer && !analyzer) return Promise.resolve(unavailable("style analysis", false));
    var operation = comparer
      ? callMaybeAsync(comparer, [original, rewrite, options.styleOptions || {}]).then(function (result) { return { status: "complete", comparison: result }; })
      : Promise.all([
        callMaybeAsync(analyzer, [original, options.styleOptions || {}]),
        callMaybeAsync(analyzer, [rewrite, options.styleOptions || {}])
      ]).then(function (results) { return { status: "complete", original: results[0], rewrite: results[1] }; });
    return operation.catch(function (error) {
      var failure = dependencyError("style", error);
      errors.push(failure);
      return failure;
    });
  }

  function runVoiceAsync(rewrite, options, errors) {
    var profile = options.voiceProfile || options.profile || null;
    var requested = Boolean(profile || options.requireVoice);
    if (!requested) return Promise.resolve(unavailable("voice comparison", false));
    var comparator = dependency(options, ["voiceComparator", "compareVoice"]);
    if (!comparator) return Promise.resolve(unavailable("voice comparison", true));
    return callMaybeAsync(comparator, [rewrite, profile, options.voiceOptions || {}]).then(function (result) {
      return { status: "complete", profileId: profile && profile.id ? profile.id : null, result: result };
    }).catch(function (error) {
      var failure = dependencyError("voice", error);
      errors.push(failure);
      return failure;
    });
  }

  function runDocumentIntegrityAsync(rewrite, options, errors) {
    var inspector = dependency(options, ["documentIntegrityChecker", "inspectDocumentIntegrity", "checkDocumentIntegrity"]);
    if (!inspector && provenanceModule) inspector = provenanceModule.inspectDocumentIntegrity || provenanceModule.checkDocumentIntegrity;
    if (!inspector) return Promise.resolve(unavailable("document integrity", false));
    return callMaybeAsync(inspector, [rewrite, options.documentIntegrityOptions || {}]).then(function (result) {
      if (!result || typeof result !== "object" || Array.isArray(result) || typeof result.status !== "string") {
        throw new TypeError("Document-integrity checker returned a malformed result.");
      }
      return result;
    }).catch(function (error) {
      var failure = dependencyError("document_integrity", error);
      errors.push(failure);
      return failure;
    });
  }

  function verifyAsync(original, rewrite, options) {
    options = options || {};
    var errors = [];
    var voiceRequested = Boolean(options.voiceProfile || options.profile || options.requireVoice);
    return Promise.all([
      runSemanticAsync(original, rewrite, options, errors),
      runStyleAsync(original, rewrite, options, errors),
      runVoiceAsync(rewrite, options, errors),
      runDocumentIntegrityAsync(rewrite, options, errors)
    ]).then(function (results) {
      return makeResult(results[0], results[1], results[2], voiceRequested, results[3], errors);
    });
  }

  return {
    verify: verify,
    verifyRewrite: verify,
    verifyAsync: verifyAsync
  };
}));
