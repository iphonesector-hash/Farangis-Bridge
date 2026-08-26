const { json, requireDevice, rateLimit, normalizeFa, readJson } = require('../../_core');

const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM';

module.exports = async function handler(req, res) {
  if (!requireDevice(req, res) || !rateLimit(req, res, 30)) return;
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });

  const key = String(req.headers['x-farangis-elevenlabs-key'] || process.env.ELEVENLABS_API_KEY || '').trim();
  if (!key) return json(res, 503, { error: 'کلید ElevenLabs برای تست یا محیط Vercel تنظیم نشده است.' });

  let raw = '';
  if (req.method === 'POST') {
    try {
      const body = await readJson(req);
      raw = body.text || '';
    } catch (error) {
      return json(res, 400, { error: `JSON نامعتبر: ${error.message || String(error)}` });
    }
  } else {
    raw = Array.isArray(req.query?.text) ? req.query.text[0] : req.query?.text;
  }

  const text = normalizeFa(raw || '').slice(0, 1200);
  if (!text) return json(res, 400, { error: 'متن برای خواندن خالی است.' });

  const voiceId = String(req.headers['x-farangis-voice-id'] || process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE).trim();
  const modelId = String(req.headers['x-farangis-tts-model'] || process.env.ELEVENLABS_MODEL_ID || 'eleven_v3').trim();

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
        model_id: modelId,
        language_code: 'fa',
        voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true },
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
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Farangis-TTS-Provider', 'elevenlabs');
    res.end(bytes);
  } catch (error) {
    return json(res, 500, { error: `ساخت پاسخ صوتی شکست خورد: ${error.message || String(error)}` });
  }
};
