import React, { useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
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
import * as Calendar from 'expo-calendar';
import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';

const normalizeDigits = (value = '') =>
  value
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

const normalize = (value = '') =>
  normalizeDigits(String(value))
    .toLowerCase()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[؟?!.,،؛:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const birthdayText = (birthday) => {
  if (!birthday) return '';
  const year = birthday.year ? `${birthday.year}/` : '';
  return `${year}${String(birthday.month || '').padStart(2, '0')}/${String(
    birthday.day || ''
  ).padStart(2, '0')}`;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      'لوکیشن فعلیم رو روی نقشه باز کن',
      'کلیپ بورد رو بخون',
      'چندتا عکس و ویدیو دارم؟',
      'یادآوری 10 دقیقه دیگه آب بخورم',
      'گوگل رو باز کن',
    ],
    []
  );

  const setAccess = (name, value) => {
    setStatus((old) => ({ ...old, [name]: value }));
  };

  const say = async (text) => {
    const output = String(text ?? '');
    setResult(output);
    if (!speakAnswers) return;
    try {
      await Speech.stop();
      Speech.speak(output.replace(/\n/g, ' '), {
        language: 'fa-IR',
        rate: 0.92,
      });
    } catch (_) {}
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

  const ensureNotifications = async () => {
    const permission = await Notifications.requestPermissionsAsync();
    const granted = permission.status === 'granted';
    setAccess('Notifications', granted ? 'granted' : 'denied');
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

  const getContactMatches = async (query) => {
    if (!(await ensureContacts())) return [];
    const response = await Contacts.getContactsAsync({
      fields: [
        Contacts.Fields.Name,
        Contacts.Fields.PhoneNumbers,
        Contacts.Fields.Emails,
        Contacts.Fields.Birthday,
      ],
    });
    const needle = normalize(query);
    return (response.data || []).filter((item) =>
      normalize(item.name || '').includes(needle)
    );
  };

  const toolFindContact = async (query) => {
    const matches = await getContactMatches(query);
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

  const toolCallContact = async (query) => {
    const matches = await getContactMatches(query);
    const phone = matches[0]?.phoneNumbers?.find((p) => p.number)?.number;
    if (!phone) return `شماره‌ای برای «${query}» پیدا نکردم.`;
    await Linking.openURL(`tel:${phone.replace(/\s/g, '')}`);
    return `📞 شماره‌گیر برای ${matches[0]?.name || query} باز شد.`;
  };

  const toolMessageContact = async (query) => {
    const matches = await getContactMatches(query);
    const phone = matches[0]?.phoneNumbers?.find((p) => p.number)?.number;
    if (!phone) return `شماره‌ای برای «${query}» پیدا نکردم.`;
    await Linking.openURL(`sms:${phone.replace(/\s/g, '')}`);
    return `💬 صفحه پیام برای ${matches[0]?.name || query} باز شد.`;
  };

  const toolPhotos = async () => {
    if (!(await ensurePhotos())) return 'دسترسی عکس‌ها فعال نیست.';
    const assets = await MediaLibrary.getAssetsAsync({ first: 1 });
    return `🖼 تعداد عکس و ویدیوی قابل مشاهده: ${assets.totalCount}`;
  };

  const toolRecentMedia = async () => {
    if (!(await ensurePhotos())) return 'دسترسی عکس‌ها فعال نیست.';
    const assets = await MediaLibrary.getAssetsAsync({
      first: 10,
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
    });
    if (!assets.assets.length) return 'هیچ عکس یا ویدیویی پیدا نشد.';
    return `🖼 ده آیتم اخیر پیدا شد.\nقدیمی‌ترین مورد این لیست: ${new Date(
      assets.assets[assets.assets.length - 1].creationTime
    ).toLocaleString('fa-IR')}`;
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

  const toolOpenCurrentLocation = async () => {
    if (!(await ensureLocation())) return 'دسترسی موقعیت مکانی فعال نیست.';
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const { latitude, longitude } = location.coords;
    await Linking.openURL(`https://maps.apple.com/?ll=${latitude},${longitude}`);
    return '🗺 موقعیت فعلی روی نقشه باز شد.';
  };

  const toolMapsSearch = async (query) => {
    const q = String(query || '').trim();
    await Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(q)}`);
    return `🗺 جستجوی نقشه برای «${q}» باز شد.`;
  };

  const toolClipboard = async () => {
    const text = await Clipboard.getStringAsync();
    setAccess('Clipboard', 'granted');
    return text ? `📋 کلیپ‌بورد:\n${text}` : 'کلیپ‌بورد فعلاً خالی است.';
  };

  const toolCopy = async (text) => {
    await Clipboard.setStringAsync(String(text));
    setAccess('Clipboard', 'granted');
    return '📋 متن در کلیپ‌بورد ذخیره شد.';
  };

  const toolGoogle = async (query) => {
    const q = String(query || '').trim();
    const url = q
      ? `https://www.google.com/search?q=${encodeURIComponent(q)}`
      : 'https://www.google.com/';
    await Linking.openURL(url);
    return q ? `🔎 جستجوی گوگل برای «${q}» باز شد.` : '🌐 گوگل باز شد.';
  };

  const toolOpenUrl = async (url) => {
    const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    const supported = await Linking.canOpenURL(target);
    if (!supported) return 'این لینک قابل باز شدن نیست.';
    await Linking.openURL(target);
    return `🌐 ${target} باز شد.`;
  };

  const toolShare = async (text) => {
    await Share.share({ message: String(text) });
    return '↗️ صفحه Share باز شد.';
  };

  const toolSecureSave = async (key, value) => {
    await SecureStore.setItemAsync(`farangis_${key}`, String(value));
    setAccess('SecureStore', 'granted');
    return `🔐 «${key}» در حافظه امن ذخیره شد.`;
  };

  const toolSecureRead = async (key) => {
    const value = await SecureStore.getItemAsync(`farangis_${key}`);
    setAccess('SecureStore', 'granted');
    return value ? `🔐 ${key}:\n${value}` : `چیزی با نام «${key}» ذخیره نشده.`;
  };

  const toolCalendarOpenCreate = async (title = 'رویداد جدید') => {
    try {
      await Calendar.createEventInCalendarAsync({ title });
      return '📅 صفحه ساخت رویداد تقویم باز شد.';
    } catch (error) {
      return `Calendar Error: ${String(error)}`;
    }
  };

  const toolReminder = async (minutes, body) => {
    if (!(await ensureNotifications())) return 'دسترسی اعلان‌ها فعال نیست.';
    const safeMinutes = Math.max(1, Number(minutes) || 1);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'فرنگیس',
        body: body || 'یادآوری',
        sound: true,
      },
      trigger: { seconds: safeMinutes * 60 },
    });
    return `⏰ یادآوری برای ${safeMinutes} دقیقه دیگر ثبت شد: ${body || 'یادآوری'}`;
  };

  const testCamera = async () => {
    try {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        setAccess('Camera', 'denied');
        await say('دسترسی دوربین داده نشد.');
        return;
      }
      setAccess('Camera', 'granted');
      await say('📷 دسترسی دوربین فعال است.');
    } catch (error) {
      await say(`Camera Error: ${String(error)}`);
    }
  };

  const testMicrophone = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        setAccess('Microphone', 'denied');
        await say('دسترسی میکروفن داده نشد.');
        return;
      }
      setAccess('Microphone', 'granted');
      await say('🎙 دسترسی میکروفن فعال است. برای ورود صوتی فعلاً از دیکته خود کیبورد آیفون استفاده کن.');
    } catch (error) {
      await say(`Microphone Error: ${String(error)}`);
    }
  };

  const testSecureStore = async () => {
    try {
      await SecureStore.setItemAsync('farangis_bridge_test', new Date().toISOString());
      const value = await SecureStore.getItemAsync('farangis_bridge_test');
      setAccess('SecureStore', 'granted');
      await say(`🔐 Secure Store فعال است.\n${value}`);
    } catch (error) {
      await say(`SecureStore Error: ${String(error)}`);
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

      const reminderMatch = text.match(/یادآوری\s+(\d+)\s*دقیقه\s*(?:دیگه|دیگر)?\s*(.*)/);
      const callMatch = text.match(/(?:زنگ بزن به|تماس بگیر با|تماس با)\s+(.+)/);
      const smsMatch = text.match(/(?:پیام بده به|اس ام اس به|sms به)\s+(.+)/);
      const secureSaveMatch = raw.match(/(?:ذخیره امن|امن ذخیره کن)\s+([^:]+):\s*(.+)/i);
      const secureReadMatch = raw.match(/(?:بخون امن|حافظه امن)\s+(.+)/i);
      const urlMatch = raw.match(/https?:\/\/\S+|(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\/\S*)?/i);

      if (reminderMatch) {
        output = await toolReminder(reminderMatch[1], reminderMatch[2]);
      } else if (callMatch) {
        output = await toolCallContact(callMatch[1].trim());
      } else if (smsMatch) {
        output = await toolMessageContact(smsMatch[1].trim());
      } else if (secureSaveMatch) {
        output = await toolSecureSave(secureSaveMatch[1].trim(), secureSaveMatch[2].trim());
      } else if (secureReadMatch && text.includes('امن')) {
        output = await toolSecureRead(secureReadMatch[1].trim());
      } else if (
        (text.includes('تولد') || text.includes('birthday')) &&
        (text.includes('کیا') || text.includes('چه کس') || text.includes('کی') || text.includes('دارن') || text.includes('لیست'))
      ) {
        output = await toolBirthdays();
      } else if (
        text.includes('چندتا مخاطب') ||
        text.includes('تعداد مخاطب') ||
        text.includes('contacts count')
      ) {
        output = await toolContactsSummary();
      } else if (text.startsWith('شماره ') || text.startsWith('مخاطب ')) {
        const name = raw.replace(/^(شماره|مخاطب)\s+/i, '').trim();
        output = await toolFindContact(name);
      } else if (
        (text.includes('لوکیشن') || text.includes('موقعیت') || text.includes('کجام')) &&
        (text.includes('نقشه') || text.includes('باز کن'))
      ) {
        output = await toolOpenCurrentLocation();
      } else if (
        text.includes('لوکیشن') ||
        text.includes('موقعیت') ||
        text.includes('کجام') ||
        text.includes('location')
      ) {
        output = await toolLocation();
      } else if (text.startsWith('نقشه ') || text.includes('روی نقشه سرچ کن')) {
        const q = raw
          .replace(/^نقشه\s+/i, '')
          .replace(/روی نقشه سرچ کن/gi, '')
          .trim();
        output = await toolMapsSearch(q);
      } else if (
        text.includes('کلیپ') ||
        text.includes('clipboard') ||
        text.includes('کپی کردم')
      ) {
        output = await toolClipboard();
      } else if (text.startsWith('کپی کن ')) {
        output = await toolCopy(raw.replace(/^کپی کن\s+/i, ''));
      } else if (
        text.includes('چندتا عکس') ||
        text.includes('چند عکس') ||
        text.includes('عکس و ویدیو') ||
        text.includes('photos count')
      ) {
        output = await toolPhotos();
      } else if (text.includes('عکس های اخیر') || text.includes('ویدیوهای اخیر')) {
        output = await toolRecentMedia();
      } else if (text.startsWith('تقویم') || text.includes('رویداد تقویم')) {
        const title = raw.replace(/^(تقویم|رویداد تقویم)\s*/i, '').trim() || 'رویداد جدید';
        output = await toolCalendarOpenCreate(title);
      } else if (text.startsWith('اشتراک بگذار ') || text.startsWith('share ')) {
        output = await toolShare(raw.replace(/^(اشتراک بگذار|share)\s+/i, ''));
      } else if (urlMatch && (text.includes('باز کن') || /^https?:\/\//i.test(raw))) {
        output = await toolOpenUrl(urlMatch[0]);
      } else if (
        text.includes('گوگل') ||
        text.startsWith('search ') ||
        text.includes('جستجو') ||
        text.includes('سرچ کن')
      ) {
        const query = raw
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
          'این فرمان هنوز در نسخه محلی شناخته نشد.\n\nنمونه‌ها:\n• چه کسایی تاریخ تولد دارن؟\n• چندتا مخاطب دارم؟\n• شماره مستانه\n• زنگ بزن به مستانه\n• پیام بده به مستانه\n• لوکیشن فعلیم رو روی نقشه باز کن\n• نقشه برج میلاد\n• کلیپ بورد رو بخون\n• چندتا عکس و ویدیو دارم؟\n• یادآوری 10 دقیقه دیگه آب بخورم\n• تقویم جلسه با علی\n• ستاره های سربی آبی رو تو گوگل سرچ کن\n• ذخیره امن کد: 1234\n• حافظه امن کد';
      }

      await say(output);
    } catch (error) {
      await say(`❌ خطا در اجرای فرمان:\n${String(error)}`);
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
    ['Notifications', '🔔 Notifications', async () => {
      const ok = await ensureNotifications();
      await say(ok ? '🔔 اعلان‌ها فعال هستند.' : 'دسترسی اعلان‌ها داده نشد.');
    }],
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
      <Text style={styles.subtitle}>Farangis Personal Bridge 1.2</Text>

      <View style={styles.commandCard}>
        <Text style={styles.sectionTitle}>فرمان</Text>
        <TextInput
          value={command}
          onChangeText={setCommand}
          placeholder="مثلاً: زنگ بزن به مستانه"
          placeholderTextColor="#687083"
          style={styles.input}
          multiline
          textAlign="right"
          returnKeyType="done"
        />

        <View style={styles.row}>
          <Pressable
            style={[styles.primaryButton, busy && styles.disabledButton]}
            disabled={busy}
            onPress={() => runCommand()}
          >
            <Text style={styles.primaryButtonText}>{busy ? 'در حال اجرا...' : 'اجرا کن'}</Text>
          </Pressable>
          <Pressable
            style={styles.clearButton}
            onPress={() => {
              setCommand('');
              setResult('فرنگیس آماده است.');
            }}
          >
            <Text style={styles.clearButtonText}>پاک کن</Text>
          </Pressable>
        </View>

        <View style={styles.voiceRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.voiceTitle}>خواندن جواب با صدا</Text>
            <Text style={styles.voiceHint}>برای گفتن فرمان از دیکته کیبورد iPhone استفاده کن.</Text>
          </View>
          <Switch value={speakAnswers} onValueChange={setSpeakAnswers} />
        </View>

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
          <Text style={styles.sectionTitle}>خروجی فرنگیس</Text>
          <Pressable onPress={() => toolShare(result)}>
            <Text style={styles.shareText}>اشتراک</Text>
          </Pressable>
        </View>
        <Text selectable style={styles.resultText}>{result}</Text>
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 22, marginBottom: 10 }]}>دسترسی‌ها</Text>
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
            'Expo Go اجازه دسترسی به Contacts, Photos, Location, Camera, Microphone, Clipboard, Secure Store, Calendar UI و Local Notifications را می‌دهد. خواندن SMS/iMessage و Call History و wake-word دائمی نیازمند قابلیت‌های خارج از Expo Go یا محدودیت‌های خود iOS است.'
          )
        }
      >
        <Text style={styles.infoButtonText}>محدودیت‌های نسخه فعلی</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0B0D12' },
  content: { paddingTop: 56, paddingHorizontal: 16, paddingBottom: 80 },
  logo: { textAlign: 'center', fontSize: 54 },
  title: { color: '#FFFFFF', textAlign: 'center', fontSize: 31, fontWeight: '900', marginTop: 4 },
  subtitle: { color: '#8D96A8', textAlign: 'center', marginTop: 4, marginBottom: 20 },
  sectionTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', textAlign: 'right' },
  commandCard: { backgroundColor: '#151922', borderRadius: 24, padding: 16 },
  input: {
    minHeight: 86,
    backgroundColor: '#0E1118',
    borderWidth: 1,
    borderColor: '#2A3140',
    borderRadius: 17,
    color: '#FFFFFF',
    fontSize: 16,
    padding: 14,
    marginTop: 12,
  },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  primaryButton: { flex: 1, backgroundColor: '#4B66F0', borderRadius: 15, paddingVertical: 14, alignItems: 'center' },
  disabledButton: { opacity: 0.55 },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '900' },
  clearButton: { backgroundColor: '#242A35', borderRadius: 15, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center' },
  clearButtonText: { color: '#D9DEEA', fontWeight: '800' },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  voiceTitle: { color: '#F4F6FB', textAlign: 'right', fontWeight: '700' },
  voiceHint: { color: '#7E879A', textAlign: 'right', fontSize: 12, marginTop: 3 },
  quickWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16, justifyContent: 'flex-end' },
  quickButton: { backgroundColor: '#202631', borderRadius: 14, paddingHorizontal: 11, paddingVertical: 9 },
  quickText: { color: '#C9D0DE', fontSize: 12 },
  resultBox: { backgroundColor: '#151922', borderRadius: 24, padding: 16, marginTop: 16 },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shareText: { color: '#8596FF', fontWeight: '700' },
  resultText: { color: '#FFFFFF', fontSize: 15, lineHeight: 25, textAlign: 'right', marginTop: 12 },
  card: { backgroundColor: '#151922', borderRadius: 22, overflow: 'hidden' },
  permissionButton: {
    minHeight: 60,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#252A35',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  permissionText: { color: '#FFFFFF', fontSize: 15, fontWeight: '650' },
  arrow: { color: '#697386', fontSize: 28 },
  infoButton: { marginTop: 16, backgroundColor: '#1D222D', borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  infoButtonText: { color: '#D9DEEA', fontWeight: '700' },
});
