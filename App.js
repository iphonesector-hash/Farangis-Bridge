import React, { useEffect, useMemo, useState } from 'react';
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
import { DEFAULT_AI_CONFIG, planWithAI } from './src/ai';

const normalizeDigits = (value = '') =>
  String(value)
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

const normalize = (value = '') =>
  normalizeDigits(value)
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

export default function App() {
  const [status, setStatus] = useState({});
  const [result, setResult] = useState('فرنگیس آماده است. یک فرمان بنویس.');
  const [command, setCommand] = useState('');
  const [busy, setBusy] = useState(false);
  const [speakAnswers, setSpeakAnswers] = useState(true);
  const [showAISettings, setShowAISettings] = useState(false);
  const [aiKey, setAiKey] = useState('');
  const [aiBaseUrl, setAiBaseUrl] = useState(DEFAULT_AI_CONFIG.baseUrl);
  const [aiModel, setAiModel] = useState(DEFAULT_AI_CONFIG.model);
  const [, requestCameraPermission] = useCameraPermissions();

  useEffect(() => {
    (async () => {
      try {
        const [key, baseUrl, model] = await Promise.all([
          SecureStore.getItemAsync('farangis_ai_key'),
          SecureStore.getItemAsync('farangis_ai_base_url'),
          SecureStore.getItemAsync('farangis_ai_model'),
        ]);
        if (key) setAiKey(key);
        if (baseUrl) setAiBaseUrl(baseUrl);
        if (model) setAiModel(model);
      } catch (_) {}
    })();
  }, []);

  const quickCommands = useMemo(
    () => [
      'چه کسایی تاریخ تولد دارن؟',
      'شماره مستانه رو پیدا کن',
      'لوکیشن فعلیم رو روی نقشه باز کن',
      'کلیپ بورد رو بخون',
      'یادآوری 10 دقیقه دیگه آب بخورم',
      'ستاره های سربی آبی رو تو گوگل سرچ کن',
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

  const saveAISettings = async () => {
    try {
      await Promise.all([
        SecureStore.setItemAsync('farangis_ai_key', aiKey.trim()),
        SecureStore.setItemAsync('farangis_ai_base_url', aiBaseUrl.trim()),
        SecureStore.setItemAsync('farangis_ai_model', aiModel.trim()),
      ]);
      setShowAISettings(false);
      await say('🧠 تنظیمات هوش مصنوعی در حافظه امن گوشی ذخیره شد.');
    } catch (error) {
      await say(`خطا در ذخیره تنظیمات AI: ${String(error)}`);
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
      .sort((a, b) =>
        (a.birthday?.month || 0) - (b.birthday?.month || 0) ||
        (a.birthday?.day || 0) - (b.birthday?.day || 0)
      );
    if (!birthdays.length) return 'هیچ تاریخ تولدی در مخاطبین ثبت نشده.';
    return `🎂 مخاطبین دارای تاریخ تولد (${birthdays.length} نفر):\n\n${birthdays
      .map((item, index) => `${index + 1}. ${item.name || 'بدون نام'} — ${birthdayText(item.birthday)}`)
      .join('\n')}`;
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
    return (response.data || []).filter((item) => normalize(item.name || '').includes(needle));
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
    return assets.assets.length
      ? `🖼 ${assets.assets.length} آیتم اخیر پیدا شد.`
      : 'هیچ عکس یا ویدیویی پیدا نشد.';
  };

  const toolLocation = async () => {
    if (!(await ensureLocation())) return 'دسترسی موقعیت مکانی فعال نیست.';
    const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return `📍 موقعیت فعلی\nLatitude: ${location.coords.latitude}\nLongitude: ${location.coords.longitude}\nAccuracy: ${Math.round(location.coords.accuracy || 0)}m`;
  };

  const toolOpenCurrentLocation = async () => {
    if (!(await ensureLocation())) return 'دسترسی موقعیت مکانی فعال نیست.';
    const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const { latitude, longitude } = location.coords;
    await Linking.openURL(`https://maps.apple.com/?ll=${latitude},${longitude}`);
    return '🗺 موقعیت فعلی روی نقشه باز شد.';
  };

  const toolMapsSearch = async (query) => {
    await Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(String(query || '').trim())}`);
    return `🗺 جستجوی نقشه برای «${query}» باز شد.`;
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
    await Linking.openURL(q ? `https://www.google.com/search?q=${encodeURIComponent(q)}` : 'https://www.google.com/');
    return q ? `🔎 جستجوی گوگل برای «${q}» باز شد.` : '🌐 گوگل باز شد.';
  };

  const toolOpenUrl = async (url) => {
    const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    await Linking.openURL(target);
    return `🌐 ${target} باز شد.`;
  };

  const toolShare = async (text) => {
    await Share.share({ message: String(text) });
    return '↗️ صفحه Share باز شد.';
  };

  const toolSecureSave = async (key, value) => {
    await SecureStore.setItemAsync(`farangis_${key}`, String(value));
    return `🔐 «${key}» در حافظه امن ذخیره شد.`;
  };

  const toolSecureRead = async (key) => {
    const value = await SecureStore.getItemAsync(`farangis_${key}`);
    return value ? `🔐 ${key}:\n${value}` : `چیزی با نام «${key}» ذخیره نشده.`;
  };

  const toolCalendarOpenCreate = async (title = 'رویداد جدید') => {
    await Calendar.createEventInCalendarAsync({ title });
    return '📅 صفحه ساخت رویداد تقویم باز شد.';
  };

  const toolReminder = async (minutes, body) => {
    if (!(await ensureNotifications())) return 'دسترسی اعلان‌ها فعال نیست.';
    const safeMinutes = Math.max(1, Number(minutes) || 1);
    await Notifications.scheduleNotificationAsync({
      content: { title: 'فرنگیس', body: body || 'یادآوری', sound: true },
      trigger: { seconds: safeMinutes * 60 },
    });
    return `⏰ یادآوری برای ${safeMinutes} دقیقه دیگر ثبت شد: ${body || 'یادآوری'}`;
  };

  const executeAITool = async (plan) => {
    if (!plan || plan.type === 'answer') return plan?.text || 'پاسخی دریافت نشد.';
    const a = plan.args || {};
    switch (plan.tool) {
      case 'contacts_summary': return toolContactsSummary();
      case 'list_birthdays': return toolBirthdays();
      case 'find_contact': return toolFindContact(a.name || '');
      case 'call_contact': return toolCallContact(a.name || '');
      case 'message_contact': return toolMessageContact(a.name || '');
      case 'photos_count': return toolPhotos();
      case 'recent_media': return toolRecentMedia();
      case 'location': return toolLocation();
      case 'open_current_location': return toolOpenCurrentLocation();
      case 'maps_search': return toolMapsSearch(a.query || '');
      case 'clipboard_read': return toolClipboard();
      case 'clipboard_write': return toolCopy(a.text || '');
      case 'google_search': return toolGoogle(a.query || '');
      case 'open_url': return toolOpenUrl(a.url || '');
      case 'share': return toolShare(a.text || '');
      case 'secure_save': return toolSecureSave(a.key || 'item', a.value || '');
      case 'secure_read': return toolSecureRead(a.key || 'item');
      case 'calendar_create': return toolCalendarOpenCreate(a.title || 'رویداد جدید');
      case 'reminder': return toolReminder(a.minutes || 1, a.body || 'یادآوری');
      default: return 'هوش مصنوعی یک ابزار ناشناخته انتخاب کرد.';
    }
  };

  const runAIRouter = async (raw) => {
    if (!aiKey.trim()) {
      return 'این جمله با روتر محلی شناخته نشد. برای فهم آزادِ جمله‌ها، از بخش «تنظیمات AI» کلید API را یک‌بار وارد کن.';
    }
    const plan = await planWithAI({
      command: raw,
      baseUrl: aiBaseUrl,
      apiKey: aiKey,
      model: aiModel,
    });
    return executeAITool(plan);
  };

  const testCamera = async () => {
    try {
      const permission = await requestCameraPermission();
      setAccess('Camera', permission.granted ? 'granted' : 'denied');
      await say(permission.granted ? '📷 دسترسی دوربین فعال است.' : 'دسترسی دوربین داده نشد.');
    } catch (error) {
      await say(`Camera Error: ${String(error)}`);
    }
  };

  const testMicrophone = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      setAccess('Microphone', permission.status === 'granted' ? 'granted' : 'denied');
      await say(permission.status === 'granted'
        ? '🎙 میکروفن فعال است. برای گفتن فرمان فعلاً از دیکته کیبورد آیفون استفاده کن.'
        : 'دسترسی میکروفن داده نشد.');
    } catch (error) {
      await say(`Microphone Error: ${String(error)}`);
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
      const urlMatch = raw.match(/https?:\/\/\S+|(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\/\S*)?/i);

      if (reminderMatch) output = await toolReminder(reminderMatch[1], reminderMatch[2]);
      else if (callMatch) output = await toolCallContact(callMatch[1].trim());
      else if (smsMatch) output = await toolMessageContact(smsMatch[1].trim());
      else if (text.includes('تولد') && (text.includes('چه کس') || text.includes('کیا') || text.includes('دارن'))) output = await toolBirthdays();
      else if (text.includes('چندتا مخاطب') || text.includes('تعداد مخاطب')) output = await toolContactsSummary();
      else if (text.startsWith('شماره ') || text.startsWith('مخاطب ')) output = await toolFindContact(raw.replace(/^(شماره|مخاطب)\s+/i, '').trim());
      else if ((text.includes('لوکیشن') || text.includes('موقعیت') || text.includes('کجام')) && (text.includes('نقشه') || text.includes('باز کن'))) output = await toolOpenCurrentLocation();
      else if (text.includes('لوکیشن') || text.includes('موقعیت') || text.includes('کجام')) output = await toolLocation();
      else if (text.startsWith('نقشه ')) output = await toolMapsSearch(raw.replace(/^نقشه\s+/i, ''));
      else if (text.includes('کلیپ') || text.includes('clipboard')) output = await toolClipboard();
      else if (text.startsWith('کپی کن ')) output = await toolCopy(raw.replace(/^کپی کن\s+/i, ''));
      else if (text.includes('چندتا عکس') || text.includes('عکس و ویدیو')) output = await toolPhotos();
      else if (text.includes('عکس های اخیر') || text.includes('ویدیوهای اخیر')) output = await toolRecentMedia();
      else if (text.startsWith('تقویم') || text.includes('رویداد تقویم')) output = await toolCalendarOpenCreate(raw.replace(/^(تقویم|رویداد تقویم)\s*/i, '').trim() || 'رویداد جدید');
      else if (text.startsWith('اشتراک بگذار ') || text.startsWith('share ')) output = await toolShare(raw.replace(/^(اشتراک بگذار|share)\s+/i, ''));
      else if (urlMatch && (text.includes('باز کن') || /^https?:\/\//i.test(raw))) output = await toolOpenUrl(urlMatch[0]);
      else if (text.includes('گوگل') || text.includes('جستجو') || text.includes('سرچ کن')) {
        const query = raw
          .replace(/فرنگیس/gi, '')
          .replace(/تو(?:ی|ى)?\s*گوگل/gi, '')
          .replace(/گوگل/gi, '')
          .replace(/سرچ کن/gi, '')
          .replace(/جستجو کن/gi, '')
          .trim();
        output = await toolGoogle(query);
      } else {
        output = await runAIRouter(raw);
      }
      await say(output);
    } catch (error) {
      const message = String(error);
      if (message.includes('AI_API_KEY_MISSING')) {
        await say('برای AI Router باید کلید API را در تنظیمات AI ذخیره کنی.');
      } else {
        await say(`❌ خطا در اجرای فرمان:\n${message}`);
      }
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
    ['Notifications', '🔔 Notifications', async () => say((await ensureNotifications()) ? '🔔 اعلان‌ها فعال هستند.' : 'دسترسی اعلان‌ها داده نشد.')],
  ];

  const icon = (name) => {
    if (status[name] === 'granted') return '✅';
    if (status[name] === 'denied') return '❌';
    return '⚪️';
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.logo}>🧠</Text>
      <Text style={styles.title}>فرنگیس</Text>
      <Text style={styles.subtitle}>Farangis Personal Bridge 1.3</Text>

      <View style={styles.commandCard}>
        <Text style={styles.sectionTitle}>فرمان</Text>
        <TextInput
          value={command}
          onChangeText={setCommand}
          placeholder="هرجور راحتی فارسی بنویس..."
          placeholderTextColor="#687083"
          style={styles.input}
          multiline
          textAlign="right"
        />
        <View style={styles.row}>
          <Pressable style={[styles.primaryButton, busy && styles.disabledButton]} disabled={busy} onPress={() => runCommand()}>
            <Text style={styles.primaryButtonText}>{busy ? 'در حال اجرا...' : 'اجرا کن'}</Text>
          </Pressable>
          <Pressable style={styles.clearButton} onPress={() => { setCommand(''); setResult('فرنگیس آماده است.'); }}>
            <Text style={styles.clearButtonText}>پاک کن</Text>
          </Pressable>
        </View>

        <View style={styles.voiceRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.voiceTitle}>خواندن جواب با صدا</Text>
            <Text style={styles.voiceHint}>برای ورود صوتی فعلاً میکروفنِ کیبورد iPhone را بزن.</Text>
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
          <Pressable onPress={() => toolShare(result)}><Text style={styles.shareText}>اشتراک</Text></Pressable>
        </View>
        <Text selectable style={styles.resultText}>{result}</Text>
      </View>

      <Pressable style={styles.aiHeader} onPress={() => setShowAISettings((v) => !v)}>
        <View>
          <Text style={styles.aiTitle}>🧠 AI Router {aiKey ? '✅' : '⚪️'}</Text>
          <Text style={styles.aiHint}>برای فهم جمله‌های آزاد و دستورهای ثبت‌نشده</Text>
        </View>
        <Text style={styles.arrow}>{showAISettings ? '⌃' : '⌄'}</Text>
      </Pressable>

      {showAISettings && (
        <View style={styles.aiCard}>
          <Text style={styles.label}>API Key — فقط در Secure Store گوشی ذخیره می‌شود</Text>
          <TextInput value={aiKey} onChangeText={setAiKey} secureTextEntry autoCapitalize="none" style={styles.smallInput} placeholder="gsk_..." placeholderTextColor="#687083" />
          <Text style={styles.label}>Chat Completions URL</Text>
          <TextInput value={aiBaseUrl} onChangeText={setAiBaseUrl} autoCapitalize="none" style={styles.smallInput} />
          <Text style={styles.label}>Model</Text>
          <TextInput value={aiModel} onChangeText={setAiModel} autoCapitalize="none" style={styles.smallInput} />
          <Pressable style={styles.saveButton} onPress={saveAISettings}><Text style={styles.saveButtonText}>ذخیره امن تنظیمات AI</Text></Pressable>
          <Text style={styles.securityText}>کلید داخل GitHub یا سورس پروژه نوشته نمی‌شود. درخواست AI فقط متن فرمان را می‌فرستد؛ داده مخاطبین و لوکیشن برای تصمیم‌گیری ابزار روی خود گوشی باقی می‌ماند.</Text>
        </View>
      )}

      <Text style={[styles.sectionTitle, { marginTop: 22, marginBottom: 10 }]}>دسترسی‌ها</Text>
      <View style={styles.card}>
        {permissionItems.map(([id, title, action]) => (
          <Pressable key={id} style={styles.permissionButton} onPress={action}>
            <Text style={styles.permissionText}>{icon(id)} {title}</Text>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.infoButton} onPress={() => Alert.alert('محدودیت iOS', 'Expo Go به SMS/iMessage history، Call History و wake-word دائمی دسترسی آزاد نمی‌دهد. برای Hey Farangis واقعی و App Intents باید بعداً Development/Native Build بسازیم.')}>
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
  input: { minHeight: 86, backgroundColor: '#0E1118', borderWidth: 1, borderColor: '#2A3140', borderRadius: 17, color: '#FFFFFF', fontSize: 16, padding: 14, marginTop: 12 },
  smallInput: { minHeight: 48, backgroundColor: '#0E1118', borderWidth: 1, borderColor: '#2A3140', borderRadius: 14, color: '#FFFFFF', fontSize: 14, padding: 12, marginTop: 6, textAlign: 'left' },
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
  aiHeader: { marginTop: 16, backgroundColor: '#171C26', borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  aiTitle: { color: '#FFFFFF', fontWeight: '900', textAlign: 'right' },
  aiHint: { color: '#7E879A', fontSize: 12, marginTop: 3, textAlign: 'right' },
  aiCard: { backgroundColor: '#151922', borderRadius: 18, padding: 15, marginTop: 8 },
  label: { color: '#AAB2C2', fontSize: 12, textAlign: 'right', marginTop: 10 },
  saveButton: { backgroundColor: '#315DDA', borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
  saveButtonText: { color: '#FFFFFF', fontWeight: '900' },
  securityText: { color: '#7E879A', fontSize: 11, lineHeight: 19, textAlign: 'right', marginTop: 12 },
  card: { backgroundColor: '#151922', borderRadius: 22, overflow: 'hidden' },
  permissionButton: { minHeight: 60, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#252A35', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  permissionText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  arrow: { color: '#697386', fontSize: 28 },
  infoButton: { marginTop: 16, backgroundColor: '#1D222D', borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  infoButtonText: { color: '#D9DEEA', fontWeight: '700' },
});
