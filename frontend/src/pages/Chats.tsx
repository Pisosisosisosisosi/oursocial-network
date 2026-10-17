import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authApi, type User } from '../api/client';

export default function Chats() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [chatId, setChatId] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchUsers = async () => {
      setLoadingUsers(true);
      try {
        const res = await authApi.searchUsers('');
        if (active && res.data) {
          const list = Array.isArray(res.data) ? res.data : [];
          setUsers(list.filter((u) => u.id !== user?.id));
        }
      } catch (err) {
        console.warn('Не удалось загрузить пользователей:', err);
      } finally {
        if (active) setLoadingUsers(false);
      }
    };
    fetchUsers();
    return () => {
      active = false;
    };
  }, [user?.id]);

  const openChat = () => {
    const trimmed = chatId.trim();
    if (trimmed) {
      navigate(`/chat/${trimmed}`);
    }
  };

  const startDirectChat = (targetUser: User) => {
    if (!user) return;
    const directId = [user.id, targetUser.id].sort().join('-');
    navigate(`/chat/${directId}?to=${targetUser.id}`);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow p-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">Наша соцсеть</h1>
        <div className="flex items-center gap-4">
          <span className="font-medium text-gray-700">{user?.username || user?.name}</span>
          <button
            onClick={logout}
            className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 transition"
          >
            Выйти
          </button>
        </div>
      </header>

      <main className="p-8 max-w-2xl mx-auto space-y-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <label className="block text-sm font-medium mb-2 text-gray-700">
            Открыть чат по названию или ID:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="например: general или test-chat-1"
              className="flex-1 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button
              onClick={openChat}
              disabled={!chatId.trim()}
              className="bg-blue-500 text-white px-5 py-2 rounded hover:bg-blue-600 disabled:opacity-50 transition"
            >
              Открыть
            </button>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-bold mb-3 text-gray-800">Пользователи сети</h2>
          {loadingUsers ? (
            <div className="text-gray-400 py-4 text-center">Загрузка пользователей...</div>
          ) : users.length === 0 ? (
            <div className="text-gray-400 py-4 text-center">Других пользователей пока нет</div>
          ) : (
            <div className="divide-y">
              {users.map((u) => (
                <div key={u.id} className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 font-bold flex items-center justify-center uppercase">
                      {(u.username || u.name || 'U').charAt(0)}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-800">{u.username || u.name}</div>
                      {u.email && <div className="text-xs text-gray-400">{u.email}</div>}
                    </div>
                  </div>
                  <button
                    onClick={() => startDirectChat(u)}
                    className="bg-green-500 hover:bg-green-600 text-white text-sm px-4 py-1.5 rounded-full transition"
                  >
                    Написать
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}