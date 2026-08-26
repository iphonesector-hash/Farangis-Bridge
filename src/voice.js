export const DEFAULT_TRANSCRIPTION_MODEL = 'whisper-large-v3-turbo';

export async function transcribeAudio({ uri, apiKey, model = DEFAULT_TRANSCRIPTION_MODEL }) {
  if (!apiKey) throw new Error('AI_API_KEY_MISSING');
  if (!uri) throw new Error('VOICE_AUDIO_MISSING');

  const form = new FormData();
  form.append('file', {
    uri,
    name: 'farangis-voice.m4a',
    type: 'audio/m4a',
  });
  form.append('model', model);
  form.append('language', 'fa');
  form.append('response_format', 'json');
  form.append('temperature', '0');
  form.append('prompt', 'گفتار فارسی محاوره‌ای برای دستیار شخصی فرنگیس. نام‌ها و فرمان‌های فارسی را دقیق بنویس.');

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`VOICE HTTP ${response.status}: ${raw.slice(0, 300)}`);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error('VOICE_INVALID_RESPONSE');
  }

  const text = String(payload?.text || '').trim();
  if (!text) throw new Error('VOICE_EMPTY_TRANSCRIPT');
  return text;
}
