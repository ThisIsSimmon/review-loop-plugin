/**
 * Run を一時停止する。依頼者へ質問する・判断を仰ぐために LLM がターンを終えたいときに使う。
 * 一時停止中は Stop フックが止めるのを許す。次にどの script が状態を書いても解除される。
 *
 *   bun dist/pause-run.mjs [--run <run-id>] [--reason "<理由>"]
 */
import {
	PHASE_LABELS,
	resolveRunState,
	resolveWorkspace,
	TERMINAL_PHASES,
	writePausedRunState,
} from '../lib/state';
import { parseFlags, scriptCommand } from '../lib/util';

export const main = async (args: readonly string[]): Promise<void> => {
	const { values } = parseFlags(args, {
		valueFlags: ['--run', '--reason'],
		usage: `Usage: ${scriptCommand('pause-run')} [--run <run-id>] [--reason "<理由>"]`,
	});
	const { workDir } = await resolveWorkspace();
	const state = await resolveRunState(values.get('--run'), workDir);
	if (TERMINAL_PHASES.has(state.phase)) {
		throw new Error(
			`Run ${state.runId} は「${PHASE_LABELS[state.phase]}」のため一時停止できません`,
		);
	}
	await writePausedRunState(state, workDir);
	const reason = values.get('--reason');
	console.log(
		[
			`Run ${state.runId} を一時停止しました（工程「${PHASE_LABELS[state.phase]}」のまま）。ターンを終えてよいです。`,
			...(reason ? [`- 理由: ${reason}`] : []),
			'- 再開: 次の工程の script（request-review / record-dispositions / finish-run）を実行すると解除されます。',
		].join('\n'),
	);
};
