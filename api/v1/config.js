const { json, requireDevice, rateLimit } = require('../_core');

module.exports = async function handler(req, res) {
  if (!requireDevice(req, res) || !rateLimit(req, res, 120)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  return json(res, 200, {
    ok: true,
    version: '2.1.0-aria',
    assistant: {
      name: 'آریا',
      latinName: 'ARIA',
    },
    features: {
      voice: process.env.FARANGIS_FEATURE_VOICE !== 'false',
      memory: process.env.FARANGIS_FEATURE_MEMORY !== 'false',
      aquagold: process.env.FARANGIS_FEATURE_AQUAGOLD !== 'false',
      wakeBridge: true,
      actionConfirmation: true,
    },
    voice: {
      provider: 'elevenlabs',
      configured: Boolean(process.env.ELEVENLABS_API_KEY),
      voiceId: process.env.ELEVENLABS_VOICE_ID || null,
      model: process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2',
      fallback: 'ios',
      language: 'fa-IR',
      maxSpokenCharacters: 1200,
    },
    ui: {
      brand: 'ARIA',
      brandFa: 'آریا',
      credit: 'MADE BY SECTOR TEAM',
      theme: 'sector-nebula',
    },
  });
};
