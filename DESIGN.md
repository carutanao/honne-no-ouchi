# ほんねのおうち 技術設計書

最終更新：2026-05-17

---

## 1. システム構成図

```
ユーザー（ブラウザ）
　│
　├─ 静的ファイル配信
　│   Vercel（ホスティング）
　│   └─ index.html / about.html / admin.html / privacy.html
　│
　├─ APIルート（Vercel Serverless Functions）
　│   ├─ /api/line-webhook.js   LINEからのWebhook受信
　│   └─ /api/notify-reply.js   返信通知をLINEへ送信
　│
　└─ データベース
　    Supabase（PostgreSQL）
　    ├─ posts テーブル
　    ├─ replies テーブル
　    └─ online_presence テーブル

外部サービス
　├─ LINE Messaging API（通知・Bot）
　└─ Google Analytics（アクセス解析）
```

---

## 2. 機能一覧

| 機能 | 概要 | 実装場所 |
|---|---|---|
| 投稿 | 立場・テキスト・ニックネームで匿名投稿 | index.html |
| 返信 | 投稿に対して返信を投稿 | index.html |
| 返信への返信 | 返信に対してネスト返信 | index.html |
| ひとりごとモード | 非公開で自分だけに保存（localStorage） | index.html |
| キーワードつなぐ | 投稿のキーワードで関連投稿を可視化 | index.html |
| オンライン人数表示 | 今サイトを見ている人数をリアルタイム表示 | index.html |
| LINE通知 | 返信が届いたらLINEにプッシュ通知 | api/ |
| 管理画面 | 投稿の承認・削除 | admin.html |

---

## 3. DB設計（Supabaseテーブル定義）

### posts テーブル
| カラム名 | 型 | 概要 |
|---|---|---|
| id | uuid | 主キー（自動生成） |
| role | text | 立場（今、子育て中の親 / 乗り越えた親 / 育った子ども / 応援している人） |
| text | text | 投稿本文 |
| nickname | text | ニックネーム（任意・null可） |
| icon | text | アイコンID（任意・null可） |
| age_tag | text | 子どもの年齢タグ（任意・null可） |
| status | text | 承認状態（approved / pending） |
| is_private | boolean | ひとりごとモード（非公開） |
| read_count | integer | 既読数 |
| notification_token | text | LINE通知紐付け用トークン（8桁英数字） |
| line_user_id | text | LINE UserID（通知連携後に保存） |
| created_at | timestamptz | 作成日時（自動生成） |

### replies テーブル
| カラム名 | 型 | 概要 |
|---|---|---|
| id | uuid | 主キー（自動生成） |
| post_id | uuid | 親投稿ID（postsへの外部キー） |
| parent_reply_id | uuid | 親返信ID（ネスト返信用・null可） |
| role | text | 立場 |
| text | text | 返信本文 |
| nickname | text | ニックネーム（任意・null可） |
| icon | text | アイコンID（任意・null可） |
| status | text | 承認状態（approved / pending） |
| created_at | timestamptz | 作成日時（自動生成） |

### online_presence テーブル
| カラム名 | 型 | 概要 |
|---|---|---|
| session_key | text | セッション識別子（主キー） |
| last_seen | timestamptz | 最終アクティブ日時 |

---

## 4. APIルート設計

### POST /api/line-webhook
LINEからのWebhookイベントを受信する。

| イベント | 処理 |
|---|---|
| follow（友だち追加） | ウェルカムメッセージ＋コード入力案内を返信 |
| message（テキスト） | 「HONNE-XXXXXXXX」形式のコードを受信 → postsテーブルのline_user_idを更新 |

**環境変数**
- `LINE_CHANNEL_SECRET`：署名検証用
- `LINE_CHANNEL_ACCESS_TOKEN`：メッセージ送信用
- `SUPABASE_SERVICE_KEY`：DB更新用（service roleキー）

---

### POST /api/notify-reply
返信投稿時にフロントから呼び出され、LINE通知を送信する。

**リクエスト**
```json
{
  "postId": "uuid",
  "replyRole": "今、子育て中の親"
}
```

**処理フロー**
```
postIdでpostsを検索
　↓
line_user_idが存在する場合のみ
　↓
LINE Messaging APIでプッシュ通知を送信
```

---

## 5. 画面一覧

| ファイル | 概要 |
|---|---|
| index.html | メインページ。投稿・閲覧・返信・つなぐ機能すべて |
| admin.html | 管理画面。投稿の承認・削除 |
| about.html | サイト説明・利用規約・お問い合わせ |
| privacy.html | プライバシーポリシー |

---

## 6. 外部サービス連携

| サービス | 用途 | 設定場所 |
|---|---|---|
| Supabase | DB・REST API | supabase.com |
| Vercel | ホスティング・APIルート | vercel.com |
| LINE Messaging API | Bot・プッシュ通知 | developers.line.biz |
| Google Analytics | アクセス解析 | analytics.google.com |

---

## 7. 環境変数一覧

Vercelのダッシュボード（Environment Variables）で管理。

| 変数名 | 用途 |
|---|---|
| `LINE_CHANNEL_SECRET` | LINEのWebhook署名検証 |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINEへのメッセージ送信 |
| `SUPABASE_SERVICE_KEY` | Supabase service roleキー（サーバーサイドのみ） |

※ `SUPABASE_URL` と公開キーはindex.html内にハードコード（フロントエンド用）

---

## 8. LINE通知フロー

```
① ユーザーが投稿する
　 → 8桁のワンタイムトークン（HONNE-XXXXXXXX）を生成
　 → 投稿完了後にモーダルで表示

② ユーザーがLINE公式アカウントを友だち追加
　 → Webhookでfollowイベントを受信
　 → コード入力案内メッセージを返信

③ ユーザーがコードをLINEに送信
　 → Webhookでmessageイベントを受信
　 → postsテーブルのline_user_idを更新
　 → 「つながりました」を返信

④ 誰かが返信を投稿
　 → /api/notify-replyを呼び出す
　 → 対象のline_user_idにプッシュ通知を送信
```

---

## 9. 今後の実装予定

- [ ] 「つなぐ」機能の本番実装（tsunagu-thread.htmlをベースに）
- [ ] 投稿者へのLINE通知：コード不要の自動紐付け（LIFF対応）
- [ ] 管理画面の強化
- [ ] PWA対応（ホーム画面追加・プッシュ通知）
