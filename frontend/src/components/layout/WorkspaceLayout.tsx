import { useState } from 'react';
import { Plus, Radio, Users } from 'lucide-react';
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import WorkspaceSidebarHeader from './WorkspaceSidebarHeader';
import WorkspaceTabs from './WorkspaceTabs';
import UnifiedWorkspaceList from './UnifiedWorkspaceList';

export default function WorkspaceLayout() {
  const [search, setSearch] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isGroup = location.pathname.startsWith('/groups');
  const isChannel = location.pathname.startsWith('/channels');
  const activeKind = isGroup ? 'group' : isChannel ? 'channel' : 'chat';
  const activeId = isGroup ? params.get('group') : isChannel ? params.get('channel') : params.get('chat');
  const showDiscover = params.get('discover') === '1';
  return (
    <main className="flex h-full min-h-0 w-full overflow-hidden bg-bg-base text-t-primary">
      <aside className={`${activeId ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-r border-white/[0.08] bg-panel md:w-[340px]`}>
        <WorkspaceSidebarHeader searchValue={search} onSearchChange={setSearch} searchPlaceholder="Поиск чатов, групп и каналов" />
        <div className="border-b border-white/[0.06] px-3 py-2"><WorkspaceTabs /></div>
        <div className="flex items-center gap-1 border-b border-white/[0.06] px-3 py-2">
          <button type="button" onClick={() => navigate('/groups?create=1')} className="flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-[11px] font-medium text-t-secondary hover:bg-white/[0.05] hover:text-accent"><Users size={14} /> Создать группу</button>
          <button type="button" onClick={() => navigate('/channels?create=1')} className="flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-[11px] font-medium text-t-secondary hover:bg-white/[0.05] hover:text-accent"><Plus size={14} /> Создать канал</button>
        </div>
        <div className="flex items-center justify-between px-4 pb-1 pt-3"><span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Все переписки</span>
          <button type="button" onClick={() => navigate(showDiscover ? '/channels' : '/channels?discover=1')} className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-accent"><Radio size={12} /> {showDiscover ? 'Мои каналы' : 'Найти каналы'}</button></div>
        <UnifiedWorkspaceList search={search} activeKind={activeKind} activeId={activeId} includeDiscover={showDiscover} />
      </aside><section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"><Outlet /></section>
    </main>
  );
}
