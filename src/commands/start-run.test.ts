import { describe, expect, test } from 'bun:test';
import { DEFAULT_CONFIG } from '../lib/config';
import { buildInitialState } from './start-run';

describe('buildInitialState', () => {
	test('実装中・ラウンド 0・スナップショット無しで始まり、セッション ID を持つ', () => {
		const now = new Date('2026-10-16T09:30:05Z');
		const state = buildInitialState({
			runId: '2026-10-16.183005',
			task: 'テスト',
			baseCommit: 'a'.repeat(40),
			config: { ...DEFAULT_CONFIG, reasoningEffort: 'high' },
			sessionId: 'session-a',
			now,
		});
		expect(state).toMatchObject({
			phase: 'implementing',
			round: 0,
			snapshots: {},
			paused: false,
			sessionId: 'session-a',
			commitSha: null,
			lastError: null,
			startedAt: now.toISOString(),
		});
	});
});
