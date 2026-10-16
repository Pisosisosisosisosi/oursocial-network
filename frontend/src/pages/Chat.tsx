import { useParams } from 'react-router-dom';

export default function Chat() {
  const { chatId } = useParams();

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <h1 className="text-2xl">Чат: {chatId}</h1>
      <p className="text-gray-500 mt-4">Здесь будут сообщения (пока заглушка).</p>
    </div>
  );
}