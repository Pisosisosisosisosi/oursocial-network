import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Download, FileText, Paperclip, Plus, Search, Send, SmilePlus, Trash2, UserPlus, Users, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, type User } from '../api/client';
import { getSocket } from '../api/socket';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/useToast';
import WorkspaceTabs from '../components/layout/WorkspaceTabs';
import WorkspaceSidebarHeader from '../components/layout/WorkspaceSidebarHeader';
import { decryptBytes, encryptBytes, packAttachmentPayload, unpackAttachmentPayload, type RecipientPublicKey } from '../crypto/encrypt';

interface GroupMember extends User {
  userId: string;
  joinedAt: string;
  publicKey: string;
}

interface Group {
  id: string;
  title: string;
  memberCount: number;
  members: GroupMember[];
  createdAt: string;
}

interface GroupMessage {
  id: string;
  groupId: string;
  senderId: string;
  text: string;
  createdAt: string;
  edited?: boolean;
  reactions: { userId: string; emoji: string }[];
  type?: 'text' | 'image' | 'file';
  fileName?: string;
  contentType?: string;
  fileData?: string;
}

const REACTIONS = ['❤️', '👍', '😂'];
const GROUP_ATTACHMENT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf', 'text/plain', 'text/csv', 'application/zip',
]);

function groupRecipients(group: Group): RecipientPublicKey[] {
  const recipients = group.members.map((member) => ({ userId: member.userId, publicKey: member.publicKey }));
  if (!recipients.length || recipients.some((recipient) => !recipient.publicKey)) {
    throw new Error('У всех участников группы должен быть ключ шифрования. Попросите участников войти в Skyline и повторите попытку.');
  }
  return recipients;
}

function bytesToDataUrl(data: Uint8Array, contentType: string): string {
  let binary = '';
  for (let offset = 0; offset < data.length; offset += 0x8000) {
    binary += String.fromCharCode(...data.subarray(offset, offset + 0x8000));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

async function decryptGroupMessage(message: GroupMessage, userId: string): Promise<GroupMessage> {
  if (!message.text.startsWith('skyline-e2e:v4:')) return message;
  try {
    const plaintext = await decryptBytes(message.text, userId);
    const attachment = unpackAttachmentPayload(plaintext);
    if (attachment) {
      const { fileName, contentType } = attachment.metadata;
      if (!GROUP_ATTACHMENT_TYPES.has(contentType) || !attachment.data.length || attachment.data.length > 2 * 1024 * 1024) {
        throw new Error('Invalid attachment payload');
      }
      return {
        ...message,
        text: '',
        type: contentType.startsWith('image/') ? 'image' : 'file',
        fileName,
        contentType,
        fileData: bytesToDataUrl(attachment.data, contentType),
      };
    }
    const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as { kind?: string; text?: string };
    if (parsed.kind !== 'text' || typeof parsed.text !== 'string') throw new Error('Invalid group message');
    return { ...message, text: parsed.text, type: 'text' };
  } catch {
    return { ...message, text: '[Зашифрованное сообщение недоступно на этом устройстве]', type: 'text' };
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] || character);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function Groups() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id;
  const showToast = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadedGroupId, setLoadedGroupId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [creating, setCreating] = useState(false);
  const [addingMembers, setAddingMembers] = useState(false);
  const [groupTitle, setGroupTitle] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState<User[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [editingMessage, setEditingMessage] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const activeGroup = activeGroupId === ''
    ? null
    : groups.find((group) => group.id === activeGroupId) || groups[0] || null;
  const visibleGroups = useMemo(() => {
    const query = groupSearch.trim().toLocaleLowerCase();
    return query ? groups.filter((group) => group.title.toLocaleLowerCase().includes(query)) : groups;
  }, [groupSearch, groups]);
  const loadingMessages = Boolean(activeGroup && activeGroup.id !== loadedGroupId);

  const loadGroups = useCallback(async () => {
    const response = await api.get<Group[]>('/groups');
    setGroups(response.data);
    return response.data;
  }, []);

  useEffect(() => {
    void loadGroups().catch((error: unknown) => {
      console.error('Не удалось загрузить группы:', error);
      showToast('Не удалось загрузить список групп.', 'error');
    }).finally(() => setLoading(false));
  }, [loadGroups, showToast]);

  const loadMessages = useCallback(async (groupId: string, before?: string) => {
    const response = await api.get<GroupMessage[]>(`/groups/${groupId}/messages`, {
      params: { limit: 20, ...(before ? { before } : {}) },
    });
    const decryptedMessages = userId
      ? await Promise.all(response.data.map((message) => decryptGroupMessage(message, userId)))
      : response.data;
    setMessages((current) => {
      if (!before) return decryptedMessages;
      const ids = new Set(current.map((message) => message.id));
      return [...decryptedMessages.filter((message) => !ids.has(message.id)), ...current];
    });
    setHasMore(decryptedMessages.length === 20);
    setLoadedGroupId(groupId);
  }, [userId]);

  const activeGroupKey = activeGroup?.id;
  useEffect(() => {
    if (!activeGroupKey) return;
    void loadMessages(activeGroupKey).catch((error: unknown) => {
      console.error('Не удалось загрузить сообщения группы:', error);
      showToast('Не удалось загрузить сообщения группы.', 'error');
    });
  }, [activeGroupKey, loadMessages, showToast]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handleMessage = (event: { action: string; groupId?: string; messageId?: string; senderId?: string; message?: Partial<GroupMessage> }) => {
      if (!event.groupId) return;
      if (event.action === 'created' && event.senderId && event.senderId !== user?.id && event.groupId !== activeGroupKey) {
        const groupName = groups.find((group) => group.id === event.groupId)?.title || 'группе';
        showToast(`Новое сообщение в группе «${groupName}».`, 'info');
      }
      if (event.groupId === activeGroupKey) {
        if (event.action === 'deleted' && event.messageId) {
          setMessages((current) => current.filter((message) => message.id !== event.messageId));
        } else if (event.message && event.messageId) {
          if (!user?.id) return;
          void decryptGroupMessage({ ...event.message, id: event.messageId, groupId: event.groupId, senderId: event.senderId || '', text: String(event.message.text || ''), reactions: event.message.reactions || [], createdAt: String(event.message.createdAt || '') } as GroupMessage, user.id)
            .then((decrypted) => setMessages((current) => current.map((message) => message.id === event.messageId ? { ...message, ...decrypted } : message)));
        } else {
          void loadMessages(event.groupId).catch((error: unknown) => {
            console.error('Не удалось обновить сообщения группы:', error);
            showToast('Не удалось обновить сообщения группы.', 'error');
          });
        }
      }
    };
    const handleGroupChanged = () => {
      void loadGroups().catch((error: unknown) => {
        console.error('Не удалось обновить список групп:', error);
        showToast('Не удалось обновить список групп.', 'error');
      });
    };
    socket.on('message_changed', handleMessage);
    socket.on('group_changed', handleGroupChanged);
    return () => {
      socket.off('message_changed', handleMessage);
      socket.off('group_changed', handleGroupChanged);
    };
  }, [activeGroupKey, groups, loadGroups, loadMessages, showToast, user?.id]);

  useEffect(() => {
    const query = memberSearch.trim();
    if (!query.startsWith('@') || query.length < 4) return;
    let current = true;
    const timeout = window.setTimeout(() => {
      setSearching(true);
      void api.get<User[]>('/users/search', { params: { q: query } })
        .then((response) => {
          if (current) setMemberResults(response.data.filter((candidate) => candidate.id !== user?.id));
        })
        .catch((error: unknown) => {
          console.error('Не удалось найти участника:', error);
          if (current) showToast('Не удалось выполнить поиск пользователей.', 'error');
        })
        .finally(() => {
          if (current) setSearching(false);
        });
    }, 250);
    return () => {
      current = false;
      window.clearTimeout(timeout);
    };
  }, [memberSearch, showToast, user?.id]);

  const selectedIds = useMemo(() => new Set(selectedMembers.map((member) => member.id)), [selectedMembers]);
  const addableResults = memberSearch.trim().startsWith('@') && memberSearch.trim().length >= 4
    ? memberResults.filter((candidate) =>
    !selectedIds.has(candidate.id)
    && !(addingMembers && activeGroup?.members.some((member) => member.userId === candidate.id)),
    )
    : [];

  const toggleMember = (candidate: User) => {
    setSelectedMembers((current) => current.some((member) => member.id === candidate.id)
      ? current.filter((member) => member.id !== candidate.id)
      : [...current, candidate]);
  };

  const handleMemberSearchChange = (value: string) => {
    setMemberSearch(value);
    setMemberResults([]);
  };

  const createGroup = async (event: FormEvent) => {
    event.preventDefault();
    if (selectedMembers.length < 1) return;
    try {
      const response = await api.post<{ id: string }>('/groups', {
        title: groupTitle.trim(),
        memberIds: selectedMembers.map((member) => member.id),
      });
      const refreshedGroups = await loadGroups();
      setActiveGroupId(refreshedGroups.find((group) => group.id === response.data.id)?.id || null);
      setCreating(false);
      setGroupTitle('');
      setMemberSearch('');
      setSelectedMembers([]);
      showToast('Группа создана.', 'success');
    } catch (error) {
      console.error('Не удалось создать группу:', error);
      showToast('Не удалось создать группу.', 'error');
    }
  };

  const addMembersToGroup = async () => {
    if (!activeGroup || !selectedMembers.length) return;
    try {
      await api.post(`/groups/${activeGroup.id}/members`, {
        memberIds: selectedMembers.map((member) => member.id),
      });
      await loadGroups();
      setSelectedMembers([]);
      setMemberSearch('');
      setAddingMembers(false);
      showToast('Участники добавлены. Они увидят переписку с момента вступления.', 'success');
    } catch (error) {
      console.error('Не удалось добавить участников:', error);
      showToast('Не удалось добавить участников.', 'error');
    }
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeGroup || !user?.id || !draft.trim()) return;
    try {
      const encrypted = await encryptBytes(
        new TextEncoder().encode(JSON.stringify({ kind: 'text', text: draft })),
        groupRecipients(activeGroup),
      );
      const mentionedUserIds = activeGroup.members
        .filter((member) => member.userId !== user.id && new RegExp(`(^|[^\\w])@${escapeRegExp(member.username)}(?![\\w.-])`, 'i').test(draft))
        .map((member) => member.userId);
      const response = await api.post<GroupMessage>(`/groups/${activeGroup.id}/messages`, {
        text: encrypted,
        mentionUserIds: mentionedUserIds,
      });
      const decrypted = await decryptGroupMessage(response.data, user.id);
      setMessages((current) => [...current, decrypted]);
      setDraft('');
    } catch (error) {
      console.error('Не удалось отправить сообщение в группу:', error);
      showToast(error instanceof Error ? error.message : 'Не удалось отправить сообщение.', 'error');
    }
  };

  const toggleReaction = async (message: GroupMessage, emoji: string) => {
    try {
      await api.post(`/messages/${message.id}/reactions`, { emoji });
    } catch (error) {
      console.error('Не удалось сохранить реакцию:', error);
      showToast('Не удалось сохранить реакцию.', 'error');
    }
  };

  const deleteMessage = async (message: GroupMessage) => {
    try {
      await api.delete(`/messages/${message.id}`);
      setMessages((current) => current.filter((item) => item.id !== message.id));
    } catch (error) {
      console.error('Не удалось удалить сообщение:', error);
      showToast('Не удалось удалить сообщение.', 'error');
    }
  };

  const saveEdit = async (messageId: string) => {
    if (!activeGroup || !user?.id) return;
    try {
      const encrypted = await encryptBytes(
        new TextEncoder().encode(JSON.stringify({ kind: 'text', text: editDraft })),
        groupRecipients(activeGroup),
      );
      const response = await api.patch<GroupMessage>(`/messages/${messageId}`, { text: encrypted });
      const decrypted = await decryptGroupMessage(response.data, user.id);
      setMessages((current) => current.map((message) => message.id === messageId ? decrypted : message));
      setEditingMessage(null);
      setEditDraft('');
    } catch (error) {
      console.error('Не удалось изменить сообщение:', error);
      showToast(error instanceof Error ? error.message : 'Не удалось изменить сообщение.', 'error');
    }
  };

  const sendAttachment = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !activeGroup || !user?.id) return;
    if (!GROUP_ATTACHMENT_TYPES.has(file.type)) {
      showToast('Неподдерживаемый формат файла.', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast('Размер вложения не должен превышать 2 МБ.', 'error');
      return;
    }
    if (!file.size) {
      showToast('Нельзя отправить пустой файл.', 'error');
      return;
    }
    try {
      const packed = packAttachmentPayload(new Uint8Array(await file.arrayBuffer()), {
        fileName: file.name,
        contentType: file.type,
      });
      const encrypted = await encryptBytes(packed, groupRecipients(activeGroup));
      const response = await api.post<GroupMessage>(`/groups/${activeGroup.id}/messages`, { text: encrypted, type: 'file' });
      const decrypted = await decryptGroupMessage(response.data, user.id);
      setMessages((current) => [...current, decrypted]);
      showToast('Файл отправлен в зашифрованном виде.', 'success');
    } catch (error) {
      console.error('Не удалось отправить вложение в группу:', error);
      showToast(error instanceof Error ? error.message : 'Не удалось отправить файл.', 'error');
    }
  };

  const loadOlder = async () => {
    if (!activeGroup || !messages.length || !hasMore) return;
    try {
      await loadMessages(activeGroup.id, messages[0].id);
    } catch (error) {
      console.error('Не удалось загрузить предыдущие сообщения:', error);
      showToast('Не удалось загрузить предыдущие сообщения.', 'error');
    }
  };

  const exportGroup = async (format: 'json' | 'html') => {
    if (!activeGroup || !user?.id) return;
    try {
      const response = await api.get<GroupMessage[]>(`/groups/${activeGroup.id}/export`, { params: { format: 'json' } });
      const decrypted = await Promise.all(response.data.map((message) => decryptGroupMessage(message, user.id)));
      const exportData = format === 'json'
        ? JSON.stringify(decrypted, null, 2)
        : `<!doctype html><html lang="ru"><meta charset="utf-8"><title>${escapeHtml(activeGroup.title)}</title><style>body{font:15px system-ui;max-width:760px;margin:32px auto;padding:0 16px;background:#0b1020;color:#e2e8f0}article{padding:14px;margin:10px 0;border:1px solid #334155;border-radius:14px}time{color:#94a3b8;font-size:12px;margin-right:12px}p{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>${escapeHtml(activeGroup.title)}</h1>${decrypted.map((message) => `<article><time>${escapeHtml(new Date(message.createdAt).toLocaleString())}</time><b>${escapeHtml(message.senderId)}</b><p>${escapeHtml(message.type === 'text' ? message.text : message.fileName || 'Вложение')}</p></article>`).join('')}</html>`;
      const blob = new Blob([exportData], { type: format === 'json' ? 'application/json;charset=utf-8' : 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `pulse-group-${activeGroup.id}.${format}`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(`История группы скачана в формате ${format.toUpperCase()}.`, 'success');
    } catch (error) {
      console.error('Не удалось экспортировать группу:', error);
      showToast('Не удалось экспортировать историю группы.', 'error');
    }
  };

  return (
    <main className="flex h-full min-h-0 w-full bg-bg-base text-t-primary">
      <aside className={`${activeGroup ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-r border-white/[0.08] bg-panel md:w-80`}>
        <WorkspaceSidebarHeader
          searchValue={groupSearch}
          onSearchChange={setGroupSearch}
          searchPlaceholder="Поиск групп"
        />
        <WorkspaceTabs />
        <header className="flex items-center justify-between border-b border-white/[0.08] p-4">
          <button type="button" onClick={() => navigate('/')} className="rounded-xl p-2 text-t-secondary transition hover:bg-white/[0.06] hover:text-white" aria-label="Назад к чатам">
            <ArrowLeft size={18} />
          </button>
          <h1 className="flex items-center gap-2 text-sm font-semibold"><Users size={17} className="text-accent" /> Общие группы</h1>
          <button type="button" onClick={() => { setCreating(true); setAddingMembers(false); setSelectedMembers([]); setMemberSearch(''); setActiveGroupId(''); }} className="rounded-xl p-2 text-accent transition hover:bg-accent/10" aria-label="Создать группу" title="Создать группу">
            <Plus size={18} />
          </button>
        </header>

        {creating && (
          <form onSubmit={(event) => void createGroup(event)} className="space-y-3 border-b border-white/[0.08] p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Новая группа</h2>
              <button type="button" onClick={() => setCreating(false)} aria-label="Закрыть" className="rounded-lg p-1 text-slate-500 hover:bg-white/5"><X size={16} /></button>
            </div>
            <input value={groupTitle} onChange={(event) => setGroupTitle(event.target.value)} required minLength={2} maxLength={64} placeholder="Название группы" className="h-10 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 text-sm outline-none focus:border-accent/50" />
            <label className="relative block">
              <Search size={14} className="absolute left-3 top-3 text-slate-500" />
              <input value={memberSearch} onChange={(event) => handleMemberSearchChange(event.target.value)} placeholder="Найти по полному @username" className="h-10 w-full rounded-xl border border-white/10 bg-slate-950/50 pl-9 pr-3 text-xs outline-none focus:border-accent/50" />
            </label>
            {searching && <p className="text-[11px] text-slate-500">Ищем пользователя…</p>}
            <div className="max-h-32 space-y-1 overflow-y-auto">
              {addableResults.map((candidate) => (
                <button key={candidate.id} type="button" onClick={() => toggleMember(candidate)} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs hover:bg-white/[0.05]">
                  <span>@{candidate.username} <span className="text-slate-500">{candidate.displayName}</span></span><UserPlus size={14} className="text-accent" />
                </button>
              ))}
            </div>
            {!!selectedMembers.length && <div className="flex flex-wrap gap-1.5">{selectedMembers.map((member) => <button key={member.id} type="button" onClick={() => toggleMember(member)} className="inline-flex items-center gap-1 rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-[10px] text-accent">@{member.username}<X size={11} /></button>)}</div>}
            <button disabled={groupTitle.trim().length < 2 || !selectedMembers.length} className="btn-glow btn-shine min-h-[44px] w-full rounded-xl bg-gradient-to-r from-accent-from to-accent-to px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Создать группу</button>
          </form>
        )}

        <div className="stagger min-h-0 flex-1 overflow-y-auto p-3">
          {loading ? (
            <div role="status" className="space-y-2 p-2">{[0, 1, 2].map((item) => <div key={item} className="chat-skeleton h-14 rounded-xl" />)}</div>
          ) : visibleGroups.length === 0 ? (
            <div className="m-2 flex flex-col items-center gap-2.5 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 text-center animate-scale-in">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent/10 text-accent"><Users size={20} /></span>
              <p className="text-xs leading-relaxed text-slate-400">{groupSearch.trim() ? 'Группы не найдены.' : 'Вы пока не состоите в группах. Создайте группу и найдите участников по полному @username.'}</p>
            </div>
          ) : visibleGroups.map((group) => (
            <button key={group.id} type="button" onClick={() => setActiveGroupId(group.id)} className={`chat-card mb-1 flex w-full items-center gap-3 rounded-xl p-3 text-left ${activeGroup?.id === group.id ? 'chat-active text-white' : 'text-slate-300'}`}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent"><Users size={18} /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{group.title}</span><span className="mt-1 block text-[10px] text-slate-500">{group.memberCount} участников</span></span>
            </button>
          ))}
        </div>
      </aside>

      <section className={`${activeGroup ? 'flex' : 'hidden md:flex'} min-h-0 min-w-0 flex-1 flex-col`}>
        {activeGroup ? (
          <>
            <header className="flex items-center gap-3 border-b border-white/[0.08] bg-panel px-3 py-3 sm:px-5">
              <button type="button" onClick={() => setActiveGroupId('')} className="rounded-lg p-2 text-t-secondary hover:bg-white/[0.06] md:hidden" aria-label="К списку групп"><ArrowLeft size={18} /></button>
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent"><Users size={18} /></div>
              <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold">{activeGroup.title}</h2><p className="text-[11px] text-slate-500">{activeGroup.memberCount} участников</p></div>
              <button type="button" onClick={() => void exportGroup('json')} title="Экспорт JSON" aria-label="Экспортировать группу в JSON" className="rounded-xl p-2 text-slate-500 hover:bg-white/[0.05] hover:text-accent"><Download size={15} /></button>
              <button type="button" onClick={() => void exportGroup('html')} title="Экспорт HTML" aria-label="Экспортировать группу в HTML" className="rounded-xl p-2 text-slate-500 hover:bg-white/[0.05] hover:text-accent"><FileText size={15} /></button>
              <button type="button" onClick={() => { setAddingMembers(true); setCreating(false); setSelectedMembers([]); setMemberSearch(''); }} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/[0.05]"><UserPlus size={15} /><span className="hidden sm:inline">Добавить участников</span></button>
            </header>

            {addingMembers && (
              <div className="border-b border-white/[0.08] bg-slate-900/70 p-3 sm:px-5">
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {activeGroup.members.map((member) => <span key={member.userId} className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] text-t-secondary">@{member.username}</span>)}
                </div>
                <div className="flex gap-2">
                  <input value={memberSearch} onChange={(event) => handleMemberSearchChange(event.target.value)} placeholder="Найти по полному @username" className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/50 px-3 text-xs outline-none focus:border-accent/50" />
                  <button type="button" disabled={!selectedMembers.length} onClick={() => void addMembersToGroup()} className="rounded-xl bg-accent px-3 text-xs font-semibold disabled:opacity-40">Добавить</button>
                  <button type="button" onClick={() => { setAddingMembers(false); setMemberSearch(''); setSelectedMembers([]); }} className="rounded-xl p-2 text-t-secondary hover:bg-white/[0.05]" aria-label="Закрыть"><X size={16} /></button>
                </div>
                {!!selectedMembers.length && <div className="mt-2 flex flex-wrap gap-1.5">{selectedMembers.map((member) => <button key={member.id} type="button" onClick={() => toggleMember(member)} className="inline-flex items-center gap-1 rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-[10px] text-accent">@{member.username}<X size={11} /></button>)}</div>}
                {!!addableResults.length && <div className="mt-2 flex flex-wrap gap-2">{addableResults.map((candidate) => <button key={candidate.id} type="button" onClick={() => toggleMember(candidate)} className={`rounded-full border px-3 py-1.5 text-[11px] ${selectedIds.has(candidate.id) ? 'border-accent/40 bg-accent/15 text-accent' : 'border-white/10 text-slate-300'}`}>@{candidate.username}</button>)}</div>}
                <p className="mt-2 text-[10px] text-slate-500">Новые участники видят сообщения только после вступления. Все участники могут приглашать других.</p>
              </div>
            )}

            <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-6">
              {hasMore && <button type="button" onClick={() => void loadOlder()} className="mx-auto block rounded-full border border-white/10 px-3 py-1.5 text-[10px] text-t-secondary hover:bg-white/[0.04]">Загрузить более ранние сообщения</button>}
              {loadingMessages && <div role="status" className="space-y-3">{[0, 1, 2].map((item) => <div key={item} className="chat-skeleton h-14 w-2/3 rounded-2xl" />)}</div>}
              {!loadingMessages && !messages.length && <p className="m-auto py-10 text-center text-xs text-slate-500">В этой группе пока нет сообщений.</p>}
              {messages.map((message) => {
                const author = activeGroup.members.find((member) => member.userId === message.senderId);
                const own = message.senderId === user?.id;
                return (
                  <article key={message.id} className={`group max-w-[min(80%,640px)] rounded-2xl border px-4 py-3 ${own ? 'ml-auto border-accent/20 bg-accent/10' : 'border-white/[0.07] bg-white/[0.035]'}`}>
                    {!own && <p className="mb-1 text-[10px] font-semibold text-accent">{author?.displayName || author?.username || 'Участник'} <span className="font-normal text-slate-500">@{author?.username}</span></p>}
                    {message.type === 'image' && message.fileData ? <img src={message.fileData} alt={message.fileName || 'Изображение'} className="mb-2 max-h-72 max-w-full rounded-lg object-contain" /> : message.type === 'file' && message.fileData ? <a href={message.fileData} download={message.fileName || 'attachment'} className="mb-2 flex items-center gap-2 rounded-lg bg-black/10 p-3 hover:bg-black/20"><FileText size={20} /><span className="max-w-56 break-all">{message.fileName || 'Скачать файл'}</span></a> : null}
                    {editingMessage === message.id && message.type === 'text' ? (
                      <div className="space-y-2"><textarea value={editDraft} onChange={(event) => setEditDraft(event.target.value)} className="w-full resize-y rounded-lg border border-white/10 bg-slate-950/60 p-2 text-sm outline-none focus:border-accent/40" /><div className="flex justify-end gap-2"><button type="button" onClick={() => setEditingMessage(null)} className="text-[10px] text-t-secondary">Отмена</button><button type="button" onClick={() => void saveEdit(message.id)} className="text-[10px] font-semibold text-accent">Сохранить</button></div></div>
                    ) : message.type === 'text' ? <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.text}</p> : null}
                    <div className="mt-2 flex items-center justify-between gap-4 text-[9px] text-slate-500">
                      <time>{new Date(message.createdAt).toLocaleString()}</time>
                      <span className="flex items-center gap-1">{message.edited && <span>изменено</span>}{own && <>{message.type === 'text' && <button type="button" onClick={() => { setEditingMessage(message.id); setEditDraft(message.text); }} aria-label="Редактировать" className="rounded p-1 hover:bg-white/10 hover:text-white"><span className="sr-only">Редактировать</span>✎</button>}<button type="button" onClick={() => void deleteMessage(message)} aria-label="Удалить" className="rounded p-1 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 size={12} /></button></>}</span>
                    </div>
                    {!!message.reactions.length && <div className="mt-2 flex flex-wrap gap-1">{REACTIONS.map((emoji) => { const count = message.reactions.filter((reaction) => reaction.emoji === emoji).length; return count ? <button key={emoji} type="button" onClick={() => void toggleReaction(message, emoji)} className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-xs">{emoji} {count}</button> : null; })}</div>}
                    <div className="mt-1 flex gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">{REACTIONS.map((emoji) => <button key={emoji} type="button" onClick={() => void toggleReaction(message, emoji)} aria-label={`Поставить реакцию ${emoji}`} className="rounded-md p-1 text-[11px] hover:bg-white/10"><SmilePlus size={12} className="inline" /> {emoji}</button>)}</div>
                  </article>
                );
              })}
            </div>

            <form onSubmit={(event) => void sendMessage(event)} className="flex items-end gap-2 border-t border-white/[0.08] bg-panel p-3 sm:px-5">
              <label className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl text-t-secondary transition hover:bg-white/5 hover:text-accent" title="Зашифрованное вложение"><Paperclip size={17} /><input type="file" accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,text/csv,application/zip" onChange={(event) => void sendAttachment(event)} className="hidden" /></label>
              <div className="hidden max-w-[30%] gap-1 overflow-hidden sm:flex">{activeGroup.members.slice(0, 3).map((member) => <button key={member.userId} type="button" onClick={() => setDraft((value) => `${value}${value && !value.endsWith(' ') ? ' ' : ''}@${member.username} `)} className="truncate rounded-full bg-white/[0.04] px-2 py-1 text-[9px] text-slate-500 hover:text-accent">@{member.username}</button>)}</div>
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={1} maxLength={4000} placeholder="Сообщение группе… Используйте @username для упоминания" className="max-h-32 min-h-11 min-w-0 flex-1 resize-y rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm outline-none transition focus:border-accent/40" onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
              <button type="submit" disabled={!draft.trim()} aria-label="Отправить сообщение" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent text-white transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"><Send size={17} /></button>
            </form>
          </>
        ) : <div className="grid flex-1 place-items-center text-center text-sm text-slate-500"><div><Users size={28} className="mx-auto mb-3 text-slate-600" />Выберите группу или создайте новую.</div></div>}
      </section>
    </main>
  );
}
