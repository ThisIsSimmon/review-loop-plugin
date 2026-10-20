// node_modules/valibot/dist/index.mjs
var store$4;
var DEFAULT_CONFIG = {
  lang: undefined,
  message: undefined,
  abortEarly: undefined,
  abortPipeEarly: undefined
};
function getGlobalConfig(config$1) {
  if (!config$1 && !store$4)
    return DEFAULT_CONFIG;
  return {
    lang: config$1?.lang ?? store$4?.lang,
    message: config$1?.message,
    abortEarly: config$1?.abortEarly ?? store$4?.abortEarly,
    abortPipeEarly: config$1?.abortPipeEarly ?? store$4?.abortPipeEarly
  };
}
var store$3;
function getGlobalMessage(lang) {
  return store$3?.get(lang);
}
var store$2;
function getSchemaMessage(lang) {
  return store$2?.get(lang);
}
var store$1;
function getSpecificMessage(reference, lang) {
  return store$1?.get(reference)?.get(lang);
}
function _stringify(input) {
  const type = typeof input;
  if (type === "string")
    return `"${input}"`;
  if (type === "number" || type === "bigint" || type === "boolean")
    return `${input}`;
  if (type === "object" || type === "function")
    return (input && Object.getPrototypeOf(input)?.constructor?.name) ?? "null";
  return type;
}
function _addIssue(context, label, dataset, config$1, other) {
  const input = other && "input" in other ? other.input : dataset.value;
  const expected = other?.expected ?? context.expects ?? null;
  const received = other?.received ?? /* @__PURE__ */ _stringify(input);
  const issue = {
    kind: context.kind,
    type: context.type,
    input,
    expected,
    received,
    message: `Invalid ${label}: ${expected ? `Expected ${expected} but r` : "R"}eceived ${received}`,
    requirement: context.requirement,
    path: other?.path,
    issues: other?.issues,
    lang: config$1.lang,
    abortEarly: config$1.abortEarly,
    abortPipeEarly: config$1.abortPipeEarly
  };
  const isSchema = context.kind === "schema";
  const message$1 = other?.message ?? context.message ?? /* @__PURE__ */ getSpecificMessage(context.reference, issue.lang) ?? (isSchema ? /* @__PURE__ */ getSchemaMessage(issue.lang) : null) ?? config$1.message ?? /* @__PURE__ */ getGlobalMessage(issue.lang);
  if (message$1 !== undefined)
    issue.message = typeof message$1 === "function" ? message$1(issue) : message$1;
  if (isSchema)
    dataset.typed = false;
  if (dataset.issues)
    dataset.issues.push(issue);
  else
    dataset.issues = [issue];
}
function _isValidObjectKey(object$1, key) {
  return Object.prototype.hasOwnProperty.call(object$1, key) && key !== "__proto__" && key !== "prototype" && key !== "constructor";
}
function _joinExpects(values$1, separator) {
  const list = [...new Set(values$1)];
  if (list.length > 1)
    return `(${list.join(` ${separator} `)})`;
  return list[0] ?? "never";
}
function _standardSchema(schema) {
  schema["~standard"] = {
    version: 1,
    vendor: "valibot",
    validate: (value$1) => schema["~run"]({ value: value$1 }, /* @__PURE__ */ getGlobalConfig())
  };
  return schema;
}
function getDotPath(issue) {
  if (issue.path) {
    let key = "";
    for (const item of issue.path)
      if (typeof item.key === "string" || typeof item.key === "number")
        if (key)
          key += `.${item.key}`;
        else
          key += item.key;
      else
        return null;
    return key;
  }
  return null;
}
var ISO_TIMESTAMP_REGEX = /^\d{4}-(?:0[1-9]|1[0-2])-(?:[12]\d|0[1-9]|3[01])[T ](?:0\d|1\d|2[0-3])(?::[0-5]\d){2}(?:\.\d{1,9})?(?:Z| ?[+-](?:0\d|1\d|2[0-3])(?::?[0-5]\d)?)$/u;
function check(requirement, message$1) {
  return {
    kind: "validation",
    type: "check",
    reference: check,
    async: false,
    expects: null,
    requirement,
    message: message$1,
    "~run"(dataset, config$1) {
      if (dataset.typed && !this.requirement(dataset.value))
        _addIssue(this, "input", dataset, config$1);
      return dataset;
    }
  };
}
function integer(message$1) {
  return {
    kind: "validation",
    type: "integer",
    reference: integer,
    async: false,
    expects: null,
    requirement: Number.isInteger,
    message: message$1,
    "~run"(dataset, config$1) {
      if (dataset.typed && !this.requirement(dataset.value))
        _addIssue(this, "integer", dataset, config$1);
      return dataset;
    }
  };
}
function isoTimestamp(message$1) {
  return {
    kind: "validation",
    type: "iso_timestamp",
    reference: isoTimestamp,
    async: false,
    expects: null,
    requirement: ISO_TIMESTAMP_REGEX,
    message: message$1,
    "~run"(dataset, config$1) {
      if (dataset.typed && !this.requirement.test(dataset.value))
        _addIssue(this, "timestamp", dataset, config$1);
      return dataset;
    }
  };
}
function minLength(requirement, message$1) {
  return {
    kind: "validation",
    type: "min_length",
    reference: minLength,
    async: false,
    expects: `>=${requirement}`,
    requirement,
    message: message$1,
    "~run"(dataset, config$1) {
      if (dataset.typed && dataset.value.length < this.requirement)
        _addIssue(this, "length", dataset, config$1, { received: `${dataset.value.length}` });
      return dataset;
    }
  };
}
function minValue(requirement, message$1) {
  return {
    kind: "validation",
    type: "min_value",
    reference: minValue,
    async: false,
    expects: `>=${requirement instanceof Date ? requirement.toJSON() : /* @__PURE__ */ _stringify(requirement)}`,
    requirement,
    message: message$1,
    "~run"(dataset, config$1) {
      if (dataset.typed && !(dataset.value >= this.requirement))
        _addIssue(this, "value", dataset, config$1, { received: dataset.value instanceof Date ? dataset.value.toJSON() : /* @__PURE__ */ _stringify(dataset.value) });
      return dataset;
    }
  };
}
function regex(requirement, message$1) {
  return {
    kind: "validation",
    type: "regex",
    reference: regex,
    async: false,
    expects: `${requirement}`,
    requirement,
    message: message$1,
    "~run"(dataset, config$1) {
      if (dataset.typed && !this.requirement.test(dataset.value))
        _addIssue(this, "format", dataset, config$1);
      return dataset;
    }
  };
}
function getFallback(schema, dataset, config$1) {
  return typeof schema.fallback === "function" ? schema.fallback(dataset, config$1) : schema.fallback;
}
function getDefault(schema, dataset, config$1) {
  return typeof schema.default === "function" ? schema.default(dataset, config$1) : schema.default;
}
function array(item, message$1) {
  return _standardSchema({
    kind: "schema",
    type: "array",
    reference: array,
    expects: "Array",
    async: false,
    item,
    message: message$1,
    "~run"(dataset, config$1) {
      const input = dataset.value;
      if (Array.isArray(input)) {
        dataset.typed = true;
        dataset.value = [];
        for (let key = 0;key < input.length; key++) {
          const value$1 = input[key];
          const itemDataset = this.item["~run"]({ value: value$1 }, config$1);
          if (itemDataset.issues) {
            const pathItem = {
              type: "array",
              origin: "value",
              input,
              key,
              value: value$1
            };
            for (const issue of itemDataset.issues) {
              if (issue.path)
                issue.path.unshift(pathItem);
              else
                issue.path = [pathItem];
              dataset.issues?.push(issue);
            }
            if (!dataset.issues)
              dataset.issues = itemDataset.issues;
            if (config$1.abortEarly) {
              dataset.typed = false;
              break;
            }
          }
          if (!itemDataset.typed)
            dataset.typed = false;
          dataset.value.push(itemDataset.value);
        }
      } else
        _addIssue(this, "type", dataset, config$1);
      return dataset;
    }
  });
}
function boolean(message$1) {
  return _standardSchema({
    kind: "schema",
    type: "boolean",
    reference: boolean,
    expects: "boolean",
    async: false,
    message: message$1,
    "~run"(dataset, config$1) {
      if (typeof dataset.value === "boolean")
        dataset.typed = true;
      else
        _addIssue(this, "type", dataset, config$1);
      return dataset;
    }
  });
}
function looseObject(entries$1, message$1) {
  return _standardSchema({
    kind: "schema",
    type: "loose_object",
    reference: looseObject,
    expects: "Object",
    async: false,
    entries: entries$1,
    message: message$1,
    "~run"(dataset, config$1) {
      const input = dataset.value;
      if (input && typeof input === "object") {
        dataset.typed = true;
        dataset.value = {};
        for (const key in this.entries) {
          const valueSchema = this.entries[key];
          if (key in input || (valueSchema.type === "exact_optional" || valueSchema.type === "optional" || valueSchema.type === "nullish") && valueSchema.default !== undefined) {
            const value$1 = key in input ? input[key] : /* @__PURE__ */ getDefault(valueSchema);
            const valueDataset = valueSchema["~run"]({ value: value$1 }, config$1);
            if (valueDataset.issues) {
              const pathItem = {
                type: "object",
                origin: "value",
                input,
                key,
                value: value$1
              };
              for (const issue of valueDataset.issues) {
                if (issue.path)
                  issue.path.unshift(pathItem);
                else
                  issue.path = [pathItem];
                dataset.issues?.push(issue);
              }
              if (!dataset.issues)
                dataset.issues = valueDataset.issues;
              if (config$1.abortEarly) {
                dataset.typed = false;
                break;
              }
            }
            if (!valueDataset.typed)
              dataset.typed = false;
            dataset.value[key] = valueDataset.value;
          } else if (valueSchema.fallback !== undefined)
            dataset.value[key] = /* @__PURE__ */ getFallback(valueSchema);
          else if (valueSchema.type !== "exact_optional" && valueSchema.type !== "optional" && valueSchema.type !== "nullish") {
            _addIssue(this, "key", dataset, config$1, {
              input: undefined,
              expected: `"${key}"`,
              path: [{
                type: "object",
                origin: "key",
                input,
                key,
                value: input[key]
              }]
            });
            if (config$1.abortEarly)
              break;
          }
        }
        if (!dataset.issues || !config$1.abortEarly) {
          for (const key in input)
            if (/* @__PURE__ */ _isValidObjectKey(input, key) && !Object.prototype.hasOwnProperty.call(this.entries, key))
              dataset.value[key] = input[key];
        }
      } else
        _addIssue(this, "type", dataset, config$1);
      return dataset;
    }
  });
}
function nullable(wrapped, default_) {
  return _standardSchema({
    kind: "schema",
    type: "nullable",
    reference: nullable,
    expects: `(${wrapped.expects} | null)`,
    async: false,
    wrapped,
    default: default_,
    "~run"(dataset, config$1) {
      if (dataset.value === null) {
        if (this.default !== undefined)
          dataset.value = /* @__PURE__ */ getDefault(this, dataset, config$1);
        if (dataset.value === null) {
          dataset.typed = true;
          return dataset;
        }
      }
      return this.wrapped["~run"](dataset, config$1);
    }
  });
}
function number(message$1) {
  return _standardSchema({
    kind: "schema",
    type: "number",
    reference: number,
    expects: "number",
    async: false,
    message: message$1,
    "~run"(dataset, config$1) {
      if (typeof dataset.value === "number" && !isNaN(dataset.value))
        dataset.typed = true;
      else
        _addIssue(this, "type", dataset, config$1);
      return dataset;
    }
  });
}
function object(entries$1, message$1) {
  return _standardSchema({
    kind: "schema",
    type: "object",
    reference: object,
    expects: "Object",
    async: false,
    entries: entries$1,
    message: message$1,
    "~run"(dataset, config$1) {
      const input = dataset.value;
      if (input && typeof input === "object") {
        dataset.typed = true;
        dataset.value = {};
        for (const key in this.entries) {
          const valueSchema = this.entries[key];
          if (key in input || (valueSchema.type === "exact_optional" || valueSchema.type === "optional" || valueSchema.type === "nullish") && valueSchema.default !== undefined) {
            const value$1 = key in input ? input[key] : /* @__PURE__ */ getDefault(valueSchema);
            const valueDataset = valueSchema["~run"]({ value: value$1 }, config$1);
            if (valueDataset.issues) {
              const pathItem = {
                type: "object",
                origin: "value",
                input,
                key,
                value: value$1
              };
              for (const issue of valueDataset.issues) {
                if (issue.path)
                  issue.path.unshift(pathItem);
                else
                  issue.path = [pathItem];
                dataset.issues?.push(issue);
              }
              if (!dataset.issues)
                dataset.issues = valueDataset.issues;
              if (config$1.abortEarly) {
                dataset.typed = false;
                break;
              }
            }
            if (!valueDataset.typed)
              dataset.typed = false;
            dataset.value[key] = valueDataset.value;
          } else if (valueSchema.fallback !== undefined)
            dataset.value[key] = /* @__PURE__ */ getFallback(valueSchema);
          else if (valueSchema.type !== "exact_optional" && valueSchema.type !== "optional" && valueSchema.type !== "nullish") {
            _addIssue(this, "key", dataset, config$1, {
              input: undefined,
              expected: `"${key}"`,
              path: [{
                type: "object",
                origin: "key",
                input,
                key,
                value: input[key]
              }]
            });
            if (config$1.abortEarly)
              break;
          }
        }
      } else
        _addIssue(this, "type", dataset, config$1);
      return dataset;
    }
  });
}
function optional(wrapped, default_) {
  return _standardSchema({
    kind: "schema",
    type: "optional",
    reference: optional,
    expects: `(${wrapped.expects} | undefined)`,
    async: false,
    wrapped,
    default: default_,
    "~run"(dataset, config$1) {
      if (dataset.value === undefined) {
        if (this.default !== undefined)
          dataset.value = /* @__PURE__ */ getDefault(this, dataset, config$1);
        if (dataset.value === undefined) {
          dataset.typed = true;
          return dataset;
        }
      }
      return this.wrapped["~run"](dataset, config$1);
    }
  });
}
function picklist(options, message$1) {
  return _standardSchema({
    kind: "schema",
    type: "picklist",
    reference: picklist,
    expects: /* @__PURE__ */ _joinExpects(options.map(_stringify), "|"),
    async: false,
    options,
    message: message$1,
    "~run"(dataset, config$1) {
      if (this.options.includes(dataset.value))
        dataset.typed = true;
      else
        _addIssue(this, "type", dataset, config$1);
      return dataset;
    }
  });
}
function record(key, value$1, message$1) {
  return _standardSchema({
    kind: "schema",
    type: "record",
    reference: record,
    expects: "Object",
    async: false,
    key,
    value: value$1,
    message: message$1,
    "~run"(dataset, config$1) {
      const input = dataset.value;
      if (input && typeof input === "object") {
        dataset.typed = true;
        dataset.value = {};
        for (const entryKey in input)
          if (/* @__PURE__ */ _isValidObjectKey(input, entryKey)) {
            const entryValue = input[entryKey];
            const keyDataset = this.key["~run"]({ value: entryKey }, config$1);
            if (keyDataset.issues) {
              const pathItem = {
                type: "object",
                origin: "key",
                input,
                key: entryKey,
                value: entryValue
              };
              for (const issue of keyDataset.issues) {
                issue.path = [pathItem];
                dataset.issues?.push(issue);
              }
              if (!dataset.issues)
                dataset.issues = keyDataset.issues;
              if (config$1.abortEarly) {
                dataset.typed = false;
                break;
              }
            }
            const valueDataset = this.value["~run"]({ value: entryValue }, config$1);
            if (valueDataset.issues) {
              const pathItem = {
                type: "object",
                origin: "value",
                input,
                key: entryKey,
                value: entryValue
              };
              for (const issue of valueDataset.issues) {
                if (issue.path)
                  issue.path.unshift(pathItem);
                else
                  issue.path = [pathItem];
                dataset.issues?.push(issue);
              }
              if (!dataset.issues)
                dataset.issues = valueDataset.issues;
              if (config$1.abortEarly) {
                dataset.typed = false;
                break;
              }
            }
            if (!keyDataset.typed || !valueDataset.typed)
              dataset.typed = false;
            if (keyDataset.typed)
              dataset.value[keyDataset.value] = valueDataset.value;
          }
      } else
        _addIssue(this, "type", dataset, config$1);
      return dataset;
    }
  });
}
function strictObject(entries$1, message$1) {
  return _standardSchema({
    kind: "schema",
    type: "strict_object",
    reference: strictObject,
    expects: "Object",
    async: false,
    entries: entries$1,
    message: message$1,
    "~run"(dataset, config$1) {
      const input = dataset.value;
      if (input && typeof input === "object") {
        dataset.typed = true;
        dataset.value = {};
        for (const key in this.entries) {
          const valueSchema = this.entries[key];
          if (key in input || (valueSchema.type === "exact_optional" || valueSchema.type === "optional" || valueSchema.type === "nullish") && valueSchema.default !== undefined) {
            const value$1 = key in input ? input[key] : /* @__PURE__ */ getDefault(valueSchema);
            const valueDataset = valueSchema["~run"]({ value: value$1 }, config$1);
            if (valueDataset.issues) {
              const pathItem = {
                type: "object",
                origin: "value",
                input,
                key,
                value: value$1
              };
              for (const issue of valueDataset.issues) {
                if (issue.path)
                  issue.path.unshift(pathItem);
                else
                  issue.path = [pathItem];
                dataset.issues?.push(issue);
              }
              if (!dataset.issues)
                dataset.issues = valueDataset.issues;
              if (config$1.abortEarly) {
                dataset.typed = false;
                break;
              }
            }
            if (!valueDataset.typed)
              dataset.typed = false;
            dataset.value[key] = valueDataset.value;
          } else if (valueSchema.fallback !== undefined)
            dataset.value[key] = /* @__PURE__ */ getFallback(valueSchema);
          else if (valueSchema.type !== "exact_optional" && valueSchema.type !== "optional" && valueSchema.type !== "nullish") {
            _addIssue(this, "key", dataset, config$1, {
              input: undefined,
              expected: `"${key}"`,
              path: [{
                type: "object",
                origin: "key",
                input,
                key,
                value: input[key]
              }]
            });
            if (config$1.abortEarly)
              break;
          }
        }
        if (!dataset.issues || !config$1.abortEarly) {
          for (const key in input)
            if (!Object.prototype.hasOwnProperty.call(this.entries, key)) {
              _addIssue(this, "key", dataset, config$1, {
                input: key,
                expected: "never",
                path: [{
                  type: "object",
                  origin: "key",
                  input,
                  key,
                  value: input[key]
                }]
              });
              break;
            }
        }
      } else
        _addIssue(this, "type", dataset, config$1);
      return dataset;
    }
  });
}
function string(message$1) {
  return _standardSchema({
    kind: "schema",
    type: "string",
    reference: string,
    expects: "string",
    async: false,
    message: message$1,
    "~run"(dataset, config$1) {
      if (typeof dataset.value === "string")
        dataset.typed = true;
      else
        _addIssue(this, "type", dataset, config$1);
      return dataset;
    }
  });
}
function partial(schema, keys) {
  const entries$1 = {};
  for (const key in schema.entries)
    entries$1[key] = !keys || keys.includes(key) ? /* @__PURE__ */ optional(schema.entries[key]) : schema.entries[key];
  return _standardSchema({
    ...schema,
    entries: entries$1
  });
}
function pipe(...pipe$1) {
  return _standardSchema({
    ...pipe$1[0],
    pipe: pipe$1,
    "~run"(dataset, config$1) {
      for (const item of pipe$1)
        if (item.kind !== "metadata") {
          if (dataset.issues && (item.kind === "schema" || item.kind === "transformation")) {
            dataset.typed = false;
            break;
          }
          if (!dataset.issues || !config$1.abortEarly && !config$1.abortPipeEarly)
            dataset = item["~run"](dataset, config$1);
        }
      return dataset;
    }
  });
}
function safeParse(schema, input, config$1) {
  const dataset = schema["~run"]({ value: input }, /* @__PURE__ */ getGlobalConfig(config$1));
  return {
    typed: dataset.typed,
    success: !dataset.issues,
    output: dataset.value,
    issues: dataset.issues
  };
}

// src/lib/git.ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// src/lib/process.ts
import { spawn } from "node:child_process";
var runProcess = (command, args, options) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"]
  });
  const stdout = [];
  const stderr = [];
  let timedOut = false;
  let settled = false;
  let timer;
  let spawned = Promise.resolve();
  const settle = (fn) => {
    if (settled)
      return;
    settled = true;
    if (timer)
      clearTimeout(timer);
    fn();
  };
  child.stdout?.on("data", (chunk) => stdout.push(chunk));
  child.stderr?.on("data", (chunk) => stderr.push(chunk));
  child.on("error", (error) => settle(() => reject(error)));
  child.on("close", (code) => {
    spawned.then(() => settle(() => resolve({
      exitCode: code,
      timedOut,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8")
    })), () => {});
  });
  if (options.input !== undefined && child.stdin) {
    child.stdin.on("error", () => {});
    child.stdin.end(options.input, "utf8");
  }
  if (options.timeoutMs !== undefined) {
    timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs);
  }
  if (options.onSpawn && child.pid !== undefined) {
    spawned = options.onSpawn(child.pid);
    spawned.catch((error) => {
      child.kill();
      settle(() => reject(error));
    });
  }
});

// src/lib/git.ts
var GIT_LOCAL_ENV_VARS = new Set([
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_CONFIG",
  "GIT_CONFIG_PARAMETERS",
  "GIT_CONFIG_COUNT",
  "GIT_OBJECT_DIRECTORY",
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_IMPLICIT_WORK_TREE",
  "GIT_GRAFT_FILE",
  "GIT_INDEX_FILE",
  "GIT_NO_REPLACE_OBJECTS",
  "GIT_REPLACE_REF_BASE",
  "GIT_PREFIX",
  "GIT_SHALLOW_FILE",
  "GIT_COMMON_DIR"
]);
var withoutGitLocalEnv = (env) => Object.fromEntries(Object.entries(env).filter(([name]) => !GIT_LOCAL_ENV_VARS.has(name)));
var createGitRunner = (cwd, baseEnv = {}) => async (args, env = {}) => {
  const result = await runProcess("git", args, {
    cwd,
    env: { ...withoutGitLocalEnv(process.env), ...baseEnv, ...env }
  });
  return {
    exitCode: result.exitCode ?? 1,
    stdout: result.stdout,
    stderr: result.stderr
  };
};
var runGitOrThrow = async (git, args, env) => {
  const result = await git(args, env);
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} が失敗しました（exit ${result.exitCode}）: ${result.stderr.trim()}`);
  }
  return result.stdout;
};
var findRepoRoot = async (cwd) => {
  try {
    const result = await createGitRunner(cwd)(["rev-parse", "--show-toplevel"]);
    return result.exitCode === 0 ? result.stdout.trim() : null;
  } catch {
    return null;
  }
};
var snapshotWorkingTree = async (git) => {
  const dir = await mkdtemp(join(tmpdir(), "review-loop-index-"));
  const env = { GIT_INDEX_FILE: join(dir, "index") };
  try {
    await runGitOrThrow(git, ["read-tree", "HEAD"], env);
    await runGitOrThrow(git, ["add", "-A"], env);
    return (await runGitOrThrow(git, ["write-tree"], env)).trim();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
var hasDiff = async (git, from, to) => {
  const result = await git(["diff", "--quiet", from, to]);
  if (result.exitCode === 0)
    return false;
  if (result.exitCode === 1)
    return true;
  throw new Error(`git diff --quiet ${from} ${to} が失敗しました（exit ${result.exitCode}）: ${result.stderr.trim()}`);
};
var getDiffStat = async (git, from, to) => (await runGitOrThrow(git, ["diff", "--stat", from, to])).trimEnd();
var revParse = async (git, ref) => (await runGitOrThrow(git, ["rev-parse", "--verify", ref])).trim();
var getStatusShort = async (git) => (await runGitOrThrow(git, ["status", "--short", "--untracked-files=all"])).trimEnd();
var listChangedPaths = async (git, from, to) => (await runGitOrThrow(git, [
  "diff",
  "--name-only",
  "--no-renames",
  "-z",
  from,
  to
])).split("\x00").filter((path) => path !== "");
var writeIndexTree = async (git) => (await runGitOrThrow(git, ["write-tree"])).trim();
var readTreeFile = async (git, tree, path) => {
  const result = await git(["cat-file", "blob", `${tree}:${path}`]);
  if (result.exitCode === 0)
    return result.stdout;
  if (result.exitCode === 128)
    return null;
  throw new Error(`git cat-file blob ${tree}:${path} が失敗しました（exit ${result.exitCode}）: ${result.stderr.trim()}`);
};
var isIgnored = async (git, path) => {
  const result = await git(["check-ignore", "-q", "--no-index", path]);
  if (result.exitCode === 0)
    return true;
  if (result.exitCode === 1)
    return false;
  throw new Error(`git check-ignore ${path} が失敗しました（exit ${result.exitCode}）: ${result.stderr.trim()}`);
};

// src/lib/state.ts
import { readdir } from "node:fs/promises";
import { isAbsolute, join as join3 } from "node:path";

// src/lib/config.ts
import { join as join2 } from "node:path";

// src/lib/fs.ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
var isNotFoundError = (error) => error instanceof Error && ("code" in error) && error.code === "ENOENT";
var readTextIfExists = async (path) => {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isNotFoundError(error))
      return null;
    throw error;
  }
};
var writeText = async (path, text) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, "utf8");
};
var writeJson = (path, data) => writeText(path, `${JSON.stringify(data, null, "\t")}
`);

// src/lib/util.ts
import { dirname as dirname2 } from "node:path";
var errorMessage = (error) => error instanceof Error ? error.message : String(error);
var formatIssues = (issues) => issues.map((issue) => {
  const path = getDotPath(issue);
  return path ? `${path}: ${issue.message}` : issue.message;
}).join("; ");
var parseJsonWith = (schema, text, label) => {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} を JSON として読めません: ${errorMessage(error)}`);
  }
  const result = safeParse(schema, data);
  if (!result.success) {
    throw new Error(`${label} の形式が不正です: ${formatIssues(result.issues)}`);
  }
  return result.output;
};
var scriptCommand = (name) => {
  const entry = process.argv[1];
  const distDir = entry?.endsWith(".mjs") === true ? dirname2(entry) : "${CLAUDE_PLUGIN_ROOT}/dist";
  const path = `${distDir}/${name}.mjs`;
  return /^[\w@%+=:,./-]+$/.test(path) ? `node ${path}` : `node '${path.replaceAll("'", "'\\''")}'`;
};
var parseFlags = (args, spec) => {
  const values = new Map;
  const switches = new Set;
  for (let index = 0;index < args.length; index += 1) {
    const flag = args[index];
    if (flag === undefined)
      break;
    if (spec.switchFlags?.includes(flag)) {
      if (switches.has(flag))
        throw new Error(spec.usage);
      switches.add(flag);
      continue;
    }
    if (!spec.valueFlags.includes(flag)) {
      throw new Error(`${spec.usage}
不明な引数: ${flag}`);
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--") || values.has(flag)) {
      throw new Error(spec.usage);
    }
    values.set(flag, value);
    index += 1;
  }
  return { values, switches };
};
var parsePositiveInteger = (value, label) => {
  if (value === undefined)
    return;
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new Error(`${label} は 1 以上の整数で指定してください: ${value}`);
  }
  return Number(value);
};
var parseBooleanValue = (value, label) => {
  if (value === undefined)
    return;
  if (value === "true")
    return true;
  if (value === "false")
    return false;
  throw new Error(`${label} は true か false で指定してください: ${value}`);
};
var runMain = async (main) => {
  try {
    await main();
  } catch (error) {
    console.error(errorMessage(error));
    process.exitCode = 1;
  }
};

// src/lib/config.ts
var PROJECT_CONFIG_PATH = ".claude/review-loop.json";
var REASONING_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh"
];
var DEFAULT_CONVENTION_FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  ".claude/CLAUDE.md"
];
var RepoRelativePathSchema = pipe(string(), minLength(1), check((path) => !path.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(path) && !path.split(/[\\/]/).includes(".."), "リポジトリルートからの相対パスで、.. を含まない形にしてください"));
var NonEmptyStringSchema = pipe(string(), minLength(1));
var ReviewLoopConfigSchema = object({
  model: nullable(NonEmptyStringSchema),
  reasoningEffort: nullable(picklist(REASONING_EFFORTS)),
  maxRounds: pipe(number(), integer(), minValue(1)),
  autoCommit: boolean(),
  timeoutMinutes: pipe(number(), integer(), minValue(1)),
  conventionFiles: nullable(array(RepoRelativePathSchema)),
  outOfScopeFile: RepoRelativePathSchema,
  lintCommand: nullable(NonEmptyStringSchema),
  testCommand: nullable(NonEmptyStringSchema),
  checkPushAfterCommit: boolean()
});
var DEFAULT_CONFIG2 = {
  model: null,
  reasoningEffort: null,
  maxRounds: 5,
  autoCommit: false,
  timeoutMinutes: 30,
  conventionFiles: null,
  outOfScopeFile: "docs/out-of-scope-todo.md",
  lintCommand: null,
  testCommand: null,
  checkPushAfterCommit: false
};
var ProjectConfigFileSchema = strictObject({
  $schema: optional(string()),
  ...partial(ReviewLoopConfigSchema).entries
});
var applyConfigOverrides = (fileConfig, overrides) => {
  const parsedFile = safeParse(ProjectConfigFileSchema, fileConfig);
  if (!parsedFile.success || Array.isArray(fileConfig)) {
    throw new Error(`${PROJECT_CONFIG_PATH} の形式が不正です: ${parsedFile.success ? "JSON のオブジェクトにしてください" : formatIssues(parsedFile.issues)}`);
  }
  const { $schema: _, ...fromFile } = parsedFile.output;
  const defined = Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined));
  const result = safeParse(ReviewLoopConfigSchema, {
    ...DEFAULT_CONFIG2,
    ...fromFile,
    ...defined
  });
  if (!result.success) {
    throw new Error(`review-loop の設定が不正です: ${formatIssues(result.issues)}`);
  }
  return result.output;
};
var loadConfig = async (repoRoot, overrides = {}) => {
  const text = await readTextIfExists(join2(repoRoot, PROJECT_CONFIG_PATH));
  let data = {};
  if (text !== null) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new Error(`${PROJECT_CONFIG_PATH} を JSON として読めません: ${errorMessage(error)}`);
    }
  }
  return applyConfigOverrides(data, overrides);
};
var resolveConventionFiles = async (config, exists) => {
  if (config.conventionFiles !== null)
    return [...config.conventionFiles];
  const found = [];
  for (const path of DEFAULT_CONVENTION_FILES) {
    if (await exists(path))
      found.push(path);
  }
  return found;
};
var describeConfig = (config) => [
  `- 設定: モデル ${config.model ?? "Codex 既定"} / effort ${config.reasoningEffort ?? "Codex 既定"} / 最大 ${config.maxRounds} ラウンド / autoCommit ${config.autoCommit} / 打ち切り ${config.timeoutMinutes} 分`,
  `- lint: ${config.lintCommand ?? "未設定（規約ファイルに従う）"} / テスト: ${config.testCommand ?? "未設定（規約ファイルに従う）"}`,
  `- 範囲外の記録先: ${config.outOfScopeFile}`
];

// src/lib/state.ts
var WORK_DIR_RELATIVE = ".tmp/review-loop";
var CLAUDE_SESSION_ID_ENV = "CLAUDE_CODE_SESSION_ID";
var STATE_FILE_NAME = "state.json";
var RUN_PHASES = [
  "implementing",
  "reviewing",
  "triaging",
  "fixing",
  "ready_to_finish",
  "awaiting_confirmation",
  "review_failed",
  "max_rounds",
  "done",
  "aborted"
];
var PHASE_LABELS = {
  implementing: "実装中",
  reviewing: "Codex のレビュー待ち",
  triaging: "所見の精査待ち",
  fixing: "指摘への対応中",
  ready_to_finish: "コミットの準備待ち",
  awaiting_confirmation: "コミットの確認待ち",
  review_failed: "レビューの失敗",
  max_rounds: "ラウンド上限に到達",
  done: "完了",
  aborted: "中止"
};
var STOPPABLE_PHASES = new Set([
  "awaiting_confirmation",
  "review_failed",
  "max_rounds",
  "done",
  "aborted"
]);
var TERMINAL_PHASES = new Set([
  "done",
  "aborted"
]);
var RUN_ID_PATTERN = /^\d{4}-\d{2}-\d{2}\.\d{6}$/;
var OBJECT_NAME_PATTERN = /^[0-9a-f]{40}$/;
var ObjectNameSchema = pipe(string(), regex(OBJECT_NAME_PATTERN));
var RunStateSchema = object({
  runId: pipe(string(), regex(RUN_ID_PATTERN)),
  task: string(),
  startedAt: pipe(string(), isoTimestamp()),
  updatedAt: pipe(string(), isoTimestamp()),
  baseCommit: ObjectNameSchema,
  phase: picklist(RUN_PHASES),
  round: pipe(number(), integer(), minValue(0)),
  snapshots: record(string(), ObjectNameSchema),
  config: ReviewLoopConfigSchema,
  paused: boolean(),
  sessionId: nullable(string()),
  reviewPid: nullable(pipe(number(), integer(), minValue(1))),
  commitSha: nullable(ObjectNameSchema),
  lastError: nullable(string())
});
var workspaceFor = (root) => ({
  root,
  workDir: join3(root, WORK_DIR_RELATIVE)
});
var buildRunId = (now, timeZone) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}.${parts.hour}${parts.minute}${parts.second}`;
};
var roundFileName = (round, kind) => `${round}.${kind}`;
var runFilePath = (workDir, runId, fileName) => join3(workDir, runId, fileName);
var runFileDisplayPath = (runId, fileName) => `${WORK_DIR_RELATIVE}/${runId}/${fileName}`;
var ensureWorkDir = async (workDir) => {
  const ignorePath = join3(workDir, ".gitignore");
  if (await readTextIfExists(ignorePath) === null) {
    await writeText(ignorePath, `*
`);
  }
};
var readRunState = async (runId, workDir) => {
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error(`Run ID の形式が不正です（YYYY-MM-DD.HHmmss）: ${runId}`);
  }
  const text = await readTextIfExists(runFilePath(workDir, runId, STATE_FILE_NAME));
  const display = runFileDisplayPath(runId, STATE_FILE_NAME);
  if (text === null) {
    throw new Error(`Run ${runId} の状態ファイルがありません: ${display}`);
  }
  return parseJsonWith(RunStateSchema, text, display);
};
var writeState = async (state, workDir, now, paused) => {
  const next = { ...state, paused, updatedAt: now.toISOString() };
  await ensureWorkDir(workDir);
  await writeJson(runFilePath(workDir, state.runId, STATE_FILE_NAME), next);
  return next;
};
var writeRunState = (state, workDir, now = new Date) => writeState(state, workDir, now, false);
var writePausedRunState = (state, workDir, now = new Date) => writeState(state, workDir, now, true);
var listRunStates = async (workDir) => {
  let entries;
  try {
    entries = await readdir(workDir, { withFileTypes: true });
  } catch (error) {
    if (isNotFoundError(error))
      return { states: [], invalid: [] };
    throw error;
  }
  const listing = { states: [], invalid: [] };
  for (const entry of entries) {
    if (!entry.isDirectory() || !RUN_ID_PATTERN.test(entry.name))
      continue;
    const path = runFilePath(workDir, entry.name, STATE_FILE_NAME);
    const text = await readTextIfExists(path);
    if (text === null)
      continue;
    try {
      const state = parseJsonWith(RunStateSchema, text, path);
      if (state.runId !== entry.name)
        throw new Error("Run ID の不一致");
      listing.states.push(state);
    } catch {
      listing.invalid.push(runFileDisplayPath(entry.name, STATE_FILE_NAME));
    }
  }
  listing.states.sort((a, b) => a.runId.localeCompare(b.runId));
  return listing;
};
var findActiveRuns = (states) => states.filter((state) => !TERMINAL_PHASES.has(state.phase));
var resolveRunState = async (runId, workDir) => {
  if (runId !== undefined) {
    return readRunState(runId, workDir);
  }
  const { states, invalid } = await listRunStates(workDir);
  if (invalid.length > 0) {
    throw new Error(`読めない状態ファイルがあります（${invalid.join(", ")}）。進行中の Run を見落とさないよう、--run <run-id> を明示するか、ファイルを直すか退避してください`);
  }
  const active = findActiveRuns(states);
  const only = active[0];
  if (active.length === 1 && only) {
    return only;
  }
  if (active.length === 0) {
    throw new Error(`進行中の Run がありません。${scriptCommand("start-run")} で開始するか、--run <run-id> を指定してください`);
  }
  throw new Error(`進行中の Run が複数あります（${active.map((state) => state.runId).join(", ")}）。--run <run-id> で指定してください`);
};
var parseReasoningEffort = (value) => {
  if (value === undefined)
    return;
  const result = safeParse(picklist(REASONING_EFFORTS), value);
  if (!result.success) {
    throw new Error(`--effort は ${REASONING_EFFORTS.join(" | ")} のいずれかで指定してください: ${value}`);
  }
  return result.output;
};
var resolveWorkspace = async (cwd = process.cwd()) => {
  const root = await findRepoRoot(cwd);
  if (root === null) {
    throw new Error(`git リポジトリの中で実行してください（現在のディレクトリ: ${cwd}）`);
  }
  return workspaceFor(root);
};
var resolveRepoPath = (root, path) => isAbsolute(path) ? path : join3(root, path);

// src/commands/stop-guard.ts
var STALE_RUN_MS = 24 * 60 * 60 * 1000;
var HookInputSchema = looseObject({
  session_id: optional(string()),
  cwd: optional(string()),
  background_tasks: optional(array(looseObject({ status: optional(string()) })))
});
var readHookContext = (input) => {
  const result = safeParse(HookInputSchema, input);
  if (!result.success) {
    return { sessionId: null, cwd: null, backgroundTaskRunning: false };
  }
  return {
    sessionId: result.output.session_id ?? null,
    cwd: result.output.cwd ?? null,
    backgroundTaskRunning: (result.output.background_tasks ?? []).some((task) => task.status === "running")
  };
};
var belongsToSession = (state, sessionId) => state.sessionId === null || sessionId === null || state.sessionId === sessionId;
var renderNextStep = (state) => {
  const run = state.runId;
  switch (state.phase) {
    case "implementing":
      return `実装とテストを終えたら、write-review-request スキルを --out ${runFileDisplayPath(run, roundFileName(1, "request.md"))} で実行し、${scriptCommand("request-review")} --run ${run} をバックグラウンドで実行する`;
    case "reviewing":
      return `request-review の完了を待つ。失敗していれば ${runFileDisplayPath(run, roundFileName(state.round + 1, "codex.log"))} を見て、同じコマンドで再実行するか依頼者に報告する`;
    case "triaging":
      return `所見を現物で検証して対応表 ${runFileDisplayPath(run, roundFileName(state.round, "dispositions.json"))} を書き、${scriptCommand("record-dispositions")} --run ${run} を実行する`;
    case "fixing":
      return `addressed の所見を修正してテストを通し、${scriptCommand("request-review")} --run ${run} を再実行する（ラウンド ${state.round + 1}）`;
    case "ready_to_finish":
      return `review-loop スキルの「コミットメッセージの書き方」に従って ${runFileDisplayPath(run, "commit-message.txt")} に書き、${scriptCommand("finish-run")} --run ${run} を実行する`;
    default:
      return "";
  }
};
var decideStopGuard = (input) => {
  const watched = input.states.filter((state) => !STOPPABLE_PHASES.has(state.phase) && !state.paused && belongsToSession(state, input.context.sessionId) && input.now.getTime() - Date.parse(state.updatedAt) <= STALE_RUN_MS);
  const state = watched.at(-1);
  if (!state) {
    return { block: false, note: null };
  }
  if (input.context.backgroundTaskRunning) {
    return {
      block: false,
      note: `review-loop Run ${state.runId} は「${PHASE_LABELS[state.phase]}」。バックグラウンドのコマンドが動いているので待ちます`
    };
  }
  return {
    block: true,
    reason: [
      `review-loop の Run ${state.runId} が「${PHASE_LABELS[state.phase]}」（${state.phase}）のままです。ループを続けてください。`,
      `次の工程: ${renderNextStep(state)}`,
      `依頼者に質問して止まる必要があるときは ${scriptCommand("pause-run")} --run ${state.runId}、中止するときは ${scriptCommand("finish-run")} --run ${state.runId} --abort を実行してから終えてください。`
    ].join(`
`)
  };
};
var readStdin = async () => {
  if (process.stdin.isTTY)
    return "";
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
};
var main = async () => {
  let hookInput = {};
  try {
    const text = await readStdin();
    hookInput = text.trim() === "" ? {} : JSON.parse(text);
  } catch (error) {
    console.error(`stop-guard: フックの入力を読めません: ${errorMessage(error)}`);
  }
  const context = readHookContext(hookInput);
  const root = await findRepoRoot(context.cwd ?? process.cwd());
  if (root === null)
    return;
  const { states } = await listRunStates(workspaceFor(root).workDir);
  const decision = decideStopGuard({ states, now: new Date, context });
  if (decision.block) {
    process.stdout.write(`${JSON.stringify({ decision: "block", reason: decision.reason })}
`);
  } else if (decision.note !== null) {
    console.error(decision.note);
  }
};

// src/bin/stop-guard.ts
try {
  await main();
} catch (error) {
  console.error(`stop-guard: ${errorMessage(error)}`);
}
