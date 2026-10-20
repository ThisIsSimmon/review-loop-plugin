/**
 * 所見への対応表を検証し、次の工程（修正へ戻る / 完了へ進む / ラウンド上限）を決める。
 *
 *   node dist/record-dispositions.mjs [--run <run-id>] [--file <対応表のパス>] [--none]
 *
 * `--none` は所見が 0 件のときだけ使える。out_of_scope の所見は、先に範囲外の記録ファイル（設定の outOfScopeFile）の
 * 一覧へ「review-loop <Run ID> <所見 ID>」の行として追記されていることを確かめる。記録ファイルが無ければ雛形から作る。
 * 検証を通った対応表は、`--file` で別の場所から読んだ場合も標準パスへ保存する（次のラウンドはそこだけを読む）。
 */
import { join } from 'node:path';
import {
	checkNoneAllowed,
	countDispositions,
	type DispositionsFile,
	DispositionsFileSchema,
	decideNextPhase,
	type NextPhaseAfterTriage,
	OUT_OF_SCOPE_TEMPLATE,
	validateDispositions,
} from '../lib/dispositions';
import { readTextIfExists, writeJson, writeText } from '../lib/fs';
import { ReviewResultSchema } from '../lib/review-result';
import {
	PHASE_LABELS,
	type RunState,
	resolveRepoPath,
	resolveRunState,
	resolveWorkspace,
	roundFileName,
	runFileDisplayPath,
	runFilePath,
	writeRunState,
} from '../lib/state';
import { parseFlags, parseJsonWith, scriptCommand } from '../lib/util';

const usage = (): string =>
	`Usage: ${scriptCommand('record-dispositions')} [--run <run-id>] [--file <対応表のパス>] [--none]`;

/** 修正のあとに通すコマンドの案内。設定が無ければ規約ファイルに従わせる */
export const describeChecks = (state: RunState): string => {
	const commands = [state.config.testCommand, state.config.lintCommand].filter(
		(command): command is string => command !== null,
	);
	return commands.length === 0
		? '影響するテストと lint（規約ファイルの決まりに従う）'
		: commands.map((command) => `\`${command}\``).join(' と ');
};

export const renderNextStepAfterTriage = (
	phase: NextPhaseAfterTriage,
	state: RunState,
): string => {
	switch (phase) {
		case 'fixing':
			return `次の工程: addressed の所見を修正し、${describeChecks(state)}を通してから ${scriptCommand('request-review')} --run ${state.runId} を再実行する（ラウンド ${state.round + 1}。依頼書は作り直さない）`;
		case 'ready_to_finish':
			return `対応すべき所見はありません。次の工程: review-loop スキルの「コミットメッセージの書き方」に従ってメッセージを書いて ${runFileDisplayPath(state.runId, 'commit-message.txt')} に保存し、${scriptCommand('finish-run')} --run ${state.runId} を実行する`;
		case 'max_rounds':
			return `最大ラウンド数 ${state.config.maxRounds} に達しました。addressed の所見は修正しますが Codex へのレビューは出さず、残った所見と対応を依頼者に報告して判断を仰いでください（ターンを終えてよいです）`;
	}
};

export const main = async (args: readonly string[]): Promise<void> => {
	const { values, switches } = parseFlags(args, {
		valueFlags: ['--run', '--file'],
		switchFlags: ['--none'],
		usage: usage(),
	});
	const { root, workDir } = await resolveWorkspace();
	const state = await resolveRunState(values.get('--run'), workDir);
	if (state.phase !== 'triaging') {
		throw new Error(
			`Run ${state.runId} は「${PHASE_LABELS[state.phase]}」（${state.phase}）のため、対応表を記録できません。所見の精査待ちのときだけ記録できます`,
		);
	}
	const round = state.round;
	const resultName = roundFileName(round, 'result.json');
	const resultText = await readTextIfExists(
		runFilePath(workDir, state.runId, resultName),
	);
	if (resultText === null) {
		throw new Error(
			`レビュー結果がありません: ${runFileDisplayPath(state.runId, resultName)}`,
		);
	}
	const result = parseJsonWith(
		ReviewResultSchema,
		resultText,
		runFileDisplayPath(state.runId, resultName),
	);

	const dispositionsName = roundFileName(round, 'dispositions.json');
	const dispositionsDisplay = runFileDisplayPath(state.runId, dispositionsName);
	let dispositions: DispositionsFile;
	if (switches.has('--none')) {
		if (values.has('--file')) throw new Error(usage());
		const noneRejected = checkNoneAllowed(
			result.findings.length,
			dispositionsDisplay,
		);
		if (noneRejected !== null) throw new Error(noneRejected);
		dispositions = { round, items: [] };
	} else {
		const fileArg = values.get('--file');
		const path =
			fileArg === undefined
				? runFilePath(workDir, state.runId, dispositionsName)
				: resolveRepoPath(root, fileArg);
		const text = await readTextIfExists(path);
		if (text === null) {
			throw new Error(
				`対応表がありません: ${path}。所見 0 件なら --none を付けてください`,
			);
		}
		dispositions = parseJsonWith(DispositionsFileSchema, text, path);
	}

	const outOfScopeFile = state.config.outOfScopeFile;
	const outOfScopePath = join(root, outOfScopeFile);
	let outOfScopeTodoText = await readTextIfExists(outOfScopePath);
	let createdTemplate = false;
	if (
		outOfScopeTodoText === null &&
		dispositions.items.some((item) => item.disposition === 'out_of_scope')
	) {
		await writeText(outOfScopePath, OUT_OF_SCOPE_TEMPLATE);
		outOfScopeTodoText = OUT_OF_SCOPE_TEMPLATE;
		createdTemplate = true;
	}
	const problems = validateDispositions({
		runId: state.runId,
		round,
		findings: result.findings,
		dispositions,
		outOfScopeFile,
		outOfScopeTodoText: outOfScopeTodoText ?? '',
	});
	if (problems.length > 0) {
		throw new Error(
			[
				...(createdTemplate
					? [
							`範囲外の記録ファイルが無かったので、雛形から ${outOfScopeFile} を作りました。記入の決まりに従って一覧へ行を追記してから再実行してください。`,
						]
					: []),
				'対応表に問題があります:',
				...problems.map((problem) => `- ${problem}`),
			].join('\n'),
		);
	}

	// 次のラウンドの request-review は標準パスだけを読むので、検証済みの内容をそこへ残す
	await writeJson(runFilePath(workDir, state.runId, dispositionsName), dispositions);
	const nextPhase = decideNextPhase({
		items: dispositions.items,
		round,
		maxRounds: state.config.maxRounds,
	});
	const next = await writeRunState({ ...state, phase: nextPhase }, workDir);
	const counts = countDispositions(dispositions.items);
	console.log(
		`対応表を記録しました（Run ${state.runId} / ラウンド ${round} / ${dispositionsDisplay}）: 対応 ${counts.addressed} / 却下 ${counts.rejected} / 範囲外 ${counts.out_of_scope}`,
	);
	console.log(renderNextStepAfterTriage(nextPhase, next));
};
