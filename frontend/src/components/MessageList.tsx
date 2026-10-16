import { useEffect, useRef } from 'react';

export interface Message {
  _id?: string;
  chatId: string;
  senderId: string;
  senderName?: string;
  encryptedText: string;
  type: string;
  giftId?: string | null;
  createdAt?: string;
}

interface Props {
  messages: Message[];
  currentUserId: string;
}

export default function MessageList({ messages, currentUserId }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        Нет сообщений. Начните переписку!
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {messages.map((msg, i) => {
        const isMine = msg.senderId === currentUserId;

        return (
          <div
            key={msg._id || i}
            className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs md:max-w-md px-4 py-2 rounded-lg ${
                isMine
                  ? 'bg-blue-500 text-white'
                  : 'bg-white text-gray-800 shadow'
              }`}
            >
              {!isMine && (
                <div className="text-xs font-semibold text-gray-500 mb-1">
                  {msg.senderName || msg.senderId.slice(0, 6)}
                </div>
              )}
              <div className="break-words">{msg.encryptedText}</div>
              {msg.createdAt && (
                <div
                  className={`text-xs mt-1 ${
                    isMine ? 'text-blue-100' : 'text-gray-400'
                  }`}
                >
                  {new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}