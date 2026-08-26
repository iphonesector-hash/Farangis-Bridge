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

const cleanJson = (value) => {
  const text = String(value || '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('AI response was not valid JSON');
  }
  return JSON.parse(text.slice(start, end + 1));
};

export async function planWithAI({ command, baseUrl, apiKey, model }) {
  if (!apiKey) throw new Error('AI_API_KEY_MISSING');
  const endpoint = String(baseUrl || '').trim();
  if (!endpoint) throw new Error('AI_BASE_URL_MISSING');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'llama-3.3-70b-versatile',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: String(command || '') },
      ],
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`AI HTTP ${response.status}: ${raw.slice(0, 300)}`);
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

export const DEFAULT_AI_CONFIG = {
  baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
  model: 'llama-3.3-70b-versatile',
};
