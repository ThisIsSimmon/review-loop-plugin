import { describe, expect, test } from 'bun:test';
import * as v from 'valibot';
import reviewSchema from '../assets/review-result.schema.json';
import {
	type CodexReviewOutput,
	CodexReviewOutputSchema,
	countBySeverity,
	normalizeReviewResult,
	ReviewResultSchema,
	renderReviewResult,
} from './review-result';

const output: CodexReviewOutput = {
	verdict: 'needs_attention',
	summary: '要約',
	findings: [
		{
			severity: 'important',
			scope: 'change',
			title: 'null を扱っていない',
			file: 'src/a.ts',
			line_start: 10,
			line_end: 12,
			body: '本文',
			recommendation: '分岐を足す',
			evidence: 'source',
		},
		{
			severity: 'minor',
			scope: 'pre_existing',
			title: '命名',
			file: 'src/b.ts',
			line_start: 1,
			line_end: 1,
			body: '本文2',
			recommendation: '',
			evidence: 'inferred',
		},
	],
	tests_run: ['npm test: 3 pass'],
	unverified: [],
};

const meta = {
	runId: '2026-10-16.183005',
	round: 2,
	tree: 'b'.repeat(40),
	previousTree: 'a'.repeat(40),
	reviewedAt: '2026-10-16T10:00:00.000Z',
	model: null,
	reasoningEffort: 'high',
};

describe('normalizeReviewResult', () => {
	test('所見にラウンド付きの連番 ID を振り、保存形式の検証を通る', () => {
		const result = normalizeReviewResult(output, meta);
		expect(result.findings.map((finding) => finding.id)).toEqual([
			'R2-1',
			'R2-2',
		]);
		expect(() => v.parse(ReviewResultSchema, result)).not.toThrow();
		expect(countBySeverity(result.findings)).toEqual({
			critical: 0,
			important: 1,
			minor: 1,
		});
	});

	test('一覧には ID・対象・根拠の出所・未確認の欄が出る', () => {
		const text = renderReviewResult(normalizeReviewResult(output, meta));
		expect(text).toContain('#### R2-1 [important] null を扱っていない');
		expect(text).toContain('- 対象: src/a.ts:10-12（今回の変更）');
		expect(text).toContain('- 対象: src/b.ts:1-1（変更前からの問題）');
		expect(text).toContain('- 根拠の出所: 推測');
		expect(text).toContain('- 推奨: なし');
		expect(text).toContain('- npm test: 3 pass');
		expect(text).toContain('### Codex が確認できなかったこと\n- なし');
	});
});

// Codex に渡す JSON スキーマの形だけを読む（値の意味は review-result.ts が正）
const JsonSchemaShape = v.object({
	required: v.array(v.string()),
	properties: v.object({
		verdict: v.object({ enum: v.array(v.string()) }),
		findings: v.object({
			items: v.object({
				required: v.array(v.string()),
				properties: v.record(
					v.string(),
					v.looseObject({ enum: v.optional(v.array(v.string())) }),
				),
			}),
		}),
	}),
});

describe('Codex の最終応答の検証', () => {
	test('JSON スキーマ（Codex に渡す形）と Valibot の列挙・必須項目が一致する', async () => {
		const schema = v.parse(
			JsonSchemaShape,
			reviewSchema,
		);
		expect([...schema.required].sort()).toEqual(
			Object.keys(CodexReviewOutputSchema.entries).sort(),
		);
		// 列挙は Valibot のスキーマ自身の値と比べる（Codex に渡す形と、応答を検証する形が同じ値を許す）
		expect(schema.properties.verdict.enum).toEqual([
			...CodexReviewOutputSchema.entries.verdict.options,
		]);
		const finding = schema.properties.findings.items;
		const findingEntries =
			CodexReviewOutputSchema.entries.findings.item.entries;
		expect([...finding.required].sort()).toEqual(
			Object.keys(findingEntries).sort(),
		);
		expect(finding.properties.severity?.enum).toEqual([
			...findingEntries.severity.options,
		]);
		expect(finding.properties.scope?.enum).toEqual([
			...findingEntries.scope.options,
		]);
		expect(finding.properties.evidence?.enum).toEqual([
			...findingEntries.evidence.options,
		]);
	});
});
