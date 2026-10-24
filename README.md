# review-loop

Claude Code が実装し、Codex CLI がレビューし、Claude Code が所見を精査して直す、という往復を、対応すべき指摘が無くなるまで自動で続ける Claude Code プラグイン。最後にコミットメッセージを書き、確認を取ってコミットする（設定で自動コミットにもできる）。Stop フックで、ループの途中で Claude がターンを終えないようにする。

このリポジトリ自体が Claude Code のマーケットプレイスになっている（[openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc) と同じ形）。文書・出力はすべて日本語。

## 含まれるもの

| 種類 | 名前 | 内容 |
| --- | --- | --- |
| スキル | `review-loop:review-loop` | ループ全体の手順。`/review-loop:review-loop <依頼>` か「レビューループで〜」で使う |
| スキル | `review-loop:write-review-request` | 変更の意図・検証状況をまとめたレビュー依頼書を書く。単体でも使える |
| スキル | `review-loop:perform-code-review` | レビュアー側の手順・観点・重大度。review-loop では本文が Codex へのレビュー依頼に埋め込まれる。単体でも使える |
| スキル | `review-loop:doctor` | 導入の診断（Bun・Codex・git・設定・権限の allow・lint とテスト・残った Run）と試運転の案内。`/review-loop:doctor` で使う |
| フック | Stop | Run が途中のままターンを終えようとしたら、次の工程を示して続行させる |
| script | `dist/*.mjs` | 工程の進行・スナップショット・Codex の呼び出し・対応表の検証・コミット。Bun で動く 1 ファイルずつの ESM（依存も同梱） |

## 前提

- [Bun](https://bun.sh) 1.3 以上（`bun` が PATH にあること。Stop フックも `bun` で動く）
- [Codex CLI](https://github.com/openai/codex)（`codex` が PATH にあり、`codex login` 済み）
- git リポジトリの中で使う

Node.js や `node_modules` は利用先には要らない。

## 導入

### 1. マーケットプレイスの追加とインストール

Claude Code の中で:

```text
/plugin marketplace add ThisIsSimmon/review-loop-plugin
/plugin install review-loop@review-loop
```

端末からなら:

```bash
claude plugin marketplace add ThisIsSimmon/review-loop-plugin
```

```bash
claude plugin install review-loop@review-loop
```

プロジェクトごとに入れたいときは `--scope project`（`.claude/settings.json` に「このプロジェクトで有効」と書かれ、リポジトリで共有される。本体は各自のインストールが要る。[チームの人がクローンしたとき](#チームの人がクローンしたとき)）か `--scope local` を付ける。インストール後は Claude Code を再起動するか `/reload-plugins` を実行する。

### 2. 権限の allow（各プロジェクト）

プラグインからは権限の設定を配れない（プラグインの `settings.json` で効くのは `agent` と `subagentStatusLine` だけ）。スキルの `allowed-tools` で script の実行は許可しているが、それが効くのはスキルを呼んだターンの間だけなので、ループの途中で確認が出ないよう、プロジェクトの `.claude/settings.json`（個人用なら `.claude/settings.local.json`）に次を足す。

```json
{
	"permissions": {
		"allow": [
			"Bash(bun */.claude/plugins/cache/review-loop/review-loop/*/dist/*)"
		]
	}
}
```

script はプラグインのキャッシュ（`~/.claude/plugins/cache/review-loop/review-loop/<バージョン>/dist/`）に置かれる。バージョンが変わってもそのまま効くよう、パスの一部を `*` にしている。テストや lint のコマンドも往復のたびに実行されるので、必要ならそれらも allow に足す。

### 3. `.gitignore`（任意）

作業用ファイルは `.tmp/review-loop/<Run ID>/` に置かれ、`.tmp/review-loop/.gitignore`（中身は `*`）が自動で作られるので、そのままでもスナップショットとコミットには入らない。プロジェクトの `.gitignore` で `.tmp/` をまとめて無視しておいてもよい。

`.claude/settings.local.json` を git で管理していないなら、それも `.gitignore` に入れておく（入っていないと、未追跡のファイルとしてレビューとコミットの対象になる）。

### 4. 設定ファイル（任意）

プラグイン本体はキャッシュに置かれて書き換えられないので、プロジェクトごとの値はリポジトリの `.claude/review-loop.json` に置く。項目はすべて任意で、知らない項目はエラーになる。

```json
{
	"model": null,
	"reasoningEffort": "high",
	"maxRounds": 5,
	"autoCommit": false,
	"timeoutMinutes": 30,
	"conventionFiles": ["AGENTS.md", "docs/coding-rules.md"],
	"outOfScopeFile": "docs/out-of-scope-todo.md",
	"lintCommand": "yarn lint",
	"testCommand": "yarn test",
	"checkPushAfterCommit": false
}
```

| 項目 | 既定値 | 意味 |
| --- | --- | --- |
| `model` | `null` | Codex のモデル。`null` は `~/.codex/config.toml` の既定 |
| `reasoningEffort` | `null` | `none` / `minimal` / `low` / `medium` / `high` / `xhigh`。`null` は Codex の既定 |
| `maxRounds` | `5` | Codex へ出すレビューの回数の上限。達したら止めて判断を仰ぐ |
| `autoCommit` | `false` | `true` なら確認を挟まずにコミットする |
| `timeoutMinutes` | `30` | 1 回のレビューの打ち切り時間 |
| `conventionFiles` | `null` | 実装側とレビュアーが従う規約ファイル。`null` は `AGENTS.md`・`CLAUDE.md`・`.claude/CLAUDE.md` のうち、あるもの |
| `outOfScopeFile` | `"docs/out-of-scope-todo.md"` | 範囲外の問題の記録先。無ければ最初の記録のときに雛形から作られる |
| `lintCommand` / `testCommand` | `null` | 実装と修正のあとに通すコマンド。`null` は規約ファイルの決まりに従う。Codex への依頼文にも載る |
| `checkPushAfterCommit` | `false` | `true` ならコミット後に upstream が HEAD と一致するか（post-commit フックなどで push されたか）を報告する |

`model`・`reasoningEffort`・`maxRounds`・`autoCommit`・`timeoutMinutes` は、依頼文の `--model` などで Run ごとに上書きできる。設定は Run の開始時に読み、状態ファイルに保存するので、途中で設定ファイルを書き換えても進行中の Run には効かない。

範囲外の記録先は、1 件 1 行の Markdown の表で、`| OOS-<連番> |` で始まる行の「発見元」の欄に `review-loop <Run ID> <所見 ID>` を書く形（雛形に記入の決まりがある）。この形の行があれば、既存のファイルもそのまま使える。

### 5. 診断と試運転

```text
/review-loop:doctor
```

Bun のバージョン・Codex CLI とログイン・git（HEAD があるか）・設定ファイル・権限の allow・lint とテストのコマンド・残った Run を確かめ、`[OK]` / `[注意]` / `[NG]` で一覧にする（Codex にレビューは出さない）。`--run-commands` を付けると `lintCommand`・`testCommand` を実際に実行して確かめる。script を直接 `bun <dist の場所>/doctor.mjs` で実行してもよく、NG があれば終了コード 1。

Stop フックが効くか、ループの途中で権限の確認が出ないかは、Claude Code の中で回さないと確かめられない。NG が無ければ、doctor スキルが使い捨てのリポジトリでの試運転（`--effort low --max-rounds 2`）を案内する。

### チームの人がクローンしたとき

`--scope project` で入れたリポジトリには、`.claude/settings.json` の `enabledPlugins`（`"review-loop@review-loop": true`）と、手順 2〜4 の allow・`.gitignore`・`.claude/review-loop.json` が入っている。ただしプラグイン本体は入っておらず、クローンしただけでは使えない（有効の設定はあるが、本体が各自の `~/.claude/plugins/cache/` に無い）。クローンした人がやるのは次の 3 つだけ。

1. 「前提」の Bun と Codex CLI を入れ、`codex login` する
2. マーケットプレイスを追加し（各自のユーザー設定に入る）、そのリポジトリのディレクトリで project スコープでインストールする

   ```bash
   claude plugin marketplace add ThisIsSimmon/review-loop-plugin
   ```

   ```bash
   claude plugin install review-loop@review-loop --scope project
   ```

   Claude Code v2.1.292 以上なら、`claude plugin install review-loop --marketplace ThisIsSimmon/review-loop-plugin --scope project` の 1 つで両方を済ませられる。
3. Claude Code を再起動し、`/review-loop:doctor` で確かめる

手順 2〜4 の設定はリポジトリから届くので、やり直さなくてよい。リポジトリを最初に信頼する（ワークスペースの信頼ダイアログに答える）までは、プロジェクトの設定にあるプラグインは読み込まれない。

### 更新

新しいバージョンが出たら、端末で次の 2 つを実行する（Claude Code の中の `/plugin` は引数を付けても設定画面が開くだけ）。まずマーケットプレイスの写しを最新にする。これはどのディレクトリで実行しても同じ。

```bash
claude plugin marketplace update review-loop
```

次にプラグインを入れ替える。`--scope` は入れたときと同じにし、`project` / `local` で入れたなら、入れたプロジェクトのディレクトリで実行する（既定は `user`）。

```bash
claude plugin update review-loop@review-loop --scope project
```

実行したら Claude Code を再起動する。どのスコープで・どのプロジェクトに入れたかは `claude plugin list`（プロジェクトのパスまで見るなら `~/.claude/plugins/installed_plugins.json`）で分かる。設定画面から更新する場合も、マーケットプレイス → プラグインの順に更新する。

プラグイン本体はスコープに関係なく `~/.claude/plugins/cache/review-loop/review-loop/<バージョン>/` に置かれ、スコープで変わるのはどこで有効になるかだけ。更新のあとは `/review-loop:doctor` で動くかを確かめる。

## 使い方

```text
/review-loop:review-loop calc.js に割り算の関数を足して。0 で割ったら RangeError
```

「レビューループで〜を実装して」のように頼んでもよい。流れは次のとおり。

1. `start-run` が Run を始める（`.tmp/review-loop/<Run ID>/state.json`）
2. Claude が実装し、テストと lint を通す
3. `write-review-request` で依頼書を書く（1 回目だけ）
4. `request-review` が作業ツリーをスナップショットし、Codex（`codex exec -s read-only`）にレビューさせる。2 回目以降は前回のスナップショットからの差分と前回の対応表を渡す
5. Claude が所見を現物で確かめ、対応（addressed）・却下（rejected）・範囲外（out_of_scope）の対応表を書く。`record-dispositions` が検証する
6. addressed があれば直して 4 へ戻る。無ければ 7 へ
7. コミットメッセージを書き、`finish-run` がレビュー済みの内容と作業ツリーが同じことを確かめて確認待ちにする。承認後にコミットする

詳しい手順は [skills/review-loop/SKILL.md](plugins/review-loop/skills/review-loop/SKILL.md)。

## 自作スキルだけを他のエージェントで使う

`write-review-request` と `perform-code-review` は特定のプロジェクトに依存しない書き方にしてあり、[skills CLI](https://github.com/vercel-labs/skills) で単体でも取り込める（Claude Code 以外のエージェントでも使える）。

```bash
npx skills add ThisIsSimmon/review-loop-plugin --skill write-review-request
```

```bash
npx skills add ThisIsSimmon/review-loop-plugin --skill perform-code-review
```

`review-loop` スキルはプラグインの script と Stop フックを前提にしているので、単体では取り込まない。

## 前提にした Claude Code の仕様

[公式ドキュメント](https://code.claude.com/docs/en/plugins)（plugins / plugin marketplaces / plugins reference / hooks / skills の節）で確かめた内容（2026-10-20 時点）。

- **マーケットプレイス**: `.claude-plugin/marketplace.json` に `name`・`owner.name`・`plugins[]`（各 `name` と `source`）を書く。`source` はマーケットプレイスのルートからの相対パス（`..` は使えない）。このリポジトリは `./plugins/review-loop` を指す。
- **プラグイン**: `.claude-plugin/plugin.json` の必須項目は `name` だけ。`skills/<名前>/SKILL.md` と `hooks/hooks.json` は既定の場所なのでマニフェストに書かなくても読まれる。`version` を書くと、そのバージョンでキャッシュされる（更新を配るには上げる）。
- **スキルの名前空間**: プラグインのスキルは `<プラグイン名>:<スキル名>` で呼ばれる（例 `/review-loop:write-review-request`）。手順の中から別のスキルを呼ぶときもこの名前を使う。
- **フック**: `hooks/hooks.json` は `{"hooks": {"Stop": [...]}}` の形。コマンドの中で `${CLAUDE_PLUGIN_ROOT}`（プラグインの置き場所）が使える。Stop フックは標準入力の JSON（`session_id`・`cwd`・`stop_hook_active`・`background_tasks` など）を受け取り、標準出力に `{"decision":"block","reason":"..."}` を出すとターンの終了を止めて続行させる。
- **スキル本文の変数**: `${CLAUDE_PLUGIN_ROOT}`・`${CLAUDE_SKILL_DIR}` はスキル本文と `allowed-tools` の Bash 規則の中で置き換えられる（Bash の環境変数としては渡らない）。
- **権限**: プラグインから `permissions` は配れない。スキルの `allowed-tools` はそのターンの間だけ効く。

## 開発

開発にも Bun を使う（テストは `bun:test`、ビルドは `Bun.build`）。配布物の `plugins/review-loop/dist/` はビルドしてコミットする。

```bash
bun install
```

```bash
bun run check
```

`check` は `plugin.json` と `marketplace.json` の `version` が一致しているかを確かめたうえで型検査・テスト・ビルドを行い、ビルド結果がコミット済みの `dist/` と同じことまで確かめる。ソースは `src/`（`bin/` が各 script の入口、`commands/` が各コマンド、`lib/` が共通部分）、Codex に渡す文面とスキーマは `src/assets/`。`src/e2e.test.ts` はビルド済みの `dist/` を Bun で実行し、偽の `codex` で 1 往復を通す。

手元のリポジトリをマーケットプレイスとして試すには:

```bash
claude plugin marketplace add /path/to/review-loop-plugin --scope local
```

```bash
claude plugin install review-loop@review-loop --scope local
```

`plugin.json` と `marketplace.json` の `version` を上げないと、インストール済みの環境には更新が届かない。

## ライセンス

[MIT](LICENSE)
