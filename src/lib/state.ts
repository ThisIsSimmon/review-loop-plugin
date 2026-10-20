/**
 * review-loop の Run 状態と作業用ファイルの置き場所。
 *
 * 作業用ファイルは Run ごとに `.tmp/review-loop/<Run ID>/` へ置く（状態 `state.json`、依頼書、プロンプト、結果、対応表、ログ）。
 * `.tmp/review-loop/.gitignore`（中身は `*`）を自動で置くので、プロジェクトの .gitignore に関係なく
 * スナップショットとコミットに入らない。Run ID は `<日付>.<時刻 HHmmss>`（実行環境のタイムゾーン）。
 *
 * 工程（phase）を進めるのはこのプラグインの script だけにする。LLM は state.json を直接書かず、各 CLI の出力に従う。
 * Stop フック（stop-guard）は phase と paused を見て、LLM がループの途中でターンを終えないようにする。
 */
import type { Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import * as v from 'valibot';
import {
	REASONING_EFFORTS,
	type ReasoningEffort,
	ReviewLoopConfigSchema,
} from './config';
import { isNotFoundError, readTextIfExists, writeJson, writeText } from './fs';
import { findRepoRoot } from './git';
import { parseJsonWith, scriptCommand } from './util';

/** 作業用ファイルの置き場所（リポジトリルートからの相対） */
export const WORK_DIR_RELATIVE = '.tmp/review-loop';
/** Claude Code が Bash に渡すセッション ID の環境変数。Run をセッションに結び付け、Stop フックが別セッションの Run を縛らないようにする */
export const CLAUDE_SESSION_ID_ENV = 'CLAUDE_CODE_SESSION_ID';
export const STATE_FILE_NAME = 'state.json';

export const RUN_PHASES = [
	'implementing',
	'reviewing',
	'triaging',
	'fixing',
	'ready_to_finish',
	'awaiting_confirmation',
	'review_failed',
	'max_rounds',
	'done',
	'aborted',
] as const;
export type RunPhase = (typeof RUN_PHASES)[number];

export const PHASE_LABELS: Record<RunPhase, string> = {
	implementing: '実装中',
	reviewing: 'Codex のレビュー待ち',
	triaging: '所見の精査待ち',
	fixing: '指摘への対応中',
	ready_to_finish: 'コミットの準備待ち',
	awaiting_confirmation: 'コミットの確認待ち',
	review_failed: 'レビューの失敗',
	max_rounds: 'ラウンド上限に到達',
	done: '完了',
	aborted: '中止',
};

/** LLM がターンを終えてよい工程。依頼者の判断待ちか、Run が終わっている */
export const STOPPABLE_PHASES: ReadonlySet<RunPhase> = new Set<RunPhase>([
	'awaiting_confirmation',
	'review_failed',
	'max_rounds',
	'done',
	'aborted',
]);
/** Run が終わった工程。新しい Run を始められる */
export const TERMINAL_PHASES: ReadonlySet<RunPhase> = new Set<RunPhase>([
	'done',
	'aborted',
]);

export const RUN_ID_PATTERN = /^\d{4}-\d{2}-\d{2}\.\d{6}$/;
const OBJECT_NAME_PATTERN = /^[0-9a-f]{40}$/;

export const ObjectNameSchema = v.pipe(
	v.string(),
	v.regex(OBJECT_NAME_PATTERN),
);

export const RunStateSchema = v.object({
	runId: v.pipe(v.string(), v.regex(RUN_ID_PATTERN)),
	task: v.string(),
	startedAt: v.pipe(v.string(), v.isoTimestamp()),
	updatedAt: v.pipe(v.string(), v.isoTimestamp()),
	baseCommit: ObjectNameSchema,
	phase: v.picklist(RUN_PHASES),
	/** 直近に Codex へ出したラウンド番号。0 は未レビュー */
	round: v.pipe(v.number(), v.integer(), v.minValue(0)),
	/** ラウンド番号 → レビュー依頼時のツリー オブジェクト */
	snapshots: v.record(v.string(), ObjectNameSchema),
	config: ReviewLoopConfigSchema,
	/** 依頼者への質問などで LLM がターンを終えたいときの一時停止。次にどの script が状態を書いても解除される */
	paused: v.boolean(),
	/** Run を始めたセッション（CLAUDE_CODE_SESSION_ID）。取れなければ null で、どのセッションの Stop フックも見張る */
	sessionId: v.nullable(v.string()),
	/** 実行中の codex の pid。reviewing のまま残った Run を再実行してよいかの生存確認に使う。レビューが終われば null */
	reviewPid: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
	commitSha: v.nullable(ObjectNameSchema),
	lastError: v.nullable(v.string()),
});
export type RunState = v.InferOutput<typeof RunStateSchema>;

/** 対象のリポジトリと、その作業用ディレクトリ（`<root>/.tmp/review-loop`） */
export type Workspace = { root: string; workDir: string };

export const workspaceFor = (root: string): Workspace => ({
	root,
	workDir: join(root, WORK_DIR_RELATIVE),
});

/** Run ID。`timeZone` を省くと実行環境のタイムゾーン */
export const buildRunId = (now: Date, timeZone?: string): string => {
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('en-US', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hourCycle: 'h23',
		})
			.formatToParts(now)
			.map((part) => [part.type, part.value]),
	);
	return `${parts.year}-${parts.month}-${parts.day}.${parts.hour}${parts.minute}${parts.second}`;
};

export const roundFileName = (round: number, kind: string): string =>
	`${round}.${kind}`;
export const runFilePath = (
	workDir: string,
	runId: string,
	fileName: string,
): string => join(workDir, runId, fileName);
/** 依頼者・LLM 向けの表示用パス（リポジトリルートからの相対） */
export const runFileDisplayPath = (runId: string, fileName: string): string =>
	`${WORK_DIR_RELATIVE}/${runId}/${fileName}`;

/** 作業用ディレクトリを作り、中身を git に無視させる `.gitignore` を置く */
export const ensureWorkDir = async (workDir: string): Promise<void> => {
	const ignorePath = join(workDir, '.gitignore');
	if ((await readTextIfExists(ignorePath)) === null) {
		await writeText(ignorePath, '*\n');
	}
};

export const readRunState = async (
	runId: string,
	workDir: string,
): Promise<RunState> => {
	if (!RUN_ID_PATTERN.test(runId)) {
		throw new Error(`Run ID の形式が不正です（YYYY-MM-DD.HHmmss）: ${runId}`);
	}
	const text = await readTextIfExists(
		runFilePath(workDir, runId, STATE_FILE_NAME),
	);
	const display = runFileDisplayPath(runId, STATE_FILE_NAME);
	if (text === null) {
		throw new Error(`Run ${runId} の状態ファイルがありません: ${display}`);
	}
	return parseJsonWith(RunStateSchema, text, display);
};

const writeState = async (
	state: RunState,
	workDir: string,
	now: Date,
	paused: boolean,
): Promise<RunState> => {
	const next: RunState = { ...state, paused, updatedAt: now.toISOString() };
	await ensureWorkDir(workDir);
	await writeJson(runFilePath(workDir, state.runId, STATE_FILE_NAME), next);
	return next;
};

/** 状態を書く script が工程を進めたとみなし、一時停止は解除する。更新時刻は Stop フックの鮮度判定に使う */
export const writeRunState = (
	state: RunState,
	workDir: string,
	now: Date = new Date(),
): Promise<RunState> => writeState(state, workDir, now, false);

/** 一時停止だけは工程を進めずに書く（writeRunState は paused を解除するため別に持つ） */
export const writePausedRunState = (
	state: RunState,
	workDir: string,
	now: Date = new Date(),
): Promise<RunState> => writeState(state, workDir, now, true);

export type RunStateListing = { states: RunState[]; invalid: string[] };

/** 作業用ディレクトリの Run をすべて読む。壊れた状態ファイルは Run ID だけ返し、他の Run の処理を止めない */
export const listRunStates = async (
	workDir: string,
): Promise<RunStateListing> => {
	let entries: Dirent[];
	try {
		entries = await readdir(workDir, { withFileTypes: true });
	} catch (error) {
		if (isNotFoundError(error)) return { states: [], invalid: [] };
		throw error;
	}
	const listing: RunStateListing = { states: [], invalid: [] };
	for (const entry of entries) {
		if (!entry.isDirectory() || !RUN_ID_PATTERN.test(entry.name)) continue;
		const path = runFilePath(workDir, entry.name, STATE_FILE_NAME);
		const text = await readTextIfExists(path);
		if (text === null) continue;
		try {
			const state = parseJsonWith(RunStateSchema, text, path);
			if (state.runId !== entry.name) throw new Error('Run ID の不一致');
			listing.states.push(state);
		} catch {
			listing.invalid.push(runFileDisplayPath(entry.name, STATE_FILE_NAME));
		}
	}
	listing.states.sort((a, b) => a.runId.localeCompare(b.runId));
	return listing;
};

export const findActiveRuns = (states: readonly RunState[]): RunState[] =>
	states.filter((state) => !TERMINAL_PHASES.has(state.phase));

/** `--run` が無ければ進行中の Run が 1 つだけのときにそれを使う */
export const resolveRunState = async (
	runId: string | undefined,
	workDir: string,
): Promise<RunState> => {
	if (runId !== undefined) {
		return readRunState(runId, workDir);
	}
	const { states, invalid } = await listRunStates(workDir);
	if (invalid.length > 0) {
		throw new Error(
			`読めない状態ファイルがあります（${invalid.join(', ')}）。進行中の Run を見落とさないよう、--run <run-id> を明示するか、ファイルを直すか退避してください`,
		);
	}
	const active = findActiveRuns(states);
	const only = active[0];
	if (active.length === 1 && only) {
		return only;
	}
	if (active.length === 0) {
		throw new Error(
			`進行中の Run がありません。${scriptCommand('start-run')} で開始するか、--run <run-id> を指定してください`,
		);
	}
	throw new Error(
		`進行中の Run が複数あります（${active.map((state) => state.runId).join(', ')}）。--run <run-id> で指定してください`,
	);
};

export const parseReasoningEffort = (
	value: string | undefined,
): ReasoningEffort | undefined => {
	if (value === undefined) return undefined;
	const result = v.safeParse(v.picklist(REASONING_EFFORTS), value);
	if (!result.success) {
		throw new Error(
			`--effort は ${REASONING_EFFORTS.join(' | ')} のいずれかで指定してください: ${value}`,
		);
	}
	return result.output;
};

/** cwd を含む git リポジトリの作業場所。リポジトリの外なら使い方のエラー */
export const resolveWorkspace = async (
	cwd: string = process.cwd(),
): Promise<Workspace> => {
	const root = await findRepoRoot(cwd);
	if (root === null) {
		throw new Error(
			`git リポジトリの中で実行してください（現在のディレクトリ: ${cwd}）`,
		);
	}
	return workspaceFor(root);
};

/** 引数で受け取ったパス。相対パスはリポジトリルート基準で解決する */
export const resolveRepoPath = (root: string, path: string): string =>
	isAbsolute(path) ? path : join(root, path);
