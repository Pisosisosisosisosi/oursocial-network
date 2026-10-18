import { useState, useEffect, useMemo, useRef } from 'react';
import { Check, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { getSocket } from '../api/socket';
import { useAuth } from '../context/AuthContext';

export default function Chats() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const userString = localStorage.getItem('user');
  const currentUser = useMemo(() => userString ? JSON.parse(userString) : null, [userString]);

  const [users, setUsers] = useState<any[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(() => new Set());
  const [activeChat, setActiveChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const incomingTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingRecipientRef = useRef<string | null>(null);

  const stopTyping = (recipientId = typingRecipientRef.current) => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    if (recipientId && typingRecipientRef.current === recipientId) {
      getSocket()?.emit('typing', { recipientId, isTyping: false });
      typingRecipientRef.current = null;
    }
  };

  useEffect(() => {
    async function loadUsers() {
      try {
        const res = await api.get('/users/search', { params: { q: '' } });
        const filtered = res.data.filter((u: any) => u.id !== currentUser?.id);
        setUsers(filtered);
      } catch (e) {
        console.error("Ошибка загрузки пользователей:", e);
      } finally {
        setLoading(false);
      }
    }
    loadUsers();
  }, [currentUser]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handlePresenceSnapshot = (presence: { userIds: string[] }) => {
      setOnlineUsers(new Set((presence.userIds || []).map(String)));
    };
    const handleUserOnline = (presence: { userId: string }) => {
      setOnlineUsers((current) => new Set(current).add(String(presence.userId)));
    };
    const handleUserOffline = (presence: { userId: string }) => {
      setOnlineUsers((current) => {
        const next = new Set(current);
        next.delete(String(presence.userId));
        return next;
      });
    };
    const requestPresence = () => socket.emit('get_presence');
    const handleDisconnect = () => setOnlineUsers(new Set());

    socket.on('presence_snapshot', handlePresenceSnapshot);
    socket.on('user_online', handleUserOnline);
    socket.on('user_offline', handleUserOffline);
    socket.on('connect', requestPresence);
    socket.on('disconnect', handleDisconnect);
    requestPresence();

    return () => {
      socket.off('presence_snapshot', handlePresenceSnapshot);
      socket.off('user_online', handleUserOnline);
      socket.off('user_offline', handleUserOffline);
      socket.off('connect', requestPresence);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  useEffect(() => {
    if (incomingTypingTimeoutRef.current) {
      clearTimeout(incomingTypingTimeoutRef.current);
      incomingTypingTimeoutRef.current = null;
    }

    if (!activeChat) return;

    const socket = getSocket();
    if (!socket) return;

    const handleUserTyping = (presence: { userId: string; username?: string; isTyping: boolean }) => {
      if (String(presence.userId) !== String(activeChat.id)) return;

      if (incomingTypingTimeoutRef.current) {
        clearTimeout(incomingTypingTimeoutRef.current);
        incomingTypingTimeoutRef.current = null;
      }

      if (presence.isTyping) {
        setTypingUser(presence.username || activeChat.username || 'Пользователь');
        incomingTypingTimeoutRef.current = setTimeout(() => setTypingUser(null), 2500);
      } else {
        setTypingUser(null);
      }
    };

    socket.on('user_typing', handleUserTyping);
    return () => {
      socket.off('user_typing', handleUserTyping);
      if (incomingTypingTimeoutRef.current) {
        clearTimeout(incomingTypingTimeoutRef.current);
        incomingTypingTimeoutRef.current = null;
      }
    };
  }, [activeChat]);

  useEffect(() => () => {
    stopTyping();
    if (incomingTypingTimeoutRef.current) {
      clearTimeout(incomingTypingTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectChat = async (user: any) => {
    stopTyping();
    setTypingUser(null);
    setActiveChat(user);
    setMessages([]);
    try {
      const res = await api.get(`/messages/${user.id}`);
      setMessages(res.data);
    } catch (e) {
      console.error("Ошибка загрузки истории:", e);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !activeChat) return;

    const msgText = text;
    stopTyping(String(activeChat.id));
    setText(''); 

    try {
      await api.post('/messages', {
        receiverId: activeChat.id,
        text: msgText
      });

      const newMsg = {
        id: Date.now().toString(),
        text: msgText,
        senderId: currentUser?.id,
        createdAt: new Date().toISOString()
      };
      setMessages(prev => [...prev, newMsg]);
    } catch (err) {
      console.error("Ошибка отправки:", err);
      alert("Не удалось отправить сообщение. Проверьте интернет.");
    }
  };

  const handleTextChange = (value: string) => {
    setText(value);
    if (!activeChat) return;

    const recipientId = String(activeChat.id);
    if (!value.trim()) {
      stopTyping(recipientId);
      return;
    }

    const socket = getSocket();
    if (!socket) return;

    if (typingRecipientRef.current !== recipientId) {
      stopTyping();
      socket.emit('typing', { recipientId, isTyping: true });
      typingRecipientRef.current = recipientId;
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => stopTyping(recipientId), 1500);
  };

  const filteredUsers = users.filter(u => 
    (u.displayName || u.username).toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-full w-full bg-[#090d16] text-slate-100 font-sans absolute top-0 left-0 overflow-hidden selection:bg-indigo-500/30">
      
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { font-family: 'Inter', sans-serif; }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(99, 102, 241, 0.3); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(16, 185, 129, 0.6); }
        @keyframes slideIn { from { opacity: 0; transform: translateY(15px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-5px); } }
        .animate-slide-in { animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .glass-panel { background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.05); }
        .glass-active { background: linear-gradient(90deg, rgba(99, 102, 241, 0.15) 0%, rgba(99, 102, 241, 0.05) 100%); border-left: 3px solid #6366f1; }
      `}</style>

      {/* 1. ЛЕВАЯ КОЛОНКА */}
      <div className="w-[340px] flex flex-col glass-panel border-r border-slate-800/60 h-full z-10 relative">
        <div className="p-5 flex items-center justify-between border-b border-slate-800/50">
          <div className="flex items-center gap-3 group cursor-pointer" onClick={() => navigate('/profile')}>
             <div className="relative">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-emerald-400 flex items-center justify-center font-bold text-slate-950 text-lg shadow-lg group-hover:scale-105 transition-transform duration-300">
                   {currentUser?.username?.[0]?.toUpperCase() || 'U'}
                </div>
                <span className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-[#0f172a] ${onlineUsers.has(String(currentUser?.id)) ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-slate-600'}`}></span>
             </div>
             <div>
                <span className="font-bold text-sm truncate block text-slate-100 group-hover:text-indigo-300 transition-colors">{currentUser?.displayName || currentUser?.username || 'Пользователь'}</span>
                <span className={`text-[10px] font-mono tracking-wider ${onlineUsers.has(String(currentUser?.id)) ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {onlineUsers.has(String(currentUser?.id)) ? 'В сети' : 'Не в сети'}
                </span>
             </div>
          </div>
          <button onClick={() => { logout(); navigate('/login'); }} className="p-2 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all" title="Выйти">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
          </button>
        </div>

        <div className="p-3">
          <div className="relative group">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input 
              type="text" 
              placeholder="Поиск пользователей..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-700/50 rounded-2xl pl-9 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:bg-slate-900/80 transition-all shadow-inner"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 px-2 flex justify-between">
            <span>Все узлы ({filteredUsers.length})</span>
            <span className="text-[10px] normal-case tracking-normal text-slate-600">
              {onlineUsers.size} в сети
            </span>
          </h3>
          
          {loading && <p className="text-xs text-slate-500 px-2 animate-pulse">Сканирование сети...</p>}
          
          {filteredUsers.map((user, idx) => (
            <div 
              key={user.id} 
              onClick={() => handleSelectChat(user)}
              className={`p-2.5 rounded-2xl cursor-pointer flex items-center gap-3 transition-all duration-200 ${
                activeChat?.id === user.id 
                  ? 'glass-active shadow-[0_0_15px_rgba(99,102,241,0.1)]' 
                  : 'hover:bg-slate-800/40 border-l-3 border-transparent'
              }`}
              style={{ animationDelay: `${idx * 30}ms` }}
            >
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-sm font-bold text-slate-300">
                  {user.username?.[0]?.toUpperCase()}
                </div>
                <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0f172a] ${onlineUsers.has(String(user.id)) ? 'bg-emerald-500' : 'bg-slate-600'}`}></span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-slate-200 truncate">{user.displayName || user.username}</div>
                <div className="text-[10px] text-slate-500 truncate font-mono">@{user.username}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. ЦЕНТРАЛЬНАЯ КОЛОНКА */}
      <div className="flex-1 flex flex-col bg-[#090d16] h-full relative z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/10 via-[#090d16] to-black pointer-events-none"></div>

        {activeChat ? (
          <>
            <div className="p-4 border-b border-slate-800/60 glass-panel flex items-center justify-between relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center font-bold text-slate-200 border border-slate-600/50">
                  {activeChat.username?.[0]?.toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                    {activeChat.displayName || activeChat.username}
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">Pulse</span>
                  </h3>
                  <p className={`text-[10px] flex items-center gap-1 ${onlineUsers.has(String(activeChat.id)) ? 'text-emerald-400' : 'text-slate-500'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${onlineUsers.has(String(activeChat.id)) ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
                    {onlineUsers.has(String(activeChat.id)) ? 'В сети' : 'Не в сети'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 p-6 space-y-4 overflow-y-auto custom-scrollbar relative z-10">
              <div className="text-center text-slate-600 text-[10px] font-mono my-4 flex items-center justify-center gap-2">
                <span className="h-px w-8 bg-slate-800"></span> Начало защищенной сессии <span className="h-px w-8 bg-slate-800"></span>
              </div>
              
              {messages.map((m: any) => {
                const isMe = m.senderId === currentUser?.id;
                return (
                  <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-slide-in`}>
                    <div className={`max-w-[70%] p-3.5 rounded-2xl text-xs leading-relaxed relative group ${
                      isMe 
                        ? 'bg-gradient-to-br from-indigo-600 to-indigo-800 text-white rounded-br-none shadow-[0_4px_20px_rgba(79,70,229,0.3)] border border-indigo-500/30' 
                        : 'bg-slate-800/80 text-slate-200 rounded-bl-none border border-slate-700/50 shadow-lg'
                    }`}>
                      {m.text}
                      <div className={`mt-1.5 flex items-center justify-end gap-1 text-[9px] font-mono ${isMe ? 'text-indigo-200/70' : 'text-slate-400/70'}`}>
                        <time>
                          {m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </time>
                        {isMe && (
                          m.read === true
                            ? <CheckCheck size={13} aria-label="Прочитано" className="text-sky-300" />
                            : <Check size={13} aria-label="Отправлено" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 relative z-10">
              {typingUser && (
                <div role="status" className="mb-2 flex items-center gap-2 px-2 text-xs text-slate-400">
                  <span className="flex gap-1" aria-hidden="true">
                    <span className="h-1 w-1 animate-bounce rounded-full bg-indigo-400" />
                    <span className="h-1 w-1 animate-bounce rounded-full bg-indigo-400 [animation-delay:120ms]" />
                    <span className="h-1 w-1 animate-bounce rounded-full bg-indigo-400 [animation-delay:240ms]" />
                  </span>
                  <span>{typingUser} печатает...</span>
                </div>
              )}
              <form onSubmit={handleSend} className="glass-panel p-2 rounded-2xl flex items-center gap-2 shadow-2xl focus-within:ring-2 focus-within:ring-indigo-500/30 transition-all">
                 <button type="button" className="p-2.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-all">
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                 </button>
                 <input 
                    value={text}
                    onChange={e => handleTextChange(e.target.value)}
                    placeholder="Введите сообщение..."
                    className="flex-1 bg-transparent px-2 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
                 />
                 <button type="submit" className="p-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-emerald-400 text-slate-950 hover:opacity-90 transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.6)]">
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                 </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 relative z-10">
             <div className="w-24 h-24 mb-6 rounded-full bg-slate-800/30 flex items-center justify-center border border-slate-700/30 animate-float">
               <svg className="w-10 h-10 text-indigo-500/50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
             </div>
             <p className="text-sm font-medium text-slate-400">Выберите пользователя</p>
             <p className="text-xs text-slate-600 mt-1">чтобы начать общение</p>
          </div>
        )}
      </div>
    </div>
  );
}