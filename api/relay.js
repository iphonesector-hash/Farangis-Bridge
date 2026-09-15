const crypto = require('node:crypto');

const FARANGIS_BASE_URL = String(
  process.env.FARANGIS_BASE_URL || 'https://farangis-core-v2-i-sector.vercel.app'
).replace(/\/$/, '');
const CLIENT_ID = String(process.env.RELAY_CLIENT_ID || 'grok-salon-v1');
const BYPASS = String(
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET || process.env.FARANGIS_PROTECTION_BYPASS || ''
);
const DEVICE_TOKEN = String(process.env.FARANGIS_DEVICE_TOKEN || '');
const TIMEOUT_MS = Math.max(3000, Math.min(Number(process.env.RELAY_TIMEOUT_MS || 20000), 30000));
const MAX_TEXT = Math.max(200, Math.min(Number(process.env.RELAY_MAX_TEXT_LENGTH || 2400), 8000));
const MAX_CONTEXT = Math.max(0, Math.min(Number(process.env.RELAY_MAX_CONTEXT || 8), 20));
const MINUTE_LIMIT = Math.max(1, Math.min(Number(process.env.RELAY_MINUTE_LIMIT || 30), 300));
const DAILY_LIMIT = Math.max(10, Math.min(Number(process.env.RELAY_DAILY_LIMIT || 300), 10000));

const counters = globalThis.__farangisRelayCounters || new Map();
globalThis.__farangisRelayCounters = counters;

function send(res, status, body) {
  res.status(status).setHeader('Cache-Control', 'no-store');
  return res.json(body);
}

function ipOf(req) {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}

function rateLimit(req, res) {
  const ip = ipOf(req);
  const minute = Math.floor(Date.now() / 60000);
  const minuteKey = `m:${minute}:${ip}`;
  const minuteCount = (counters.get(minuteKey) || 0) + 1;
  counters.set(minuteKey, minuteCount);
  if (minuteCount > MINUTE_LIMIT) {
    send(res, 429, { ok: false, error: 'Relay rate limit exceeded.' });
    return false;
  }

  const day = new Date().toISOString().slice(0, 10);
  const dailyKey = `d:${day}:${ip}`;
  const dailyCount = (counters.get(dailyKey) || 0) + 1;
  counters.set(dailyKey, dailyCount);
  if (dailyCount > DAILY_LIMIT) {
    send(res, 429, { ok: false, error: 'Relay daily limit exceeded.' });
    return false;
  }
  return true;
}

function requireClient(req, res) {
  const supplied = String(req.headers['x-relay-client'] || '');
  if (supplied !== CLIENT_ID) {
    send(res, 403, { ok: false, error: 'Relay client not allowed.' });
    return false;
  }
  return true;
}

function cleanId(value) {
  return String(value || 'grok-room').replace(/[^a-zA-Z0-9._:-]/g, '-').slice(0, 120) || 'grok-room';
}

function contextOf(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_CONTEXT).map((entry) => {
    const role = entry?.role === 'assistant' ? 'assistant' : 'user';
    const content = String(entry?.content || '').trim().slice(0, MAX_TEXT);
    return content ? { role, content } : null;
  }).filter(Boolean);
}

function upstreamHeaders(conversationId) {
  const headers = {
    'content-type': 'application/json',
    'x-farangis-device-id': `grok-salon:${cleanId(conversationId)}`,
    'user-agent': 'farangis-grok-relay/0.2',
  };
  if (BYPASS) headers['x-vercel-protection-bypass'] = BYPASS;
  if (DEVICE_TOKEN) headers['x-farangis-device-token'] = DEVICE_TOKEN;
  return headers;
}

async function upstream(url, options, retry = true) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, redirect: 'follow' });
    if (retry && [502, 503, 504].includes(response.status)) {
      await response.arrayBuffer().catch(() => {});
      return upstream(url, options, false);
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function parseUpstream(response) {
  const text = await response.text();
  try { return JSON.parse(text); }
  catch { return { error: text.slice(0, 300) || 'Invalid upstream response.' }; }
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    if (!requireClient(req, res) || !rateLimit(req, res)) return;
    if (String(req.query?.probe || '') !== 'farangis') {
      return send(res, 200, {
        ok: true,
        service: 'farangis-grok-relay',
        version: '0.2.0',
        config: {
          bypassConfigured: Boolean(BYPASS),
          deviceTokenConfigured: Boolean(DEVICE_TOKEN),
          upstream: FARANGIS_BASE_URL,
        },
      });
    }

    const started = Date.now();
    try {
      const response = await upstream(`${FARANGIS_BASE_URL}/api/v1/health`, {
        method: 'GET',
        headers: upstreamHeaders('health'),
      }, false);
      const data = await parseUpstream(response);
      console.log(JSON.stringify({ event: 'relay_probe', status: response.status, latencyMs: Date.now() - started }));
      return send(res, response.ok ? 200 : 502, {
        ok: response.ok,
        upstreamStatus: response.status,
        farangis: response.ok ? data : undefined,
        error: response.ok ? undefined : (data?.error || `Farangis health failed with ${response.status}`),
      });
    } catch (error) {
      console.error(JSON.stringify({ event: 'relay_probe_error', error: error.name || 'Error', latencyMs: Date.now() - started }));
      return send(res, 502, { ok: false, error: error.name === 'AbortError' ? 'Farangis health timed out.' : 'Farangis health unavailable.' });
    }
  }

  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'Method not allowed.' });
  if (!requireClient(req, res) || !rateLimit(req, res)) return;

  const requestId = crypto.randomUUID();
  const started = Date.now();
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const text = String(body.text || '').trim();
    if (!text) return send(res, 400, { ok: false, error: 'text is required.' });
    if (text.length > MAX_TEXT) return send(res, 413, { ok: false, error: `text exceeds ${MAX_TEXT} characters.` });

    const conversationId = cleanId(body.conversationId || body.conversation_id);
    const response = await upstream(`${FARANGIS_BASE_URL}/api/v1/chat`, {
      method: 'POST',
      headers: upstreamHeaders(conversationId),
      body: JSON.stringify({ text, context: contextOf(body.context) }),
    });
    const data = await parseUpstream(response);

    console.log(JSON.stringify({ event: 'relay_chat', requestId, conversationId, upstreamStatus: response.status, latencyMs: Date.now() - started }));

    if (!response.ok) {
      return send(res, 502, {
        ok: false,
        requestId,
        upstreamStatus: response.status,
        error: data?.error || `Farangis returned ${response.status}`,
      });
    }

    return send(res, 200, {
      ok: true,
      requestId,
      conversationId,
      type: data?.type || 'answer',
      text: String(data?.text || ''),
      action: data?.action,
      cached: Boolean(data?.cached),
      latencyMs: Date.now() - started,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'relay_error', requestId, error: error.name || 'Error', latencyMs: Date.now() - started }));
    return send(res, 502, { ok: false, requestId, error: error.name === 'AbortError' ? 'Farangis request timed out.' : 'Relay upstream unavailable.' });
  }
};
