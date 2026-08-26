const { json, requireDevice, rateLimit, readJson } = require('../../_core');

module.exports = async function handler(req, res) {
  if (!requireDevice(req, res) || !rateLimit(req, res, 25)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const key = String(req.headers['x-farangis-groq-key'] || process.env.GROQ_API_KEY || '').trim();
  if (!key) return json(res, 503, { error: 'کلید Groq برای تست یا محیط Vercel تنظیم نشده است.' });

  try {
    const contentType = String(req.headers['content-type'] || '');
    let form;

    if (contentType.includes('application/json')) {
      const body = await readJson(req);
      const audioBase64 = String(body.audioBase64 || '');
      if (!audioBase64) return json(res, 400, { error: 'داده صوتی دریافت نشد.' });
      const buffer = Buffer.from(audioBase64, 'base64');
      form = new FormData();
      form.append('file', new Blob([buffer], { type: body.mimeType || 'audio/webm' }), body.fileName || 'voice.webm');
      form.append('model', 'whisper-large-v3-turbo');
      form.append('language', 'fa');
      form.append('response_format', 'json');
    } else {
      const chunks = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks);
      if (!body.length) return json(res, 400, { error: 'فایل صوتی دریافت نشد.' });
      if (!contentType.includes('multipart/form-data')) return json(res, 400, { error: 'فرمت درخواست صوتی معتبر نیست.' });
      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': contentType },
        body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return json(res, response.status, { error: data?.error?.message || 'Groq STT failed' });
      return json(res, 200, { ok: true, text: String(data.text || '').trim(), language: 'fa' });
    }

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return json(res, response.status, { error: data?.error?.message || 'Groq STT failed' });
    return json(res, 200, { ok: true, text: String(data.text || '').trim(), language: 'fa' });
  } catch (error) {
    return json(res, 500, { error: `تبدیل صدا به متن شکست خورد: ${error.message || String(error)}` });
  }
};
