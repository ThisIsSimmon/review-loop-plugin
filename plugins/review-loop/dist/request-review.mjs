// @bun
// src/commands/request-review.ts
import { access } from "fs/promises";
import { join as join4 } from "path";

// plugins/review-loop/skills/perform-code-review/SKILL.md
var SKILL_default = `---
name: perform-code-review
description: \u30EC\u30D3\u30E5\u30A2\u30FC\u5074\u306E\u624B\u9806\u3002\u4F9D\u983C\u66F8\u3068\u30EC\u30D3\u30E5\u30FC\u5BFE\u8C61\uFF08\u30B3\u30DF\u30C3\u30C8\u7BC4\u56F2\u30FB\u30C4\u30EA\u30FC \u30B9\u30CA\u30C3\u30D7\u30B7\u30E7\u30C3\u30C8\u30FB\u4F5C\u696D\u30C4\u30EA\u30FC\uFF09\u3092\u53D7\u3051\u53D6\u308A\u3001\u8AAD\u307F\u53D6\u308A\u5C02\u7528\u3067\u5909\u66F4\u3092\u7CBE\u67FB\u3057\u3066\u3001\u91CD\u5927\u5EA6\u3068\u6839\u62E0\u306E\u51FA\u6240\u3092\u4ED8\u3051\u305F\u6240\u898B\u3092\u8FD4\u3059\u3002\u4EBA\u3084\u30B5\u30D6\u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u304B\u3089\u306E\u30EC\u30D3\u30E5\u30FC\u4F9D\u983C\u306B\u4F7F\u3046\u3002review-loop \u3067\u306F\u3001\u3053\u306E\u672C\u6587\u304C Codex \u3078\u306E\u30EC\u30D3\u30E5\u30FC\u4F9D\u983C\u306B\u57CB\u3081\u8FBC\u307E\u308C\u308B\u3002\u4F9D\u983C\u66F8\u306E\u4F5C\u6210\u306F write-review-request\u3002
---

# Perform Code Review

\u4F9D\u983C\u3055\u308C\u305F\u5909\u66F4\u3092\u3001\u4F9D\u983C\u66F8\u3068\u30B3\u30FC\u30C9\u306E\u73FE\u7269\u304B\u3089\u30EC\u30D3\u30E5\u30FC\u3057\u3066\u6240\u898B\u3092\u8FD4\u3059\u3002\u30EC\u30D3\u30E5\u30FC\u306E\u5224\u65AD\u3092\u8FD4\u3059\u3068\u3053\u308D\u307E\u3067\u304C\u7BC4\u56F2\u3067\u3001\u4FEE\u6B63\u306F\u3057\u306A\u3044\u3002

## \u524D\u63D0\u3068\u5236\u7D04

- **\u8AAD\u307F\u53D6\u308A\u5C02\u7528**: \u30D5\u30A1\u30A4\u30EB\u306E\u4F5C\u6210\u30FB\u5909\u66F4\u3001index\u30FBHEAD\u30FB\u30D6\u30E9\u30F3\u30C1\u30FBstash \u306E\u5909\u66F4\u3001\u30B3\u30DF\u30C3\u30C8\u3001push \u3092\u3057\u306A\u3044\u3002\u904E\u53BB\u306E\u7248\u306F \`git show <rev>:<path>\`\u3001\u5DEE\u5206\u306F \`git diff\` \u3067\u8AAD\u3080\u3002
- **\u518D\u59D4\u8B72\u3057\u306A\u3044**: \u4F9D\u983C\u66F8\u3092\u53D7\u3051\u53D6\u3063\u305F\u3053\u3068\u3092\u7406\u7531\u306B\u5225\u306E\u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u3078\u56DE\u3055\u306A\u3044\u3002\u5168\u90E8\u3092\u4E00\u4EBA\u3067\u8AAD\u3080\u3002\u5927\u304D\u3051\u308C\u3070\u4F55\u56DE\u304B\u306B\u5206\u3051\u3066\u8AAD\u307F\u3001\u8AAD\u307F\u5207\u308C\u306A\u304B\u3063\u305F\u7BC4\u56F2\u306F\u672A\u78BA\u8A8D\u3068\u3057\u3066\u5831\u544A\u3059\u308B\u3002
- **\u6839\u62E0\u306E\u51FA\u6240\u3092\u5206\u3051\u308B**: \u6240\u898B\u3054\u3068\u306B\u3001\u30B3\u30FC\u30C9\u3092\u8AAD\u3093\u3067\u78BA\u8A8D\u3057\u305F\uFF08source\uFF09\u3001\u30B3\u30DE\u30F3\u30C9\u3092\u5B9F\u884C\u3057\u3066\u78BA\u304B\u3081\u305F\uFF08measured\uFF09\u3001\u63A8\u6E2C\uFF08inferred\uFF09\u306E\u3069\u308C\u304B\u3092\u793A\u3059\u3002\u63A8\u6E2C\u306E\u307E\u307E\u65AD\u5B9A\u3057\u306A\u3044\u3002
- **\u672A\u78BA\u8A8D\u3092\u554F\u984C\u306A\u3057\u3068\u66F8\u304B\u306A\u3044**: \u4F9D\u983C\u66F8\u306E\u300C\u30C6\u30B9\u30C8\u6E08\u307F\u300D\u300C\u4FEE\u6B63\u6E08\u307F\u300D\u306F\u4E3B\u5F35\u3068\u3057\u3066\u6271\u3044\u3001\`git diff\` \u3068\u5B9F\u884C\u7D50\u679C\u306E\u73FE\u7269\u3067\u78BA\u304B\u3081\u308B\u3002\u78BA\u304B\u3081\u3089\u308C\u306A\u3051\u308C\u3070\u672A\u78BA\u8A8D\u3068\u3057\u3066\u66F8\u304F\u3002
- **\u7BC4\u56F2\u3092\u5206\u3051\u308B**: \u4ECA\u56DE\u306E\u5909\u66F4\u3067\u5165\u3063\u305F\u554F\u984C\u3068\u3001\u5909\u66F4\u524D\u304B\u3089\u3042\u308B\u554F\u984C\u3092\u533A\u5225\u3059\u308B\u3002\u5F8C\u8005\u306F\u53C2\u8003\u3068\u3057\u3066\u5831\u544A\u3057\u3066\u3088\u3044\u304C\u3001\u5BFE\u5FDC\u5FC5\u9808\u3068\u306F\u3057\u306A\u3044\u3002
- **\u898F\u7D04\u306E\u6B63**: \u30EA\u30DD\u30B8\u30C8\u30EA\u306B\u898F\u7D04\u30D5\u30A1\u30A4\u30EB\uFF08\`AGENTS.md\`\u30FB\`CLAUDE.md\` \u306A\u3069\u3001\u4F9D\u983C\u6587\u3067\u6307\u5B9A\u3055\u308C\u305F\u3082\u306E\uFF09\u304C\u3042\u308C\u3070\u6700\u521D\u306B\u8AAD\u307F\u3001\u305D\u308C\u306B\u7167\u3089\u3059\u3002\u898F\u7D04\u30D5\u30A1\u30A4\u30EB\u304C\u7121\u3051\u308C\u3070\u3001\u65E2\u5B58\u306E\u30B3\u30FC\u30C9\u306E\u66F8\u304D\u65B9\u30FB\u69CB\u6210\u3092\u898F\u7D04\u3068\u307F\u306A\u3059\u3002

## \u624B\u9806

1. **\u5BFE\u8C61\u306E\u78BA\u5B9A**: \u4F9D\u983C\u66F8\u306E\u300C\u30EC\u30D3\u30E5\u30FC\u5BFE\u8C61\u300D\u3068\u6307\u5B9A\u3055\u308C\u305F\u30B3\u30DE\u30F3\u30C9\u3067\u3001\u5909\u66F4\u30D5\u30A1\u30A4\u30EB\u4E00\u89A7\u3068\u5DEE\u5206\u3092\u53D6\u308B\u3002\u672A\u8FFD\u8DE1\u30D5\u30A1\u30A4\u30EB\u3082\u5BFE\u8C61\u306B\u542B\u3081\u308B\u3002\u4F9D\u983C\u66F8\u306E\u4E00\u89A7\u3068 \`git\` \u306E\u5B9F\u6E2C\u304C\u98DF\u3044\u9055\u3048\u3070\u5B9F\u6E2C\u3092\u512A\u5148\u3057\u3001\u305D\u306E\u5DEE\u7570\u3092\u8981\u7D04\u306B\u66F8\u304F\u3002
2. **\u5DEE\u5206\u3092\u5168\u90E8\u8AAD\u3080**: \u6700\u521D\u306E\u554F\u984C\u3067\u6B62\u307E\u3089\u305A\u6700\u5F8C\u307E\u3067\u8AAD\u3080\u3002\u524A\u9664\u3055\u308C\u305F\u51E6\u7406\u306E\u547C\u3073\u51FA\u3057\u5143\u3001\u5909\u66F4\u3055\u308C\u305F\u95A2\u6570\u306E\u5229\u7528\u7B87\u6240\u3001\u95A2\u9023\u3059\u308B\u30C6\u30B9\u30C8\u3082\u958B\u304F\u3002
3. **\u8981\u4EF6\u3068\u306E\u7167\u5408**: \u4F9D\u983C\u66F8\u306E\u7D4C\u7DEF\u30FB\u8981\u4EF6\u3068\u5B9F\u88C5\u3092\u7A81\u304D\u5408\u308F\u305B\u308B\u3002\u8981\u4EF6\u306E\u629C\u3051\u3001\u4F9D\u983C\u7BC4\u56F2\u3092\u8D85\u3048\u305F\u5909\u66F4\u3001\u610F\u56F3\u7684\u3068\u66F8\u304B\u308C\u305F\u7B87\u6240\u306E\u59A5\u5F53\u6027\u3092\u898B\u308B\u3002
4. **\u691C\u8A3C\u72B6\u6CC1\u306E\u88CF\u53D6\u308A**: \u4F9D\u983C\u66F8\u306E\u691C\u8A3C\u72B6\u6CC1\u3092\u8AAD\u307F\u3001\u5B9F\u884C\u3067\u304D\u308B\u78BA\u8A8D\uFF08\u30C6\u30B9\u30C8\u30FBlint\u30FB\u5DEE\u5206\u306E\u7167\u5408\uFF09\u306F\u884C\u3046\u3002\u5B9F\u884C\u3067\u304D\u306A\u3044\u74B0\u5883\u306A\u3089\u305D\u306E\u65E8\u3092\u672A\u78BA\u8A8D\u306B\u66F8\u304F\u3002
5. **\u6240\u898B\u306E\u78BA\u5B9A**: \u89B3\u70B9\u3068\u91CD\u5927\u5EA6\u306E\u57FA\u6E96\u306B\u5F53\u3066\u306F\u3081\u3001\u78BA\u4FE1\u306E\u6301\u3066\u308B\u6240\u898B\u3060\u3051\u3092\u6B8B\u3059\u3002

## \u89B3\u70B9

- **\u8981\u4EF6\u9069\u5408**: \u4F9D\u983C\u3069\u304A\u308A\u304B\u3002\u9038\u8131\u306F\u6539\u5584\u304B\u554F\u984C\u304B\u3002\u8A08\u753B\u30FB\u4ED5\u69D8\u66F8\u3078\u306E\u53C2\u7167\u304C\u3042\u308C\u3070\u6574\u5408\u3057\u3066\u3044\u308B\u304B\u3002
- **\u30B3\u30FC\u30C9\u54C1\u8CEA**: \u8CAC\u52D9\u306E\u5206\u96E2\u3001\u30A8\u30E9\u30FC\u51E6\u7406\u3001\u578B\u306E\u660E\u793A\u3001\u5916\u90E8\u5165\u529B\u306E\u691C\u8A3C\u3001\u91CD\u8907\uFF08\u610F\u5473\u306E\u540C\u3058\u898F\u5247\u304C\u4E8C\u91CD\u306B\u6301\u305F\u308C\u3066\u3044\u306A\u3044\u304B\uFF09\u3001\u5883\u754C\u5024\u3002
- **\u8A2D\u8A08**: \u65E2\u5B58\u306E\u69CB\u6210\uFF08\u30C7\u30A3\u30EC\u30AF\u30C8\u30EA\u69CB\u6210\u30FB\u5171\u901A\u306E\u4ED5\u7D44\u307F\uFF09\u306B\u6CBF\u3046\u304B\u3002\u5171\u901A\u5316\u3059\u3079\u304D\u51E6\u7406\u3092\u5404\u6240\u3067\u518D\u5B9A\u7FA9\u3057\u3066\u3044\u306A\u3044\u304B\u3002
- **\u30C6\u30B9\u30C8**: \u5B9F\u969B\u306E\u6319\u52D5\u3092\u691C\u8A3C\u3057\u3066\u3044\u308B\u304B\u3002\u5883\u754C\u5024\u30FB\u5931\u6557\u7D4C\u8DEF\u304C\u3042\u308B\u304B\u3002\u8FFD\u52A0\u30FB\u5909\u66F4\u3057\u305F\u6319\u52D5\u306B\u5BFE\u5FDC\u3059\u308B\u30C6\u30B9\u30C8\u304C\u3042\u308B\u304B\u3002
- **\u904B\u7528**: \u30B9\u30AD\u30FC\u30DE\u5909\u66F4\u306E\u79FB\u884C\u3001\u7121\u4EBA\u5B9F\u884C\u306E\u5236\u7D04\u3001\u5916\u90E8\u3078\u306E\u6295\u7A3F\u30FB\u30C7\u30FC\u30BF\u306E\u66F8\u304D\u8FBC\u307F\u306A\u3069\u4E0D\u53EF\u9006\u306A\u64CD\u4F5C\u3001\u30ED\u30B0\u30FB\u8A3C\u8DE1\u3002
- **\u6587\u66F8**: \u6319\u52D5\u3092\u5909\u3048\u305F\u7B87\u6240\u306E\u30B3\u30E1\u30F3\u30C8\u30FB\u30C9\u30AD\u30E5\u30E1\u30F3\u30C8\u30FB\u8868\uFF08\u30B3\u30DE\u30F3\u30C9\u306E\u4E00\u89A7\u306A\u3069\uFF09\u306E\u66F4\u65B0\u3002

## \u91CD\u5927\u5EA6

| \u91CD\u5927\u5EA6 | \u5185\u5BB9 |
| --- | --- |
| critical | \u4E0D\u5177\u5408\u3001\u30C7\u30FC\u30BF\u7834\u640D\u30FB\u6D88\u5931\u3001\u30BB\u30AD\u30E5\u30EA\u30C6\u30A3\u3001\u52D5\u304B\u306A\u3044\u3001\u4E0D\u53EF\u9006\u306A\u64CD\u4F5C\u306E\u8AA4\u308A |
| important | \u8A2D\u8A08\u4E0A\u306E\u554F\u984C\u3001\u8981\u4EF6\u306E\u629C\u3051\u3001\u4E0D\u5341\u5206\u306A\u30A8\u30E9\u30FC\u51E6\u7406\u3001\u30C6\u30B9\u30C8\u306E\u6B20\u843D\u3001\u4FDD\u5B88\u3092\u640D\u306A\u3046\u898F\u7D04\u9055\u53CD |
| minor | \u53EF\u8AAD\u6027\u3001\u5C0F\u3055\u306A\u6700\u9069\u5316\u3001\u6587\u66F8\u30FB\u30B3\u30E1\u30F3\u30C8\u306E\u78E8\u304D\u8FBC\u307F |

\u6570\u3092\u63C3\u3048\u308B\u305F\u3081\u306B\u6240\u898B\u3092\u4F5C\u3089\u306A\u3044\u3002\u554F\u984C\u304C\u7121\u3051\u308C\u3070\u7121\u3044\u3068\u66F8\u304D\u3001\u305D\u306E\u6839\u62E0\u3092\u8981\u7D04\u306B\u66F8\u304F\u3002

## \u6240\u898B\u306E\u66F8\u304D\u65B9

1 \u4EF6\u3054\u3068\u306B\u3001\u5BFE\u8C61\uFF08\u30D5\u30A1\u30A4\u30EB\u3068\u884C\uFF09\u3001\u4F55\u304C\u554F\u984C\u304B\u3001\u306A\u305C\u554F\u984C\u304B\uFF08\u3069\u306E\u5165\u529B\u30FB\u7D4C\u8DEF\u3067\u8D77\u304D\u308B\u304B\uFF09\u3001\u3069\u3046\u76F4\u3059\u304B\u3001\u6839\u62E0\u306E\u51FA\u6240\u3092\u66F8\u304F\u3002\u8868\u73FE\u306F\u5E73\u6613\u306B\u3057\u3001\u300C\u6539\u5584\u3059\u3079\u304D\u300D\u306E\u3088\u3046\u306A\u66D6\u6627\u306A\u6307\u6458\u306B\u3057\u306A\u3044\u3002

## \u51FA\u529B\u5F62\u5F0F

- **\u51FA\u529B\u306E\u5F62\uFF08JSON \u30B9\u30AD\u30FC\u30DE\u306A\u3069\uFF09\u304C\u4F9D\u983C\u6587\u3067\u6307\u5B9A\u3055\u308C\u3066\u3044\u308B\u5834\u5408**\uFF08review-loop \u304B\u3089\u306E\u4F9D\u983C\u306A\u3069\uFF09: \u305D\u306E\u5F62\u3069\u304A\u308A\u306E\u5185\u5BB9\u3060\u3051\u3092\u6700\u7D42\u5FDC\u7B54\u306B\u3059\u308B\u3002\u9805\u76EE\u306E\u610F\u5473\u306F\u4F9D\u983C\u6587\u306E\u6C7A\u307E\u308A\u306B\u5F93\u3046\u3002
- **\u305D\u308C\u4EE5\u5916\uFF08\u4EBA\u30FB\u30B5\u30D6\u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u304B\u3089\u306E\u4F9D\u983C\uFF09**: \u65E5\u672C\u8A9E\u306E Markdown \u3067\u3001\u6B21\u306E\u898B\u51FA\u3057\u306E\u9806\u306B\u66F8\u304F\u3002
  1. \`### \u826F\u3044\u70B9\`\uFF08\u5177\u4F53\u7684\u306B\uFF09
  2. \`### \u6240\u898B\` \u3092 \`#### Critical\` / \`#### Important\` / \`#### Minor\` \u306B\u5206\u3051\u3001\u5404\u4EF6\u3092\u300C\u5BFE\u8C61\u30FB\u5185\u5BB9\u30FB\u7406\u7531\u30FB\u76F4\u3057\u65B9\u30FB\u6839\u62E0\u306E\u51FA\u6240\u300D\u3067\u66F8\u304F
  3. \`### \u672A\u78BA\u8A8D\`\uFF08\u78BA\u304B\u3081\u3089\u308C\u306A\u304B\u3063\u305F\u4E8B\u9805\u3002\u7121\u3051\u308C\u3070\u300C\u306A\u3057\u300D\uFF09
  4. \`### \u5224\u5B9A\`\uFF08\u30DE\u30FC\u30B8\u53EF / \u4FEE\u6B63\u5F8C\u306B\u53EF / \u4E0D\u53EF \u3068\u30011\u301C2 \u6587\u306E\u7406\u7531\uFF09

## \u5B8C\u4E86\u6761\u4EF6

\u5BFE\u8C61\u306E\u5168\u5DEE\u5206\u3092\u8AAD\u307F\u3001\u6240\u898B\u30FB\u672A\u78BA\u8A8D\u30FB\u5224\u5B9A\u3092\u4E0A\u306E\u5F62\u5F0F\u3067\u8FD4\u3057\u305F\u3089\u5B8C\u4E86\u3002\u4FEE\u6B63\u30FB\u30B9\u30C6\u30FC\u30B8\u30FB\u30B3\u30DF\u30C3\u30C8\u306F\u884C\u308F\u306A\u3044\u3002
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
var reviewer_prompt_default = `# \u30B3\u30FC\u30C9\u30EC\u30D3\u30E5\u30FC\u4F9D\u983C\uFF08review-loop Run {{RUN_ID}} / \u30E9\u30A6\u30F3\u30C9 {{ROUND}}\uFF09

\u3042\u306A\u305F\u306F\u3053\u306E\u30EA\u30DD\u30B8\u30C8\u30EA\u306E\u5909\u66F4\u3092\u30EC\u30D3\u30E5\u30FC\u3059\u308B\u30EC\u30D3\u30E5\u30A2\u30FC\u3067\u3042\u308B\u3002\u4E0B\u306E\u300C\u30EC\u30D3\u30E5\u30A2\u30FC\u306E\u624B\u9806\u300D\u306B\u5F93\u3044\u3001\u305D\u306E\u89B3\u70B9\u30FB\u91CD\u5927\u5EA6\u306E\u57FA\u6E96\u3067\u6240\u898B\u3092\u51FA\u3059\u3002\u5FDC\u7B54\u3068\u6240\u898B\u306E\u6587\u7AE0\u306F\u65E5\u672C\u8A9E\u3067\u66F8\u304F\u3002

## \u5236\u7D04

- \u8AAD\u307F\u53D6\u308A\u5C02\u7528\u3002\u30D5\u30A1\u30A4\u30EB\u306E\u4F5C\u6210\u30FB\u5909\u66F4\u3001index\u30FBHEAD\u30FB\u30D6\u30E9\u30F3\u30C1\u306E\u5909\u66F4\u3001\u30B3\u30DF\u30C3\u30C8\u3001\u4ED6\u306E\u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u3078\u306E\u59D4\u8B72\u3092\u3057\u306A\u3044\u3002
- \u4F9D\u983C\u66F8\u3084\u524D\u56DE\u306E\u5BFE\u5FDC\u8868\u306E\u4E3B\u5F35\uFF08\u30C6\u30B9\u30C8\u304C\u901A\u3063\u305F\u3001\u4FEE\u6B63\u6E08\u307F\uFF09\u306F\u3001\u30B3\u30FC\u30C9\u3068 \`git diff\` \u306E\u73FE\u7269\u3067\u78BA\u304B\u3081\u3066\u304B\u3089\u6271\u3046\u3002\u78BA\u304B\u3081\u3089\u308C\u306A\u3044\u3053\u3068\u306F \`unverified\` \u306B\u66F8\u304F\u3002
- \u30C6\u30B9\u30C8\u3092\u5B9F\u884C\u3067\u304D\u306A\u3044\uFF08\u8AAD\u307F\u53D6\u308A\u5C02\u7528\u30B5\u30F3\u30C9\u30DC\u30C3\u30AF\u30B9\u3067\u66F8\u304D\u8FBC\u307F\u304C\u8981\u308B\uFF09\u5834\u5408\u306F\u5B9F\u884C\u305B\u305A\u3001\u305D\u306E\u65E8\u3092 \`unverified\` \u306B\u66F8\u304F\u3002
- \u6700\u7D42\u5FDC\u7B54\u306F\u6307\u5B9A\u3055\u308C\u305F JSON \u30B9\u30AD\u30FC\u30DE\u306B\u5F93\u3046\u3002\u30B9\u30AD\u30FC\u30DE\u4EE5\u5916\u306E\u6587\u7AE0\u30FBMarkdown \u3092\u6700\u7D42\u5FDC\u7B54\u306B\u542B\u3081\u306A\u3044\u3002

## \u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u306E\u898F\u7D04\u3068\u691C\u8A3C\u30B3\u30DE\u30F3\u30C9

{{PROJECT}}

## \u30EC\u30D3\u30E5\u30FC\u5BFE\u8C61

{{SCOPE}}

## \u4F9D\u983C\u66F8\uFF08\u5B9F\u88C5\u5074\u304C\u66F8\u3044\u305F\u80CC\u666F\u30FB\u610F\u56F3\u30FB\u691C\u8A3C\u72B6\u6CC1\uFF09

{{REQUEST}}

## \u524D\u56DE\u30E9\u30A6\u30F3\u30C9\u306E\u6240\u898B\u3068\u5B9F\u88C5\u5074\u306E\u5BFE\u5FDC

{{PREVIOUS}}

## \u51FA\u529B\u306E\u6C7A\u307E\u308A

- \`verdict\`: \u5BFE\u5FDC\u304C\u5FC5\u8981\u306A\u6240\u898B\uFF08critical / important\u3001\u307E\u305F\u306F\u5BFE\u5FDC\u3059\u3079\u304D minor\uFF09\u304C\u3042\u308C\u3070 \`needs_attention\`\u3001\u306A\u3051\u308C\u3070 \`approve\`\u3002
- \`severity\`: \`critical\`\uFF08\u4E0D\u5177\u5408\u30FB\u30C7\u30FC\u30BF\u7834\u640D\u30FB\u30BB\u30AD\u30E5\u30EA\u30C6\u30A3\u30FB\u52D5\u304B\u306A\u3044\u30FB\u4E0D\u53EF\u9006\u306A\u64CD\u4F5C\u306E\u8AA4\u308A\uFF09\u3001\`important\`\uFF08\u8A2D\u8A08\u30FB\u8981\u4EF6\u6F0F\u308C\u30FB\u30A8\u30E9\u30FC\u51E6\u7406\u30FB\u30C6\u30B9\u30C8\u4E0D\u8DB3\u30FB\u4FDD\u5B88\u3092\u640D\u306A\u3046\u898F\u7D04\u9055\u53CD\uFF09\u3001\`minor\`\uFF08\u53EF\u8AAD\u6027\u30FB\u5C0F\u3055\u306A\u6700\u9069\u5316\u30FB\u6587\u66F8\uFF09\u3002
- \`scope\`: \u4ECA\u56DE\u306E\u5909\u66F4\u3067\u5165\u3063\u305F\u554F\u984C\u306F \`change\`\u3001\u5909\u66F4\u524D\u304B\u3089\u5B58\u5728\u3059\u308B\u554F\u984C\u306F \`pre_existing\`\u3002
- \`file\` \u306F\u30EA\u30DD\u30B8\u30C8\u30EA\u30EB\u30FC\u30C8\u304B\u3089\u306E\u76F8\u5BFE\u30D1\u30B9\u3001\`line_start\` / \`line_end\` \u306F\u73FE\u5728\u306E\u4F5C\u696D\u30C4\u30EA\u30FC\u306E\u884C\u756A\u53F7\uFF08\u524A\u9664\u884C\u3078\u306E\u6307\u6458\u306F\u76F4\u524D\u306E\u884C\u3001\u65B0\u898F\u30D5\u30A1\u30A4\u30EB\u5168\u4F53\u306A\u3089 0\uFF09\u3002
- \`evidence\`: \`source\`\uFF08\u30B3\u30FC\u30C9\u3092\u8AAD\u3093\u3067\u78BA\u8A8D\uFF09\u3001\`measured\`\uFF08\u30B3\u30DE\u30F3\u30C9\u5B9F\u884C\u306E\u5B9F\u6E2C\uFF09\u3001\`inferred\`\uFF08\u63A8\u6E2C\u3002\u63A8\u6E2C\u306E\u307E\u307E\u65AD\u5B9A\u3057\u306A\u3044\uFF09\u3002
- \`body\` \u306B\u306F\u4F55\u304C\u554F\u984C\u3067\u3001\u306A\u305C\u554F\u984C\u304B\u3001\u3069\u306E\u5165\u529B\u30FB\u7D4C\u8DEF\u3067\u8D77\u304D\u308B\u304B\u3092\u66F8\u304F\u3002\`recommendation\` \u306B\u306F\u76F4\u3057\u65B9\u3092\u66F8\u304F\uFF08\u7121\u3051\u308C\u3070\u7A7A\u6587\u5B57\uFF09\u3002
- \`tests_run\` \u306B\u306F\u5B9F\u884C\u3057\u305F\u30B3\u30DE\u30F3\u30C9\u3068\u7D50\u679C\u3001\`unverified\` \u306B\u306F\u78BA\u8A8D\u3067\u304D\u306A\u304B\u3063\u305F\u4E8B\u9805\u3092\u66F8\u304F\u3002\u7121\u3051\u308C\u3070\u7A7A\u914D\u5217\u3002
- \u6240\u898B\u304C\u7121\u3051\u308C\u3070 \`findings\` \u306F\u7A7A\u914D\u5217\u306B\u3057\u3001\`summary\` \u306B\u305D\u306E\u6839\u62E0\u3092\u66F8\u304F\u3002\u6570\u3092\u63C3\u3048\u308B\u305F\u3081\u306B\u6240\u898B\u3092\u4F5C\u3089\u306A\u3044\u3002

## \u30EC\u30D3\u30E5\u30A2\u30FC\u306E\u624B\u9806

\u4EE5\u4E0B\u306F \`perform-code-review\` \u30B9\u30AD\u30EB\u306E\u672C\u6587\u3067\u3042\u308B\u3002\u300C\u51FA\u529B\u5F62\u5F0F\u300D\u306F review-loop \u304B\u3089\u306E\u4F9D\u983C\u306E\u5834\u5408\u306B\u5F53\u305F\u308A\u3001\u6700\u7D42\u5FDC\u7B54\u306F\u4E0A\u306E JSON \u30B9\u30AD\u30FC\u30DE\u306B\u5F93\u3046\u3002

{{REVIEWER_GUIDE}}
`;

// src/lib/config.ts
import { join } from "path";

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
var isNotFoundError = (error) => error instanceof Error && ("code" in error) && error.code === "ENOENT";
var readTextIfExists = async (path) => {
  try {
    return await Bun.file(path).text();
  } catch (error) {
    if (isNotFoundError(error))
      return null;
    throw error;
  }
};
var writeText = async (path, text) => {
  await Bun.write(path, text);
};
var writeJson = (path, data) => writeText(path, `${JSON.stringify(data, null, "\t")}
`);

// src/lib/util.ts
import { dirname } from "path";
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
    throw new Error(`${label} \u3092 JSON \u3068\u3057\u3066\u8AAD\u3081\u307E\u305B\u3093: ${errorMessage(error)}`);
  }
  const result = safeParse(schema, data);
  if (!result.success) {
    throw new Error(`${label} \u306E\u5F62\u5F0F\u304C\u4E0D\u6B63\u3067\u3059: ${formatIssues(result.issues)}`);
  }
  return result.output;
};
var scriptCommand = (name) => {
  const entry = process.argv[1];
  const distDir = entry?.endsWith(".mjs") === true ? dirname(entry) : "${CLAUDE_PLUGIN_ROOT}/dist";
  const path = `${distDir}/${name}.mjs`;
  return /^[\w@%+=:,./-]+$/.test(path) ? `bun ${path}` : `bun '${path.replaceAll("'", "'\\''")}'`;
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
\u4E0D\u660E\u306A\u5F15\u6570: ${flag}`);
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
    throw new Error(`${label} \u306F 1 \u4EE5\u4E0A\u306E\u6574\u6570\u3067\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044: ${value}`);
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
  throw new Error(`${label} \u306F true \u304B false \u3067\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044: ${value}`);
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
var RepoRelativePathSchema = pipe(string(), minLength(1), check((path) => !path.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(path) && !path.split(/[\\/]/).includes(".."), "\u30EA\u30DD\u30B8\u30C8\u30EA\u30EB\u30FC\u30C8\u304B\u3089\u306E\u76F8\u5BFE\u30D1\u30B9\u3067\u3001.. \u3092\u542B\u307E\u306A\u3044\u5F62\u306B\u3057\u3066\u304F\u3060\u3055\u3044"));
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
    throw new Error(`${PROJECT_CONFIG_PATH} \u306E\u5F62\u5F0F\u304C\u4E0D\u6B63\u3067\u3059: ${parsedFile.success ? "JSON \u306E\u30AA\u30D6\u30B8\u30A7\u30AF\u30C8\u306B\u3057\u3066\u304F\u3060\u3055\u3044" : formatIssues(parsedFile.issues)}`);
  }
  const { $schema: _, ...fromFile } = parsedFile.output;
  const defined = Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined));
  const result = safeParse(ReviewLoopConfigSchema, {
    ...DEFAULT_CONFIG2,
    ...fromFile,
    ...defined
  });
  if (!result.success) {
    throw new Error(`review-loop \u306E\u8A2D\u5B9A\u304C\u4E0D\u6B63\u3067\u3059: ${formatIssues(result.issues)}`);
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
      throw new Error(`${PROJECT_CONFIG_PATH} \u3092 JSON \u3068\u3057\u3066\u8AAD\u3081\u307E\u305B\u3093: ${errorMessage(error)}`);
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
  `- \u8A2D\u5B9A: \u30E2\u30C7\u30EB ${config.model ?? "Codex \u65E2\u5B9A"} / effort ${config.reasoningEffort ?? "Codex \u65E2\u5B9A"} / \u6700\u5927 ${config.maxRounds} \u30E9\u30A6\u30F3\u30C9 / autoCommit ${config.autoCommit} / \u6253\u3061\u5207\u308A ${config.timeoutMinutes} \u5206`,
  `- lint: ${config.lintCommand ?? "\u672A\u8A2D\u5B9A\uFF08\u898F\u7D04\u30D5\u30A1\u30A4\u30EB\u306B\u5F93\u3046\uFF09"} / \u30C6\u30B9\u30C8: ${config.testCommand ?? "\u672A\u8A2D\u5B9A\uFF08\u898F\u7D04\u30D5\u30A1\u30A4\u30EB\u306B\u5F93\u3046\uFF09"}`,
  `- \u7BC4\u56F2\u5916\u306E\u8A18\u9332\u5148: ${config.outOfScopeFile}`
];

// src/lib/process.ts
var runProcess = async (command, args, options) => {
  const child = Bun.spawn([command, ...args], {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdin: options.input === undefined ? "ignore" : new TextEncoder().encode(options.input),
    stdout: "pipe",
    stderr: "pipe"
  });
  let timedOut = false;
  const timer = options.timeoutMs === undefined ? undefined : setTimeout(() => {
    timedOut = true;
    child.kill();
  }, options.timeoutMs);
  try {
    const outputs = Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited
    ]);
    if (options.onSpawn) {
      try {
        await options.onSpawn(child.pid);
      } catch (error) {
        child.kill();
        outputs.catch(() => {});
        throw error;
      }
    }
    const [stdout, stderr] = await outputs;
    return { exitCode: child.exitCode, timedOut, stdout, stderr };
  } finally {
    clearTimeout(timer);
  }
};

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
import { readdir } from "fs/promises";
import { isAbsolute, join as join3 } from "path";

// src/lib/git.ts
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join as join2 } from "path";
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
    throw new Error(`git ${args.join(" ")} \u304C\u5931\u6557\u3057\u307E\u3057\u305F\uFF08exit ${result.exitCode}\uFF09: ${result.stderr.trim()}`);
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
  throw new Error(`git diff --quiet ${from} ${to} \u304C\u5931\u6557\u3057\u307E\u3057\u305F\uFF08exit ${result.exitCode}\uFF09: ${result.stderr.trim()}`);
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
  throw new Error(`git cat-file blob ${tree}:${path} \u304C\u5931\u6557\u3057\u307E\u3057\u305F\uFF08exit ${result.exitCode}\uFF09: ${result.stderr.trim()}`);
};
var isIgnored = async (git, path) => {
  const result = await git(["check-ignore", "-q", "--no-index", path]);
  if (result.exitCode === 0)
    return true;
  if (result.exitCode === 1)
    return false;
  throw new Error(`git check-ignore ${path} \u304C\u5931\u6557\u3057\u307E\u3057\u305F\uFF08exit ${result.exitCode}\uFF09: ${result.stderr.trim()}`);
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
  implementing: "\u5B9F\u88C5\u4E2D",
  reviewing: "Codex \u306E\u30EC\u30D3\u30E5\u30FC\u5F85\u3061",
  triaging: "\u6240\u898B\u306E\u7CBE\u67FB\u5F85\u3061",
  fixing: "\u6307\u6458\u3078\u306E\u5BFE\u5FDC\u4E2D",
  ready_to_finish: "\u30B3\u30DF\u30C3\u30C8\u306E\u6E96\u5099\u5F85\u3061",
  awaiting_confirmation: "\u30B3\u30DF\u30C3\u30C8\u306E\u78BA\u8A8D\u5F85\u3061",
  review_failed: "\u30EC\u30D3\u30E5\u30FC\u306E\u5931\u6557",
  max_rounds: "\u30E9\u30A6\u30F3\u30C9\u4E0A\u9650\u306B\u5230\u9054",
  done: "\u5B8C\u4E86",
  aborted: "\u4E2D\u6B62"
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
    throw new Error(`Run ID \u306E\u5F62\u5F0F\u304C\u4E0D\u6B63\u3067\u3059\uFF08YYYY-MM-DD.HHmmss\uFF09: ${runId}`);
  }
  const text = await readTextIfExists(runFilePath(workDir, runId, STATE_FILE_NAME));
  const display = runFileDisplayPath(runId, STATE_FILE_NAME);
  if (text === null) {
    throw new Error(`Run ${runId} \u306E\u72B6\u614B\u30D5\u30A1\u30A4\u30EB\u304C\u3042\u308A\u307E\u305B\u3093: ${display}`);
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
        throw new Error("Run ID \u306E\u4E0D\u4E00\u81F4");
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
    throw new Error(`\u8AAD\u3081\u306A\u3044\u72B6\u614B\u30D5\u30A1\u30A4\u30EB\u304C\u3042\u308A\u307E\u3059\uFF08${invalid.join(", ")}\uFF09\u3002\u9032\u884C\u4E2D\u306E Run \u3092\u898B\u843D\u3068\u3055\u306A\u3044\u3088\u3046\u3001--run <run-id> \u3092\u660E\u793A\u3059\u308B\u304B\u3001\u30D5\u30A1\u30A4\u30EB\u3092\u76F4\u3059\u304B\u9000\u907F\u3057\u3066\u304F\u3060\u3055\u3044`);
  }
  const active = findActiveRuns(states);
  const only = active[0];
  if (active.length === 1 && only) {
    return only;
  }
  if (active.length === 0) {
    throw new Error(`\u9032\u884C\u4E2D\u306E Run \u304C\u3042\u308A\u307E\u305B\u3093\u3002${scriptCommand("start-run")} \u3067\u958B\u59CB\u3059\u308B\u304B\u3001--run <run-id> \u3092\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044`);
  }
  throw new Error(`\u9032\u884C\u4E2D\u306E Run \u304C\u8907\u6570\u3042\u308A\u307E\u3059\uFF08${active.map((state) => state.runId).join(", ")}\uFF09\u3002--run <run-id> \u3067\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044`);
};
var parseReasoningEffort = (value) => {
  if (value === undefined)
    return;
  const result = safeParse(picklist(REASONING_EFFORTS), value);
  if (!result.success) {
    throw new Error(`--effort \u306F ${REASONING_EFFORTS.join(" | ")} \u306E\u3044\u305A\u308C\u304B\u3067\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044: ${value}`);
  }
  return result.output;
};
var resolveWorkspace = async (cwd = process.cwd()) => {
  const root = await findRepoRoot(cwd);
  if (root === null) {
    throw new Error(`git \u30EA\u30DD\u30B8\u30C8\u30EA\u306E\u4E2D\u3067\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044\uFF08\u73FE\u5728\u306E\u30C7\u30A3\u30EC\u30AF\u30C8\u30EA: ${cwd}\uFF09`);
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
  change: "\u4ECA\u56DE\u306E\u5909\u66F4",
  pre_existing: "\u5909\u66F4\u524D\u304B\u3089\u306E\u554F\u984C"
};
var EVIDENCE_LABELS = {
  source: "\u30BD\u30FC\u30B9\u78BA\u8A8D",
  measured: "\u5B9F\u6E2C",
  inferred: "\u63A8\u6E2C"
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
var listOrNone = (items) => items.length === 0 ? ["- \u306A\u3057"] : items.map((item) => `- ${item}`);
var renderReviewResult = (result) => {
  const counts = countBySeverity(result.findings);
  const lines = [
    `## Codex \u30EC\u30D3\u30E5\u30FC\u7D50\u679C\uFF08Run ${result.runId} / \u30E9\u30A6\u30F3\u30C9 ${result.round}\uFF09`,
    `- \u5224\u5B9A: ${result.verdict}\uFF08\u6240\u898B ${result.findings.length} \u4EF6: critical ${counts.critical} / important ${counts.important} / minor ${counts.minor}\uFF09`,
    `- \u30E2\u30C7\u30EB: ${result.model ?? "Codex \u65E2\u5B9A"} / effort: ${result.reasoningEffort ?? "Codex \u65E2\u5B9A"}`,
    `- \u8981\u7D04: ${result.summary}`
  ];
  if (result.findings.length > 0) {
    lines.push("", "### \u6240\u898B");
    for (const finding of result.findings) {
      lines.push("", `#### ${finding.id} [${finding.severity}] ${finding.title}`, `- \u5BFE\u8C61: ${finding.file}:${finding.line_start}-${finding.line_end}\uFF08${SCOPE_LABELS[finding.scope]}\uFF09`, `- \u5185\u5BB9: ${finding.body}`, `- \u63A8\u5968: ${finding.recommendation || "\u306A\u3057"}`, `- \u6839\u62E0\u306E\u51FA\u6240: ${EVIDENCE_LABELS[finding.evidence]}`);
    }
  }
  lines.push("", "### Codex \u304C\u5B9F\u884C\u3057\u305F\u30C6\u30B9\u30C8", ...listOrNone(result.testsRun), "", "### Codex \u304C\u78BA\u8A8D\u3067\u304D\u306A\u304B\u3063\u305F\u3053\u3068", ...listOrNone(result.unverified));
  return lines.join(`
`);
};

// src/lib/dispositions.ts
var DISPOSITIONS = ["addressed", "rejected", "out_of_scope"];
var DISPOSITION_LABELS = {
  addressed: "\u5BFE\u5FDC\uFF08\u4FEE\u6B63\uFF09",
  rejected: "\u5374\u4E0B",
  out_of_scope: "\u7BC4\u56F2\u5916\u3068\u3057\u3066\u8A18\u9332"
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
    problems.push(`round \u304C ${input.round} \u3067\u306F\u3042\u308A\u307E\u305B\u3093: ${input.dispositions.round}`);
  }
  const findingIds = new Set(input.findings.map((finding) => finding.id));
  const seen = new Set;
  for (const item of input.dispositions.items) {
    if (!findingIds.has(item.id)) {
      problems.push(`\u6240\u898B\u306B\u7121\u3044 ID \u3067\u3059: ${item.id}`);
    }
    if (seen.has(item.id)) {
      problems.push(`ID \u304C\u91CD\u8907\u3057\u3066\u3044\u307E\u3059: ${item.id}`);
    }
    seen.add(item.id);
    if (item.disposition !== "addressed" && item.note.trim() === "") {
      problems.push(`${item.id}: ${DISPOSITION_LABELS[item.disposition]} \u306B\u306F note\uFF08\u6839\u62E0\u307E\u305F\u306F\u8A18\u9332\u306E\u8981\u7D04\uFF09\u304C\u5FC5\u8981\u3067\u3059`);
    }
    if (item.disposition === "out_of_scope" && !hasOutOfScopeRecord(input.outOfScopeTodoText, input.runId, item.id)) {
      problems.push(`${item.id}: out_of_scope \u306E\u6240\u898B\u306F\u5148\u306B ${input.outOfScopeFile} \u306E\u4E00\u89A7\u3078\u3001\u767A\u898B\u5143\u300C${formatOutOfScopeSource(input.runId, item.id)}\u300D\u306E\u884C\u3068\u3057\u3066\u8FFD\u8A18\u3057\u3066\u304F\u3060\u3055\u3044`);
    }
  }
  for (const id of findingIds) {
    if (!seen.has(id)) {
      problems.push(`\u5BFE\u5FDC\u304C\u66F8\u304B\u308C\u3066\u3044\u306A\u3044\u6240\u898B\u304C\u3042\u308A\u307E\u3059: ${id}`);
    }
  }
  return problems;
};
var countDispositions = (items) => ({
  addressed: items.filter((item) => item.disposition === "addressed").length,
  rejected: items.filter((item) => item.disposition === "rejected").length,
  out_of_scope: items.filter((item) => item.disposition === "out_of_scope").length
});
var checkNoneAllowed = (findingCount, dispositionsPath) => findingCount > 0 ? `\u6240\u898B\u304C ${findingCount} \u4EF6\u3042\u308B\u305F\u3081 --none \u306F\u4F7F\u3048\u307E\u305B\u3093\u3002\u5BFE\u5FDC\u8868\u3092 ${dispositionsPath} \u306B\u66F8\u3044\u3066\u304F\u3060\u3055\u3044` : null;
var decideNextPhase = (input) => {
  if (countDispositions(input.items).addressed === 0) {
    return "ready_to_finish";
  }
  return input.round >= input.maxRounds ? "max_rounds" : "fixing";
};
var OUT_OF_SCOPE_TEMPLATE = `# \u7BC4\u56F2\u5916\u306E\u554F\u984C\u306E\u8A18\u9332

\u4F5C\u696D\u306E\u9014\u4E2D\u3067\u898B\u3064\u3051\u305F\u3001\u4F9D\u983C\u306E\u5B8C\u4E86\u306B\u5FC5\u9808\u3067\u306A\u3044\u4E0D\u5177\u5408\u30FB\u6539\u5584\u6848\u306E\u8A18\u9332\u3002\u76F4\u3055\u305A\u306B\u3053\u3053\u3078\u66F8\u304D\u3001\u63A1\u5426\u306F\u5F8C\u3067\u6C7A\u3081\u308B\u3002

## \u8A18\u5165\u306E\u6C7A\u307E\u308A

- 1 \u4EF6\u3092 1 \u884C\u3067\u3001\u4E00\u89A7\u306E\u672B\u5C3E\u306B\u8FFD\u8A18\u3059\u308B\u3002\u65E2\u5B58\u306E\u884C\u306F\u66F8\u304D\u63DB\u3048\u306A\u3044\uFF08\u72B6\u614B\u306E\u66F4\u65B0\u306F\u5225\u306E\u30B3\u30DF\u30C3\u30C8\u3067\u884C\u3046\uFF09\u3002
- ID \u306F \`OOS-<\u9023\u756A>\`\u3002\u65E5\u4ED8\u306F\u8A18\u9332\u3057\u305F\u65E5\uFF08YYYY-MM-DD\uFF09\u3002
- \u767A\u898B\u5143: Codex \u306E\u6240\u898B\u306A\u3089 \`review-loop <Run ID> <\u6240\u898B ID>\`\u3001\u30EB\u30FC\u30D7\u4E2D\u306B\u81EA\u5206\u3067\u898B\u3064\u3051\u305F\u3082\u306E\u306F \`review-loop <Run ID> self\`\u3002
- \u5BFE\u8C61\u306F\u30D5\u30A1\u30A4\u30EB\u3068\u884C\uFF08\`path:line\`\uFF09\u3002\u72B6\u614B\u306F\u300C\u672A\u7740\u624B\u300D\u300C\u5BFE\u5FDC\u6E08\u307F\u300D\u300C\u898B\u9001\u308A\u300D\u306E\u3044\u305A\u308C\u304B\u3002

## \u4E00\u89A7

| ID | \u65E5\u4ED8 | \u767A\u898B\u5143 | \u5BFE\u8C61 | \u5185\u5BB9 | \u7BC4\u56F2\u5916\u3068\u3057\u305F\u7406\u7531 | \u72B6\u614B |
| --- | --- | --- | --- | --- | --- | --- |
`;

// src/lib/reviewer-prompt.ts
var PLACEHOLDER_PATTERN = /\{\{([A-Z_]+)\}\}/g;
var interpolateTemplate = (template, values) => template.replace(PLACEHOLDER_PATTERN, (placeholder, key) => {
  const value = values[key];
  if (value === undefined) {
    throw new Error(`\u96DB\u5F62\u306E\u5DEE\u3057\u8FBC\u307F\u5148\u306B\u5024\u304C\u3042\u308A\u307E\u305B\u3093: ${placeholder}`);
  }
  return value;
});
var renderScopeSection = (input) => {
  if (input.previousTree === null) {
    return [
      "1 \u56DE\u76EE\u306E\u30EC\u30D3\u30E5\u30FC\u3002\u5BFE\u8C61\u306F\u4F5C\u696D\u30C4\u30EA\u30FC\u5168\u4F53\u306E\u5909\u66F4\uFF08\u672A\u8FFD\u8DE1\u30D5\u30A1\u30A4\u30EB\u3092\u542B\u3080\uFF09\u3002",
      `- \u5909\u66F4\u30D5\u30A1\u30A4\u30EB\u4E00\u89A7: \`git diff --stat HEAD ${input.tree}\``,
      `- \u5909\u66F4\u5185\u5BB9: \`git diff HEAD ${input.tree}\``,
      `\u30C4\u30EA\u30FC \`${input.tree}\` \u306F\u30EC\u30D3\u30E5\u30FC\u4F9D\u983C\u6642\u70B9\u306E\u4F5C\u696D\u30C4\u30EA\u30FC\u306E\u30B9\u30CA\u30C3\u30D7\u30B7\u30E7\u30C3\u30C8\u3067\u3001\u73FE\u5728\u306E\u4F5C\u696D\u30C4\u30EA\u30FC\u3068\u540C\u3058\u5185\u5BB9\u3067\u3042\u308B\u3002\u30D5\u30A1\u30A4\u30EB\u306F\u76F4\u63A5\u8AAD\u3093\u3067\u3088\u3044\u3002`
    ].join(`
`);
  }
  return [
    `${input.round} \u56DE\u76EE\u306E\u30EC\u30D3\u30E5\u30FC\u3002\u524D\u56DE\u306E\u6240\u898B\u3078\u306E\u5BFE\u5FDC\u3068\u3057\u3066\u5165\u3063\u305F\u4FEE\u6B63\uFF08\u5DEE\u5206\u306E\u307F\uFF09\u3092\u898B\u308B\u3002`,
    `- \u4ECA\u56DE\u306E\u5DEE\u5206: \`git diff ${input.previousTree} ${input.tree}\`\uFF08\u524D\u56DE\u30EC\u30D3\u30E5\u30FC\u6642\u306E\u30B9\u30CA\u30C3\u30D7\u30B7\u30E7\u30C3\u30C8\u304B\u3089\u4ECA\u56DE\u307E\u3067\uFF09`,
    `- \u5168\u4F53\u306E\u5909\u66F4\uFF08\u6587\u8108\u306E\u7406\u89E3\u7528\uFF09: \`git diff HEAD ${input.tree}\``,
    "\u4ECA\u56DE\u306E\u6240\u898B\u306F\u3001\u4ECA\u56DE\u306E\u5DEE\u5206\u3068\u3001\u305D\u306E\u5DEE\u5206\u304C\u58CA\u3057\u305F\u7B87\u6240\u306B\u9650\u308B\u3002\u524D\u56DE\u5374\u4E0B\u3055\u308C\u305F\u6240\u898B\u306F\u3001\u5374\u4E0B\u7406\u7531\u306B\u53CD\u8AD6\u3067\u304D\u308B\u6839\u62E0\u304C\u3042\u308B\u5834\u5408\u3060\u3051\u518D\u63D0\u8D77\u3059\u308B\u3002\u524D\u56DE\u300C\u5BFE\u5FDC\uFF08\u4FEE\u6B63\uFF09\u300D\u3068\u3055\u308C\u305F\u6240\u898B\u306F\u3001\u5DEE\u5206\u3067\u672C\u5F53\u306B\u76F4\u3063\u3066\u3044\u308B\u304B\u3092\u78BA\u304B\u3081\u3001\u76F4\u3063\u3066\u3044\u306A\u3051\u308C\u3070\u518D\u63D0\u8D77\u3059\u308B\u3002"
  ].join(`
`);
};
var renderProjectSection = (input) => {
  const lines = input.conventionFiles.length === 0 ? [
    "- \u898F\u7D04\u30D5\u30A1\u30A4\u30EB\uFF08AGENTS.md\u30FBCLAUDE.md \u306A\u3069\uFF09\u306F\u898B\u3064\u304B\u3089\u306A\u304B\u3063\u305F\u3002\u65E2\u5B58\u306E\u30B3\u30FC\u30C9\u306E\u66F8\u304D\u65B9\u3092\u898F\u7D04\u3068\u307F\u306A\u3059\u3002"
  ] : [
    `- \u898F\u7D04\u30D5\u30A1\u30A4\u30EB: ${input.conventionFiles.map((path) => `\`${path}\``).join("\u3001")}\u3002\u6700\u521D\u306B\u8AAD\u307F\u3001\u7167\u3089\u3057\u5408\u308F\u305B\u308B\uFF08\u305D\u3053\u304B\u3089\u53C2\u7167\u3055\u308C\u3066\u3044\u308B\u6587\u66F8\u3082\u5FC5\u8981\u306B\u5FDC\u3058\u3066\u8AAD\u3080\uFF09\u3002`
  ];
  lines.push(`- lint: ${input.lintCommand === null ? "\u6307\u5B9A\u306A\u3057\uFF08\u898F\u7D04\u30D5\u30A1\u30A4\u30EB\u306B\u66F8\u304B\u308C\u3066\u3044\u308C\u3070\u305D\u308C\u306B\u5F93\u3046\uFF09" : `\`${input.lintCommand}\``}`, `- \u30C6\u30B9\u30C8: ${input.testCommand === null ? "\u6307\u5B9A\u306A\u3057\uFF08\u898F\u7D04\u30D5\u30A1\u30A4\u30EB\u306B\u66F8\u304B\u308C\u3066\u3044\u308C\u3070\u305D\u308C\u306B\u5F93\u3046\uFF09" : `\`${input.testCommand}\``}`);
  return lines.join(`
`);
};
var stripFrontmatter = (markdown) => markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
var renderPreviousRoundSection = (entries) => {
  if (entries.length === 0) {
    return "\u524D\u56DE\u306E\u6240\u898B\u306F\u3042\u308A\u307E\u305B\u3093\u3002";
  }
  return entries.map(({ finding, disposition, note }) => {
    const location = `${finding.file}:${finding.line_start}-${finding.line_end}`;
    const noteText = note.trim() === "" ? "" : `: ${note.trim()}`;
    return `- ${finding.id} [${finding.severity}] ${finding.title}\uFF08${location}\uFF09\u2192 ${DISPOSITION_LABELS[disposition]}${noteText}`;
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
  PREVIOUS: input.previousTree === null ? "1 \u56DE\u76EE\u306E\u305F\u3081\u7121\u3057\u3002" : renderPreviousRoundSection(input.previousRound)
});

// src/commands/request-review.ts
var usage = () => `Usage: ${scriptCommand("request-review")} [--run <run-id>] [--request <\u4F9D\u983C\u66F8\u306E\u30D1\u30B9>] [--model <model>] [--effort <none|minimal|low|medium|high|xhigh>] [--timeout-minutes <n>] [--max-rounds <n>]`;
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
        message: `--max-rounds \u306F\u73FE\u5728\u306E\u30E9\u30A6\u30F3\u30C9 ${state.round} \u3088\u308A\u5927\u304D\u3044\u5024\u306B\u3057\u3066\u304F\u3060\u3055\u3044: ${extendedMaxRounds}`
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
      const pidNote = state.reviewPid !== null && processAlive(state.reviewPid) ? `codex \u306E pid ${state.reviewPid} \u304C\u52D5\u3044\u3066\u3044\u307E\u3059\u3002` : "";
      return {
        ok: false,
        message: `Run ${state.runId} \u306F\u30EC\u30D3\u30E5\u30FC\u3092\u5B9F\u884C\u4E2D\u3067\u3059\uFF08\u958B\u59CB ${minutesSince(state.updatedAt, now)} \u5206\u524D\uFF09\u3002${pidNote}\u5B8C\u4E86\u3092\u5F85\u3063\u3066\u304F\u3060\u3055\u3044\u3002\u6253\u3061\u5207\u308A\u6642\u9593 ${state.config.timeoutMinutes} \u5206\u3092\u904E\u304E\u3001codex \u304C\u7D42\u308F\u3063\u3066\u3044\u308C\u3070\u3001\u4E2D\u65AD\u3068\u307F\u306A\u3057\u3066\u540C\u3058\u30B3\u30DE\u30F3\u30C9\u3067\u518D\u5B9F\u884C\u3067\u304D\u307E\u3059`
      };
    }
    return {
      ok: false,
      message: `Run ${state.runId} \u306F\u300C${PHASE_LABELS[state.phase]}\u300D\uFF08${state.phase}\uFF09\u306E\u305F\u3081\u3001\u30EC\u30D3\u30E5\u30FC\u3092\u4F9D\u983C\u3067\u304D\u307E\u305B\u3093\u3002\u30E9\u30A6\u30F3\u30C9\u4E0A\u9650\u306B\u9054\u3057\u305F Run \u306F\u3001\u4F9D\u983C\u8005\u304C\u7D9A\u884C\u3092\u9078\u3093\u3060\u3068\u304D\u3060\u3051 --max-rounds <n> \u3067\u4E0A\u9650\u3092\u5897\u3084\u3057\u3066\u518D\u958B\u3067\u304D\u307E\u3059`
    };
  }
  const round = state.round + 1;
  if (round > state.config.maxRounds)
    return {
      ok: false,
      message: `\u6700\u5927\u30E9\u30A6\u30F3\u30C9\u6570 ${state.config.maxRounds} \u306B\u9054\u3057\u3066\u3044\u307E\u3059\u3002\u6B8B\u3063\u305F\u6240\u898B\u3068\u5BFE\u5FDC\u3092\u4F9D\u983C\u8005\u306B\u5831\u544A\u3057\u3066\u304F\u3060\u3055\u3044`
    };
  return { ok: true, state, round, staleReviewing };
};
var readRunText = async (workDir, runId, fileName) => {
  const text = await readTextIfExists(runFilePath(workDir, runId, fileName));
  if (text === null) {
    throw new Error(`\u30D5\u30A1\u30A4\u30EB\u304C\u3042\u308A\u307E\u305B\u3093: ${runFileDisplayPath(runId, fileName)}`);
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
      throw new Error(`${runFileDisplayPath(runId, dispositionsName)} \u306B ${finding.id} \u306E\u5BFE\u5FDC\u304C\u3042\u308A\u307E\u305B\u3093`);
    }
    return { finding, disposition: item.disposition, note: item.note };
  });
};
var renderNextStep = (state, round) => [
  "### \u6B21\u306E\u5DE5\u7A0B",
  "1. \u5404\u6240\u898B\u3092\u73FE\u7269\uFF08\u30B3\u30FC\u30C9\u30FBgit diff\u30FB\u30C6\u30B9\u30C8\u306E\u5B9F\u884C\uFF09\u3067\u691C\u8A3C\u3057\u3001addressed / rejected / out_of_scope \u306B\u5206\u3051\u308B\uFF08\u6240\u898B\u306E\u4E3B\u5F35\u3092\u305D\u306E\u307E\u307E\u4FE1\u3058\u305A\u3001\u5374\u4E0B\u3082\u63A8\u6E2C\u3067\u3057\u306A\u3044\uFF09",
  `2. out_of_scope \u306B\u3059\u308B\u6240\u898B\u306F\u3001\u5148\u306B ${state.config.outOfScopeFile} \u306E\u4E00\u89A7\u3078\u3001\u767A\u898B\u5143\u300Creview-loop ${state.runId} <\u6240\u898B ID>\u300D\u306E\u884C\u3092\u8FFD\u8A18\u3059\u308B\uFF08\u30D5\u30A1\u30A4\u30EB\u304C\u7121\u3051\u308C\u3070 record-dispositions \u304C\u96DB\u5F62\u3092\u4F5C\u308B\uFF09`,
  `3. \u5BFE\u5FDC\u8868\u3092 ${runFileDisplayPath(state.runId, roundFileName(round, "dispositions.json"))} \u306B\u66F8\u304D\u3001${scriptCommand("record-dispositions")} --run ${state.runId} \u3092\u5B9F\u884C\u3059\u308B\uFF08\u6240\u898B 0 \u4EF6\u306A\u3089 --none\uFF09`
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
    console.log(`\u6CE8\u610F: \u524D\u56DE\u306E\u30EC\u30D3\u30E5\u30FC\u304C reviewing \u306E\u307E\u307E\u6253\u3061\u5207\u308A\u6642\u9593\uFF08${state.config.timeoutMinutes} \u5206\uFF09\u3092\u904E\u304E\u3001codex \u3082\u7D42\u308F\u3063\u3066\u3044\u307E\u3057\u305F\uFF08\u958B\u59CB ${minutesSince(state.updatedAt, now)} \u5206\u524D\uFF09\u3002\u4E2D\u65AD\u3068\u307F\u306A\u3057\u3066\u518D\u5B9F\u884C\u3057\u307E\u3059`);
  }
  const git = createGitRunner(root);
  const tree = await snapshotWorkingTree(git);
  if (!await hasDiff(git, "HEAD", tree)) {
    throw new Error("\u30EC\u30D3\u30E5\u30FC\u5BFE\u8C61\u306E\u5909\u66F4\u304C\u3042\u308A\u307E\u305B\u3093\uFF08HEAD \u3068\u4F5C\u696D\u30C4\u30EA\u30FC\u304C\u540C\u3058\u5185\u5BB9\u3067\u3059\uFF09");
  }
  const previousTree = round === 1 ? null : state.snapshots[String(state.round)] ?? null;
  if (round > 1 && previousTree === null) {
    throw new Error(`\u30E9\u30A6\u30F3\u30C9 ${state.round} \u306E\u30B9\u30CA\u30C3\u30D7\u30B7\u30E7\u30C3\u30C8\u304C\u72B6\u614B\u30D5\u30A1\u30A4\u30EB\u306B\u3042\u308A\u307E\u305B\u3093`);
  }
  if (previousTree !== null && !await hasDiff(git, previousTree, tree)) {
    throw new Error("\u524D\u56DE\u306E\u30EC\u30D3\u30E5\u30FC\u304B\u3089\u4F5C\u696D\u30C4\u30EA\u30FC\u306B\u5909\u66F4\u304C\u3042\u308A\u307E\u305B\u3093\u3002\u5BFE\u5FDC\u8868\u3067 addressed \u306B\u3057\u305F\u6240\u898B\u306E\u4FEE\u6B63\u304C\u5165\u3063\u3066\u3044\u308B\u304B\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044");
  }
  const defaultRequestName = roundFileName(1, "request.md");
  const requestArg = values.get("--request");
  const requestPath = requestArg === undefined ? runFilePath(workDir, state.runId, defaultRequestName) : resolveRepoPath(root, requestArg);
  const requestText = await readTextIfExists(requestPath);
  if (requestText === null) {
    throw new Error(`\u4F9D\u983C\u66F8\u304C\u3042\u308A\u307E\u305B\u3093: ${requestPath}\u3002write-review-request \u30B9\u30AD\u30EB\u3092 --out ${runFileDisplayPath(state.runId, defaultRequestName)} \u3067\u5B9F\u884C\u3057\u3066\u304F\u3060\u3055\u3044`);
  }
  const request = requestText.trim();
  if (request === "") {
    throw new Error(`\u4F9D\u983C\u66F8\u304C\u7A7A\u3067\u3059: ${requestPath}`);
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
\u30ED\u30B0: ${runFileDisplayPath(state.runId, logName)}
\u539F\u56E0\u3092\u78BA\u304B\u3081\u3066\u304B\u3089\u3001\u540C\u3058\u30B3\u30DE\u30F3\u30C9\u3067\u518D\u5B9F\u884C\u3059\u308B\u304B\u3001\u4F9D\u983C\u8005\u306B\u5831\u544A\u3057\u3066\u304F\u3060\u3055\u3044`);
  };
  console.log(`Codex \u306B\u30EC\u30D3\u30E5\u30FC\u3092\u4F9D\u983C\u3057\u307E\u3059\uFF08Run ${state.runId} / \u30E9\u30A6\u30F3\u30C9 ${round} / \u30E2\u30C7\u30EB ${model ?? "Codex \u65E2\u5B9A"} / effort ${reasoningEffort ?? "Codex \u65E2\u5B9A"} / \u6253\u3061\u5207\u308A ${timeoutMinutes} \u5206\uFF09`);
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
    return fail(`codex \u3092\u8D77\u52D5\u3067\u304D\u307E\u305B\u3093: ${errorMessage(error)}`);
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
    return fail(`Codex \u306E\u30ED\u30B0\u3092\u66F8\u3051\u307E\u305B\u3093: ${errorMessage(error)}`);
  }
  if (run.timedOut) {
    return fail(`Codex \u306E\u30EC\u30D3\u30E5\u30FC\u3092 ${timeoutMinutes} \u5206\u3067\u6253\u3061\u5207\u308A\u307E\u3057\u305F`);
  }
  if (run.exitCode !== 0) {
    return fail(`codex exec \u304C\u5931\u6557\u3057\u307E\u3057\u305F\uFF08exit ${run.exitCode}\uFF09`);
  }
  const outputText = await readTextIfExists(outputPath);
  if (outputText === null) {
    return fail(`Codex \u306E\u6700\u7D42\u5FDC\u7B54\u30D5\u30A1\u30A4\u30EB\u304C\u3042\u308A\u307E\u305B\u3093: ${runFileDisplayPath(state.runId, outputName)}`);
  }
  let output;
  try {
    output = parseJsonWith(CodexReviewOutputSchema, outputText, "Codex \u306E\u6700\u7D42\u5FDC\u7B54");
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
  console.log(`\u30EC\u30D3\u30E5\u30FC\u304C\u7D42\u308F\u308A\u307E\u3057\u305F\uFF08\u6240\u8981 ${elapsedSeconds} \u79D2\uFF09`);
  console.log("");
  console.log(renderReviewResult(result));
  console.log("");
  console.log(renderNextStep(state, round));
};

// src/bin/request-review.ts
await runMain(() => main(process.argv.slice(2)));
