const { json, requireDevice, rateLimit, normalizeFa } = require('../../_core');

const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM';

module.exports = async function handler(req, res) {
  if (!requireDevice(req, res) || !rateLimit(req, res, 30)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return json(res, 503, { error: 'ELEVENLABS_API_KEY تنظیم نشده است.' });

  const raw = Array.isArray(req.query?.text) ? req.query.text[0] : req.query?.text;
  const text = normalizeFa(raw || '').slice(0, 1200);
  if (!text) return json(res, 400, { error: 'متن برای خواندن خالی است.' });

  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: {
        'xi-api-key': key,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2',
        voice_settings: { stability: 0.52, similarity_boost: 0.78, style: 0.18, use_speaker_boost: true },
      }),
    });
    if (!response.ok) {
      const message = await response.text();
      return json(res, response.status, { error: `ElevenLabs: ${message.slice(0, 500)}` });
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    res.statusCode = 200;
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.end(bytes);
  } catch (error) {
    return json(res, 500, { error: `ساخت پاسخ صوتی شکست خورد: ${error.message || String(error)}` });
  }
};
