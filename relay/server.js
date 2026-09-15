'use strict';

const http = require('node:http');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const FARANGIS_BASE_URL = String(
  process.env.FARANGIS_BASE_URL || 'https://farangis-core-v2-i-sector.vercel.app'
).replace(/\/$/, '');
const CLIENT_ID = String(process.env.RELAY_CLIENT_ID || 'grok-salon-v1');
const ACCESS_TOKEN = String(process.env.RELAY_ACCESS_TOKEN || '');
const BYPASS = String(
  process.env.VERCEL_AUTOMATION_BYPASS_SECRET || process.env.FARANGIS_PROTECTION_BYPASS || ''
);
const DEVICE_TOKEN = String(process.env.FARANGIS_DEVICE_TOKEN || '');
const REQUEST_TIMEOUT_MS = Math.max(3000, Math.min(Number(process.env.RELAY_TIMEOUT_MS || 20000), 45000));
const MAX_TEXT_LENGTH = Math.max(200, Math.min(Number(process.env.RELAY_MAX_TEXT_LENGTH || 2400), 8000));
const MAX_CONTEXT = Math.max(0, Math.min(Number(process.env.RELAY_MAX_CONTEXT || 8), 20));
const MINUTE_LIMIT = Math.max(1, Math.min(Number(process.env.RELAY_MINUTE_LIMIT || 30), 300));
const DAILY_LIMIT = Math.max(10, Math.min(Number(process.env.RELAY_DAILY_LIMIT || 300), 10000));
const ALLOWED_ORIGIN = String(process.env.RELAY_ALLOWED_ORIGIN || '*');

const counters = globalThis.__farangisRelayCounters || new Map();
globalThis.__farangisRelayCounters = counters;

function now() { return Date.now(); }
function dayKey() { return new Date().toISOString().slice(0, 10); }

function json(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

function corsHeaders(req) {
  const origin = req.headers.origin || '';
  const allowOrigin = ALLOWED_ORIGIN === '*' ? '*' : (origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN);
  return {
    'access-control-allow-origin': allowOrigin,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,x-relay-client,authorization,x-relay-token',
    'access-control-max-age': '600',
    'vary': 'Origin',
  };
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket.remoteAddress || 'unknown';
}

function safeId(value, fallback = 'anonymous') {
  const cleaned = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._:-]/g, '-')
    .slice(0, 120);
  return cleaned || fallback;
}

function requireClient(req, res) {
  const headers = corsHeaders(req);
  const suppliedClient = String(req.headers['x-relay-client'] || '');
  if (suppliedClient !== CLIENT_ID) {
    json(res, 403, { ok: false, error: 'Relay client not allowed.' }, headers);
    return false;
  }
  if (ACCESS_TOKEN) {
    const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const direct = String(req.headers['x-relay-token'] || '');
    const supplied = bearer || direct;
    const a = Buffer.from(supplied);
    const b = Buffer.from(ACCESS_TOKEN);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      json(res, 401, { ok: false, error: 'Relay authentication failed.' }, headers);
      return false;
    }
  }
  return true;
}

function takeRateLimit(req, res) {
  const ip = clientIp(req);
  const minuteBucket = Math.floor(now() / 60000);
  const minuteKey = `m:${minuteBucket}:${ip}`;
  const minuteCount = (counters.get(minuteKey) || 0) + 1;
  counters.set(minuteKey, minuteCount);
  if (minuteCount > MINUTE_LIMIT) {
    json(res, 429, { ok: false, error: 'Relay rate limit exceeded.' }, corsHeaders(req));
    return false;
  }

  const dailyKey = `d:${dayKey()}:${ip}`;
  const dailyCount = (counters.get(dailyKey) || 0) + 1;
  counters.set(dailyKey, dailyCount);
  if (dailyCount > DAILY_LIMIT) {
    json(res, 429, { ok: false, error: 'Relay daily limit exceeded.' }, corsHeaders(req));
    return false;
  }
  return true;
}

async function readJson(req, maxBytes = 32768) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw Object.assign(new Error('Request body too large.'), { status: 413 });
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); }
  catch { throw Object.assign(new Error('Invalid JSON.'), { status: 400 }); }
}

function upstreamHeaders(conversationId) {
  const headers = {
    'content-type': 'application/json',
    'x-farangis-device-id': `grok-salon:${safeId(conversationId, 'room')}`,
    'user-agent': 'farangis-grok-relay/0.1',
  };
  if (BYPASS) headers['x-vercel-protection-bypass'] = BYPASS;
  if (DEVICE_TOKEN) headers['x-farangis-device-token'] = DEVICE_TOKEN;
  return headers;
}

async function fetchWithTimeout(url, options, retry = true) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, redirect: 'follow' });
    if (retry && [502, 503, 504].includes(response.status)) {
      await response.arrayBuffer().catch(() => {});
      return fetchWithTimeout(url, options, false);
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeContext(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(-MAX_CONTEXT).map((entry) => {
    const role = entry && entry.role === 'assistant' ? 'assistant' : 'user';
    const content = String(entry && entry.content || '').trim().slice(0, MAX_TEXT_LENGTH);
    return content ? { role, content } : null;
  }).filter(Boolean);
}

async function handleFarangisHealth(req, res) {
  if (!requireClient(req, res) || !takeRateLimit(req, res)) return;
  const started = now();
  try {
    const response = await fetchWithTimeout(`${FARANGIS_BASE_URL}/api/v1/health`, {
      method: 'GET',
      headers: upstreamHeaders('health'),
    }, false);
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }
    console.log(JSON.stringify({ event: 'farangis_health', status: response.status, latencyMs: now() - started }));
    json(res, response.ok ? 200 : 502, {
      ok: response.ok,
      upstreamStatus: response.status,
      farangis: response.ok ? data : undefined,
      error: response.ok ? undefined : (data?.error || `Farangis health failed with ${response.status}`),
    }, corsHeaders(req));
  } catch (error) {
    console.error(JSON.stringify({ event: 'farangis_health_error', latencyMs: now() - started, error: error.name || 'Error' }));
    json(res, 502, { ok: false, error: error.name === 'AbortError' ? 'Farangis health timed out.' : 'Farangis health unavailable.' }, corsHeaders(req));
  }
}

async function handleChat(req, res) {
  if (!requireClient(req, res) || !takeRateLimit(req, res)) return;
  const started = now();
  const requestId = crypto.randomUUID();
  try {
    const body = await readJson(req);
    const text = String(body.text || '').trim();
    if (!text) return json(res, 400, { ok: false, error: 'text is required.' }, corsHeaders(req));
    if (text.length > MAX_TEXT_LENGTH) return json(res, 413, { ok: false, error: `text exceeds ${MAX_TEXT_LENGTH} characters.` }, corsHeaders(req));

    const conversationId = safeId(body.conversationId || body.conversation_id || 'grok-room');
    const context = normalizeContext(body.context);
    const response = await fetchWithTimeout(`${FARANGIS_BASE_URL}/api/v1/chat`, {
      method: 'POST',
      headers: upstreamHeaders(conversationId),
      body: JSON.stringify({ text, context }),
    });

    const raw = await response.text();
    let data = null;
    try { data = JSON.parse(raw); } catch { data = { error: raw.slice(0, 300) || 'Invalid upstream response.' }; }

    console.log(JSON.stringify({
      event: 'farangis_chat', requestId, conversationId,
      upstreamStatus: response.status, latencyMs: now() - started,
    }));

    if (!response.ok) {
      return json(res, 502, {
        ok: false,
        requestId,
        upstreamStatus: response.status,
        error: data?.error || `Farangis returned ${response.status}`,
      }, corsHeaders(req));
    }

    return json(res, 200, {
      ok: true,
      requestId,
      conversationId,
      type: data?.type || 'answer',
      text: String(data?.text || ''),
      action: data?.action,
      cached: Boolean(data?.cached),
      latencyMs: now() - started,
    }, corsHeaders(req));
  } catch (error) {
    const status = Number(error.status || 500);
    console.error(JSON.stringify({ event: 'relay_error', requestId, status, error: error.name || 'Error', latencyMs: now() - started }));
    json(res, status >= 400 && status < 500 ? status : 502, {
      ok: false,
      requestId,
      error: error.name === 'AbortError' ? 'Farangis request timed out.' : (status < 500 ? error.message : 'Relay upstream unavailable.'),
    }, corsHeaders(req));
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req));
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, {
      ok: true,
      service: 'farangis-grok-relay',
      version: '0.1.0',
      config: {
        farangisBaseUrl: FARANGIS_BASE_URL,
        bypassConfigured: Boolean(BYPASS),
        deviceTokenConfigured: Boolean(DEVICE_TOKEN),
        accessTokenConfigured: Boolean(ACCESS_TOKEN),
      },
      timestamp: new Date().toISOString(),
    }, corsHeaders(req));
  }

  if (req.method === 'GET' && url.pathname === '/api/farangis/health') return handleFarangisHealth(req, res);
  if (req.method === 'POST' && url.pathname === '/api/chat') return handleChat(req, res);

  return json(res, 404, { ok: false, error: 'Not found.' }, corsHeaders(req));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({
    event: 'relay_started', port: PORT,
    bypassConfigured: Boolean(BYPASS),
    deviceTokenConfigured: Boolean(DEVICE_TOKEN),
    accessTokenConfigured: Boolean(ACCESS_TOKEN),
  }));
});
