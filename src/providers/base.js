/* Provider interface and browser-safe request helpers. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SapienizeProviderBase = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function ProviderAdapter(options) {
    options = options || {};
    this.name = options.name || "provider";
    this.model = options.model || "";
    this.apiKey = options.apiKey || "";
    this.fetch = options.fetch || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
    this.timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 90000;
  }

  ProviderAdapter.prototype.rewrite = function () {
    return Promise.reject(new Error("ProviderAdapter.rewrite must be implemented"));
  };

  function dynamicTokenBudget(wordCount) {
    var words = Number.isFinite(wordCount) ? Math.max(0, wordCount) : 0;
    return Math.min(8000, Math.max(1200, Math.round(words * 2.2) + 400));
  }

  function withTimeout(promise, ms) {
    var timer;
    var timeout = new Promise(function (_, reject) {
      timer = setTimeout(function () {
        var error = new Error("Timed out");
        error.name = "TimeoutError";
        reject(error);
      }, ms);
    });
    return Promise.race([promise, timeout]).then(function (value) {
      clearTimeout(timer);
      return value;
    }, function (error) {
      clearTimeout(timer);
      throw error;
    });
  }

  function requireFetch(adapter) {
    if (!adapter.fetch) throw new Error("No fetch implementation is available");
    return adapter.fetch;
  }

  function redactText(value, secrets) {
    var text = String(value);
    (Array.isArray(secrets) ? secrets : [secrets]).filter(Boolean).forEach(function (secret) {
      text = text.split(String(secret)).join("[redacted]");
    });
    return text
      .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [redacted]")
      .replace(/\bsk-(?:ant-|or-)?[A-Za-z0-9._-]{6,}\b/g, "[redacted]");
  }

  function safeProperty(value, key) {
    try { return value[key]; }
    catch (_) { return undefined; }
  }

  function enumerableKeys(value) {
    try { return Object.keys(value); }
    catch (_) { return []; }
  }

  function isErrorLike(value) {
    if (!value || typeof value !== "object") return false;
    try { return value instanceof Error || Object.prototype.toString.call(value) === "[object Error]"; }
    catch (_) { return false; }
  }

  function redactErrorData(value, secrets, seen) {
    if (typeof value === "string") return redactText(value, secrets);
    if (!value || (typeof value !== "object" && typeof value !== "function")) return value;
    seen = seen || [];
    if (seen.indexOf(value) !== -1) return "[circular]";
    seen.push(value);
    var result;
    if (Array.isArray(value)) {
      result = value.map(function (item) { return redactErrorData(item, secrets, seen); });
    } else {
      result = Object.create(null);
      if (isErrorLike(value)) {
        result.name = redactText(safeProperty(value, "name") || "Error", secrets);
        result.message = redactText(safeProperty(value, "message") || "Provider request failed", secrets);
        ["status", "code", "data", "cause"].forEach(function (key) {
          var field = safeProperty(value, key);
          if (field !== undefined) result[key] = redactErrorData(field, secrets, seen);
        });
      }
      enumerableKeys(value).forEach(function (key) {
        if (key === "stack" || Object.prototype.hasOwnProperty.call(result, key)) return;
        var safeKey = redactText(key, secrets);
        if (safeKey === "stack" || Object.prototype.hasOwnProperty.call(result, safeKey)) return;
        result[safeKey] = redactErrorData(safeProperty(value, key), secrets, seen);
      });
    }
    seen.pop();
    return result;
  }

  function defineErrorField(error, key, value) {
    try {
      Object.defineProperty(error, key, {
        value: value,
        writable: true,
        configurable: true,
        enumerable: true
      });
    } catch (_) {}
  }

  var SAFE_PUBLIC_ERROR_NAMES = {
    Error: true,
    TypeError: true,
    SyntaxError: true,
    RangeError: true,
    AbortError: true,
    TimeoutError: true
  };
  var SAFE_PUBLIC_ERROR_CODES = {
    PROVIDER_HTTP_ERROR: true,
    MALFORMED_PROVIDER_RESPONSE: true,
    MISSING_API_KEY: true,
    PROVIDER_REFUSAL: true,
    PROVIDER_INCOMPLETE: true,
    ABORT_ERR: true,
    ECONNABORTED: true,
    ECONNREFUSED: true,
    ECONNRESET: true,
    EAI_AGAIN: true,
    ENOTFOUND: true,
    ETIMEDOUT: true
  };
  var SAFE_COMPLETION_REASONS = {
    end_turn: true,
    max_tokens: true,
    stop_sequence: true,
    tool_use: true,
    pause_turn: true,
    refusal: true,
    stop: true,
    length: true,
    content_filter: true,
    tool_calls: true,
    function_call: true
  };

  function safePublicErrorName(value) {
    return typeof value === "string" && SAFE_PUBLIC_ERROR_NAMES[value] ? value : "Error";
  }

  function safePublicErrorCode(value) {
    return typeof value === "string" && SAFE_PUBLIC_ERROR_CODES[value] ? value : null;
  }

  function safePublicStatus(value) {
    return Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
  }

  function safeCompletionReason(value) {
    if (value === null || value === undefined || value === "") return null;
    return typeof value === "string" && SAFE_COMPLETION_REASONS[value] ? value : "unknown";
  }

  function fixedPublicErrorMessage(source, name, code, status) {
    if (name === "TimeoutError") return "Timed out";
    if (code === "PROVIDER_HTTP_ERROR") {
      return status === null ? "Provider request failed" : "Provider request failed with HTTP " + status;
    }
    if (code === "MALFORMED_PROVIDER_RESPONSE") {
      return safeProperty(source, "message") === "Provider returned malformed JSON"
        ? "Provider returned malformed JSON"
        : "Provider returned malformed response data";
    }
    if (safeProperty(source, "message") === "No fetch implementation is available") {
      return "No fetch implementation is available";
    }
    return "Provider request failed";
  }

  function redactedMetadata() {
    return { redacted: true };
  }

  function sanitizeProviderError(error, secrets) {
    var source = error && typeof error === "object" ? error : null;
    var sourceName = source && safeProperty(source, "name");
    var name = safePublicErrorName(sourceName);
    var code = source && safePublicErrorCode(safeProperty(source, "code"));
    var status = source && safePublicStatus(safeProperty(source, "status"));
    var sanitized = new Error(fixedPublicErrorMessage(source, name, code, status));
    sanitized.name = name;

    if (!source) return sanitized;
    if (status !== null) defineErrorField(sanitized, "status", status);
    if (code) defineErrorField(sanitized, "code", code);
    ["incomplete", "truncated", "refused"].forEach(function (key) {
      var field = safeProperty(source, key);
      if (typeof field === "boolean") defineErrorField(sanitized, key, field);
    });
    ["raw", "data", "cause"].forEach(function (key) {
      if (safeProperty(source, key) !== undefined) defineErrorField(sanitized, key, redactedMetadata());
    });
    return sanitized;
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function malformedResponseError() {
    var error = new Error("Provider returned malformed response data");
    error.code = "MALFORMED_PROVIDER_RESPONSE";
    error.incomplete = true;
    return error;
  }

  function requestSecrets(adapter, options) {
    var secrets = [adapter && adapter.apiKey];
    var body = options && options.body;
    if (typeof body !== "string" || !body) return secrets;
    secrets.push(body);
    try {
      var parsed = JSON.parse(body);
      if (typeof parsed.prompt === "string") secrets.push(parsed.prompt);
      if (typeof parsed.input === "string") secrets.push(parsed.input);
      if (Array.isArray(parsed.messages)) {
        parsed.messages.forEach(function (message) {
          if (!message) return;
          if (typeof message.content === "string") secrets.push(message.content);
          else if (Array.isArray(message.content)) {
            message.content.forEach(function (part) {
              if (part && typeof part.text === "string") secrets.push(part.text);
            });
          }
        });
      }
    } catch (_) {}
    return secrets.filter(function (value, index) {
      return typeof value === "string" && value.length > 0 && secrets.indexOf(value) === index;
    });
  }

  async function responseJson(response, secrets) {
    var data;
    try { data = await response.json(); }
    catch (error) {
      var malformed = new Error("Provider returned malformed JSON");
      malformed.status = response && response.status;
      malformed.code = "MALFORMED_PROVIDER_RESPONSE";
      malformed.incomplete = true;
      malformed.cause = error;
      throw malformed;
    }
    if (!response.ok) {
      var requestError = new Error("Provider request failed with HTTP " + response.status);
      requestError.status = response.status;
      requestError.code = "PROVIDER_HTTP_ERROR";
      requestError.raw = redactedMetadata();
      throw requestError;
    }
    return data;
  }

  async function requestJson(adapter, url, options) {
    var secrets = requestSecrets(adapter, options);
    try {
      var operation = Promise.resolve().then(function () {
        return requireFetch(adapter)(url, options);
      }).then(function (response) {
        return responseJson(response, secrets);
      });
      return await withTimeout(operation, adapter.timeoutMs);
    } catch (error) {
      throw sanitizeProviderError(error, secrets);
    }
  }

  function requirePrompt(prompt) {
    if (typeof prompt !== "string" || !prompt.trim()) throw new TypeError("prompt must be a non-empty string");
    return prompt;
  }

  return {
    ProviderAdapter: ProviderAdapter,
    dynamicTokenBudget: dynamicTokenBudget,
    withTimeout: withTimeout,
    requireFetch: requireFetch,
    responseJson: responseJson,
    requestJson: requestJson,
    redactText: redactText,
    redactErrorData: redactErrorData,
    sanitizeProviderError: sanitizeProviderError,
    safeCompletionReason: safeCompletionReason,
    isRecord: isRecord,
    malformedResponseError: malformedResponseError,
    requestSecrets: requestSecrets,
    requirePrompt: requirePrompt
  };
});
