import { describe, expect, test } from 'bun:test';
import {
	checkBun,
	findAllowRule,
	formatReport,
	isVersionAtLeast,
	matchesAllowRule,
} from './doctor';

describe('isVersionAtLeast', () => {
	test('数字の部分ごとに比べ、桁数の違いと接尾辞は無視する', () => {
		expect(isVersionAtLeast('1.3.0', '1.3.0')).toBe(true);
		expect(isVersionAtLeast('1.10.0', '1.3.0')).toBe(true);
		expect(isVersionAtLeast('1.2.9', '1.3.0')).toBe(false);
		expect(isVersionAtLeast('1.3', '1.3.0')).toBe(true);
		expect(isVersionAtLeast('1.4.0-canary', '1.3.0')).toBe(true);
	});

	test('checkBun は下限を下回ると NG にして更新を案内する', () => {
		expect(checkBun('1.4.2').status).toBe('ok');
		expect(checkBun('1.2.0')).toMatchObject({
			status: 'fail',
			hint: 'bun upgrade で更新する',
		});
	});
});

describe('matchesAllowRule', () => {
	const command = 'bun /Users/a/.claude/plugins/cache/review-loop/review-loop/0.2.0/dist/start-run.mjs --task x';

	test('README の規則と、Bash 全体・前方一致の書き方が当てはまる', () => {
		expect(
			matchesAllowRule(
				'Bash(bun */.claude/plugins/cache/review-loop/review-loop/*/dist/*)',
				command,
			),
		).toBe(true);
		expect(matchesAllowRule('Bash', command)).toBe(true);
		expect(matchesAllowRule('Bash(*)', command)).toBe(true);
		expect(matchesAllowRule('Bash(bun:*)', command)).toBe(true);
	});

	test('別のコマンド・別のツール・正規表現の記号は当てはまらない', () => {
		expect(
			matchesAllowRule(
				'Bash(node */.claude/plugins/cache/review-loop/review-loop/*/dist/*)',
				command,
			),
		).toBe(false);
		expect(matchesAllowRule('Read(*)', command)).toBe(false);
		expect(matchesAllowRule('Bash(bun .claude)', 'bun xclaude')).toBe(false);
	});
});

describe('findAllowRule', () => {
	test('最初に当てはまった規則とファイルを返し、その後ろも含めて読めない JSON をすべて返す', () => {
		const result = findAllowRule(
			[
				{ path: 'missing.json', text: null },
				{ path: 'broken.json', text: '{' },
				{ path: 'other.json', text: '{"permissions":{"allow":["Bash(git:*)"]}}' },
				{ path: 'ok.json', text: '{"permissions":{"allow":[1,"Bash(bun *)"]}}' },
				{ path: 'later.json', text: '{"permissions":{"allow":["Bash(*)"]}}' },
				{ path: 'later-broken.json', text: '[' },
			],
			'bun /x/dist/start-run.mjs',
		);
		expect(result).toEqual({
			match: { path: 'ok.json', rule: 'Bash(bun *)' },
			unreadable: ['broken.json', 'later-broken.json'],
		});
	});

	test('どこにも無ければ null', () => {
		expect(
			findAllowRule([{ path: 'a.json', text: '{}' }], 'bun x').match,
		).toBeNull();
	});
});

describe('formatReport', () => {
	test('状態の印・複数行の詳細・NG と注意の対処・件数を出し、OK の対処は出さない', () => {
		expect(
			formatReport([
				{ label: 'A', status: 'ok', detail: '1 行目\n2 行目', hint: '出さない' },
				{ label: 'B', status: 'fail', detail: '壊れた', hint: '直す' },
				{ label: 'C', status: 'warn', detail: '怪しい' },
			]),
		).toBe(
			[
				'review-loop doctor',
				'[OK]   A: 1 行目',
				'        2 行目',
				'[NG]   B: 壊れた',
				'        → 直す',
				'[注意] C: 怪しい',
				'',
				'結果: NG 1 件 / 注意 1 件 / OK 1 件',
			].join('\n'),
		);
	});
});
