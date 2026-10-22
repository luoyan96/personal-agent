import { useEffect, useRef, useState, useSyncExternalStore, memo } from 'react';
import { ActivityIndicator, Alert, AppState, BackHandler, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AccountUsername, AccountPassword, type AgentTurn, type ChatMessage } from '@research-agent-platform/contracts';
import { api, uuid } from './platform';
import type { Actor } from './api';
import { ChatController, canRetry, turnLabels } from './chat';

const colors = { bg: '#F5F5EF', paper: '#FFFFFF', ink: '#263B35', muted: '#65756F', green: '#316953', pale: '#E6EEE5', line: '#DFE5DD', red: '#A03C31' };
const errorText = (e: unknown) => e instanceof Error ? e.message : '请求未完成，请稍后重试。';

function Button({ title, onPress, disabled = false, secondary = false }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} onPress={onPress} disabled={disabled}
    style={({ pressed }) => [s.button, secondary && s.secondaryButton, disabled && s.disabled, pressed && s.pressed]}>
    <Text style={[s.buttonText, secondary && s.secondaryText]}>{title}</Text>
  </Pressable>;
}
function Notice({ text }: { text: string }) { return <Text accessibilityRole="alert" style={s.error}>{text}</Text>; }

export default function App() {
  const [actor, setActor] = useState<Actor>();
  const [phase, setPhase] = useState<'restoring' | 'login' | 'ready'>('restoring');
  const [restoreError, setRestoreError] = useState('');
  const [notice, setNotice] = useState('');
  const attempt = useRef(0);
  const restore = async () => {
    const current = ++attempt.current;
    setPhase('restoring'); setRestoreError('');
    try {
      const restored = await api.restore();
      if (current !== attempt.current) return;
      setActor(restored ?? undefined); setPhase(restored ? 'ready' : 'login');
    } catch (error) { if (current === attempt.current) setRestoreError(errorText(error)); }
  };
  useEffect(() => {
    api.onExpired = () => { attempt.current++; setActor(undefined); setNotice('登录已过期，请重新登录。'); setPhase('login'); };
    void restore();
    return () => { attempt.current++; api.onExpired = () => {}; };
  }, []);
  const logout = () => {
    const current = ++attempt.current; setActor(undefined); setPhase('login'); setNotice('正在退出…');
    void api.logout().then(revoked => { if (current === attempt.current) setNotice(revoked ? '已退出登录。' : '本机会话已清除；未确认服务端注销，旧会话将按服务端有效期失效。'); })
      .catch(() => { if (current === attempt.current) setNotice('本次无法清除设备保存的会话。请重新登录后再退出，或清除本 App 数据。'); });
  };
  return <SafeAreaProvider><StatusBar style="dark" /><SafeAreaView style={s.safe}>
    {phase === 'restoring' ? <View style={s.center}>
      <Text style={s.wordmark}>AcceptCat</Text>
      {restoreError ? <><Notice text={restoreError} /><Button title="重新连接" onPress={() => void restore()} /><Button title="使用账号登录" secondary onPress={() => { attempt.current++; setPhase('login'); }} /></>
        : <><ActivityIndicator color={colors.green} /><Text style={s.subtle}>正在核对登录状态</Text></>}
    </View> : phase === 'ready' && actor ? <SignedIn key={actor.member.id} actor={actor} logout={logout} />
      : <Login notice={notice} onLogin={value => { attempt.current++; setNotice(''); setActor(value); setPhase('ready'); }} />}
  </SafeAreaView></SafeAreaProvider>;
}

function Login({ notice, onLogin }: { notice: string; onLogin: (actor: Actor) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  const passwordRef = useRef<TextInput>(null);
  useEffect(() => () => { mounted.current = false; }, []);
  const login = async () => {
    if (pending.current) return;
    if (!AccountUsername.safeParse(username).success || !AccountPassword.safeParse(password).success) { setError('请填写 AcceptCat 账号和至少 8 位的密码。'); return; }
    pending.current = true; setBusy(true); setError('');
    try { const actor = await api.login(username, password); if (mounted.current) { setPassword(''); onLogin(actor); } }
    catch (e) { if (mounted.current) setError(errorText(e)); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  return <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={s.login} keyboardShouldPersistTaps="handled">
      <View style={s.brand}><Text style={s.brandText}>A</Text></View>
      <Text style={s.wordmark}>AcceptCat</Text>
      <Text style={s.loginTitle}>随时接着聊</Text>
      <Text style={s.subtitle}>用已有账号登录，继续与个人助手对话。</Text>
      <View style={s.loginForm}>
        <Text style={s.label}>账号</Text>
        <TextInput accessibilityLabel="AcceptCat 账号" style={s.input} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false}
          autoComplete="username" textContentType="username" editable={!busy} returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} />
        <Text style={s.label}>密码</Text>
        <TextInput ref={passwordRef} accessibilityLabel="密码" style={s.input} value={password} onChangeText={setPassword} secureTextEntry
          autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password" editable={!busy} returnKeyType="go" onSubmitEditing={() => void login()} />
        {error || notice ? <Notice text={error || notice} /> : null}
        <Button title={busy ? '正在登录…' : '登录'} disabled={busy} onPress={() => void login()} />
      </View>
      <Text style={s.footnote}>安卓试用版 0.1.0 · 注册和模型设置请使用桌面端</Text>
    </ScrollView>
  </KeyboardAvoidingView>;
}

function SignedIn({ actor, logout }: { actor: Actor; logout: () => void }) {
  const [tab, setTab] = useState<'chat' | 'account'>('chat');
  const [draft, setDraft] = useState('');
  const [controller] = useState(() => new ChatController(api, uuid));
  useEffect(() => { void controller.open(); return () => controller.dispose(); }, [controller]);
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => { if (tab === 'account') { setTab('chat'); return true; } return false; });
    return () => back.remove();
  }, [tab]);
  return <View style={s.flex}>
    <View style={s.topbar}><View><Text style={s.topTitle}>{tab === 'chat' ? '个人助手' : '我的'}</Text><Text style={s.eyebrow}>AcceptCat · 手机试用版</Text></View>
      <View style={s.avatar}><Text style={s.avatarText}>{actor.member.displayName.slice(-2)}</Text></View></View>
    {tab === 'chat' ? <Chat controller={controller} draft={draft} setDraft={setDraft} /> : <View style={s.account}>
      <Text style={s.accountName}>{actor.member.displayName}</Text><Text style={s.subtle}>与桌面端共用账号和个人助手</Text>
      <View style={s.accountCard}><Text style={s.label}>当前服务</Text><Text selectable style={s.body}>{api.origin}</Text>
        <Text style={s.label}>登录有效期（北京时间）</Text><Text style={s.body}>{new Date(actor.expiresAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</Text></View>
      <Text style={s.subtle}>当前版本支持文字对话。任务、资料、附件、推送与课题组协作将在后续批次接入。</Text>
      <Button title="退出登录" secondary onPress={() => Alert.alert('退出 AcceptCat', '退出后将清除本机登录会话。', [{ text: '取消', style: 'cancel' }, { text: '退出', style: 'destructive', onPress: logout }])} />
    </View>}
    <View accessibilityRole="tablist" style={s.tabs}>{([{ id: 'chat', label: '对话' }, { id: 'account', label: '我的' }] as const).map(item =>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === item.id }} key={item.id} onPress={() => setTab(item.id)} style={s.tab}>
        <View style={[s.tabMark, tab === item.id && s.tabMarkActive]} /><Text style={[s.tabText, tab === item.id && s.tabActive]}>{item.label}</Text>
      </Pressable>)}</View>
  </View>;
}

const Bubble = memo(function Bubble({ item }: { item: ChatMessage }) {
  const human = item.origin === 'human';
  return <View style={[s.messageRow, human && s.humanRow]}><View style={[s.bubble, human && s.humanBubble]}>
    {!human ? <Text style={s.messageAuthor}>{item.origin === 'model' ? '个人助手' : '服务提示'}</Text> : null}
    <Text selectable style={s.messageText}>{item.text ?? (item.files?.length ? '此消息包含附件，请在桌面端查看。' : '请在桌面端查看此消息内容。')}</Text>
    {item.actionIds.length ? <Text style={s.messageNote}>此回复包含待确认事项，请在桌面端查看和处理。</Text> : null}
    <Text style={s.time}>{new Date(item.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}{human ? ' · 已发送' : ''}</Text>
  </View></View>;
});

function Chat({ controller, draft, setDraft }: { controller: ChatController; draft: string; setDraft: (value: string) => void }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const list = useRef<FlatList<ChatMessage>>(null);
  const follow = useRef(true);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let active = AppState.currentState === 'active', disposed = false, polling = false;
    const schedule = () => { clearTimeout(timer); if (!disposed && active) timer = setTimeout(() => void tick(), 2500); };
    const tick = async () => { if (disposed || !active || polling) return; polling = true; await controller.refresh(); polling = false; schedule(); };
    schedule();
    const subscription = AppState.addEventListener('change', value => {
      active = value === 'active'; clearTimeout(timer);
      if (active) void tick();
    });
    return () => { disposed = true; clearTimeout(timer); subscription.remove(); };
  }, [controller]);
  const turns = Object.values(state.turns).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const lastTurn = turns.at(-1);
  const retry = (turn: AgentTurn) => Alert.alert('重新请求回复', `将沿用后台剩余预算（最多 ${turn.remainingBudget?.maxTokens} tokens / ${turn.remainingBudget?.maxSeconds} 秒）。先前调用可能已有用量。`,
    [{ text: '取消', style: 'cancel' }, { text: '确认重试', onPress: () => void controller.retryTurn(turn) }]);
  const send = () => { if (!draft.trim() || state.intent) return; follow.current = true; void controller.send(draft); setDraft(''); };
  if (state.loading) return <View style={s.center}><ActivityIndicator color={colors.green} /><Text style={s.subtle}>正在打开你的助手</Text></View>;
  if (!state.conversation) return <View style={s.center}><Notice text={state.error ?? '未能打开个人助手。'} /><Button title="重新打开" onPress={() => void controller.open()} /></View>;
  return <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <FlatList ref={list} data={state.messages} keyExtractor={m => m.id} renderItem={({ item }) => <Bubble item={item} />} contentContainerStyle={s.messages}
      keyboardShouldPersistTaps="handled" refreshing={state.refreshing} onRefresh={() => void controller.refresh()}
      onScroll={event => { const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent; follow.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 100; }} scrollEventThrottle={100}
      onContentSizeChange={() => { if (follow.current) list.current?.scrollToEnd({ animated: false }); }}
      ListHeaderComponent={state.messages[0] && state.messages[0].sequence > 1 ? <Button title="查看更早的消息" secondary disabled={state.refreshing} onPress={() => { follow.current = false; void controller.refresh(false, true); }} /> : null}
      ListEmptyComponent={<View style={s.empty}><View style={s.brand}><Text style={s.brandText}>A</Text></View><Text style={s.emptyTitle}>从一个想法开始</Text><Text style={s.subtitle}>随手记下问题，或继续桌面端的对话。</Text></View>} />
    {state.error ? <View style={s.statusCard}><Notice text={state.error} /><Button title="刷新状态" secondary disabled={state.refreshing} onPress={() => void controller.refresh()} /></View> : null}
    {lastTurn ? <View style={s.statusCard} accessibilityLiveRegion="polite"><Text style={s.statusText}>{turnLabels[lastTurn.status]}</Text>
      {lastTurn.failure ? <Text style={s.messageNote}>{lastTurn.failure === 'BUDGET_EXCEEDED' ? '本轮已超出预算，请缩短需求后重新发送。' : '可在桌面端查看完整原因和设置。'}</Text> : null}
      {canRetry(lastTurn) && !state.retryIntent ? <Button title="重试回复" secondary disabled={!!state.intent} onPress={() => retry(lastTurn)} /> : null}
    </View> : null}
    {state.retryIntent ? <View style={s.statusCard}><Text style={s.statusText}>{state.retryIntent.sending ? '正在提交重试…' : '重试结果尚未确认'}</Text>
      {state.retryIntent.error ? <><Notice text={state.retryIntent.error} /><Button title="核对并重试原请求" secondary onPress={() => void controller.retryTurn(state.retryIntent!.turn)} /></> : null}</View> : null}
    {state.intent ? <View style={s.pending}><Text numberOfLines={3} style={s.body}>{state.intent.text}</Text><Text accessibilityLiveRegion="polite" style={s.subtle}>{state.intent.sending ? '正在发送…' : '发送结果尚未确认'}</Text>
      {state.intent.error ? <><Notice text={state.intent.error} /><Button title="重试发送" secondary onPress={() => void controller.send()} /></> : null}</View> : null}
    <View style={s.composer}><TextInput accessibilityLabel="给个人助手发消息" placeholder="和助手说点什么…" placeholderTextColor={colors.muted} value={draft} onChangeText={setDraft}
      style={s.composerInput} multiline maxLength={8000} editable={!state.intent && !state.retryIntent} />
      <Pressable accessibilityRole="button" accessibilityLabel="发送消息" accessibilityState={{ disabled: !draft.trim() || !!state.intent || !!state.retryIntent }}
        disabled={!draft.trim() || !!state.intent || !!state.retryIntent} onPress={send} style={[s.send, (!draft.trim() || !!state.intent || !!state.retryIntent) && s.disabled]}><Text style={s.buttonText}>发送</Text></Pressable></View>
  </KeyboardAvoidingView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg }, flex: { flex: 1 },
  center: { flex: 1, padding: 28, justifyContent: 'center', alignItems: 'center', gap: 18 },
  brand: { width: 56, height: 56, backgroundColor: colors.green, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  brandText: { color: '#FFF', fontSize: 32, fontWeight: '600' }, wordmark: { color: colors.ink, fontSize: 24, fontWeight: '700', letterSpacing: -0.6 },
  login: { flexGrow: 1, justifyContent: 'center', padding: 28 }, loginTitle: { fontSize: 30, color: colors.ink, fontWeight: '600', marginTop: 32, marginBottom: 10 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 24 }, loginForm: { marginTop: 28, gap: 12 }, label: { fontSize: 13, color: colors.muted, marginTop: 8 },
  input: { color: colors.ink, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 16, minHeight: 52, fontSize: 17 },
  button: { backgroundColor: colors.green, borderRadius: 12, padding: 14, minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonText: { color: '#FFF', fontWeight: '600', fontSize: 16 }, secondaryButton: { backgroundColor: colors.pale }, secondaryText: { color: colors.green }, disabled: { opacity: 0.4 }, pressed: { opacity: 0.75 },
  error: { color: colors.red, fontSize: 14, lineHeight: 21, marginVertical: 4 }, footnote: { marginTop: 28, color: colors.muted, fontSize: 12, lineHeight: 20 },
  topbar: { paddingHorizontal: 22, paddingVertical: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: 1 },
  topTitle: { color: colors.ink, fontSize: 23, fontWeight: '600' }, eyebrow: { color: colors.muted, fontSize: 12, marginTop: 5 },
  avatar: { backgroundColor: colors.pale, width: 42, height: 42, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: colors.green, fontWeight: '600' },
  account: { flex: 1, padding: 24, gap: 20 }, accountName: { color: colors.ink, fontSize: 27, fontWeight: '600', marginTop: 16 },
  accountCard: { backgroundColor: colors.paper, padding: 20, borderRadius: 16, gap: 12 }, body: { color: colors.ink, fontSize: 15, lineHeight: 23 }, subtle: { color: colors.muted, fontSize: 13, lineHeight: 21 },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.bg }, tab: { flex: 1, minHeight: 62, alignItems: 'center', justifyContent: 'center', gap: 6 },
  tabMark: { width: 18, height: 4, borderRadius: 2, backgroundColor: 'transparent' }, tabMarkActive: { backgroundColor: colors.green }, tabText: { color: colors.muted, fontSize: 14 }, tabActive: { color: colors.green, fontWeight: '700' },
  messages: { padding: 18, flexGrow: 1, gap: 14 }, messageRow: { alignItems: 'flex-start' }, humanRow: { alignItems: 'flex-end' },
  bubble: { backgroundColor: colors.paper, maxWidth: '92%', borderRadius: 16, borderTopLeftRadius: 4, padding: 16 }, humanBubble: { backgroundColor: colors.pale, borderTopLeftRadius: 16, borderTopRightRadius: 4 },
  messageAuthor: { color: colors.green, fontSize: 12, fontWeight: '600', marginBottom: 8 }, messageText: { color: colors.ink, fontSize: 16, lineHeight: 26 },
  messageNote: { color: colors.muted, fontSize: 12, lineHeight: 20, marginTop: 5 }, time: { color: colors.muted, fontSize: 10, marginTop: 9 },
  empty: { flex: 1, minHeight: 240, alignItems: 'center', justifyContent: 'center' }, emptyTitle: { color: colors.ink, fontSize: 22, fontWeight: '500', marginBottom: 12 },
  statusCard: { paddingHorizontal: 20, paddingVertical: 8, borderTopWidth: 1, borderColor: colors.line }, statusText: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  pending: { marginHorizontal: 16, padding: 12, borderRadius: 12, backgroundColor: colors.pale, maxHeight: 210 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, gap: 10 }, composerInput: { flex: 1, color: colors.ink, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 16, minHeight: 48, maxHeight: 140, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  send: { minHeight: 48, minWidth: 64, borderRadius: 15, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
});
