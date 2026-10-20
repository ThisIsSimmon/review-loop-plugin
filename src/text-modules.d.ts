// `import x from './a.md' with { type: 'text' }` の型。Bun の実行時とバンドル時に文字列として埋め込まれる
declare module '*.md' {
	const content: string;
	export default content;
}
