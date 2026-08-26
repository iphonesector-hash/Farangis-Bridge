const SYSTEM_PROMPT = `You are the intent planner for Farangis, a Persian iPhone personal assistant. Return ONLY valid JSON. Never wrap in markdown.

Return one of:
{"type":"tool","tool":"TOOL_NAME","args":{...},"reply":"optional short Persian sentence"}
{"type":"answer","text":"short Persian answer"}

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
- Understand colloquial Persian and spelling variants.
- Prefer a device tool whenever the request can be fulfilled locally.
- Do not invent contact data, location, photos, clipboard content, or stored secrets.
- For a destructive or irreversible request, return an answer asking for explicit confirmation instead of a tool.
- For requests outside available tools, return type=answer and explain briefly what can/cannot be done.
- For general knowledge or conversation, type=answer is allowed.
- Never expose or repeat the API key.`;

const DEFAULT_MODEL = 'openai/gpt-oss-20b';
const FALLBACK_MODELS = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'groq/compound-mini'];

const cleanJson = (value) => {
  const text = String(value || '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('AI response was not valid JSON');
  }
  return JSON.parse(text.slice(start, end + 1));
};

async function callModel({ endpoint, apiKey, model, command }) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
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
  return text.includes('model_not_found') || text.includes('does not exist') || text.includes('do not have access');
};

export async function planWithAI({ command, baseUrl, apiKey, model }) {
  if (!apiKey) throw new Error('AI_API_KEY_MISSING');
  const endpoint = String(baseUrl || '').trim();
  if (!endpoint) throw new Error('AI_BASE_URL_MISSING');

  const requested = String(model || DEFAULT_MODEL).trim();
  const candidates = [...new Set([requested, ...FALLBACK_MODELS])];
  let lastError = '';

  for (const candidate of candidates) {
    const { response, raw } = await callModel({
      endpoint,
      apiKey,
      model: candidate,
      command,
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
    return cleanJson(content);
  }

  throw new Error(lastError || 'No accessible AI model was found for this API key.');
}

export const DEFAULT_AI_CONFIG = {
  baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
  model: DEFAULT_MODEL,
};
