import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { getSocket } from '../api/socket';

export default function Chats() {
  const navigate = useNavigate();
  const [chats, setChats] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [activeChat, setActiveChat] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  
  const userString = localStorage.getItem('user');
  const currentUser = userString ? JSON.parse(userString) : null;

  useEffect(() => {
    async function loadData() {
      try {
        const chatsRes = await api.get('/chats');
        setChats(chatsRes.data || []);
        
        const usersRes = await api.get('/users');
        setUsers(usersRes.data || []);
      } catch (e) {
        console.error("Ошибка загрузки:", e);
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.on('receive_message', (msg: any) => {
      setMessages(prev => [...prev, msg]);
    });

    return () => {
      socket.off('receive_message');
    };
  }, []);

  const handleSelectChat = async (chat: any) => {
    setActiveChat(chat);
    try {
      const res = await api.get(`/messages/${chat.id}`);
      setMessages(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !activeChat) return;

    const socket = getSocket();
    if (socket) {
      socket.emit('send_message', {
        chatId: activeChat.id,
        text: text,
        senderId: currentUser?.id
      });
      setText('');
    }
  };

  return (
    <div className="flex h-full w-full bg-[#090d16] text-slate-100 font-sans absolute top-0 left-0">
      
      {/* 1. ЛЕВАЯ КОЛОНКА */}
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
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Мои чаты</h3>
            {chats.length === 0 && <p className="text-xs text-slate-500">Нет чатов</p>}
            {chats.map(chat => (
              <div 
                key={chat.id} 
                onClick={() => handleSelectChat(chat)}
                className={`p-2 rounded-xl cursor-pointer mb-1 flex items-center gap-2 ${activeChat?.id === chat.id ? 'bg-indigo-500/20' : 'hover:bg-slate-800/50'}`}
              >
                <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center text-xs">C</div>
                <div className="flex-1 truncate">
                  <div className="text-xs font-bold">{chat.name}</div>
                  <div className="text-[10px] text-slate-400 truncate">{chat.lastMessage || 'Нет сообщений'}</div>
                </div>
              </div>
            ))}
          </div>

          <div>
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Пользователи</h3>
            {users.length === 0 && <p className="text-xs text-slate-500">Загрузка...</p>}
            {users.map(u => (
              <div key={u.id} className="p-2 rounded-xl hover:bg-slate-800/50 cursor-pointer flex items-center gap-2">
                 <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center text-xs">{u.username?.[0]?.toUpperCase()}</div>
                 <div className="text-xs font-bold">{u.displayName || u.username}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 2. ЦЕНТРАЛЬНАЯ КОЛОНКА */}
      <div className="flex-1 flex flex-col bg-[#090d16] h-full relative">
        {activeChat ? (
          <>
            <div className="p-4 border-b border-slate-800 bg-[#0f172a]/50 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center font-bold">C</div>
              <div>
                <h3 className="font-bold text-sm">{activeChat.name}</h3>
                <p className="text-[10px] text-emerald-400">В сети</p>
              </div>
            </div>

            <div className="flex-1 p-6 space-y-4 overflow-y-auto">
              {messages.map((m: any, i) => {
                const isMe = m.senderId === currentUser?.id;
                return (
                  <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
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
             <p className="text-sm">Выберите чат или начните новый</p>
          </div>
        )}
      </div>

    </div>
  );
}