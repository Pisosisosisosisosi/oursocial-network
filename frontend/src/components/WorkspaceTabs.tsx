import { useCallback, useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Hash, MessagesSquare, Users } from 'lucide-react';
import { api } from '../api/client';
import { getSocket } from '../api/socket';

const tabs = [
  { id: 'chats', to: '/chats', label: 'Чаты', Icon: MessagesSquare },
  { id: 'groups', to: '/groups', label: 'Группы', Icon: Users },
  { id: 'channels', to: '/channels', label: 'Каналы', Icon: Hash },
] as const;

interface UnreadCounts {
  chats: number;
  groups: number;
  channels: number;
}

export default function WorkspaceTabs() {
  const location = useLocation();
  const [counts, setCounts] = useState<UnreadCounts>({ chats: 0, groups: 0, channels: 0 });

  const load = useCallback(() => {
    api.get<UnreadCounts>('/unread/summary')
      .then((res) => setCounts(res.data))
      .catch(() => undefined);
  }, []);

  useEffect(load, [load]);
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    socket.on('message_changed', load);
    return () => { socket.off('message_changed', load); };
  }, [load]);
  useEffect(() => {
    const timer = window.setTimeout(load, 350);
    return () => window.clearTimeout(timer);
  }, [location.pathname, load]);

  const activeId = tabs.find((t) => location.pathname.startsWith(t.to))?.id;

  return (
    <nav className="flex gap-1 rounded-2xl border border-white/[0.06] bg-slate-950/40 p-1">
      {tabs.map(({ id, to, label, Icon }) => {
        const value = counts[id];
        return (
          <NavLink
            key={id}
            to={to}
            className={({ isActive }) =>
              `flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition-all duration-200 ${
                isActive ? 'glass-active text-t-primary shadow-lg' : 'text-t-secondary hover:bg-white/5 hover:text-t-primary'
              }`
            }
          >
            <Icon size={15} />
            <span>{label}</span>
            {value > 0 && activeId !== id && (
              <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                {value > 99 ? '99+' : value}
              </span>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
