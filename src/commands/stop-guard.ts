/**
 * Claude Code の Stop フック（hooks/hooks.json から node で呼ぶ）。review-loop の Run が途中（LLM の作業待ちの工程）の
 * ままターンを終えようとしたら、次の工程を理由にして続行させる。判断は純粋関数 decideStopGuard に寄せ、main は入出力だけを行う。
 *
 * - 標準入力: Claude Code が渡す JSON。`cwd` のリポジトリの `.tmp/review-loop/` を見る（git リポジトリの外なら何もしない）。
 *   `session_id` が Run を始めたセッション（CLAUDE_CODE_SESSION_ID）と違えば別セッションの Run なので見張らない。
 *   `background_tasks` に実行中のものがあれば（Codex のレビューをバックグラウンドで待っている間）止めてよい
 * - 標準出力: 続行させるときだけ `{"decision":"block","reason":...}`。それ以外は何も出さない（= 止めてよい）
 * - フック自身の失敗は stderr に書いて終了コード 0 にする（フックの不具合でセッションを縛らない）
 * - 24 時間更新の無い Run は見張らない（昔の Run の残骸で止まらないようにする）
 */
import * as v from 'valibot';
import { findRepoRoot } from '../lib/git';
import {
	listRunStates,
	PHASE_LABELS,
	type RunState,
	roundFileName,
	runFileDisplayPath,
	STOPPABLE_PHASES,
	workspaceFor,
} from '../lib/state';
import { errorMessage, scriptCommand } from '../lib/util';

export const STALE_RUN_MS = 24 * 60 * 60 * 1000;

const HookInputSchema = v.looseObject({
	session_id: v.optional(v.string()),
	cwd: v.optional(v.string()),
	background_tasks: v.optional(
		v.array(v.looseObject({ status: v.optional(v.string()) })),
	),
});

export type HookContext = {
	sessionId: string | null;
	/** セッションの作業ディレクトリ。無ければフックのプロセスの cwd を使う */
	cwd: string | null;
	backgroundTaskRunning: boolean;
};

/** フックの入力から、見張りに使う値だけを読む。読めない入力は「セッション不明・実行中の処理なし」として扱う */
export const readHookContext = (input: unknown): HookContext => {
	const result = v.safeParse(HookInputSchema, input);
	if (!result.success) {
		return { sessionId: null, cwd: null, backgroundTaskRunning: false };
	}
	return {
		sessionId: result.output.session_id ?? null,
		cwd: result.output.cwd ?? null,
		backgroundTaskRunning: (result.output.background_tasks ?? []).some(
			(task) => task.status === 'running',
		),
	};
};

export type StopGuardDecision =
	| { block: false; note: string | null }
	| { block: true; reason: string };

/** Run とフックの両方でセッションが分かっていて、違うときだけ別セッションの Run とみなす */
const belongsToSession = (state: RunState, sessionId: string | null): boolean =>
	state.sessionId === null ||
	sessionId === null ||
	state.sessionId === sessionId;

export const renderNextStep = (state: RunState): string => {
	const run = state.runId;
	switch (state.phase) {
		case 'implementing':
			return `実装とテストを終えたら、write-review-request スキルを --out ${runFileDisplayPath(run, roundFileName(1, 'request.md'))} で実行し、${scriptCommand('request-review')} --run ${run} をバックグラウンドで実行する`;
		case 'reviewing':
			return `request-review の完了を待つ。失敗していれば ${runFileDisplayPath(run, roundFileName(state.round + 1, 'codex.log'))} を見て、同じコマンドで再実行するか依頼者に報告する`;
		case 'triaging':
			return `所見を現物で検証して対応表 ${runFileDisplayPath(run, roundFileName(state.round, 'dispositions.json'))} を書き、${scriptCommand('record-dispositions')} --run ${run} を実行する`;
		case 'fixing':
			return `addressed の所見を修正してテストを通し、${scriptCommand('request-review')} --run ${run} を再実行する（ラウンド ${state.round + 1}）`;
		case 'ready_to_finish':
			return `review-loop スキルの「コミットメッセージの書き方」に従って ${runFileDisplayPath(run, 'commit-message.txt')} に書き、${scriptCommand('finish-run')} --run ${run} を実行する`;
		default:
			return '';
	}
};

export const decideStopGuard = (input: {
	states: readonly RunState[];
	now: Date;
	context: HookContext;
}): StopGuardDecision => {
	const watched = input.states.filter(
		(state) =>
			!STOPPABLE_PHASES.has(state.phase) &&
			!state.paused &&
			belongsToSession(state, input.context.sessionId) &&
			input.now.getTime() - Date.parse(state.updatedAt) <= STALE_RUN_MS,
	);
	const state = watched.at(-1);
	if (!state) {
		return { block: false, note: null };
	}
	if (input.context.backgroundTaskRunning) {
		return {
			block: false,
			note: `review-loop Run ${state.runId} は「${PHASE_LABELS[state.phase]}」。バックグラウンドのコマンドが動いているので待ちます`,
		};
	}
	return {
		block: true,
		reason: [
			`review-loop の Run ${state.runId} が「${PHASE_LABELS[state.phase]}」（${state.phase}）のままです。ループを続けてください。`,
			`次の工程: ${renderNextStep(state)}`,
			`依頼者に質問して止まる必要があるときは ${scriptCommand('pause-run')} --run ${state.runId}、中止するときは ${scriptCommand('finish-run')} --run ${state.runId} --abort を実行してから終えてください。`,
		].join('\n'),
	};
};

/** 標準入力をすべて読む。端末から直接起動されたとき（TTY）は待たずに空として扱う */
const readStdin = async (): Promise<string> => {
	if (process.stdin.isTTY) return '';
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
	}
	return Buffer.concat(chunks).toString('utf8');
};

export const main = async (): Promise<void> => {
	let hookInput: unknown = {};
	try {
		const text = await readStdin();
		hookInput = text.trim() === '' ? {} : JSON.parse(text);
	} catch (error) {
		console.error(
			`stop-guard: フックの入力を読めません: ${errorMessage(error)}`,
		);
	}
	const context = readHookContext(hookInput);
	const root = await findRepoRoot(context.cwd ?? process.cwd());
	if (root === null) return;
	const { states } = await listRunStates(workspaceFor(root).workDir);
	const decision = decideStopGuard({ states, now: new Date(), context });
	if (decision.block) {
		process.stdout.write(
			`${JSON.stringify({ decision: 'block', reason: decision.reason })}\n`,
		);
	} else if (decision.note !== null) {
		console.error(decision.note);
	}
};
