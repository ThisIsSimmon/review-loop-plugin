import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeRunState } from '../test-support/fixtures';
import {
	buildRunId,
	ensureWorkDir,
	findActiveRuns,
	listRunStates,
	type RunState,
	readRunState,
	resolveRunState,
	runFileDisplayPath,
	runFilePath,
	STATE_FILE_NAME,
	writePausedRunState,
	writeRunState,
} from './state';

const makeState = (overrides: Partial<RunState> = {}): RunState =>
	makeRunState(overrides);

describe('buildRunId', () => {
	test('指定したタイムゾーンの日付と時刻で Run ID を作る', () => {
		// UTC では前日（10/16）の時刻。JST の日付（10/17）で作る
		const now = new Date('2026-10-16T15:45:17Z');
		expect(buildRunId(now, 'Asia/Tokyo')).toBe('2026-10-17.004517');
		expect(buildRunId(now, 'UTC')).toBe('2026-10-16.154517');
		expect(buildRunId(new Date('2026-01-02T00:00:00Z'), 'UTC')).toBe(
			'2026-01-02.000000',
		);
	});

	test('作業用ファイルは Run ごとのディレクトリに置く', () => {
		expect(runFileDisplayPath('2026-10-17.004517', '2.result.json')).toBe(
			'.tmp/review-loop/2026-10-17.004517/2.result.json',
		);
	});
});

describe('状態ファイルの読み書き', () => {
	let workDir: string;

	beforeAll(async () => {
		workDir = await mkdtemp(join(tmpdir(), 'review-loop-state-'));
	});

	afterAll(async () => {
		await rm(workDir, { recursive: true, force: true });
	});

	test('書いた状態を読み戻し、終わった Run は進行中に数えない。壊れたファイルは名前だけ報告する', async () => {
		const now = new Date('2026-10-16T10:00:00Z');
		await writeRunState(
			makeState({ runId: '2026-10-16.180000', phase: 'done' }),
			workDir,
			now,
		);
		const active = await writeRunState(
			makeState({ runId: '2026-10-16.183005', phase: 'triaging', round: 1 }),
			workDir,
			now,
		);
		const brokenPath = runFilePath(workDir, '2026-10-16.190000', STATE_FILE_NAME);
		await mkdir(join(workDir, '2026-10-16.190000'));
		await writeFile(brokenPath, '{broken', 'utf8');
		// Run ID の形でないディレクトリと、状態ファイルの無い Run は無視する
		await mkdir(join(workDir, 'other'));
		await mkdir(join(workDir, '2026-10-16.200000'));

		const listing = await listRunStates(workDir);
		expect(listing.states.map((state) => state.runId)).toEqual([
			'2026-10-16.180000',
			'2026-10-16.183005',
		]);
		expect(listing.invalid).toEqual([
			runFileDisplayPath('2026-10-16.190000', STATE_FILE_NAME),
		]);
		expect(findActiveRuns(listing.states).map((state) => state.runId)).toEqual([
			'2026-10-16.183005',
		]);
		expect(active.updatedAt).toBe(now.toISOString());
		expect(await readRunState('2026-10-16.183005', workDir)).toEqual(active);
		// 書き込みで作業用ディレクトリの .gitignore も置かれる
		expect(await readFile(join(workDir, '.gitignore'), 'utf8')).toBe('*\n');
		await expect(resolveRunState(undefined, workDir)).rejects.toThrow(
			'読めない状態ファイル',
		);
		await rm(brokenPath);
		expect(await resolveRunState(undefined, workDir)).toEqual(active);
	});

	test('状態ファイルの Run ID とディレクトリ名が違えば読めないものとして扱う', async () => {
		const dir = join(workDir, 'mismatch');
		await writeRunState(makeState({ runId: '2026-10-16.183005' }), dir);
		await mkdir(join(dir, '2026-10-16.090000'));
		await writeFile(
			runFilePath(dir, '2026-10-16.090000', STATE_FILE_NAME),
			await readFile(runFilePath(dir, '2026-10-16.183005', STATE_FILE_NAME)),
		);
		expect((await listRunStates(dir)).invalid).toEqual([
			runFileDisplayPath('2026-10-16.090000', STATE_FILE_NAME),
		]);
	});

	test('一時停止は paused だけを立て、次の書き込みで解除される', async () => {
		const paused = await writePausedRunState(
			makeState({ runId: '2026-10-16.183005', phase: 'triaging', round: 1 }),
			workDir,
		);
		expect(paused.paused).toBe(true);
		expect((await readRunState('2026-10-16.183005', workDir)).paused).toBe(
			true,
		);
		const resumed = await writeRunState(paused, workDir);
		expect(resumed.paused).toBe(false);
		expect((await readRunState('2026-10-16.183005', workDir)).paused).toBe(
			false,
		);
	});

	test('進行中の Run が無い・複数あるときは --run を求め、無い Run・形の違う ID は読めない', async () => {
		const dir = join(workDir, 'multiple');
		await expect(resolveRunState(undefined, dir)).rejects.toThrow(
			'進行中の Run がありません',
		);
		for (const runId of ['2026-10-16.183005', '2026-10-16.200000'])
			await writeRunState(makeState({ runId, phase: 'fixing', round: 1 }), dir);
		await expect(resolveRunState(undefined, dir)).rejects.toThrow(
			'進行中の Run が複数あります',
		);
		await expect(readRunState('2026-10-16.999999', dir)).rejects.toThrow(
			'状態ファイルがありません',
		);
		await expect(readRunState('../x', dir)).rejects.toThrow(
			'Run ID の形式が不正です',
		);
	});

	test('ensureWorkDir は既存の .gitignore を上書きしない', async () => {
		const dir = join(workDir, 'ignore');
		await mkdir(dir);
		await writeFile(join(dir, '.gitignore'), '*\n!keep\n');
		await ensureWorkDir(dir);
		expect(await readFile(join(dir, '.gitignore'), 'utf8')).toBe('*\n!keep\n');
	});
});
