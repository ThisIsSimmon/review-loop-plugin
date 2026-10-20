/**
 * review-loop の設定。プラグイン本体はプラグインのキャッシュに置かれて書き換えられないので、
 * プロジェクトごとの値はリポジトリの `.claude/review-loop.json` に置く（無ければ既定値）。
 * Run の開始時に、設定ファイル → start-run の引数の順に重ねて検証し、Run の状態ファイルに保存する
 * （途中で設定ファイルを書き換えても、進行中の Run の挙動は変わらない）。
 */
import { join } from 'node:path';
import * as v from 'valibot';
import { readTextIfExists } from './fs';
import { errorMessage, formatIssues } from './util';

/** リポジトリルートからの相対パス */
export const PROJECT_CONFIG_PATH = '.claude/review-loop.json';

export const REASONING_EFFORTS = [
	'none',
	'minimal',
	'low',
	'medium',
	'high',
	'xhigh',
] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

/** conventionFiles が null のとき、リポジトリにあれば規約として読ませるファイル */
export const DEFAULT_CONVENTION_FILES = [
	'AGENTS.md',
	'CLAUDE.md',
	'.claude/CLAUDE.md',
] as const;

/** リポジトリ内の相対パス（絶対パスと `..` を含むパスは拒否する） */
const RepoRelativePathSchema = v.pipe(
	v.string(),
	v.minLength(1),
	v.check(
		(path) =>
			!path.startsWith('/') &&
			!/^[A-Za-z]:[\\/]/.test(path) &&
			!path.split(/[\\/]/).includes('..'),
		'リポジトリルートからの相対パスで、.. を含まない形にしてください',
	),
);

const NonEmptyStringSchema = v.pipe(v.string(), v.minLength(1));

export const ReviewLoopConfigSchema = v.object({
	/** Codex のモデル。null なら `~/.codex/config.toml` の既定 */
	model: v.nullable(NonEmptyStringSchema),
	/** 推論の強さ。null なら Codex の既定 */
	reasoningEffort: v.nullable(v.picklist(REASONING_EFFORTS)),
	/** Codex へ出すレビューの回数の上限。達したら止めて依頼者の判断を仰ぐ */
	maxRounds: v.pipe(v.number(), v.integer(), v.minValue(1)),
	/** true なら finish-run が確認を挟まずにコミットする */
	autoCommit: v.boolean(),
	/** 1 回のレビューの打ち切り時間 */
	timeoutMinutes: v.pipe(v.number(), v.integer(), v.minValue(1)),
	/** 実装側とレビュアーが従う規約ファイル。null なら DEFAULT_CONVENTION_FILES のうち、あるものを使う */
	conventionFiles: v.nullable(v.array(RepoRelativePathSchema)),
	/** 範囲外の問題の記録先。無ければ record-dispositions が雛形から作る */
	outOfScopeFile: RepoRelativePathSchema,
	/** 実装と修正のあとに通す lint のコマンド。null ならプロジェクトの規約に従う */
	lintCommand: v.nullable(NonEmptyStringSchema),
	/** 実装と修正のあとに通すテストのコマンド。null ならプロジェクトの規約に従う */
	testCommand: v.nullable(NonEmptyStringSchema),
	/** true ならコミット後に upstream が HEAD と一致するか（post-commit フックの push が済んだか）を確かめて報告する */
	checkPushAfterCommit: v.boolean(),
});
export type ReviewLoopConfig = v.InferOutput<typeof ReviewLoopConfigSchema>;

export const DEFAULT_CONFIG: ReviewLoopConfig = {
	model: null,
	reasoningEffort: null,
	maxRounds: 5,
	autoCommit: false,
	timeoutMinutes: 30,
	conventionFiles: null,
	outOfScopeFile: 'docs/out-of-scope-todo.md',
	lintCommand: null,
	testCommand: null,
	checkPushAfterCommit: false,
};

/** 設定ファイルの形。項目はすべて任意で、知らない項目は書き間違いとして拒否する */
export const ProjectConfigFileSchema = v.strictObject({
	$schema: v.optional(v.string()),
	...v.partial(ReviewLoopConfigSchema).entries,
});

export type ConfigOverrides = Partial<ReviewLoopConfig>;

/** 既定値に設定ファイルの値と CLI の上書きを重ねて検証する。undefined の上書きは無視する */
export const applyConfigOverrides = (
	fileConfig: unknown,
	overrides: ConfigOverrides,
): ReviewLoopConfig => {
	const parsedFile = v.safeParse(ProjectConfigFileSchema, fileConfig);
	// valibot の object は配列も受け付けるので、JSON のオブジェクトであることは別に確かめる
	if (!parsedFile.success || Array.isArray(fileConfig)) {
		throw new Error(
			`${PROJECT_CONFIG_PATH} の形式が不正です: ${parsedFile.success ? 'JSON のオブジェクトにしてください' : formatIssues(parsedFile.issues)}`,
		);
	}
	const { $schema: _, ...fromFile } = parsedFile.output;
	const defined = Object.fromEntries(
		Object.entries(overrides).filter(([, value]) => value !== undefined),
	);
	const result = v.safeParse(ReviewLoopConfigSchema, {
		...DEFAULT_CONFIG,
		...fromFile,
		...defined,
	});
	if (!result.success) {
		throw new Error(
			`review-loop の設定が不正です: ${formatIssues(result.issues)}`,
		);
	}
	return result.output;
};

export const loadConfig = async (
	repoRoot: string,
	overrides: ConfigOverrides = {},
): Promise<ReviewLoopConfig> => {
	const text = await readTextIfExists(join(repoRoot, PROJECT_CONFIG_PATH));
	let data: unknown = {};
	if (text !== null) {
		try {
			data = JSON.parse(text);
		} catch (error) {
			throw new Error(
				`${PROJECT_CONFIG_PATH} を JSON として読めません: ${errorMessage(error)}`,
			);
		}
	}
	return applyConfigOverrides(data, overrides);
};

/** 規約ファイルの一覧。明示されていればそのまま、null ならリポジトリにある既定の候補 */
export const resolveConventionFiles = async (
	config: Pick<ReviewLoopConfig, 'conventionFiles'>,
	exists: (path: string) => Promise<boolean>,
): Promise<string[]> => {
	if (config.conventionFiles !== null) return [...config.conventionFiles];
	const found: string[] = [];
	for (const path of DEFAULT_CONVENTION_FILES) {
		if (await exists(path)) found.push(path);
	}
	return found;
};

/** 依頼者・LLM に見せる設定の要約 */
export const describeConfig = (config: ReviewLoopConfig): string[] => [
	`- 設定: モデル ${config.model ?? 'Codex 既定'} / effort ${config.reasoningEffort ?? 'Codex 既定'} / 最大 ${config.maxRounds} ラウンド / autoCommit ${config.autoCommit} / 打ち切り ${config.timeoutMinutes} 分`,
	`- lint: ${config.lintCommand ?? '未設定（規約ファイルに従う）'} / テスト: ${config.testCommand ?? '未設定（規約ファイルに従う）'}`,
	`- 範囲外の記録先: ${config.outOfScopeFile}`,
];
