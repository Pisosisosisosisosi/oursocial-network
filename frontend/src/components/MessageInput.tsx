import { useState, FormEvent } from 'react';
import { getSocket } from '../api/socket';

interface Props {
  chatId: string;
}

export default function MessageInput({ chatId }: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;

    const socket = getSocket();
    if (!socket) {
      alert('Socket не подключён');
      return;
    }

    setSending(true);
    socket.emit(
      'send_message',
      {
        chatId,
        encryptedText: trimmed,
        type: 'text',
      },
      (response: any) => {
        setSending(false);
        if (response?.status === 'ok') {
          setText('');
        } else {
          alert('Ошибка отправки: ' + (response?.error || 'unknown'));
        }
      }
    );
  };

  const handleTyping = () => {
    const socket = getSocket();
    if (socket && text.length > 0) {
      socket.emit('typing', { chatId });
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t bg-white p-3 flex gap-2"
    >
      <input
        type="text"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          handleTyping();
        }}
        placeholder="Введите сообщение..."
        className="flex-1 px-4 py-2 border rounded-full focus:outline-none focus:ring-2 focus:ring-blue-400"
        disabled={sending}
      />
      <button
        type="submit"
        disabled={sending || !text.trim()}
        className="bg-blue-500 text-white px-6 py-2 rounded-full hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {sending ? '...' : 'Отправить'}
      </button>
    </form>
  );
}