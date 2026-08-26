const { json, requireDevice, rateLimit, readJson, logAction, supabase } = require('../_core');

async function callAquaGold(path, payload) {
  const base = process.env.AQUAGOLD_API_URL;
  const token = process.env.AQUAGOLD_API_TOKEN;
  if (!base) return { queued: true, reason: 'AQUAGOLD_API_URL_NOT_CONFIGURED' };
  const response = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `AquaGold HTTP ${response.status}`);
  return data;
}

async function queueAction(deviceId, tool, args) {
  const stored = await supabase('farangis_action_queue', {
    method: 'POST',
    body: { device_id: deviceId, action: tool, args, status: 'pending' },
  }).catch(() => null);
  return stored ? { queued: true, persisted: true } : { queued: true, persisted: false };
}

module.exports = async function handler(req, res) {
  if (!requireDevice(req, res) || !rateLimit(req, res, 50)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const deviceId = String(req.headers['x-farangis-device-id'] || 'anonymous');
  try {
    const body = await readJson(req);
    const tool = String(body.tool || '');
    const args = body.args && typeof body.args === 'object' ? body.args : {};
    const confirmed = body.confirmed === true;
    if (!tool) return json(res, 400, { error: 'Action tool مشخص نشده.' });

    const sensitive = ['aquagold.customer_payment', 'delete', 'message.send'].some((x) => tool.includes(x));
    if (sensitive && !confirmed) {
      return json(res, 200, {
        ok: true,
        requiresConfirmation: true,
        confirmationText: tool === 'aquagold.customer_payment'
          ? `ثبت مبلغ ${Number(args.amount || 0).toLocaleString('fa-IR')} برای ${args.customerName || 'این مشتری'} انجام شود؟`
          : 'این عملیات نیاز به تأیید دارد.',
        action: { tool, args },
      });
    }

    let result;
    if (tool === 'aquagold.customer_payment') {
      result = await callAquaGold('/api/farangis/customer-payment', args);
      if (result?.queued) result = { ...result, ...(await queueAction(deviceId, tool, args)) };
    } else if (tool === 'aquagold.customer_history') {
      result = await callAquaGold('/api/farangis/customer-history', args);
      if (result?.queued) result = { ...result, ...(await queueAction(deviceId, tool, args)) };
    } else if (tool === 'reminder.create' || tool === 'maps.search') {
      result = { clientAction: true, tool, args };
    } else {
      result = { unsupported: true, tool };
    }

    await logAction({ deviceId, action: tool, args, status: 'success', result }).catch(() => {});
    return json(res, 200, { ok: true, result });
  } catch (error) {
    await logAction({ deviceId, action: 'unknown', args: {}, status: 'error', result: { error: String(error) } }).catch(() => {});
    return json(res, 500, { error: `اجرای فرمان ناموفق بود: ${error.message || String(error)}` });
  }
};
