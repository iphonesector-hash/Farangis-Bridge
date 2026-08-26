import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';

const HISTORY_KEY = 'farangis_ai_history_v2';
const MEMORY_KEY = 'farangis_ai_memories_v2';
const MAX_HISTORY_MESSAGES = 24;
const MAX_MEMORIES = 60;

const SYSTEM_PROMPT = `You are Farangis, a capable Persian iPhone personal assistant and intent planner.
You are conversational, context-aware, practical and concise. Return ONLY valid JSON, never markdown.

Return exactly one of:
{"type":"tool","tool":"TOOL_NAME","args":{},"reply":"optional short Persian sentence"}
{"type":"answer","text":"natural Persian answer"}

Available tools:
contacts_summary {}
list_birthdays {}
find_contact {"name":"..."}
call_contact {"name":"..."}
message_contact {"name":"..."}
photos_count {}
recent_media {}
location {}
open_current_location {}
maps_search {"query":"..."}
clipboard_read {}
clipboard_write {"text":"..."}
google_search {"query":"..."}
internet_search {"query":"..."}
open_url {"url":"..."}
open_app {"app":"..."}
files_pick {}
file_read_selected {}
file_search_selected {"query":"..."}
file_share_selected {}
shortcut_run {"name":"...","input":"..."}
notes_open {}
share {"text":"..."}
secure_save {"key":"...","value":"..."}
secure_read {"key":"..."}
calendar_create {"title":"..."}
reminder {"minutes":10,"body":"..."}

Rules:
- Understand colloquial Persian, typos, implied references and pronouns.
- Use recent conversation, saved memories and DEVICE CONTEXT when relevant.
- If the user asks about their phone model, OS, device type or manufacturer, answer from DEVICE CONTEXT.
- Any request that needs CURRENT or LIVE information (today's prices, currency, weather, news, sports, latest releases, current public facts) MUST use internet_search. Never answer those from model memory.
- Use files_pick when the user asks to browse/open/select a file. iOS requires the system picker; do not claim unrestricted file-system access.
- file_read_selected and file_search_selected operate only on a file the user selected through the Files picker.
- iOS does not expose a complete installed-app list to third-party apps. If asked for all installed apps, explain that limitation. You may still use open_app for known apps.
- Apple Notes does not expose a public API for arbitrary full-database search. Use notes_open to open Notes, or shortcut_run when a matching user Shortcut exists.
- Prefer device tools over generic answers when a tool can fulfill the request.
- Do not invent contacts, files, installed apps, notes, location, photos, clipboard, device data or stored secrets.
- Never claim an action happened unless you selected its tool.
- For destructive/irreversible actions ask for explicit confirmation.
- Never expose or repeat API keys.`;

const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const FALLBACK_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'groq/compound-mini'];

const normalizePersian = (value = '') => String(value).trim().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ');
const safeJsonParse = (value, fallback) => { try { return JSON.parse(value) ?? fallback; } catch { return fallback; } };
const cleanJson = (value) => {
  const text = String(value || '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) throw new Error('AI response was not valid JSON');
  return JSON.parse(text.slice(start, end + 1));
};

const deviceTypeName = (type) => {
  const map = {
    [Device.DeviceType.UNKNOWN]: 'unknown',
    [Device.DeviceType.PHONE]: 'phone',
    [Device.DeviceType.TABLET]: 'tablet',
    [Device.DeviceType.DESKTOP]: 'desktop',
    [Device.DeviceType.TV]: 'tv',
  };
  return map[type] || 'unknown';
};

async function getDeviceContext() {
  let asyncType = null;
  try { asyncType = await Device.getDeviceTypeAsync(); } catch (_) {}
  return `DEVICE CONTEXT (live):\n${JSON.stringify({
    brand: Device.brand || null,
    manufacturer: Device.manufacturer || null,
    modelName: Device.modelName || null,
    modelId: Device.modelId || null,
    deviceName: Device.deviceName || null,
    deviceType: deviceTypeName(asyncType ?? Device.deviceType),
    deviceYearClass: Device.deviceYearClass || null,
    osName: Device.osName || null,
    osVersion: Device.osVersion || null,
    isRealDevice: Boolean(Device.isDevice),
  }, null, 2)}`;
}

async function loadHistory() {
  try {
    const parsed = safeJsonParse((await SecureStore.getItemAsync(HISTORY_KEY)) || '[]', []);
    return Array.isArray(parsed) ? parsed.slice(-MAX_HISTORY_MESSAGES) : [];
  } catch { return []; }
}
async function saveHistory(history) {
  try { await SecureStore.setItemAsync(HISTORY_KEY, JSON.stringify((history || []).slice(-MAX_HISTORY_MESSAGES))); } catch (_) {}
}
async function loadMemories() {
  try {
    const parsed = safeJsonParse((await SecureStore.getItemAsync(MEMORY_KEY)) || '[]', []);
    return Array.isArray(parsed) ? parsed.slice(-MAX_MEMORIES) : [];
  } catch { return []; }
}
async function saveMemories(memories) {
  try {
    const unique = [...new Set((memories || []).map(normalizePersian).filter(Boolean))];
    await SecureStore.setItemAsync(MEMORY_KEY, JSON.stringify(unique.slice(-MAX_MEMORIES)));
  } catch (_) {}
}

function explicitMemoryCommand(command) {
  const raw = normalizePersian(command);
  const lower = raw.toLowerCase();
  for (const prefix of ['یادت باشه ', 'یادت بمونه ', 'به خاطر بسپار ', 'به یاد داشته باش ', 'remember ']) {
    if (lower.startsWith(prefix.toLowerCase())) return { type: 'remember', text: raw.slice(prefix.length).trim() };
  }
  if (['چی یادت هست','چه چیزایی یادت هست','حافظه ات چیه','حافظه‌ات چیه','what do you remember'].includes(lower)) return { type: 'list' };
  if (['حافظه رو پاک کن','حافظه ات رو پاک کن','حافظه‌ات رو پاک کن','همه چیز رو فراموش کن','clear memory'].includes(lower)) return { type: 'clear' };
  const forgetMatch = raw.match(/^(?:فراموش کن|از یادت ببر)\s+(.+)$/i);
  if (forgetMatch) return { type: 'forget', text: forgetMatch[1].trim() };
  return null;
}

async function handleExplicitMemory(command) {
  const action = explicitMemoryCommand(command);
  if (!action) return null;
  const memories = await loadMemories();
  if (action.type === 'remember') {
    if (!action.text) return { type: 'answer', text: 'چی رو می‌خوای یادم بمونه؟' };
    await saveMemories([...memories, action.text]);
    return { type: 'answer', text: `باشه، یادم می‌مونه: ${action.text}` };
  }
  if (action.type === 'list') return { type: 'answer', text: memories.length ? `این‌ها رو یادم مونده:\n${memories.map((m,i)=>`${i+1}. ${m}`).join('\n')}` : 'هنوز چیزی رو به حافظه بلندمدتم نسپردی.' };
  if (action.type === 'clear') {
    await saveMemories([]); await saveHistory([]);
    return { type: 'answer', text: 'حافظه و سابقه گفت‌وگوی محلی پاک شد.' };
  }
  if (action.type === 'forget') {
    const needle = normalizePersian(action.text).toLowerCase();
    const filtered = memories.filter((m) => !normalizePersian(m).toLowerCase().includes(needle));
    await saveMemories(filtered);
    return { type: 'answer', text: filtered.length === memories.length ? 'چیزی مطابقش توی حافظه پیدا نکردم.' : 'باشه، فراموشش کردم.' };
  }
  return null;
}

async function callPlanner({ endpoint, apiKey, model, command, history, memories, deviceContext }) {
  const memoryContext = memories.length ? `Saved long-term memories:\n- ${memories.join('\n- ')}` : 'No saved long-term memories.';
  const recent = history.filter((m) => m && ['user','assistant'].includes(m.role) && typeof m.content === 'string').slice(-MAX_HISTORY_MESSAGES);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.25,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'system', content: memoryContext },
        { role: 'system', content: deviceContext },
        ...recent,
        { role: 'user', content: String(command || '') },
      ],
    }),
  });
  return { response, raw: await response.text() };
}

const looksLikeModelError = (status, raw) => {
  if (status === 404) return true;
  const text = String(raw || '').toLowerCase();
  return text.includes('model_not_found') || text.includes('does not exist') || text.includes('do not have access') || text.includes('model is not available');
};

function assistantHistoryText(plan) {
  if (plan?.type === 'answer') return String(plan.text || '');
  if (plan?.type === 'tool') return `Tool selected: ${plan.tool || 'unknown'} ${JSON.stringify(plan.args || {})}`;
  return '';
}

export async function planWithAI({ command, baseUrl, apiKey, model }) {
  const memoryResult = await handleExplicitMemory(command);
  if (memoryResult) return memoryResult;
  if (!apiKey) throw new Error('AI_API_KEY_MISSING');
  const endpoint = String(baseUrl || '').trim();
  if (!endpoint) throw new Error('AI_BASE_URL_MISSING');

  const [history, memories, deviceContext] = await Promise.all([loadHistory(), loadMemories(), getDeviceContext()]);
  const candidates = [...new Set([String(model || DEFAULT_MODEL).trim(), ...FALLBACK_MODELS])];
  let lastError = '';
  for (const candidate of candidates) {
    const { response, raw } = await callPlanner({ endpoint, apiKey, model: candidate, command, history, memories, deviceContext });
    if (!response.ok) {
      lastError = `AI HTTP ${response.status}: ${raw.slice(0, 300)}`;
      if (looksLikeModelError(response.status, raw)) continue;
      throw new Error(lastError);
    }
    const payload = safeJsonParse(raw, null);
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) throw new Error('AI provider returned no content');
    const plan = cleanJson(content);
    const assistantText = assistantHistoryText(plan);
    await saveHistory([...history, { role: 'user', content: String(command || '') }, ...(assistantText ? [{ role: 'assistant', content: assistantText }] : [])]);
    return plan;
  }
  throw new Error(lastError || 'No accessible AI model was found for this API key.');
}

export async function answerWithInternet({ query, baseUrl, apiKey }) {
  if (!apiKey) throw new Error('AI_API_KEY_MISSING');
  const endpoint = String(baseUrl || DEFAULT_AI_CONFIG.baseUrl).trim();
  const [history, memories, deviceContext] = await Promise.all([loadHistory(), loadMemories(), getDeviceContext()]);
  const prompt = `You are Farangis. Answer the user's request in natural Persian. This request may need live/current public information. Use your built-in web search and website tools whenever useful. Prefer recent trustworthy sources, state dates when freshness matters, and do not fabricate current values. Be concise but include enough context.\n\n${deviceContext}\n\nSaved memories when relevant:\n${memories.join('\n') || 'none'}`;
  const recent = history.filter((m) => m && ['user','assistant'].includes(m.role) && typeof m.content === 'string').slice(-8);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'groq/compound',
      messages: [
        { role: 'system', content: prompt },
        ...recent,
        { role: 'user', content: String(query || '') },
      ],
    }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Internet AI HTTP ${response.status}: ${raw.slice(0, 400)}`);
  const payload = safeJsonParse(raw, null);
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Internet agent returned no content');
  await saveHistory([...history, { role: 'user', content: String(query || '') }, { role: 'assistant', content: String(content) }]);
  return String(content);
}

export const DEFAULT_AI_CONFIG = {
  baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
  model: DEFAULT_MODEL,
};
