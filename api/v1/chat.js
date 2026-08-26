const {
  json, requireDevice, rateLimit, readJson, normalizeFa, parseIntent,
  groqChat, recentMemory, saveMemory, cacheGet, cacheSet,
} = require('../_core');

const SYSTEM = `تو «فرنگیس» هستی؛ دستیار شخصی فارسی‌زبان، باهوش، سریع و حرفه‌ای.
پاسخ‌ها فارسی، طبیعی و کاربردی باشند. برای سؤال‌های ساده کوتاه جواب بده.
اگر کاربر درباره مشتری، مبلغ سرویس، AquaGold یا عملیات قابل اجرا صحبت کرد، نتیجه را روشن و بدون ادعای اجرای کاری که انجام نشده بیان کن.
اطلاعات حساس را حدس نزن. اگر داده کافی نیست، کوتاه بگو چه چیزی کم است.
برای حالت صوتی از جمله‌های روان و قابل شنیدن استفاده کن و از جدول و مارک‌داون سنگین دوری کن.`;

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

    const answer = await groqChat({ messages });
    if (!answer) throw new Error('پاسخ خالی از مدل دریافت شد.');

    await saveMemory({ deviceId, kind: 'conversation', content: `کاربر: ${text}\nفرنگیس: ${answer}`, metadata: { source: 'chat' } }).catch(() => {});
    if (text.length < 120 && answer.length < 700) cacheSet(cacheKey, answer, 45_000);

    return json(res, 200, { ok: true, type: 'answer', text: answer });
  } catch (error) {
    return json(res, 500, { error: `خطای هسته مکالمه: ${error.message || String(error)}` });
  }
};
