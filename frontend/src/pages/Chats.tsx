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
  
  // Состояния для левой панели
  const [chats, setChats] = useState<Chat[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Состояния для правой панели (активный чат)
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeChatName, setActiveChatName] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [recipientId, setRecipientId] = useState<string>('');

  // Модалки
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [moderationEnabled, setModerationEnabled] = useState(true);

  const token = localStorage.getItem('token');
  const NODE_API = 'https://oursocial-network-production.up.railway.app';
  const PYTHON_API = 'https://oursocial-python.onrender.com';

  // 1. Загрузка списка чатов и пользователей
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

  // 2. Загрузка сообщений при выборе чата
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

    // Подключаем сокет к чату
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

  // Открытие личного чата
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

  // Открытие существующего чата
  const openChat = (chat: Chat) => {
    setActiveChatId(chat._id);
    const otherId = chat.participants?.find((id: string) => id !== user?.id);
    const otherUser = users.find(u => u.id === otherId);
    setActiveChatName(chat.type === 'group' ? (chat.title || 'Группа') : (otherUser?.username || 'Чат'));
    if (otherId) setRecipientId(otherId);
  };

  // Создание группы
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

  // Сохранение настроек
  const handleSaveSettings = () => {
    localStorage.setItem('moderationEnabled', String(moderationEnabled));
    setIsSettingsOpen(false);
    alert('Настройки сохранены!');
  };

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      
      {/* ЛЕВАЯ ПАНЕЛЬ (СПИСОК ЧАТОВ) */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <header className="p-4 border-b flex justify-between items-center bg-gray-50">
          <span className="font-bold text-lg">{user?.username}</span>
          <div className="flex gap-2">
            <button onClick={() => setIsSettingsOpen(true)} className="text-gray-500 hover:text-black">⚙️</button>
            <button onClick={logout} className="text-red-500 text-sm">Выйти</button>
          </div>
        </header>

        <div className="p-2 border-b">
          <button onClick={() => setIsModalOpen(true)} className="w-full bg-blue-500 text-white py-2 rounded-lg text-sm">+ Создать группу</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* СПИСОК ЧАТОВ */}
          <div className="p-2">
            <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">Мои чаты</h3>
            {chats.length === 0 && <p className="text-xs text-gray-400">Нет чатов</p>}
            {chats.map(chat => (
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
            ))}
          </div>

          {/* СПИСОК ПОЛЬЗОВАТЕЛЕЙ (КЛИК НА ВСЮ СТРОКУ) */}
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
          </div>
        </div>
      )}
    </div>
  );
}