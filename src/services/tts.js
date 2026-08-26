import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import { buildTtsDownloadUrl } from './farangisApi';

let activeSound = null;

const LEGACY_ELEVENLABS_KEY = 'farangis_tts_test_elevenlabs_key';
const ELEVENLABS_KEY = 'farangis_elevenlabs_key';
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';
const DEFAULT_MODEL = 'eleven_v3';
const preferredVoiceNames = ['neda', 'roya', 'sara', 'shadi', 'female', 'persian'];

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return global.btoa(binary);
};

async function stopSound() {
  try {
    if (activeSound) {
      await activeSound.stopAsync().catch(() => {});
      await activeSound.unloadAsync().catch(() => {});
    }
  } finally {
    activeSound = null;
  }
}

async function playFile(uri) {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
  });

  const { sound } = await Audio.Sound.createAsync(
    { uri },
    { shouldPlay: true, volume: 1.0, progressUpdateIntervalMillis: 100 }
  );
  activeSound = sound;

  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };
    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status?.isLoaded) {
        if (status?.error) finish(reject, new Error(status.error));
        return;
      }
      if (status.didJustFinish) finish(resolve);
    });
    setTimeout(() => finish(reject, new Error('TTS playback timeout')), 45000);
  });
}

async function getLocalElevenLabsKey() {
  const current = await SecureStore.getItemAsync(ELEVENLABS_KEY).catch(() => null);
  if (current) return current;
  const legacy = await SecureStore.getItemAsync(LEGACY_ELEVENLABS_KEY).catch(() => null);
  if (legacy) {
    await SecureStore.setItemAsync(ELEVENLABS_KEY, legacy).catch(() => {});
    return legacy;
  }
  return '';
}

async function speakDirectElevenLabs(text) {
  const apiKey = await getLocalElevenLabsKey();
  if (!apiKey) throw new Error('LOCAL_ELEVENLABS_KEY_NOT_FOUND');

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(DEFAULT_VOICE_ID)}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: String(text || '').replace(/\n/g, ' ').slice(0, 1200),
        model_id: DEFAULT_MODEL,
        language_code: 'fa',
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.75,
          style: 0.2,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`ElevenLabs ${response.status}${body ? `: ${body.slice(0, 180)}` : ''}`);
  }

  const base64 = arrayBufferToBase64(await response.arrayBuffer());
  const fileUri = `${FileSystem.cacheDirectory}farangis-direct-${Date.now()}.mp3`;
  await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });

  try {
    await playFile(fileUri);
  } finally {
    await stopSound().catch(() => {});
    FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
  }
}

async function speakSystem(text) {
  const voices = await Speech.getAvailableVoicesAsync().catch(() => []);
  const persian = voices.filter((v) => /^(fa|fa-|fa_)/i.test(v.language || ''));
  const preferred = persian.find((v) => preferredVoiceNames.some((x) => String(v.name || v.identifier || '').toLowerCase().includes(x))) || persian[0];
  await Speech.stop().catch(() => {});
  return new Promise((resolve, reject) => {
    Speech.speak(String(text || '').replace(/\n/g, ' '), {
      language: preferred?.language || 'fa-IR',
      voice: preferred?.identifier,
      rate: 0.92,
      pitch: 1.06,
      onDone: resolve,
      onStopped: resolve,
      onError: (e) => reject(new Error(e?.message || 'System TTS failed')),
    });
  });
}

export async function stopSpeaking() {
  await Promise.all([Speech.stop().catch(() => {}), stopSound()]);
}

export async function speakFarangis(text, { preferCloud = true } = {}) {
  const output = String(text || '').trim();
  if (!output) return { provider: 'none' };
  await stopSpeaking();

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
  }).catch(() => {});

  const errors = [];

  if (preferCloud) {
    try {
      const { url, headers } = await buildTtsDownloadUrl(output);
      const target = `${FileSystem.cacheDirectory}farangis-server-${Date.now()}.mp3`;
      const downloaded = await FileSystem.downloadAsync(url, target, { headers });
      try {
        if (downloaded.status && downloaded.status >= 400) throw new Error(`Farangis Core TTS HTTP ${downloaded.status}`);
        await playFile(downloaded.uri);
      } finally {
        await stopSound().catch(() => {});
        FileSystem.deleteAsync(downloaded.uri, { idempotent: true }).catch(() => {});
      }
      return { provider: 'elevenlabs-server' };
    } catch (error) {
      errors.push(`server=${error?.message || String(error)}`);
    }

    try {
      await speakDirectElevenLabs(output);
      return { provider: 'elevenlabs-direct' };
    } catch (error) {
      errors.push(`direct=${error?.message || String(error)}`);
    }
  }

  try {
    await speakSystem(output);
    return { provider: 'ios', fallbackFrom: errors.join(' | ') };
  } catch (error) {
    errors.push(`ios=${error?.message || String(error)}`);
    const err = new Error(`پخش پاسخ صوتی فرنگیس انجام نشد: ${errors.join(' | ')}`);
    err.code = 'TTS_FAILED';
    throw err;
  }
}
