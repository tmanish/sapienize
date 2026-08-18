#!/usr/bin/env node
"use strict";

/*
 * Dependency-free command-line adapter for the provider-neutral Sapienize core.
 * Keep command behavior in run() so callers can inject streams and providers in
 * tests without mutating process globals or making network requests.
 */

const fs = require("fs");
const path = require("path");

const EXIT_CODES = Object.freeze({
  success: 0,
  operationalError: 1,
  usageError: 2,
  verificationFailed: 3,
  reviewRequired: 4
});

const PROVIDER_ENV = Object.freeze({
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY"
});

const SECRET_FIELD_RE = /^(?:api[-_]?key|authorization|access[-_]?token|secret)$/i;

const HELP = `Sapienize v2 command-line interface

Usage:
  sapienize scan <file|-> [--output <file>]
  sapienize profile <file|directory|-> [--output <file>]
  sapienize rewrite <file|-> --voice <profile.json> [options]
  sapienize verify <original> <rewrite> [--output <file>]
  sapienize provenance <file|-> [--output <file>]
  sapienize eval <dataset.json|dataset.jsonl|-> [options]

Rewrite options:
  --voice <file>             VoiceProfile JSON (required)
  --provider <name>          anthropic, openai, or openrouter (default: anthropic)
  --model <name>             Override the provider's default model
  --api-key-env <name>       Read the API key from this environment variable
  --persona <text>           Optional requested persona

Evaluation options:
  --observations <file|->    JSON or JSONL detector observations

General options:
  --output <file|->          Write JSON to a file (or - for stdout)
  -h, --help                 Show this help

Exit codes:
  0 success, 1 operational/data error, 2 usage error,
  3 semantic verification failed, 4 review required
`;

class CliError extends Error {
  constructor(message, code, exitCode) {
    super(message);
    this.name = "CliError";
    this.code = code || "CLI_ERROR";
    this.exitCode = exitCode === undefined ? EXIT_CODES.operationalError : exitCode;
  }
}

function usageError(message) {
  return new CliError(message, "USAGE_ERROR", EXIT_CODES.usageError);
}

function dataError(message) {
  return new CliError(message, "INVALID_INPUT", EXIT_CODES.operationalError);
}

function compareNames(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function writeTo(destination, value) {
  if (!destination) return;
  if (typeof destination === "function") {
    destination(value);
    return;
  }
  if (typeof destination.write === "function") {
    destination.write(value);
    return;
  }
  throw new TypeError("output destination must be a function or expose write()");
}

function isBrokenPipe(error) {
  return Boolean(error && error.code === "EPIPE");
}

function installExecutableOutputHandlers(processObject) {
  [processObject.stdout, processObject.stderr].forEach(stream => {
    if (!stream || typeof stream.on !== "function") return;
    stream.on("error", error => {
      processObject.exitCode = isBrokenPipe(error)
        ? EXIT_CODES.success
        : EXIT_CODES.operationalError;
    });
  });
}

function resolveIo(io) {
  const supplied = io || {};
  return {
    stdin: supplied.stdin === undefined ? process.stdin : supplied.stdin,
    stdout: supplied.stdout === undefined ? process.stdout : supplied.stdout,
    stderr: supplied.stderr === undefined ? process.stderr : supplied.stderr,
    env: supplied.env === undefined ? process.env : supplied.env,
    cwd: supplied.cwd === undefined ? process.cwd() : supplied.cwd,
    readStdin: supplied.readStdin
  };
}

function resolveDependencies(overrides) {
  const supplied = overrides || {};
  const providerFactory = supplied.createProvider ||
    (supplied.providers && typeof supplied.providers.createProvider === "function"
      ? supplied.providers.createProvider.bind(supplied.providers)
      : undefined);
  return {
    fs: supplied.fs || fs,
    path: supplied.path || path,
    core: supplied.core || require("../core/index.js"),
    dataset: supplied.dataset || require("../../eval/dataset.js"),
    evaluator: supplied.evaluator || require("../../eval/evaluator.js"),
    provider: supplied.provider,
    createProvider: providerFactory
  };
}

function optionValue(tokens, index, inlineValue, option) {
  if (inlineValue !== undefined) {
    if (!inlineValue) throw usageError(option + " requires a value");
    return { value: inlineValue, nextIndex: index };
  }
  if (index + 1 >= tokens.length || (tokens[index + 1].startsWith("-") && tokens[index + 1] !== "-")) {
    throw usageError(option + " requires a value");
  }
  return { value: tokens[index + 1], nextIndex: index + 1 };
}

function parseCommandArguments(tokens, allowedOptions) {
  const options = {};
  const positionals = [];
  let positionalOnly = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!positionalOnly && token === "--") {
      positionalOnly = true;
      continue;
    }
    if (!positionalOnly && (token === "--help" || token === "-h")) {
      options.help = true;
      continue;
    }
    if (!positionalOnly && token.startsWith("--")) {
      const equals = token.indexOf("=");
      const option = equals === -1 ? token : token.slice(0, equals);
      const inlineValue = equals === -1 ? undefined : token.slice(equals + 1);
      if (!allowedOptions.has(option)) throw usageError("unknown option `" + option + "`");
      const name = option.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
      if (Object.prototype.hasOwnProperty.call(options, name)) throw usageError("duplicate option `" + option + "`");
      const parsed = optionValue(tokens, index, inlineValue, option);
      options[name] = parsed.value;
      index = parsed.nextIndex;
      continue;
    }
    if (!positionalOnly && token.startsWith("-") && token !== "-") {
      throw usageError("unknown option `" + token + "`");
    }
    positionals.push(token);
  }

  return { options, positionals };
}

function requirePositionals(command, parsed, count, syntax) {
  if (parsed.positionals.length !== count) {
    throw usageError(command + " expects " + syntax);
  }
}

function rejectRepeatedStdin(command, inputTargets) {
  const count = inputTargets.filter(target => target === "-").length;
  if (count > 1) {
    throw usageError(command + " cannot read more than one input from stdin; use a file for the other input");
  }
}

function absolutePath(filePath, context) {
  return context.deps.path.resolve(context.io.cwd, filePath);
}

function streamText(stream) {
  if (typeof stream === "string") return Promise.resolve(stream);
  if (Buffer.isBuffer(stream)) return Promise.resolve(stream.toString("utf8"));
  if (!stream) return Promise.resolve("");
  if (typeof stream[Symbol.asyncIterator] === "function") {
    return (async () => {
      const chunks = [];
      for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      return Buffer.concat(chunks).toString("utf8");
    })();
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    stream.on("error", reject);
  });
}

async function readStdin(context) {
  if (!context.stdinPromise) {
    context.stdinPromise = context.io.readStdin
      ? Promise.resolve().then(() => context.io.readStdin())
      : streamText(context.io.stdin);
  }
  const value = await context.stdinPromise;
  if (typeof value !== "string" && !Buffer.isBuffer(value)) throw dataError("stdin must provide text or a Buffer");
  return String(value);
}

async function readInput(target, context) {
  if (target === "-") return readStdin(context);
  const resolved = absolutePath(target, context);
  let stat;
  try {
    stat = context.deps.fs.statSync(resolved);
  } catch (error) {
    throw dataError("cannot read `" + target + "`: " + error.message);
  }
  if (!stat.isFile()) throw dataError("`" + target + "` is not a file");
  try {
    return context.deps.fs.readFileSync(resolved, "utf8");
  } catch (error) {
    throw dataError("cannot read `" + target + "`: " + error.message);
  }
}

async function readProfileSamples(target, outputTarget, context) {
  if (target === "-") return readStdin(context);
  const resolved = absolutePath(target, context);
  let stat;
  try {
    stat = context.deps.fs.statSync(resolved);
  } catch (error) {
    throw dataError("cannot read `" + target + "`: " + error.message);
  }
  if (stat.isFile()) return readInput(target, context);
  if (!stat.isDirectory()) throw dataError("`" + target + "` is neither a file nor a directory");

  const skippedOutput = outputTarget && outputTarget !== "-" ? absolutePath(outputTarget, context) : null;
  let files;
  try {
    files = context.deps.fs.readdirSync(resolved, { withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => context.deps.path.join(resolved, entry.name))
      .filter(file => file !== skippedOutput)
      .sort(compareNames);
  } catch (error) {
    throw dataError("cannot read directory `" + target + "`: " + error.message);
  }
  if (!files.length) throw dataError("directory `" + target + "` contains no files");
  return files.map(file => {
    try {
      return context.deps.fs.readFileSync(file, "utf8");
    } catch (error) {
      throw dataError("cannot read `" + context.deps.path.relative(context.io.cwd, file) + "`: " + error.message);
    }
  });
}

function parseJson(text, label) {
  try {
    return JSON.parse(String(text).replace(/^\uFEFF/, ""));
  } catch (error) {
    throw dataError("invalid JSON in `" + label + "`: " + error.message);
  }
}

function parseObservations(text, label) {
  const input = String(text).replace(/^\uFEFF/, "");
  const isJsonLines = /\.(?:jsonl|ndjson)$/i.test(label);
  if (isJsonLines) return parseObservationLines(input, label);
  try {
    const decoded = JSON.parse(input);
    return decoded && !Array.isArray(decoded) && typeof decoded.id === "string" ? [decoded] : decoded;
  } catch (_jsonError) {
    return parseObservationLines(input, label);
  }
}

function parseObservationLines(input, label) {
  const values = [];
  const lines = input.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    try {
      values.push(JSON.parse(line));
    } catch (error) {
      throw dataError("invalid JSONL in `" + label + "` at line " + (index + 1) + ": " + error.message);
    }
  }
  if (!values.length) throw dataError("observations `" + label + "` are empty");
  return values;
}

function redact(value, secrets, seen) {
  const activeSecrets = secrets.filter(secret => typeof secret === "string" && secret.length > 0);
  if (typeof value === "string") {
    return activeSecrets.reduce((text, secret) => text.split(secret).join("[REDACTED]"), value);
  }
  if (value === null || typeof value !== "object") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  const visited = seen || new WeakSet();
  if (visited.has(value)) return "[Circular]";
  visited.add(value);
  try {
    if (Array.isArray(value)) return value.map(item => redact(item, activeSecrets, visited));
    const result = Object.create(null);
    for (const key of Object.keys(value)) {
      result[key] = SECRET_FIELD_RE.test(key) ? "[REDACTED]" : redact(value[key], activeSecrets, visited);
    }
    return result;
  } finally {
    visited.delete(value);
  }
}

function jsonLine(value, secrets) {
  const serialized = JSON.stringify(redact(value, secrets || [], new WeakSet()), null, 2);
  if (serialized === undefined) throw new TypeError("command returned no JSON result");
  return serialized + "\n";
}

function writeResult(value, outputTarget, context) {
  const serialized = jsonLine(value, context.secrets);
  if (!outputTarget || outputTarget === "-") {
    writeTo(context.io.stdout, serialized);
    return;
  }
  const resolved = absolutePath(outputTarget, context);
  try {
    context.deps.fs.writeFileSync(resolved, serialized, "utf8");
  } catch (error) {
    throw new CliError("cannot write `" + outputTarget + "`: " + error.message, "OUTPUT_ERROR");
  }
}

async function scanCommand(parsed, context) {
  requirePositionals("scan", parsed, 1, "<file|->");
  const text = await readInput(parsed.positionals[0], context);
  const result = await Promise.resolve(context.deps.core.scan
    ? context.deps.core.scan(text)
    : context.deps.core.analyze(text));
  writeResult(result, parsed.options.output, context);
  return EXIT_CODES.success;
}

async function profileCommand(parsed, context) {
  requirePositionals("profile", parsed, 1, "<file|directory|->");
  const samples = await readProfileSamples(parsed.positionals[0], parsed.options.output, context);
  const result = await Promise.resolve(context.deps.core.createVoiceProfile(samples));
  writeResult(result, parsed.options.output, context);
  return EXIT_CODES.success;
}

function providerForRewrite(name, configuration, context) {
  if (context.deps.provider) return context.deps.provider;
  if (context.deps.createProvider) return context.deps.createProvider(name, configuration);
  return name;
}

async function rewriteCommand(parsed, context) {
  requirePositionals("rewrite", parsed, 1, "<file|-> and requires --voice <profile.json>");
  if (!parsed.options.voice) throw usageError("rewrite requires --voice <profile.json>");
  rejectRepeatedStdin("rewrite", [parsed.positionals[0], parsed.options.voice]);

  const providerName = parsed.options.provider || "anthropic";
  if (!Object.prototype.hasOwnProperty.call(PROVIDER_ENV, providerName)) {
    throw usageError("--provider must be anthropic, openai, or openrouter");
  }
  const environmentName = parsed.options.apiKeyEnv || PROVIDER_ENV[providerName];
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(environmentName)) {
    throw usageError("--api-key-env must be a valid environment variable name");
  }
  const apiKey = context.io.env && context.io.env[environmentName];
  if (!apiKey && !context.deps.provider && !context.deps.createProvider) {
    throw new CliError("missing API key in environment variable `" + environmentName + "`", "MISSING_API_KEY");
  }
  if (apiKey) context.secrets.push(apiKey);

  const text = await readInput(parsed.positionals[0], context);
  const profileText = await readInput(parsed.options.voice, context);
  const voiceProfile = parseJson(profileText, parsed.options.voice);
  if (!voiceProfile || typeof voiceProfile !== "object" || Array.isArray(voiceProfile)) {
    throw dataError("VoiceProfile `" + parsed.options.voice + "` must contain a JSON object");
  }

  const provider = providerForRewrite(providerName, { apiKey, model: parsed.options.model }, context);
  const result = await context.deps.core.rewrite(text, {
    voiceProfile,
    provider,
    providerName,
    model: parsed.options.model,
    apiKey,
    persona: parsed.options.persona
  });
  writeResult(result, parsed.options.output, context);
  if (result && (result.status === "review_required" || result.accepted === false)) return EXIT_CODES.reviewRequired;
  return EXIT_CODES.success;
}

async function verifyCommand(parsed, context) {
  requirePositionals("verify", parsed, 2, "<original> <rewrite>");
  rejectRepeatedStdin("verify", parsed.positionals);
  const original = await readInput(parsed.positionals[0], context);
  const rewrite = await readInput(parsed.positionals[1], context);
  const result = await Promise.resolve(context.deps.core.verify(original, rewrite));
  writeResult(result, parsed.options.output, context);
  const integrity = result && (result.semanticIntegrity || result);
  if ((result && result.status === "fail") || (integrity && integrity.status === "fail")) {
    return EXIT_CODES.verificationFailed;
  }
  if ((result && (result.requiresReview === true || result.accepted === false || result.status === "review" || result.status === "review_required")) ||
      (integrity && ["review", "review_required", "insufficient", "invalid", "error"].indexOf(integrity.status) !== -1)) {
    return EXIT_CODES.reviewRequired;
  }
  return EXIT_CODES.success;
}

async function provenanceCommand(parsed, context) {
  requirePositionals("provenance", parsed, 1, "<file|->");
  const text = await readInput(parsed.positionals[0], context);
  const result = await Promise.resolve(context.deps.core.checkProvenance(text));
  writeResult(result, parsed.options.output, context);
  return EXIT_CODES.success;
}

async function evalCommand(parsed, context) {
  requirePositionals("eval", parsed, 1, "<dataset.json|dataset.jsonl|->");
  const target = parsed.positionals[0];
  rejectRepeatedStdin("eval", [target, parsed.options.observations]);
  const input = await readInput(target, context);
  let records;
  try {
    const extension = target === "-" ? "auto" : context.deps.path.extname(target).toLowerCase().replace(/^\./, "");
    const format = ["json", "jsonl", "ndjson"].includes(extension) ? extension : "auto";
    records = context.deps.dataset.parseDataset(input, { source: target === "-" ? "stdin" : target, format });
  } catch (error) {
    throw dataError(error.message);
  }

  let observations;
  if (parsed.options.observations) {
    const observationText = await readInput(parsed.options.observations, context);
    observations = parseObservations(observationText, parsed.options.observations);
  }
  const evaluationOptions = { observations };
  if (context.deps.core && typeof context.deps.core.analyze === "function") {
    evaluationOptions.analyzer = context.deps.core.analyze.bind(context.deps.core);
  }

  let result;
  if (typeof context.deps.evaluator.evaluateDatasetAsync === "function") {
    result = await context.deps.evaluator.evaluateDatasetAsync(records, evaluationOptions);
  } else if (typeof context.deps.evaluator.evaluateDataset === "function") {
    result = await Promise.resolve(context.deps.evaluator.evaluateDataset(records, evaluationOptions));
  } else if (typeof context.deps.evaluator === "function") {
    result = await context.deps.evaluator(records, evaluationOptions);
  } else {
    throw new TypeError("evaluator dependency is invalid");
  }
  writeResult(result, parsed.options.output, context);
  return EXIT_CODES.success;
}

const COMMANDS = Object.freeze({
  scan: {
    options: new Set(["--output"]),
    execute: scanCommand
  },
  profile: {
    options: new Set(["--output"]),
    execute: profileCommand
  },
  rewrite: {
    options: new Set(["--voice", "--provider", "--model", "--api-key-env", "--persona", "--output"]),
    execute: rewriteCommand
  },
  verify: {
    options: new Set(["--output"]),
    execute: verifyCommand
  },
  provenance: {
    options: new Set(["--output"]),
    execute: provenanceCommand
  },
  eval: {
    options: new Set(["--observations", "--output"]),
    execute: evalCommand
  }
});

function combinedDependencies(io, dependencies) {
  if (dependencies) return dependencies;
  if (!io) return {};
  return io.deps || io;
}

async function run(argv, io, dependencies) {
  const args = argv === undefined ? process.argv.slice(2) : Array.from(argv);
  const streams = resolveIo(io);
  let deps;
  try {
    deps = resolveDependencies(combinedDependencies(io, dependencies));
  } catch (error) {
    writeTo(streams.stderr, jsonLine({ error: { code: "INITIALIZATION_ERROR", message: error.message } }, []));
    return EXIT_CODES.operationalError;
  }
  const context = { io: streams, deps, secrets: [], stdinPromise: null };

  try {
    if (!args.length || args[0] === "--help" || args[0] === "-h" || args[0] === "help") {
      writeTo(streams.stdout, HELP);
      return EXIT_CODES.success;
    }
    const commandName = args[0];
    const command = COMMANDS[commandName];
    if (!command) throw usageError("unknown command `" + commandName + "`; use --help for usage");
    const parsed = parseCommandArguments(args.slice(1), command.options);
    if (parsed.options.help) {
      writeTo(streams.stdout, HELP);
      return EXIT_CODES.success;
    }
    return await command.execute(parsed, context);
  } catch (error) {
    if (isBrokenPipe(error)) return EXIT_CODES.success;
    const exitCode = Number.isInteger(error && error.exitCode) ? error.exitCode : EXIT_CODES.operationalError;
    const code = error && error.code && typeof error.code === "string" ? error.code : "OPERATION_FAILED";
    const message = error && error.message ? error.message : String(error);
    try {
      writeTo(streams.stderr, jsonLine({ error: { code, message } }, context.secrets));
    } catch (outputError) {
      return isBrokenPipe(outputError) ? EXIT_CODES.success : EXIT_CODES.operationalError;
    }
    return exitCode;
  }
}

async function main() {
  process.exitCode = await run(process.argv.slice(2));
}

if (require.main === module) {
  installExecutableOutputHandlers(process);
  main().catch(error => {
    try {
      writeTo(process.stderr, jsonLine({ error: { code: "UNHANDLED_ERROR", message: error.message } }, []));
    } catch (_) {}
    process.exitCode = EXIT_CODES.operationalError;
  });
}

module.exports = {
  EXIT_CODES,
  HELP,
  CliError,
  parseCommandArguments,
  installExecutableOutputHandlers,
  run,
  main
};
