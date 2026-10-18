import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { getSocket } from '../api/socket';
import { decryptMessage } from '../crypto/encrypt';
import MessageList, { type Message } from '../components/MessageList';
import MessageInput from '../components/MessageInput';

interface User {
  id: string;
  username: string;
}

interface Chat {
  _id: string;
  title?: string;
  type?: string;
  participants: string[];
  lastMessage?: {
    encryptedText?: string;
  };
}

export default function Chats() {
  const { user, logout } = useAuth();
  
  const [chats, setChats] = useState<Chat[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeChatName, setActiveChatName] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [recipientId, setRecipientId] = useState<string>('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [moderationEnabled, setModerationEnabled] = useState(true);

  const token = localStorage.getItem('token');
  const NODE_API = 'https://oursocial-network-production.up.railway.app';
  const PYTHON_API = 'https://oursocial-python.onrender.com';

  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      try {
        const [chatsRes, usersRes] = await Promise.all([
          axios.get(`${NODE_API}/api/chats`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${PYTHON_API}/users/search?q=`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] }))
        ]);

        setChats(Array.isArray(chatsRes.data) ? chatsRes.data : (chatsRes.data.chats || []));
        
        const allUsers = Array.isArray(usersRes.data) ? usersRes.data : (usersRes.data.users || []);
        setUsers(allUsers.filter((u: User) => u.id !== user.id));
      } catch (err) {
        console.error('Ошибка загрузки данных:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user, token]);

  useEffect(() => {
    if (!activeChatId || !user) return;

    const loadHistory = async () => {
      try {
        setLoadingMessages(true);
        const res = await axios.get(`${NODE_API}/api/chats/${activeChatId}/messages`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        let history = res.data.messages || res.data || [];
        if (!Array.isArray(history)) history = [];

        const decryptedHistory = await Promise.all(
          history.map(async (msg: any) => {
            let decrypted = '[Зашифровано]';
            try {
              if (typeof msg.encryptedText === 'string') decrypted = await decryptMessage(msg.encryptedText);
            } catch (err) {}
            return { ...msg, encryptedText: decrypted };
          })
        );

        setMessages(decryptedHistory);
      } catch (err) {
        console.error('Ошибка загрузки истории:', err);
      } finally {
        setLoadingMessages(false);
      }
    };

    loadHistory();

    const socket = getSocket();
    if (socket) {
      socket.emit('join_chat', { chatId: activeChatId });
      
      const handleReceive = async (msg: Message) => {
        if (msg.chatId !== activeChatId) return;
        let decrypted = '[Зашифровано]';
        try { decrypted = await decryptMessage(msg.encryptedText); } catch (err) {}
        const decryptedMsg = { ...msg, encryptedText: decrypted };
        setMessages((prev) => {
          if (msg._id && prev.some((m) => m._id === msg._id)) return prev;
          return [...prev, decryptedMsg];
        });
      };
      
      socket.on('receive_message', handleReceive);

      return () => {
        socket.emit('leave_chat', { chatId: activeChatId });
        socket.off('receive_message', handleReceive);
      };
    }
  }, [activeChatId, user, token]);

  const startDirectChat = async (targetUser: User) => {
    if (!user) return;
    try {
      const res = await axios.post(`${NODE_API}/api/chats`, {
        type: 'direct',
        participantId: targetUser.id
      }, { headers: { Authorization: `Bearer ${token}` } });

      const newChatId = res.data.chat?._id || res.data._id || res.data.chatId;
      if (newChatId) {
        setActiveChatId(newChatId);
        setActiveChatName(targetUser.username);
        setRecipientId(targetUser.id);
      }
    } catch (err) {
      console.error(err);
      alert('Ошибка при создании чата');
    }
  };

  const openChat = (chat: Chat) => {
    setActiveChatId(chat._id);
    const otherId = chat.participants?.find((id: string) => id !== user?.id);
    const otherUser = users.find(u => u.id === otherId);
    setActiveChatName(chat.type === 'group' ? (chat.title || 'Группа') : (otherUser?.username || 'Чат'));
    if (otherId) setRecipientId(otherId);
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedUsers.length === 0) return alert('Введите название и выберите участников');
    setCreating(true);
    try {
      const res = await axios.post(`${NODE_API}/api/chats`, {
        type: 'group',
        title: groupName,
        participantIds: selectedUsers
      }, { headers: { Authorization: `Bearer ${token}` } });

      const newChatId = res.data.chat?._id || res.data._id || res.data.chatId;
      if (newChatId) {
        setIsModalOpen(false);
        setActiveChatId(newChatId);
        setActiveChatName(groupName);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const handleSaveSettings = () => {
    localStorage.setItem('moderationEnabled', String(moderationEnabled));
    setIsSettingsOpen(false);
    alert('Настройки сохранены!');
  };

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      
      {/* ЛЕВАЯ ПАНЕЛЬ (СПИСОК ЧАТОВ) */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        
        {/* ШАПКА ЛЕВОЙ ПАНЕЛИ */}
        <header className="p-4 border-b flex justify-between items-center bg-gray-50">
          <div className="flex items-center gap-3">
            {/* Кнопка создания группы (кружок с карандашом) */}
            <button 
              onClick={() => setIsModalOpen(true)} 
              className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center hover:bg-blue-200 transition"
              title="Создать группу"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
            </button>
            <span className="font-bold text-lg">{user?.username}</span>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Кнопка настроек (SVG шестеренка) */}
            <button onClick={() => setIsSettingsOpen(true)} className="text-gray-500 hover:text-black p-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            {/* Аватарка пользователя (просто для красоты) */}
            <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-sm">
              {user?.username?.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* СПИСОК ЧАТОВ */}
          <div className="p-2">
            <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">Мои чаты</h3>
            {loading ? (
              <p className="text-xs text-gray-400">Загрузка...</p>
            ) : chats.length === 0 ? (
              <p className="text-xs text-gray-400">Нет чатов</p>
            ) : (
              chats.map(chat => (
                <div 
                  key={chat._id} 
                  onClick={() => openChat(chat)}
                  className={`p-3 rounded-lg cursor-pointer mb-1 ${activeChatId === chat._id ? 'bg-blue-100' : 'hover:bg-gray-100'}`}
                >
                  <p className="font-semibold text-sm">
                    {chat.type === 'group' ? `👥 ${chat.title}` : `Чат: ${chat._id.slice(-4)}`}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {chat.lastMessage?.encryptedText || 'Нет сообщений'}
                  </p>
                </div>
              ))
            )}
          </div>

          {/* СПИСОК ПОЛЬЗОВАТЕЛЕЙ */}
          <div className="p-2">
            <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">Пользователи</h3>
            {users.map(u => (
              <div 
                key={u.id} 
                onClick={() => startDirectChat(u)}
                className="flex items-center gap-2 p-2 hover:bg-gray-100 cursor-pointer rounded-lg mb-1 transition"
              >
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs uppercase">
                  {u.username.charAt(0)}
                </div>
                <span className="text-sm font-medium">{u.username}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ПРАВАЯ ПАНЕЛЬ (ЧАТ) */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {activeChatId ? (
          <>
            <header className="p-4 bg-white border-b flex items-center gap-3 shadow-sm z-10">
              <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-lg">
                {activeChatName.charAt(0).toUpperCase()}
              </div>
              <h2 className="font-bold text-lg">{activeChatName}</h2>
            </header>
            
            <div className="flex-1 overflow-y-auto p-4 flex flex-col">
              {loadingMessages ? (
                <div className="text-center text-gray-400 mt-4">Загрузка...</div>
              ) : (
                <MessageList messages={messages} currentUserId={user?.id || ''} />
              )}
            </div>

            <MessageInput chatId={activeChatId} recipientId={recipientId} />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 flex-col">
            <div className="text-6xl mb-4">💬</div>
            <p>Выберите чат слева или начните новый</p>
          </div>
        )}
      </div>

      {/* МОДАЛКА ГРУППЫ */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl w-96 shadow-xl">
            <h3 className="text-xl font-bold mb-4">Создать группу</h3>
            <input type="text" placeholder="Название" value={groupName} onChange={e => setGroupName(e.target.value)} className="w-full border p-2 rounded mb-3" />
            <div className="max-h-40 overflow-y-auto border rounded p-2 mb-3">
              {users.map(u => (
                <label key={u.id} className="flex items-center gap-2 p-1 text-sm">
                  <input type="checkbox" checked={selectedUsers.includes(u.id)} onChange={() => setSelectedUsers(p => p.includes(u.id) ? p.filter(i => i !== u.id) : [...p, u.id])} />
                  {u.username}
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setIsModalOpen(false)} className="px-3 py-1 border rounded text-sm">Отмена</button>
              <button onClick={handleCreateGroup} disabled={creating} className="bg-blue-500 text-white px-3 py-1 rounded text-sm">{creating ? '...' : 'Создать'}</button>
            </div>
          </div>
        </div>
      )}

      {/* МОДАЛКА НАСТРОЕК */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl w-96 shadow-xl">
            <h3 className="text-xl font-bold mb-4">Настройки</h3>
            <label className="flex items-center justify-between p-2 border rounded mb-4">
              <span>Фильтр мата</span>
              <input type="checkbox" checked={moderationEnabled} onChange={e => setModerationEnabled(e.target.checked)} className="w-5 h-5" />
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setIsSettingsOpen(false)} className="px-3 py-1 border rounded text-sm">Отмена</button>
              <button onClick={handleSaveSettings} className="bg-green-500 text-white px-3 py-1 rounded text-sm">Сохранить</button>
            </div>
            {/* Кнопка выхода перенесена сюда */}
            <button onClick={logout} className="w-full mt-4 bg-red-50 text-red-600 py-2 rounded-lg hover:bg-red-100 transition text-sm font-medium">
              Выйти из аккаунта
            </button>
          </div>
        </div>
      )}
    </div>
  );
}