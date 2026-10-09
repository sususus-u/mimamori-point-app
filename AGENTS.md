<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 作業の始めと終わりの決まり

### 1. 作業の始め(どの PC でも)
- `git fetch` で、手元と origin を比べる。手元が遅れていれば pull する。未コミットの変更がある場合は、pull せず、内容を報告する。
- 最新のコミット3つ(識別子、日時、説明)と、最新の本番デプロイの状態を報告する。

### 2. 作業の終わり
- コミットされていない変更、push 済みか、本番デプロイが Ready か、一時的な差し替えや確認用のファイルが残っていないかを確認する。
- 報告の最後に、「引き継ぎメモに書く内容」を、4項目で書く(本番に出したもの、確認したこと、確認していないこと、次にやること)。

### 3. 別の PC で作業した日
- その日のうちに push する。
- 手元の変更を捨てる前に、差分を表示して、内容が同じか確認する。

### 4. 本番に出す前の確認(脆弱性対策)
- 誰が実行できるか(ログインの確認が、サーバー側にもあるか)。
- 悪意のある入力でも安全か(検証、長さの制限)。
- 秘密の値が、ログ、URL、画面に出ないか。
- 失敗したときに戻せるか(戻す先のデプロイを控える)、被害が広がらないか。
- 確認できていない点は、「確実」と書かず、「未確認」と書く。

### 5. 報告の書き方
- 冒頭に、このアプリの名前を書く。各項目は短くする(貼り付けが切れないように)。

### 6. 状況の正本
- 状況の正本は、ハブのリポジトリの BRAND.md 26章「引き継ぎメモ」。このリポジトリからは読めないので、報告の4項目を、利用者がハブへ伝える。
