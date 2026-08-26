const { json, requireDevice, rateLimit, readJson } = require('../_core');

module.exports = async function handler(req, res) {
  if (!requireDevice(req, res) || !rateLimit(req, res, 120)) return;
  if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { error: 'Method not allowed' });
  const body = req.method === 'POST' ? await readJson(req).catch(() => ({})) : {};
  return json(res, 200, {
    ok: true,
    wake: true,
    phrase: 'هی فرنگیس',
    handoff: {
      target: 'farangis://voice',
      input: body.input || '',
    },
    note: 'این endpoint برای اتصال Vocal Shortcuts/Shortcuts به کلاینت iOS آماده شده است.',
  });
};
