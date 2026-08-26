const { json, requireDevice, rateLimit } = require('../_core');
const { connectorStatus } = require('../_connectors');

module.exports = async function handler(req, res) {
  if (!requireDevice(req, res) || !rateLimit(req, res, 120)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });

  const checks = {
    core: true,
    groq: Boolean(process.env.GROQ_API_KEY),
    elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
    supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    aquagold: Boolean(process.env.AQUAGOLD_API_URL),
  };

  return json(res, 200, {
    ok: true,
    version: '2.0.0-predeploy',
    checks,
    connectors: connectorStatus(),
    voiceReady: checks.groq && checks.elevenlabs,
    memoryReady: checks.supabase,
    timestamp: new Date().toISOString(),
  });
};
