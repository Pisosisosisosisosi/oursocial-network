import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Chats() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [chatId, setChatId] = useState('');

  const openChat = () => {
    const trimmed = chatId.trim();
    if (trimmed) {
      navigate(`/chat/${trimmed}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow p-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">Наша соцсеть</h1>
        <div className="flex items-center gap-4">
          <span>{user?.username}</span>
          <button
            onClick={logout}
            className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
          >
            Выйти
          </button>
        </div>
      </header>

      <main className="p-8 max-w-2xl mx-auto">
        <h2 className="text-2xl mb-4">Мои чаты</h2>

        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <label className="block text-sm font-medium mb-2">
            Открыть чат по ID:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="например: test-chat-1"
              className="flex-1 px-3 py-2 border rounded"
            />
            <button
              onClick={openChat}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Открыть
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Пока список чатов не реализован — открывайте по ID вручную.
            Например: <code className="bg-gray-100 px-1 rounded">test-chat-1</code>
          </p>
        </div>
      </main>
    </div>
  );
}