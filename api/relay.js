const crypto = require('node:crypto');

const DEFAULT_RUNTIME_URL = 'https://sector-assistant-git-feat-farangis-runtime-20260916-i-sector.vercel.app/api/farangis-runtime';
const RUNTIME_URL = String(process.env.FARANGIS_RUNTIME_URL || DEFAULT_RUNTIME_URL);
const BRIDGE_BASE_URL = String(process.env.FARANGIS_BASE_URL || '').replace(/\/$/, '');
const MODE = BRIDGE_BASE_URL ? 'bridge' : 'runtime';
const CLIENT_ID = String(process.env.RELAY_CLIENT_ID || 'grok-salon-v1');
const RUNTIME_CLIENT = String(process.env.FARANGIS_RUNTIME_CLIENT || 'farangis-relay-v1');
const BYPASS = String(process.env.VERCEL_AUTOMATION_BYPASS_SECRET || process.env.FARANGIS_PROTECTION_BYPASS || '');
const DEVICE_TOKEN = String(process.env.FARANGIS_DEVICE_TOKEN || '');
const TIMEOUT_MS = Math.max(3000, Math.min(Number(process.env.RELAY_TIMEOUT_MS || 20000), 30000));
const MAX_TEXT = Math.max(200, Math.min(Number(process.env.RELAY_MAX_TEXT_LENGTH || 2400), 8000));
const MAX_CONTEXT = Math.max(0, Math.min(Number(process.env.RELAY_MAX_CONTEXT || 8), 20));
const MINUTE_LIMIT = Math.max(1, Math.min(Number(process.env.RELAY_MINUTE_LIMIT || 12), 120));
const DAILY_LIMIT = Math.max(10, Math.min(Number(process.env.RELAY_DAILY_LIMIT || 120), 2000));

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
  const minuteKey = `m:${Math.floor(Date.now() / 60000)}:${ip}`;
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

function suppliedClient(req) {
  return String(req.headers['x-relay-client'] || req.query?.client || '');
}

function requireClient(req, res) {
  if (suppliedClient(req) !== CLIENT_ID) {
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
    if (!entry || (entry.role !== 'assistant' && entry.role !== 'user')) return null;
    const content = String(entry.content || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
    return content ? { role: entry.role, content } : null;
  }).filter(Boolean);
}

function target() {
  if (MODE === 'bridge') {
    return {
      url: `${BRIDGE_BASE_URL}/api/v1/chat`,
      headers: (conversationId) => {
        const headers = {
          'content-type': 'application/json',
          'x-farangis-device-id': `grok-salon:${cleanId(conversationId)}`,
          'user-agent': 'farangis-grok-relay/0.4'
        };
        if (BYPASS) headers['x-vercel-protection-bypass'] = BYPASS;
        if (DEVICE_TOKEN) headers['x-farangis-device-token'] = DEVICE_TOKEN;
        return headers;
      }
    };
  }

  return {
    url: RUNTIME_URL,
    headers: () => ({
      'content-type': 'application/json',
      'x-farangis-runtime-client': RUNTIME_CLIENT,
      'user-agent': 'farangis-grok-relay/0.4'
    })
  };
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

async function callFarangis({ text, context = [], conversationId = 'grok-room', retry = true }) {
  const destination = target();
  const response = await upstream(destination.url, {
    method: 'POST',
    headers: destination.headers(conversationId),
    body: JSON.stringify({ text, context, conversationId })
  }, retry);
  return { response, data: await parseUpstream(response) };
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    if (String(req.query?.probe || '') !== 'farangis') {
      return send(res, 200, {
        ok: true,
        service: 'farangis-grok-relay',
        version: '0.4.0',
        config: {
          mode: MODE,
          runtime: MODE === 'runtime' ? RUNTIME_URL : undefined,
          bridge: MODE === 'bridge' ? BRIDGE_BASE_URL : undefined,
          bypassConfigured: Boolean(BYPASS),
          deviceTokenConfigured: Boolean(DEVICE_TOKEN)
        }
      });
    }

    if (!requireClient(req, res) || !rateLimit(req, res)) return;
    const started = Date.now();
    try {
      const { response, data } = await callFarangis({
        text: 'برای تست اتصال فقط کوتاه بگو: فرنگیس آنلاین است.',
        conversationId: 'relay-probe',
        retry: false
      });
      console.log(JSON.stringify({ event: 'relay_probe', mode: MODE, status: response.status, latencyMs: Date.now() - started }));
      return send(res, response.ok ? 200 : 502, {
        ok: response.ok,
        mode: MODE,
        upstreamStatus: response.status,
        provider: data?.provider,
        model: data?.model,
        text: response.ok ? String(data?.text || '') : undefined,
        error: response.ok ? undefined : (data?.error || `Farangis returned ${response.status}`)
      });
    } catch (error) {
      console.error(JSON.stringify({ event: 'relay_probe_error', mode: MODE, error: error.name || 'Error', latencyMs: Date.now() - started }));
      return send(res, 502, { ok: false, mode: MODE, error: error.name === 'AbortError' ? 'Farangis probe timed out.' : 'Farangis probe unavailable.' });
    }
  }

  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'Method not allowed.' });
  if (!requireClient(req, res) || !rateLimit(req, res)) return;

  const requestId = crypto.randomUUID();
  const started = Date.now();
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const text = String(body.text || '').replace(/\s+/g, ' ').trim();
    if (!text) return send(res, 400, { ok: false, error: 'text is required.' });
    if (text.length > MAX_TEXT) return send(res, 413, { ok: false, error: `text exceeds ${MAX_TEXT} characters.` });

    const conversationId = cleanId(body.conversationId || body.conversation_id);
    const { response, data } = await callFarangis({
      text,
      context: contextOf(body.context),
      conversationId
    });

    console.log(JSON.stringify({ event: 'relay_chat', requestId, conversationId, mode: MODE, upstreamStatus: response.status, latencyMs: Date.now() - started }));

    if (!response.ok) {
      return send(res, 502, {
        ok: false,
        requestId,
        mode: MODE,
        upstreamStatus: response.status,
        error: data?.error || `Farangis returned ${response.status}`
      });
    }

    return send(res, 200, {
      ok: true,
      requestId,
      conversationId,
      mode: MODE,
      type: data?.type || 'answer',
      text: String(data?.text || ''),
      provider: data?.provider,
      model: data?.model,
      latencyMs: Date.now() - started
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'relay_error', requestId, mode: MODE, error: error.name || 'Error', latencyMs: Date.now() - started }));
    return send(res, 502, { ok: false, requestId, mode: MODE, error: error.name === 'AbortError' ? 'Farangis request timed out.' : 'Relay upstream unavailable.' });
  }
};
