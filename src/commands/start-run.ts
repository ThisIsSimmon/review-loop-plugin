/**
 * review-loop の Run を開始する（`.tmp/review-loop/<run>/state.json` を作る）。
 *
 *   bun dist/start-run.mjs --task "<一言>" [--model <model>] [--effort <effort>] [--max-rounds <n>] [--auto-commit <true|false>] [--timeout-minutes <n>]
 *
 * 進行中の Run があるうちは新しい Run を作らない（Stop フックがどの Run を見張るか曖昧になる）。
 * 開始時点の未コミット変更は、レビューにもコミットにも含まれるので一覧して警告する。
 * Run には Claude Code のセッション ID（CLAUDE_CODE_SESSION_ID）を記録し、Stop フックが別セッションの Run を縛らないようにする。
 */
import { type ReviewLoopConfig, describeConfig, loadConfig } from '../lib/config';
import {
	createGitRunner,
	getStatusShort,
	isIgnored,
	revParse,
} from '../lib/git';
import {
	buildRunId,
	CLAUDE_SESSION_ID_ENV,
	ensureWorkDir,
	findActiveRuns,
	listRunStates,
	PHASE_LABELS,
	parseReasoningEffort,
	type RunState,
	roundFileName,
	runFileDisplayPath,
	STATE_FILE_NAME,
	WORK_DIR_RELATIVE,
	resolveWorkspace,
	writeRunState,
} from '../lib/state';
import {
	parseBooleanValue,
	parseFlags,
	parsePositiveInteger,
	scriptCommand,
} from '../lib/util';

const usage = (): string =>
	`Usage: ${scriptCommand('start-run')} --task "<一言>" [--model <model>] [--effort <none|minimal|low|medium|high|xhigh>] [--max-rounds <n>] [--auto-commit <true|false>] [--timeout-minutes <n>]`;

export const buildInitialState = (input: {
	runId: string;
	task: string;
	baseCommit: string;
	config: ReviewLoopConfig;
	sessionId: string | null;
	now: Date;
}): RunState => ({
	runId: input.runId,
	task: input.task,
	startedAt: input.now.toISOString(),
	updatedAt: input.now.toISOString(),
	baseCommit: input.baseCommit,
	phase: 'implementing',
	round: 0,
	snapshots: {},
	config: input.config,
	paused: false,
	sessionId: input.sessionId,
	reviewPid: null,
	commitSha: null,
	lastError: null,
});

export const main = async (args: readonly string[]): Promise<void> => {
	const { values } = parseFlags(args, {
		valueFlags: [
			'--task',
			'--model',
			'--effort',
			'--max-rounds',
			'--auto-commit',
			'--timeout-minutes',
		],
		usage: usage(),
	});
	const task = values.get('--task')?.trim();
	if (!task) throw new Error(usage());
	const { root, workDir } = await resolveWorkspace();
	const config = await loadConfig(root, {
		model: values.get('--model'),
		reasoningEffort: parseReasoningEffort(values.get('--effort')),
		maxRounds: parsePositiveInteger(values.get('--max-rounds'), '--max-rounds'),
		autoCommit: parseBooleanValue(values.get('--auto-commit'), '--auto-commit'),
		timeoutMinutes: parsePositiveInteger(
			values.get('--timeout-minutes'),
			'--timeout-minutes',
		),
	});

	const { states, invalid } = await listRunStates(workDir);
	// 読めない状態ファイルを無視して始めると、進行中の Run を見落として二重に始めてしまう
	if (invalid.length > 0) {
		throw new Error(
			`読めない状態ファイルがあります（${invalid.join(', ')}）。ファイルを直すか退避してから開始してください`,
		);
	}
	const active = findActiveRuns(states);
	if (active.length > 0) {
		const list = active
			.map((state) => `${state.runId}（${PHASE_LABELS[state.phase]}）`)
			.join(', ');
		throw new Error(
			`進行中の Run があります: ${list}。先に ${scriptCommand('finish-run')} --run <run-id> --abort で中止するか、完了させてください`,
		);
	}

	const git = createGitRunner(root);
	const baseCommit = await revParse(git, 'HEAD');
	await ensureWorkDir(workDir);
	// 作業用ファイルがスナップショットに入ると、毎ラウンドの差分とコミットに紛れ込む
	if (!(await isIgnored(git, `${WORK_DIR_RELATIVE}/${STATE_FILE_NAME}`))) {
		throw new Error(
			`${WORK_DIR_RELATIVE} が git に無視されていません（${WORK_DIR_RELATIVE}/.gitignore が否定パターンなどで打ち消されていないか確かめてください）`,
		);
	}
	const now = new Date();
	const state = await writeRunState(
		buildInitialState({
			runId: buildRunId(now),
			task,
			baseCommit,
			config,
			sessionId: process.env[CLAUDE_SESSION_ID_ENV] ?? null,
			now,
		}),
		workDir,
		now,
	);
	const status = await getStatusShort(git);

	const lines = [
		`review-loop Run ${state.runId} を開始しました（${runFileDisplayPath(state.runId, STATE_FILE_NAME)}）`,
		...describeConfig(config),
		`- セッション: ${state.sessionId ?? '不明（どのセッションの Stop フックも見張る）'}`,
	];
	if (status !== '') {
		lines.push(
			'- 注意: 開始時点で未コミットの変更があります。これらもレビューとコミットに含まれます。依頼と無関係なら先に退避するか依頼者に確認してください。',
			...status.split('\n').map((line) => `    ${line}`),
		);
	}
	lines.push(
		'- 次の工程: 実装とテストを終えたら',
		`  1. write-review-request スキルを --out ${runFileDisplayPath(state.runId, roundFileName(1, 'request.md'))} で実行する`,
		`  2. ${scriptCommand('request-review')} --run ${state.runId} をバックグラウンドで実行し、完了を待つ`,
	);
	console.log(lines.join('\n'));
};
