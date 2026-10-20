import { describe, expect, test } from 'bun:test';
import { buildCodexExecArgs } from './codex-exec';

describe('buildCodexExecArgs', () => {
	test('読み取り専用・セッション非保存・スキーマ・出力先を固定し、モデルと effort は指定時だけ付ける', () => {
		expect(
			buildCodexExecArgs({
				repoRoot: '/repo',
				model: null,
				reasoningEffort: null,
				schemaPath: '/s.json',
				outputPath: '/o.json',
			}),
		).toEqual([
			'exec',
			'--ephemeral',
			'-s',
			'read-only',
			'-C',
			'/repo',
			'--output-schema',
			'/s.json',
			'-o',
			'/o.json',
			'-',
		]);
		expect(
			buildCodexExecArgs({
				repoRoot: '/repo',
				model: 'gpt-5.5',
				reasoningEffort: 'high',
				schemaPath: '/s.json',
				outputPath: '/o.json',
			}),
		).toEqual([
			'exec',
			'--ephemeral',
			'-s',
			'read-only',
			'-C',
			'/repo',
			'-m',
			'gpt-5.5',
			'-c',
			'model_reasoning_effort="high"',
			'--output-schema',
			'/s.json',
			'-o',
			'/o.json',
			'-',
		]);
	});

	test.each([
		['effort だけ', null, 'high', ['-c', 'model_reasoning_effort="high"']],
		['モデルだけ', 'gpt-5.5', null, ['-m', 'gpt-5.5']],
	] as const)('%s を指定したときは、その引数だけを付ける', (_, model, reasoningEffort, added) => {
		expect(
			buildCodexExecArgs({
				repoRoot: '/repo',
				model,
				reasoningEffort,
				schemaPath: '/s.json',
				outputPath: '/o.json',
			}),
		).toEqual([
			'exec',
			'--ephemeral',
			'-s',
			'read-only',
			'-C',
			'/repo',
			...added,
			'--output-schema',
			'/s.json',
			'-o',
			'/o.json',
			'-',
		]);
	});
});
