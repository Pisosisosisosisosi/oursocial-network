import { useState, FormEvent } from 'react';
import { getSocket } from '../api/socket';
import { keysApi } from '../api/client';
import { encryptMessage } from '../crypto/encrypt';

interface Props {
  chatId: string;
  recipientId: string;
}

export default function MessageInput({ chatId, recipientId }: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;

    const socket = getSocket();
    if (!socket) {
      setError('Socket не подключён');
      return;
    }

    setSending(true);
    setError('');

    try {
      const keyRes = await keysApi.get(recipientId);
      const recipientPublicKey = keyRes.data.publicKey;

      const encrypted = await encryptMessage(trimmed, recipientPublicKey);

      socket.emit(
        'send_message',
        {
          chatId,
          encryptedText: encrypted,
          type: 'text',
        },
        (response: any) => {
          setSending(false);
          if (response?.status === 'ok') {
            setText('');
          } else {
            setError('Ошибка отправки: ' + (response?.error || 'unknown'));
          }
        }
      );
    } catch (err: any) {
      setSending(false);
      console.error('❌ Error:', err);
      setError(err.message || 'Ошибка шифрования');
    }
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
      className="border-t bg-white p-3 flex flex-col gap-2"
    >
      {error && (
        <div className="bg-red-100 text-red-700 p-2 rounded text-sm">
          {error}
        </div>
      )}
      <div className="flex gap-2">
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
      </div>
    </form>
  );
}