import { useState } from 'react';
import { ArrowUpRight, MessageSquarePlus, Pencil, Radio, Users } from 'lucide-react';
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import WorkspaceSidebarHeader from './WorkspaceSidebarHeader';
import UnifiedWorkspaceList from './UnifiedWorkspaceList';

export default function WorkspaceLayout() {
  const [search, setSearch] = useState('');
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isGroup = location.pathname.startsWith('/groups');
  const isChannel = location.pathname.startsWith('/channels');
  const activeKind = isGroup ? 'group' : isChannel ? 'channel' : 'chat';
  const activeId = isGroup ? params.get('group') || (params.get('discover') === '1' ? 'discover' : null) : isChannel ? params.get('channel') : params.get('chat') || params.get('user');
  const showDiscover = params.get('discover') === '1';
  return (
    <main className="flex h-full min-h-0 w-full overflow-hidden bg-bg-base text-t-primary">
      <aside className={`${activeId ? 'hidden md:flex' : 'flex'} relative w-full shrink-0 flex-col border-r border-white/[0.08] bg-panel md:w-[340px]`}>
        <WorkspaceSidebarHeader searchValue={search} onSearchChange={setSearch} searchPlaceholder="Поиск чатов, групп и каналов" />
        <div className="flex items-center justify-between px-4 pb-1 pt-3"><span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Все переписки</span>
          <button type="button" onClick={() => navigate(showDiscover ? '/channels' : '/channels?discover=1')} className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-accent"><Radio size={12} /> {showDiscover ? 'Мои каналы' : 'Найти каналы'}</button></div>
        <UnifiedWorkspaceList search={search} activeKind={activeKind} activeId={activeId} includeDiscover={showDiscover} />
        <div className="group absolute bottom-4 left-4 z-50">
          <button
            type="button"
            aria-label="Создать новую переписку"
            title="Создать"
            className="grid h-12 w-12 place-items-center rounded-full border border-white/15 bg-gradient-to-br from-accent to-sky-500 text-white shadow-lg shadow-accent/25 transition duration-200 hover:scale-105 hover:shadow-xl hover:shadow-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
          >
            <Pencil size={19} strokeWidth={2.2} />
          </button>
          <div className="pointer-events-none absolute bottom-0 left-14 w-[264px] translate-y-2 translate-x-1 opacity-0 transition-all duration-200 ease-out group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:translate-x-0 group-focus-within:opacity-100">
            <div className="overflow-hidden rounded-2xl border border-white/[0.12] bg-[#0e1726]/[0.98] p-2 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
              <div className="px-3 pb-2.5 pt-2">
                <p className="text-sm font-semibold tracking-tight text-white">Создать новое</p>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-400">С чего начнём?</p>
              </div>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => navigate('/groups?create=1')}
                  className="group/item flex w-full items-center gap-3 rounded-xl border border-transparent p-2.5 text-left transition duration-150 hover:border-accent/20 hover:bg-accent/[0.09] focus-visible:border-accent/30 focus-visible:bg-accent/[0.09] focus-visible:outline-none"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent transition group-hover/item:bg-accent/20">
                    <Users size={19} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-slate-100">Новая группа</span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-slate-400">Общайтесь вместе с друзьями</span>
                  </span>
                  <ArrowUpRight size={15} className="shrink-0 text-slate-500 transition group-hover/item:-translate-y-0.5 group-hover/item:translate-x-0.5 group-hover/item:text-accent" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/channels?create=1')}
                  className="group/item flex w-full items-center gap-3 rounded-xl border border-transparent p-2.5 text-left transition duration-150 hover:border-cyan-300/20 hover:bg-cyan-300/[0.07] focus-visible:border-cyan-300/30 focus-visible:bg-cyan-300/[0.07] focus-visible:outline-none"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-300/10 text-cyan-300 transition group-hover/item:bg-cyan-300/15">
                    <Radio size={19} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-slate-100">Новый канал</span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-slate-400">Делитесь новостями и постами</span>
                  </span>
                  <ArrowUpRight size={15} className="shrink-0 text-slate-500 transition group-hover/item:-translate-y-0.5 group-hover/item:translate-x-0.5 group-hover/item:text-cyan-300" />
                </button>
              </div>
              <div className="mx-2 mt-2 border-t border-white/[0.08] pt-2">
                <p className="px-1 pb-1 text-[10px] text-slate-500"><MessageSquarePlus size={12} className="mr-1 inline-block -translate-y-px" /> Новое пространство для общения</p>
              </div>
            </div>
          </div>
        </div>
      </aside><section className={`${activeId ? 'flex' : 'hidden md:flex'} min-h-0 min-w-0 flex-1 flex-col overflow-hidden`}>{activeId ? <Outlet /> : <div className="hidden flex-1 flex-col items-center justify-center text-center text-slate-500 md:flex"><div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03]"><Radio size={26} className="text-accent/60" /></div><p className="text-sm font-medium text-t-secondary">Выберите чат</p><p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">Откройте переписку из списка слева, чтобы прочитать сообщения и ответить.</p></div>}</section>
    </main>
  );
}
