(function (root, factory) {
  var api = typeof module === "object" && module.exports
    ? factory(require("./base.js"))
    : factory(root.SapienizeProviderBase);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SapienizeAnthropicProvider = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (base) {
  "use strict";

  function AnthropicProvider(options) {
    options = options || {};
    base.ProviderAdapter.call(this, {
      name: "anthropic",
      model: options.model || "claude-sonnet-4-6",
      apiKey: options.apiKey,
      fetch: options.fetch,
      timeoutMs: options.timeoutMs
    });
    this.url = options.url || "https://api.anthropic.com/v1/messages";
  }
  AnthropicProvider.prototype = Object.create(base.ProviderAdapter.prototype);
  AnthropicProvider.prototype.constructor = AnthropicProvider;

  function trimAsciiBoundaryWhitespace(value) {
    return value.replace(/^[\u0009-\u000d\u0020]+|[\u0009-\u000d\u0020]+$/g, "");
  }

  function completionState(data) {
    var reason = typeof data.stop_reason === "string" && data.stop_reason.trim()
      ? data.stop_reason.trim()
      : null;
    var refused = reason === "refusal" || (data.content || []).some(function (block) {
      return block && (block.type === "refusal" || block.refusal != null);
    });
    return {
      reason: reason,
      refused: refused,
      complete: reason === "end_turn" && !refused
    };
  }

  function unusableResponseError(state) {
    var error = new Error(state.refused
      ? "Anthropic refused the rewrite request"
      : "Anthropic returned no usable rewrite text");
    error.code = state.refused ? "PROVIDER_REFUSAL" : "PROVIDER_INCOMPLETE";
    error.completionReason = base.safeCompletionReason(state.reason);
    error.incomplete = true;
    return error;
  }

  AnthropicProvider.prototype.rewrite = async function (prompt, context) {
    base.requirePrompt(prompt);
    context = context || {};
    var headers = { "Content-Type": "application/json" };
    var maxTokens = 1000;
    if (this.apiKey) {
      headers["x-api-key"] = this.apiKey;
      headers["anthropic-version"] = "2023-06-01";
      headers["anthropic-dangerous-direct-browser-access"] = "true";
      maxTokens = base.dynamicTokenBudget(context.wordCount);
    }
    var data = await base.requestJson(this, this.url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!base.isRecord(data) || (data.content != null && !Array.isArray(data.content))) {
      throw base.malformedResponseError();
    }
    if (Array.isArray(data.content) && data.content.some(function (block) {
      return !base.isRecord(block) || (block.type === "text" && typeof block.text !== "string");
    })) {
      throw base.malformedResponseError();
    }
    var completion = completionState(data);
    var text = (data.content || []).filter(function (block) { return block && block.type === "text"; })
      .map(function (block) { return block.text || ""; }).join("\n");
    text = trimAsciiBoundaryWhitespace(text);
    if (!text.trim()) throw unusableResponseError(completion);
    return {
      text: text,
      truncated: !completion.complete,
      incomplete: !completion.complete,
      completionReason: base.safeCompletionReason(completion.reason),
      completionStatus: completion.complete ? "complete" : "incomplete",
      refused: completion.refused,
      raw: data,
      provider: this.name,
      model: this.model
    };
  };

  return {
    AnthropicProvider: AnthropicProvider,
    createAnthropicProvider: function (options) { return new AnthropicProvider(options); }
  };
});
