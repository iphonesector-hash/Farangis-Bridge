import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import VoiceOrb from './src/components/VoiceOrb';
import { COLORS, SHADOW } from './src/theme';
import {
  getCoreConfig,
  healthCheck,
  saveCoreConfig,
  sendChat,
  submitAction,
  transcribeViaCore,
} from './src/services/farangisApi';
import { speakFarangis, stopSpeaking } from './src/services/tts';

const TABS = [
  ['home', 'خانه', '⌂'],
  ['voice', 'صدا', '◉'],
  ['activity', 'فعالیت', '◫'],
  ['health', 'سلامت', '✚'],
  ['settings', 'تنظیمات', '⚙'],
];

const quickActions = [
  ['customer', 'ثبت مشتری', '◎'],
  ['route', 'مسیر', '⌖'],
  ['reminder', 'یادآوری', '◷'],
  ['history', 'سابقه', '≡'],
];

const assistantGreeting = 'سلام، من فرنگیس هستم. آماده‌ام با صدات فرمان بگیرم و جواب فارسی بدم.';

export default function App() {
  const [tab, setTab] = useState('home');
  const [mode, setMode] = useState('idle');
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [speakAnswers, setSpeakAnswers] = useState(true);
  const [preferCloudVoice, setPreferCloudVoice] = useState(true);
  const [command, setCommand] = useState('');
  const [result, setResult] = useState(assistantGreeting);
  const [history, setHistory] = useState([]);
  const [pendingAction, setPendingAction] = useState(null);
  const [health, setHealth] = useState(null);
  const [coreUrl, setCoreUrl] = useState('');
  const [deviceToken, setDeviceToken] = useState('');
  const [debug, setDebug] = useState(false);
  const [lastProvider, setLastProvider] = useState('—');
  const recordingRef = useRef(null);
  const intro = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(intro, { toValue: 1, duration: 650, useNativeDriver: true }).start();
    getCoreConfig().then((cfg) => {
      setCoreUrl(cfg.baseUrl || '');
      setDeviceToken(cfg.deviceToken || '');
    }).catch(() => {});
  }, [intro]);

  const modeLabel = useMemo(() => ({
    idle: 'آماده',
    listening: 'دارم گوش می‌دم',
    thinking: 'دارم فکر می‌کنم',
    speaking: 'دارم جواب می‌دم',
  }[mode] || 'آماده'), [mode]);

  const addHistory = (role, text, meta = {}) => {
    setHistory((old) => [...old.slice(-23), { id: `${Date.now()}-${Math.random()}`, role, text, at: new Date(), ...meta }]);
  };

  const speak = async (text) => {
    const output = String(text || '').trim();
    if (!output) return;
    setResult(output);
    addHistory('assistant', output);
    if (!speakAnswers) return;
    setMode('speaking');
    try {
      const info = await speakFarangis(output, { preferCloud: preferCloudVoice });
      setLastProvider(info.provider || 'unknown');
    } catch (error) {
      setLastProvider('failed');
      if (debug) setResult(`${output}\n\n⚠️ TTS: ${String(error)}`);
    } finally {
      setMode('idle');
    }
  };

  const executeClientAction = async (tool, args = {}) => {
    if (tool === 'maps.search') {
      await Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(args.query || '')}`);
      return 'نقشه باز شد.';
    }
    if (tool === 'reminder.create') {
      const permission = await Notifications.requestPermissionsAsync();
      if (permission.status !== 'granted') return 'دسترسی اعلان‌ها داده نشده.';
      await Notifications.scheduleNotificationAsync({
        content: { title: 'فرنگیس', body: args.raw || 'یادآوری', sound: true },
        trigger: { seconds: 60 },
      });
      return 'یادآوری ثبت شد. فعلاً زمان پیش‌فرض یک دقیقه است تا parser زمان کامل‌تر فعال شود.';
    }
    return 'این فرمان برای اجرای محلی آماده نشده.';
  };

  const resolveServerAction = async (action, confirmed = false) => {
    const response = await submitAction({ tool: action.tool, args: action.args, confirmed });
    if (response.requiresConfirmation) {
      setPendingAction({ ...response.action, confirmationText: response.confirmationText });
      setResult(response.confirmationText);
      return;
    }
    const payload = response.result || {};
    if (payload.clientAction) {
      await speak(await executeClientAction(payload.tool, payload.args));
      return;
    }
    if (payload.queued) {
      await speak('این فرمان در صف امن ذخیره شد و بعد از آماده شدن اتصال مقصد قابل ارسال است.');
      return;
    }
    await speak(payload.message || 'فرمان با موفقیت انجام شد.');
  };

  const askFarangis = async (textInput = command) => {
    const text = String(textInput || '').trim();
    if (!text || busy) return;
    setBusy(true);
    setMode('thinking');
    setCommand(text);
    addHistory('user', text);
    try {
      const context = history.slice(-6).map((x) => ({ role: x.role, content: x.text }));
      const response = await sendChat({ text, context, mode: 'assistant' });
      if (response.type === 'action' && response.action) {
        setResult(response.text || 'فرمان آماده اجراست.');
        await resolveServerAction(response.action, false);
      } else {
        await speak(response.text || 'پاسخی دریافت نشد.');
      }
    } catch (error) {
      setMode('idle');
      const message = `ارتباط با هسته فرنگیس برقرار نشد: ${error.message || String(error)}`;
      setResult(message);
      addHistory('assistant', message, { error: true });
    } finally {
      setBusy(false);
    }
  };

  const startVoice = async () => {
    if (busy) return;
    await stopSpeaking().catch(() => {});
    const permission = await Audio.requestPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('میکروفن', 'برای صحبت با فرنگیس دسترسی میکروفن لازم است.');
      return;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const created = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    recordingRef.current = created.recording;
    setRecording(true);
    setMode('listening');
    setResult('دارم گوش می‌دم… وقتی حرفت تموم شد دوباره دکمه رو بزن.');
  };

  const stopVoice = async () => {
    const active = recordingRef.current;
    if (!active) return;
    setRecording(false);
    setBusy(true);
    setMode('thinking');
    try {
      await active.stopAndUnloadAsync();
      const uri = active.getURI();
      recordingRef.current = null;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const text = await transcribeViaCore({ uri });
      if (!text) throw new Error('متنی از صدا استخراج نشد.');
      setCommand(text);
      setBusy(false);
      await askFarangis(text);
    } catch (error) {
      recordingRef.current = null;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }).catch(() => {});
      setResult(`تبدیل صدا انجام نشد: ${error.message || String(error)}`);
      setMode('idle');
      setBusy(false);
    }
  };

  const toggleVoice = () => recording ? stopVoice() : startVoice();

  const runHealth = async () => {
    setBusy(true);
    try {
      const data = await healthCheck();
      setHealth(data);
      setResult(data.voiceReady ? 'هسته صوتی فرنگیس آماده است.' : 'هسته بالا است، ولی بعضی سرویس‌های صوتی هنوز تنظیم نشده‌اند.');
    } catch (error) {
      setHealth({ ok: false, error: String(error) });
      setResult(`Health Check ناموفق بود: ${error.message || String(error)}`);
    } finally { setBusy(false); }
  };

  const saveSettings = async () => {
    await saveCoreConfig({ baseUrl: coreUrl, deviceToken });
    setResult('تنظیمات هسته فرنگیس ذخیره شد.');
    await runHealth();
  };

  const runQuickAction = async (id) => {
    if (id === 'customer') return askFarangis('می‌خوام یک سرویس یا مبلغ برای مشتری ثبت کنم');
    if (id === 'route') return askFarangis('مسیر مقصد بعدی رو روی نقشه باز کن');
    if (id === 'reminder') return askFarangis('یک یادآوری برای من بساز');
    if (id === 'history') { setTab('activity'); return; }
  };

  const renderHome = () => (
    <>
      <Animated.View style={{ opacity: intro, transform: [{ translateY: intro.interpolate({ inputRange: [0,1], outputRange: [18,0] }) }] }}>
        <View style={styles.brandBlock}>
          <Text style={styles.brand}>FARANGIS</Text>
          <Text style={styles.brandFa}>فرنگیس</Text>
          <Text style={styles.credit}>MADE BY SECTOR TEAM</Text>
        </View>
      </Animated.View>

      <View style={styles.heroCard}>
        <VoiceOrb mode={mode} />
        <Text style={styles.modeText}>{modeLabel}</Text>
        <Text style={styles.heroHint}>دستیار شخصی فارسی، آماده برای صدا، حافظه و اجرای فرمان</Text>
        <Pressable style={[styles.voiceButton, recording && styles.voiceButtonStop]} onPress={toggleVoice} disabled={busy && !recording}>
          <Text style={styles.voiceButtonIcon}>{recording ? '■' : '●'}</Text>
          <Text style={styles.voiceButtonText}>{recording ? 'پایان صحبت' : 'با فرنگیس حرف بزن'}</Text>
        </Pressable>
      </View>

      <View style={styles.resultCard}>
        <View style={styles.sectionRow}><Text style={styles.sectionTitle}>پاسخ فرنگیس</Text><Text style={styles.badge}>{lastProvider}</Text></View>
        <Text style={styles.resultText}>{result}</Text>
        {pendingAction && <View style={styles.confirmBox}>
          <Text style={styles.confirmText}>{pendingAction.confirmationText}</Text>
          <View style={styles.buttonRow}>
            <Pressable style={styles.confirmButton} onPress={() => { const a = pendingAction; setPendingAction(null); resolveServerAction(a, true); }}><Text style={styles.confirmButtonText}>تأیید</Text></Pressable>
            <Pressable style={styles.cancelButton} onPress={() => { setPendingAction(null); setResult('عملیات لغو شد.'); }}><Text style={styles.cancelText}>لغو</Text></Pressable>
          </View>
        </View>}
      </View>

      <Text style={styles.sectionHeader}>فرمان‌های سریع</Text>
      <View style={styles.quickGrid}>{quickActions.map(([id, label, icon]) => (
        <Pressable key={id} style={styles.quickCard} onPress={() => runQuickAction(id)}>
          <Text style={styles.quickIcon}>{icon}</Text><Text style={styles.quickLabel}>{label}</Text>
        </Pressable>
      ))}</View>
    </>
  );

  const renderVoice = () => (
    <>
      <Text style={styles.screenTitle}>مکالمه صوتی</Text>
      <View style={styles.centerCard}><VoiceOrb mode={mode} /><Text style={styles.modeText}>{modeLabel}</Text></View>
      <View style={styles.inputCard}>
        <TextInput value={command} onChangeText={setCommand} multiline textAlign="right" placeholder="مثلاً: از صادقی هشتصد و پنجاه هزار تومان گرفتم" placeholderTextColor="#697395" style={styles.input}/>
        <View style={styles.buttonRow}>
          <Pressable style={styles.primaryButton} onPress={() => askFarangis()} disabled={busy}><Text style={styles.primaryText}>{busy ? 'در حال پردازش…' : 'ارسال'}</Text></Pressable>
          <Pressable style={styles.secondaryButton} onPress={toggleVoice}><Text style={styles.secondaryText}>{recording ? 'توقف' : 'میکروفن'}</Text></Pressable>
        </View>
      </View>
      <View style={styles.settingRow}><View><Text style={styles.settingTitle}>پاسخ صوتی</Text><Text style={styles.settingHint}>پاسخ فارسی را با صدا پخش کن</Text></View><Switch value={speakAnswers} onValueChange={setSpeakAnswers}/></View>
      <View style={styles.settingRow}><View><Text style={styles.settingTitle}>صدای زنانه ابری</Text><Text style={styles.settingHint}>ElevenLabs؛ در خطا، صدای فارسی iOS</Text></View><Switch value={preferCloudVoice} onValueChange={setPreferCloudVoice}/></View>
    </>
  );

  const renderActivity = () => (
    <>
      <Text style={styles.screenTitle}>فعالیت‌های اخیر</Text>
      {!history.length ? <View style={styles.emptyCard}><Text style={styles.emptyText}>هنوز فعالیتی ثبت نشده.</Text></View> : history.slice().reverse().map((item) => (
        <View key={item.id} style={[styles.historyCard, item.role === 'user' ? styles.userHistory : styles.assistantHistory]}>
          <Text style={styles.historyRole}>{item.role === 'user' ? 'شما' : 'فرنگیس'}</Text>
          <Text style={styles.historyText}>{item.text}</Text>
          <Text style={styles.historyTime}>{item.at.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
      ))}
    </>
  );

  const renderHealth = () => (
    <>
      <Text style={styles.screenTitle}>سلامت سیستم</Text>
      <Pressable style={styles.healthHero} onPress={runHealth}><Text style={styles.healthHeroIcon}>✚</Text><View><Text style={styles.healthHeroTitle}>فرنگیس خودتو چک کن</Text><Text style={styles.healthHeroHint}>Core، Groq، ElevenLabs، Supabase و AquaGold</Text></View></Pressable>
      {health && <View style={styles.healthCard}>
        {health.checks ? Object.entries(health.checks).map(([key, value]) => <View key={key} style={styles.healthRow}><Text style={styles.healthName}>{key}</Text><Text style={[styles.healthStatus, { color: value ? COLORS.success : COLORS.warning }]}>{value ? 'ONLINE' : 'NEEDS CONFIG'}</Text></View>) : <Text style={styles.resultText}>{health.error || 'وضعیت نامشخص'}</Text>}
      </View>}
    </>
  );

  const renderSettings = () => (
    <>
      <Text style={styles.screenTitle}>تنظیمات</Text>
      <View style={styles.settingsCard}>
        <Text style={styles.fieldLabel}>Farangis Core URL</Text>
        <TextInput value={coreUrl} onChangeText={setCoreUrl} autoCapitalize="none" placeholder="https://farangis.vercel.app" placeholderTextColor="#66708E" style={styles.input}/>
        <Text style={styles.fieldLabel}>Device Token</Text>
        <TextInput value={deviceToken} onChangeText={setDeviceToken} secureTextEntry autoCapitalize="none" placeholder="اختیاری تا زمان فعال شدن امنیت سرور" placeholderTextColor="#66708E" style={styles.input}/>
        <View style={styles.settingRow}><View><Text style={styles.settingTitle}>Debug Mode</Text><Text style={styles.settingHint}>نمایش خطاهای فنی برای تست</Text></View><Switch value={debug} onValueChange={setDebug}/></View>
        <Pressable style={styles.primaryButton} onPress={saveSettings}><Text style={styles.primaryText}>ذخیره و تست اتصال</Text></Pressable>
      </View>
      <View style={styles.infoCard}><Text style={styles.infoTitle}>Wake Phrase</Text><Text style={styles.infoText}>پل «هی فرنگیس» برای Vocal Shortcuts/iOS بعد از پایدار شدن نسخه صوتی فعال می‌شود. هسته Vercel از همین حالا برای اتصال آن آماده طراحی شده.</Text></View>
    </>
  );

  const content = tab === 'home' ? renderHome() : tab === 'voice' ? renderVoice() : tab === 'activity' ? renderActivity() : tab === 'health' ? renderHealth() : renderSettings();

  return (
    <View style={styles.root}>
      <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">{content}</ScrollView>
      <View style={styles.nav}>{TABS.map(([id, label, icon]) => <Pressable key={id} style={styles.navItem} onPress={() => setTab(id)}><Text style={[styles.navIcon, tab === id && styles.navActive]}>{icon}</Text><Text style={[styles.navLabel, tab === id && styles.navActive]}>{label}</Text></Pressable>)}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:COLORS.bg}, page:{flex:1}, content:{paddingTop:54,paddingHorizontal:16,paddingBottom:116},
  brandBlock:{alignItems:'center',marginBottom:22},brand:{color:'#fff',fontSize:27,fontWeight:'900',letterSpacing:7},brandFa:{color:'#AEB8D8',fontSize:15,fontWeight:'800',marginTop:3},credit:{color:'#596382',fontSize:7,fontWeight:'800',letterSpacing:2.4,marginTop:4},
  heroCard:{backgroundColor:COLORS.surface,borderRadius:32,padding:22,alignItems:'center',borderWidth:1,borderColor:COLORS.border,...SHADOW},modeText:{color:'#fff',fontSize:19,fontWeight:'900',marginTop:6},heroHint:{color:COLORS.muted,fontSize:12,lineHeight:19,textAlign:'center',marginTop:7,maxWidth:290},
  voiceButton:{marginTop:20,minWidth:225,backgroundColor:COLORS.primary,borderRadius:20,paddingVertical:15,paddingHorizontal:24,flexDirection:'row',justifyContent:'center',gap:9,alignItems:'center'},voiceButtonStop:{backgroundColor:COLORS.danger},voiceButtonIcon:{color:'#fff',fontSize:15},voiceButtonText:{color:'#fff',fontWeight:'900',fontSize:15},
  resultCard:{marginTop:14,backgroundColor:COLORS.surface,borderRadius:24,padding:17,borderWidth:1,borderColor:COLORS.border},sectionRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},sectionTitle:{color:'#fff',fontWeight:'900',fontSize:15},badge:{color:COLORS.primary2,backgroundColor:'#101D32',fontSize:10,fontWeight:'800',paddingHorizontal:9,paddingVertical:5,borderRadius:10},resultText:{color:'#E9EDFA',fontSize:15,lineHeight:25,textAlign:'right',marginTop:12},
  confirmBox:{marginTop:14,backgroundColor:'#1A203A',borderRadius:16,padding:13},confirmText:{color:'#fff',textAlign:'right',lineHeight:22,fontWeight:'700'},buttonRow:{flexDirection:'row',gap:10,marginTop:12},confirmButton:{flex:1,backgroundColor:COLORS.success,borderRadius:13,paddingVertical:12,alignItems:'center'},confirmButtonText:{color:'#04140E',fontWeight:'900'},cancelButton:{paddingHorizontal:19,borderRadius:13,backgroundColor:'#272E48',justifyContent:'center'},cancelText:{color:'#D7DDF2',fontWeight:'800'},
  sectionHeader:{color:'#fff',fontSize:16,fontWeight:'900',textAlign:'right',marginTop:22,marginBottom:11},quickGrid:{flexDirection:'row',flexWrap:'wrap',gap:10},quickCard:{width:'48.5%',backgroundColor:COLORS.surface,borderRadius:20,padding:17,borderWidth:1,borderColor:COLORS.border},quickIcon:{color:COLORS.primary2,fontSize:25,fontWeight:'900'},quickLabel:{color:'#fff',fontSize:14,fontWeight:'800',textAlign:'right',marginTop:17},
  screenTitle:{color:'#fff',fontSize:26,fontWeight:'900',textAlign:'right',marginBottom:16},centerCard:{backgroundColor:COLORS.surface,borderRadius:28,padding:18,alignItems:'center',borderWidth:1,borderColor:COLORS.border},inputCard:{backgroundColor:COLORS.surface,borderRadius:24,padding:15,marginTop:14,borderWidth:1,borderColor:COLORS.border},input:{minHeight:64,backgroundColor:'#090D20',borderRadius:16,borderWidth:1,borderColor:'#232C4D',color:'#fff',fontSize:15,padding:13,textAlignVertical:'top'},primaryButton:{flex:1,backgroundColor:COLORS.primary,borderRadius:14,paddingVertical:13,alignItems:'center',marginTop:12},primaryText:{color:'#fff',fontWeight:'900'},secondaryButton:{paddingHorizontal:18,backgroundColor:'#202844',borderRadius:14,paddingVertical:13,alignItems:'center',marginTop:12},secondaryText:{color:'#DDE4FA',fontWeight:'800'},
  settingRow:{marginTop:12,backgroundColor:COLORS.surface,borderRadius:18,padding:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,borderWidth:1,borderColor:COLORS.border},settingTitle:{color:'#fff',fontWeight:'800',textAlign:'right'},settingHint:{color:COLORS.muted,fontSize:11,marginTop:3,textAlign:'right'},
  emptyCard:{backgroundColor:COLORS.surface,borderRadius:20,padding:24,alignItems:'center'},emptyText:{color:COLORS.muted},historyCard:{borderRadius:18,padding:14,marginBottom:9,borderWidth:1},userHistory:{backgroundColor:'#181B3D',borderColor:'#343970'},assistantHistory:{backgroundColor:COLORS.surface,borderColor:COLORS.border},historyRole:{color:COLORS.primary2,fontSize:11,fontWeight:'900',textAlign:'right'},historyText:{color:'#EFF2FC',lineHeight:23,textAlign:'right',marginTop:6},historyTime:{color:'#596382',fontSize:9,marginTop:8},
  healthHero:{backgroundColor:COLORS.surface,borderRadius:24,padding:18,flexDirection:'row',alignItems:'center',gap:14,borderWidth:1,borderColor:COLORS.border},healthHeroIcon:{fontSize:34,color:COLORS.success},healthHeroTitle:{color:'#fff',fontWeight:'900',fontSize:16,textAlign:'right'},healthHeroHint:{color:COLORS.muted,fontSize:11,marginTop:4,textAlign:'right'},healthCard:{backgroundColor:COLORS.surface,borderRadius:20,padding:15,marginTop:14},healthRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:11,borderBottomWidth:1,borderBottomColor:COLORS.border},healthName:{color:'#D9DFF2',fontWeight:'700'},healthStatus:{fontSize:10,fontWeight:'900'},
  settingsCard:{backgroundColor:COLORS.surface,borderRadius:24,padding:16,borderWidth:1,borderColor:COLORS.border},fieldLabel:{color:'#AEB8D8',fontSize:11,fontWeight:'800',textAlign:'right',marginBottom:6,marginTop:12},infoCard:{backgroundColor:'#0D1930',borderRadius:20,padding:16,marginTop:14,borderWidth:1,borderColor:'#18335A'},infoTitle:{color:COLORS.primary2,fontWeight:'900',textAlign:'right'},infoText:{color:'#B9C5DE',lineHeight:22,fontSize:12,textAlign:'right',marginTop:7},
  nav:{position:'absolute',left:12,right:12,bottom:14,height:72,backgroundColor:'rgba(14,19,40,.96)',borderRadius:24,borderWidth:1,borderColor:COLORS.border,flexDirection:'row',alignItems:'center',justifyContent:'space-around',paddingHorizontal:6,...SHADOW},navItem:{alignItems:'center',justifyContent:'center',minWidth:52},navIcon:{color:'#697395',fontSize:20,fontWeight:'900'},navLabel:{color:'#697395',fontSize:9,fontWeight:'700',marginTop:4},navActive:{color:COLORS.primary2},
});
