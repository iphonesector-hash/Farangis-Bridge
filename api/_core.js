const memoryCache = globalThis.__farangisCache || new Map();
globalThis.__farangisCache = memoryCache;

const now = () => Date.now();

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function requireDevice(req, res) {
  const configured = process.env.FARANGIS_DEVICE_TOKEN || '';
  if (!configured) return true;
  const supplied = String(req.headers['x-farangis-device-token'] || '');
  if (supplied !== configured) {
    json(res, 401, { error: 'دسترسی دستگاه تأیید نشد.' });
    return false;
  }
  return true;
}

function rateLimit(req, res, limit = 45, windowMs = 60_000) {
  const id = String(req.headers['x-farangis-device-id'] || req.socket?.remoteAddress || 'anonymous');
  const key = `rate:${id}`;
  const entry = memoryCache.get(key) || { count: 0, resetAt: now() + windowMs };
  if (now() > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now() + windowMs;
  }
  entry.count += 1;
  memoryCache.set(key, entry);
  if (entry.count > limit) {
    json(res, 429, { error: 'تعداد درخواست‌ها زیاد شده؛ چند لحظه بعد دوباره امتحان کن.' });
    return false;
  }

  const dailyLimit = Number(process.env.FARANGIS_DAILY_REQUEST_LIMIT || 1500);
  const day = new Date().toISOString().slice(0, 10);
  const dailyKey = `daily:${day}:${id}`;
  const dailyCount = (memoryCache.get(dailyKey) || 0) + 1;
  memoryCache.set(dailyKey, dailyCount);
  if (dailyLimit > 0 && dailyCount > dailyLimit) {
    json(res, 429, { error: 'سقف مصرف روزانه فرنگیس برای محافظت از هزینه‌ها پر شده است.' });
    return false;
  }
  return true;
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function normalizeFa(value = '') {
  return String(value)
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/ي/g, 'ی').replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ').trim();
}

const numberWords = {
  صفر:0, یک:1, يه:1, یه:1, دو:2, سه:3, چهار:4, پنج:5, شش:6, هفت:7, هشت:8, نه:9,
  ده:10, یازده:11, دوازده:12, سیزده:13, چهارده:14, پانزده:15, شانزده:16, هفده:17, هجده:18, نوزده:19,
  بیست:20, سی:30, چهل:40, پنجاه:50, شصت:60, هفتاد:70, هشتاد:80, نود:90,
  صد:100, دویست:200, سیصد:300, چهارصد:400, پانصد:500, ششصد:600, هفتصد:700, هشتصد:800, نهصد:900,
};

function parseWordNumber(tokens) {
  let total = 0, current = 0, matched = false;
  for (const token of tokens) {
    if (token === 'و') continue;
    if (token === 'هزار') { total += Math.max(1, current) * 1_000; current = 0; matched = true; continue; }
    if (token === 'میلیون') { total += Math.max(1, current) * 1_000_000; current = 0; matched = true; continue; }
    if (Object.prototype.hasOwnProperty.call(numberWords, token)) { current += numberWords[token]; matched = true; continue; }
    break;
  }
  return matched ? total + current : null;
}

function parsePersianAmount(text) {
  const t = normalizeFa(text).toLowerCase();
  const digitMatch = t.match(/([0-9][0-9,]*)\s*(میلیون|هزار)?/);
  if (digitMatch) {
    let n = Number(digitMatch[1].replace(/,/g, ''));
    if (digitMatch[2] === 'هزار') n *= 1_000;
    if (digitMatch[2] === 'میلیون') n *= 1_000_000;
    const ambiguousToman = /تومن|تومان/.test(t) && !digitMatch[2] && n > 0 && n < 10_000;
    return { amount: ambiguousToman ? n * 1_000 : n, ambiguousToman };
  }

  const tokens = t.split(/[\s‌-]+/).filter(Boolean);
  let best = null;
  for (let i = 0; i < tokens.length; i += 1) {
    if (!Object.prototype.hasOwnProperty.call(numberWords, tokens[i])) continue;
    const sequence = [];
    for (let j = i; j < tokens.length; j += 1) {
      const token = tokens[j];
      if (token === 'و' || token === 'هزار' || token === 'میلیون' || Object.prototype.hasOwnProperty.call(numberWords, token)) sequence.push(token);
      else break;
    }
    const value = parseWordNumber(sequence);
    if (value !== null && (best === null || value > best)) best = value;
  }
  return best !== null ? { amount: best, ambiguousToman: false } : { amount: null, ambiguousToman: false };
}

function parseRelativeMinutes(text) {
  const t = normalizeFa(text).toLowerCase();
  const digit = t.match(/([0-9]+)\s*(دقیقه|ساعت|روز)/);
  if (digit) {
    const value = Number(digit[1]);
    if (digit[2] === 'دقیقه') return value;
    if (digit[2] === 'ساعت') return value * 60;
    if (digit[2] === 'روز') return value * 1440;
  }
  if (/نیم ساعت/.test(t)) return 30;
  const unitMatch = t.match(/((?:[آ-ی]+(?:\s+و\s+)?)+)\s+(دقیقه|ساعت|روز)/);
  if (unitMatch) {
    const words = unitMatch[1].split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length; i += 1) {
      if (!Object.prototype.hasOwnProperty.call(numberWords, words[i])) continue;
      const value = parseWordNumber(words.slice(i));
      if (value !== null) {
        if (unitMatch[2] === 'دقیقه') return value;
        if (unitMatch[2] === 'ساعت') return value * 60;
        if (unitMatch[2] === 'روز') return value * 1440;
      }
    }
  }
  if (/پس ?فردا/.test(t)) return 2880;
  if (/فردا/.test(t)) return 1440;
  return null;
}

function parseIntent(text) {
  const raw = normalizeFa(text);
  const t = raw.toLowerCase();
  const moneyInfo = parsePersianAmount(t);
  if (/(گرفتم|دریافت کردم|حساب کردم|هزینه)/.test(t) && moneyInfo.amount) {
    const nameMatch = t.match(/(?:از|برای)\s+([^،,.]+?)(?:\s+(?:گرفتم|دریافت|فیلتر|سرویس|هزینه)|$)/);
    return {
      type: 'action',
      tool: 'aquagold.customer_payment',
      args: {
        customerName: nameMatch?.[1]?.trim() || '',
        amount: moneyInfo.amount,
        amountWasColloquial: moneyInfo.ambiguousToman,
        raw,
      },
    };
  }
  if (/(آخرین بار|قبلا|قبلاً).*(چقدر|مبلغ|گرفتم)/.test(t)) {
    return { type: 'action', tool: 'aquagold.customer_history', args: { query: raw } };
  }
  if (/(یادآوری|یادم بنداز)/.test(t)) {
    return { type: 'action', tool: 'reminder.create', args: { raw, minutes: parseRelativeMinutes(t) } };
  }
  if (/(مسیر|نقشه|آدرس)/.test(t)) return { type: 'action', tool: 'maps.search', args: { query: raw } };
  return { type: 'chat', tool: null, args: {} };
}

async function groqRequest({ key, messages, model }) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature: 0.35, max_tokens: 900 }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || 'Groq request failed');
  return data?.choices?.[0]?.message?.content?.trim() || '';
}

async function groqChat({ messages, model }) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY تنظیم نشده است.');
  const primary = model || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  try {
    return await groqRequest({ key, messages, model: primary });
  } catch (primaryError) {
    const fallback = process.env.GROQ_FALLBACK_MODEL;
    if (!fallback || fallback === primary) throw primaryError;
    return groqRequest({ key, messages, model: fallback });
  }
}

async function supabase(path, { method = 'GET', body, query = '' } = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${path}${query}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: method === 'POST' ? 'return=representation' : 'return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  const responseText = await response.text();
  return responseText ? JSON.parse(responseText) : null;
}

async function saveMemory({ deviceId, kind, content, metadata = {} }) {
  if (!content) return;
  return supabase('farangis_memory', { method: 'POST', body: { device_id: deviceId, kind, content, metadata } });
}

async function recentMemory(deviceId, limit = 8) {
  const encoded = encodeURIComponent(deviceId);
  return (await supabase('farangis_memory', { query: `?device_id=eq.${encoded}&select=kind,content,metadata,created_at&order=created_at.desc&limit=${limit}` })) || [];
}

async function logAction({ deviceId, action, args, status, result }) {
  return supabase('farangis_actions', { method: 'POST', body: { device_id: deviceId, action, args, status, result } });
}

function cacheGet(key) {
  const entry = memoryCache.get(`cache:${key}`);
  if (!entry || entry.expires < now()) return null;
  return entry.value;
}
function cacheSet(key, value, ttl = 30_000) { memoryCache.set(`cache:${key}`, { value, expires: now() + ttl }); }

module.exports = {
  json, requireDevice, rateLimit, readJson, normalizeFa, parsePersianAmount, parseRelativeMinutes, parseIntent,
  groqChat, supabase, saveMemory, recentMemory, logAction, cacheGet, cacheSet,
};
