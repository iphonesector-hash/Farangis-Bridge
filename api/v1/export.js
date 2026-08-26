const { json, requireDevice, rateLimit, recentMemory, supabase } = require('../_core');

module.exports = async function handler(req, res) {
  if (!requireDevice(req, res) || !rateLimit(req, res, 10, 60_000)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  const deviceId = String(req.headers['x-farangis-device-id'] || 'anonymous');
  try {
    const [memory, actions] = await Promise.all([
      recentMemory(deviceId, 500),
      supabase('farangis_actions', {
        query: `?device_id=eq.${encodeURIComponent(deviceId)}&select=id,action,args,status,result,created_at&order=created_at.asc&limit=500`,
      }).catch(() => []),
    ]);
    return json(res, 200, {
      format: 'farangis-export-v1',
      exportedAt: new Date().toISOString(),
      deviceId,
      memory: memory || [],
      actions: actions || [],
    });
  } catch (error) {
    return json(res, 500, { error: `خروجی گرفتن ناموفق بود: ${error.message || String(error)}` });
  }
};
