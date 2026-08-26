const { json, requireDevice, rateLimit, readJson, recentMemory, saveMemory } = require('../_core');

module.exports = async function handler(req, res) {
  if (!requireDevice(req, res) || !rateLimit(req, res, 80)) return;
  const deviceId = String(req.headers['x-farangis-device-id'] || 'anonymous');
  try {
    if (req.method === 'GET') {
      const items = await recentMemory(deviceId, 50);
      return json(res, 200, { ok: true, items });
    }
    if (req.method === 'POST') {
      const body = await readJson(req);
      const content = String(body.content || '').trim();
      if (!content) return json(res, 400, { error: 'محتوای حافظه خالی است.' });
      await saveMemory({ deviceId, kind: body.kind || 'explicit', content, metadata: body.metadata || {} });
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return json(res, 500, { error: `خطای حافظه: ${error.message || String(error)}` });
  }
};
