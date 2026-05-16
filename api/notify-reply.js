// 返信があったときにLINEプッシュ通知を送る
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const { postId, replyRole } = req.body;
  if (!postId) {
    return res.status(400).json({ error: 'postId required' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || 'https://capiwvrzirqsouybntti.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  try {
    // ポストのline_user_idとtextを取得
    const res2 = await fetch(
      `${supabaseUrl}/rest/v1/posts?id=eq.${encodeURIComponent(postId)}&select=line_user_id,text`,
      {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`
        }
      }
    );
    const posts = await res2.json();
    if (!posts || posts.length === 0 || !posts[0].line_user_id) {
      // LINE未連携のユーザー → 通知なし（正常終了）
      return res.status(200).json({ notified: false, reason: 'no_line_user' });
    }

    const { line_user_id, text } = posts[0];
    const preview = text.slice(0, 25) + (text.length > 25 ? '…' : '');
    const roleLabel = replyRole ? `「${replyRole}」から` : '誰かから';
    const message = `${roleLabel}返信が届きました。\n\n「${preview}」\n\n👉 https://honne-no-ouchi.vercel.app`;

    // LINEプッシュ通知を送信
    const lineRes = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        to: line_user_id,
        messages: [{ type: 'text', text: message }]
      })
    });

    if (!lineRes.ok) {
      const err = await lineRes.text();
      console.error('LINE push error:', err);
      return res.status(500).json({ error: 'LINE push failed' });
    }

    return res.status(200).json({ notified: true });
  } catch (e) {
    console.error('notify-reply error:', e);
    return res.status(500).json({ error: e.message });
  }
};
