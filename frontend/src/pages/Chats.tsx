import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export default function Chats() {
  const navigate = useNavigate();
  
  // Берем текущего пользователя из localStorage
  const userString = localStorage.getItem('user');
  const currentUser = userString ? JSON.parse(userString) : null;

  // Список пользователей (они же будут нашими "чатами")
  const [users, setUsers] = useState<any[]>([]);
  const [activeChat, setActiveChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);

  // Загружаем список ВСЕХ пользователей из базы (через поиск с пустой строкой)
  useEffect(() => {
    async function loadUsers() {
      try {
        // Ищем всех пользователей (пустая строка вернет всех, кого найдет)
        const res = await api.get('/users/search', { params: { q: '' } });
        
        // Фильтруем самого себя из списка
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

  // Выбор пользователя для "чата"
  const handleSelectChat = (user: any) => {
    setActiveChat(user);
    // Так как базы сообщений пока нет, имитируем пустую переписку
    setMessages([]); 
  };

  // Отправка сообщения (пока просто добавляем в локальный стейт)
  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !activeChat) return;

    const newMsg = {
      id: Date.now(),
      text: text,
      senderId: currentUser?.id,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, newMsg]);
    setText('');
  };

  return (
    <div className="flex h-full w-full bg-[#090d16] text-slate-100 font-sans absolute top-0 left-0">
      
      {/* 1. ЛЕВАЯ КОЛОНКА (Список пользователей) */}
      <div className="w-80 flex flex-col bg-[#0f172a]/90 border-r border-slate-800 h-full">
        <div className="p-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center font-bold">
                {currentUser?.username?.[0]?.toUpperCase() || 'U'}
             </div>
             <span className="font-bold text-sm truncate">{currentUser?.displayName || currentUser?.username || 'Пользователь'}</span>
          </div>
          <button onClick={() => { localStorage.clear(); navigate('/login'); }} className="text-xs text-rose-400 hover:text-rose-300">Выйти</button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          <div>
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Пользователи ({users.length})</h3>
            {loading && <p className="text-xs text-slate-500">Загрузка...</p>}
            {!loading && users.length === 0 && <p className="text-xs text-slate-500">Нет других пользователей</p>}
            
            {users.map(user => (
              <div 
                key={user.id} 
                onClick={() => handleSelectChat(user)}
                className={`p-2 rounded-xl cursor-pointer mb-1 flex items-center gap-2 ${activeChat?.id === user.id ? 'bg-indigo-500/20' : 'hover:bg-slate-800/50'}`}
              >
                <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center text-xs">
                  {user.username?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 truncate">
                  <div className="text-xs font-bold">{user.displayName || user.username}</div>
                  <div className="text-[10px] text-slate-400 truncate">@{user.username}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 2. ЦЕНТРАЛЬНАЯ КОЛОНКА (Окно переписки) */}
      <div className="flex-1 flex flex-col bg-[#090d16] h-full relative">
        {activeChat ? (
          <>
            <div className="p-4 border-b border-slate-800 bg-[#0f172a]/50 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center font-bold">
                {activeChat.username?.[0]?.toUpperCase()}
              </div>
              <div>
                <h3 className="font-bold text-sm">{activeChat.displayName || activeChat.username}</h3>
                <p className="text-[10px] text-slate-400">@{activeChat.username}</p>
              </div>
            </div>

            <div className="flex-1 p-6 space-y-4 overflow-y-auto">
              {messages.length === 0 && (
                <div className="text-center text-slate-500 text-xs mt-10">
                  Сообщений пока нет. Напишите первым!
                </div>
              )}
              {messages.map((m: any) => {
                const isMe = m.senderId === currentUser?.id;
                return (
                  <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-md p-3 rounded-2xl text-xs ${isMe ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-slate-800 text-slate-200 rounded-bl-none'}`}>
                      {m.text}
                    </div>
                  </div>
                );
              })}
            </div>

            <form onSubmit={handleSend} className="p-4 border-t border-slate-800 bg-[#0f172a]/50 flex gap-2">
               <input 
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="Сообщение..."
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
               />
               <button type="submit" className="bg-indigo-600 px-4 py-2 rounded-xl text-xs font-bold text-white hover:bg-indigo-500">Отправить</button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
             <div className="text-6xl mb-4">💬</div>
             <p className="text-sm">Выберите пользователя, чтобы начать общение</p>
          </div>
        )}
      </div>

    </div>
  );
}