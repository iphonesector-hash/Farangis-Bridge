import React, { useEffect, useState } from 'react';
import { Alert, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import { Audio } from 'expo-av';

const KEY = 'farangis_tts_test_elevenlabs_key';
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';
const DEFAULT_MODEL = 'eleven_v3';

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

async function makeAndPlayPersian({ apiKey, voiceId, modelId, text }) {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
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
    throw new Error(`ElevenLabs ${response.status}${body ? `: ${body.slice(0, 240)}` : ''}`);
  }

  const buffer = await response.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);
  const fileUri = `${FileSystem.cacheDirectory}farangis-tts-test-${Date.now()}.mp3`;
  await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });

  await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
  const { sound } = await Audio.Sound.createAsync({ uri: fileUri }, { shouldPlay: true, volume: 1 });

  return new Promise((resolve, reject) => {
    sound.setOnPlaybackStatusUpdate(async (status) => {
      if (!status?.isLoaded) {
        if (status?.error) {
          await sound.unloadAsync().catch(() => {});
          await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
          reject(new Error(status.error));
        }
        return;
      }
      if (status.didJustFinish) {
        await sound.unloadAsync().catch(() => {});
        await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
        resolve();
      }
    });
  });
}

export default function App() {
  const [apiKey, setApiKey] = useState('');
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE_ID);
  const [modelId, setModelId] = useState(DEFAULT_MODEL);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('آماده تست');

  useEffect(() => {
    SecureStore.getItemAsync(KEY).then((saved) => {
      if (saved) setApiKey(saved);
    }).catch(() => {});
  }, []);

  const test = async () => {
    if (!apiKey.trim()) {
      Alert.alert('API Key لازم است', 'کلید ElevenLabs را اینجا وارد کن؛ داخل GitHub ذخیره نمی‌شود.');
      return;
    }

    setBusy(true);
    setStatus('در حال ساخت صدای فارسی...');
    try {
      await SecureStore.setItemAsync(KEY, apiKey.trim());
      await makeAndPlayPersian({
        apiKey: apiKey.trim(),
        voiceId: voiceId.trim() || DEFAULT_VOICE_ID,
        modelId: modelId.trim() || DEFAULT_MODEL,
        text: 'سلام پیمان، من فرنگیس هستم. این یک تست مستقل برای صدای فارسی من است.',
      });
      setStatus('✅ تست با موفقیت پخش شد');
    } catch (error) {
      setStatus(`❌ ${String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.logo}>🎙️</Text>
        <Text style={styles.title}>تست مستقل صدای فارسی فرنگیس</Text>
        <Text style={styles.note}>این شاخه از نسخه اصلی جداست و هیچ تغییری در Farangis اصلی نمی‌دهد.</Text>

        <Text style={styles.label}>ElevenLabs API Key</Text>
        <TextInput
          value={apiKey}
          onChangeText={setApiKey}
          secureTextEntry
          autoCapitalize="none"
          placeholder="xi-..."
          placeholderTextColor="#687083"
          style={styles.input}
        />

        <Text style={styles.label}>Voice ID</Text>
        <TextInput value={voiceId} onChangeText={setVoiceId} autoCapitalize="none" style={styles.input} />

        <Text style={styles.label}>Model</Text>
        <TextInput value={modelId} onChangeText={setModelId} autoCapitalize="none" style={styles.input} />

        <Pressable disabled={busy} onPress={test} style={[styles.button, busy && styles.disabled]}>
          <Text style={styles.buttonText}>{busy ? 'در حال ساخت صدا...' : '🎧 تست صدای فارسی'}</Text>
        </Pressable>

        <Text selectable style={styles.status}>{status}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0B0D12', justifyContent: 'center', padding: 18 },
  card: { backgroundColor: '#151922', borderRadius: 24, padding: 18 },
  logo: { fontSize: 48, textAlign: 'center' },
  title: { color: '#FFF', fontSize: 21, fontWeight: '900', textAlign: 'center', marginTop: 8 },
  note: { color: '#9AA4B7', fontSize: 13, lineHeight: 21, textAlign: 'right', marginTop: 10, marginBottom: 14 },
  label: { color: '#E8ECF5', fontWeight: '800', textAlign: 'right', marginTop: 10, marginBottom: 6 },
  input: { backgroundColor: '#0E1118', borderWidth: 1, borderColor: '#2A3140', borderRadius: 14, color: '#FFF', padding: 12 },
  button: { marginTop: 20, backgroundColor: '#4B66F0', borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  disabled: { opacity: 0.55 },
  buttonText: { color: '#FFF', fontWeight: '900' },
  status: { color: '#D7DDEA', textAlign: 'right', lineHeight: 22, marginTop: 16 },
});
