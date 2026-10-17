import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSocket } from '../api/socket';
import { decryptMessage } from '../crypto/encrypt';
import MessageList, { type Message } from '../components/MessageList';
import MessageInput from '../components/MessageInput';
import axios from 'axios';

export default function Chat() {
  const { chatId } = useParams<{ chatId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<Message[]>([]);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 1. Загрузка истории сообщений из базы
  useEffect(() => {
    if (!chatId || !user) return;

    const loadHistory = async () => {
      try {
        setLoading(true);
        // Делаем запрос к Node.js API
        const res = await axios.get(`https://oursocial-network-production.up.railway.app/api/chats/${chatId}/messages`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });

        const history = res.data.messages || res.data; 
        
        // Расшифровываем каждое сообщение
        const decryptedHistory = await Promise.all(
          history.map(async (msg: any) => {
            let decrypted = '[Зашифровано]';
            try {
              decrypted = await decryptMessage(msg.encryptedText);
            } catch (err) {
              console.error('Ошибка расшифровки истории:', err);
            }
            return { ...msg, encryptedText: decrypted };
          })
        );

        setMessages(decryptedHistory);
      } catch (err) {
        console.error('Ошибка загрузки истории:', err);
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, [chatId, user]);

  // 2. Подключение к Socket.IO для новых сообщений
  useEffect(() => {
    if (!chatId || !user) return;

    const socket = getSocket();
    if (!socket) return;

    socket.emit('join_chat', { chatId });

    const handleReceive = async (msg: Message) => {
      if (msg.chatId !== chatId) return;

      let decrypted = '[Зашифровано]';
      try {
        decrypted = await decryptMessage(msg.encryptedText);
      } catch (err) {
        console.error('Ошибка расшифровки:', err);
      }

      const decryptedMsg: Message = { ...msg, encryptedText: decrypted };

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
      socket.off('receive_message', handleReceive);
      socket.off('user_typing', handleTyping);
    };
  }, [chatId, user]);

  if (!chatId || !user) {
    return <div className="p-8">Загрузка...</div>;
  }

  // TODO: позже будем брать из данных чата
  const recipientId = user.id; 

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-white shadow p-4 flex items-center gap-4">
        <button onClick={() => navigate('/')} className="text-blue-500 hover:underline">
          ← Назад
        </button>
        <h1 className="text-lg font-bold">Чат: {chatId}</h1>
        {typingUser && (
          <span className="text-sm text-gray-500 ml-auto">{typingUser} печатает...</span>
        )}
      </header>

      <div className="flex-1 flex flex-col max-w-3xl w-full mx-auto bg-gray-50">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">Загрузка истории...</div>
        ) : (
          <MessageList messages={messages} currentUserId={user.id} />
        )}
        <MessageInput chatId={chatId} recipientId={recipientId} />
      </div>
    </div>
  );
}