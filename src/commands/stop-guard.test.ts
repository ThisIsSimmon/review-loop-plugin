import { describe, expect, test } from 'bun:test';
import type { RunState } from '../lib/state';
import {
	decideStopGuard,
	type HookContext,
	readHookContext,
	STALE_RUN_MS,
} from './stop-guard';
import { makeRunState } from '../test-support/fixtures';

const now = new Date('2026-10-16T10:00:00Z');
const SESSION = 'session-a';
const idle: HookContext = {
	sessionId: SESSION,
	cwd: null,
	backgroundTaskRunning: false,
};

const makeState = (overrides: Partial<RunState> = {}): RunState =>
	makeRunState({
		updatedAt: '2026-10-16T09:55:00.000Z',
		sessionId: SESSION,
		...overrides,
	});

describe('decideStopGuard', () => {
	test('見張る Run が無ければ止めてよい', () => {
		expect(decideStopGuard({ states: [], now, context: idle })).toEqual({
			block: false,
			note: null,
		});
	});

	test.each([
		['implementing', 0, '.tmp/review-loop/2026-10-16.183005/1.request.md'],
		['reviewing', 1, '.tmp/review-loop/2026-10-16.183005/2.codex.log'],
		['triaging', 1, '.tmp/review-loop/2026-10-16.183005/1.dispositions.json'],
		['fixing', 1, '（ラウンド 2）'],
		[
			'ready_to_finish',
			1,
			'.tmp/review-loop/2026-10-16.183005/commit-message.txt',
		],
	] as const)('%s のままなら次の工程を示して続行させる', (phase, round, nextStep) => {
		const decision = decideStopGuard({
			states: [makeState({ phase, round })],
			now,
			context: idle,
		});
		expect(decision.block).toBe(true);
		if (decision.block) {
			expect(decision.reason).toContain('2026-10-16.183005');
			expect(decision.reason).toContain('次の工程: ');
			// 工程ごとの次の手順（ラウンドに応じたファイル名）
			expect(decision.reason).toContain(nextStep);
			expect(decision.reason).toContain('pause-run.mjs');
			expect(decision.reason).toContain('--abort');
		}
	});

	test.each([
		'awaiting_confirmation',
		'review_failed',
		'max_rounds',
		'done',
		'aborted',
	] as const)('%s は依頼者の判断待ちか終了なので止めてよい', (phase) => {
		expect(
			decideStopGuard({ states: [makeState({ phase })], now, context: idle })
				.block,
		).toBe(false);
	});

	test('バックグラウンドのコマンドが動いている間と、一時停止中は止めてよい', () => {
		const waiting = decideStopGuard({
			states: [makeState({ phase: 'reviewing' })],
			now,
			context: { ...idle, backgroundTaskRunning: true },
		});
		expect(waiting.block).toBe(false);
		if (!waiting.block) expect(waiting.note).toContain('バックグラウンド');
		expect(
			decideStopGuard({
				states: [makeState({ phase: 'triaging', paused: true })],
				now,
				context: idle,
			}).block,
		).toBe(false);
	});

	test('別セッションの Run は見張らない。セッションが分からない側があれば見張る', () => {
		const otherSession: HookContext = {
			...idle,
			sessionId: 'session-b',
		};
		expect(
			decideStopGuard({
				states: [makeState({ phase: 'fixing', round: 1 })],
				now,
				context: otherSession,
			}).block,
		).toBe(false);
		expect(
			decideStopGuard({
				states: [makeState({ phase: 'fixing', round: 1, sessionId: null })],
				now,
				context: otherSession,
			}).block,
		).toBe(true);
		expect(
			decideStopGuard({
				states: [makeState({ phase: 'fixing', round: 1 })],
				now,
				context: { ...idle, sessionId: null },
			}).block,
		).toBe(true);
	});

	test('24 時間更新の無い Run は見張らず、複数あれば新しい Run を見る', () => {
		const stale = new Date(now.getTime() - STALE_RUN_MS - 1000).toISOString();
		expect(
			decideStopGuard({
				states: [makeState({ phase: 'fixing', updatedAt: stale })],
				now,
				context: idle,
			}).block,
		).toBe(false);
		const decision = decideStopGuard({
			states: [
				makeState({ runId: '2026-10-16.100000', phase: 'fixing', round: 1 }),
				makeState({ runId: '2026-10-16.183005', phase: 'triaging', round: 2 }),
			],
			now,
			context: idle,
		});
		expect(decision.block).toBe(true);
		if (decision.block) expect(decision.reason).toContain('2026-10-16.183005');
	});
});

describe('readHookContext', () => {
	test('セッション ID と実行中のバックグラウンド処理の有無を読み、読めない入力は不明として扱う', () => {
		expect(
			readHookContext({
				session_id: 'abc',
				cwd: '/repo',
				background_tasks: [{ id: 't', status: 'running' }],
			}),
		).toEqual({ sessionId: 'abc', cwd: '/repo', backgroundTaskRunning: true });
		expect(
			readHookContext({ background_tasks: [{ status: 'completed' }] }),
		).toEqual({ sessionId: null, cwd: null, backgroundTaskRunning: false });
		expect(readHookContext({})).toEqual({
			sessionId: null,
			cwd: null,
			backgroundTaskRunning: false,
		});
		expect(readHookContext('junk')).toEqual({
			sessionId: null,
			cwd: null,
			backgroundTaskRunning: false,
		});
	});
});
