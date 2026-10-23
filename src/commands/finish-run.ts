/**
 * Run の締め。レビュー済みのスナップショットと作業ツリーが同じことを確かめ、コミットメッセージと変更の一覧を
 * 出して確認待ちにする。`--commit` で `git add -A` → `git commit -F` を行う（リポジトリの git フックはそのまま走る）。
 * autoCommit=false の Run では、確認待ちを経ずに `--commit` はできない。
 *
 *   bun dist/finish-run.mjs [--run <run-id>] [--message-file <path>] [--commit] [--abort]
 *
 * レビュー後の変更が範囲外の記録ファイルへの追記だけなら（対応表の検証がその追記を要求するため、レビュー後に
 * 必ず起きる）レビュー済みとして扱う。それ以外の変更は request-review での再レビューを求める。
 */
import { readTextIfExists } from '../lib/fs';
import {
	createGitRunner,
	getDiffStat,
	getStatusShort,
	listChangedPaths,
	type RunGit,
	readTreeFile,
	revParse,
	runGitOrThrow,
	snapshotWorkingTree,
	writeIndexTree,
} from '../lib/git';
import {
	PHASE_LABELS,
	type RunPhase,
	resolveRepoPath,
	resolveRunState,
	resolveWorkspace,
	runFileDisplayPath,
	runFilePath,
	TERMINAL_PHASES,
	writeRunState,
} from '../lib/state';
import { parseFlags, scriptCommand } from '../lib/util';

const usage = (): string =>
	`Usage: ${scriptCommand('finish-run')} [--run <run-id>] [--message-file <path>] [--commit] [--abort]`;
/** 件名の上限。多くのツールが 72 文字を超える件名を折り返す・切り詰める */
const SUBJECT_MAX_LENGTH = 72;

export const validateCommitMessage = (message: string): string[] => {
	const problems: string[] = [];
	const lines = message.replace(/\r\n/g, '\n').split('\n');
	const subject = lines[0]?.trim() ?? '';
	if (subject === '') {
		problems.push('件名（1 行目）が空です');
	}
	if (subject.length > SUBJECT_MAX_LENGTH) {
		problems.push(
			`件名が ${SUBJECT_MAX_LENGTH} 文字を超えています（${subject.length} 文字）`,
		);
	}
	if (lines.length > 1 && lines[1]?.trim() !== '') {
		problems.push('件名と本文の間に空行が必要です');
	}
	return problems;
};

/** レビュー後の変更が範囲外の記録ファイルだけか（変更が無い場合は対象外） */
export const isOnlyOutOfScopeRecordChange = (
	changedPaths: readonly string[],
	outOfScopeFile: string,
): boolean =>
	changedPaths.length > 0 &&
	changedPaths.every((path) => path === outOfScopeFile);

/** レビュー済みの本文を先頭にそのまま残した末尾への追記だけを許す（削除・既存行の書き換えは再レビューへ） */
export const isAppendOnlyChange = (before: string, after: string): boolean =>
	after.length > before.length && after.startsWith(before);

/**
 * 締められるか。完了準備（ready_to_finish）か、確認待ち（awaiting_confirmation）での --commit だけを通す。autoCommit=false の
 * Run は、確認待ちを経ずに --commit できない（依頼者が差分を見る前にコミットと push を走らせない）。締められないときは理由を返す。
 */
export const checkFinishable = (input: {
	runId: string;
	phase: RunPhase;
	commit: boolean;
	autoCommit: boolean;
}): string | null => {
	const canFinish =
		input.phase === 'ready_to_finish' ||
		(input.phase === 'awaiting_confirmation' && input.commit);
	if (!canFinish)
		return `Run ${input.runId} は「${PHASE_LABELS[input.phase]}」（${input.phase}）のため締められません。対応すべき所見が無くなった（ready_to_finish）後に実行してください`;
	if (
		input.commit &&
		!input.autoCommit &&
		input.phase !== 'awaiting_confirmation'
	)
		return 'autoCommit=false の Run は確認待ちを経ずにコミットできません。先に --commit 無しで実行し、依頼者の承認を得てください';
	return null;
};

/**
 * `git add -A` でステージし、index のツリーがレビュー済みのツリーと同じことを確かめる。スナップショットは HEAD から作った
 * 一時 index の内容だが、コミットは本物の index から作られる。index に `git add -f` された無視ファイルなど、スナップショットに
 * 含まれない内容が残っていると、レビュー外の内容をコミットしてしまうので止める。
 */
export const stageReviewedTree = async (
	git: RunGit,
	tree: string,
): Promise<void> => {
	await runGitOrThrow(git, ['add', '-A']);
	const stagedTree = await writeIndexTree(git);
	if (stagedTree !== tree) {
		throw new Error(
			`ステージした内容（${stagedTree.slice(0, 12)}）がレビュー済みのツリー（${tree.slice(0, 12)}）と一致しないため、コミットを中止しました。git add -f で追加された無視ファイルなど、スナップショットに含まれない内容が index にあります。git status で確かめて index から外し、再実行してください（git add -A は実行済みです）`,
		);
	}
};

/** コミット後に upstream が HEAD と一致するか（post-commit フックなどで push されたか）を報告する文 */
export const describePushState = (
	upstream: { exitCode: number; stdout: string },
	headAfter: string,
): string =>
	upstream.exitCode !== 0
		? 'upstream が未設定のため push の確認はできません'
		: upstream.stdout.trim() === headAfter
			? 'push 済み（upstream が HEAD と一致）'
			: `upstream（${upstream.stdout.trim().slice(0, 12)}）が HEAD と一致しません。push されていない可能性があります。git status -sb で確かめてください`;

export const main = async (args: readonly string[]): Promise<void> => {
	const { values, switches } = parseFlags(args, {
		valueFlags: ['--run', '--message-file'],
		switchFlags: ['--commit', '--abort'],
		usage: usage(),
	});
	const { root, workDir } = await resolveWorkspace();
	const state = await resolveRunState(values.get('--run'), workDir);

	if (switches.has('--abort')) {
		if (switches.has('--commit')) throw new Error(usage());
		if (TERMINAL_PHASES.has(state.phase)) {
			throw new Error(
				`Run ${state.runId} は既に「${PHASE_LABELS[state.phase]}」です`,
			);
		}
		await writeRunState({ ...state, phase: 'aborted' }, workDir);
		console.log(
			`Run ${state.runId} を中止しました。作業ツリーはそのままです（${runFileDisplayPath(state.runId, '')} の証跡も残ります）`,
		);
		return;
	}

	const commit = switches.has('--commit');
	const notFinishable = checkFinishable({
		runId: state.runId,
		phase: state.phase,
		commit,
		autoCommit: state.config.autoCommit,
	});
	if (notFinishable !== null) throw new Error(notFinishable);

	const messageName = 'commit-message.txt';
	const messageArg = values.get('--message-file');
	const messagePath =
		messageArg === undefined
			? runFilePath(workDir, state.runId, messageName)
			: resolveRepoPath(root, messageArg);
	const message = await readTextIfExists(messagePath);
	if (message === null) {
		throw new Error(
			`コミットメッセージがありません: ${messagePath}。review-loop スキルの「コミットメッセージの書き方」に従って書き、${runFileDisplayPath(state.runId, messageName)} に保存してください`,
		);
	}
	const problems = validateCommitMessage(message);
	if (problems.length > 0) {
		throw new Error(
			[
				'コミットメッセージに問題があります:',
				...problems.map((p) => `- ${p}`),
			].join('\n'),
		);
	}

	const outOfScopeFile = state.config.outOfScopeFile;
	const git = createGitRunner(root);
	const reviewedTree = state.snapshots[String(state.round)];
	if (!reviewedTree) {
		throw new Error(
			`ラウンド ${state.round} のスナップショットが状態ファイルにありません`,
		);
	}
	const tree = await snapshotWorkingTree(git);
	let reviewNote: string;
	if (tree === reviewedTree) {
		reviewNote = 'レビュー済みの内容と作業ツリーは一致しています。';
	} else {
		const changedPaths = await listChangedPaths(git, reviewedTree, tree);
		if (!isOnlyOutOfScopeRecordChange(changedPaths, outOfScopeFile)) {
			throw new Error(
				`レビュー後に作業ツリーが変わっています（${changedPaths.join(', ')}）。${scriptCommand('request-review')} --run ${state.runId} で変更分を再レビューしてください`,
			);
		}
		const before =
			(await readTreeFile(git, reviewedTree, outOfScopeFile)) ?? '';
		const after = await readTreeFile(git, tree, outOfScopeFile);
		if (after === null || !isAppendOnlyChange(before, after)) {
			throw new Error(
				`${outOfScopeFile} がレビュー後に追記以外の形で変わっています（削除、または既存の内容の書き換え）。${scriptCommand('request-review')} --run ${state.runId} で変更分を再レビューしてください`,
			);
		}
		reviewNote = `レビュー後の変更は ${outOfScopeFile} の末尾への追記だけなので、レビュー済みとして扱います。`;
	}

	if (!commit) {
		await writeRunState({ ...state, phase: 'awaiting_confirmation' }, workDir);
		console.log(
			[
				`Run ${state.runId}: ${reviewNote}コミットの確認待ちにしました。`,
				'',
				'### コミットメッセージ',
				'```',
				message.trimEnd(),
				'```',
				'',
				'### 変更ファイル（git status --short）',
				await getStatusShort(git),
				'',
				'### 差分の統計（HEAD との比較）',
				await getDiffStat(git, 'HEAD', tree),
				'',
				state.config.autoCommit
					? `autoCommit=true のため、続けて ${scriptCommand('finish-run')} --run ${state.runId} --commit を実行してください。`
					: `上の内容を応答の本文で依頼者に見せ、承認を選択肢（AskUserQuestion の「コミットする」「コミットしない」）で取ってから、${scriptCommand('finish-run')} --run ${state.runId} --commit を実行してください（選択肢を出せない環境では文章で尋ね、承認待ちでターンを終えてよいです）。`,
			].join('\n'),
		);
		return;
	}

	const headBefore = await revParse(git, 'HEAD');
	await stageReviewedTree(git, tree);
	const commitResult = await git(['commit', '-F', messagePath]);
	const hookOutput = `${commitResult.stdout}${commitResult.stderr}`.trim();
	if (commitResult.exitCode !== 0) {
		await writeRunState(
			{
				...state,
				lastError: `git commit が失敗しました（exit ${commitResult.exitCode}）`,
			},
			workDir,
		);
		throw new Error(
			`git commit が失敗しました（exit ${commitResult.exitCode}）。pre-commit フック等の出力:\n${hookOutput}`,
		);
	}
	const headAfter = await revParse(git, 'HEAD');
	if (headAfter === headBefore) {
		throw new Error(
			'git commit は終了しましたが、新しいコミットが作られていません',
		);
	}
	const pushNote = state.config.checkPushAfterCommit
		? describePushState(
				await git(['rev-parse', '--verify', '--quiet', '@{u}']),
				headAfter,
			)
		: null;
	await writeRunState(
		{ ...state, phase: 'done', commitSha: headAfter, lastError: null },
		workDir,
	);
	console.log(
		[
			`Run ${state.runId} を完了しました。コミット ${headAfter.slice(0, 12)}`,
			...(pushNote === null ? [] : [`- push: ${pushNote}`]),
			'- git commit の出力:',
			...hookOutput.split('\n').map((line) => `    ${line}`),
		].join('\n'),
	);
};
