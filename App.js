import React, { useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Contacts from 'expo-contacts';
import * as MediaLibrary from 'expo-media-library';
import * as Location from 'expo-location';
import { useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';

const normalize = (value = '') =>
  value
    .toLowerCase()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[؟?!.,،]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const birthdayText = (birthday) => {
  if (!birthday) return '';
  const y = birthday.year ? `${birthday.year}/` : '';
  return `${y}${String(birthday.month || '').padStart(2, '0')}/${String(
    birthday.day || ''
  ).padStart(2, '0')}`;
};

export default function App() {
  const [status, setStatus] = useState({});
  const [result, setResult] = useState('فرنگیس آماده است. یک فرمان بنویس.');
  const [command, setCommand] = useState('');
  const [busy, setBusy] = useState(false);
  const [speakAnswers, setSpeakAnswers] = useState(true);
  const [, requestCameraPermission] = useCameraPermissions();

  const quickCommands = useMemo(
    () => [
      'چه کسایی تاریخ تولد دارن؟',
      'چندتا مخاطب دارم؟',
      'لوکیشن فعلیم رو بگو',
      'کلیپ بورد رو بخون',
      'چندتا عکس و ویدیو دارم؟',
      'گوگل رو باز کن',
    ],
    []
  );

  const setAccess = (name, value) => {
    setStatus((old) => ({ ...old, [name]: value }));
  };

  const say = (text) => {
    setResult(text);
    if (speakAnswers) {
      Speech.stop();
      Speech.speak(String(text).replace(/\n/g, ' '), {
        language: 'fa-IR',
        rate: 0.95,
      });
    }
  };

  const ensureContacts = async () => {
    const permission = await Contacts.requestPermissionsAsync();
    const granted = permission.status === 'granted';
    setAccess('Contacts', granted ? 'granted' : 'denied');
    return granted;
  };

  const ensurePhotos = async () => {
    const permission = await MediaLibrary.requestPermissionsAsync();
    const granted = permission.status === 'granted';
    setAccess('Photos', granted ? 'granted' : 'denied');
    return granted;
  };

  const ensureLocation = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    const granted = permission.status === 'granted';
    setAccess('Location', granted ? 'granted' : 'denied');
    return granted;
  };

  const toolContactsSummary = async () => {
    if (!(await ensureContacts())) return 'دسترسی مخاطبین فعال نیست.';
    const response = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Name, Contacts.Fields.Birthday],
    });
    const contacts = response.data || [];
    const birthdays = contacts.filter((item) => item.birthday);
    return `👥 تعداد مخاطبین: ${contacts.length}\n🎂 دارای تاریخ تولد: ${birthdays.length}`;
  };

  const toolBirthdays = async () => {
    if (!(await ensureContacts())) return 'دسترسی مخاطبین فعال نیست.';
    const response = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Name, Contacts.Fields.Birthday],
    });
    const birthdays = (response.data || [])
      .filter((item) => item.birthday)
      .sort((a, b) => {
        const am = a.birthday?.month || 0;
        const bm = b.birthday?.month || 0;
        const ad = a.birthday?.day || 0;
        const bd = b.birthday?.day || 0;
        return am - bm || ad - bd;
      });

    if (!birthdays.length) return 'هیچ تاریخ تولدی در مخاطبین ثبت نشده.';

    const lines = birthdays.map(
      (item, index) =>
        `${index + 1}. ${item.name || 'بدون نام'} — ${birthdayText(item.birthday)}`
    );
    return `🎂 مخاطبین دارای تاریخ تولد (${birthdays.length} نفر):\n\n${lines.join('\n')}`;
  };

  const toolFindContact = async (query) => {
    if (!(await ensureContacts())) return 'دسترسی مخاطبین فعال نیست.';
    const response = await Contacts.getContactsAsync({
      fields: [
        Contacts.Fields.Name,
        Contacts.Fields.PhoneNumbers,
        Contacts.Fields.Emails,
        Contacts.Fields.Birthday,
      ],
    });
    const needle = normalize(query);
    const matches = (response.data || []).filter((item) =>
      normalize(item.name || '').includes(needle)
    );
    if (!matches.length) return `مخاطبی با نام «${query}» پیدا نشد.`;

    return matches
      .slice(0, 10)
      .map((item) => {
        const phones = (item.phoneNumbers || []).map((p) => p.number).filter(Boolean);
        const emails = (item.emails || []).map((e) => e.email).filter(Boolean);
        const parts = [`👤 ${item.name || 'بدون نام'}`];
        if (phones.length) parts.push(`📞 ${phones.join(' ، ')}`);
        if (emails.length) parts.push(`✉️ ${emails.join(' ، ')}`);
        if (item.birthday) parts.push(`🎂 ${birthdayText(item.birthday)}`);
        return parts.join('\n');
      })
      .join('\n\n');
  };

  const toolPhotos = async () => {
    if (!(await ensurePhotos())) return 'دسترسی عکس‌ها فعال نیست.';
    const assets = await MediaLibrary.getAssetsAsync({ first: 1 });
    return `🖼 تعداد عکس و ویدیوی قابل مشاهده: ${assets.totalCount}`;
  };

  const toolLocation = async () => {
    if (!(await ensureLocation())) return 'دسترسی موقعیت مکانی فعال نیست.';
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return `📍 موقعیت فعلی\nLatitude: ${location.coords.latitude}\nLongitude: ${location.coords.longitude}\nAccuracy: ${Math.round(
      location.coords.accuracy || 0
    )}m`;
  };

  const toolClipboard = async () => {
    const text = await Clipboard.getStringAsync();
    setAccess('Clipboard', 'granted');
    return text ? `📋 کلیپ‌بورد:\n${text}` : 'کلیپ‌بورد فعلاً خالی است.';
  };

  const toolGoogle = async (query) => {
    const q = String(query || '').trim();
    const url = q
      ? `https://www.google.com/search?q=${encodeURIComponent(q)}`
      : 'https://www.google.com/';
    await Linking.openURL(url);
    return q ? `🔎 جستجوی گوگل برای «${q}» باز شد.` : '🌐 گوگل باز شد.';
  };

  const testCamera = async () => {
    try {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        setAccess('Camera', 'denied');
        say('دسترسی دوربین داده نشد.');
        return;
      }
      setAccess('Camera', 'granted');
      say('📷 دسترسی دوربین فعال است.');
    } catch (error) {
      say(`Camera Error: ${String(error)}`);
    }
  };

  const testMicrophone = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        setAccess('Microphone', 'denied');
        say('دسترسی میکروفن داده نشد.');
        return;
      }
      setAccess('Microphone', 'granted');
      say('🎙 دسترسی میکروفن فعال است. تشخیص گفتار آزاد را در نسخه Native Bridge اضافه می‌کنیم.');
    } catch (error) {
      say(`Microphone Error: ${String(error)}`);
    }
  };

  const testSecureStore = async () => {
    try {
      await SecureStore.setItemAsync('farangis_bridge_test', new Date().toISOString());
      const value = await SecureStore.getItemAsync('farangis_bridge_test');
      setAccess('SecureStore', 'granted');
      say(`🔐 Secure Store فعال است.\n${value}`);
    } catch (error) {
      say(`SecureStore Error: ${String(error)}`);
    }
  };

  const runCommand = async (rawCommand = command) => {
    const raw = String(rawCommand || '').trim();
    if (!raw) return;

    const text = normalize(raw);
    setCommand(raw);
    setBusy(true);
    setResult('در حال انجام فرمان...');

    try {
      let output;

      if (
        (text.includes('تولد') || text.includes('birthday')) &&
        (text.includes('کیا') || text.includes('چه کس') || text.includes('کی') || text.includes('دارن') || text.includes('list'))
      ) {
        output = await toolBirthdays();
      } else if (
        text.includes('چندتا مخاطب') ||
        text.includes('تعداد مخاطب') ||
        text.includes('contacts count')
      ) {
        output = await toolContactsSummary();
      } else if (
        text.includes('لوکیشن') ||
        text.includes('موقعیت') ||
        text.includes('کجام') ||
        text.includes('location')
      ) {
        output = await toolLocation();
      } else if (
        text.includes('کلیپ') ||
        text.includes('clipboard') ||
        text.includes('کپی کردم')
      ) {
        output = await toolClipboard();
      } else if (
        text.includes('چندتا عکس') ||
        text.includes('چند عکس') ||
        text.includes('عکس و ویدیو') ||
        text.includes('photos count')
      ) {
        output = await toolPhotos();
      } else if (text.startsWith('شماره ') || text.startsWith('مخاطب ')) {
        const name = raw.replace(/^(شماره|مخاطب)\s+/i, '').trim();
        output = await toolFindContact(name);
      } else if (
        text.includes('گوگل') ||
        text.startsWith('search ') ||
        text.includes('جستجو')
      ) {
        let query = raw
          .replace(/فرنگیس/gi, '')
          .replace(/تو(?:ی|ى)?\s*گوگل/gi, '')
          .replace(/گوگل/gi, '')
          .replace(/سرچ کن/gi, '')
          .replace(/جستجو کن/gi, '')
          .replace(/^search\s+/i, '')
          .trim();
        output = await toolGoogle(query);
      } else {
        output =
          'این فرمان هنوز به Tool Router اضافه نشده.\n\nنمونه‌ها:\n• چه کسایی تاریخ تولد دارن؟\n• چندتا مخاطب دارم؟\n• شماره مستانه\n• لوکیشن فعلیم رو بگو\n• کلیپ بورد رو بخون\n• چندتا عکس و ویدیو دارم؟\n• ستاره های سربی آبی رو تو گوگل سرچ کن';
      }

      say(output);
    } catch (error) {
      say(`❌ خطا در اجرای فرمان:\n${String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const permissionItems = [
    ['Contacts', '👥 Contacts', async () => say(await toolContactsSummary())],
    ['Photos', '🖼 Photos', async () => say(await toolPhotos())],
    ['Location', '📍 Location', async () => say(await toolLocation())],
    ['Camera', '📷 Camera', testCamera],
    ['Microphone', '🎙 Microphone', testMicrophone],
    ['Clipboard', '📋 Clipboard', async () => say(await toolClipboard())],
    ['SecureStore', '🔐 Secure Store', testSecureStore],
  ];

  const icon = (name) => {
    if (status[name] === 'granted') return '✅';
    if (status[name] === 'denied') return '❌';
    return '⚪️';
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.logo}>🧠</Text>
      <Text style={styles.title}>فرنگیس</Text>
      <Text style={styles.subtitle}>Farangis Personal Bridge</Text>

      <View style={styles.commandCard}>
        <Text style={styles.sectionTitle}>فرمان</Text>
        <TextInput
          value={command}
          onChangeText={setCommand}
          placeholder="مثلاً: چه کسایی تاریخ تولد دارن؟"
          placeholderTextColor="#687083"
          style={styles.input}
          multiline
          textAlign="right"
          onSubmitEditing={() => runCommand()}
        />
        <Pressable
          style={[styles.primaryButton, busy && styles.disabledButton]}
          disabled={busy}
          onPress={() => runCommand()}
        >
          <Text style={styles.primaryButtonText}>{busy ? 'در حال اجرا...' : 'اجرا کن'}</Text>
        </Pressable>

        <View style={styles.quickWrap}>
          {quickCommands.map((item) => (
            <Pressable key={item} style={styles.quickButton} onPress={() => runCommand(item)}>
              <Text style={styles.quickText}>{item}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.resultBox}>
        <View style={styles.resultHeader}>
          <Text style={styles.sectionTitle}>پاسخ فرنگیس</Text>
          <View style={styles.speechToggle}>
            <Text style={styles.toggleLabel}>🔊</Text>
            <Switch value={speakAnswers} onValueChange={setSpeakAnswers} />
          </View>
        </View>
        <Text selectable style={styles.resultText}>{result}</Text>
      </View>

      <Text style={styles.sectionHeading}>دسترسی‌های دستگاه</Text>
      <View style={styles.card}>
        {permissionItems.map(([id, title, action]) => (
          <Pressable key={id} style={styles.permissionButton} onPress={action}>
            <Text style={styles.permissionText}>{icon(id)} {title}</Text>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={styles.infoButton}
        onPress={() =>
          Alert.alert(
            'Farangis Bridge',
            'این نسخه داخل Expo Go اجرا می‌شود. Contacts، Photos، Location، Camera، Microphone، Clipboard، Secure Store، فرمان متنی و خواندن صوتی پاسخ فعال‌اند. Wake word دائمی، App Intents، Calendar native و تشخیص گفتار آزاد نیازمند Development Build/Native Bridge هستند.'
          )
        }
      >
        <Text style={styles.infoButtonText}>ℹ️ وضعیت قابلیت‌ها</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#090B10' },
  content: { paddingTop: 58, paddingHorizontal: 16, paddingBottom: 90 },
  logo: { textAlign: 'center', fontSize: 54 },
  title: { color: '#FFFFFF', textAlign: 'center', fontSize: 32, fontWeight: '900', marginTop: 6 },
  subtitle: { color: '#7F899D', textAlign: 'center', marginTop: 4, marginBottom: 22 },
  commandCard: { backgroundColor: '#141821', borderRadius: 24, padding: 16 },
  sectionTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  input: { minHeight: 92, backgroundColor: '#0D1118', color: '#FFFFFF', borderRadius: 17, padding: 14, marginTop: 12, fontSize: 16, textAlignVertical: 'top' },
  primaryButton: { backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  disabledButton: { opacity: 0.55 },
  primaryButtonText: { color: '#090B10', fontWeight: '900', fontSize: 16 },
  quickWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 13 },
  quickButton: { backgroundColor: '#242A36', borderRadius: 13, paddingVertical: 8, paddingHorizontal: 10 },
  quickText: { color: '#CFD5E1', fontSize: 12 },
  resultBox: { backgroundColor: '#141821', borderRadius: 24, padding: 16, marginTop: 16 },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  speechToggle: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  toggleLabel: { fontSize: 16 },
  resultText: { color: '#FFFFFF', fontSize: 15, lineHeight: 25, marginTop: 13, textAlign: 'right' },
  sectionHeading: { color: '#929CAF', fontSize: 13, fontWeight: '800', marginTop: 22, marginBottom: 9, textAlign: 'right' },
  card: { backgroundColor: '#141821', borderRadius: 22, overflow: 'hidden' },
  permissionButton: { minHeight: 60, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#242A35', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  permissionText: { color: '#FFFFFF', fontSize: 16, fontWeight: '650' },
  arrow: { color: '#697386', fontSize: 28 },
  infoButton: { marginTop: 16, backgroundColor: '#1D222D', borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  infoButtonText: { color: '#D9DEEA', fontWeight: '700' },
});
