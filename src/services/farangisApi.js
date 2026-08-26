import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { Linking } from 'react-native';
import { enqueueAction, flushActionQueue } from './offlineQueue';

const KEY_BASE_URL = 'farangis_core_url';
const KEY_DEVICE_TOKEN = 'farangis_device_token';
const KEY_DEVICE_ID = 'farangis_device_id';
const LEGACY_GROQ_KEY = 'farangis_ai_key';
const LEGACY_GROQ_MODEL = 'farangis_ai_model';
const DEFAULT_CORE_URL = 'https://farangis-core-v2-i-sector.vercel.app';
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

const cleanBase = (value = '') => String(value).trim().replace(/\/+$/, '');

export async function getCoreConfig() {
  const [baseUrl, deviceToken, storedDeviceId] = await Promise.all([
    SecureStore.getItemAsync(KEY_BASE_URL),
    SecureStore.getItemAsync(KEY_DEVICE_TOKEN),
    SecureStore.getItemAsync(KEY_DEVICE_ID),
  ]);
  let deviceId = storedDeviceId;
  if (!deviceId) {
    deviceId = `ios-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await SecureStore.setItemAsync(KEY_DEVICE_ID, deviceId);
  }
  return { baseUrl: cleanBase(baseUrl || DEFAULT_CORE_URL), deviceToken: deviceToken || '', deviceId };
}

export async function saveCoreConfig({ baseUrl, deviceToken }) {
  await Promise.all([
    SecureStore.setItemAsync(KEY_BASE_URL, cleanBase(baseUrl || DEFAULT_CORE_URL)),
    SecureStore.setItemAsync(KEY_DEVICE_TOKEN, String(deviceToken || '').trim()),
  ]);
}

async function getLocalGroqConfig() {
  const [key, model] = await Promise.all([
    SecureStore.getItemAsync(LEGACY_GROQ_KEY),
    SecureStore.getItemAsync(LEGACY_GROQ_MODEL),
  ]);
  return { key: String(key || '').trim(), model: String(model || DEFAULT_GROQ_MODEL).trim() || DEFAULT_GROQ_MODEL };
}

async function coreFetch(path, options = {}) {
  const cfg = await getCoreConfig();
  const headers = {
    'Content-Type': 'application/json',
    'x-farangis-device-id': cfg.deviceId,
    ...(cfg.deviceToken ? { 'x-farangis-device-token': cfg.deviceToken } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(`${cfg.baseUrl}${path}`, { ...options, headers });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  if (!response.ok) {
    const error = new Error(data?.error || data?.message || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function directGroqChat({ text, context = [] }) {
  const { key, model } = await getLocalGroqConfig();
  if (!key) throw new Error('کلید Groq روی گوشی تنظیم نشده است.');
  const messages = [
    {
      role: 'system',
      content: 'تو فرنگیس هستی؛ دستیار شخصی فارسی‌زبان، صمیمی، سریع و حرفه‌ای. پاسخ‌ها فارسی، طبیعی و برای شنیدن با صدا روان باشند.',
    },
    ...context.slice(-8).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || ''),
    })).filter((m) => m.content),
    { role: 'user', content: String(text || '') },
  ];
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature: 0.35, max_tokens: 900 }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Groq HTTP ${response.status}`);
  const answer = String(data?.choices?.[0]?.message?.content || '').trim();
  if (!answer) throw new Error('پاسخ خالی از Groq دریافت شد.');
  return { ok: true, type: 'answer', text: answer, fallback: 'device-groq' };
}

async function directGroqTranscription(uri) {
  const { key } = await getLocalGroqConfig();
  if (!key) throw new Error('کلید Groq روی گوشی تنظیم نشده است.');
  const form = new FormData();
  form.append('file', { uri, name: 'voice.m4a', type: 'audio/m4a' });
  form.append('model', 'whisper-large-v3-turbo');
  form.append('language', 'fa');
  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Groq STT HTTP ${response.status}`);
  return String(data.text || '').trim();
}

async function runClientAction(result) {
  if (!result?.clientAction) return result;
  if (result.tool === 'maps.search') {
    await Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(result.args?.query || '')}`);
    return { clientAction: false, message: 'نقشه باز شد.' };
  }
  if (result.tool === 'reminder.create') {
    const permission = await Notifications.requestPermissionsAsync();
    if (permission.status !== 'granted') return { clientAction: false, message: 'دسترسی اعلان‌ها داده نشده.' };
    const minutes = Math.max(1, Number(result.args?.minutes || 1));
    await Notifications.scheduleNotificationAsync({
      content: { title: 'فرنگیس', body: result.args?.raw || 'یادآوری', sound: true },
      trigger: { seconds: minutes * 60 },
    });
    return { clientAction: false, message: `یادآوری برای ${minutes.toLocaleString('fa-IR')} دقیقه دیگر ثبت شد.` };
  }
  return result;
}

async function submitActionRaw(action) {
  const response = await coreFetch('/api/v1/actions', {
    method: 'POST',
    body: JSON.stringify(action),
  });
  if (response?.result?.clientAction) response.result = await runClientAction(response.result);
  return response;
}

export async function healthCheck() {
  let result;
  try {
    result = await coreFetch('/api/v1/health', { method: 'GET', headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    result = { ok: false, checks: { core: false }, error: String(error.message || error) };
  }
  const { key } = await getLocalGroqConfig();
  result.clientFallback = {
    groq: Boolean(key),
    iosTts: true,
  };
  result.voiceReady = Boolean(result.voiceReady || key);
  flushActionQueue((action) => submitActionRaw(action)).catch(() => {});
  return result;
}

export async function sendChat({ text, context = [], mode = 'assistant' }) {
  try {
    return await coreFetch('/api/v1/chat', {
      method: 'POST',
      body: JSON.stringify({ text, context, mode }),
    });
  } catch (coreError) {
    try {
      return await directGroqChat({ text, context });
    } catch (fallbackError) {
      const error = new Error(`هسته فرنگیس: ${coreError.message || coreError} | Groq روی گوشی: ${fallbackError.message || fallbackError}`);
      error.code = 'AI_UNAVAILABLE';
      throw error;
    }
  }
}

export async function submitAction(action, { allowQueue = true } = {}) {
  try {
    return await submitActionRaw(action);
  } catch (error) {
    const safeToQueue = allowQueue && action?.confirmed === true && action?.tool;
    if (!safeToQueue) throw error;
    await enqueueAction(action);
    return {
      ok: true,
      result: {
        queued: true,
        offline: true,
        message: 'اتصال برقرار نبود؛ فرمان برای ارسال مجدد در صف امن گوشی ذخیره شد.',
      },
    };
  }
}

export async function transcribeViaCore({ uri }) {
  try {
    const cfg = await getCoreConfig();
    const form = new FormData();
    form.append('file', { uri, name: 'voice.m4a', type: 'audio/m4a' });
    form.append('model', 'whisper-large-v3-turbo');
    form.append('language', 'fa');
    const response = await fetch(`${cfg.baseUrl}/api/v1/voice/stt`, {
      method: 'POST',
      headers: {
        'x-farangis-device-id': cfg.deviceId,
        ...(cfg.deviceToken ? { 'x-farangis-device-token': cfg.deviceToken } : {}),
      },
      body: form,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || `STT HTTP ${response.status}`);
    return data.text || '';
  } catch (coreError) {
    try {
      return await directGroqTranscription(uri);
    } catch (fallbackError) {
      throw new Error(`STT هسته: ${coreError.message || coreError} | STT گوشی: ${fallbackError.message || fallbackError}`);
    }
  }
}

export async function buildTtsDownloadUrl(text) {
  const cfg = await getCoreConfig();
  const safeText = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
  return {
    url: `${cfg.baseUrl}/api/v1/voice/tts?text=${encodeURIComponent(safeText)}`,
    headers: {
      'x-farangis-device-id': cfg.deviceId,
      ...(cfg.deviceToken ? { 'x-farangis-device-token': cfg.deviceToken } : {}),
    },
  };
}
