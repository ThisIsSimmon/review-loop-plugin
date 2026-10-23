---
name: doctor
description: review-loop を回す前提（Bun・Codex CLI とログイン・git・.claude/review-loop.json・権限の allow・lint とテストのコマンド・残った Run）を診断し、直し方と試運転の手順を示す。「review-loop の導入を確認して」「doctor」などの依頼と /review-loop:doctor で使う。
argument-hint: "[--run-commands]"
allowed-tools: Bash(bun ${CLAUDE_PLUGIN_ROOT}/dist/doctor.mjs*)
---

# review-loop doctor

review-loop をこのリポジトリで回せるかを確かめる。確かめるのは script で、このスキルを読む側（LLM）は結果を読んで直し方を伝える。Codex にレビューは出さない。

## 手順

1. 対象のリポジトリの中で次を実行する。依頼に `--run-commands` があれば付ける（`lintCommand`・`testCommand` を実際に実行して確かめる。時間がかかるので、付けるのは依頼されたときだけ）。

   ```bash
   bun ${CLAUDE_PLUGIN_ROOT}/dist/doctor.mjs [--run-commands]
   ```

   一覧が出ずに失敗したら、script を動かす Bun が使えていない。
   - `bun: command not found` など: Bun が入っていないか PATH に無い。`curl -fsSL https://bun.sh/install | bash`（Homebrew なら `brew install oven-sh/bun/bun`）で入れ、シェルを開き直してから Claude Code を再起動するよう伝える。入っているのに見つからないなら、`~/.bun/bin` が PATH にあるかを確かめてもらう。
   - 構文や API のエラー: Bun が古い。`bun upgrade` を案内する（1.3 以上が必要）。
   - どちらの場合も、他の項目は確かめられていないので、直したらもう一度 doctor を実行するよう伝える。

2. 結果をそのまま見せ、`[NG]` と `[注意]` の項目ごとに、`→` の対処を具体的な手順にして伝える。
   - `[NG]` は直さないと Run が始められないか、途中で止まるもの。`[注意]` は回るが手間が増えるもの（例: allow が無いとループの途中で権限の確認が出る）。
   - 設定ファイル（`.claude/review-loop.json`・`.claude/settings*.json`）の書き換えは、依頼者が頼んだときだけ行う。
   - `--run-commands` を付けずに実行し、lint やテストのコマンドが設定されていれば、実行して確かめるかを尋ねてよい。

3. `[NG]` が 0 件なら、doctor では確かめられないこと（Stop フックが効くか・ループの途中で権限の確認が出ないか・手順どおりに一周するか）を確かめる試運転を案内する。使い捨てのリポジトリで、Codex の負担を軽くして回す。

   ```bash
   mkdir -p /tmp/rl-try && cd /tmp/rl-try && git init && echo 'export const add = (a, b) => a + b;' > calc.js && git add -A && git commit -m init
   ```

   そのディレクトリで Claude Code を起動し、次を頼む。

   ```text
   /review-loop:review-loop calc.js に割り算の関数を足して。0 で割ったら RangeError --effort low --max-rounds 2
   ```

   コミットの確認待ちまで、依頼者が「続けて」と言わずに進めば成功。
