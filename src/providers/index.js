(function (root, factory) {
  var api = typeof module === "object" && module.exports
    ? factory(require("./base.js"), require("./anthropic.js"), require("./openai.js"), require("./openrouter.js"))
    : factory(root.SapienizeProviderBase, root.SapienizeAnthropicProvider, root.SapienizeOpenAIProvider, root.SapienizeOpenRouterProvider);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SapienizeProviders = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (base, anthropic, openai, openrouter) {
  "use strict";

  var PROVIDER_DEFAULTS = {
    anthropic: { model: "claude-sonnet-4-6", keyHint: "sk-ant-..." },
    openai: { model: "gpt-4o-mini", keyHint: "sk-..." },
    openrouter: { model: "openai/gpt-4o-mini", keyHint: "sk-or-..." }
  };

  function createProvider(name, options) {
    name = name || "anthropic";
    if (name === "anthropic") return anthropic.createAnthropicProvider(options);
    if (name === "openai") return openai.createOpenAIProvider(options);
    if (name === "openrouter") return openrouter.createOpenRouterProvider(options);
    throw new RangeError("Unknown provider: " + name);
  }

  return {
    createProvider: createProvider,
    safeCompletionReason: base.safeCompletionReason,
    defaults: PROVIDER_DEFAULTS,
    AnthropicProvider: anthropic.AnthropicProvider,
    OpenAIProvider: openai.OpenAIProvider,
    OpenRouterProvider: openrouter.OpenRouterProvider
  };
});
