/**
 * Run の作業用ファイル（`.tmp/review-loop/<run>/`）を消す。証跡として残すのが既定で、依頼されたときだけ使う。
 *
 *   bun dist/cleanup-run-files.mjs --run <run-id>
 *
 * 進行中の Run は消さない（Stop フックと次の工程が状態ファイルを読むため）。終わった Run（done / aborted）か、
 * 状態ファイルが無い・読めないディレクトリだけを消す。
 */
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
	PHASE_LABELS,
	readRunState,
	resolveWorkspace,
	RUN_ID_PATTERN,
	runFileDisplayPath,
	TERMINAL_PHASES,
} from '../lib/state';
import { parseFlags, scriptCommand } from '../lib/util';

export const main = async (args: readonly string[]): Promise<void> => {
	const usage = `Usage: ${scriptCommand('cleanup-run-files')} --run <run-id>`;
	const { values } = parseFlags(args, { valueFlags: ['--run'], usage });
	const runId = values.get('--run');
	// Run ID の形に限ることで、作業用ディレクトリの外や別のファイルを消させない
	if (runId === undefined || !RUN_ID_PATTERN.test(runId)) {
		throw new Error(usage);
	}
	const { workDir } = await resolveWorkspace();
	// 状態ファイルが無い・壊れている Run の残骸は消してよい
	const state = await readRunState(runId, workDir).catch(() => null);
	if (state !== null && !TERMINAL_PHASES.has(state.phase)) {
		throw new Error(
			`Run ${runId} は「${PHASE_LABELS[state.phase]}」で進行中のため消せません。先に完了させるか --abort で中止してください`,
		);
	}
	await rm(join(workDir, runId), { recursive: true, force: true });
	console.log(`削除しました: ${runFileDisplayPath(runId, '')}`);
};
