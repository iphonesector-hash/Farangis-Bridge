const { json, requireDevice, rateLimit } = require('../../_core');

module.exports = async function handler(req, res) {
  if (!requireDevice(req, res) || !rateLimit(req, res, 25)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const key = process.env.GROQ_API_KEY;
  if (!key) return json(res, 503, { error: 'GROQ_API_KEY تنظیم نشده است.' });

  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks);
    if (!body.length) return json(res, 400, { error: 'فایل صوتی دریافت نشد.' });

    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('multipart/form-data')) {
      return json(res, 400, { error: 'فرمت درخواست صوتی معتبر نیست.' });
    }

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': contentType },
      body,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return json(res, response.status, { error: data?.error?.message || 'Groq STT failed' });
    return json(res, 200, { ok: true, text: String(data.text || '').trim(), language: 'fa' });
  } catch (error) {
    return json(res, 500, { error: `تبدیل صدا به متن شکست خورد: ${error.message || String(error)}` });
  }
};
