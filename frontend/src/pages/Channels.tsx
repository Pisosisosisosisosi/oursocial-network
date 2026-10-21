import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Bell, Check, Copy, Hash, LockKeyhole, Pin, Plus, Radio, Send, Settings, Share2, Trash2, Users, X } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { getSocket } from '../api/socket';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/useToast';
import WorkspaceSidebarHeader from '../components/layout/WorkspaceSidebarHeader';
import WorkspaceTabs from '../components/layout/WorkspaceTabs';
import UnifiedWorkspaceList from '../components/layout/UnifiedWorkspaceList';
import { formatAppDateTime } from '../time';

interface Channel {
  id: string;
  title: string;
  description: string;
  visibility: 'public' | 'private';
  avatarUrl: string;
  ownerId: string;
  ownerUsername: string;
  ownerName: string;
  memberCount: number;
  isSubscribed: boolean;
  isOwner: boolean;
  createdAt: string;
  updatedAt?: string;
  lastMessageAt?: string | null;
}

interface ChannelPost {
  id: string;
  channelId: string;
  senderId: string;
  text: string;
  reactions: { userId: string; emoji: string }[];
  pinned: boolean;
  pinnedAt: string | null;
  createdAt: string;
}

interface InvitePreview {
  id: string;
  title: string;
  description: string;
  avatarUrl: string;
  memberCount: number;
  ownerName: string;
}

const REACTIONS = ['❤️', '👍', '😂'];

function formatDate(value: string) { return formatAppDateTime(value); }

export default function Channels({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate();
  const { inviteCode } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const showToast = useToast();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(searchParams.get('channel'));
  const [posts, setPosts] = useState<ChannelPost[]>([]);
  const [loadedPostChannelId, setLoadedPostChannelId] = useState<string | null>(null);
  const [invitePreviewState, setInvitePreviewState] = useState<{ code: string; preview: InvitePreview } | null>(null);
  const [search, setSearch] = useState('');
  const [listMode, setListMode] = useState<'mine' | 'discover'>('mine');
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState('');

  useEffect(() => { if (searchParams.get('create') === '1') { setVisibility('public'); setCreating(true); setSearchParams((current) => { const next = new URLSearchParams(current); next.delete('create'); return next; }, { replace: true }); } if (searchParams.get('discover') === '1') setListMode('discover'); }, [searchParams, setSearchParams]);

  const activeChannel = channels.find((channel) => channel.id === activeChannelId) || null;
  const activePosts = loadedPostChannelId === activeChannel?.id ? posts : [];
  const invitePreview = inviteCode && invitePreviewState?.code === inviteCode
    ? invitePreviewState.preview
    : null;

  const loadChannels = useCallback(async () => {
    const response = await api.get<Channel[]>('/channels');
    const sorted = [...response.data].sort((a, b) => {
      const aTime = Date.parse(a.lastMessageAt || a.updatedAt || a.createdAt) || 0;
      const bTime = Date.parse(b.lastMessageAt || b.updatedAt || b.createdAt) || 0;
      return bTime - aTime;
    });
    setChannels(sorted);
    return sorted;
  }, []);

  const initializeChannels = useCallback(async () => {
    try {
      const items = await loadChannels();
      const requested = searchParams.get('channel');
      const discovering = searchParams.get('discover') === '1';
      const initial = requested && items.some((channel) => channel.id === requested)
        ? requested
        : (embedded || discovering) ? null : items.find((channel) => channel.isSubscribed)?.id || items[0]?.id || null;
      setActiveChannelId(initial);
      if (initial && !requested && !discovering) setSearchParams({ channel: initial }, { replace: true });
    } catch (error) {
      console.error('Не удалось загрузить каналы:', error);
      showToast('Не удалось загрузить каналы.', 'error');
    }
  }, [loadChannels, searchParams, setSearchParams, showToast]);

  const loadInvitePreview = useCallback(async (code: string, signal: AbortSignal) => {
    try {
      const response = await api.get<InvitePreview>(`/channels/invites/${code}`, { signal });
      setInvitePreviewState({ code, preview: response.data });
    } catch (error) {
      if (signal.aborted) return;
      console.error('Не удалось открыть приглашение в канал:', error);
      showToast('Ссылка-приглашение недействительна или устарела.', 'error');
    }
  }, [showToast]);

  const loadPosts = useCallback(async (channelId: string) => {
    setLoadingPosts(true);
    try {
      const response = await api.get<ChannelPost[]>(`/channels/${channelId}/posts`, { params: { limit: 50 } });
      setPosts(response.data);
      setLoadedPostChannelId(channelId);
    } finally {
      setLoadingPosts(false);
    }
  }, []);

  useEffect(() => {
    if (inviteCode) {
      return;
    }
    void initializeChannels();
  }, [inviteCode, initializeChannels]);

  useEffect(() => {
    if (!inviteCode) return;
    const controller = new AbortController();
    void loadInvitePreview(inviteCode, controller.signal);
    return () => controller.abort();
  }, [inviteCode, loadInvitePreview]);

  useEffect(() => {
    const requested = searchParams.get('channel');
    if (requested && channels.some((channel) => channel.id === requested) && requested !== activeChannelId) {
      setActiveChannelId(requested);
      setInviteLink('');
    } else if (!requested && embedded && activeChannelId) {
      setActiveChannelId(null);
      setPosts([]);
      setLoadedPostChannelId(null);
    }
  }, [searchParams, channels, activeChannelId, embedded]);

  useEffect(() => {
    if (!activeChannelId || inviteCode) return;
    void loadPosts(activeChannelId).catch((error: unknown) => {
      console.error('Не удалось загрузить публикации канала:', error);
      showToast('Не удалось загрузить публикации канала.', 'error');
    });
  }, [activeChannelId, inviteCode, loadPosts, showToast]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handleChannelChanged = (event: { channelId?: string; action?: string; post?: ChannelPost; postId?: string }) => {
      if (event.action === 'deleted' && event.channelId === activeChannelId) {
        setActiveChannelId(null);
        setPosts([]);
      }
      if (event.channelId === activeChannelId) {
        if (event.action === 'post_deleted' && event.postId) {
          setPosts((current) => current.filter((post) => post.id !== event.postId));
        } else if (event.post && ['post_created', 'post_updated'].includes(event.action || '')) {
          setPosts((current) => {
            const exists = current.some((post) => post.id === event.post?.id);
            const updated = exists
              ? current.map((post) => post.id === event.post?.id ? event.post! : post)
              : [event.post!, ...current];
            return updated.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
          });
        }
      }
      void loadChannels().catch((error: unknown) => {
        console.error('Не удалось обновить список каналов:', error);
      });
    };
    socket.on('channel_changed', handleChannelChanged);
    return () => {
      socket.off('channel_changed', handleChannelChanged);
    };
  }, [activeChannelId, loadChannels]);

  const selectChannel = (channelId: string) => {
    setActiveChannelId(channelId);
    setSearchParams({ channel: channelId });
    setInviteLink('');
  };

  const createChannel = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await api.post<Channel & { inviteCode?: string }>('/channels', {
        title,
        description,
        visibility,
      });
      const refreshed = await loadChannels();
      const created = refreshed.find((channel) => channel.id === response.data.id);
      if (created) selectChannel(created.id);
      setCreating(false);
      setTitle('');
      setDescription('');
      setVisibility('public');
      showToast('Канал создан.', 'success');
      if (response.data.inviteCode) {
        setInviteLink(`${window.location.origin}${window.location.pathname}#/join/${response.data.inviteCode}`);
      }
    } catch (error) {
      console.error('Не удалось создать канал:', error);
      showToast('Не удалось создать канал.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveChannelSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeChannel) return;
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const values: { title: string; description: string; visibility: 'public' | 'private'; avatarUrl?: string } = {
      title: String(form.get('title') || ''),
      description: String(form.get('description') || ''),
      visibility: form.get('visibility') === 'private' ? 'private' : 'public',
    };
    const avatarFile = form.get('avatar');
    try {
      if (avatarFile instanceof File && avatarFile.size > 0) {
        if (!avatarFile.type.startsWith('image/') || avatarFile.size > 1_000_000) {
          showToast('Выберите изображение размером до 1 МБ.', 'error');
          return;
        }
        values.avatarUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Не удалось прочитать файл'));
          reader.onerror = () => reject(reader.error || new Error('Не удалось прочитать файл'));
          reader.readAsDataURL(avatarFile);
        });
      }
      await api.patch(`/channels/${activeChannel.id}`, values);
      await loadChannels();
      setEditing(false);
      showToast('Настройки канала сохранены.', 'success');
    } catch (error) {
      console.error('Не удалось сохранить настройки канала:', error);
      showToast('Не удалось сохранить настройки канала.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const deleteChannel = async () => {
    if (!activeChannel || !window.confirm(`Удалить канал «${activeChannel.title}» и все его публикации?`)) return;
    setBusy(true);
    try {
      await api.delete(`/channels/${activeChannel.id}`);
      setChannels((current) => current.filter((channel) => channel.id !== activeChannel.id));
      setActiveChannelId(null);
      setPosts([]);
      setSearchParams({});
      setEditing(false);
      showToast('Канал удалён.', 'success');
    } catch (error) {
      console.error('Не удалось удалить канал:', error);
      showToast('Не удалось удалить канал.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const subscribe = async (channel: Channel) => {
    setBusy(true);
    try {
      await api.post(`/channels/${channel.id}/subscription`);
      await loadChannels();
      showToast('Вы подписались на канал.', 'success');
    } catch (error) {
      console.error('Не удалось подписаться на канал:', error);
      showToast('Не удалось подписаться на канал.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const unsubscribe = async (channel: Channel) => {
    if (!window.confirm(`Отписаться от канала «${channel.title}»?`)) return;
    setBusy(true);
    try {
      await api.delete(`/channels/${channel.id}/subscription`);
      await loadChannels();
      showToast('Вы отписались от канала.', 'success');
    } catch (error) {
      console.error('Не удалось отписаться от канала:', error);
      showToast('Не удалось отписаться от канала.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const publishPost = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeChannel || !draft.trim()) return;
    setBusy(true);
    try {
      const response = await api.post<ChannelPost>(`/channels/${activeChannel.id}/posts`, { text: draft });
      setPosts((current) => current.some((post) => post.id === response.data.id) ? current : [response.data, ...current]);
      setDraft('');
    } catch (error) {
      console.error('Не удалось опубликовать сообщение:', error);
      showToast('Не удалось опубликовать сообщение.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleReaction = async (post: ChannelPost, emoji: string) => {
    if (!activeChannel) return;
    try {
      const response = await api.post<ChannelPost>(`/channels/${activeChannel.id}/posts/${post.id}/reactions`, { emoji });
      setPosts((current) => current.map((item) => item.id === post.id ? response.data : item));
    } catch (error) {
      console.error('Не удалось сохранить реакцию:', error);
      showToast('Не удалось сохранить реакцию.', 'error');
    }
  };

  const togglePin = async (post: ChannelPost) => {
    if (!activeChannel) return;
    try {
      const response = await api.post<ChannelPost>(`/channels/${activeChannel.id}/posts/${post.id}/pin`);
      setPosts((current) => current.map((item) => item.id === post.id ? response.data : item)
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt)));
    } catch (error) {
      console.error('Не удалось закрепить публикацию:', error);
      showToast('Не удалось изменить закрепление.', 'error');
    }
  };

  const deletePost = async (post: ChannelPost) => {
    if (!activeChannel || !window.confirm('Удалить эту публикацию?')) return;
    try {
      await api.delete(`/channels/${activeChannel.id}/posts/${post.id}`);
      setPosts((current) => current.filter((item) => item.id !== post.id));
    } catch (error) {
      console.error('Не удалось удалить публикацию:', error);
      showToast('Не удалось удалить публикацию.', 'error');
    }
  };

  const copyInvite = async () => {
    if (!activeChannel) return;
    try {
      const response = await api.get<{ inviteCode: string }>(`/channels/${activeChannel.id}/invite`);
      const url = `${window.location.origin}${window.location.pathname}#/join/${response.data.inviteCode}`;
      await navigator.clipboard.writeText(url);
      setInviteLink(url);
      showToast('Ссылка-приглашение скопирована.', 'success');
    } catch (error) {
      console.error('Не удалось получить ссылку канала:', error);
      showToast('Не удалось получить ссылку-приглашение.', 'error');
    }
  };

  const joinFromInvite = async () => {
    if (!inviteCode) return;
    if (!user) {
      sessionStorage.setItem('skylineAfterLogin', `/join/${inviteCode}`);
      navigate('/login');
      return;
    }
    setBusy(true);
    try {
      const response = await api.post<Channel>(`/channels/invites/${inviteCode}/join`);
      await loadChannels();
      navigate(`/channels?channel=${response.data.id}`, { replace: true });
      showToast('Вы присоединились к каналу.', 'success');
    } catch (error) {
      console.error('Не удалось присоединиться к каналу:', error);
      showToast('Не удалось присоединиться к каналу.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const invitePage = Boolean(inviteCode);
  if (invitePage) {
    return (
      <main className="grid h-full place-items-center bg-bg-base p-5 text-t-primary">
        <section className="w-full max-w-md rounded-3xl border border-white/10 bg-[#111a2a] p-7 text-center shadow-2xl">
          <div className="mx-auto mb-5 grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-accent/15 text-accent">
            {invitePreview?.avatarUrl ? <img src={invitePreview.avatarUrl} alt="" className="h-full w-full object-cover" /> : <Radio size={30} />}
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Приглашение в канал</p>
          <h1 className="mt-2 text-2xl font-bold">{invitePreview?.title || 'Загрузка приглашения…'}</h1>
          {invitePreview && <>
            <p className="mt-3 text-sm leading-6 text-t-secondary">{invitePreview.description || 'Подпишитесь, чтобы следить за новыми публикациями.'}</p>
            <p className="mt-4 text-xs text-slate-500">{invitePreview.memberCount} подписчиков · автор {invitePreview.ownerName || 'Skyline'}</p>
            <button type="button" disabled={busy} onClick={() => void joinFromInvite()} className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent disabled:opacity-50">
              <Bell size={16} /> Подписаться на канал
            </button>
          </>}
          <button type="button" onClick={() => navigate('/channels')} className="mt-3 w-full rounded-xl px-4 py-2 text-sm text-t-secondary hover:bg-white/5">К списку каналов</button>
        </section>
      </main>
    );
  }

  return (
    <main className="animate-fade-in flex h-full min-h-0 w-full bg-bg-base text-t-primary">
      <aside className={`${embedded ? 'hidden' : activeChannel ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-r border-white/[0.08] bg-panel md:w-[340px]`}>
        <WorkspaceSidebarHeader
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Поиск переписок"
        />
        <div className="border-b border-white/[0.06] px-3 py-2"><WorkspaceTabs /></div>
        <header className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-4">
          <button type="button" onClick={() => navigate('/')} aria-label="Назад к чатам" className="rounded-xl p-2 text-t-secondary transition hover:bg-white/[0.06] hover:text-white"><ArrowLeft size={18} /></button>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-sm font-semibold"><Radio size={17} className="text-accent" /> Каналы</h1>
            <p className="mt-0.5 text-[11px] text-slate-500">Публикации и сообщества</p>
          </div>
          <button type="button" onClick={() => { setVisibility('public'); setCreating(true); }} title="Создать канал" aria-label="Создать канал" className="rounded-xl p-2 text-accent transition hover:bg-accent/10"><Plus size={19} /></button>
        </header>
        <div className="border-b border-white/[0.08] p-3">
          <div className="grid grid-cols-2 rounded-xl bg-slate-950/50 p-1">
            <button type="button" onClick={() => setListMode('mine')} className={`rounded-lg px-3 py-2 text-xs font-medium transition ${listMode === 'mine' ? 'bg-accent/20 text-accent' : 'text-slate-500 hover:text-slate-300'}`}>Мои каналы</button>
            <button type="button" onClick={() => setListMode('discover')} className={`rounded-lg px-3 py-2 text-xs font-medium transition ${listMode === 'discover' ? 'bg-accent/20 text-accent' : 'text-slate-500 hover:text-slate-300'}`}>Найти каналы</button>
          </div>
        </div>
        <UnifiedWorkspaceList search={search} activeKind="channel" activeId={activeChannelId} includeDiscover={listMode === 'discover'} />
        <footer className="border-t border-white/[0.08] px-4 py-3 text-center text-[10px] text-slate-600">Публичные каналы доступны всем участникам Skyline</footer>
      </aside>

      <section className={`${embedded || activeChannel ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-accent/20 via-[#090d16] to-[#090d16]`}>
        {!activeChannel ? (
          <div className="m-auto max-w-sm px-6 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-accent/10 text-accent"><Radio size={29} /></div>
            <h2 className="mt-5 text-lg font-semibold">Ваши каналы Skyline</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Создавайте сообщества, делитесь публикациями и собирайте подписчиков.</p>
            <button type="button" onClick={() => { setVisibility('public'); setCreating(true); }} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent"><Plus size={16} /> Создать канал</button>
          </div>
        ) : <>
          <header className="flex items-center gap-3 border-b border-white/[0.08] bg-panel/80 px-4 py-3 backdrop-blur-xl md:px-7">
            <button type="button" onClick={() => { setActiveChannelId(null); setSearchParams({}); }} aria-label="Назад к каналам" className="rounded-xl p-2 text-t-secondary hover:bg-white/5 md:hidden"><ArrowLeft size={18} /></button>
            <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-accent/15 text-accent">
              {activeChannel.avatarUrl ? <img src={activeChannel.avatarUrl} alt="" className="h-full w-full object-cover" /> : activeChannel.visibility === 'private' ? <LockKeyhole size={18} /> : <Radio size={19} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><h2 className="truncate text-sm font-bold">{activeChannel.title}</h2><span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${activeChannel.visibility === 'public' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-400/10 text-amber-200'}`}>{activeChannel.visibility === 'public' ? 'публичный' : 'приватный'}</span></div>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><Users size={12} /> {activeChannel.memberCount} подписчиков <span>·</span> {activeChannel.isOwner ? 'Ваш канал' : `Автор: ${activeChannel.ownerName || activeChannel.ownerUsername || 'Skyline'}`}</p>
            </div>
            {activeChannel.isOwner ? <>
              {activeChannel.visibility === 'private' && <button type="button" onClick={() => void copyInvite()} title="Скопировать ссылку-приглашение" aria-label="Ссылка-приглашение" className="rounded-xl p-2.5 text-t-secondary transition hover:bg-white/5 hover:text-accent"><Share2 size={17} /></button>}
              <button type="button" onClick={() => { setVisibility(activeChannel.visibility); setEditing(true); }} title="Настройки канала" aria-label="Настройки канала" className="rounded-xl p-2.5 text-t-secondary transition hover:bg-white/5 hover:text-white"><Settings size={17} /></button>
            </> : activeChannel.isSubscribed ? <button disabled={busy} type="button" onClick={() => void unsubscribe(activeChannel)} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5 disabled:opacity-50">Отписаться</button> : <button disabled={busy} type="button" onClick={() => void subscribe(activeChannel)} className="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent disabled:opacity-50">Подписаться</button>}
          </header>
          {activeChannel.description && <div className="border-b border-white/[0.06] px-5 py-3 text-sm leading-6 text-t-secondary md:px-8">{activeChannel.description}</div>}
          {inviteLink && <button type="button" onClick={() => void navigator.clipboard.writeText(inviteLink).then(() => showToast('Ссылка скопирована.', 'success')).catch((error: unknown) => { console.error('Не удалось скопировать ссылку:', error); showToast('Не удалось скопировать ссылку.', 'error'); })} className="flex items-center gap-2 border-b border-accent/10 bg-accent/[0.06] px-5 py-2.5 text-left text-xs text-accent md:px-8"><Copy size={13} /> Ссылка-приглашение создана. Нажмите, чтобы скопировать</button>}

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-8">
            {loadingPosts && <div className="mx-auto max-w-2xl space-y-3">{[0, 1, 2].map((item) => <div key={item} className="h-36 animate-pulse rounded-3xl bg-white/[0.04]" />)}</div>}
            {!loadingPosts && activePosts.length === 0 && <div className="mx-auto mt-16 flex max-w-sm flex-col items-center gap-2.5 rounded-3xl border border-white/[0.06] bg-white/[0.02] p-8 text-center animate-scale-in">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.04] text-slate-500"><Hash size={22} /></div>
              <p className="mt-4 text-sm font-semibold">Пока нет публикаций</p>
              <p className="mt-1 text-xs text-slate-500">{activeChannel.isOwner ? 'Напишите первый пост для подписчиков.' : 'Здесь появятся новые публикации канала.'}</p>
            </div>}
            <div className="mx-auto max-w-2xl space-y-4">
              {activePosts.map((post) => {
                const counts = REACTIONS.map((emoji) => ({
                  emoji,
                  count: post.reactions.filter((reaction) => reaction.emoji === emoji).length,
                  mine: post.reactions.some((reaction) => reaction.emoji === emoji && reaction.userId === user?.id),
                }));
                return <article key={post.id} className="channel-post overflow-hidden rounded-3xl border border-white/[0.08] bg-[#111a2a]/90 shadow-[0_12px_40px_rgba(0,0,0,0.16)]">
                  {post.pinned && <div className="flex items-center gap-2 border-b border-accent/10 bg-accent/[0.06] px-5 py-2 text-[11px] font-semibold text-accent"><Pin size={13} /> Закреплённая публикация</div>}
                  <div className="flex items-center gap-3 px-5 pt-4">
                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent/15 text-accent"><Radio size={16} /></div>
                    <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{activeChannel.title}</p><time className="mt-0.5 block text-[10px] text-slate-500">{formatDate(post.createdAt)}</time></div>
                    {activeChannel.isOwner && <div className="flex items-center gap-1">
                      <button type="button" onClick={() => void togglePin(post)} title={post.pinned ? 'Открепить' : 'Закрепить'} aria-label={post.pinned ? 'Открепить публикацию' : 'Закрепить публикацию'} className={`rounded-lg p-2 transition hover:bg-white/5 ${post.pinned ? 'text-accent' : 'text-slate-500 hover:text-slate-200'}`}><Pin size={15} /></button>
                      <button type="button" onClick={() => void deletePost(post)} title="Удалить публикацию" aria-label="Удалить публикацию" className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-400/10 hover:text-rose-300"><Trash2 size={15} /></button>
                    </div>}
                  </div>
                  <p className="whitespace-pre-wrap break-words px-5 pb-4 pt-4 text-sm leading-7 text-slate-200">{post.text}</p>
                  <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] px-5 py-3">
                    {counts.map(({ emoji, count, mine }) => <button key={emoji} type="button" disabled={!activeChannel.isSubscribed} onClick={() => void toggleReaction(post, emoji)} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-60 ${mine ? 'border-accent/30 bg-accent/10 text-accent' : 'border-white/[0.08] bg-white/[0.025] text-slate-300 hover:border-white/20'}`}><span>{emoji}</span>{count > 0 && <span>{count}</span>}</button>)}
                    {!activeChannel.isSubscribed && <span className="ml-auto text-[10px] text-slate-600">Подпишитесь, чтобы ставить реакции</span>}
                  </div>
                </article>;
              })}
            </div>
          </div>

          {activeChannel.isOwner && <form onSubmit={(event) => void publishPost(event)} className="border-t border-white/[0.08] bg-panel/80 p-3 backdrop-blur-xl md:px-8 md:py-4">
            <div className="mx-auto flex max-w-2xl items-end gap-2 rounded-2xl border border-white/10 bg-slate-950/50 p-2 focus-within:border-accent/30">
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={10_000} rows={1} placeholder="Опубликовать сообщение для подписчиков…" className="max-h-36 min-h-10 flex-1 resize-y bg-transparent px-2 py-2 text-sm leading-5 text-t-primary outline-none placeholder:text-slate-600" />
              <button type="submit" disabled={busy || !draft.trim()} aria-label="Опубликовать" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-white transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"><Send size={16} /></button>
            </div>
          </form>}
        </>}
      </section>

      {(creating || editing) && <div className="fixed inset-0 z-[120] flex justify-end overflow-y-auto bg-black/60 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) { setCreating(false); setEditing(false); } }}>
        <section className="my-auto min-h-full w-full max-w-lg border-l border-white/10 bg-panel p-5 shadow-2xl md:p-7">
          <header className="mb-5 flex items-start justify-between gap-3">
            <div><h2 className="text-lg font-bold">{creating ? 'Создать канал' : 'Настройки канала'}</h2><p className="mt-1 text-xs text-slate-500">{creating ? 'Публикуйте новости для своих подписчиков.' : 'Управляйте информацией и доступом к каналу.'}</p></div>
            <button type="button" onClick={() => { setCreating(false); setEditing(false); }} aria-label="Закрыть" className="rounded-xl p-2 text-slate-500 hover:bg-white/5 hover:text-white"><X size={18} /></button>
          </header>
          <form onSubmit={creating ? (event) => void createChannel(event) : (event) => void saveChannelSettings(event)} className="space-y-4">
            {editing && activeChannel && <div className="flex items-center gap-3 rounded-2xl bg-slate-950/40 p-3">
              <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-xl bg-accent/15 text-accent">{activeChannel.avatarUrl ? <img src={activeChannel.avatarUrl} alt="" className="h-full w-full object-cover" /> : <Radio size={19} />}</div>
              <label className="flex-1 text-xs font-medium text-slate-300">Изображение канала <span className="mt-1 block text-[10px] text-slate-500">PNG, JPG или WebP · до 1 МБ</span><input type="file" name="avatar" accept="image/*" className="mt-2 block w-full text-[10px] text-slate-500 file:mr-2 file:rounded-lg file:border-0 file:bg-white/10 file:px-2 file:py-1.5 file:text-[10px] file:text-slate-200" /></label>
            </div>}
            <label className="block text-xs font-medium text-slate-300">Название<input name="title" required minLength={2} maxLength={64} defaultValue={editing ? activeChannel?.title : title} onChange={creating ? (event) => setTitle(event.target.value) : undefined} placeholder="Например, Skyline Новости" className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 text-sm outline-none focus:border-accent/50" /></label>
            <label className="block text-xs font-medium text-slate-300">Описание<textarea name="description" maxLength={500} rows={3} defaultValue={editing ? activeChannel?.description : description} onChange={creating ? (event) => setDescription(event.target.value) : undefined} placeholder="О чём этот канал?" className="mt-1.5 w-full resize-y rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm outline-none focus:border-accent/50" /></label>
            <fieldset><legend className="mb-2 text-xs font-medium text-slate-300">Доступ к каналу</legend><div className="grid grid-cols-2 gap-2">
              {(['public', 'private'] as const).map((kind) => <label key={kind} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition ${visibility === kind ? 'border-accent/35 bg-accent/[0.07]' : 'border-white/[0.08] hover:bg-white/[0.03]'}`}>
                <input type="radio" name="visibility" value={kind} checked={visibility === kind} onChange={() => setVisibility(kind)} className="mt-0.5 accent-accent" />
                <span><span className="flex items-center gap-1.5 text-xs font-semibold">{kind === 'public' ? <Radio size={13} /> : <LockKeyhole size={13} />}{kind === 'public' ? 'Публичный' : 'Приватный'}</span><span className="mt-1 block text-[10px] leading-4 text-slate-500">{kind === 'public' ? 'Можно найти в каталоге.' : 'Доступ только по ссылке.'}</span></span>
              </label>)}
            </div></fieldset>
            <div className="flex flex-col-reverse gap-2 border-t border-white/[0.07] pt-4 sm:flex-row sm:items-center">
              {editing && <button type="button" disabled={busy} onClick={() => void deleteChannel()} className="mr-auto inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-400/10 disabled:opacity-50"><Trash2 size={14} /> Удалить канал</button>}
              <button type="button" onClick={() => { setCreating(false); setEditing(false); }} className="rounded-xl px-4 py-2.5 text-xs font-semibold text-t-secondary hover:bg-white/5">Отмена</button>
              <button type="submit" disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-accent disabled:opacity-50"><Check size={15} />{busy ? 'Сохраняем…' : creating ? 'Создать канал' : 'Сохранить'}</button>
            </div>
          </form>
        </section>
      </div>}
    </main>
  );
}
