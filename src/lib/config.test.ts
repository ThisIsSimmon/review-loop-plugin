import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	applyConfigOverrides,
	DEFAULT_CONFIG,
	loadConfig,
	resolveConventionFiles,
} from './config';

describe('applyConfigOverrides', () => {
	test('既定値に設定ファイルの値を重ね、undefined の上書きは無視する', () => {
		expect(
			applyConfigOverrides(
				{ maxRounds: 3, testCommand: 'yarn test' },
				{ model: undefined, autoCommit: true },
			),
		).toEqual({
			...DEFAULT_CONFIG,
			maxRounds: 3,
			testCommand: 'yarn test',
			autoCommit: true,
		});
		expect(applyConfigOverrides({ $schema: './x.json' }, {})).toEqual(
			DEFAULT_CONFIG,
		);
	});

	test('知らない項目・列挙に無い値・リポジトリの外を指すパスは拒否する', () => {
		expect(() => applyConfigOverrides({ maxRound: 3 }, {})).toThrow(
			'.claude/review-loop.json の形式が不正です',
		);
		expect(() =>
			applyConfigOverrides({ reasoningEffort: 'ultra' }, {}),
		).toThrow('.claude/review-loop.json の形式が不正です');
		for (const outOfScopeFile of ['/etc/todo.md', '../todo.md', 'a/../../b.md'])
			expect(() => applyConfigOverrides({ outOfScopeFile }, {})).toThrow(
				'.. を含まない',
			);
		expect(() => applyConfigOverrides([], {})).toThrow('形式が不正です');
		expect(() => applyConfigOverrides({}, { maxRounds: 0 })).toThrow(
			'review-loop の設定が不正です',
		);
	});
});

describe('loadConfig', () => {
	test('設定ファイルが無ければ既定値、あれば重ね、壊れていれば失敗する', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'review-loop-config-'));
		try {
			expect(await loadConfig(dir)).toEqual(DEFAULT_CONFIG);
			await mkdir(join(dir, '.claude'));
			await writeFile(
				join(dir, '.claude', 'review-loop.json'),
				JSON.stringify({ lintCommand: 'yarn lint' }),
			);
			expect(await loadConfig(dir, { maxRounds: 2 })).toEqual({
				...DEFAULT_CONFIG,
				lintCommand: 'yarn lint',
				maxRounds: 2,
			});
			await writeFile(join(dir, '.claude', 'review-loop.json'), '{');
			await expect(loadConfig(dir)).rejects.toThrow('JSON として読めません');
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});

describe('resolveConventionFiles', () => {
	test('明示されていればそのまま、null ならあるものだけを既定の順で返す', async () => {
		const exists = async (path: string) => path === 'CLAUDE.md';
		expect(
			await resolveConventionFiles({ conventionFiles: null }, exists),
		).toEqual(['CLAUDE.md']);
		expect(
			await resolveConventionFiles(
				{ conventionFiles: ['docs/rules.md'] },
				exists,
			),
		).toEqual(['docs/rules.md']);
	});
});
