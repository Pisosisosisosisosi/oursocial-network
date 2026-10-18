import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Download, FileText, Plus, Search, Send, SmilePlus, Trash2, UserPlus, Users, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, type User } from '../api/client';
import { getSocket } from '../api/socket';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/useToast';
import WorkspaceTabs from '../components/WorkspaceTabs';
import WorkspaceSidebarHeader from '../components/WorkspaceSidebarHeader';

interface GroupMember extends User {
  userId: string;
  joinedAt: string;
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
}

const REACTIONS = ['❤️', '👍', '😂'];

export default function Groups() {
  const navigate = useNavigate();
  const { user } = useAuth();
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
    setMessages((current) => {
      if (!before) return response.data;
      const ids = new Set(current.map((message) => message.id));
      return [...response.data.filter((message) => !ids.has(message.id)), ...current];
    });
    setHasMore(response.data.length === 20);
    setLoadedGroupId(groupId);
  }, []);

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
          const updatedMessage = event.message;
          setMessages((current) => current.map((message) => message.id === event.messageId ? { ...message, ...updatedMessage } : message));
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
    if (!activeGroup || !draft.trim()) return;
    try {
      const response = await api.post<GroupMessage>(`/groups/${activeGroup.id}/messages`, { text: draft });
      setMessages((current) => [...current, response.data]);
      setDraft('');
    } catch (error) {
      console.error('Не удалось отправить сообщение в группу:', error);
      showToast('Не удалось отправить сообщение.', 'error');
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
    try {
      const response = await api.patch<GroupMessage>(`/messages/${messageId}`, { text: editDraft });
      setMessages((current) => current.map((message) => message.id === messageId ? response.data : message));
      setEditingMessage(null);
      setEditDraft('');
    } catch (error) {
      console.error('Не удалось изменить сообщение:', error);
      showToast('Не удалось изменить сообщение.', 'error');
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
    if (!activeGroup) return;
    try {
      const response = await api.get(`/groups/${activeGroup.id}/export`, {
        params: { format },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data);
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
    <main className="flex h-full min-h-0 w-full bg-[#090d16] text-slate-100">
      <aside className={`${activeGroup ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-r border-white/[0.08] bg-[#0d1420] md:w-80`}>
        <WorkspaceSidebarHeader
          searchValue={groupSearch}
          onSearchChange={setGroupSearch}
          searchPlaceholder="Поиск групп"
        />
        <WorkspaceTabs />
        <header className="flex items-center justify-between border-b border-white/[0.08] p-4">
          <button type="button" onClick={() => navigate('/')} className="rounded-xl p-2 text-slate-400 transition hover:bg-white/[0.06] hover:text-white" aria-label="Назад к чатам">
            <ArrowLeft size={18} />
          </button>
          <h1 className="flex items-center gap-2 text-sm font-semibold"><Users size={17} className="text-indigo-300" /> Общие группы</h1>
          <button type="button" onClick={() => { setCreating(true); setAddingMembers(false); setSelectedMembers([]); setMemberSearch(''); setActiveGroupId(''); }} className="rounded-xl p-2 text-indigo-300 transition hover:bg-indigo-400/10" aria-label="Создать группу" title="Создать группу">
            <Plus size={18} />
          </button>
        </header>

        {creating && (
          <form onSubmit={(event) => void createGroup(event)} className="space-y-3 border-b border-white/[0.08] p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Новая группа</h2>
              <button type="button" onClick={() => setCreating(false)} aria-label="Закрыть" className="rounded-lg p-1 text-slate-500 hover:bg-white/5"><X size={16} /></button>
            </div>
            <input value={groupTitle} onChange={(event) => setGroupTitle(event.target.value)} required minLength={2} maxLength={64} placeholder="Название группы" className="h-10 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 text-sm outline-none focus:border-indigo-400/50" />
            <label className="relative block">
              <Search size={14} className="absolute left-3 top-3 text-slate-500" />
              <input value={memberSearch} onChange={(event) => handleMemberSearchChange(event.target.value)} placeholder="Найти по полному @username" className="h-10 w-full rounded-xl border border-white/10 bg-slate-950/50 pl-9 pr-3 text-xs outline-none focus:border-indigo-400/50" />
            </label>
            {searching && <p className="text-[11px] text-slate-500">Ищем пользователя…</p>}
            <div className="max-h-32 space-y-1 overflow-y-auto">
              {addableResults.map((candidate) => (
                <button key={candidate.id} type="button" onClick={() => toggleMember(candidate)} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs hover:bg-white/[0.05]">
                  <span>@{candidate.username} <span className="text-slate-500">{candidate.displayName}</span></span><UserPlus size={14} className="text-indigo-300" />
                </button>
              ))}
            </div>
            {!!selectedMembers.length && <div className="flex flex-wrap gap-1.5">{selectedMembers.map((member) => <button key={member.id} type="button" onClick={() => toggleMember(member)} className="inline-flex items-center gap-1 rounded-full border border-indigo-400/20 bg-indigo-500/10 px-2.5 py-1 text-[10px] text-indigo-200">@{member.username}<X size={11} /></button>)}</div>}
            <button disabled={groupTitle.trim().length < 2 || !selectedMembers.length} className="w-full rounded-xl bg-indigo-500 px-3 py-2 text-xs font-semibold disabled:opacity-40">Создать группу</button>
          </form>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading ? (
            <div role="status" className="space-y-2 p-2">{[0, 1, 2].map((item) => <div key={item} className="chat-skeleton h-14 rounded-xl" />)}</div>
          ) : visibleGroups.length === 0 ? (
            <p className="p-3 text-xs leading-relaxed text-slate-500">{groupSearch.trim() ? 'Группы не найдены.' : 'Вы пока не состоите в группах. Создайте группу и найдите участников по полному @username.'}</p>
          ) : visibleGroups.map((group) => (
            <button key={group.id} type="button" onClick={() => setActiveGroupId(group.id)} className={`mb-1 flex w-full items-center gap-3 rounded-xl p-3 text-left transition ${activeGroup?.id === group.id ? 'bg-indigo-500/15 text-white' : 'text-slate-300 hover:bg-white/[0.04]'}`}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-500/15 text-indigo-200"><Users size={18} /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{group.title}</span><span className="mt-1 block text-[10px] text-slate-500">{group.memberCount} участников</span></span>
            </button>
          ))}
        </div>
      </aside>

      <section className={`${activeGroup ? 'flex' : 'hidden md:flex'} min-h-0 min-w-0 flex-1 flex-col`}>
        {activeGroup ? (
          <>
            <header className="flex items-center gap-3 border-b border-white/[0.08] bg-[#0d1420] px-3 py-3 sm:px-5">
              <button type="button" onClick={() => setActiveGroupId('')} className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.06] md:hidden" aria-label="К списку групп"><ArrowLeft size={18} /></button>
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-500/15 text-indigo-200"><Users size={18} /></div>
              <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-semibold">{activeGroup.title}</h2><p className="text-[11px] text-slate-500">{activeGroup.memberCount} участников</p></div>
              <button type="button" onClick={() => void exportGroup('json')} title="Экспорт JSON" aria-label="Экспортировать группу в JSON" className="rounded-xl p-2 text-slate-500 hover:bg-white/[0.05] hover:text-indigo-300"><Download size={15} /></button>
              <button type="button" onClick={() => void exportGroup('html')} title="Экспорт HTML" aria-label="Экспортировать группу в HTML" className="rounded-xl p-2 text-slate-500 hover:bg-white/[0.05] hover:text-indigo-300"><FileText size={15} /></button>
              <button type="button" onClick={() => { setAddingMembers(true); setCreating(false); setSelectedMembers([]); setMemberSearch(''); }} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/[0.05]"><UserPlus size={15} /><span className="hidden sm:inline">Добавить участников</span></button>
            </header>

            {addingMembers && (
              <div className="border-b border-white/[0.08] bg-slate-900/70 p-3 sm:px-5">
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {activeGroup.members.map((member) => <span key={member.userId} className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] text-slate-400">@{member.username}</span>)}
                </div>
                <div className="flex gap-2">
                  <input value={memberSearch} onChange={(event) => handleMemberSearchChange(event.target.value)} placeholder="Найти по полному @username" className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/50 px-3 text-xs outline-none focus:border-indigo-400/50" />
                  <button type="button" disabled={!selectedMembers.length} onClick={() => void addMembersToGroup()} className="rounded-xl bg-indigo-500 px-3 text-xs font-semibold disabled:opacity-40">Добавить</button>
                  <button type="button" onClick={() => { setAddingMembers(false); setMemberSearch(''); setSelectedMembers([]); }} className="rounded-xl p-2 text-slate-400 hover:bg-white/[0.05]" aria-label="Закрыть"><X size={16} /></button>
                </div>
                {!!selectedMembers.length && <div className="mt-2 flex flex-wrap gap-1.5">{selectedMembers.map((member) => <button key={member.id} type="button" onClick={() => toggleMember(member)} className="inline-flex items-center gap-1 rounded-full border border-indigo-400/20 bg-indigo-500/10 px-2.5 py-1 text-[10px] text-indigo-200">@{member.username}<X size={11} /></button>)}</div>}
                {!!addableResults.length && <div className="mt-2 flex flex-wrap gap-2">{addableResults.map((candidate) => <button key={candidate.id} type="button" onClick={() => toggleMember(candidate)} className={`rounded-full border px-3 py-1.5 text-[11px] ${selectedIds.has(candidate.id) ? 'border-indigo-400/40 bg-indigo-500/15 text-indigo-200' : 'border-white/10 text-slate-300'}`}>@{candidate.username}</button>)}</div>}
                <p className="mt-2 text-[10px] text-slate-500">Новые участники видят сообщения только после вступления. Все участники могут приглашать других.</p>
              </div>
            )}

            <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-6">
              {hasMore && <button type="button" onClick={() => void loadOlder()} className="mx-auto block rounded-full border border-white/10 px-3 py-1.5 text-[10px] text-slate-400 hover:bg-white/[0.04]">Загрузить более ранние сообщения</button>}
              {loadingMessages && <div role="status" className="space-y-3">{[0, 1, 2].map((item) => <div key={item} className="chat-skeleton h-14 w-2/3 rounded-2xl" />)}</div>}
              {!loadingMessages && !messages.length && <p className="m-auto py-10 text-center text-xs text-slate-500">В этой группе пока нет сообщений.</p>}
              {messages.map((message) => {
                const author = activeGroup.members.find((member) => member.userId === message.senderId);
                const own = message.senderId === user?.id;
                return (
                  <article key={message.id} className={`group max-w-[min(80%,640px)] rounded-2xl border px-4 py-3 ${own ? 'ml-auto border-indigo-400/20 bg-indigo-500/10' : 'border-white/[0.07] bg-white/[0.035]'}`}>
                    {!own && <p className="mb-1 text-[10px] font-semibold text-indigo-300">{author?.displayName || author?.username || 'Участник'} <span className="font-normal text-slate-500">@{author?.username}</span></p>}
                    {editingMessage === message.id ? (
                      <div className="space-y-2"><textarea value={editDraft} onChange={(event) => setEditDraft(event.target.value)} className="w-full resize-y rounded-lg border border-white/10 bg-slate-950/60 p-2 text-sm outline-none focus:border-indigo-400/40" /><div className="flex justify-end gap-2"><button type="button" onClick={() => setEditingMessage(null)} className="text-[10px] text-slate-400">Отмена</button><button type="button" onClick={() => void saveEdit(message.id)} className="text-[10px] font-semibold text-indigo-300">Сохранить</button></div></div>
                    ) : <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.text}</p>}
                    <div className="mt-2 flex items-center justify-between gap-4 text-[9px] text-slate-500">
                      <time>{new Date(message.createdAt).toLocaleString()}</time>
                      <span className="flex items-center gap-1">{message.edited && <span>изменено</span>}{own && <><button type="button" onClick={() => { setEditingMessage(message.id); setEditDraft(message.text); }} aria-label="Редактировать" className="rounded p-1 hover:bg-white/10 hover:text-white"><span className="sr-only">Редактировать</span>✎</button><button type="button" onClick={() => void deleteMessage(message)} aria-label="Удалить" className="rounded p-1 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 size={12} /></button></>}</span>
                    </div>
                    {!!message.reactions.length && <div className="mt-2 flex flex-wrap gap-1">{REACTIONS.map((emoji) => { const count = message.reactions.filter((reaction) => reaction.emoji === emoji).length; return count ? <button key={emoji} type="button" onClick={() => void toggleReaction(message, emoji)} className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-xs">{emoji} {count}</button> : null; })}</div>}
                    <div className="mt-1 flex gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">{REACTIONS.map((emoji) => <button key={emoji} type="button" onClick={() => void toggleReaction(message, emoji)} aria-label={`Поставить реакцию ${emoji}`} className="rounded-md p-1 text-[11px] hover:bg-white/10"><SmilePlus size={12} className="inline" /> {emoji}</button>)}</div>
                  </article>
                );
              })}
            </div>

            <form onSubmit={(event) => void sendMessage(event)} className="flex items-end gap-2 border-t border-white/[0.08] bg-[#0d1420] p-3 sm:px-5">
              <div className="hidden max-w-[30%] gap-1 overflow-hidden sm:flex">{activeGroup.members.slice(0, 3).map((member) => <button key={member.userId} type="button" onClick={() => setDraft((value) => `${value}${value && !value.endsWith(' ') ? ' ' : ''}@${member.username} `)} className="truncate rounded-full bg-white/[0.04] px-2 py-1 text-[9px] text-slate-500 hover:text-indigo-300">@{member.username}</button>)}</div>
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={1} maxLength={4000} placeholder="Сообщение группе… Используйте @username для упоминания" className="max-h-32 min-h-11 min-w-0 flex-1 resize-y rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm outline-none transition focus:border-indigo-400/40" onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
              <button type="submit" disabled={!draft.trim()} aria-label="Отправить сообщение" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-indigo-500 text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"><Send size={17} /></button>
            </form>
          </>
        ) : <div className="grid flex-1 place-items-center text-center text-sm text-slate-500"><div><Users size={28} className="mx-auto mb-3 text-slate-600" />Выберите группу или создайте новую.</div></div>}
      </section>
    </main>
  );
}
