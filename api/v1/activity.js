const { json, requireDevice, rateLimit, supabase } = require('../_core');

module.exports = async function handler(req, res) {
  if (!requireDevice(req, res) || !rateLimit(req, res, 80)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  const deviceId = String(req.headers['x-farangis-device-id'] || 'anonymous');
  try {
    const items = (await supabase('farangis_actions', {
      query: `?device_id=eq.${encodeURIComponent(deviceId)}&select=id,action,args,status,result,created_at&order=created_at.desc&limit=50`,
    })) || [];
    return json(res, 200, { ok: true, items });
  } catch (error) {
    return json(res, 500, { error: `خطای تاریخچه: ${error.message || String(error)}` });
  }
};
