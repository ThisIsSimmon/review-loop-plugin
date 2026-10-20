import { describe, expect, test } from 'bun:test';
import reviewerSkill from '../../plugins/review-loop/skills/perform-code-review/SKILL.md' with {
	type: 'text',
};
import template from '../assets/reviewer-prompt.md' with { type: 'text' };
import type { ReviewFinding } from './review-result';
import {
	buildReviewerPrompt,
	interpolateTemplate,
	type PreviousRoundEntry,
	renderProjectSection,
	stripFrontmatter,
} from './reviewer-prompt';

const finding: ReviewFinding = {
	id: 'R1-1',
	severity: 'important',
	scope: 'change',
	title: '所見',
	file: 'src/a.ts',
	line_start: 1,
	line_end: 2,
	body: '本文',
	recommendation: '直す',
	evidence: 'source',
};

const base = {
	runId: '2026-10-16.183005',
	tree: 'b'.repeat(40),
	request: '# レビュー依頼: X\n\n本文\n',
	reviewerGuide: stripFrontmatter(reviewerSkill),
	conventionFiles: ['AGENTS.md'],
	lintCommand: 'npm run lint',
	testCommand: null,
};

describe('buildReviewerPrompt', () => {
	test('1 回目は全体の差分コマンドと依頼書・レビュアーの手順の本文を含み、差し込み先を残さない', () => {
		const prompt = buildReviewerPrompt(template, {
			...base,
			round: 1,
			previousTree: null,
			previousRound: [],
		});
		expect(prompt).toContain(`git diff --stat HEAD ${base.tree}`);
		expect(prompt).toContain(`git diff HEAD ${base.tree}`);
		expect(prompt).not.toContain('前回の所見への対応として入った修正');
		expect(prompt).toContain('# レビュー依頼: X');
		expect(prompt).toContain('# Perform Code Review');
		// ファイルのパスを読ませず、本文を埋め込む（frontmatter は除く）
		expect(prompt).not.toContain('SKILL.md');
		expect(prompt).not.toContain('description:');
		expect(prompt).toContain('- 規約ファイル: `AGENTS.md`。');
		expect(prompt).toContain('- lint: `npm run lint`');
		expect(prompt).toContain('1 回目のため無し');
		expect(prompt).not.toMatch(/\{\{[A-Z_]+\}\}/);
	});

	test('2 回目以降は前回のツリーからの差分と対応表を含む', () => {
		const previousRound: PreviousRoundEntry[] = [
			{ finding, disposition: 'rejected', note: '呼び出し元で検証済み' },
			{
				finding: { ...finding, id: 'R1-2' },
				disposition: 'addressed',
				note: '',
			},
		];
		const prompt = buildReviewerPrompt(template, {
			...base,
			round: 2,
			previousTree: 'a'.repeat(40),
			previousRound,
		});
		expect(prompt).toContain(`git diff ${'a'.repeat(40)} ${base.tree}`);
		expect(prompt).toContain('# レビュー依頼: X');
		expect(prompt).toContain(
			'- R1-1 [important] 所見（src/a.ts:1-2）→ 却下: 呼び出し元で検証済み',
		);
		expect(prompt).toContain(
			'- R1-2 [important] 所見（src/a.ts:1-2）→ 対応（修正）\n',
		);
		expect(prompt).not.toMatch(/\{\{[A-Z_]+\}\}/);
	});

	test('雛形に値の無い差し込み先が残っていれば失敗する', () => {
		expect(() =>
			interpolateTemplate('a {{MISSING}} b', { OTHER: 'x' }),
		).toThrow('{{MISSING}}');
	});

	test('差し込んだ値の中の {{X}} は置き換えない', () => {
		expect(interpolateTemplate('{{A}}', { A: '{{B}}', B: 'x' })).toBe(
			'{{B}}',
		);
	});
});

describe('renderProjectSection', () => {
	test('規約ファイルとコマンドが無ければ、既存のコードと規約に従うよう書く', () => {
		const text = renderProjectSection({
			conventionFiles: [],
			lintCommand: null,
			testCommand: null,
		});
		expect(text).toContain('見つからなかった');
		expect(text).toContain('- テスト: 指定なし');
	});
});

describe('stripFrontmatter', () => {
	test('先頭の frontmatter だけを除く', () => {
		expect(stripFrontmatter('---\nname: a\n---\n# 本文\n---\n')).toBe(
			'# 本文\n---',
		);
		expect(stripFrontmatter('# 本文')).toBe('# 本文');
	});
});
