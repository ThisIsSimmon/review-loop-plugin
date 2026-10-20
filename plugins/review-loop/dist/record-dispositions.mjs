// src/commands/record-dispositions.ts
import { join as join4 } from "node:path";

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

// src/lib/state.ts
import { readdir } from "node:fs/promises";
import { isAbsolute, join as join3 } from "node:path";

// src/lib/config.ts
import { join } from "node:path";

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
  const text = await readTextIfExists(join(repoRoot, PROJECT_CONFIG_PATH));
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

// src/lib/git.ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as join2 } from "node:path";

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
  const dir = await mkdtemp(join2(tmpdir(), "review-loop-index-"));
  const env = { GIT_INDEX_FILE: join2(dir, "index") };
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

// src/lib/review-result.ts
var REVIEW_VERDICTS = ["approve", "needs_attention"];
var FINDING_SEVERITIES = ["critical", "important", "minor"];
var FINDING_SCOPES = ["change", "pre_existing"];
var EVIDENCE_KINDS = ["source", "measured", "inferred"];
var SCOPE_LABELS = {
  change: "今回の変更",
  pre_existing: "変更前からの問題"
};
var EVIDENCE_LABELS = {
  source: "ソース確認",
  measured: "実測",
  inferred: "推測"
};
var LineNumberSchema = pipe(number(), integer(), minValue(0));
var CodexFindingSchema = object({
  severity: picklist(FINDING_SEVERITIES),
  scope: picklist(FINDING_SCOPES),
  title: pipe(string(), minLength(1)),
  file: pipe(string(), minLength(1)),
  line_start: LineNumberSchema,
  line_end: LineNumberSchema,
  body: pipe(string(), minLength(1)),
  recommendation: string(),
  evidence: picklist(EVIDENCE_KINDS)
});
var CodexReviewOutputSchema = object({
  verdict: picklist(REVIEW_VERDICTS),
  summary: string(),
  findings: array(CodexFindingSchema),
  tests_run: array(string()),
  unverified: array(string())
});
var FINDING_ID_PATTERN = /^R\d+-\d+$/;
var ReviewFindingSchema = object({
  id: pipe(string(), regex(FINDING_ID_PATTERN)),
  ...CodexFindingSchema.entries
});
var ReviewResultSchema = object({
  runId: string(),
  round: pipe(number(), integer(), minValue(1)),
  tree: ObjectNameSchema,
  previousTree: nullable(ObjectNameSchema),
  reviewedAt: pipe(string(), isoTimestamp()),
  model: nullable(string()),
  reasoningEffort: nullable(string()),
  verdict: picklist(REVIEW_VERDICTS),
  summary: string(),
  findings: array(ReviewFindingSchema),
  testsRun: array(string()),
  unverified: array(string())
});
var buildFindingId = (round, index) => `R${round}-${index}`;
var normalizeReviewResult = (output, meta) => ({
  ...meta,
  verdict: output.verdict,
  summary: output.summary,
  findings: output.findings.map((finding, index) => ({
    id: buildFindingId(meta.round, index + 1),
    ...finding
  })),
  testsRun: output.tests_run,
  unverified: output.unverified
});
var countBySeverity = (findings) => ({
  critical: findings.filter((finding) => finding.severity === "critical").length,
  important: findings.filter((finding) => finding.severity === "important").length,
  minor: findings.filter((finding) => finding.severity === "minor").length
});
var listOrNone = (items) => items.length === 0 ? ["- なし"] : items.map((item) => `- ${item}`);
var renderReviewResult = (result) => {
  const counts = countBySeverity(result.findings);
  const lines = [
    `## Codex レビュー結果（Run ${result.runId} / ラウンド ${result.round}）`,
    `- 判定: ${result.verdict}（所見 ${result.findings.length} 件: critical ${counts.critical} / important ${counts.important} / minor ${counts.minor}）`,
    `- モデル: ${result.model ?? "Codex 既定"} / effort: ${result.reasoningEffort ?? "Codex 既定"}`,
    `- 要約: ${result.summary}`
  ];
  if (result.findings.length > 0) {
    lines.push("", "### 所見");
    for (const finding of result.findings) {
      lines.push("", `#### ${finding.id} [${finding.severity}] ${finding.title}`, `- 対象: ${finding.file}:${finding.line_start}-${finding.line_end}（${SCOPE_LABELS[finding.scope]}）`, `- 内容: ${finding.body}`, `- 推奨: ${finding.recommendation || "なし"}`, `- 根拠の出所: ${EVIDENCE_LABELS[finding.evidence]}`);
    }
  }
  lines.push("", "### Codex が実行したテスト", ...listOrNone(result.testsRun), "", "### Codex が確認できなかったこと", ...listOrNone(result.unverified));
  return lines.join(`
`);
};

// src/lib/dispositions.ts
var DISPOSITIONS = ["addressed", "rejected", "out_of_scope"];
var DISPOSITION_LABELS = {
  addressed: "対応（修正）",
  rejected: "却下",
  out_of_scope: "範囲外として記録"
};
var DispositionItemSchema = object({
  id: pipe(string(), regex(FINDING_ID_PATTERN)),
  disposition: picklist(DISPOSITIONS),
  note: string()
});
var DispositionsFileSchema = object({
  round: pipe(number(), integer(), minValue(1)),
  items: array(DispositionItemSchema)
});
var formatOutOfScopeSource = (runId, findingId) => `review-loop ${runId} ${findingId}`;
var OUT_OF_SCOPE_ROW_PATTERN = /^\|\s*OOS-\d+\s*\|/;
var escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var hasOutOfScopeRecord = (todoText, runId, findingId) => {
  const source = new RegExp(`${escapeRegExp(formatOutOfScopeSource(runId, findingId))}(?![0-9])`);
  return todoText.split(`
`).some((line) => OUT_OF_SCOPE_ROW_PATTERN.test(line) && source.test(line));
};
var validateDispositions = (input) => {
  const problems = [];
  if (input.dispositions.round !== input.round) {
    problems.push(`round が ${input.round} ではありません: ${input.dispositions.round}`);
  }
  const findingIds = new Set(input.findings.map((finding) => finding.id));
  const seen = new Set;
  for (const item of input.dispositions.items) {
    if (!findingIds.has(item.id)) {
      problems.push(`所見に無い ID です: ${item.id}`);
    }
    if (seen.has(item.id)) {
      problems.push(`ID が重複しています: ${item.id}`);
    }
    seen.add(item.id);
    if (item.disposition !== "addressed" && item.note.trim() === "") {
      problems.push(`${item.id}: ${DISPOSITION_LABELS[item.disposition]} には note（根拠または記録の要約）が必要です`);
    }
    if (item.disposition === "out_of_scope" && !hasOutOfScopeRecord(input.outOfScopeTodoText, input.runId, item.id)) {
      problems.push(`${item.id}: out_of_scope の所見は先に ${input.outOfScopeFile} の一覧へ、発見元「${formatOutOfScopeSource(input.runId, item.id)}」の行として追記してください`);
    }
  }
  for (const id of findingIds) {
    if (!seen.has(id)) {
      problems.push(`対応が書かれていない所見があります: ${id}`);
    }
  }
  return problems;
};
var countDispositions = (items) => ({
  addressed: items.filter((item) => item.disposition === "addressed").length,
  rejected: items.filter((item) => item.disposition === "rejected").length,
  out_of_scope: items.filter((item) => item.disposition === "out_of_scope").length
});
var checkNoneAllowed = (findingCount, dispositionsPath) => findingCount > 0 ? `所見が ${findingCount} 件あるため --none は使えません。対応表を ${dispositionsPath} に書いてください` : null;
var decideNextPhase = (input) => {
  if (countDispositions(input.items).addressed === 0) {
    return "ready_to_finish";
  }
  return input.round >= input.maxRounds ? "max_rounds" : "fixing";
};
var OUT_OF_SCOPE_TEMPLATE = `# 範囲外の問題の記録

作業の途中で見つけた、依頼の完了に必須でない不具合・改善案の記録。直さずにここへ書き、採否は後で決める。

## 記入の決まり

- 1 件を 1 行で、一覧の末尾に追記する。既存の行は書き換えない（状態の更新は別のコミットで行う）。
- ID は \`OOS-<連番>\`。日付は記録した日（YYYY-MM-DD）。
- 発見元: Codex の所見なら \`review-loop <Run ID> <所見 ID>\`、ループ中に自分で見つけたものは \`review-loop <Run ID> self\`。
- 対象はファイルと行（\`path:line\`）。状態は「未着手」「対応済み」「見送り」のいずれか。

## 一覧

| ID | 日付 | 発見元 | 対象 | 内容 | 範囲外とした理由 | 状態 |
| --- | --- | --- | --- | --- | --- | --- |
`;

// src/commands/record-dispositions.ts
var usage = () => `Usage: ${scriptCommand("record-dispositions")} [--run <run-id>] [--file <対応表のパス>] [--none]`;
var describeChecks = (state) => {
  const commands = [state.config.testCommand, state.config.lintCommand].filter((command) => command !== null);
  return commands.length === 0 ? "影響するテストと lint（規約ファイルの決まりに従う）" : commands.map((command) => `\`${command}\``).join(" と ");
};
var renderNextStepAfterTriage = (phase, state) => {
  switch (phase) {
    case "fixing":
      return `次の工程: addressed の所見を修正し、${describeChecks(state)}を通してから ${scriptCommand("request-review")} --run ${state.runId} を再実行する（ラウンド ${state.round + 1}。依頼書は作り直さない）`;
    case "ready_to_finish":
      return `対応すべき所見はありません。次の工程: review-loop スキルの「コミットメッセージの書き方」に従ってメッセージを書いて ${runFileDisplayPath(state.runId, "commit-message.txt")} に保存し、${scriptCommand("finish-run")} --run ${state.runId} を実行する`;
    case "max_rounds":
      return `最大ラウンド数 ${state.config.maxRounds} に達しました。addressed の所見は修正しますが Codex へのレビューは出さず、残った所見と対応を依頼者に報告して判断を仰いでください（ターンを終えてよいです）`;
  }
};
var main = async (args) => {
  const { values, switches } = parseFlags(args, {
    valueFlags: ["--run", "--file"],
    switchFlags: ["--none"],
    usage: usage()
  });
  const { root, workDir } = await resolveWorkspace();
  const state = await resolveRunState(values.get("--run"), workDir);
  if (state.phase !== "triaging") {
    throw new Error(`Run ${state.runId} は「${PHASE_LABELS[state.phase]}」（${state.phase}）のため、対応表を記録できません。所見の精査待ちのときだけ記録できます`);
  }
  const round = state.round;
  const resultName = roundFileName(round, "result.json");
  const resultText = await readTextIfExists(runFilePath(workDir, state.runId, resultName));
  if (resultText === null) {
    throw new Error(`レビュー結果がありません: ${runFileDisplayPath(state.runId, resultName)}`);
  }
  const result = parseJsonWith(ReviewResultSchema, resultText, runFileDisplayPath(state.runId, resultName));
  const dispositionsName = roundFileName(round, "dispositions.json");
  const dispositionsDisplay = runFileDisplayPath(state.runId, dispositionsName);
  let dispositions;
  if (switches.has("--none")) {
    if (values.has("--file"))
      throw new Error(usage());
    const noneRejected = checkNoneAllowed(result.findings.length, dispositionsDisplay);
    if (noneRejected !== null)
      throw new Error(noneRejected);
    dispositions = { round, items: [] };
  } else {
    const fileArg = values.get("--file");
    const path = fileArg === undefined ? runFilePath(workDir, state.runId, dispositionsName) : resolveRepoPath(root, fileArg);
    const text = await readTextIfExists(path);
    if (text === null) {
      throw new Error(`対応表がありません: ${path}。所見 0 件なら --none を付けてください`);
    }
    dispositions = parseJsonWith(DispositionsFileSchema, text, path);
  }
  const outOfScopeFile = state.config.outOfScopeFile;
  const outOfScopePath = join4(root, outOfScopeFile);
  let outOfScopeTodoText = await readTextIfExists(outOfScopePath);
  let createdTemplate = false;
  if (outOfScopeTodoText === null && dispositions.items.some((item) => item.disposition === "out_of_scope")) {
    await writeText(outOfScopePath, OUT_OF_SCOPE_TEMPLATE);
    outOfScopeTodoText = OUT_OF_SCOPE_TEMPLATE;
    createdTemplate = true;
  }
  const problems = validateDispositions({
    runId: state.runId,
    round,
    findings: result.findings,
    dispositions,
    outOfScopeFile,
    outOfScopeTodoText: outOfScopeTodoText ?? ""
  });
  if (problems.length > 0) {
    throw new Error([
      ...createdTemplate ? [
        `範囲外の記録ファイルが無かったので、雛形から ${outOfScopeFile} を作りました。記入の決まりに従って一覧へ行を追記してから再実行してください。`
      ] : [],
      "対応表に問題があります:",
      ...problems.map((problem) => `- ${problem}`)
    ].join(`
`));
  }
  await writeJson(runFilePath(workDir, state.runId, dispositionsName), dispositions);
  const nextPhase = decideNextPhase({
    items: dispositions.items,
    round,
    maxRounds: state.config.maxRounds
  });
  const next = await writeRunState({ ...state, phase: nextPhase }, workDir);
  const counts = countDispositions(dispositions.items);
  console.log(`対応表を記録しました（Run ${state.runId} / ラウンド ${round} / ${dispositionsDisplay}）: 対応 ${counts.addressed} / 却下 ${counts.rejected} / 範囲外 ${counts.out_of_scope}`);
  console.log(renderNextStepAfterTriage(nextPhase, next));
};

// src/bin/record-dispositions.ts
await runMain(() => main(process.argv.slice(2)));
