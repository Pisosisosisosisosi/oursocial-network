import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

interface User {
  id: string;
  username: string;
}

interface Chat {
  _id: string;
  title?: string;
  type?: string;
  participants: string[];
  lastMessage?: string;
}

export default function Chats() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  
  const [chats, setChats] = useState<Chat[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

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

  const startDirectChat = async (targetUser: User) => {
    if (!user) return;
    
    try {
      const res = await axios.post(`${NODE_API}/api/chats`, {
        type: 'direct',
        participantId: targetUser.id 
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const newChatId = res.data.chat?._id || res.data._id || res.data.chatId;
      
      if (newChatId) {
        navigate(`/chat/${newChatId}?to=${targetUser.id}`);
      } else {
        alert('Не удалось создать чат');
      }
    } catch (err) {
      console.error('Ошибка создания чата:', err);
      alert('Ошибка при создании чата');
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedUsers.length === 0) {
      alert('Введите название и выберите хотя бы одного участника');
      return;
    }

    setCreating(true);
    try {
      const res = await axios.post(`${NODE_API}/api/chats`, {
        type: 'group',
        title: groupName,
        participantIds: selectedUsers
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const newChatId = res.data.chat?._id || res.data._id || res.data.chatId;
      if (newChatId) {
        navigate(`/chat/${newChatId}`);
      } else {
        setIsModalOpen(false);
        window.location.reload();
      }
    } catch (err) {
      console.error('Ошибка создания группы:', err);
      alert('Не удалось создать группу');
    } finally {
      setCreating(false);
    }
  };

  const handleSaveSettings = () => {
    localStorage.setItem('moderationEnabled', String(moderationEnabled));
    setIsSettingsOpen(false);
    alert('Настройки сохранены!');
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow p-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">Наша соцсеть</h1>
        <div className="flex items-center gap-4">
          <span>{user?.username}</span>
          <button onClick={() => setIsSettingsOpen(true)} className="bg-gray-200 px-3 py-1 rounded">⚙️</button>
          <button onClick={logout} className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600">Выйти</button>
        </div>
      </header>

      <main className="p-8 max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Мои чаты</h2>
          <button onClick={() => setIsModalOpen(true)} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">+ Создать группу</button>
        </div>

        {loading ? (
          <p className="text-gray-500">Загрузка...</p>
        ) : chats.length === 0 ? (
          <p className="text-gray-500">У вас пока нет чатов.</p>
        ) : (
          <div className="bg-white rounded-lg shadow divide-y">
            {chats.map((chat) => (
              <div key={chat._id} onClick={() => navigate(`/chat/${chat._id}`)} className="p-4 hover:bg-gray-50 cursor-pointer flex justify-between items-center">
                <div>
                  <p className="font-semibold">{chat.type === 'group' ? `👥 ${chat.title || 'Группа'}` : `Чат: ${chat._id.slice(-6)}`}</p>
                  <p className="text-sm text-gray-500">
 			 {chat.lastMessage?.encryptedText 
   			 ? chat.lastMessage.encryptedText 
  			  : 'Нет сообщений'}
		</p>
                </div>
                <span className="text-blue-500">→</span>
              </div>
            ))}
          </div>
        )}

        {/* Список пользователей для быстрого перехода */}
        <div className="mt-8 bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-bold mb-3">Пользователи сети</h2>
          <div className="divide-y">
            {users.map(u => (
              <div key={u.id} className="py-3 flex justify-between items-center">
                <span>{u.username}</span>
                <button onClick={() => startDirectChat(u)} className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600">
                  Написать
                </button>
              </div>
            ))}
          </div>
        </div>
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Создать группу</h3>
            <input type="text" placeholder="Название группы" value={groupName} onChange={(e) => setGroupName(e.target.value)} className="w-full border p-2 rounded mb-4" />
            <p className="font-semibold mb-2">Выберите участников:</p>
            <div className="max-h-48 overflow-y-auto border rounded p-2 mb-4">
              {users.map(u => (
                <label key={u.id} className="flex items-center gap-2 p-1 hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={selectedUsers.includes(u.id)} onChange={() => toggleUserSelection(u.id)} />
                  {u.username}
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 border rounded">Отмена</button>
              <button onClick={handleCreateGroup} disabled={creating} className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50">{creating ? 'Создание...' : 'Создать'}</button>
            </div>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-xl font-bold mb-4">Настройки</h3>
            <label className="flex items-center justify-between p-2 border rounded mb-4">
              <span>Фильтр нецензурной лексики</span>
              <input type="checkbox" checked={moderationEnabled} onChange={(e) => setModerationEnabled(e.target.checked)} className="w-5 h-5" />
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setIsSettingsOpen(false)} className="px-4 py-2 border rounded">Отмена</button>
              <button onClick={handleSaveSettings} className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}