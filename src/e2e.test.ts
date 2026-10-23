/**
 * ビルド済みの dist/*.mjs を Node で実行し、一時リポジトリで 1 往復を通す（`bun run build` の後に実行する）。
 * codex は PATH 上の偽物に置き換え、ラウンド 1 は所見 2 件、ラウンド 2 は所見 0 件を返させる。
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
	access,
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runProcess } from './lib/process';
import { TEST_GIT_ENV } from './test-support/fixtures';

const DIST = join(import.meta.dir, '..', 'plugins', 'review-loop', 'dist');

const FAKE_CODEX = `#!/bin/sh
# -o の次の引数に最終応答を書く。呼ばれた回数で応答を変える
out=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "-o" ]; then out="$arg"; fi
  prev="$arg"
done
cat > "$FAKE_CODEX_DIR/prompt-$(ls "$FAKE_CODEX_DIR" | grep -c prompt).md"
count=$(ls "$FAKE_CODEX_DIR" | grep -c prompt)
if [ "$count" = "1" ]; then
  cat > "$out" <<'JSON'
{"verdict":"needs_attention","summary":"2 件","findings":[
{"severity":"important","scope":"change","title":"0 で割る","file":"calc.js","line_start":1,"line_end":1,"body":"b が 0 のとき Infinity","recommendation":"0 を拒否する","evidence":"source"},
{"severity":"minor","scope":"pre_existing","title":"README が古い","file":"README.md","line_start":1,"line_end":1,"body":"説明が古い","recommendation":"","evidence":"source"}
],"tests_run":[],"unverified":[]}
JSON
else
  echo '{"verdict":"approve","summary":"修正を確認","findings":[],"tests_run":[],"unverified":[]}' > "$out"
fi
`;

describe('dist の 1 往復（Bun で実行）', () => {
	let repo: string;
	let fakeBin: string;
	let fakeCodexDir: string;
	let env: NodeJS.ProcessEnv;

	const bun = async (name: string, args: string[] = [], input?: string) => {
		const result = await runProcess(
			'bun',
			[join(DIST, `${name}.mjs`), ...args],
			{ cwd: repo, env, input },
		);
		return { ...result, output: `${result.stdout}${result.stderr}` };
	};
	const git = (args: string[]) => runProcess('git', args, { cwd: repo, env });
	const runFile = (runId: string, name: string) =>
		join(repo, '.tmp', 'review-loop', runId, name);

	beforeAll(async () => {
		await access(join(DIST, 'start-run.mjs'));
		const base = await mkdtemp(join(tmpdir(), 'review-loop-e2e-'));
		repo = join(base, 'repo');
		fakeBin = join(base, 'bin');
		fakeCodexDir = join(base, 'codex-calls');
		await mkdir(repo);
		await mkdir(fakeBin);
		await mkdir(fakeCodexDir);
		await writeFile(join(fakeBin, 'codex'), FAKE_CODEX);
		await chmod(join(fakeBin, 'codex'), 0o755);
		env = {
			...process.env,
			...TEST_GIT_ENV,
			PATH: `${fakeBin}:${process.env.PATH}`,
			FAKE_CODEX_DIR: fakeCodexDir,
			CLAUDE_CODE_SESSION_ID: 'session-e2e',
		};
		await git(['init', '-q', '-b', 'main']);
		await writeFile(join(repo, 'README.md'), '# calc\n');
		await writeFile(join(repo, 'AGENTS.md'), '# 規約\n');
		await git(['add', '-A']);
		await git(['commit', '-q', '-m', 'init']);
	});

	afterAll(async () => {
		await rm(join(repo, '..'), { recursive: true, force: true });
	});

	test('開始 → レビュー → 対応表 → 修正 → 再レビュー → 確認待ち → コミット', async () => {
		const started = await bun('start-run', ['--task', '割り算を足す']);
		expect(started.exitCode).toBe(0);
		const runId = /Run (\d{4}-\d{2}-\d{2}\.\d{6})/.exec(started.output)?.[1];
		if (!runId) throw new Error(started.output);
		expect(started.output).toContain(`bun ${DIST}/request-review.mjs --run`);
		// 進行中の Run があるうちは二重に始めない
		expect((await bun('start-run', ['--task', 'x'])).exitCode).toBe(1);

		await writeFile(
			join(repo, 'calc.js'),
			'export const div = (a, b) => a / b;\n',
		);
		const guardInput = JSON.stringify({ session_id: 'session-e2e', cwd: repo });
		const guard = await bun('stop-guard', [], guardInput);
		expect(guard.exitCode).toBe(0);
		expect(JSON.parse(guard.stdout).decision).toBe('block');
		// 別セッションの Run は縛らない
		const other = await bun(
			'stop-guard',
			[],
			JSON.stringify({ session_id: 'session-other', cwd: repo }),
		);
		expect(other.stdout).toBe('');

		await writeFile(runFile(runId, '1.request.md'), '# レビュー依頼: 割り算\n');
		const review1 = await bun('request-review');
		expect(review1.exitCode).toBe(0);
		expect(review1.output).toContain('#### R1-1 [important] 0 で割る');
		const prompt1 = await readFile(join(fakeCodexDir, 'prompt-0.md'), 'utf8');
		expect(prompt1).toContain('# Perform Code Review');
		expect(prompt1).toContain('`AGENTS.md`');
		// 作業用ファイルはスナップショットに入らない
		expect(prompt1).not.toContain('.tmp/review-loop/.gitignore');
		expect((await git(['status', '--short'])).stdout).not.toContain('.tmp');

		await writeFile(
			runFile(runId, '1.dispositions.json'),
			JSON.stringify({
				round: 1,
				items: [
					{ id: 'R1-1', disposition: 'addressed', note: '' },
					{ id: 'R1-2', disposition: 'out_of_scope', note: 'OOS-1' },
				],
			}),
		);
		// 記録先が無ければ雛形を作り、行を追記するよう求める
		const firstRecord = await bun('record-dispositions');
		expect(firstRecord.exitCode).toBe(1);
		expect(firstRecord.output).toContain('雛形から docs/out-of-scope-todo.md');
		const todoPath = join(repo, 'docs', 'out-of-scope-todo.md');
		await writeFile(
			todoPath,
			`${await readFile(todoPath, 'utf8')}| OOS-1 | 2026-10-20 | review-loop ${runId} R1-2 | README.md:1 | 古い | 変更前から | 未着手 |\n`,
		);
		const recorded = await bun('record-dispositions');
		expect(recorded.exitCode).toBe(0);
		expect(recorded.output).toContain('次の工程: addressed の所見を修正し');

		await writeFile(
			join(repo, 'calc.js'),
			"export const div = (a, b) => {\n\tif (b === 0) throw new Error('0');\n\treturn a / b;\n};\n",
		);
		const review2 = await bun('request-review');
		expect(review2.exitCode).toBe(0);
		const prompt2 = await readFile(join(fakeCodexDir, 'prompt-1.md'), 'utf8');
		expect(prompt2).toContain('- R1-1 [important] 0 で割る（calc.js:1-1）→ 対応（修正）');
		expect((await bun('record-dispositions', ['--none'])).exitCode).toBe(0);

		// 状態ファイルの工程に応じて、まだ止めさせない
		expect(JSON.parse((await bun('stop-guard', [], guardInput)).stdout).reason).toContain(
			'commit-message.txt',
		);
		await writeFile(
			runFile(runId, 'commit-message.txt'),
			'feat: 割り算を足す\n\n0 での割り算は例外にする。\n',
		);
		const finished = await bun('finish-run');
		expect(finished.exitCode).toBe(0);
		expect(finished.output).toContain('コミットの確認待ちにしました');
		expect((await bun('stop-guard', [], guardInput)).stdout).toBe('');

		const committed = await bun('finish-run', ['--commit']);
		expect(committed.exitCode).toBe(0);
		expect((await git(['log', '-1', '--format=%s'])).stdout.trim()).toBe(
			'feat: 割り算を足す',
		);
		expect(
			(await git(['show', '--name-only', '--format=', 'HEAD'])).stdout
				.trim()
				.split('\n')
				.sort(),
		).toEqual(['calc.js', 'docs/out-of-scope-todo.md']);
		expect((await git(['status', '--short'])).stdout).toBe('');

		const cleaned = await bun('cleanup-run-files', ['--run', runId]);
		expect(cleaned.exitCode).toBe(0);
		await expect(access(runFile(runId, 'state.json'))).rejects.toThrow();
	}, 30_000);

	test('git リポジトリの外では、stop-guard は何もせず、他のコマンドは理由を出して失敗する', async () => {
		const outside = await mkdtemp(join(tmpdir(), 'review-loop-outside-'));
		try {
			const guard = await runProcess(
				'bun',
				[join(DIST, 'stop-guard.mjs')],
				{ cwd: outside, env, input: JSON.stringify({ cwd: outside }) },
			);
			expect(guard).toMatchObject({ exitCode: 0, stdout: '' });
			const start = await runProcess(
				'bun',
				[join(DIST, 'start-run.mjs'), '--task', 'x'],
				{ cwd: outside, env },
			);
			expect(start.exitCode).toBe(1);
			expect(start.stderr).toContain('git リポジトリの中で実行してください');
		} finally {
			await rm(outside, { recursive: true, force: true });
		}
	});
});
