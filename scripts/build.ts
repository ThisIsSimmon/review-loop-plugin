/**
 * src/bin の各エントリを、valibot と埋め込みの文面ごと 1 ファイルの ESM にまとめ、plugins/review-loop/dist に出す。
 * 利用先のプロジェクトには Bun と Codex CLI だけがあればよい（node_modules は要らない）。
 */
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const binDir = join(root, 'src', 'bin');
const outdir = join(root, 'plugins', 'review-loop', 'dist');

const entrypoints = (await readdir(binDir))
	.filter((name) => name.endsWith('.ts'))
	.sort()
	.map((name) => join(binDir, name));

await rm(outdir, { recursive: true, force: true });
const result = await Bun.build({
	entrypoints,
	outdir,
	target: 'bun',
	format: 'esm',
	naming: '[name].mjs',
	minify: false,
	splitting: false,
});
if (!result.success) {
	for (const log of result.logs) console.error(log);
	process.exit(1);
}
for (const output of result.outputs) {
	console.log(`${output.path.slice(root.length + 1)} (${Math.round(output.size / 1024)} KB)`);
}
