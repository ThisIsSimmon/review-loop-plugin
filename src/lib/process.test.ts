import { describe, expect, test } from 'bun:test';
import { tmpdir } from 'node:os';
import { runProcess } from './process';

const cwd = tmpdir();

describe('runProcess', () => {
	test('標準入力を渡し、標準出力・標準エラー・終了コードを集める', async () => {
		const result = await runProcess(
			'sh',
			['-c', 'cat; echo err >&2; exit 3'],
			{ cwd, input: 'こんにちは' },
		);
		expect(result).toEqual({
			exitCode: 3,
			timedOut: false,
			stdout: 'こんにちは',
			stderr: 'err\n',
		});
	});

	test('打ち切り時間を過ぎたら止めて timedOut を立てる', async () => {
		const result = await runProcess('sleep', ['5'], { cwd, timeoutMs: 50 });
		expect(result.timedOut).toBe(true);
		expect(result.exitCode).toBeNull();
	});

	test('onSpawn が終わるまで結果を返さず、失敗したら子を止めて reject する', async () => {
		const order: string[] = [];
		await runProcess('true', [], {
			cwd,
			onSpawn: async () => {
				await new Promise((resolve) => setTimeout(resolve, 50));
				order.push('onSpawn');
			},
		});
		order.push('resolved');
		expect(order).toEqual(['onSpawn', 'resolved']);
		await expect(
			runProcess('sleep', ['5'], {
				cwd,
				onSpawn: async () => {
					throw new Error('書けない');
				},
			}),
		).rejects.toThrow('書けない');
	});

	test('コマンドが無ければ reject する', async () => {
		await expect(
			runProcess('review-loop-no-such-command', [], { cwd }),
		).rejects.toThrow(); // 文言は Node と Bun で違う
	});
});
