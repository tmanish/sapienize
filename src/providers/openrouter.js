(function (root, factory) {
  var api = typeof module === "object" && module.exports
    ? factory(require("./openai.js"))
    : factory(root.SapienizeOpenAIProvider);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SapienizeOpenRouterProvider = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (openai) {
  "use strict";

  function OpenRouterProvider(options) {
    options = options || {};
    openai.OpenAIProvider.call(this, {
      name: "openrouter",
      model: options.model || "openai/gpt-4o-mini",
      apiKey: options.apiKey,
      fetch: options.fetch,
      timeoutMs: options.timeoutMs,
      url: options.url || "https://openrouter.ai/api/v1/chat/completions"
    });
  }
  OpenRouterProvider.prototype = Object.create(openai.OpenAIProvider.prototype);
  OpenRouterProvider.prototype.constructor = OpenRouterProvider;

  return {
    OpenRouterProvider: OpenRouterProvider,
    createOpenRouterProvider: function (options) { return new OpenRouterProvider(options); }
  };
});
