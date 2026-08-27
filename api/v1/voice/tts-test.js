const { json, requireDevice, rateLimit, readJson, normalizeFa } = require('../../_core');

const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM';

module.exports = async function handler(req, res) {
  if (!requireDevice(req, res) || !rateLimit(req, res, 12)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const body = await readJson(req);
    const key = String(body.apiKey || '').trim();
    const text = normalizeFa(body.text || 'سلام پیمان، من آریا هستم. صدای من با موفقیت فعال شد.').slice(0, 500);
    const voiceId = String(body.voiceId || process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE).trim();
    const modelId = String(body.modelId || process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2').trim();

    if (!key) return json(res, 400, { error: 'کلید ElevenLabs را وارد کن.' });
    if (!voiceId) return json(res, 400, { error: 'Voice ID معتبر نیست.' });

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
        voice_settings: {
          stability: 0.52,
          similarity_boost: 0.78,
          style: 0.18,
          use_speaker_boost: true,
        },
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
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(bytes);
  } catch (error) {
    return json(res, 500, { error: `تست صدا شکست خورد: ${error.message || String(error)}` });
  }
};
