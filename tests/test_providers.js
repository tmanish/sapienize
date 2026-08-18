"use strict";
const assert = require("assert");
const providers = require("../src/providers/index.js");

function publicErrorSnapshot(error) {
  const enumerable = Object.create(null);
  for (const key of Object.keys(error)) enumerable[key] = error[key];
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    status: error.status,
    code: error.code,
    data: error.data,
    cause: error.cause,
    raw: error.raw,
    enumerable
  };
}

async function main() {
  let captured;
  const anthropic = providers.createProvider("anthropic", {
    apiKey: "sk-ant-test",
    model: "claude-test",
    fetch: async (url, options) => {
      captured = { url, options };
      return { ok: true, status: 200, json: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "Rewritten." }] }) };
    }
  });
  const result = await anthropic.rewrite("Rewrite this", { wordCount: 900 });
  assert.strictEqual(result.text, "Rewritten.");
  assert.strictEqual(result.truncated, false);
  assert.strictEqual(result.incomplete, false);
  assert.strictEqual(result.completionReason, "end_turn");
  assert.strictEqual(result.completionStatus, "complete");
  assert.strictEqual(captured.options.headers["x-api-key"], "sk-ant-test");
  assert.strictEqual(captured.options.headers["anthropic-dangerous-direct-browser-access"], "true");
  assert.ok(JSON.parse(captured.options.body).max_tokens > 1000);
  assert.ok(!Object.prototype.hasOwnProperty.call(captured.options, "signal"));

  const keyless = providers.createProvider("anthropic", {
    fetch: async (url, options) => {
      captured = { url, options };
      return { ok: true, status: 200, json: async () => ({ stop_reason: "max_tokens", content: [{ type: "text", text: "Partial" }] }) };
    }
  });
  const partial = await keyless.rewrite("Rewrite this", { wordCount: 900 });
  assert.strictEqual(partial.truncated, true);
  assert.strictEqual(partial.incomplete, true);
  assert.strictEqual(partial.completionReason, "max_tokens");
  assert.strictEqual(partial.completionStatus, "incomplete");
  assert.strictEqual(JSON.parse(captured.options.body).max_tokens, 1000);
  assert.ok(!captured.options.headers["x-api-key"]);

  for (const stopReason of ["pause_turn", "refusal", "unexpected_reason", undefined]) {
    const provider = providers.createProvider("anthropic", {
      apiKey: "sk-ant-test",
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ stop_reason: stopReason, content: [{ type: "text", text: "Partial response" }] })
      })
    });
    const output = await provider.rewrite("Rewrite this");
    assert.strictEqual(output.truncated, true, `Anthropic ${stopReason || "missing"} must be incomplete`);
    assert.strictEqual(output.incomplete, true);
    assert.strictEqual(output.completionStatus, "incomplete");
    assert.strictEqual(output.completionReason, stopReason === "unexpected_reason" ? "unknown" : (stopReason || null));
    assert.strictEqual(output.refused, stopReason === "refusal");
  }

  const anthropicRefusal = providers.createProvider("anthropic", {
    apiKey: "sk-ant-test",
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ stop_reason: "refusal", content: [{ type: "refusal", text: "private refusal detail" }] })
    })
  });
  await assert.rejects(() => anthropicRefusal.rewrite("Rewrite this"), error => {
    return error.code === "PROVIDER_REFUSAL" && error.incomplete === true &&
      error.completionReason === "refusal" && !error.message.includes("private refusal detail");
  });

  for (const [name, expectedUrl] of [["openai", "api.openai.com"], ["openrouter", "openrouter.ai"]]) {
    const provider = providers.createProvider(name, {
      apiKey: "sk-test",
      fetch: async (url, options) => {
        captured = { url, options };
        return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: "stop", message: { content: "Plain result" } }] }) };
      }
    });
    const output = await provider.rewrite("Rewrite this", { wordCount: 100 });
    assert.strictEqual(output.text, "Plain result");
    assert.strictEqual(output.truncated, false);
    assert.strictEqual(output.incomplete, false);
    assert.strictEqual(output.completionReason, "stop");
    assert.strictEqual(output.completionStatus, "complete");
    assert.ok(captured.url.includes(expectedUrl));
    assert.strictEqual(captured.options.headers.Authorization, "Bearer sk-test");
  }

  for (const finishReason of ["length", "content_filter", "tool_calls", "unexpected_reason", undefined]) {
    const provider = providers.createProvider("openai", {
      apiKey: "sk-test",
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ finish_reason: finishReason, message: { content: "Partial response" } }] })
      })
    });
    const output = await provider.rewrite("Rewrite this");
    assert.strictEqual(output.truncated, true, `OpenAI ${finishReason || "missing"} must be incomplete`);
    assert.strictEqual(output.incomplete, true);
    assert.strictEqual(output.completionStatus, "incomplete");
    assert.strictEqual(output.completionReason, finishReason === "unexpected_reason" ? "unknown" : (finishReason || null));
  }

  for (const name of ["anthropic", "openai", "openrouter"]) {
    const privateReason = "Bearer sk-private-secret-123456";
    const payload = name === "anthropic"
      ? { stop_reason: privateReason, content: [{ type: "text", text: "Usable partial response" }] }
      : { choices: [{ finish_reason: privateReason, message: { content: "Usable partial response" } }] };
    const provider = providers.createProvider(name, {
      apiKey: `fixture-${name}-usable-reason-key`,
      fetch: async () => ({ ok: true, status: 200, json: async () => payload })
    });
    const output = await provider.rewrite("Rewrite this");
    assert.strictEqual(output.incomplete, true);
    assert.strictEqual(output.completionReason, "unknown");
    assert.ok(!output.completionReason.includes(privateReason), `${name} normalized completion reason leaked provider data`);
  }

  const refusedWithText = providers.createProvider("openai", {
    apiKey: "sk-test",
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ finish_reason: "stop", message: { content: "I cannot comply.", refusal: "private refusal detail" } }] })
    })
  });
  const refusedOutput = await refusedWithText.rewrite("Rewrite this");
  assert.strictEqual(refusedOutput.truncated, true);
  assert.strictEqual(refusedOutput.incomplete, true);
  assert.strictEqual(refusedOutput.refused, true);

  const refusalWithoutText = providers.createProvider("openai", {
    apiKey: "sk-test",
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ finish_reason: "stop", message: { content: null, refusal: "private refusal detail" } }] })
    })
  });
  await assert.rejects(() => refusalWithoutText.rewrite("Rewrite this"), error => {
    return error.code === "PROVIDER_REFUSAL" && error.incomplete === true &&
      error.completionReason === "stop" && !error.message.includes("private refusal detail");
  });

  for (const name of ["anthropic", "openai"]) {
    const response = name === "anthropic"
      ? { stop_reason: "end_turn", content: [{ type: "text", text: " \n\uFEFFPreserve me\uFEFF\t " }] }
      : { choices: [{ finish_reason: "stop", message: { content: " \n\uFEFFPreserve me\uFEFF\t " } }] };
    const provider = providers.createProvider(name, {
      apiKey: "sk-test",
      fetch: async () => ({ ok: true, status: 200, json: async () => response })
    });
    const output = await provider.rewrite("Rewrite this");
    assert.strictEqual(output.text, "\uFEFFPreserve me\uFEFF", `${name} must preserve boundary FEFF for integrity inspection`);
  }

  await assert.rejects(() => providers.createProvider("openai", { fetch: async () => null }).rewrite("Rewrite this"), error => error.code === "MISSING_API_KEY");
  assert.throws(() => providers.createProvider("unknown"), /Unknown provider/);

  const failing = providers.createProvider("openai", {
    apiKey: "fixture-secret-value",
    fetch: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: "invalid key fixture-secret-value", echoed: "Bearer fixture-secret-value" } }) })
  });
  await assert.rejects(() => failing.rewrite("Rewrite this"), error => {
    const serialized = JSON.stringify({ message: error.message, raw: error.raw });
    return error.status === 401 && error.code === "PROVIDER_HTTP_ERROR" &&
      error.message === "Provider request failed with HTTP 401" &&
      !serialized.includes("fixture-secret-value") &&
      error.raw && error.raw.redacted === true;
  });

  for (const name of ["anthropic", "openai", "openrouter"]) {
    const privatePrompt = "Rewrite faithfully. Private patient Alice has diagnosis ZXQ-771 and balance 98765. Do not expose this.";
    const privateFragment = "Private patient Alice has diagnosis ZXQ-771";
    const promptEcho = providers.createProvider(name, {
      apiKey: `fixture-${name}-prompt-echo-key`,
      fetch: async () => ({
        ok: false,
        status: 400,
        json: async () => ({
          error: { message: "Invalid content near: " + privateFragment, detail: privateFragment },
          [privateFragment]: "provider-controlled property name"
        })
      })
    });
    await assert.rejects(() => promptEcho.rewrite(privatePrompt), error => {
      const serialized = JSON.stringify(publicErrorSnapshot(error));
      assert.strictEqual(error.message, "Provider request failed with HTTP 400");
      assert.strictEqual(error.code, "PROVIDER_HTTP_ERROR");
      assert.deepStrictEqual(error.raw, { redacted: true });
      assert.ok(!serialized.includes(privateFragment), `${name} HTTP error leaked a partial prompt echo`);
      return true;
    });
  }

  for (const name of ["anthropic", "openai", "openrouter"]) {
    const apiKey = `fixture-${name}-transport-secret`;
    const privateFragment = `Private ${name} transport draft fragment ZXQ-771`;
    const transportFailure = new TypeError(`transport rejected ${privateFragment} ${apiKey}`);
    transportFailure.status = 503;
    transportFailure.code = "ECONNRESET";
    transportFailure.data = {
      authorization: `Bearer ${apiKey}`,
      nested: { token: apiKey, prompt: privateFragment }
    };
    transportFailure.data[apiKey] = "secret-bearing property name";
    transportFailure[privateFragment] = "private-fragment property name";
    transportFailure[apiKey] = "secret-bearing error property name";
    transportFailure.cause = new Error(`socket failure ${privateFragment} ${apiKey}`);
    const provider = providers.createProvider(name, {
      apiKey,
      fetch: async () => { throw transportFailure; }
    });
    await assert.rejects(() => provider.rewrite("Rewrite this"), error => {
      const serialized = JSON.stringify(publicErrorSnapshot(error));
      assert.ok(error instanceof Error);
      assert.strictEqual(error.name, "TypeError");
      assert.strictEqual(error.message, "Provider request failed");
      assert.strictEqual(error.status, 503);
      assert.strictEqual(error.code, "ECONNRESET");
      assert.deepStrictEqual(error.data, { redacted: true });
      assert.deepStrictEqual(error.cause, { redacted: true });
      assert.ok(!serialized.includes(apiKey), `${name} transport rejection leaked its API key`);
      assert.ok(!serialized.includes(privateFragment), `${name} transport rejection leaked a partial prompt echo`);
      return true;
    });
  }

  for (const name of ["anthropic", "openai", "openrouter"]) {
    const apiKey = `fixture-${name}-json-secret`;
    const privateFragment = `Private ${name} JSON draft fragment ZXQ-771`;
    const nested = new Error(`nested parser cause ${privateFragment} ${apiKey}`);
    nested.data = { authorization: `Bearer ${apiKey}`, prompt: privateFragment };
    const parseFailure = new SyntaxError(`malformed payload ${privateFragment} ${apiKey}`, { cause: nested });
    parseFailure.code = "BAD_JSON";
    parseFailure.data = { echoedKey: apiKey, echoedPrompt: privateFragment };
    parseFailure[privateFragment] = "private-fragment property name";
    const provider = providers.createProvider(name, {
      apiKey,
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => { throw parseFailure; }
      })
    });
    await assert.rejects(() => provider.rewrite("Rewrite this"), error => {
      const serialized = JSON.stringify(publicErrorSnapshot(error));
      assert.ok(error instanceof Error);
      assert.strictEqual(error.name, "Error");
      assert.strictEqual(error.message, "Provider returned malformed JSON");
      assert.strictEqual(error.status, 200);
      assert.strictEqual(error.code, "MALFORMED_PROVIDER_RESPONSE");
      assert.strictEqual(error.incomplete, true);
      assert.deepStrictEqual(error.cause, { redacted: true });
      assert.ok(!serialized.includes(apiKey), `${name} malformed JSON rejection leaked its API key`);
      assert.ok(!serialized.includes(privateFragment), `${name} malformed JSON rejection leaked a partial prompt echo`);
      return true;
    });
  }

  for (const name of ["anthropic", "openai", "openrouter"]) {
    const apiKey = `fixture-${name}-shape-secret`;
    const wrongContainer = name === "anthropic"
      ? { stop_reason: "end_turn", content: { secret: apiKey } }
      : { choices: { secret: apiKey } };
    for (const payload of [null, wrongContainer]) {
      const provider = providers.createProvider(name, {
        apiKey,
        fetch: async () => ({ ok: true, status: 200, json: async () => payload })
      });
      await assert.rejects(() => provider.rewrite("Rewrite this"), error => {
        const serialized = JSON.stringify(publicErrorSnapshot(error));
        assert.ok(error instanceof Error);
        assert.strictEqual(error.name, "Error");
        assert.strictEqual(error.message, "Provider returned malformed response data");
        assert.strictEqual(error.code, "MALFORMED_PROVIDER_RESPONSE");
        assert.strictEqual(error.incomplete, true);
        assert.ok(!serialized.includes(apiKey), `${name} malformed response shape leaked response data`);
        return true;
      });
    }
  }

  for (const name of ["anthropic", "openai", "openrouter"]) {
    const privateReason = `Private ${name} completion reason fragment ZXQ-771`;
    const payload = name === "anthropic"
      ? { stop_reason: privateReason, content: [] }
      : { choices: [{ finish_reason: privateReason, message: { content: null } }] };
    const provider = providers.createProvider(name, {
      apiKey: `fixture-${name}-reason-key`,
      fetch: async () => ({ ok: true, status: 200, json: async () => payload })
    });
    await assert.rejects(() => provider.rewrite("Rewrite this"), error => {
      const serialized = JSON.stringify(publicErrorSnapshot(error));
      assert.strictEqual(error.code, "PROVIDER_INCOMPLETE");
      assert.strictEqual(error.completionReason, "unknown");
      assert.ok(!serialized.includes(privateReason), `${name} unusable response leaked a provider-controlled completion reason`);
      return true;
    });
  }

  const timedOut = providers.createProvider("openai", {
    apiKey: "fixture-timeout-secret",
    timeoutMs: 5,
    fetch: async () => new Promise(() => {})
  });
  await assert.rejects(() => timedOut.rewrite("Rewrite this"), error => {
    assert.strictEqual(error.name, "TimeoutError");
    assert.strictEqual(error.message, "Timed out");
    return true;
  });

  for (const name of ["anthropic", "openai", "openrouter"]) {
    const stalledBody = providers.createProvider(name, {
      apiKey: "fixture-body-timeout-secret",
      timeoutMs: 5,
      fetch: async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) })
    });
    await assert.rejects(() => stalledBody.rewrite("Rewrite this"), error => {
      assert.strictEqual(error.name, "TimeoutError");
      assert.strictEqual(error.message, "Timed out");
      return true;
    });
  }
  console.log("PASS: provider-neutral Anthropic, OpenAI, and OpenRouter contracts");
}

main().catch(error => { console.error(error); process.exit(1); });
