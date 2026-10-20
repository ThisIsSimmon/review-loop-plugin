/**
 * 所見への対応表（`.tmp/review-loop/<run>/<round>.dispositions.json`）。LLM が精査の結果を書き、
 * record-dispositions が検証して次の工程を決める。「対応するに値する指摘が無い」= addressed が 0 件、
 * という判定を LLM の文章ではなく対応表の集計で行う。
 */
import * as v from 'valibot';
import type { RunPhase } from './state';
import { FINDING_ID_PATTERN, type ReviewFinding } from './review-result';

export const DISPOSITIONS = ['addressed', 'rejected', 'out_of_scope'] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

export const DISPOSITION_LABELS: Record<Disposition, string> = {
	addressed: '対応（修正）',
	rejected: '却下',
	out_of_scope: '範囲外として記録',
};

export const DispositionItemSchema = v.object({
	id: v.pipe(v.string(), v.regex(FINDING_ID_PATTERN)),
	disposition: v.picklist(DISPOSITIONS),
	note: v.string(),
});
export type DispositionItem = v.InferOutput<typeof DispositionItemSchema>;

export const DispositionsFileSchema = v.object({
	round: v.pipe(v.number(), v.integer(), v.minValue(1)),
	items: v.array(DispositionItemSchema),
});
export type DispositionsFile = v.InferOutput<typeof DispositionsFileSchema>;

/** 記録ファイルの「発見元」欄に書く値。Run ごとに所見 ID が振り直されるので Run ID と組にする */
export const formatOutOfScopeSource = (
	runId: string,
	findingId: string,
): string => `review-loop ${runId} ${findingId}`;

/** 一覧の実データ行（`| OOS-<連番> |` で始まる行）。記入の決まりの例文や見出し行は照合しない */
const OUT_OF_SCOPE_ROW_PATTERN = /^\|\s*OOS-\d+\s*\|/;

const escapeRegExp = (text: string): string =>
	text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 記録ファイルに、この Run と所見 ID の組が実データ行として書かれているか。
 * ID の部分一致（R1-2 と R1-20、例文の R1-2、別 Run の R1-2）を記録とみなさないよう、
 * 発見元の文字列の直後が数字でないことまで見る。
 */
export const hasOutOfScopeRecord = (
	todoText: string,
	runId: string,
	findingId: string,
): boolean => {
	const source = new RegExp(
		`${escapeRegExp(formatOutOfScopeSource(runId, findingId))}(?![0-9])`,
	);
	return todoText
		.split('\n')
		.some((line) => OUT_OF_SCOPE_ROW_PATTERN.test(line) && source.test(line));
};

export type DispositionValidationInput = {
	runId: string;
	round: number;
	findings: readonly ReviewFinding[];
	dispositions: DispositionsFile;
	/** 範囲外の記録ファイルのパス（リポジトリルートからの相対。案内の文に使う） */
	outOfScopeFile: string;
	/** 範囲外の記録ファイルの本文。out_of_scope の所見が実データ行に書かれていることを確かめる */
	outOfScopeTodoText: string;
};

/** 問題の一覧を返す（空なら合格）。全所見に 1 件ずつ対応が書かれ、却下・範囲外に根拠があることを求める */
export const validateDispositions = (
	input: DispositionValidationInput,
): string[] => {
	const problems: string[] = [];
	if (input.dispositions.round !== input.round) {
		problems.push(
			`round が ${input.round} ではありません: ${input.dispositions.round}`,
		);
	}
	const findingIds = new Set(input.findings.map((finding) => finding.id));
	const seen = new Set<string>();
	for (const item of input.dispositions.items) {
		if (!findingIds.has(item.id)) {
			problems.push(`所見に無い ID です: ${item.id}`);
		}
		if (seen.has(item.id)) {
			problems.push(`ID が重複しています: ${item.id}`);
		}
		seen.add(item.id);
		if (item.disposition !== 'addressed' && item.note.trim() === '') {
			problems.push(
				`${item.id}: ${DISPOSITION_LABELS[item.disposition]} には note（根拠または記録の要約）が必要です`,
			);
		}
		if (
			item.disposition === 'out_of_scope' &&
			!hasOutOfScopeRecord(input.outOfScopeTodoText, input.runId, item.id)
		) {
			problems.push(
				`${item.id}: out_of_scope の所見は先に ${input.outOfScopeFile} の一覧へ、発見元「${formatOutOfScopeSource(input.runId, item.id)}」の行として追記してください`,
			);
		}
	}
	for (const id of findingIds) {
		if (!seen.has(id)) {
			problems.push(`対応が書かれていない所見があります: ${id}`);
		}
	}
	return problems;
};

export type DispositionCounts = Record<Disposition, number>;

export const countDispositions = (
	items: readonly DispositionItem[],
): DispositionCounts => ({
	addressed: items.filter((item) => item.disposition === 'addressed').length,
	rejected: items.filter((item) => item.disposition === 'rejected').length,
	out_of_scope: items.filter((item) => item.disposition === 'out_of_scope')
		.length,
});

export type NextPhaseAfterTriage = Extract<
	RunPhase,
	'fixing' | 'ready_to_finish' | 'max_rounds'
>;

/** 所見 0 件の --none を使えるか。所見があるのに --none を付けたら、対応表を書くよう求める（理由を返す） */
export const checkNoneAllowed = (
	findingCount: number,
	dispositionsPath: string,
): string | null =>
	findingCount > 0
		? `所見が ${findingCount} 件あるため --none は使えません。対応表を ${dispositionsPath} に書いてください`
		: null;

/** 直すものが無ければ完了へ。あれば次のラウンドへ進むが、上限に達していれば依頼者の判断へ回す */
export const decideNextPhase = (input: {
	items: readonly DispositionItem[];
	round: number;
	maxRounds: number;
}): NextPhaseAfterTriage => {
	if (countDispositions(input.items).addressed === 0) {
		return 'ready_to_finish';
	}
	return input.round >= input.maxRounds ? 'max_rounds' : 'fixing';
};

/** 範囲外の記録ファイルが無いときに作る雛形。一覧の行は `| OOS-<連番> |` で始め、発見元の欄に Run ID と所見 ID を書く */
export const OUT_OF_SCOPE_TEMPLATE = `# 範囲外の問題の記録

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
