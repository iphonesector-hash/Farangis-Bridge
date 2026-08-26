import * as SecureStore from 'expo-secure-store';

const KEY_BASE_URL = 'farangis_core_url';
const KEY_DEVICE_TOKEN = 'farangis_device_token';
const KEY_DEVICE_ID = 'farangis_device_id';

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
  return { baseUrl: cleanBase(baseUrl), deviceToken: deviceToken || '', deviceId };
}

export async function saveCoreConfig({ baseUrl, deviceToken }) {
  await Promise.all([
    SecureStore.setItemAsync(KEY_BASE_URL, cleanBase(baseUrl)),
    SecureStore.setItemAsync(KEY_DEVICE_TOKEN, String(deviceToken || '').trim()),
  ]);
}

async function coreFetch(path, options = {}) {
  const cfg = await getCoreConfig();
  if (!cfg.baseUrl) throw new Error('آدرس Farangis Core هنوز تنظیم نشده.');
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
  if (!response.ok) throw new Error(data?.error || data?.message || `HTTP ${response.status}`);
  return data;
}

export async function healthCheck() {
  return coreFetch('/api/v1/health', { method: 'GET', headers: { 'Content-Type': 'application/json' } });
}

export async function sendChat({ text, context = [], mode = 'assistant' }) {
  return coreFetch('/api/v1/chat', {
    method: 'POST',
    body: JSON.stringify({ text, context, mode }),
  });
}

export async function submitAction(action) {
  return coreFetch('/api/v1/actions', {
    method: 'POST',
    body: JSON.stringify(action),
  });
}

export async function transcribeViaCore({ uri }) {
  const cfg = await getCoreConfig();
  if (!cfg.baseUrl) throw new Error('آدرس Farangis Core هنوز تنظیم نشده.');
  const form = new FormData();
  form.append('file', { uri, name: 'voice.m4a', type: 'audio/m4a' });
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
}

export async function buildTtsDownloadUrl(text) {
  const cfg = await getCoreConfig();
  if (!cfg.baseUrl) throw new Error('آدرس Farangis Core هنوز تنظیم نشده.');
  const safeText = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
  return {
    url: `${cfg.baseUrl}/api/v1/voice/tts?text=${encodeURIComponent(safeText)}`,
    headers: {
      'x-farangis-device-id': cfg.deviceId,
      ...(cfg.deviceToken ? { 'x-farangis-device-token': cfg.deviceToken } : {}),
    },
  };
}
