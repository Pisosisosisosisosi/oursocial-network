import { useState, FormEvent } from 'react';
import { getSocket } from '../api/socket';
import { keysApi } from '../api/client';
import { encryptMessage } from '../crypto/encrypt';

interface Props { chatId: string; recipientId: string; }

export default function MessageInput({ chatId, recipientId }: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    const socket = getSocket();
    if (!socket) return setError('Socket не подключён');

    setSending(true);
    setError('');
    try {
      const keyRes = await keysApi.get(recipientId);
      const encrypted = await encryptMessage(trimmed, keyRes.data.publicKey);
      const moderationEnabled = localStorage.getItem('moderationEnabled') !== 'false';
      
      socket.emit('send_message', { chatId, encryptedText: encrypted, type: 'text', moderationEnabled }, (res: any) => {
        setSending(false);
        if (res?.status === 'ok') setText('');
        else setError(res?.error || 'Ошибка');
      });
    } catch (err: any) { setSending(false); setError(err.message); }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t bg-white p-3 flex flex-col gap-2">
      {error && <div className="bg-red-100 text-red-700 p-2 rounded text-sm">{error}</div>}
      <div className="flex gap-2">
        <input type="text" value={text} onChange={e => setText(e.target.value)} placeholder="Введите сообщение..." className="flex-1 px-4 py-2 border rounded-full" disabled={sending} />
        <button type="submit" disabled={sending || !text.trim()} className="bg-blue-500 text-white px-6 py-2 rounded-full">{sending ? '...' : 'Отправить'}</button>
      </div>
    </form>
  );
}
