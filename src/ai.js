import * as SecureStore from 'expo-secure-store';

const HISTORY_KEY = 'farangis_ai_history_v1';
const MEMORY_KEY = 'farangis_ai_memories_v1';
const MAX_HISTORY_MESSAGES = 18;
const MAX_MEMORIES = 40;

const SYSTEM_PROMPT = `You are Farangis, a capable Persian iPhone personal assistant and intent planner.
You should feel conversational, context-aware, concise, and practical — not like a rigid command parser.
Return ONLY valid JSON. Never wrap JSON in markdown.

Return one of:
{"type":"tool","tool":"TOOL_NAME","args":{...},"reply":"optional short Persian sentence"}
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
open_url {"url":"..."}
share {"text":"..."}
secure_save {"key":"...","value":"..."}
secure_read {"key":"..."}
calendar_create {"title":"..."}
reminder {"minutes":10,"body":"..."}

Rules:
- Understand colloquial Persian, implied references, pronouns, typos, and spelling variants.
- Use recent conversation context and saved memories when interpreting the current request.
- Prefer a device tool whenever the request can be fulfilled locally.
- If a user says things like «اون»، «همون»، «قبلی»، resolve them from recent conversation when possible.
- For normal conversation or general questions, answer naturally in Persian instead of saying the command is unsupported.
- Do not invent contact data, location, photos, clipboard content, or stored secrets.
- Never claim a device action happened unless you selected the corresponding tool.
- For destructive or irreversible requests, ask for explicit confirmation instead of executing.
- Never expose or repeat the API key.
- Keep answers compact unless the user asks for detail.`;

const DEFAULT_MODEL = 'openai/gpt-oss-120b';
const FALLBACK_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'groq/compound-mini'];

const normalizePersian = (value = '') =>
  String(value)
    .trim()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ');

const safeJsonParse = (value, fallback) => {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const cleanJson = (value) => {
  const text = String(value || '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('AI response was not valid JSON');
  }
  return JSON.parse(text.slice(start, end + 1));
};

async function loadHistory() {
  try {
    const raw = await SecureStore.getItemAsync(HISTORY_KEY);
    const parsed = safeJsonParse(raw || '[]', []);
    return Array.isArray(parsed) ? parsed.slice(-MAX_HISTORY_MESSAGES) : [];
  } catch {
    return [];
  }
}

async function saveHistory(history) {
  try {
    const compact = (Array.isArray(history) ? history : []).slice(-MAX_HISTORY_MESSAGES);
    await SecureStore.setItemAsync(HISTORY_KEY, JSON.stringify(compact));
  } catch (_) {}
}

async function loadMemories() {
  try {
    const raw = await SecureStore.getItemAsync(MEMORY_KEY);
    const parsed = safeJsonParse(raw || '[]', []);
    return Array.isArray(parsed) ? parsed.slice(-MAX_MEMORIES) : [];
  } catch {
    return [];
  }
}

async function saveMemories(memories) {
  try {
    const unique = [...new Set((Array.isArray(memories) ? memories : []).map(normalizePersian).filter(Boolean))];
    await SecureStore.setItemAsync(MEMORY_KEY, JSON.stringify(unique.slice(-MAX_MEMORIES)));
  } catch (_) {}
}

function explicitMemoryCommand(command) {
  const raw = normalizePersian(command);
  const lower = raw.toLowerCase();

  const rememberPrefixes = [
    'یادت باشه ',
    'یادت بمونه ',
    'به خاطر بسپار ',
    'به یاد داشته باش ',
    'remember ',
  ];
  for (const prefix of rememberPrefixes) {
    if (lower.startsWith(prefix.toLowerCase())) {
      return { type: 'remember', text: raw.slice(prefix.length).trim() };
    }
  }

  if (
    lower === 'چی یادت هست' ||
    lower === 'چه چیزایی یادت هست' ||
    lower === 'حافظه ات چیه' ||
    lower === 'حافظه‌ات چیه' ||
    lower === 'what do you remember'
  ) {
    return { type: 'list' };
  }

  if (
    lower === 'حافظه رو پاک کن' ||
    lower === 'حافظه ات رو پاک کن' ||
    lower === 'حافظه‌ات رو پاک کن' ||
    lower === 'همه چیز رو فراموش کن' ||
    lower === 'clear memory'
  ) {
    return { type: 'clear' };
  }

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

  if (action.type === 'list') {
    if (!memories.length) return { type: 'answer', text: 'هنوز چیزی رو به حافظه بلندمدتم نسپردی.' };
    return {
      type: 'answer',
      text: `این‌ها رو یادم مونده:\n${memories.map((m, i) => `${i + 1}. ${m}`).join('\n')}`,
    };
  }

  if (action.type === 'clear') {
    await saveMemories([]);
    await saveHistory([]);
    return { type: 'answer', text: 'حافظه و سابقه گفت‌وگوی محلی پاک شد.' };
  }

  if (action.type === 'forget') {
    const needle = normalizePersian(action.text).toLowerCase();
    const filtered = memories.filter((m) => !normalizePersian(m).toLowerCase().includes(needle));
    await saveMemories(filtered);
    return {
      type: 'answer',
      text: filtered.length === memories.length ? 'چیزی مطابقش توی حافظه پیدا نکردم.' : 'باشه، فراموشش کردم.',
    };
  }

  return null;
}

async function callModel({ endpoint, apiKey, model, command, history, memories }) {
  const memoryContext = memories.length
    ? `Saved long-term user memories (use only when relevant):\n- ${memories.join('\n- ')}`
    : 'No saved long-term memories.';

  const recentMessages = history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_HISTORY_MESSAGES);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'system', content: memoryContext },
        ...recentMessages,
        { role: 'user', content: String(command || '') },
      ],
    }),
  });

  const raw = await response.text();
  return { response, raw };
}

const looksLikeModelError = (status, raw) => {
  if (status === 404) return true;
  const text = String(raw || '').toLowerCase();
  return (
    text.includes('model_not_found') ||
    text.includes('does not exist') ||
    text.includes('do not have access') ||
    text.includes('model is not available')
  );
};

function assistantHistoryText(plan) {
  if (!plan || typeof plan !== 'object') return '';
  if (plan.type === 'answer') return String(plan.text || '');
  if (plan.type === 'tool') {
    const args = plan.args && typeof plan.args === 'object' ? JSON.stringify(plan.args) : '{}';
    return `Tool selected: ${plan.tool || 'unknown'} ${args}${plan.reply ? ` — ${plan.reply}` : ''}`;
  }
  return '';
}

export async function planWithAI({ command, baseUrl, apiKey, model }) {
  const memoryResult = await handleExplicitMemory(command);
  if (memoryResult) return memoryResult;

  if (!apiKey) throw new Error('AI_API_KEY_MISSING');
  const endpoint = String(baseUrl || '').trim();
  if (!endpoint) throw new Error('AI_BASE_URL_MISSING');

  const [history, memories] = await Promise.all([loadHistory(), loadMemories()]);
  const requested = String(model || DEFAULT_MODEL).trim();
  const candidates = [...new Set([requested, ...FALLBACK_MODELS])];
  let lastError = '';

  for (const candidate of candidates) {
    const { response, raw } = await callModel({
      endpoint,
      apiKey,
      model: candidate,
      command,
      history,
      memories,
    });

    if (!response.ok) {
      lastError = `AI HTTP ${response.status}: ${raw.slice(0, 300)}`;
      if (looksLikeModelError(response.status, raw)) continue;
      throw new Error(lastError);
    }

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new Error('AI provider returned invalid JSON');
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (!content) throw new Error('AI provider returned no content');

    const plan = cleanJson(content);
    const assistantText = assistantHistoryText(plan);
    await saveHistory([
      ...history,
      { role: 'user', content: String(command || '') },
      ...(assistantText ? [{ role: 'assistant', content: assistantText }] : []),
    ]);
    return plan;
  }

  throw new Error(lastError || 'No accessible AI model was found for this API key.');
}

export const DEFAULT_AI_CONFIG = {
  baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
  model: DEFAULT_MODEL,
};
