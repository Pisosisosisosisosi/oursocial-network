import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Radio, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, type Contact } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { formatAppDateTime } from '../../time';

interface GroupItem {
  id: string;
  title: string;
  memberCount: number;
  lastMessageAt?: string | null;
}
interface ChannelItem {
  id: string;
  title: string;
  description: string;
  avatarUrl?: string;
  memberCount: number;
  isSubscribed: boolean;
  visibility: 'public' | 'private';
  lastMessageAt?: string | null;
}
type Entry =
  | { kind: 'chat'; id: string; title: string; subtitle: string; time?: string | null; contact: Contact }
  | { kind: 'group'; id: string; title: string; subtitle: string; time?: string | null }
  | { kind: 'channel'; id: string; title: string; subtitle: string; time?: string | null; channel: ChannelItem };

interface UnifiedWorkspaceListProps {
  search: string;
  activeKind: 'group' | 'channel';
  activeId: string | null;
  includeDiscover?: boolean;
}

export default function UnifiedWorkspaceList({ search, activeKind, activeId, includeDiscover = false }: UnifiedWorkspaceListProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let current = true;
    setLoading(true);
    void Promise.allSettled([
      api.get<Contact[]>('/contacts'),
      api.get<GroupItem[]>('/groups'),
      api.get<ChannelItem[]>('/channels'),
    ]).then(([contactsResult, groupsResult, channelsResult]) => {
      if (!current) return;
      if (contactsResult.status === 'fulfilled') {
        setContacts(contactsResult.value.data.filter((contact) => contact.id !== user?.id && !contact.chatHidden));
      }
      if (groupsResult.status === 'fulfilled') setGroups(groupsResult.value.data);
      if (channelsResult.status === 'fulfilled') {
        setChannels(channelsResult.value.data.filter((channel) => channel.isSubscribed || (includeDiscover && channel.visibility === 'public')));
      }
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [user?.id, includeDiscover]);

  const entries = useMemo<Entry[]>(() => {
    const query = search.trim().toLocaleLowerCase();
    const chats: Entry[] = contacts.map((contact) => ({
      kind: 'chat',
      id: String(contact.id),
      title: contact.nickname || contact.displayName || contact.username,
      subtitle: contact.lastMessageType && contact.lastMessageType !== 'text'
        ? `📎 ${contact.lastMessageFileName || 'Вложение'}`
        : contact.lastMessageText?.startsWith('skyline-e2e:') ? 'Сообщение' : contact.lastMessageText || contact.displayName || `@${contact.username}`,
      time: contact.lastMessageAt,
      contact,
    }));
    const groupEntries: Entry[] = groups.map((group) => ({
      kind: 'group', id: group.id, title: group.title,
      subtitle: `${group.memberCount} участников`, time: group.lastMessageAt,
    }));
    const channelEntries: Entry[] = channels.map((channel) => ({
      kind: 'channel', id: channel.id, title: channel.title,
      subtitle: `${channel.memberCount} подписчиков · ${channel.description || 'Канал Skyline'}`,
      time: channel.lastMessageAt, channel,
    }));
    return [...chats, ...groupEntries, ...channelEntries]
      .filter((entry) => !query || `${entry.title} ${entry.subtitle}`.toLocaleLowerCase().includes(query))
      .sort((a, b) => (Date.parse(b.time || '') || 0) - (Date.parse(a.time || '') || 0));
  }, [contacts, groups, channels, search]);

  if (loading) return <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3" role="status" aria-label="Загрузка переписок">{[0, 1, 2, 3].map((item) => <div key={item} className="chat-skeleton h-14 rounded-xl" />)}</div>;
  if (!entries.length) return <div className="m-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 text-center text-xs leading-5 text-slate-500">{search.trim() ? 'Ничего не найдено.' : 'Здесь появятся ваши личные чаты, группы и каналы.'}</div>;

  return (
    <div className="stagger min-h-0 flex-1 overflow-y-auto p-2" aria-label="Все переписки">
      {entries.map((entry) => {
        const active = entry.kind === activeKind && entry.id === activeId;
        return (
          <button
            key={`${entry.kind}:${entry.id}`}
            type="button"
            onClick={() => {
              if (entry.kind === 'chat') navigate('/chats?chat=' + encodeURIComponent(entry.id));
              else if (entry.kind === 'group') navigate('/groups?group=' + encodeURIComponent(entry.id));
              else navigate('/channels?channel=' + encodeURIComponent(entry.id));
            }}
            aria-current={active ? 'page' : undefined}
            className={`chat-card chat-list-item group mb-1 flex w-full items-center gap-3 rounded-2xl p-3 text-left ${active ? 'chat-active text-white' : 'text-slate-300'}`}
          >
            <span className={`grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl ${entry.kind === 'chat' ? 'bg-emerald-400/10 text-emerald-300' : entry.kind === 'group' ? 'bg-accent/15 text-accent' : 'bg-cyan-400/10 text-cyan-300'}`}>
              {entry.kind === 'chat' ? <MessageCircle size={18} /> : entry.kind === 'group' ? <Users size={18} /> : entry.channel.avatarUrl ? <img src={entry.channel.avatarUrl} alt="" className="h-full w-full object-cover" /> : <Radio size={18} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{entry.title}</span>
                {entry.time && <time className="shrink-0 text-[10px] text-slate-500">{formatAppDateTime(entry.time, { hour: '2-digit', minute: '2-digit' })}</time>}
              </span>
              <span className="mt-1 block truncate text-[11px] text-slate-500">{entry.subtitle}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
