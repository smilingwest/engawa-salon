# GrowthPad

添付のシステム設計仕様書（`GrowthPad システム設計仕様書`）に基づいて実装した学習支援アプリです。
Ai GROW（非認知能力アセスメント）とスタディサプリ（認知能力・教科学習データ）を、メールアドレスをキーに
名寄せ・統合し、生徒が自身の学習特性を把握した上で自律的に学習に向かえる環境を提供します。

このフォルダには2つの実装が入っています。

```
growthpad-app/
├── gas/            本番用: Google Apps Script + Google Workspace で動く実装
│   ├── appsscript.json
│   ├── Code.gs         サーバーサイドロジック（CSV取込・名寄せ・API）
│   ├── Admin.html       管理者・先生用画面（Web App: ?page=admin）
│   └── Student.html     生徒用マイページ（Web App: 通常URL）
├── demo/           確認用: ブラウザだけで動くデモ（Google環境不要）
│   ├── index.html
│   └── logic.js         gas/Code.gs の名寄せ・タイプ判定ロジックをJSに移植
└── sample-data/    動作確認用のサンプルCSV（Shift_JIS）
    ├── aigrow_sample.csv
    └── studysapuri_sample.csv
```

## 1. まず試す（デモ版・Google環境不要）

`growthpad-app/demo/index.html` をブラウザで開くだけで、CSV取込→名寄せ→生徒マイページ→振り返り送信
まで一通り体験できます。データは端末の localStorage に保存され、外部には送信されません。

1. 「管理者・先生用」タブで `sample-data/aigrow_sample.csv` と `sample-data/studysapuri_sample.csv` を選択し
   「データ更新実行」を押す
2. DB_統合データのプレビューとタイプ別人数（4象限）が表示される
3. 「生徒用」タブでログインユーザーを選び、マイ・プロファイルと振り返りフォームを確認する

## 2. 本番デプロイ（Google Apps Script）

仕様書どおり、外部APIや専用サーバーを使わず GAS + Google Workspace の標準機能のみで完結します。

1. Google Drive で新規スプレッドシート（`System_Database`）を作成する
2. 拡張機能 > Apps Script を開き、`gas/Code.gs` `gas/Admin.html` `gas/Student.html` の内容をそのまま
   コピーしてスクリプトエディタに貼り付ける（`appsscript.json` の内容もマニフェストに反映する）
3. 「デプロイ」>「新しいデプロイ」> 種類「ウェブアプリ」を選択
   - 実行するユーザー: 自分（もしくは要件に応じて選択）
   - アクセスできるユーザー: 組織内の全員
4. デプロイ後のURLが生徒用マイページになる。管理者・先生は同じURLに `?page=admin` を付けてアクセスする
   - 管理者用: `https://script.google.com/.../exec?page=admin`
   - 生徒用: `https://script.google.com/.../exec`
5. 管理者画面から Ai GROW / スタディサプリ の CSV（Shift_JIS）をアップロードし、「データ更新実行」を押すと
   `RAW_AiGROW` / `RAW_スタディサプリ` / `DB_統合データ` の各シートが自動生成・更新される
6. `DB_統合データ` シートを Looker Studio のデータソースとして接続すれば、「非認知 × 認知」の2軸散布図で
   意欲はあるが進捗が止まっている生徒などを抽出できる

## データベース構造

| シート名 | 役割 | 主な項目 |
|---|---|---|
| RAW_AiGROW | Ai GROW CSV 生データ（上書き） | メールアドレス, 氏名, クラス, 計画性, 思考力, 自己効力感 |
| RAW_スタディサプリ | スタディサプリ CSV 生データ（上書き） | メールアドレス, 氏名, 今週の学習時間(分), 講義完了数 |
| DB_統合データ | アプリ参照用マスター（自動生成） | メールアドレス, 氏名, クラス, 計画性, 自己効力感, 学習時間, タイプ判定, 最終更新日時 |
| LOG_リフレクション | 生徒の振り返り入力ログ（追記） | タイムスタンプ, メールアドレス, 集中度スコア, 工夫点・メッセージ |

## 学びタイプ判定ロジック

自己効力感（非認知, 5段階中3.5以上を「高」）× 週間学習時間（認知, 120分以上を「高」）の2軸で4タイプに分類します
（`gas/Code.gs` の `judgeType_` / `demo/logic.js` の `judgeType`）。

- 高 × 高: 推進型（有言実行タイプ）
- 高 × 低: 潜在力型（エンジン始動待ちタイプ）
- 低 × 高: 努力型（縁の下の力持ちタイプ）
- 低 × 低: 模索型（伴走が力になるタイプ）

しきい値は運用データに合わせて `judgeType_` / `judgeType` 内の定数を調整してください。

## セキュリティ・権限

- 生徒用画面は `Session.getActiveUser().getEmail()` でログイン本人を識別し、本人のデータのみを返す
- Google組織ドメイン（SSO）のログイン認証を利用するため、パスワードの個別管理は不要
- 管理者用画面へのアクセス制御は URL パラメータ（`?page=admin`）で行う簡易実装のため、必要に応じて
  `doGet` 内でユーザーのメールアドレス/グループ所属をチェックする権限判定を追加することを推奨する
