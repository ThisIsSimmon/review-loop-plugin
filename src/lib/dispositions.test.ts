import { describe, expect, test } from 'bun:test';
import {
	checkNoneAllowed,
	countDispositions,
	type DispositionsFile,
	decideNextPhase,
	hasOutOfScopeRecord,
	OUT_OF_SCOPE_TEMPLATE,
	validateDispositions,
} from './dispositions';
import type { ReviewFinding } from './review-result';

const RUN_ID = '2026-10-16.183005';

const finding = (id: string): ReviewFinding => ({
	id,
	severity: 'important',
	scope: 'change',
	title: `所見 ${id}`,
	file: 'src/a.ts',
	line_start: 1,
	line_end: 2,
	body: '本文',
	recommendation: '直す',
	evidence: 'source',
});

const findings = [finding('R1-1'), finding('R1-2'), finding('R1-3')];

const dispositions: DispositionsFile = {
	round: 1,
	items: [
		{ id: 'R1-1', disposition: 'addressed', note: '' },
		{ id: 'R1-2', disposition: 'rejected', note: '呼び出し元で検証済み' },
		{ id: 'R1-3', disposition: 'out_of_scope', note: 'OOS-1 として記録' },
	],
};

// 記入の決まりの例文（データ行ではない）と、実データ行
const todoText = [
	'- Codex の所見から来た項目は「発見元」を `review-loop <Run ID> <所見 ID>` と書く（例: `review-loop 2026-10-16.183005 R1-2`）。',
	'| ID | 日付 | 発見元 | 対象 | 内容 | 範囲外とした理由 | 状態 |',
	'| --- | --- | --- | --- | --- | --- | --- |',
	`| OOS-1 | 2026-10-16 | review-loop ${RUN_ID} R1-3 | src/a.ts:1 | 既存の問題 | 変更前から | 未着手 |`,
	'| OOS-2 | 2026-10-16 | review-loop 2026-10-15.090000 R1-1 | src/b.ts:1 | 別 Run の記録 | 変更前から | 未着手 |',
	`| OOS-3 | 2026-10-16 | review-loop ${RUN_ID} R1-30 | src/c.ts:1 | 前方一致の罠 | 変更前から | 未着手 |`,
].join('\n');

describe('hasOutOfScopeRecord', () => {
	test('一覧の実データ行に Run ID と所見 ID の組があるときだけ記録とみなす', () => {
		expect(hasOutOfScopeRecord(todoText, RUN_ID, 'R1-3')).toBe(true);
		// 例文にしか無い ID
		expect(hasOutOfScopeRecord(todoText, RUN_ID, 'R1-2')).toBe(false);
		// 別 Run の同じ ID
		expect(hasOutOfScopeRecord(todoText, RUN_ID, 'R1-1')).toBe(false);
		expect(hasOutOfScopeRecord(todoText, RUN_ID, 'R1-30')).toBe(true);
		// R1-30 の行は R1-3 の記録ではない（R1-3 の行を除いた一覧で確かめる）
		expect(
			hasOutOfScopeRecord(
				todoText
					.split('\n')
					.filter((line) => !line.startsWith('| OOS-1 |'))
					.join('\n'),
				RUN_ID,
				'R1-3',
			),
		).toBe(false);
		// 所見 ID の直後が数字でなければ、その所見の記録とみなす
		expect(
			hasOutOfScopeRecord(
				todoText.replace('R1-3 |', 'R1-3x |'),
				RUN_ID,
				'R1-3',
			),
		).toBe(true);
	});
});

describe('validateDispositions', () => {
	test('全所見に対応があり、却下と範囲外に根拠と記録があれば合格', () => {
		expect(
			validateDispositions({
				runId: RUN_ID,
				round: 1,
				findings,
				dispositions,
				outOfScopeFile: 'docs/out-of-scope-todo.md',
				outOfScopeTodoText: todoText,
			}),
		).toEqual([]);
	});

	test('ラウンド違い・根拠なし・重複・不明な ID・記録なし・未記入を個別に挙げる', () => {
		const problems = validateDispositions({
			runId: RUN_ID,
			round: 1,
			findings,
			dispositions: {
				round: 2,
				items: [
					{ id: 'R1-1', disposition: 'rejected', note: ' ' },
					{ id: 'R1-1', disposition: 'addressed', note: '' },
					{ id: 'R1-9', disposition: 'addressed', note: '' },
					{ id: 'R1-3', disposition: 'out_of_scope', note: '記録したつもり' },
				],
			},
			outOfScopeFile: 'docs/out-of-scope-todo.md',
			// 例文だけがある状態（実データ行なし）
			outOfScopeTodoText: todoText.split('\n').slice(0, 3).join('\n'),
		});
		expect(problems).toEqual([
			'round が 1 ではありません: 2',
			'R1-1: 却下 には note（根拠または記録の要約）が必要です',
			'ID が重複しています: R1-1',
			'所見に無い ID です: R1-9',
			`R1-3: out_of_scope の所見は先に docs/out-of-scope-todo.md の一覧へ、発見元「review-loop ${RUN_ID} R1-3」の行として追記してください`,
			'対応が書かれていない所見があります: R1-2',
		]);
	});
});

describe('checkNoneAllowed', () => {
	test('所見が 0 件のときだけ --none を通し、所見があれば対応表を書くよう求める', () => {
		expect(checkNoneAllowed(0, '.tmp/x.json')).toBeNull();
		expect(checkNoneAllowed(2, '.tmp/x.json')).toBe(
			'所見が 2 件あるため --none は使えません。対応表を .tmp/x.json に書いてください',
		);
	});
});

describe('decideNextPhase', () => {
	test('直すものが無ければ完了へ、あれば次のラウンドへ、上限なら依頼者の判断へ', () => {
		const withoutAddressed = dispositions.items.filter(
			(item) => item.disposition !== 'addressed',
		);
		expect(
			decideNextPhase({ items: withoutAddressed, round: 1, maxRounds: 5 }),
		).toBe('ready_to_finish');
		expect(decideNextPhase({ items: [], round: 1, maxRounds: 5 })).toBe(
			'ready_to_finish',
		);
		expect(
			decideNextPhase({ items: dispositions.items, round: 4, maxRounds: 5 }),
		).toBe('fixing');
		expect(
			decideNextPhase({ items: dispositions.items, round: 5, maxRounds: 5 }),
		).toBe('max_rounds');
		expect(countDispositions(dispositions.items)).toEqual({
			addressed: 1,
			rejected: 1,
			out_of_scope: 1,
		});
	});
});

describe('OUT_OF_SCOPE_TEMPLATE', () => {
	test('雛形の例文と見出し行は、どの所見の記録ともみなされない', () => {
		expect(hasOutOfScopeRecord(OUT_OF_SCOPE_TEMPLATE, RUN_ID, 'R1-1')).toBe(
			false,
		);
		const appended = `${OUT_OF_SCOPE_TEMPLATE}| OOS-1 | 2026-10-16 | review-loop ${RUN_ID} R1-1 | src/a.ts:1 | 内容 | 理由 | 未着手 |\n`;
		expect(hasOutOfScopeRecord(appended, RUN_ID, 'R1-1')).toBe(true);
	});
});
