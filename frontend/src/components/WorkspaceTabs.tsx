import { MessageCircle, Radio, UsersRound } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

const tabs = [
  { id: 'chats', label: 'Чаты', path: '/', icon: MessageCircle },
  { id: 'groups', label: 'Группы', path: '/groups', icon: UsersRound },
  { id: 'channels', label: 'Каналы', path: '/channels', icon: Radio },
] as const;

export default function WorkspaceTabs() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = location.pathname.startsWith('/groups')
    ? 'groups'
    : location.pathname.startsWith('/channels')
      ? 'channels'
      : 'chats';

  return (
    <nav aria-label="Разделы Pulse" className="flex shrink-0 items-center gap-1 border-b border-white/[0.08] bg-[#0d1420] px-2 py-2 sm:gap-2 sm:px-3">
      {tabs.map(({ id, label, path, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => navigate(path)}
          aria-current={activeTab === id ? 'page' : undefined}
          className={`flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-[11px] font-semibold transition sm:gap-2 sm:px-3 sm:text-xs ${activeTab === id ? 'bg-indigo-500/15 text-indigo-200 shadow-inner shadow-indigo-400/5' : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-200'}`}
        >
          <Icon size={15} className="shrink-0" />
          <span className="truncate">{label}</span>
        </button>
      ))}
    </nav>
  );
}
