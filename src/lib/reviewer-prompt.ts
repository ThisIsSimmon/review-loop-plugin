/**
 * Codex に渡すレビュー依頼文を `src/assets/reviewer-prompt.md` の雛形から組み立てる。
 * 文面を script が組むのは、ラウンドごとに範囲（全体 / 前回からの差分）と前回の対応表を
 * 機械的に差し込み、LLM が書く依頼書は 1 回目の「diff から読めない意図」だけに保つため。
 */
import type { Disposition } from './dispositions';
import { DISPOSITION_LABELS } from './dispositions';
import type { ReviewFinding } from './review-result';

export type PreviousRoundEntry = {
	finding: ReviewFinding;
	disposition: Disposition;
	note: string;
};

export type ReviewerPromptInput = {
	runId: string;
	round: number;
	tree: string;
	/** 2 回目以降の「前回のスナップショット」。1 回目は null */
	previousTree: string | null;
	/** write-review-request が書いた依頼書の本文 */
	request: string;
	previousRound: readonly PreviousRoundEntry[];
	/** perform-code-review スキルの本文（frontmatter を除く）。Codex にファイルを読ませず、プロンプトに埋め込む */
	reviewerGuide: string;
	/** 規約ファイル（リポジトリルートからの相対）。無ければ空配列 */
	conventionFiles: readonly string[];
	lintCommand: string | null;
	testCommand: string | null;
};

const PLACEHOLDER_PATTERN = /\{\{([A-Z_]+)\}\}/g;

/** `{{KEY}}` を values で置き換える。雛形に未知の差し込み先が残っていれば失敗させる */
export const interpolateTemplate = (
	template: string,
	values: Record<string, string>,
): string =>
	template.replace(PLACEHOLDER_PATTERN, (placeholder, key: string) => {
		const value = values[key];
		if (value === undefined) {
			throw new Error(`雛形の差し込み先に値がありません: ${placeholder}`);
		}
		return value;
	});

export const renderScopeSection = (
	input: Pick<ReviewerPromptInput, 'round' | 'tree' | 'previousTree'>,
): string => {
	if (input.previousTree === null) {
		return [
			'1 回目のレビュー。対象は作業ツリー全体の変更（未追跡ファイルを含む）。',
			`- 変更ファイル一覧: \`git diff --stat HEAD ${input.tree}\``,
			`- 変更内容: \`git diff HEAD ${input.tree}\``,
			`ツリー \`${input.tree}\` はレビュー依頼時点の作業ツリーのスナップショットで、現在の作業ツリーと同じ内容である。ファイルは直接読んでよい。`,
		].join('\n');
	}
	return [
		`${input.round} 回目のレビュー。前回の所見への対応として入った修正（差分のみ）を見る。`,
		`- 今回の差分: \`git diff ${input.previousTree} ${input.tree}\`（前回レビュー時のスナップショットから今回まで）`,
		`- 全体の変更（文脈の理解用）: \`git diff HEAD ${input.tree}\``,
		'今回の所見は、今回の差分と、その差分が壊した箇所に限る。前回却下された所見は、却下理由に反論できる根拠がある場合だけ再提起する。前回「対応（修正）」とされた所見は、差分で本当に直っているかを確かめ、直っていなければ再提起する。',
	].join('\n');
};

export const renderProjectSection = (
	input: Pick<
		ReviewerPromptInput,
		'conventionFiles' | 'lintCommand' | 'testCommand'
	>,
): string => {
	const lines =
		input.conventionFiles.length === 0
			? [
					'- 規約ファイル（AGENTS.md・CLAUDE.md など）は見つからなかった。既存のコードの書き方を規約とみなす。',
				]
			: [
					`- 規約ファイル: ${input.conventionFiles.map((path) => `\`${path}\``).join('、')}。最初に読み、照らし合わせる（そこから参照されている文書も必要に応じて読む）。`,
				];
	lines.push(
		`- lint: ${input.lintCommand === null ? '指定なし（規約ファイルに書かれていればそれに従う）' : `\`${input.lintCommand}\``}`,
		`- テスト: ${input.testCommand === null ? '指定なし（規約ファイルに書かれていればそれに従う）' : `\`${input.testCommand}\``}`,
	);
	return lines.join('\n');
};

/** SKILL.md の先頭の YAML frontmatter を除いた本文 */
export const stripFrontmatter = (markdown: string): string =>
	markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();

export const renderPreviousRoundSection = (
	entries: readonly PreviousRoundEntry[],
): string => {
	if (entries.length === 0) {
		return '前回の所見はありません。';
	}
	return entries
		.map(({ finding, disposition, note }) => {
			const location = `${finding.file}:${finding.line_start}-${finding.line_end}`;
			const noteText = note.trim() === '' ? '' : `: ${note.trim()}`;
			return `- ${finding.id} [${finding.severity}] ${finding.title}（${location}）→ ${DISPOSITION_LABELS[disposition]}${noteText}`;
		})
		.join('\n');
};

export const buildReviewerPrompt = (
	template: string,
	input: ReviewerPromptInput,
): string =>
	interpolateTemplate(template, {
		RUN_ID: input.runId,
		ROUND: String(input.round),
		REVIEWER_GUIDE: input.reviewerGuide.trim(),
		PROJECT: renderProjectSection(input),
		SCOPE: renderScopeSection(input),
		REQUEST: input.request.trim(),
		PREVIOUS:
			input.previousTree === null
				? '1 回目のため無し。'
				: renderPreviousRoundSection(input.previousRound),
	});
