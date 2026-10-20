/**
 * 作業ツリーをスナップショットし、Codex に読み取り専用でレビューさせ、所見を ID 付きで保存・表示する。
 *
 *   node dist/request-review.mjs [--run <run-id>] [--request <依頼書のパス>] [--model <model>] [--effort <effort>] [--timeout-minutes <n>] [--max-rounds <n>]
 *
 * 1 回目は依頼書（既定 `.tmp/review-loop/<run>/1.request.md`）が必要。2 回目以降は前回のスナップショットからの
 * 差分と前回の対応表を Codex に渡す。失敗したら工程を review_failed にして止める（曖昧な失敗で勝手に再実行しない）。
 * ラウンド上限に達した Run（max_rounds）は、依頼者が続行を選んだときだけ `--max-rounds <n>` で上限を増やして再開する。
 * 完了準備・確認待ちの Run も、レビュー後に作業ツリーが変わって finish-run が通らないときはここへ戻って差分を再レビューする。
 * reviewing のまま残った Run は、保存した打ち切り時間を過ぎ、記録した codex の pid が生きていないときだけ中断とみなして再実行する。
 *
 * Codex に渡す文面（雛形・perform-code-review の本文）と JSON スキーマはビルド時にこのファイルへ埋め込む。
 * スキーマは Codex にパスで渡す必要があるので、Run のディレクトリに書き出してから使う。
 */
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import reviewerSkill from '../../plugins/review-loop/skills/perform-code-review/SKILL.md' with {
	type: 'text',
};
import reviewSchema from '../assets/review-result.schema.json';
import promptTemplate from '../assets/reviewer-prompt.md' with { type: 'text' };
import { resolveConventionFiles } from '../lib/config';
import { buildCodexExecArgs, runCodexExec } from '../lib/codex-exec';
import { DispositionsFileSchema } from '../lib/dispositions';
import { readTextIfExists, writeJson, writeText } from '../lib/fs';
import { createGitRunner, hasDiff, snapshotWorkingTree } from '../lib/git';
import type { ProcessResult } from '../lib/process';
import {
	type CodexReviewOutput,
	CodexReviewOutputSchema,
	normalizeReviewResult,
	ReviewResultSchema,
	renderReviewResult,
} from '../lib/review-result';
import {
	buildReviewerPrompt,
	type PreviousRoundEntry,
	stripFrontmatter,
} from '../lib/reviewer-prompt';
import {
	PHASE_LABELS,
	parseReasoningEffort,
	type RunPhase,
	type RunState,
	resolveRepoPath,
	resolveRunState,
	resolveWorkspace,
	roundFileName,
	runFileDisplayPath,
	runFilePath,
	writeRunState,
} from '../lib/state';
import {
	errorMessage,
	parseFlags,
	parseJsonWith,
	parsePositiveInteger,
	scriptCommand,
} from '../lib/util';

const usage = (): string =>
	`Usage: ${scriptCommand('request-review')} [--run <run-id>] [--request <依頼書のパス>] [--model <model>] [--effort <none|minimal|low|medium|high|xhigh>] [--timeout-minutes <n>] [--max-rounds <n>]`;

/**
 * レビューを依頼できる工程。review_failed は同じラウンドのやり直し。ready_to_finish / awaiting_confirmation は、
 * レビュー後に作業ツリーが変わって finish-run が通らないときの再レビュー（ここから戻れないと Run が詰まる）。
 */
export const REVIEWABLE_PHASES: ReadonlySet<RunPhase> = new Set<RunPhase>([
	'implementing',
	'fixing',
	'review_failed',
	'ready_to_finish',
	'awaiting_confirmation',
]);

/** pid が生きているか（signal 0）。打ち切り時間を過ぎていても codex が動いていれば中断とはみなさない */
export const isProcessAlive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

/**
 * reviewing のまま残った Run を、script が途中で死んだ（起動失敗・強制終了）とみなして再実行してよいか。
 * 打ち切り時間は実行時に state へ保存した値を見る（CLI の上書きを設定値で判定すると、動いている
 * レビューを中断済みと誤判定して同じラウンドを二重に起動する）。pid が分かっていて生きていれば待つ。
 */
export const isStaleReviewing = (
	state: RunState,
	now: Date,
	processAlive: (pid: number) => boolean = isProcessAlive,
): boolean =>
	state.phase === 'reviewing' &&
	now.getTime() - Date.parse(state.updatedAt) >
		state.config.timeoutMinutes * 60_000 &&
	(state.reviewPid === null || !processAlive(state.reviewPid));

const minutesSince = (iso: string, now: Date): number =>
	Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000));

/**
 * レビューを依頼してよいか。上限の延長（--max-rounds）・工程・ラウンドの上限を確かめ、依頼するラウンドと、上限を延ばした
 * state を返す。依頼できないときは理由を返す（max_rounds の Run は、依頼者が続行を選んだときの --max-rounds でだけ再開する）。
 */
export const checkReviewRequest = (input: {
	state: RunState;
	now: Date;
	extendedMaxRounds: number | undefined;
	processAlive?: (pid: number) => boolean;
}):
	| { ok: true; state: RunState; round: number; staleReviewing: boolean }
	| { ok: false; message: string } => {
	const { now, extendedMaxRounds, processAlive = isProcessAlive } = input;
	let state = input.state;
	if (extendedMaxRounds !== undefined) {
		if (extendedMaxRounds <= state.round)
			return {
				ok: false,
				message: `--max-rounds は現在のラウンド ${state.round} より大きい値にしてください: ${extendedMaxRounds}`,
			};
		state = {
			...state,
			config: { ...state.config, maxRounds: extendedMaxRounds },
		};
	}
	const resumable =
		state.phase === 'max_rounds' && extendedMaxRounds !== undefined;
	const staleReviewing = isStaleReviewing(state, now, processAlive);
	if (!REVIEWABLE_PHASES.has(state.phase) && !resumable && !staleReviewing) {
		if (state.phase === 'reviewing') {
			const pidNote =
				state.reviewPid !== null && processAlive(state.reviewPid)
					? `codex の pid ${state.reviewPid} が動いています。`
					: '';
			return {
				ok: false,
				message: `Run ${state.runId} はレビューを実行中です（開始 ${minutesSince(state.updatedAt, now)} 分前）。${pidNote}完了を待ってください。打ち切り時間 ${state.config.timeoutMinutes} 分を過ぎ、codex が終わっていれば、中断とみなして同じコマンドで再実行できます`,
			};
		}
		return {
			ok: false,
			message: `Run ${state.runId} は「${PHASE_LABELS[state.phase]}」（${state.phase}）のため、レビューを依頼できません。ラウンド上限に達した Run は、依頼者が続行を選んだときだけ --max-rounds <n> で上限を増やして再開できます`,
		};
	}
	const round = state.round + 1;
	if (round > state.config.maxRounds)
		return {
			ok: false,
			message: `最大ラウンド数 ${state.config.maxRounds} に達しています。残った所見と対応を依頼者に報告してください`,
		};
	return { ok: true, state, round, staleReviewing };
};

const readRunText = async (
	workDir: string,
	runId: string,
	fileName: string,
): Promise<string> => {
	const text = await readTextIfExists(runFilePath(workDir, runId, fileName));
	if (text === null) {
		throw new Error(
			`ファイルがありません: ${runFileDisplayPath(runId, fileName)}`,
		);
	}
	return text;
};

/** 前回ラウンドの所見と対応表を、Codex に渡す形に突き合わせる */
export const loadPreviousRound = async (
	workDir: string,
	runId: string,
	round: number,
): Promise<PreviousRoundEntry[]> => {
	const resultName = roundFileName(round, 'result.json');
	const dispositionsName = roundFileName(round, 'dispositions.json');
	const result = parseJsonWith(
		ReviewResultSchema,
		await readRunText(workDir, runId, resultName),
		runFileDisplayPath(runId, resultName),
	);
	const dispositions = parseJsonWith(
		DispositionsFileSchema,
		await readRunText(workDir, runId, dispositionsName),
		runFileDisplayPath(runId, dispositionsName),
	);
	const byId = new Map(dispositions.items.map((item) => [item.id, item]));
	return result.findings.map((finding) => {
		const item = byId.get(finding.id);
		if (!item) {
			throw new Error(
				`${runFileDisplayPath(runId, dispositionsName)} に ${finding.id} の対応がありません`,
			);
		}
		return { finding, disposition: item.disposition, note: item.note };
	});
};

export const renderNextStep = (state: RunState, round: number): string =>
	[
		'### 次の工程',
		'1. 各所見を現物（コード・git diff・テストの実行）で検証し、addressed / rejected / out_of_scope に分ける（所見の主張をそのまま信じず、却下も推測でしない）',
		`2. out_of_scope にする所見は、先に ${state.config.outOfScopeFile} の一覧へ、発見元「review-loop ${state.runId} <所見 ID>」の行を追記する（ファイルが無ければ record-dispositions が雛形を作る）`,
		`3. 対応表を ${runFileDisplayPath(state.runId, roundFileName(round, 'dispositions.json'))} に書き、${scriptCommand('record-dispositions')} --run ${state.runId} を実行する（所見 0 件なら --none）`,
	].join('\n');

const fileExists = async (path: string): Promise<boolean> => {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
};

export const main = async (args: readonly string[]): Promise<void> => {
	const { values } = parseFlags(args, {
		valueFlags: [
			'--run',
			'--request',
			'--model',
			'--effort',
			'--timeout-minutes',
			'--max-rounds',
		],
		usage: usage(),
	});
	const { root, workDir } = await resolveWorkspace();
	const now = new Date();
	const checked = checkReviewRequest({
		state: await resolveRunState(values.get('--run'), workDir),
		now,
		extendedMaxRounds: parsePositiveInteger(
			values.get('--max-rounds'),
			'--max-rounds',
		),
	});
	if (!checked.ok) throw new Error(checked.message);
	let state = checked.state;
	const { round, staleReviewing } = checked;
	if (staleReviewing) {
		console.log(
			`注意: 前回のレビューが reviewing のまま打ち切り時間（${state.config.timeoutMinutes} 分）を過ぎ、codex も終わっていました（開始 ${minutesSince(state.updatedAt, now)} 分前）。中断とみなして再実行します`,
		);
	}

	const git = createGitRunner(root);
	const tree = await snapshotWorkingTree(git);
	if (!(await hasDiff(git, 'HEAD', tree))) {
		throw new Error(
			'レビュー対象の変更がありません（HEAD と作業ツリーが同じ内容です）',
		);
	}
	const previousTree =
		round === 1 ? null : (state.snapshots[String(state.round)] ?? null);
	if (round > 1 && previousTree === null) {
		throw new Error(
			`ラウンド ${state.round} のスナップショットが状態ファイルにありません`,
		);
	}
	if (previousTree !== null && !(await hasDiff(git, previousTree, tree))) {
		throw new Error(
			'前回のレビューから作業ツリーに変更がありません。対応表で addressed にした所見の修正が入っているか確認してください',
		);
	}

	const defaultRequestName = roundFileName(1, 'request.md');
	const requestArg = values.get('--request');
	const requestPath =
		requestArg === undefined
			? runFilePath(workDir, state.runId, defaultRequestName)
			: resolveRepoPath(root, requestArg);
	const requestText = await readTextIfExists(requestPath);
	if (requestText === null) {
		throw new Error(
			`依頼書がありません: ${requestPath}。write-review-request スキルを --out ${runFileDisplayPath(state.runId, defaultRequestName)} で実行してください`,
		);
	}
	const request = requestText.trim();
	if (request === '') {
		throw new Error(`依頼書が空です: ${requestPath}`);
	}

	const previousRound =
		previousTree === null
			? []
			: await loadPreviousRound(workDir, state.runId, state.round);
	const prompt = buildReviewerPrompt(promptTemplate, {
		runId: state.runId,
		round,
		tree,
		previousTree,
		request,
		previousRound,
		reviewerGuide: stripFrontmatter(reviewerSkill),
		conventionFiles: await resolveConventionFiles(state.config, (path) =>
			fileExists(join(root, path)),
		),
		lintCommand: state.config.lintCommand,
		testCommand: state.config.testCommand,
	});
	await writeText(
		runFilePath(workDir, state.runId, roundFileName(round, 'prompt.md')),
		prompt,
	);
	const schemaPath = runFilePath(
		workDir,
		state.runId,
		'review-result.schema.json',
	);
	await writeJson(schemaPath, reviewSchema);

	const model = values.get('--model') ?? state.config.model;
	const reasoningEffort =
		parseReasoningEffort(values.get('--effort')) ??
		state.config.reasoningEffort;
	const timeoutMinutes =
		parsePositiveInteger(
			values.get('--timeout-minutes'),
			'--timeout-minutes',
		) ?? state.config.timeoutMinutes;

	// 打ち切り時間は state に保存してから使う（再実行の判定が同じ値を見るため）
	state = await writeRunState(
		{
			...state,
			phase: 'reviewing',
			lastError: null,
			reviewPid: null,
			config: { ...state.config, timeoutMinutes },
		},
		workDir,
	);
	const outputName = roundFileName(round, 'codex-output.json');
	const outputPath = runFilePath(workDir, state.runId, outputName);
	const logName = roundFileName(round, 'codex.log');
	const codexArgs = buildCodexExecArgs({
		repoRoot: root,
		model,
		reasoningEffort,
		schemaPath,
		outputPath,
	});

	// reviewing を書いた後の失敗は、必ず review_failed にして止める（reviewing が残ると再実行も Stop フックも詰まる）
	const fail = async (message: string): Promise<never> => {
		await writeRunState(
			{ ...state, phase: 'review_failed', lastError: message, reviewPid: null },
			workDir,
		);
		throw new Error(
			`${message}\nログ: ${runFileDisplayPath(state.runId, logName)}\n原因を確かめてから、同じコマンドで再実行するか、依頼者に報告してください`,
		);
	};

	console.log(
		`Codex にレビューを依頼します（Run ${state.runId} / ラウンド ${round} / モデル ${model ?? 'Codex 既定'} / effort ${reasoningEffort ?? 'Codex 既定'} / 打ち切り ${timeoutMinutes} 分）`,
	);
	const startedAt = Date.now();
	let run: ProcessResult;
	try {
		run = await runCodexExec(codexArgs, prompt, {
			cwd: root,
			timeoutMs: timeoutMinutes * 60_000,
			onSpawn: async (pid) => {
				state = await writeRunState({ ...state, reviewPid: pid }, workDir);
			},
		});
	} catch (error) {
		return fail(`codex を起動できません: ${errorMessage(error)}`);
	}
	const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
	try {
		await writeText(
			runFilePath(workDir, state.runId, logName),
			[
				`$ codex ${codexArgs.join(' ')}`,
				`exit=${run.exitCode} timedOut=${run.timedOut} elapsed=${elapsedSeconds}s`,
				'',
				'--- stderr ---',
				run.stderr,
				'--- stdout ---',
				run.stdout,
				'',
			].join('\n'),
		);
	} catch (error) {
		return fail(`Codex のログを書けません: ${errorMessage(error)}`);
	}
	if (run.timedOut) {
		return fail(`Codex のレビューを ${timeoutMinutes} 分で打ち切りました`);
	}
	if (run.exitCode !== 0) {
		return fail(`codex exec が失敗しました（exit ${run.exitCode}）`);
	}
	const outputText = await readTextIfExists(outputPath);
	if (outputText === null) {
		return fail(
			`Codex の最終応答ファイルがありません: ${runFileDisplayPath(state.runId, outputName)}`,
		);
	}
	let output: CodexReviewOutput;
	try {
		output = parseJsonWith(
			CodexReviewOutputSchema,
			outputText,
			'Codex の最終応答',
		);
	} catch (error) {
		return fail(errorMessage(error));
	}

	const result = normalizeReviewResult(output, {
		runId: state.runId,
		round,
		tree,
		previousTree,
		reviewedAt: new Date().toISOString(),
		model,
		reasoningEffort,
	});
	await writeJson(
		runFilePath(workDir, state.runId, roundFileName(round, 'result.json')),
		result,
	);
	await writeRunState(
		{
			...state,
			phase: 'triaging',
			round,
			snapshots: { ...state.snapshots, [String(round)]: tree },
			reviewPid: null,
			lastError: null,
		},
		workDir,
	);
	console.log(`レビューが終わりました（所要 ${elapsedSeconds} 秒）`);
	console.log('');
	console.log(renderReviewResult(result));
	console.log('');
	console.log(renderNextStep(state, round));
};
