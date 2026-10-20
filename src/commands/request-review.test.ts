import { describe, expect, test } from 'bun:test';
import {
	checkReviewRequest,
	isStaleReviewing,
	REVIEWABLE_PHASES,
} from './request-review';
import type { RunPhase, RunState } from '../lib/state';
import { makeRunState } from '../test-support/fixtures';

const now = new Date('2026-10-16T10:00:00Z');

const makeState = (overrides: Partial<RunState> = {}): RunState =>
	makeRunState({
		startedAt: '2026-10-16T09:00:00.000Z',
		updatedAt: '2026-10-16T09:50:00.000Z',
		phase: 'reviewing',
		...overrides,
	});

describe('REVIEWABLE_PHASES', () => {
	test('実装中・対応中・失敗後に加え、完了準備と確認待ちからも再レビューできる', () => {
		const expected: RunPhase[] = [
			'implementing',
			'fixing',
			'review_failed',
			'ready_to_finish',
			'awaiting_confirmation',
		];
		expect([...REVIEWABLE_PHASES].sort()).toEqual(expected.sort());
	});
});

describe('isStaleReviewing', () => {
	const dead = () => false;
	const alive = () => true;

	test('reviewing のまま、保存した打ち切り時間を過ぎたときだけ中断とみなす', () => {
		expect(isStaleReviewing(makeState(), now, dead)).toBe(false);
		expect(
			isStaleReviewing(
				makeState({ updatedAt: '2026-10-16T09:29:59.000Z' }),
				now,
				dead,
			),
		).toBe(true);
		// 打ち切り時間は state の値で判定する（CLI の上書きで 60 分に伸ばした Run は 60 分まで待つ）
		expect(
			isStaleReviewing(
				makeState({
					updatedAt: '2026-10-16T09:29:59.000Z',
					config: { ...makeState().config, timeoutMinutes: 60 },
				}),
				now,
				dead,
			),
		).toBe(false);
		expect(
			isStaleReviewing(
				makeState({ phase: 'triaging', updatedAt: '2026-10-16T09:00:00.000Z' }),
				now,
				dead,
			),
		).toBe(false);
	});

	test('記録した codex の pid が生きていれば、打ち切り時間を過ぎても待つ', () => {
		const overdue = makeState({
			updatedAt: '2026-10-16T09:00:00.000Z',
			reviewPid: 12345,
		});
		expect(isStaleReviewing(overdue, now, alive)).toBe(false);
		expect(isStaleReviewing(overdue, now, dead)).toBe(true);
	});
});

describe('checkReviewRequest', () => {
	const dead = () => false;
	const alive = () => true;

	test('対応中なら次のラウンドを依頼する', () => {
		expect(
			checkReviewRequest({
				state: makeState({ phase: 'fixing', round: 1 }),
				now,
				extendedMaxRounds: undefined,
			}),
		).toMatchObject({ ok: true, round: 2, staleReviewing: false });
	});

	test('ラウンドの上限に達した Run は、--max-rounds で上限を延ばしたときだけ再開する', () => {
		const reached = makeState({ phase: 'max_rounds', round: 5 });
		expect(
			checkReviewRequest({ state: reached, now, extendedMaxRounds: undefined }),
		).toEqual({
			ok: false,
			message: expect.stringContaining(
				'依頼者が続行を選んだときだけ --max-rounds <n> で上限を増やして再開できます',
			),
		});
		const resumed = checkReviewRequest({
			state: reached,
			now,
			extendedMaxRounds: 6,
		});
		expect(resumed).toMatchObject({ ok: true, round: 6 });
		expect(resumed.ok && resumed.state.config.maxRounds).toBe(6);
		expect(
			checkReviewRequest({ state: reached, now, extendedMaxRounds: 5 }),
		).toEqual({
			ok: false,
			message: '--max-rounds は現在のラウンド 5 より大きい値にしてください: 5',
		});
	});

	test('完了準備からの再レビューでも、上限を超えるラウンドは依頼しない', () => {
		expect(
			checkReviewRequest({
				state: makeState({ phase: 'ready_to_finish', round: 5 }),
				now,
				extendedMaxRounds: undefined,
			}),
		).toEqual({
			ok: false,
			message:
				'最大ラウンド数 5 に達しています。残った所見と対応を依頼者に報告してください',
		});
	});

	test('レビュー中の Run は、打ち切り時間を過ぎて codex も終わっていたときだけ同じラウンドをやり直す', () => {
		const running = makeState({ round: 1, reviewPid: 12345 });
		expect(
			checkReviewRequest({
				state: running,
				now,
				extendedMaxRounds: undefined,
				processAlive: alive,
			}),
		).toEqual({
			ok: false,
			message: expect.stringContaining('はレビューを実行中です'),
		});
		const overdue = { ...running, updatedAt: '2026-10-16T09:00:00.000Z' };
		// 打ち切り時間を過ぎても、codex が動いていれば二重に起動しない
		expect(
			checkReviewRequest({
				state: overdue,
				now,
				extendedMaxRounds: undefined,
				processAlive: alive,
			}),
		).toEqual({
			ok: false,
			message: expect.stringContaining('codex の pid 12345 が動いています'),
		});
		expect(
			checkReviewRequest({
				state: overdue,
				now,
				extendedMaxRounds: undefined,
				processAlive: dead,
			}),
		).toMatchObject({ ok: true, round: 2, staleReviewing: true });
	});
});
