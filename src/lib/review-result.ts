/**
 * Codex のレビュー結果。`src/assets/review-result.schema.json` で Codex の最終応答の形を固定し、
 * ここでは同じ形を Valibot で検証して、所見に `R<ラウンド>-<番号>` の ID を振った保存形式にする。
 * ID は script が振る（LLM に採番させると重複・欠番が起きる）。JSON スキーマとこのファイルの
 * 列挙値のずれは review-result.test.ts が突き合わせる。
 */
import * as v from 'valibot';
import { ObjectNameSchema } from './state';

export const REVIEW_VERDICTS = ['approve', 'needs_attention'] as const;
export const FINDING_SEVERITIES = ['critical', 'important', 'minor'] as const;
export const FINDING_SCOPES = ['change', 'pre_existing'] as const;
export const EVIDENCE_KINDS = ['source', 'measured', 'inferred'] as const;

export const SCOPE_LABELS: Record<(typeof FINDING_SCOPES)[number], string> = {
	change: '今回の変更',
	pre_existing: '変更前からの問題',
};
export const EVIDENCE_LABELS: Record<(typeof EVIDENCE_KINDS)[number], string> =
	{
		source: 'ソース確認',
		measured: '実測',
		inferred: '推測',
	};

/** 削除行への指摘や新規ファイル全体への指摘で 0 を許す */
const LineNumberSchema = v.pipe(v.number(), v.integer(), v.minValue(0));

// title・file・body の空文字の拒否と行番号の下限は、JSON スキーマ（src/assets/review-result.schema.json）には書いていない。
// Codex の構造化出力が minLength などを受け付けるか確かめていないため（受け付けないと毎回のレビューが失敗する）。
// 食い違う応答はここで拒否し、review_failed（同じコマンドで再実行できる）にする。
const CodexFindingSchema = v.object({
	severity: v.picklist(FINDING_SEVERITIES),
	scope: v.picklist(FINDING_SCOPES),
	title: v.pipe(v.string(), v.minLength(1)),
	file: v.pipe(v.string(), v.minLength(1)),
	line_start: LineNumberSchema,
	line_end: LineNumberSchema,
	body: v.pipe(v.string(), v.minLength(1)),
	recommendation: v.string(),
	evidence: v.picklist(EVIDENCE_KINDS),
});

/** Codex の最終応答（`--output-schema` で形を指定したもの） */
export const CodexReviewOutputSchema = v.object({
	verdict: v.picklist(REVIEW_VERDICTS),
	summary: v.string(),
	findings: v.array(CodexFindingSchema),
	tests_run: v.array(v.string()),
	unverified: v.array(v.string()),
});
export type CodexReviewOutput = v.InferOutput<typeof CodexReviewOutputSchema>;

export const FINDING_ID_PATTERN = /^R\d+-\d+$/;

export const ReviewFindingSchema = v.object({
	id: v.pipe(v.string(), v.regex(FINDING_ID_PATTERN)),
	...CodexFindingSchema.entries,
});
export type ReviewFinding = v.InferOutput<typeof ReviewFindingSchema>;

/** `.tmp/review-loop/<run>/<round>.result.json` の形 */
export const ReviewResultSchema = v.object({
	runId: v.string(),
	round: v.pipe(v.number(), v.integer(), v.minValue(1)),
	tree: ObjectNameSchema,
	previousTree: v.nullable(ObjectNameSchema),
	reviewedAt: v.pipe(v.string(), v.isoTimestamp()),
	model: v.nullable(v.string()),
	reasoningEffort: v.nullable(v.string()),
	verdict: v.picklist(REVIEW_VERDICTS),
	summary: v.string(),
	findings: v.array(ReviewFindingSchema),
	testsRun: v.array(v.string()),
	unverified: v.array(v.string()),
});
export type ReviewResult = v.InferOutput<typeof ReviewResultSchema>;

export type ReviewResultMeta = Pick<
	ReviewResult,
	| 'runId'
	| 'round'
	| 'tree'
	| 'previousTree'
	| 'reviewedAt'
	| 'model'
	| 'reasoningEffort'
>;

export const buildFindingId = (round: number, index: number): string =>
	`R${round}-${index}`;

export const normalizeReviewResult = (
	output: CodexReviewOutput,
	meta: ReviewResultMeta,
): ReviewResult => ({
	...meta,
	verdict: output.verdict,
	summary: output.summary,
	findings: output.findings.map((finding, index) => ({
		id: buildFindingId(meta.round, index + 1),
		...finding,
	})),
	testsRun: output.tests_run,
	unverified: output.unverified,
});

export const countBySeverity = (
	findings: readonly ReviewFinding[],
): Record<(typeof FINDING_SEVERITIES)[number], number> => ({
	critical: findings.filter((finding) => finding.severity === 'critical')
		.length,
	important: findings.filter((finding) => finding.severity === 'important')
		.length,
	minor: findings.filter((finding) => finding.severity === 'minor').length,
});

const listOrNone = (items: readonly string[]): string[] =>
	items.length === 0 ? ['- なし'] : items.map((item) => `- ${item}`);

/** request-review が標準出力に出す、LLM が精査するための一覧 */
export const renderReviewResult = (result: ReviewResult): string => {
	const counts = countBySeverity(result.findings);
	const lines: string[] = [
		`## Codex レビュー結果（Run ${result.runId} / ラウンド ${result.round}）`,
		`- 判定: ${result.verdict}（所見 ${result.findings.length} 件: critical ${counts.critical} / important ${counts.important} / minor ${counts.minor}）`,
		`- モデル: ${result.model ?? 'Codex 既定'} / effort: ${result.reasoningEffort ?? 'Codex 既定'}`,
		`- 要約: ${result.summary}`,
	];
	if (result.findings.length > 0) {
		lines.push('', '### 所見');
		for (const finding of result.findings) {
			lines.push(
				'',
				`#### ${finding.id} [${finding.severity}] ${finding.title}`,
				`- 対象: ${finding.file}:${finding.line_start}-${finding.line_end}（${SCOPE_LABELS[finding.scope]}）`,
				`- 内容: ${finding.body}`,
				`- 推奨: ${finding.recommendation || 'なし'}`,
				`- 根拠の出所: ${EVIDENCE_LABELS[finding.evidence]}`,
			);
		}
	}
	lines.push(
		'',
		'### Codex が実行したテスト',
		...listOrNone(result.testsRun),
		'',
		'### Codex が確認できなかったこと',
		...listOrNone(result.unverified),
	);
	return lines.join('\n');
};
