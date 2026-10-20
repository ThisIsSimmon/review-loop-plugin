/**
 * Codex CLI（`codex exec`）の起動。`codex review` は対象の指定とカスタム指示を同時に受け付けず、
 * 出力形式の指示にも従わなかった（2026-10-16 実測）ので、`codex exec` に `--output-schema` で
 * 最終応答の形を固定させる。プロンプトは引数の長さ制限を避けて stdin（`-`）で渡す。
 * 利用者の `~/.codex/config.toml` の sandbox_mode に関係なく、レビューでは必ず
 * `-s read-only` を付ける。`--ephemeral` でセッションを保存せず、Codex アプリの一覧に残さない。
 */
import { type ProcessResult, runProcess } from './process';

export type CodexExecArgsInput = {
	repoRoot: string;
	model: string | null;
	reasoningEffort: string | null;
	schemaPath: string;
	outputPath: string;
};

export const buildCodexExecArgs = (input: CodexExecArgsInput): string[] => [
	'exec',
	'--ephemeral',
	'-s',
	'read-only',
	'-C',
	input.repoRoot,
	...(input.model === null ? [] : ['-m', input.model]),
	...(input.reasoningEffort === null
		? []
		: ['-c', `model_reasoning_effort="${input.reasoningEffort}"`]),
	'--output-schema',
	input.schemaPath,
	'-o',
	input.outputPath,
	'-',
];

export type CodexExecOptions = {
	cwd: string;
	timeoutMs: number;
	/** 起動直後に pid を受け取る（状態ファイルに記録して、再実行時の生存確認に使う）。失敗したら子プロセスを止める */
	onSpawn?: (pid: number) => Promise<void>;
};

/** `codex` が見つからないなど起動に失敗したら reject する */
export const runCodexExec = (
	args: readonly string[],
	prompt: string,
	options: CodexExecOptions,
): Promise<ProcessResult> =>
	runProcess('codex', args, {
		cwd: options.cwd,
		input: prompt,
		timeoutMs: options.timeoutMs,
		onSpawn: options.onSpawn,
	});
