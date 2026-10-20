/** 子プロセスの起動（Bun.spawn の置き換え）。標準出力・標準エラーを文字列で集め、打ち切り時間で止める */
import { spawn } from 'node:child_process';

export type ProcessResult = {
	/** シグナルで終わったときは null */
	exitCode: number | null;
	timedOut: boolean;
	stdout: string;
	stderr: string;
};

export type ProcessOptions = {
	cwd: string;
	env?: NodeJS.ProcessEnv;
	/** 標準入力に渡す文字列。省略時は標準入力を閉じる */
	input?: string;
	timeoutMs?: number;
	/** 起動直後に pid を受け取る。失敗したら子プロセスを止めてその失敗を返す */
	onSpawn?: (pid: number) => Promise<void>;
};

/** コマンドが見つからないなど、起動そのものに失敗したら reject する */
export const runProcess = (
	command: string,
	args: readonly string[],
	options: ProcessOptions,
): Promise<ProcessResult> =>
	new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			env: options.env ?? process.env,
			stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
		});
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		let timedOut = false;
		let settled = false;
		let timer: NodeJS.Timeout | undefined;
		// onSpawn の書き込みが終わる前に結果を返すと、呼び出し元の後続の書き込みを古い内容で上書きされ得る
		let spawned: Promise<void> = Promise.resolve();
		const settle = (fn: () => void): void => {
			if (settled) return;
			settled = true;
			if (timer) clearTimeout(timer);
			fn();
		};
		child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk));
		child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk));
		child.on('error', (error) => settle(() => reject(error)));
		child.on('close', (code) => {
			spawned.then(
				() =>
					settle(() =>
						resolve({
							exitCode: code,
							timedOut,
							stdout: Buffer.concat(stdout).toString('utf8'),
							stderr: Buffer.concat(stderr).toString('utf8'),
						}),
					),
				() => {},
			);
		});
		if (options.input !== undefined && child.stdin) {
			// 子が標準入力を読まずに終わっても EPIPE で落ちないようにする
			child.stdin.on('error', () => {});
			child.stdin.end(options.input, 'utf8');
		}
		if (options.timeoutMs !== undefined) {
			timer = setTimeout(() => {
				timedOut = true;
				child.kill();
			}, options.timeoutMs);
		}
		if (options.onSpawn && child.pid !== undefined) {
			spawned = options.onSpawn(child.pid);
			spawned.catch((error: unknown) => {
				child.kill();
				settle(() => reject(error));
			});
		}
	});
