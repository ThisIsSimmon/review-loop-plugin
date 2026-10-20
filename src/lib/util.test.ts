import { describe, expect, test } from 'bun:test';
import { parseReasoningEffort } from './state';
import {
	parseBooleanValue,
	parseFlags,
	parsePositiveInteger,
	scriptCommand,
} from './util';

describe('parseFlags', () => {
	const usage = 'usage';
	const spec = { valueFlags: ['--run'], switchFlags: ['--commit'], usage };

	test('値付きの引数とスイッチを分ける', () => {
		const parsed = parseFlags(['--run', 'x', '--commit'], spec);
		expect(parsed.values.get('--run')).toBe('x');
		expect(parsed.switches.has('--commit')).toBe(true);
	});

	test.each([
		[['--unknown', 'x']],
		[['--run']],
		[['--run', '--commit']],
		[['--run', 'a', '--run', 'b']],
		[['--commit', '--commit']],
	])('%j は使い方のエラーにする', (args) => {
		expect(() => parseFlags(args, spec)).toThrow(usage);
	});

	test('整数・真偽値・effort の値を検証する', () => {
		expect(parsePositiveInteger('3', '--max-rounds')).toBe(3);
		expect(parsePositiveInteger('1', '--max-rounds')).toBe(1);
		expect(parsePositiveInteger(undefined, '--max-rounds')).toBeUndefined();
		for (const value of ['0', '1.5', 'abc'])
			expect(() => parsePositiveInteger(value, '--max-rounds')).toThrow(
				'1 以上の整数',
			);
		expect(parseBooleanValue('true', '--auto-commit')).toBe(true);
		expect(parseBooleanValue('false', '--auto-commit')).toBe(false);
		expect(() => parseBooleanValue('yes', '--auto-commit')).toThrow(
			'true か false',
		);
		expect(parseReasoningEffort('high')).toBe('high');
		expect(parseReasoningEffort(undefined)).toBeUndefined();
		expect(() => parseReasoningEffort('max')).toThrow('--effort は');
	});
});

describe('scriptCommand', () => {
	test('dist の外から呼ばれたときはプラグインのルートを変数のまま示し、引用符で囲む', () => {
		expect(scriptCommand('start-run')).toBe(
			"node '${CLAUDE_PLUGIN_ROOT}/dist/start-run.mjs'",
		);
	});
});
