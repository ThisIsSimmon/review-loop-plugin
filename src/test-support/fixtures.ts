import { DEFAULT_CONFIG } from '../lib/config';
import type { RunState } from '../lib/state';

/** テストの Run の状態。各テストは、そのテストで意味のある項目だけを上書きする */
export const makeRunState = (overrides: Partial<RunState> = {}): RunState => ({
	runId: '2026-10-16.183005',
	task: 'テスト',
	startedAt: '2026-10-16T09:30:05.000Z',
	updatedAt: '2026-10-16T09:30:05.000Z',
	baseCommit: 'a'.repeat(40),
	phase: 'implementing',
	round: 0,
	snapshots: {},
	config: DEFAULT_CONFIG,
	paused: false,
	sessionId: null,
	reviewPid: null,
	commitSha: null,
	lastError: null,
	...overrides,
});

/** 開発機のグローバル設定（署名・フック）に左右されないように、設定ファイルを読まない git で一時リポジトリを作る */
export const TEST_GIT_ENV = {
	GIT_CONFIG_GLOBAL: '/dev/null',
	GIT_CONFIG_SYSTEM: '/dev/null',
	GIT_AUTHOR_NAME: 'test',
	GIT_AUTHOR_EMAIL: 'test@example.com',
	GIT_COMMITTER_NAME: 'test',
	GIT_COMMITTER_EMAIL: 'test@example.com',
};
