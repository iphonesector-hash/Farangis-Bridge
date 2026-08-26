const {
  json, requireDevice, rateLimit, readJson, normalizeFa, parseIntent,
  groqChat, recentMemory, saveMemory, cacheGet, cacheSet,
} = require('../_core');

const SYSTEM = `تو «فرنگیس» هستی؛ دستیار شخصی فارسی‌زبان، باهوش، سریع و حرفه‌ای.
پاسخ‌ها فارسی، طبیعی و کاربردی باشند. برای سؤال‌های ساده کوتاه جواب بده.
اطلاعات حساس را حدس نزن. اگر داده کافی نیست، کوتاه بگو چه چیزی کم است.
برای حالت صوتی از جمله‌های روان و قابل شنیدن استفاده کن و از جدول و مارک‌داون سنگین دوری کن.`;

async function groqChatWithKey(key, messages) {
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature: 0.35, max_tokens: 900 }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Groq HTTP ${response.status}`);
  return data?.choices?.[0]?.message?.content?.trim() || '';
}

module.exports = async function handler(req, res) {
  if (!requireDevice(req, res) || !rateLimit(req, res, 50)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const body = await readJson(req);
    const text = normalizeFa(body.text || '');
    if (!text) return json(res, 400, { error: 'متن خالی است.' });
    const deviceId = String(req.headers['x-farangis-device-id'] || 'anonymous');
    const intent = parseIntent(text);

    if (intent.type === 'action') {
      return json(res, 200, {
        ok: true,
        type: 'action',
        text: 'فرمانت رو فهمیدم و برای اجرا آماده‌اش کردم.',
        action: { tool: intent.tool, args: intent.args },
      });
    }

    const cacheKey = `chat:${text.toLowerCase()}`;
    const cached = cacheGet(cacheKey);
    if (cached) return json(res, 200, { ok: true, type: 'answer', text: cached, cached: true });

    const memory = await recentMemory(deviceId, 8).catch(() => []);
    const suppliedContext = Array.isArray(body.context) ? body.context.slice(-8) : [];
    const messages = [
      { role: 'system', content: SYSTEM },
      ...(memory.length ? [{ role: 'system', content: `حافظه مرتبط اخیر:\n${memory.reverse().map((m) => `- ${m.content}`).join('\n')}` }] : []),
      ...suppliedContext.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') })).filter((m) => m.content),
      { role: 'user', content: text },
    ];

    const testKey = String(req.headers['x-farangis-groq-key'] || '').trim();
    const answer = testKey ? await groqChatWithKey(testKey, messages) : await groqChat({ messages });
    if (!answer) throw new Error('پاسخ خالی از مدل دریافت شد.');

    await saveMemory({ deviceId, kind: 'conversation', content: `کاربر: ${text}\nفرنگیس: ${answer}`, metadata: { source: 'chat' } }).catch(() => {});
    if (text.length < 120 && answer.length < 700) cacheSet(cacheKey, answer, 45_000);

    return json(res, 200, { ok: true, type: 'answer', text: answer, testKeyUsed: Boolean(testKey) });
  } catch (error) {
    return json(res, 500, { error: `خطای هسته مکالمه: ${error.message || String(error)}` });
  }
};
