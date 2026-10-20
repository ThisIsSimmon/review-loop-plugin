// src/commands/request-review.ts
import { access } from "node:fs/promises";
import { join as join4 } from "node:path";

// plugins/review-loop/skills/perform-code-review/SKILL.md
var SKILL_default = `---
name: perform-code-review
description: レビュアー側の手順。依頼書とレビュー対象（コミット範囲・ツリー スナップショット・作業ツリー）を受け取り、読み取り専用で変更を精査して、重大度と根拠の出所を付けた所見を返す。人やサブエージェントからのレビュー依頼に使う。review-loop では、この本文が Codex へのレビュー依頼に埋め込まれる。依頼書の作成は write-review-request。
---

# Perform Code Review

依頼された変更を、依頼書とコードの現物からレビューして所見を返す。レビューの判断を返すところまでが範囲で、修正はしない。

## 前提と制約

- **読み取り専用**: ファイルの作成・変更、index・HEAD・ブランチ・stash の変更、コミット、push をしない。過去の版は \`git show <rev>:<path>\`、差分は \`git diff\` で読む。
- **再委譲しない**: 依頼書を受け取ったことを理由に別のエージェントへ回さない。全部を一人で読む。大きければ何回かに分けて読み、読み切れなかった範囲は未確認として報告する。
- **根拠の出所を分ける**: 所見ごとに、コードを読んで確認した（source）、コマンドを実行して確かめた（measured）、推測（inferred）のどれかを示す。推測のまま断定しない。
- **未確認を問題なしと書かない**: 依頼書の「テスト済み」「修正済み」は主張として扱い、\`git diff\` と実行結果の現物で確かめる。確かめられなければ未確認として書く。
- **範囲を分ける**: 今回の変更で入った問題と、変更前からある問題を区別する。後者は参考として報告してよいが、対応必須とはしない。
- **規約の正**: リポジトリに規約ファイル（\`AGENTS.md\`・\`CLAUDE.md\` など、依頼文で指定されたもの）があれば最初に読み、それに照らす。規約ファイルが無ければ、既存のコードの書き方・構成を規約とみなす。

## 手順

1. **対象の確定**: 依頼書の「レビュー対象」と指定されたコマンドで、変更ファイル一覧と差分を取る。未追跡ファイルも対象に含める。依頼書の一覧と \`git\` の実測が食い違えば実測を優先し、その差異を要約に書く。
2. **差分を全部読む**: 最初の問題で止まらず最後まで読む。削除された処理の呼び出し元、変更された関数の利用箇所、関連するテストも開く。
3. **要件との照合**: 依頼書の経緯・要件と実装を突き合わせる。要件の抜け、依頼範囲を超えた変更、意図的と書かれた箇所の妥当性を見る。
4. **検証状況の裏取り**: 依頼書の検証状況を読み、実行できる確認（テスト・lint・差分の照合）は行う。実行できない環境ならその旨を未確認に書く。
5. **所見の確定**: 観点と重大度の基準に当てはめ、確信の持てる所見だけを残す。

## 観点

- **要件適合**: 依頼どおりか。逸脱は改善か問題か。計画・仕様書への参照があれば整合しているか。
- **コード品質**: 責務の分離、エラー処理、型の明示、外部入力の検証、重複（意味の同じ規則が二重に持たれていないか）、境界値。
- **設計**: 既存の構成（ディレクトリ構成・共通の仕組み）に沿うか。共通化すべき処理を各所で再定義していないか。
- **テスト**: 実際の挙動を検証しているか。境界値・失敗経路があるか。追加・変更した挙動に対応するテストがあるか。
- **運用**: スキーマ変更の移行、無人実行の制約、外部への投稿・データの書き込みなど不可逆な操作、ログ・証跡。
- **文書**: 挙動を変えた箇所のコメント・ドキュメント・表（コマンドの一覧など）の更新。

## 重大度

| 重大度 | 内容 |
| --- | --- |
| critical | 不具合、データ破損・消失、セキュリティ、動かない、不可逆な操作の誤り |
| important | 設計上の問題、要件の抜け、不十分なエラー処理、テストの欠落、保守を損なう規約違反 |
| minor | 可読性、小さな最適化、文書・コメントの磨き込み |

数を揃えるために所見を作らない。問題が無ければ無いと書き、その根拠を要約に書く。

## 所見の書き方

1 件ごとに、対象（ファイルと行）、何が問題か、なぜ問題か（どの入力・経路で起きるか）、どう直すか、根拠の出所を書く。表現は平易にし、「改善すべき」のような曖昧な指摘にしない。

## 出力形式

- **出力の形（JSON スキーマなど）が依頼文で指定されている場合**（review-loop からの依頼など）: その形どおりの内容だけを最終応答にする。項目の意味は依頼文の決まりに従う。
- **それ以外（人・サブエージェントからの依頼）**: 日本語の Markdown で、次の見出しの順に書く。
  1. \`### 良い点\`（具体的に）
  2. \`### 所見\` を \`#### Critical\` / \`#### Important\` / \`#### Minor\` に分け、各件を「対象・内容・理由・直し方・根拠の出所」で書く
  3. \`### 未確認\`（確かめられなかった事項。無ければ「なし」）
  4. \`### 判定\`（マージ可 / 修正後に可 / 不可 と、1〜2 文の理由）

## 完了条件

対象の全差分を読み、所見・未確認・判定を上の形式で返したら完了。修正・ステージ・コミットは行わない。
`;
// src/assets/review-result.schema.json
var review_result_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "review-loop Codex review result",
  type: "object",
  additionalProperties: false,
  required: ["verdict", "summary", "findings", "tests_run", "unverified"],
  properties: {
    verdict: { type: "string", enum: ["approve", "needs_attention"] },
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "severity",
          "scope",
          "title",
          "file",
          "line_start",
          "line_end",
          "body",
          "recommendation",
          "evidence"
        ],
        properties: {
          severity: {
            type: "string",
            enum: ["critical", "important", "minor"]
          },
          scope: { type: "string", enum: ["change", "pre_existing"] },
          title: { type: "string" },
          file: { type: "string" },
          line_start: { type: "integer" },
          line_end: { type: "integer" },
          body: { type: "string" },
          recommendation: { type: "string" },
          evidence: {
            type: "string",
            enum: ["source", "measured", "inferred"]
          }
        }
      }
    },
    tests_run: { type: "array", items: { type: "string" } },
    unverified: { type: "array", items: { type: "string" } }
  }
};

// src/assets/reviewer-prompt.md
var reviewer_prompt_default = `# コードレビュー依頼（review-loop Run {{RUN_ID}} / ラウンド {{ROUND}}）

あなたはこのリポジトリの変更をレビューするレビュアーである。下の「レビュアーの手順」に従い、その観点・重大度の基準で所見を出す。応答と所見の文章は日本語で書く。

## 制約

- 読み取り専用。ファイルの作成・変更、index・HEAD・ブランチの変更、コミット、他のエージェントへの委譲をしない。
- 依頼書や前回の対応表の主張（テストが通った、修正済み）は、コードと \`git diff\` の現物で確かめてから扱う。確かめられないことは \`unverified\` に書く。
- テストを実行できない（読み取り専用サンドボックスで書き込みが要る）場合は実行せず、その旨を \`unverified\` に書く。
- 最終応答は指定された JSON スキーマに従う。スキーマ以外の文章・Markdown を最終応答に含めない。

## プロジェクトの規約と検証コマンド

{{PROJECT}}

## レビュー対象

{{SCOPE}}

## 依頼書（実装側が書いた背景・意図・検証状況）

{{REQUEST}}

## 前回ラウンドの所見と実装側の対応

{{PREVIOUS}}

## 出力の決まり

- \`verdict\`: 対応が必要な所見（critical / important、または対応すべき minor）があれば \`needs_attention\`、なければ \`approve\`。
- \`severity\`: \`critical\`（不具合・データ破損・セキュリティ・動かない・不可逆な操作の誤り）、\`important\`（設計・要件漏れ・エラー処理・テスト不足・保守を損なう規約違反）、\`minor\`（可読性・小さな最適化・文書）。
- \`scope\`: 今回の変更で入った問題は \`change\`、変更前から存在する問題は \`pre_existing\`。
- \`file\` はリポジトリルートからの相対パス、\`line_start\` / \`line_end\` は現在の作業ツリーの行番号（削除行への指摘は直前の行、新規ファイル全体なら 0）。
- \`evidence\`: \`source\`（コードを読んで確認）、\`measured\`（コマンド実行の実測）、\`inferred\`（推測。推測のまま断定しない）。
- \`body\` には何が問題で、なぜ問題か、どの入力・経路で起きるかを書く。\`recommendation\` には直し方を書く（無ければ空文字）。
- \`tests_run\` には実行したコマンドと結果、\`unverified\` には確認できなかった事項を書く。無ければ空配列。
- 所見が無ければ \`findings\` は空配列にし、\`summary\` にその根拠を書く。数を揃えるために所見を作らない。

## レビュアーの手順

以下は \`perform-code-review\` スキルの本文である。「出力形式」は review-loop からの依頼の場合に当たり、最終応答は上の JSON スキーマに従う。

{{REVIEWER_GUIDE}}
`;

// src/lib/config.ts
import { join } from "node:path";

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

// src/lib/codex-exec.ts
var buildCodexExecArgs = (input) => [
  "exec",
  "--ephemeral",
  "-s",
  "read-only",
  "-C",
  input.repoRoot,
  ...input.model === null ? [] : ["-m", input.model],
  ...input.reasoningEffort === null ? [] : ["-c", `model_reasoning_effort="${input.reasoningEffort}"`],
  "--output-schema",
  input.schemaPath,
  "-o",
  input.outputPath,
  "-"
];
var runCodexExec = (args, prompt, options) => runProcess("codex", args, {
  cwd: options.cwd,
  input: prompt,
  timeoutMs: options.timeoutMs,
  onSpawn: options.onSpawn
});

// src/lib/state.ts
import { readdir } from "node:fs/promises";
import { isAbsolute, join as join3 } from "node:path";

// src/lib/git.ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as join2 } from "node:path";
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

// src/lib/reviewer-prompt.ts
var PLACEHOLDER_PATTERN = /\{\{([A-Z_]+)\}\}/g;
var interpolateTemplate = (template, values) => template.replace(PLACEHOLDER_PATTERN, (placeholder, key) => {
  const value = values[key];
  if (value === undefined) {
    throw new Error(`雛形の差し込み先に値がありません: ${placeholder}`);
  }
  return value;
});
var renderScopeSection = (input) => {
  if (input.previousTree === null) {
    return [
      "1 回目のレビュー。対象は作業ツリー全体の変更（未追跡ファイルを含む）。",
      `- 変更ファイル一覧: \`git diff --stat HEAD ${input.tree}\``,
      `- 変更内容: \`git diff HEAD ${input.tree}\``,
      `ツリー \`${input.tree}\` はレビュー依頼時点の作業ツリーのスナップショットで、現在の作業ツリーと同じ内容である。ファイルは直接読んでよい。`
    ].join(`
`);
  }
  return [
    `${input.round} 回目のレビュー。前回の所見への対応として入った修正（差分のみ）を見る。`,
    `- 今回の差分: \`git diff ${input.previousTree} ${input.tree}\`（前回レビュー時のスナップショットから今回まで）`,
    `- 全体の変更（文脈の理解用）: \`git diff HEAD ${input.tree}\``,
    "今回の所見は、今回の差分と、その差分が壊した箇所に限る。前回却下された所見は、却下理由に反論できる根拠がある場合だけ再提起する。前回「対応（修正）」とされた所見は、差分で本当に直っているかを確かめ、直っていなければ再提起する。"
  ].join(`
`);
};
var renderProjectSection = (input) => {
  const lines = input.conventionFiles.length === 0 ? [
    "- 規約ファイル（AGENTS.md・CLAUDE.md など）は見つからなかった。既存のコードの書き方を規約とみなす。"
  ] : [
    `- 規約ファイル: ${input.conventionFiles.map((path) => `\`${path}\``).join("、")}。最初に読み、照らし合わせる（そこから参照されている文書も必要に応じて読む）。`
  ];
  lines.push(`- lint: ${input.lintCommand === null ? "指定なし（規約ファイルに書かれていればそれに従う）" : `\`${input.lintCommand}\``}`, `- テスト: ${input.testCommand === null ? "指定なし（規約ファイルに書かれていればそれに従う）" : `\`${input.testCommand}\``}`);
  return lines.join(`
`);
};
var stripFrontmatter = (markdown) => markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
var renderPreviousRoundSection = (entries) => {
  if (entries.length === 0) {
    return "前回の所見はありません。";
  }
  return entries.map(({ finding, disposition, note }) => {
    const location = `${finding.file}:${finding.line_start}-${finding.line_end}`;
    const noteText = note.trim() === "" ? "" : `: ${note.trim()}`;
    return `- ${finding.id} [${finding.severity}] ${finding.title}（${location}）→ ${DISPOSITION_LABELS[disposition]}${noteText}`;
  }).join(`
`);
};
var buildReviewerPrompt = (template, input) => interpolateTemplate(template, {
  RUN_ID: input.runId,
  ROUND: String(input.round),
  REVIEWER_GUIDE: input.reviewerGuide.trim(),
  PROJECT: renderProjectSection(input),
  SCOPE: renderScopeSection(input),
  REQUEST: input.request.trim(),
  PREVIOUS: input.previousTree === null ? "1 回目のため無し。" : renderPreviousRoundSection(input.previousRound)
});

// src/commands/request-review.ts
var usage = () => `Usage: ${scriptCommand("request-review")} [--run <run-id>] [--request <依頼書のパス>] [--model <model>] [--effort <none|minimal|low|medium|high|xhigh>] [--timeout-minutes <n>] [--max-rounds <n>]`;
var REVIEWABLE_PHASES = new Set([
  "implementing",
  "fixing",
  "review_failed",
  "ready_to_finish",
  "awaiting_confirmation"
]);
var isProcessAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
var isStaleReviewing = (state, now, processAlive = isProcessAlive) => state.phase === "reviewing" && now.getTime() - Date.parse(state.updatedAt) > state.config.timeoutMinutes * 60000 && (state.reviewPid === null || !processAlive(state.reviewPid));
var minutesSince = (iso, now) => Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60000));
var checkReviewRequest = (input) => {
  const { now, extendedMaxRounds, processAlive = isProcessAlive } = input;
  let state = input.state;
  if (extendedMaxRounds !== undefined) {
    if (extendedMaxRounds <= state.round)
      return {
        ok: false,
        message: `--max-rounds は現在のラウンド ${state.round} より大きい値にしてください: ${extendedMaxRounds}`
      };
    state = {
      ...state,
      config: { ...state.config, maxRounds: extendedMaxRounds }
    };
  }
  const resumable = state.phase === "max_rounds" && extendedMaxRounds !== undefined;
  const staleReviewing = isStaleReviewing(state, now, processAlive);
  if (!REVIEWABLE_PHASES.has(state.phase) && !resumable && !staleReviewing) {
    if (state.phase === "reviewing") {
      const pidNote = state.reviewPid !== null && processAlive(state.reviewPid) ? `codex の pid ${state.reviewPid} が動いています。` : "";
      return {
        ok: false,
        message: `Run ${state.runId} はレビューを実行中です（開始 ${minutesSince(state.updatedAt, now)} 分前）。${pidNote}完了を待ってください。打ち切り時間 ${state.config.timeoutMinutes} 分を過ぎ、codex が終わっていれば、中断とみなして同じコマンドで再実行できます`
      };
    }
    return {
      ok: false,
      message: `Run ${state.runId} は「${PHASE_LABELS[state.phase]}」（${state.phase}）のため、レビューを依頼できません。ラウンド上限に達した Run は、依頼者が続行を選んだときだけ --max-rounds <n> で上限を増やして再開できます`
    };
  }
  const round = state.round + 1;
  if (round > state.config.maxRounds)
    return {
      ok: false,
      message: `最大ラウンド数 ${state.config.maxRounds} に達しています。残った所見と対応を依頼者に報告してください`
    };
  return { ok: true, state, round, staleReviewing };
};
var readRunText = async (workDir, runId, fileName) => {
  const text = await readTextIfExists(runFilePath(workDir, runId, fileName));
  if (text === null) {
    throw new Error(`ファイルがありません: ${runFileDisplayPath(runId, fileName)}`);
  }
  return text;
};
var loadPreviousRound = async (workDir, runId, round) => {
  const resultName = roundFileName(round, "result.json");
  const dispositionsName = roundFileName(round, "dispositions.json");
  const result = parseJsonWith(ReviewResultSchema, await readRunText(workDir, runId, resultName), runFileDisplayPath(runId, resultName));
  const dispositions = parseJsonWith(DispositionsFileSchema, await readRunText(workDir, runId, dispositionsName), runFileDisplayPath(runId, dispositionsName));
  const byId = new Map(dispositions.items.map((item) => [item.id, item]));
  return result.findings.map((finding) => {
    const item = byId.get(finding.id);
    if (!item) {
      throw new Error(`${runFileDisplayPath(runId, dispositionsName)} に ${finding.id} の対応がありません`);
    }
    return { finding, disposition: item.disposition, note: item.note };
  });
};
var renderNextStep = (state, round) => [
  "### 次の工程",
  "1. 各所見を現物（コード・git diff・テストの実行）で検証し、addressed / rejected / out_of_scope に分ける（所見の主張をそのまま信じず、却下も推測でしない）",
  `2. out_of_scope にする所見は、先に ${state.config.outOfScopeFile} の一覧へ、発見元「review-loop ${state.runId} <所見 ID>」の行を追記する（ファイルが無ければ record-dispositions が雛形を作る）`,
  `3. 対応表を ${runFileDisplayPath(state.runId, roundFileName(round, "dispositions.json"))} に書き、${scriptCommand("record-dispositions")} --run ${state.runId} を実行する（所見 0 件なら --none）`
].join(`
`);
var fileExists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};
var main = async (args) => {
  const { values } = parseFlags(args, {
    valueFlags: [
      "--run",
      "--request",
      "--model",
      "--effort",
      "--timeout-minutes",
      "--max-rounds"
    ],
    usage: usage()
  });
  const { root, workDir } = await resolveWorkspace();
  const now = new Date;
  const checked = checkReviewRequest({
    state: await resolveRunState(values.get("--run"), workDir),
    now,
    extendedMaxRounds: parsePositiveInteger(values.get("--max-rounds"), "--max-rounds")
  });
  if (!checked.ok)
    throw new Error(checked.message);
  let state = checked.state;
  const { round, staleReviewing } = checked;
  if (staleReviewing) {
    console.log(`注意: 前回のレビューが reviewing のまま打ち切り時間（${state.config.timeoutMinutes} 分）を過ぎ、codex も終わっていました（開始 ${minutesSince(state.updatedAt, now)} 分前）。中断とみなして再実行します`);
  }
  const git = createGitRunner(root);
  const tree = await snapshotWorkingTree(git);
  if (!await hasDiff(git, "HEAD", tree)) {
    throw new Error("レビュー対象の変更がありません（HEAD と作業ツリーが同じ内容です）");
  }
  const previousTree = round === 1 ? null : state.snapshots[String(state.round)] ?? null;
  if (round > 1 && previousTree === null) {
    throw new Error(`ラウンド ${state.round} のスナップショットが状態ファイルにありません`);
  }
  if (previousTree !== null && !await hasDiff(git, previousTree, tree)) {
    throw new Error("前回のレビューから作業ツリーに変更がありません。対応表で addressed にした所見の修正が入っているか確認してください");
  }
  const defaultRequestName = roundFileName(1, "request.md");
  const requestArg = values.get("--request");
  const requestPath = requestArg === undefined ? runFilePath(workDir, state.runId, defaultRequestName) : resolveRepoPath(root, requestArg);
  const requestText = await readTextIfExists(requestPath);
  if (requestText === null) {
    throw new Error(`依頼書がありません: ${requestPath}。write-review-request スキルを --out ${runFileDisplayPath(state.runId, defaultRequestName)} で実行してください`);
  }
  const request = requestText.trim();
  if (request === "") {
    throw new Error(`依頼書が空です: ${requestPath}`);
  }
  const previousRound = previousTree === null ? [] : await loadPreviousRound(workDir, state.runId, state.round);
  const prompt = buildReviewerPrompt(reviewer_prompt_default, {
    runId: state.runId,
    round,
    tree,
    previousTree,
    request,
    previousRound,
    reviewerGuide: stripFrontmatter(SKILL_default),
    conventionFiles: await resolveConventionFiles(state.config, (path) => fileExists(join4(root, path))),
    lintCommand: state.config.lintCommand,
    testCommand: state.config.testCommand
  });
  await writeText(runFilePath(workDir, state.runId, roundFileName(round, "prompt.md")), prompt);
  const schemaPath = runFilePath(workDir, state.runId, "review-result.schema.json");
  await writeJson(schemaPath, review_result_schema_default);
  const model = values.get("--model") ?? state.config.model;
  const reasoningEffort = parseReasoningEffort(values.get("--effort")) ?? state.config.reasoningEffort;
  const timeoutMinutes = parsePositiveInteger(values.get("--timeout-minutes"), "--timeout-minutes") ?? state.config.timeoutMinutes;
  state = await writeRunState({
    ...state,
    phase: "reviewing",
    lastError: null,
    reviewPid: null,
    config: { ...state.config, timeoutMinutes }
  }, workDir);
  const outputName = roundFileName(round, "codex-output.json");
  const outputPath = runFilePath(workDir, state.runId, outputName);
  const logName = roundFileName(round, "codex.log");
  const codexArgs = buildCodexExecArgs({
    repoRoot: root,
    model,
    reasoningEffort,
    schemaPath,
    outputPath
  });
  const fail = async (message) => {
    await writeRunState({ ...state, phase: "review_failed", lastError: message, reviewPid: null }, workDir);
    throw new Error(`${message}
ログ: ${runFileDisplayPath(state.runId, logName)}
原因を確かめてから、同じコマンドで再実行するか、依頼者に報告してください`);
  };
  console.log(`Codex にレビューを依頼します（Run ${state.runId} / ラウンド ${round} / モデル ${model ?? "Codex 既定"} / effort ${reasoningEffort ?? "Codex 既定"} / 打ち切り ${timeoutMinutes} 分）`);
  const startedAt = Date.now();
  let run;
  try {
    run = await runCodexExec(codexArgs, prompt, {
      cwd: root,
      timeoutMs: timeoutMinutes * 60000,
      onSpawn: async (pid) => {
        state = await writeRunState({ ...state, reviewPid: pid }, workDir);
      }
    });
  } catch (error) {
    return fail(`codex を起動できません: ${errorMessage(error)}`);
  }
  const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
  try {
    await writeText(runFilePath(workDir, state.runId, logName), [
      `$ codex ${codexArgs.join(" ")}`,
      `exit=${run.exitCode} timedOut=${run.timedOut} elapsed=${elapsedSeconds}s`,
      "",
      "--- stderr ---",
      run.stderr,
      "--- stdout ---",
      run.stdout,
      ""
    ].join(`
`));
  } catch (error) {
    return fail(`Codex のログを書けません: ${errorMessage(error)}`);
  }
  if (run.timedOut) {
    return fail(`Codex のレビューを ${timeoutMinutes} 分で打ち切りました`);
  }
  if (run.exitCode !== 0) {
    return fail(`codex exec が失敗しました（exit ${run.exitCode}）`);
  }
  const outputText = await readTextIfExists(outputPath);
  if (outputText === null) {
    return fail(`Codex の最終応答ファイルがありません: ${runFileDisplayPath(state.runId, outputName)}`);
  }
  let output;
  try {
    output = parseJsonWith(CodexReviewOutputSchema, outputText, "Codex の最終応答");
  } catch (error) {
    return fail(errorMessage(error));
  }
  const result = normalizeReviewResult(output, {
    runId: state.runId,
    round,
    tree,
    previousTree,
    reviewedAt: new Date().toISOString(),
    model,
    reasoningEffort
  });
  await writeJson(runFilePath(workDir, state.runId, roundFileName(round, "result.json")), result);
  await writeRunState({
    ...state,
    phase: "triaging",
    round,
    snapshots: { ...state.snapshots, [String(round)]: tree },
    reviewPid: null,
    lastError: null
  }, workDir);
  console.log(`レビューが終わりました（所要 ${elapsedSeconds} 秒）`);
  console.log("");
  console.log(renderReviewResult(result));
  console.log("");
  console.log(renderNextStep(state, round));
};

// src/bin/request-review.ts
await runMain(() => main(process.argv.slice(2)));
