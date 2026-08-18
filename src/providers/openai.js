(function (root, factory) {
  var api = typeof module === "object" && module.exports
    ? factory(require("./base.js"))
    : factory(root.SapienizeProviderBase);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SapienizeOpenAIProvider = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (base) {
  "use strict";

  function OpenAIProvider(options) {
    options = options || {};
    base.ProviderAdapter.call(this, {
      name: options.name || "openai",
      model: options.model || "gpt-4o-mini",
      apiKey: options.apiKey,
      fetch: options.fetch,
      timeoutMs: options.timeoutMs
    });
    this.url = options.url || "https://api.openai.com/v1/chat/completions";
  }
  OpenAIProvider.prototype = Object.create(base.ProviderAdapter.prototype);
  OpenAIProvider.prototype.constructor = OpenAIProvider;

  function trimAsciiBoundaryWhitespace(value) {
    return value.replace(/^[\u0009-\u000d\u0020]+|[\u0009-\u000d\u0020]+$/g, "");
  }

  function hasRefusal(value) {
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return value != null;
  }

  function completionState(choice) {
    var reason = choice && typeof choice.finish_reason === "string" && choice.finish_reason.trim()
      ? choice.finish_reason.trim()
      : null;
    var refused = Boolean(choice && choice.message && hasRefusal(choice.message.refusal));
    return {
      reason: reason,
      refused: refused,
      complete: reason === "stop" && !refused
    };
  }

  function unusableResponseError(providerName, state) {
    var error = new Error(state.refused
      ? providerName + " refused the rewrite request"
      : providerName + " returned no usable rewrite text");
    error.code = state.refused ? "PROVIDER_REFUSAL" : "PROVIDER_INCOMPLETE";
    error.completionReason = base.safeCompletionReason(state.reason);
    error.incomplete = true;
    return error;
  }

  OpenAIProvider.prototype.rewrite = async function (prompt, context) {
    base.requirePrompt(prompt);
    context = context || {};
    if (!this.apiKey) {
      var missing = new Error(this.name + " requires an API key");
      missing.code = "MISSING_API_KEY";
      throw missing;
    }
    var data = await base.requestJson(this, this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + this.apiKey },
      body: JSON.stringify({
        model: this.model,
        max_tokens: base.dynamicTokenBudget(context.wordCount),
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!base.isRecord(data) || (data.choices != null && !Array.isArray(data.choices))) {
      throw base.malformedResponseError();
    }
    var choice = Array.isArray(data.choices) && data.choices[0];
    if (choice != null && !base.isRecord(choice)) throw base.malformedResponseError();
    if (choice && choice.message != null && !base.isRecord(choice.message)) throw base.malformedResponseError();
    var completion = completionState(choice);
    var content = choice && choice.message && choice.message.content;
    if (content != null && typeof content !== "string" && !Array.isArray(content)) {
      throw base.malformedResponseError();
    }
    if (Array.isArray(content) && content.some(function (part) {
      return !base.isRecord(part) || (part.text != null && typeof part.text !== "string");
    })) {
      throw base.malformedResponseError();
    }
    if (Array.isArray(content)) content = content.map(function (part) { return part && part.text || ""; }).join("\n");
    var text = typeof content === "string" ? trimAsciiBoundaryWhitespace(content) : "";
    if (!text.trim()) throw unusableResponseError(this.name, completion);
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
    OpenAIProvider: OpenAIProvider,
    createOpenAIProvider: function (options) { return new OpenAIProvider(options); }
  };
});
