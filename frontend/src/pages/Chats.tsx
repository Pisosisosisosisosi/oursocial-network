import { useAuth } from '../context/AuthContext';

export default function Chats() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow p-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">Наша соцсеть</h1>
        <div>
          <span className="mr-4">{user?.username}</span>
          <button
            onClick={logout}
            className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
          >
            Выйти
          </button>
        </div>
      </header>
      <main className="p-8">
        <h2 className="text-2xl mb-4">Чаты</h2>
        <p className="text-gray-500">Здесь будут чаты (пока заглушка).</p>
      </main>
    </div>
  );
}