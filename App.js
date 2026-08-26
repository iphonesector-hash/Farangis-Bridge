import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Audio } from 'expo-av';
import { DEFAULT_AI_CONFIG, answerWithInternet, planWithAI } from './src/ai';
import { transcribeAudio } from './src/voice';

const normalizeDigits = (value = '') => String(value)
  .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
  .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

const normalize = (value = '') => normalizeDigits(value)
  .toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک')
  .replace(/[؟?!.,،؛:]/g, ' ').replace(/\s+/g, ' ').trim();

const birthdayText = (birthday) => {
  if (!birthday) return '';
  const year = birthday.year ? `${birthday.year}/` : '';
  return `${year}${String(birthday.month || '').padStart(2, '0')}/${String(birthday.day || '').padStart(2, '0')}`;
};

const looksLive = (text) => {
  const t = normalize(text);
  return /(قیمت|نرخ|اخبار|خبر|آب و هوا|هواشناسی|آخرین|جدیدترین|امروز|الان).*(دلار|یورو|ارز|طلا|سکه|بورس|بیت ?کوین|اتریوم|هوا|خبر|قیمت|نتیجه|بازار)/.test(t)
    || /(دلار|یورو|ارز|طلا|سکه|بورس|بیت ?کوین|هوا).*(امروز|الان|قیمت|نرخ)/.test(t)
    || t.includes('آخرین خبر') || t.includes('خبر جدید');
};

export default function App() {
  const [status, setStatus] = useState({});
  const [result, setResult] = useState('فرنگیس آماده است. دکمه میکروفن را بزن و حرف بزن.');
  const [command, setCommand] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [speakAnswers, setSpeakAnswers] = useState(true);
  const [showAISettings, setShowAISettings] = useState(false);
  const [aiKey, setAiKey] = useState('');
  const [aiBaseUrl, setAiBaseUrl] = useState(DEFAULT_AI_CONFIG.baseUrl);
  const [aiModel, setAiModel] = useState(DEFAULT_AI_CONFIG.model);
  const [lastFile, setLastFile] = useState(null);
  const recordingRef = useRef(null);
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

  const quickCommands = useMemo(() => [
    'قیمت دلار امروز چنده؟',
    'لوکیشن فعلیم رو روی نقشه باز کن',
    'شماره مستانه رو پیدا کن',
    'چه کسایی تاریخ تولد دارن؟',
  ], []);

  const setAccess = (name, value) => setStatus((old) => ({ ...old, [name]: value }));

  const say = async (text) => {
    const output = String(text ?? '');
    setResult(output);
    if (!speakAnswers) return;
    try {
      await Speech.stop();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });

      const voices = await Speech.getAvailableVoicesAsync().catch(() => []);
      const persianVoices = (voices || []).filter((v) => /^fa(?:-|_)/i.test(String(v.language || '')));
      const preferredFemaleNames = ['neda', 'roya', 'shadi', 'sara', 'farah', 'farnaz'];
      const femaleVoice = persianVoices.find((v) => {
        const label = `${v.name || ''} ${v.identifier || ''}`.toLowerCase();
        return preferredFemaleNames.some((name) => label.includes(name));
      });
      const selectedVoice = femaleVoice || persianVoices[0] || null;

      Speech.speak(output.replace(/\n/g, ' '), {
        language: selectedVoice?.language || 'fa-IR',
        voice: selectedVoice?.identifier,
        rate: 0.9,
        pitch: 1.04,
        onError: (error) => setResult(`${output}\n\n⚠️ خطای پخش صدا: ${String(error)}`),
      });
    } catch (error) {
      setResult(`${output}\n\n⚠️ خطای آماده‌سازی صدا: ${String(error)}`);
    }
  };

  const saveAISettings = async () => {
    await Promise.all([
      SecureStore.setItemAsync('farangis_ai_key', aiKey.trim()),
      SecureStore.setItemAsync('farangis_ai_base_url', aiBaseUrl.trim()),
      SecureStore.setItemAsync('farangis_ai_model', aiModel.trim()),
    ]);
    setShowAISettings(false);
    await say('🧠 تنظیمات AI ذخیره شد.');
  };

  const ensureContacts = async () => {
    const p = await Contacts.requestPermissionsAsync();
    const ok = p.status === 'granted'; setAccess('Contacts', ok ? 'granted' : 'denied'); return ok;
  };
  const ensurePhotos = async () => {
    const p = await MediaLibrary.requestPermissionsAsync();
    const ok = p.granted || p.status === 'granted'; setAccess('Photos', ok ? 'granted' : 'denied'); return ok;
  };
  const ensureLocation = async () => {
    const p = await Location.requestForegroundPermissionsAsync();
    const ok = p.status === 'granted'; setAccess('Location', ok ? 'granted' : 'denied'); return ok;
  };
  const ensureNotifications = async () => {
    const p = await Notifications.requestPermissionsAsync();
    const ok = p.status === 'granted'; setAccess('Notifications', ok ? 'granted' : 'denied'); return ok;
  };

  const toolContactsSummary = async () => {
    if (!(await ensureContacts())) return 'دسترسی مخاطبین فعال نیست.';
    const r = await Contacts.getContactsAsync({ fields: [Contacts.Fields.Name, Contacts.Fields.Birthday] });
    const data = r.data || [];
    return `👥 تعداد مخاطبین: ${data.length}\n🎂 دارای تاریخ تولد: ${data.filter((x) => x.birthday).length}`;
  };
  const toolBirthdays = async () => {
    if (!(await ensureContacts())) return 'دسترسی مخاطبین فعال نیست.';
    const r = await Contacts.getContactsAsync({ fields: [Contacts.Fields.Name, Contacts.Fields.Birthday] });
    const items = (r.data || []).filter((x) => x.birthday).sort((a,b) => (a.birthday?.month||0)-(b.birthday?.month||0) || (a.birthday?.day||0)-(b.birthday?.day||0));
    if (!items.length) return 'هیچ تاریخ تولدی در مخاطبین ثبت نشده.';
    return `🎂 ${items.length} مخاطب دارای تاریخ تولد:\n\n${items.map((x,i)=>`${i+1}. ${x.name || 'بدون نام'} — ${birthdayText(x.birthday)}`).join('\n')}`;
  };
  const getContactMatches = async (query) => {
    if (!(await ensureContacts())) return [];
    const r = await Contacts.getContactsAsync({ fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails, Contacts.Fields.Birthday] });
    const needle = normalize(query);
    return (r.data || []).filter((x) => normalize(x.name || '').includes(needle));
  };
  const toolFindContact = async (query) => {
    const matches = await getContactMatches(query);
    if (!matches.length) return `مخاطبی با نام «${query}» پیدا نشد.`;
    return matches.slice(0,10).map((x) => {
      const parts = [`👤 ${x.name || 'بدون نام'}`];
      const phones = (x.phoneNumbers || []).map((p)=>p.number).filter(Boolean);
      const emails = (x.emails || []).map((e)=>e.email).filter(Boolean);
      if (phones.length) parts.push(`📞 ${phones.join(' ، ')}`);
      if (emails.length) parts.push(`✉️ ${emails.join(' ، ')}`);
      if (x.birthday) parts.push(`🎂 ${birthdayText(x.birthday)}`);
      return parts.join('\n');
    }).join('\n\n');
  };
  const toolCallContact = async (query) => {
    const m = await getContactMatches(query); const phone = m[0]?.phoneNumbers?.find((p)=>p.number)?.number;
    if (!phone) return `شماره‌ای برای «${query}» پیدا نکردم.`;
    await Linking.openURL(`tel:${phone.replace(/\s/g,'')}`); return `📞 شماره‌گیر برای ${m[0]?.name || query} باز شد.`;
  };
  const toolMessageContact = async (query) => {
    const m = await getContactMatches(query); const phone = m[0]?.phoneNumbers?.find((p)=>p.number)?.number;
    if (!phone) return `شماره‌ای برای «${query}» پیدا نکردم.`;
    await Linking.openURL(`sms:${phone.replace(/\s/g,'')}`); return `💬 پیام برای ${m[0]?.name || query} باز شد.`;
  };
  const toolPhotos = async () => {
    if (!(await ensurePhotos())) return 'دسترسی عکس‌ها فعال نیست.';
    const a = await MediaLibrary.getAssetsAsync({ first: 1 }); return `🖼 تعداد عکس و ویدیوی قابل مشاهده: ${a.totalCount}`;
  };
  const toolRecentMedia = async () => {
    if (!(await ensurePhotos())) return 'دسترسی عکس‌ها فعال نیست.';
    const a = await MediaLibrary.getAssetsAsync({ first: 10, sortBy: [[MediaLibrary.SortBy.creationTime, false]] });
    return a.assets.length ? `🖼 ${a.assets.length} آیتم اخیر پیدا شد.` : 'هیچ عکس یا ویدیویی پیدا نشد.';
  };
  const toolLocation = async () => {
    if (!(await ensureLocation())) return 'دسترسی موقعیت مکانی فعال نیست.';
    const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return `📍 Latitude: ${l.coords.latitude}\nLongitude: ${l.coords.longitude}\nAccuracy: ${Math.round(l.coords.accuracy || 0)}m`;
  };
  const toolOpenCurrentLocation = async () => {
    if (!(await ensureLocation())) return 'دسترسی موقعیت مکانی فعال نیست.';
    const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    await Linking.openURL(`https://maps.apple.com/?ll=${l.coords.latitude},${l.coords.longitude}`); return '🗺 موقعیت فعلی روی نقشه باز شد.';
  };
  const toolMapsSearch = async (q) => { await Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(q)}`); return `🗺 «${q}» روی نقشه جستجو شد.`; };
  const toolClipboard = async () => { const t = await Clipboard.getStringAsync(); setAccess('Clipboard','granted'); return t ? `📋 ${t}` : 'کلیپ‌بورد خالی است.'; };
  const toolCopy = async (t) => { await Clipboard.setStringAsync(String(t)); return '📋 در کلیپ‌بورد ذخیره شد.'; };
  const toolGoogle = async (q) => { await Linking.openURL(q ? `https://www.google.com/search?q=${encodeURIComponent(q)}` : 'https://www.google.com/'); return q ? `🔎 جستجوی «${q}» باز شد.` : 'گوگل باز شد.'; };
  const toolInternet = async (q) => answerWithInternet({ query: q, baseUrl: aiBaseUrl, apiKey: aiKey });
  const toolOpenUrl = async (url) => { const u = /^https?:\/\//i.test(url) ? url : `https://${url}`; await Linking.openURL(u); return `🌐 ${u} باز شد.`; };
  const toolShare = async (t) => { await Share.share({ message: String(t) }); return '↗️ صفحه اشتراک باز شد.'; };
  const toolSecureSave = async (k,v) => { await SecureStore.setItemAsync(`farangis_${k}`, String(v)); return `🔐 «${k}» ذخیره شد.`; };
  const toolSecureRead = async (k) => { const v = await SecureStore.getItemAsync(`farangis_${k}`); return v ? `🔐 ${k}: ${v}` : `چیزی با نام «${k}» ندارم.`; };
  const toolCalendarOpenCreate = async (title='رویداد جدید') => { await Calendar.createEventInCalendarAsync({ title }); return '📅 صفحه ساخت رویداد باز شد.'; };
  const toolReminder = async (minutes, body) => {
    if (!(await ensureNotifications())) return 'دسترسی اعلان‌ها فعال نیست.';
    const m = Math.max(1, Number(minutes)||1);
    await Notifications.scheduleNotificationAsync({ content: { title:'فرنگیس', body: body || 'یادآوری', sound:true }, trigger: { seconds: m*60 } });
    return `⏰ برای ${m} دقیقه دیگر ثبت شد: ${body || 'یادآوری'}`;
  };

  const toolPickFile = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
    if (picked.canceled || !picked.assets?.[0]) return 'انتخاب فایل لغو شد.';
    const asset = picked.assets[0]; setLastFile(asset); setAccess('Files','granted');
    const size = asset.size ? `${Math.round(asset.size/1024)} KB` : 'نامشخص';
    return `📁 فایل انتخاب شد:\n${asset.name}\nنوع: ${asset.mimeType || 'نامشخص'}\nحجم: ${size}`;
  };
  const readSelectedFile = async () => {
    if (!lastFile?.uri) throw new Error('ابتدا یک فایل از Files انتخاب کن.');
    if (lastFile.size && lastFile.size > 2 * 1024 * 1024) throw new Error('برای خواندن متنی، فعلاً فایل باید کمتر از ۲ مگابایت باشد.');
    return FileSystem.readAsStringAsync(lastFile.uri);
  };
  const toolReadSelectedFile = async () => {
    const text = await readSelectedFile();
    const preview = text.length > 6000 ? `${text.slice(0,6000)}\n…` : text;
    return `📄 ${lastFile.name}\n\n${preview}`;
  };
  const toolSearchSelectedFile = async (query) => {
    const text = await readSelectedFile(); const needle = normalize(query);
    const lines = text.split(/\r?\n/); const hits = lines.filter((line)=>normalize(line).includes(needle)).slice(0,20);
    return hits.length ? `🔎 ${hits.length} نتیجه اول در ${lastFile.name}:\n\n${hits.join('\n')}` : `«${query}» داخل فایل انتخاب‌شده پیدا نشد.`;
  };
  const toolShareSelectedFile = async () => {
    if (!lastFile?.uri) return 'ابتدا یک فایل انتخاب کن.';
    if (!(await Sharing.isAvailableAsync())) return 'اشتراک فایل روی این دستگاه در دسترس نیست.';
    await Sharing.shareAsync(lastFile.uri); return '📤 صفحه بازکردن/اشتراک فایل نمایش داده شد.';
  };

  const toolOpenApp = async (appName) => {
    const n = normalize(appName);
    if (n.includes('فایل') || n.includes('files')) return toolPickFile();
    if (n.includes('تنظیمات') || n.includes('settings')) { await Linking.openSettings(); return '⚙️ تنظیمات باز شد.'; }
    const schemes = [
      [['تلگرام','telegram'],'tg://'], [['واتساپ','whatsapp'],'whatsapp://'], [['اینستاگرام','instagram'],'instagram://'],
      [['یوتیوب','youtube'],'youtube://'], [['جیمیل','gmail'],'googlegmail://'], [['کروم','chrome'],'googlechrome://'],
      [['نقشه','maps'],'maps://'], [['موزیک','music'],'music://'], [['اپ استور','app store','appstore'],'itms-apps://'],
      [['شورتکات','shortcuts'],'shortcuts://'], [['نوت','notes','یادداشت'],'mobilenotes://'],
    ];
    const found = schemes.find(([names]) => names.some((x)=>n.includes(x)));
    if (!found) return `برای «${appName}» آدرس بازکردن مطمئن ندارم. iOS لیست کامل برنامه‌های نصب‌شده را در اختیار اپ‌ها نمی‌گذارد.`;
    try { await Linking.openURL(found[1]); return `📱 ${appName} باز شد.`; }
    catch { return `نتونستم ${appName} رو باز کنم؛ ممکنه نصب نباشه یا iOS اجازه این URL Scheme رو نده.`; }
  };

  const toolRunShortcut = async (name, input='') => {
    const url = `shortcuts://run-shortcut?name=${encodeURIComponent(name)}&input=text&text=${encodeURIComponent(input)}`;
    try { await Linking.openURL(url); return `⚡️ شورتکات «${name}» اجرا شد.`; }
    catch { return `شورتکات «${name}» اجرا نشد. اول باید چنین Shortcutی در برنامه Shortcuts وجود داشته باشد.`; }
  };
  const toolNotesOpen = async () => toolOpenApp('Notes');

  const executeAITool = async (plan) => {
    if (!plan || plan.type === 'answer') return plan?.text || 'پاسخی دریافت نشد.';
    const a = plan.args || {};
    switch (plan.tool) {
      case 'contacts_summary': return toolContactsSummary(); case 'list_birthdays': return toolBirthdays();
      case 'find_contact': return toolFindContact(a.name||''); case 'call_contact': return toolCallContact(a.name||''); case 'message_contact': return toolMessageContact(a.name||'');
      case 'photos_count': return toolPhotos(); case 'recent_media': return toolRecentMedia();
      case 'location': return toolLocation(); case 'open_current_location': return toolOpenCurrentLocation(); case 'maps_search': return toolMapsSearch(a.query||'');
      case 'clipboard_read': return toolClipboard(); case 'clipboard_write': return toolCopy(a.text||'');
      case 'google_search': return toolGoogle(a.query||''); case 'internet_search': return toolInternet(a.query||command);
      case 'open_url': return toolOpenUrl(a.url||''); case 'open_app': return toolOpenApp(a.app||'');
      case 'files_pick': return toolPickFile(); case 'file_read_selected': return toolReadSelectedFile(); case 'file_search_selected': return toolSearchSelectedFile(a.query||''); case 'file_share_selected': return toolShareSelectedFile();
      case 'shortcut_run': return toolRunShortcut(a.name||'', a.input||''); case 'notes_open': return toolNotesOpen();
      case 'share': return toolShare(a.text||''); case 'secure_save': return toolSecureSave(a.key||'item',a.value||''); case 'secure_read': return toolSecureRead(a.key||'item');
      case 'calendar_create': return toolCalendarOpenCreate(a.title||'رویداد جدید'); case 'reminder': return toolReminder(a.minutes||1,a.body||'یادآوری');
      default: return 'AI یک ابزار ناشناخته انتخاب کرد.';
    }
  };

  const runAIRouter = async (raw) => {
    if (!aiKey.trim()) return 'برای فهم آزاد و اینترنت، کلید API را در تنظیمات AI وارد کن.';
    if (looksLive(raw)) return toolInternet(raw);
    const plan = await planWithAI({ command: raw, baseUrl: aiBaseUrl, apiKey: aiKey, model: aiModel });
    return executeAITool(plan);
  };

  const testCamera = async () => { const p = await requestCameraPermission(); setAccess('Camera', p.granted ? 'granted':'denied'); await say(p.granted ? '📷 دوربین فعال است.' : 'دسترسی دوربین داده نشد.'); };
  const testMicrophone = async () => { const p = await Audio.requestPermissionsAsync(); const ok = p.status==='granted'; setAccess('Microphone',ok?'granted':'denied'); await say(ok?'🎙 میکروفن فعال است.':'دسترسی میکروفن داده نشد.'); };

  const runCommand = async (rawCommand = command) => {
    const raw = String(rawCommand || '').trim(); if (!raw) return;
    const text = normalize(raw); setCommand(raw); setBusy(true); setResult('در حال انجام...');
    try {
      let output;
      const reminder = text.match(/یادآوری\s+(\d+)\s*دقیقه\s*(?:دیگه|دیگر)?\s*(.*)/);
      const call = text.match(/(?:زنگ بزن به|تماس بگیر با|تماس با)\s+(.+)/);
      const sms = text.match(/(?:پیام بده به|اس ام اس به|sms به)\s+(.+)/);
      if (reminder) output = await toolReminder(reminder[1], reminder[2]);
      else if (call) output = await toolCallContact(call[1].trim());
      else if (sms) output = await toolMessageContact(sms[1].trim());
      else if (text.includes('فایل') && (text.includes('باز کن') || text.includes('انتخاب'))) output = await toolPickFile();
      else if (text.includes('فایل انتخاب') && text.includes('بخون')) output = await toolReadSelectedFile();
      else if (text.startsWith('برنامه ') && text.includes('باز کن')) output = await toolOpenApp(raw.replace(/^برنامه\s+/i,'').replace(/رو?\s*باز کن.*$/i,'').trim());
      else if (looksLive(raw)) output = await toolInternet(raw);
      else output = await runAIRouter(raw);
      await say(output);
    } catch (error) { await say(`❌ خطا:\n${String(error)}`); }
    finally { setBusy(false); }
  };

  const startVoice = async () => {
    if (!aiKey.trim()) {
      await say('برای فرمان صوتی، اول Groq API Key را در تنظیمات AI ذخیره کن.');
      return;
    }
    try {
      await Speech.stop();
      const p = await Audio.requestPermissionsAsync();
      if (p.status !== 'granted') {
        setAccess('Microphone','denied');
        await say('دسترسی میکروفن داده نشد.');
        return;
      }
      setAccess('Microphone','granted');
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const created = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = created.recording;
      setRecording(true);
      setResult('🎙 دارم گوش می‌دم... حرف بزن، بعد دوباره میکروفن رو بزن.');
    } catch (error) {
      recordingRef.current = null;
      setRecording(false);
      await say(`❌ شروع ضبط نشد:\n${String(error)}`);
    }
  };

  const stopVoice = async () => {
    const active = recordingRef.current;
    if (!active) return;
    setVoiceBusy(true);
    setRecording(false);
    setResult('🧠 دارم صدات رو می‌فهمم...');
    try {
      await active.stopAndUnloadAsync();
      const uri = active.getURI();
      recordingRef.current = null;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const transcript = await transcribeAudio({ uri, apiKey: aiKey.trim() });
      setCommand(transcript);
      setResult(`🎤 شنیدم: «${transcript}»`);
      await runCommand(transcript);
    } catch (error) {
      recordingRef.current = null;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }).catch(()=>{});
      await say(`❌ تبدیل صدا به متن انجام نشد:\n${String(error)}`);
    } finally {
      setVoiceBusy(false);
    }
  };

  const toggleVoice = async () => {
    if (voiceBusy || busy) return;
    if (recording) await stopVoice();
    else await startVoice();
  };

  const permissionItems = [
    ['Contacts','👥 Contacts',async()=>say(await toolContactsSummary())], ['Photos','🖼 Photos',async()=>say(await toolPhotos())],
    ['Location','📍 Location',async()=>say(await toolLocation())], ['Files','📁 Files',async()=>say(await toolPickFile())],
    ['Camera','📷 Camera',testCamera], ['Microphone','🎙 Microphone',testMicrophone], ['Clipboard','📋 Clipboard',async()=>say(await toolClipboard())],
    ['Notifications','🔔 Notifications',async()=>say((await ensureNotifications())?'🔔 اعلان‌ها فعال هستند.':'دسترسی اعلان‌ها داده نشد.')],
  ];
  const icon = (name) => status[name]==='granted'?'✅':status[name]==='denied'?'❌':'⚪️';

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.logo}>🧠</Text><Text style={styles.title}>فرنگیس</Text><Text style={styles.subtitle}>Farangis Personal Bridge 1.6 Voice</Text>

      <View style={styles.voiceCard}>
        <Text style={styles.voiceHeroTitle}>{recording ? '🎙 دارم گوش می‌دم...' : voiceBusy ? '🧠 دارم می‌فهمم...' : '🎤 با فرنگیس حرف بزن'}</Text>
        <Text style={styles.voiceHeroHint}>{recording ? 'حرفت که تموم شد دوباره دکمه رو بزن.' : 'یک بار بزن، حرف بزن، دوباره بزن؛ بقیه کار خودکاره.'}</Text>
        <Pressable style={[styles.micButton, recording && styles.micButtonRecording, (voiceBusy||busy) && styles.disabledButton]} disabled={voiceBusy||busy} onPress={toggleVoice}>
          <Text style={styles.micIcon}>{recording ? '⏹' : '🎙'}</Text>
          <Text style={styles.micText}>{recording ? 'پایان و اجرا' : voiceBusy ? 'در حال پردازش...' : 'شروع صحبت'}</Text>
        </Pressable>
      </View>

      <View style={styles.commandCard}>
        <Text style={styles.sectionTitle}>فرمان متنی</Text>
        <TextInput value={command} onChangeText={setCommand} placeholder="مثلاً: قیمت دلار امروز چنده؟" placeholderTextColor="#687083" style={styles.input} multiline textAlign="right" />
        <View style={styles.row}>
          <Pressable style={[styles.primaryButton,busy&&styles.disabledButton]} disabled={busy} onPress={()=>runCommand()}><Text style={styles.primaryButtonText}>{busy?'در حال اجرا...':'اجرا کن'}</Text></Pressable>
          <Pressable style={styles.clearButton} onPress={()=>{setCommand('');setResult('فرنگیس آماده است.');}}><Text style={styles.clearButtonText}>پاک کن</Text></Pressable>
        </View>
        <View style={styles.voiceRow}><View style={{flex:1}}><Text style={styles.voiceTitle}>پاسخ صوتی فرنگیس</Text><Text style={styles.voiceHint}>بعد از فهم فرمان، جواب را با صدای فارسی می‌خواند.</Text></View><Switch value={speakAnswers} onValueChange={setSpeakAnswers}/></View>
        <View style={styles.quickWrap}>{quickCommands.map((x)=><Pressable key={x} style={styles.quickButton} onPress={()=>runCommand(x)}><Text style={styles.quickText}>{x}</Text></Pressable>)}</View>
      </View>

      <View style={styles.resultBox}><View style={styles.resultHeader}><Text style={styles.sectionTitle}>خروجی فرنگیس</Text><Pressable onPress={()=>toolShare(result)}><Text style={styles.shareText}>اشتراک</Text></Pressable></View><Text selectable style={styles.resultText}>{result}</Text></View>

      {lastFile && <View style={styles.fileBox}><Text style={styles.sectionTitle}>فایل انتخاب‌شده</Text><Text style={styles.fileText}>{lastFile.name}</Text><View style={styles.row}><Pressable style={styles.smallButton} onPress={()=>toolReadSelectedFile().then(say).catch((e)=>say(String(e)))}><Text style={styles.smallButtonText}>بخوان</Text></Pressable><Pressable style={styles.smallButton} onPress={()=>toolShareSelectedFile().then(say)}><Text style={styles.smallButtonText}>باز/اشتراک</Text></Pressable></View></View>}

      <Pressable style={styles.aiHeader} onPress={()=>setShowAISettings(!showAISettings)}><Text style={styles.sectionTitle}>🧠 تنظیمات AI و اینترنت</Text><Text style={styles.arrow}>›</Text></Pressable>
      {showAISettings && <View style={styles.settingsBox}>
        <Text style={styles.settingsHint}>همین Groq API Key برای فهم فرمان، اینترنت و تبدیل صدای فارسی به متن استفاده می‌شود و فقط در Secure Store گوشی ذخیره می‌شود.</Text>
        <TextInput value={aiKey} onChangeText={setAiKey} placeholder="Groq API Key" placeholderTextColor="#687083" secureTextEntry style={styles.settingsInput}/>
        <TextInput value={aiBaseUrl} onChangeText={setAiBaseUrl} placeholder="API URL" placeholderTextColor="#687083" autoCapitalize="none" style={styles.settingsInput}/>
        <TextInput value={aiModel} onChangeText={setAiModel} placeholder="Planner model" placeholderTextColor="#687083" autoCapitalize="none" style={styles.settingsInput}/>
        <Pressable style={styles.primaryButton} onPress={()=>saveAISettings().catch((e)=>say(String(e)))}><Text style={styles.primaryButtonText}>ذخیره تنظیمات</Text></Pressable>
      </View>}

      <Text style={[styles.sectionTitle,{marginTop:22,marginBottom:10}]}>دسترسی‌ها</Text>
      <View style={styles.card}>{permissionItems.map(([id,title,action])=><Pressable key={id} style={styles.permissionButton} onPress={action}><Text style={styles.permissionText}>{icon(id)} {title}</Text><Text style={styles.arrow}>›</Text></Pressable>)}</View>

      <Pressable style={styles.infoButton} onPress={()=>Alert.alert('مرحله بعد','اول نسخه صوتی را عملیاتی و پایدار می‌کنیم. Wake phrase «هی فرنگیس» و پل‌های Shortcuts را بعد از تست این نسخه اضافه می‌کنیم.')}><Text style={styles.infoButtonText}>نقشه راه فرنگیس صوتی</Text></Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#0B0D12'}, content:{paddingTop:56,paddingHorizontal:16,paddingBottom:80}, logo:{textAlign:'center',fontSize:54},
  title:{color:'#FFF',textAlign:'center',fontSize:31,fontWeight:'900',marginTop:4}, subtitle:{color:'#8D96A8',textAlign:'center',marginTop:4,marginBottom:20},
  sectionTitle:{color:'#FFF',fontSize:16,fontWeight:'800',textAlign:'right'},
  voiceCard:{backgroundColor:'#151922',borderRadius:24,padding:18,marginBottom:16,alignItems:'center'},voiceHeroTitle:{color:'#FFF',fontSize:20,fontWeight:'900',textAlign:'center'},voiceHeroHint:{color:'#8D96A8',fontSize:13,lineHeight:20,textAlign:'center',marginTop:6},
  micButton:{marginTop:16,minWidth:220,backgroundColor:'#4B66F0',borderRadius:24,paddingVertical:16,paddingHorizontal:22,alignItems:'center'},micButtonRecording:{backgroundColor:'#B23A48'},micIcon:{fontSize:30},micText:{color:'#FFF',fontWeight:'900',fontSize:15,marginTop:5},
  commandCard:{backgroundColor:'#151922',borderRadius:24,padding:16},
  input:{minHeight:86,backgroundColor:'#0E1118',borderWidth:1,borderColor:'#2A3140',borderRadius:17,color:'#FFF',fontSize:16,padding:14,marginTop:12},
  row:{flexDirection:'row',gap:10,marginTop:12}, primaryButton:{flex:1,backgroundColor:'#4B66F0',borderRadius:15,paddingVertical:14,alignItems:'center'},
  disabledButton:{opacity:.55},primaryButtonText:{color:'#FFF',fontWeight:'900'},clearButton:{backgroundColor:'#242A35',borderRadius:15,paddingVertical:14,paddingHorizontal:18,alignItems:'center'},clearButtonText:{color:'#D9DEEA',fontWeight:'800'},
  voiceRow:{flexDirection:'row',alignItems:'center',gap:12,marginTop:16},voiceTitle:{color:'#F4F6FB',textAlign:'right',fontWeight:'700'},voiceHint:{color:'#7E879A',textAlign:'right',fontSize:12,marginTop:3},
  quickWrap:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:16,justifyContent:'flex-end'},quickButton:{backgroundColor:'#202631',borderRadius:14,paddingHorizontal:11,paddingVertical:9},quickText:{color:'#C9D0DE',fontSize:12},
  resultBox:{backgroundColor:'#151922',borderRadius:24,padding:16,marginTop:16},resultHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},shareText:{color:'#8596FF',fontWeight:'700'},resultText:{color:'#FFF',fontSize:15,lineHeight:25,textAlign:'right',marginTop:12},
  fileBox:{backgroundColor:'#151922',borderRadius:20,padding:16,marginTop:16},fileText:{color:'#D9DEEA',textAlign:'right',marginTop:8},smallButton:{flex:1,backgroundColor:'#242A35',borderRadius:13,paddingVertical:11,alignItems:'center'},smallButtonText:{color:'#FFF',fontWeight:'700'},
  aiHeader:{marginTop:16,backgroundColor:'#151922',borderRadius:18,padding:16,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},settingsBox:{backgroundColor:'#151922',borderRadius:18,padding:16,marginTop:8},settingsHint:{color:'#8D96A8',fontSize:12,lineHeight:20,textAlign:'right',marginBottom:10},settingsInput:{backgroundColor:'#0E1118',borderRadius:14,color:'#FFF',padding:12,marginBottom:10,borderWidth:1,borderColor:'#2A3140'},
  card:{backgroundColor:'#151922',borderRadius:22,overflow:'hidden'},permissionButton:{minHeight:60,paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:'#252A35',flexDirection:'row',alignItems:'center',justifyContent:'space-between'},permissionText:{color:'#FFF',fontSize:15,fontWeight:'650'},arrow:{color:'#697386',fontSize:28},
  infoButton:{marginTop:16,backgroundColor:'#1D222D',borderRadius:16,paddingVertical:14,alignItems:'center'},infoButtonText:{color:'#D9DEEA',fontWeight:'700'},
});