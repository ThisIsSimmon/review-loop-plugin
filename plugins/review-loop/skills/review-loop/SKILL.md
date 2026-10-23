---
name: review-loop
description: 実装の完了後に、依頼書の作成 → Codex によるレビュー → 所見の精査と修正 → 差分のみの再レビューを、対応すべき指摘が無くなるまで往復させ、コミットメッセージの作成とコミットの確認（設定により自動コミット）まで行う。「レビューループで」「Codex とレビューを往復して」などの依頼と /review-loop で使う。レビュー 1 回だけの依頼には使わない。
argument-hint: "[--auto-commit] [--model <model>] [--effort <effort>] <実装依頼または対象の説明>"
allowed-tools: Bash(bun ${CLAUDE_PLUGIN_ROOT}/dist/*)
---

# Review Loop

実装 → Codex レビュー → 精査・修正 → 再レビューの往復を、人が毎回指示しなくても終わるようにする。工程の進行・レビュー範囲の固定・Codex の呼び出し・対応表の検証・コミットは `${CLAUDE_PLUGIN_ROOT}/dist/` の script が行い、このスキルを読む側（LLM）が行うのは実装、依頼書と対応表の文章、所見の技術的な精査、コミットメッセージの文章だけにする。

## 登場するもの

| もの | 役割 |
| --- | --- |
| `start-run.mjs` | Run の開始。`.tmp/review-loop/<Run ID>/state.json` を作る |
| `review-loop:write-review-request` スキル | 1 回目の依頼書（diff から読めない意図・検証状況）を `--out` でファイルに書く |
| `request-review.mjs` | 作業ツリーをスナップショットし、依頼書と前回の対応表を添えて Codex（`codex exec`、読み取り専用）にレビューさせ、所見を `R<ラウンド>-<番号>` の ID 付きで返す |
| `review-loop:perform-code-review` スキル | Codex が従うレビュアー側の手順・観点・重大度。本文が Codex へのレビュー依頼に埋め込まれる（このスキルを自分で呼ぶ必要はない） |
| `record-dispositions.mjs` | 対応表（addressed / rejected / out_of_scope）を検証し、次の工程を決める |
| `finish-run.mjs` | レビュー済みの内容と作業ツリーが同じことを確かめ、確認待ちにするかコミットする |
| `pause-run.mjs` | 依頼者へ質問するために一時停止する（Stop フックが止めるのを許す） |
| `stop-guard.mjs` | プラグインの Stop フック。Run が途中のままターンを終えようとしたら、次の工程を示して続行させる |
| `cleanup-run-files.mjs` | 終わった Run の作業用ファイルを消す |

作業用ファイル（状態・依頼書・プロンプト・結果・対応表・ログ・コミットメッセージ）は `.tmp/review-loop/<Run ID>/` に置かれる。`.tmp/review-loop/.gitignore` が自動で置かれるので、スナップショットとコミットには入らない。

## 設定

リポジトリの `.claude/review-loop.json` に置く（無ければ既定値。項目はすべて任意）。`start-run.mjs` の出力に、この Run で使う値が出る。

| 項目 | 既定値 | 意味 |
| --- | --- | --- |
| `model` / `reasoningEffort` | `null` | Codex のモデルと effort。`null` は Codex の既定 |
| `maxRounds` | `5` | Codex へ出すレビューの回数の上限 |
| `autoCommit` | `false` | `true` なら確認を挟まずにコミットする |
| `timeoutMinutes` | `30` | 1 回のレビューの打ち切り時間 |
| `conventionFiles` | `null` | 規約ファイル。`null` は `AGENTS.md`・`CLAUDE.md`・`.claude/CLAUDE.md` のうち、あるもの |
| `outOfScopeFile` | `docs/out-of-scope-todo.md` | 範囲外の問題の記録先。無ければ雛形から作られる |
| `lintCommand` / `testCommand` | `null` | 実装と修正のあとに通すコマンド。`null` は規約ファイルの決まりに従う |
| `checkPushAfterCommit` | `false` | `true` ならコミット後に upstream が HEAD と一致するか（post-commit フックで push されたか）を報告する |

## 手順

### 0. 開始

```bash
bun ${CLAUDE_PLUGIN_ROOT}/dist/start-run.mjs --task "<依頼の一言要約>"
```

- 出力の Run ID（`YYYY-MM-DD.HHmmss`）を以降の `--run` に使う。進行中の Run が 1 つだけなら `--run` は省略できる。
- 開始時点の未コミット変更が警告されたら、それもレビューとコミットに含まれる。依頼と無関係なら依頼者に確認してから進む。
- 依頼文で `--auto-commit`・`--model`・`--effort` が指定されたら、同名の引数（`--auto-commit true` など）で渡す。`--max-rounds <n>`・`--timeout-minutes <n>` も渡せる。
- script の出力にある次の工程のコマンドは、実際のパスに展開されている。以降はそれをそのまま使ってよい。

### 1. 実装

依頼どおり実装し、規約ファイルに従う。影響するテストと lint（設定の `testCommand`・`lintCommand`。無ければ規約ファイルの決まり）を通す。ステージ（`git add`）はしない。レビュー範囲は script がスナップショットで固定するので、ステージ状態で範囲を表す必要はない。

### 2. 依頼書（1 回目だけ）

`review-loop:write-review-request` スキルを引数 `--out .tmp/review-loop/<run>/1.request.md` で実行する。依頼書は Codex に毎ラウンド渡される。

### 3. レビュー依頼

```bash
bun ${CLAUDE_PLUGIN_ROOT}/dist/request-review.mjs --run <run>
```

- Codex のレビューは数分以上かかることがあるので、バックグラウンドで実行して完了通知を待つ。待つ間に作業ツリーを変えない（レビュー済みの内容と食い違う）。
- 2 回目以降も同じコマンド。script が「前回のスナップショットからの差分のみ」と前回の対応表を Codex に渡す。
- 失敗（タイムアウト・Codex のエラー・応答の形式不正）は工程 `review_failed` になり、出力にログの場所が出る。原因を見て、同じコマンドで再実行するか、依頼者に報告する。原因を見ずに再実行しない。

### 4. 所見の精査

出力された所見を 1 件ずつ、現物（コード・`git diff`・テストの実行）に当たって判定する。Codex の所見は外部のレビュアーの意見として扱い、正しさを確かめてから対応する。

- **鵜呑みにしない**: 所見の主張（「〜が壊れる」「〜が呼ばれていない」）は、該当箇所を読み、必要ならテストやコマンドで再現してから判定する。却下するときも推測で却下しない。
- **確かめる観点**: このコードベースで技術的に正しいか／直すと既存の挙動を壊さないか／今の実装に理由（互換性・依頼者の決定・意図的な設計）が無いか／レビュアーが文脈（依頼書の意図）を取り違えていないか。
- **作り込みの提案は使われ方を確かめる**: 「ちゃんと実装すべき」「汎用化すべき」の類は、呼び出し元を検索して実際に使われているかを確かめ、使われていない機能を足さない。
- **判断できないものは依頼者に聞く**: 現物で確かめられない、依頼者の過去の決定と食い違う、設計の方向を変える所見は、`pause-run.mjs` で一時停止して依頼者に尋ねる。
- **お礼や同意の言葉は書かない**: 対応表の note には、直す内容か根拠の事実だけを書く。

| 分類 | 基準 | note |
| --- | --- | --- |
| `addressed` | 指摘が正しく、依頼範囲内で、直す価値がある。critical / important は原則これ | 任意（何を直すか） |
| `rejected` | 現物で確かめて誤り、または意図的な設計で理由がある | 必須。根拠（ファイル・行・実測） |
| `out_of_scope` | 指摘は正しいが依頼の完了に必須ではない（変更前からある問題、別機能、依頼者判断待ち） | 必須。先に範囲外の記録先（設定の `outOfScopeFile`）の一覧へ、発見元を `review-loop <Run ID> <所見 ID>` と書いた行を追記し、その要約 |

- 指摘は正しいが直すほどでもないもの: 後で採否を決めたい（放置すると困り得る）なら `out_of_scope` として記録し、規約・仕様の裏付けが無い好みの範囲なら理由を書いて `rejected` にする。どちらも note の根拠は省かない。
- 範囲外の記録先が無いときは、`record-dispositions.mjs` が雛形から作って記入を求めるので、雛形の「記入の決まり」に従って行を追記してから再実行する。

対応表を `.tmp/review-loop/<run>/<ラウンド>.dispositions.json` に書く。

```json
{
	"round": 1,
	"items": [
		{ "id": "R1-1", "disposition": "addressed", "note": "null の分岐を追加" },
		{ "id": "R1-2", "disposition": "rejected", "note": "呼び出し元 src/x.ts:40 で検証済みの値しか来ない" },
		{ "id": "R1-3", "disposition": "out_of_scope", "note": "OOS-12 として記録。変更前からの問題" }
	]
}
```

```bash
bun ${CLAUDE_PLUGIN_ROOT}/dist/record-dispositions.mjs --run <run>
```

所見が 0 件のときは対応表の代わりに `--none` を付ける。script は全所見に対応が書かれていること、`out_of_scope` の所見が記録先の一覧に「Run ID＋所見 ID」の行として書かれていることを確かめ、検証済みの対応表を標準のパスへ保存してから次の工程を出力する。

### 5. 分岐

- `fixing`: `addressed` の所見を直す。重大なもの（壊れる・セキュリティ）→ 単純なもの → 構造の変更の順に 1 件ずつ直し、テストと lint を通して工程 3 へ戻る（依頼書は作り直さない）。
- `ready_to_finish`: 工程 6 へ。
- `max_rounds`: 最大ラウンドに達した。`addressed` の所見は直すが Codex へは出さず、残った所見と対応を依頼者に報告して判断を仰ぐ（ターンを終えてよい）。依頼者が続行を選んだら `bun ${CLAUDE_PLUGIN_ROOT}/dist/request-review.mjs --run <run> --max-rounds <新しい上限>` で再開する。レビュー無しでコミットする判断なら Run を `--abort` し、ループの外で通常どおりコミットする。

### 6. 完了

1. 下の「コミットメッセージの書き方」に従ってメッセージを書き、`.tmp/review-loop/<run>/commit-message.txt` に保存する。
2. `bun ${CLAUDE_PLUGIN_ROOT}/dist/finish-run.mjs --run <run>` を実行する。script はレビュー済みのスナップショットと作業ツリーが同じことを確かめ、メッセージ・変更ファイル・差分の統計を出して工程を `awaiting_confirmation` にする。レビュー後の変更が範囲外の記録先の末尾への追記だけ（レビュー済みの本文をそのまま先頭に残す）なら通す。それ以外の変更（他のファイル、記録の削除や既存行の書き換え）があれば拒否されるので、`request-review.mjs` で変更分を再レビューしてからやり直す（完了準備・確認待ちからも依頼できる）。
3. autoCommit が false（既定）: 出力（コミットメッセージ・変更ファイル・差分の統計）を応答の本文に載せて依頼者に見せ、承認を得てから `--commit` を付けて再実行する。承認は文章で尋ねず、選択肢で取る。`AskUserQuestion` を使い、選択肢は「コミットする」と「コミットしない」の 2 つにする（メッセージの修正などの指示は自動で付く自由記述の欄で受ける）。「コミットする」が選ばれたら `--commit` を実行し、「コミットしない」なら確認待ちのまま止めて指示を待つ。選択肢を出せる道具が無い環境では文章で尋ね、承認を待つ間はターンを終えてよい。autoCommit が true: そのまま `--commit` を付けて実行する。
4. `--commit` は `git add -A` → index の内容とレビュー済みのツリーの照合（`git add -f` 済みの無視ファイルなど、スナップショットに無い内容があれば中止）→ `git commit -F` を行う。リポジトリの git フック（pre-commit など）はそのまま走るので、失敗したら出力を見て直し、変更があれば再レビューしてからやり直す。`checkPushAfterCommit` が true なら、出力にある push の確認結果まで報告する。

### 7. 後片付け

`.tmp/review-loop/<run>/` の依頼書・プロンプト・結果・対応表・ログは証跡として残す。依頼されたときだけ `bun ${CLAUDE_PLUGIN_ROOT}/dist/cleanup-run-files.mjs --run <run>` で消す（進行中の Run は消せない）。

## コミットメッセージの書き方

- **形式と言語はリポジトリに合わせる**: `git log -10` で直近のコミットの形式（Conventional Commits か、件名の言語、大文字小文字）とトレーラー（`Co-Authored-By` など）を確かめ、それに揃える。慣例が読み取れなければ Conventional Commits にする。
- **件名**: `<type>(<scope>): <要約>`（scope は任意。type は `feat` `fix` `refactor` `perf` `docs` `test` `chore` `build` `ci` `style` `revert`）。命令形・現在形で、末尾に句点を付けない。50 文字程度を目安にし、72 文字を超えない（`finish-run.mjs` が検査する）。
- **本文**: 件名で足りるなら書かない。理由が diff から読めない、互換性を壊す、移行が要る、関連する issue がある、のどれかのときだけ、件名の後に空行を挟んで書く。何をしたかではなく、なぜかを書く。72 文字程度で折り返し、箇条書きは `-` を使う。
- **書かないもの**: 「このコミットでは」などの前置き、diff を読めば分かる変更の羅列、scope と同じファイル名の繰り返し、絵文字（リポジトリの慣例で求められる場合を除く）、AI が書いた旨（リポジトリの慣例やトレーラーで求められる場合を除く）。
- 互換性を壊す変更・セキュリティの修正・データの移行・revert は、件名だけにせず本文で事情を残す。

## 範囲外の問題

ループ中に自分で見つけた、依頼の完了に必須でない不具合・改善案は、修正せずに範囲外の記録先へ追記する（発見元は `review-loop <Run ID> self`）。依頼範囲を勝手に広げない。Codex の所見を `out_of_scope` にしたものも同じファイルへ。追記は記録先の「記入の決まり」に従う。

## 止め方・一時停止・Stop フック

- 中止: `bun ${CLAUDE_PLUGIN_ROOT}/dist/finish-run.mjs --run <run> --abort`。作業ツリーは残る。
- 一時停止: 依頼者に質問して答えを待ちたいときは `bun ${CLAUDE_PLUGIN_ROOT}/dist/pause-run.mjs --run <run> --reason "<質問の要約>"` を実行してからターンを終える。次の工程の script を実行すると解除される。
- プラグインの Stop フック（`stop-guard.mjs`）は、Run の工程が `implementing` / `reviewing` / `triaging` / `fixing` / `ready_to_finish` のままターンを終えようとしたとき、次の工程を理由にして続行させる。バックグラウンドのコマンドが動いている間（Codex のレビュー待ち）、一時停止中、依頼者の判断待ちの工程（`awaiting_confirmation` / `review_failed` / `max_rounds`）では止めてよい。24 時間更新の無い Run は見張らない。
- Claude Code は Stop フックによる連続の続行を一定回数で打ち切るが、ツールを呼ぶたびに数え直すので、往復の上限は `maxRounds` で守る。
- Run は開始時のセッション ID（環境変数 `CLAUDE_CODE_SESSION_ID`）を記録し、Stop フックはフック入力の `session_id` と一致する Run だけを見張る（ID が取れなかった Run はすべてのセッションが見張る）。同じリポジトリの別セッションは縛らない。
- `request-review.mjs` が途中で死んで `reviewing` のまま残った Run は、打ち切り時間（`timeoutMinutes`）を過ぎ、記録した codex のプロセスが終わっていれば、同じコマンドで再実行できる。それまでは実行中とみなして待つ。

## 完了条件

対応すべき所見が無くなり、`finish-run.mjs` が確認待ち（autoCommit=false）またはコミット済み（autoCommit=true）になったら完了。確認待ちの場合は、承認後の `--commit` の実行とその結果の報告までがこのスキルの範囲。
