import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSocket } from '../api/socket';
import { decryptMessage } from '../crypto/encrypt';
import MessageList, { type Message } from '../components/MessageList';
import MessageInput from '../components/MessageInput';

export default function Chat() {
  const { chatId } = useParams<{ chatId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUser, setTypingUser] = useState<string | null>(null);

  useEffect(() => {
    if (!chatId || !user) return;

    const socket = getSocket();
    if (!socket) {
      console.warn('Socket не инициализирован');
      return;
    }

    const joinRoom = () => {
      socket.emit('join_chat', { chatId });
    };

    if (socket.connected) {
      joinRoom();
    } else {
      socket.on('connect', joinRoom);
    }

    const handleReceive = async (msg: Message) => {
      if (msg.chatId !== chatId) return;

      let decrypted = msg.encryptedText || '';
      try {
        decrypted = await decryptMessage(msg.encryptedText);
      } catch (_) {
        // Оставляем исходный текст, если расшифровать не удалось
      }

      const decryptedMsg: Message = {
        ...msg,
        encryptedText: decrypted,
      };

      setMessages((prev) => {
        if (msg._id && prev.some((m) => m._id === msg._id)) return prev;
        return [...prev, decryptedMsg];
      });
    };

    const handleTyping = (data: { userId: string; chatId: string; username?: string }) => {
      if (data.chatId === chatId && data.userId !== user.id) {
        setTypingUser(data.username || data.userId.slice(0, 6));
        setTimeout(() => setTypingUser(null), 3000);
      }
    };

    socket.on('receive_message', handleReceive);
    socket.on('user_typing', handleTyping);

    return () => {
      socket.emit('leave_chat', { chatId });
      socket.off('connect', joinRoom);
      socket.off('receive_message', handleReceive);
      socket.off('user_typing', handleTyping);
    };
  }, [chatId, user]);

  if (!chatId || !user) {
    return <div className="p-8">Загрузка...</div>;
  }

  // TODO: заменить на реальный recipientId из API чата
  // Пока — временная заглушка: ID второго пользователя
  const recipientId = new URLSearchParams(window.location.search).get('to') || user.id;

  const handleMessageSent = (msg: Message) => {
    setMessages((prev) => {
      if (msg._id && prev.some((m) => m._id === msg._id)) return prev;
      return [...prev, msg];
    });
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-white shadow p-4 flex items-center gap-4">
        <button
          onClick={() => navigate('/')}
          className="text-blue-500 hover:underline"
        >
          ← Назад
        </button>
        <h1 className="text-lg font-bold">Чат: {chatId}</h1>
        {typingUser && (
          <span className="text-sm text-gray-500 ml-auto">
            {typingUser} печатает...
          </span>
        )}
      </header>

      <div className="flex-1 flex flex-col max-w-3xl w-full mx-auto bg-gray-50">
        <MessageList messages={messages} currentUserId={user.id} />
        <MessageInput
          chatId={chatId}
          recipientId={recipientId}
          onMessageSent={handleMessageSent}
        />
      </div>
    </div>
  );
}