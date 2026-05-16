// LINE Webhook受信 + ユーザーとポストの紐付け
const crypto = require('crypto');

// 生のリクエストボディを取得（署名検証に必要）
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// LINE署名検証
function verifySignature(rawBody, signature, secret) {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64');
  return hash === signature;
}

// LINEへの返信
async function sendReply(replyToken, message) {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text: message }]
    })
  });
}

// トークンでポストを検索し、LINE UserIDを紐付け
async function linkUserToPost(token, lineUserId) {
  const supabaseUrl = process.env.SUPABASE_URL || 'https://capiwvrzirqsouybntti.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;

  // トークンに一致するポストを検索
  const res = await fetch(
    `${supabaseUrl}/rest/v1/posts?notification_token=eq.${encodeURIComponent(token)}&select=id`,
    {
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      }
    }
  );
  const posts = await res.json();
  if (!posts || posts.length === 0) return false;

  // line_user_idを保存
  const patchRes = await fetch(
    `${supabaseUrl}/rest/v1/posts?notification_token=eq.${encodeURIComponent(token)}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ line_user_id: lineUserId })
    }
  );
  return patchRes.ok;
}

// Vercelはbodyを自動でパースするのでbodyParserを無効化
module.exports.config = { api: { bodyParser: false } };

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const rawBody = await getRawBody(req);
  const signature = req.headers['x-line-signature'];

  // 署名検証
  if (!verifySignature(rawBody, signature, process.env.LINE_CHANNEL_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const body = JSON.parse(rawBody.toString('utf8'));
  const events = body.events || [];

  for (const event of events) {
    // 友だち追加イベント
    if (event.type === 'follow') {
      await sendReply(event.replyToken,
        'ほんねのおうちの公式LINEへようこそ。\n\n投稿直後に画面に表示された8桁のコードを送ってください。返信が届いたときにこちらからお知らせします。\n\n例: HONNE-A1B2C3D4'
      );
    }

    // メッセージイベント（コード送信）
    if (event.type === 'message' && event.message.type === 'text') {
      const text = event.message.text.trim().toUpperCase();

      if (text.startsWith('HONNE-')) {
        const token = text.replace('HONNE-', '');
        const linked = await linkUserToPost(token, event.source.userId);

        if (linked) {
          await sendReply(event.replyToken,
            'つながりました ✓\n\nあなたの声に返信が届いたとき、このLINEでお知らせします。'
          );
        } else {
          await sendReply(event.replyToken,
            'コードが見つかりませんでした。\n\n投稿直後に表示されたコード（HONNE-から始まる8桁）をもう一度確認してみてください。'
          );
        }
      }
    }
  }

  res.status(200).json({ status: 'ok' });
};
