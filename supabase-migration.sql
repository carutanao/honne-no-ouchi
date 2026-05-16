-- ほんねのおうち: LINE通知機能のマイグレーション
-- Supabase Dashboard > SQL Editor で実行してください

-- 1. postsテーブルにLINE通知用カラムを追加
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS notification_token text,
  ADD COLUMN IF NOT EXISTS line_user_id text;

-- 2. notification_tokenにインデックスを追加（検索高速化）
CREATE INDEX IF NOT EXISTS idx_posts_notification_token
  ON posts (notification_token);

-- 3. line_user_idをpublic APIから隠す（セキュリティ）
--    ※ Supabase で RLS が有効な場合、以下のポリシーを追加してください
--    notification_token と line_user_id を SELECT から除外するには
--    Supabase Dashboard > Table Editor > posts > Columns で
--    line_user_id の「Exposed in API」を OFF にしてください。
--    （GUIで操作するため、SQLでは対応できません）
