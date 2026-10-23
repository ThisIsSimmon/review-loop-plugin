/** 子プロセスの起動（Bun.spawn）。標準出力・標準エラーを文字列で集め、打ち切り時間で止める */

export type ProcessResult = {
	/** シグナルで終わったときは null */
	exitCode: number | null;
	timedOut: boolean;
	stdout: string;
	stderr: string;
};

export type ProcessOptions = {
	cwd: string;
	env?: Record<string, string | undefined>;
	/** 標準入力に渡す文字列。省略時は標準入力を閉じる */
	input?: string;
	timeoutMs?: number;
	/** 起動直後に pid を受け取る。失敗したら子プロセスを止めてその失敗を返す */
	onSpawn?: (pid: number) => Promise<void>;
};

/** コマンドが見つからないなど、起動そのものに失敗したら reject する（Bun.spawn は同期で投げる） */
export const runProcess = async (
	command: string,
	args: readonly string[],
	options: ProcessOptions,
): Promise<ProcessResult> => {
	const child = Bun.spawn([command, ...args], {
		cwd: options.cwd,
		env: options.env ?? process.env,
		stdin:
			options.input === undefined
				? 'ignore'
				: new TextEncoder().encode(options.input),
		stdout: 'pipe',
		stderr: 'pipe',
	});
	let timedOut = false;
	const timer =
		options.timeoutMs === undefined
			? undefined
			: setTimeout(() => {
					timedOut = true;
					child.kill();
				}, options.timeoutMs);
	try {
		// 子が出力で詰まらないよう、onSpawn を待つ前から読み始める
		const outputs = Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		if (options.onSpawn) {
			// onSpawn の書き込みが終わる前に結果を返すと、呼び出し元の後続の書き込みを古い内容で上書きされ得る
			try {
				await options.onSpawn(child.pid);
			} catch (error) {
				child.kill();
				outputs.catch(() => {});
				throw error;
			}
		}
		const [stdout, stderr] = await outputs;
		return { exitCode: child.exitCode, timedOut, stdout, stderr };
	} finally {
		clearTimeout(timer);
	}
};
