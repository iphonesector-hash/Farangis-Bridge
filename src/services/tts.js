import * as FileSystem from 'expo-file-system/legacy';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import { buildTtsDownloadUrl } from './farangisApi';

let activeSound = null;

const preferredVoiceNames = ['neda', 'roya', 'sara', 'shadi', 'female', 'persian'];

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

  if (preferCloud) {
    try {
      const { url, headers } = await buildTtsDownloadUrl(output);
      const target = `${FileSystem.cacheDirectory}farangis-${Date.now()}.mp3`;
      const downloaded = await FileSystem.downloadAsync(url, target, { headers });
      const { sound } = await Audio.Sound.createAsync({ uri: downloaded.uri }, { shouldPlay: true, volume: 1.0 });
      activeSound = sound;
      await new Promise((resolve) => {
        sound.setOnPlaybackStatusUpdate((s) => {
          if (s?.didJustFinish) resolve();
        });
      });
      await stopSound();
      FileSystem.deleteAsync(downloaded.uri, { idempotent: true }).catch(() => {});
      return { provider: 'elevenlabs' };
    } catch (cloudError) {
      try {
        await speakSystem(output);
        return { provider: 'ios', fallbackFrom: String(cloudError) };
      } catch (systemError) {
        const err = new Error(`پخش صوت انجام نشد. Cloud: ${String(cloudError)} | iOS: ${String(systemError)}`);
        err.code = 'TTS_FAILED';
        throw err;
      }
    }
  }

  await speakSystem(output);
  return { provider: 'ios' };
}
