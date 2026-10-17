import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

interface Chat {
  _id: string;
  participants: string[];
  lastMessage?: string;
  updatedAt?: string;
}

export default function Chats() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  // Загружаем список чатов при входе
  useEffect(() => {
    if (!user) return;

    const loadChats = async () => {
      try {
        const res = await axios.get('https://oursocial-network-production.up.railway.app/api/chats', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        
        // Бэкенд может возвращать массив или объект { chats: [...] }
        const chatList = Array.isArray(res.data) ? res.data : (res.data.chats || []);
        setChats(chatList);
      } catch (err) {
        console.error('Ошибка загрузки чатов:', err);
      } finally {
        setLoading(false);
      }
    };

    loadChats();
  }, [user]);

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow p-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">Наша соцсеть</h1>
        <div className="flex items-center gap-4">
          <span>{user?.username}</span>
          <button onClick={logout} className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600">
            Выйти
          </button>
        </div>
      </header>

      <main className="p-8 max-w-2xl mx-auto">
        <h2 className="text-2xl mb-4">Мои чаты</h2>

        {loading ? (
          <p className="text-gray-500">Загрузка чатов...</p>
        ) : chats.length === 0 ? (
          <p className="text-gray-500">У вас пока нет чатов. Начните переписку через поиск пользователей!</p>
        ) : (
          <div className="bg-white rounded-lg shadow divide-y">
            {chats.map((chat) => (
              <div
                key={chat._id}
                onClick={() => navigate(`/chat/${chat._id}`)}
                className="p-4 hover:bg-gray-50 cursor-pointer flex justify-between items-center"
              >
                <div>
                  <p className="font-semibold">Чат: {chat._id.slice(-6)}</p>
                  <p className="text-sm text-gray-500">
                    {chat.lastMessage || 'Нет сообщений'}
                  </p>
                </div>
                <span className="text-blue-500">→</span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}