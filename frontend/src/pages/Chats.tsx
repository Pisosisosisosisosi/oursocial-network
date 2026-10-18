import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  LogOut,
  MessageCircle,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { isAxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import { authApi, keysApi, messenger, type Chat, type ChatMessage, type SearchUser } from '../api/client';
import { getSocket } from '../api/socket';
import { useAuth } from '../context/AuthContext';
import { decryptMessage, encryptMessage } from '../crypto/encrypt';

type DisplayMessage = ChatMessage & { displayText: string };

const MAX_IMAGE_SIZE = 700 * 1024;

function getErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    const data = error.response?.data as { detail?: string; error?: string } | undefined;
    return data?.detail || data?.error || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

function getInitial(name?: string): string {
  return name?.trim().charAt(0).toLocaleUpperCase('ru-RU') || '?';
}

function getChatName(chat: Chat): string {
  return chat.type === 'group'
    ? chat.title || 'Групповой чат'
    : chat.opponent?.name || chat.opponent?.username || chat.title || 'Личный чат';
}

function getMessagePreview(message?: ChatMessage | null): string {
  if (!message) return 'Пока нет сообщений — напишите первым';
  if (message.type === 'image') return '📷 Фотография';
  if (message.type === 'gift') return '🎁 Подарок';
  if (message.encryptedText.startsWith('oursocial-e2e:v2:')) return '🔒 Зашифрованное сообщение';
  return message.encryptedText;
}

function formatTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function formatMessageDate(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Сегодня';
  if (date.toDateString() === yesterday.toDateString()) return 'Вчера';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

async function getChatRecipientKeys(participantIds: string[]) {
  return Promise.all(participantIds.map(async (userId) => {
    const response = await keysApi.get(String(userId));
    return { userId: String(userId), publicKey: response.data.publicKey };
  }));
}

async function toDisplayMessage(message: ChatMessage, userId: string): Promise<DisplayMessage> {
  if (message.type === 'gift') return { ...message, displayText: message.encryptedText };
  if (message.type === 'image' && !message.encryptedText.startsWith('oursocial-e2e:v2:')) {
    return { ...message, displayText: message.encryptedText };
  }
  const displayText = await decryptMessage(message.encryptedText, userId);
  const isLegacyCiphertext =
    message.encryptedText.length > 100 && /^[A-Za-z0-9+/]+={0,2}$/.test(message.encryptedText);
  return {
    ...message,
    displayText:
      displayText === message.encryptedText &&
      (message.encryptedText.startsWith('oursocial-e2e:v2:') || isLegacyCiphertext)
        ? 'Зашифрованное сообщение'
        : displayText,
  };
}

function sortChats(chats: Chat[]): Chat[] {
  return [...chats].sort((a, b) => {
    const aTime = new Date(a.updatedAt || a.lastMessage?.createdAt || 0).getTime();
    const bTime = new Date(b.updatedAt || b.lastMessage?.createdAt || 0).getTime();
    return bTime - aTime;
  });
}

export default function Chats() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [text, setText] = useState('');
  const [typingUser, setTypingUser] = useState('');
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [socketConnected, setSocketConnected] = useState(false);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadedMessagesChatId, setLoadedMessagesChatId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatMode, setNewChatMode] = useState<'direct' | 'group' | 'add'>('direct');
  const [contactQuery, setContactQuery] = useState('');
  const [contacts, setContacts] = useState<SearchUser[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [creatingChat, setCreatingChat] = useState(false);
  const [previewImage, setPreviewImage] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const typingTimerRef = useRef<number | null>(null);
  const typingActiveRef = useRef(false);
  const loadingMessages = activeChatId !== null && loadedMessagesChatId !== activeChatId;

  const activeChat = chats.find((chat) => chat._id === activeChatId) || null;
  const filteredChats = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase('ru-RU');
    return chats.filter((chat) => {
      const matchesQuery = !query ||
        getChatName(chat).toLocaleLowerCase('ru-RU').includes(query) ||
        (chat.opponent?.username || '').toLocaleLowerCase('ru-RU').includes(query);
      return matchesQuery && (filter === 'all' || (chat.unreadCount || 0) > 0);
    });
  }, [chats, filter, searchQuery]);

  const upsertChat = useCallback((chat: Chat) => {
    if (!chat?._id) return;
    setChats((current) => sortChats([chat, ...current.filter((item) => item._id !== chat._id)]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadChats() {
      setLoadingChats(true);
      setError('');
      try {
        const response = await messenger.chats();
        if (!cancelled) setChats(sortChats(response.data.chats || []));
      } catch (loadError) {
        if (!cancelled) setError(getErrorMessage(loadError, 'Не удалось загрузить список чатов.'));
      } finally {
        if (!cancelled) setLoadingChats(false);
      }
    }
    void loadChats();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void messenger.onlineUsers()
      .then((response) => {
        if (!cancelled) setOnlineUsers(new Set(response.data.online.map(String)));
      })
      .catch((onlineError) => {
        if (!cancelled) setError(getErrorMessage(onlineError, 'Не удалось получить статусы пользователей.'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!newChatOpen) return;
    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await authApi.searchUsers(contactQuery.trim());
        if (!cancelled) {
          setContacts(response.data.filter((contact) =>
            contact.id !== user?.id &&
            !(newChatMode === 'add' && activeChat?.participants.includes(contact.id)),
          ));
        }
      } catch (searchError) {
        if (!cancelled) setError(getErrorMessage(searchError, 'Не удалось найти пользователей.'));
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [activeChat?.participants, contactQuery, newChatMode, newChatOpen, user?.id]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleConnect = () => setSocketConnected(true);
    const handleDisconnect = () => setSocketConnected(false);
    const handleOnline = (data: { userId: string }) => {
      setOnlineUsers((current) => new Set(current).add(String(data.userId)));
    };
    const handleOffline = (data: { userId: string }) => {
      setOnlineUsers((current) => {
        const next = new Set(current);
        next.delete(String(data.userId));
        return next;
      });
    };
    const handleNewChat = (chat: Chat) => upsertChat(chat);
    const handleChatUpdate = (update: Chat & { chatId?: string; lastMessage?: ChatMessage; updatedAt?: string }) => {
      if (update._id) {
        upsertChat(update);
        return;
      }
      setChats((current) => sortChats(current.map((chat) =>
        chat._id === String(update.chatId)
          ? { ...chat, lastMessage: update.lastMessage || chat.lastMessage, updatedAt: update.updatedAt || chat.updatedAt }
          : chat,
      )));
    };
    const handleUnreadUpdate = (update: { chatId: string; unreadCount: number }) => {
      setChats((current) => current.map((chat) =>
        chat._id === String(update.chatId) ? { ...chat, unreadCount: update.unreadCount } : chat,
      ));
    };
    const handleChatDeleted = (data: { chatId: string }) => {
      setChats((current) => current.filter((chat) => chat._id !== String(data.chatId)));
      if (String(data.chatId) === activeChatId) setActiveChatId(null);
    };
    const handleReceiveMessage = async (message: ChatMessage) => {
      if (message.chatId !== activeChatId || !user) return;
      const renderedMessage = await toDisplayMessage(message, user.id);
      setMessages((current) => current.some((item) => item._id && item._id === renderedMessage._id)
        ? current
        : [...current, renderedMessage]);
      if (message.senderId !== user.id) {
        void messenger.markRead(message.chatId).catch((readError) => {
          setError(getErrorMessage(readError, 'Не удалось отметить сообщения прочитанными.'));
        });
      }
    };
    const handleTyping = (data: { userId: string; username?: string; chatId: string }) => {
      if (data.chatId !== activeChatId || data.userId === user?.id) return;
      setTypingUser(data.username || 'Собеседник');
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = window.setTimeout(() => setTypingUser(''), 2200);
    };
    const handleMessagesRead = (data: { chatId: string; userId: string }) => {
      if (data.chatId !== activeChatId) return;
      setMessages((current) => current.map((message) =>
        message.senderId === user?.id
          ? { ...message, readBy: [...new Set([...(message.readBy || []), data.userId])] }
          : message,
      ));
    };
    const handleMessageDeleted = (data: { chatId: string; messageId: string }) => {
      if (data.chatId === activeChatId) {
        setMessages((current) => current.filter((message) => message._id !== data.messageId));
      }
    };
    const handleMessageEdited = async (message: ChatMessage) => {
      if (message.chatId !== activeChatId || !user) return;
      const rendered = await toDisplayMessage(message, user.id);
      setMessages((current) => current.map((item) => item._id === rendered._id ? rendered : item));
    };

    const statusTimer = window.setTimeout(() => setSocketConnected(socket.connected), 0);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('user_online', handleOnline);
    socket.on('user_offline', handleOffline);
    socket.on('chat_created', handleNewChat);
    socket.on('chat_updated', handleChatUpdate);
    socket.on('unread_updated', handleUnreadUpdate);
    socket.on('chat_deleted', handleChatDeleted);
    socket.on('receive_message', handleReceiveMessage);
    socket.on('user_typing', handleTyping);
    socket.on('messages_read', handleMessagesRead);
    socket.on('message_deleted', handleMessageDeleted);
    socket.on('message_edited', handleMessageEdited);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('user_online', handleOnline);
      socket.off('user_offline', handleOffline);
      socket.off('chat_created', handleNewChat);
      socket.off('chat_updated', handleChatUpdate);
      socket.off('unread_updated', handleUnreadUpdate);
      socket.off('chat_deleted', handleChatDeleted);
      socket.off('receive_message', handleReceiveMessage);
      socket.off('user_typing', handleTyping);
      socket.off('messages_read', handleMessagesRead);
      socket.off('message_deleted', handleMessageDeleted);
      socket.off('message_edited', handleMessageEdited);
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      window.clearTimeout(statusTimer);
    };
  }, [activeChatId, upsertChat, user]);

  useEffect(() => {
    if (!activeChatId || !user) return;
    const selectedChatId = activeChatId;
    const currentUserId = user.id;
    let cancelled = false;
    const socket = getSocket();
    socket?.emit('join_chat', { chatId: selectedChatId });

    async function loadMessages() {
      try {
        const response = await messenger.messages(selectedChatId);
        const sorted = [...(response.data.messages || [])].sort(
          (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
        );
        const rendered = await Promise.all(sorted.map((message) => toDisplayMessage(message, currentUserId)));
        if (!cancelled) {
          setMessages(rendered);
          setHasOlderMessages((response.data.messages || []).length === 50);
          void messenger.markRead(selectedChatId).catch((readError) => {
            setError(getErrorMessage(readError, 'Не удалось отметить сообщения прочитанными.'));
          });
          setChats((current) => current.map((chat) =>
            chat._id === selectedChatId ? { ...chat, unreadCount: 0 } : chat,
          ));
        }
      } catch (loadError) {
        if (!cancelled) setError(getErrorMessage(loadError, 'Не удалось загрузить историю сообщений.'));
      } finally {
        if (!cancelled) setLoadedMessagesChatId(selectedChatId);
      }
    }
    void loadMessages();
    return () => {
      cancelled = true;
      socket?.emit('leave_chat', { chatId: selectedChatId });
    };
  }, [activeChatId, user]);

  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
    shouldAutoScrollRef.current = true;
  }, [messages, typingUser]);

  const selectChat = (chat: Chat) => {
    if (chat._id === activeChatId) return;
    setActiveChatId(chat._id);
    setMessages([]);
    setHasOlderMessages(false);
    setLoadedMessagesChatId(null);
    setTypingUser('');
    setError('');
  };

  const createDirectChat = async (contact: SearchUser) => {
    setCreatingChat(true);
    setError('');
    try {
      const response = await messenger.createDirectChat(contact.id);
      upsertChat(response.data.chat);
      if (response.data.chat._id !== activeChatId) {
        setMessages([]);
        setHasOlderMessages(false);
        setLoadedMessagesChatId(null);
      }
      setActiveChatId(response.data.chat._id);
      setNewChatOpen(false);
      setContactQuery('');
    } catch (createError) {
      setError(getErrorMessage(createError, 'Не удалось открыть диалог.'));
    } finally {
      setCreatingChat(false);
    }
  };

  const addGroupParticipants = async () => {
    if (!activeChat || activeChat.type !== 'group' || selectedUserIds.length === 0) return;
    setCreatingChat(true);
    setError('');
    try {
      const response = await messenger.addParticipants(activeChat._id, selectedUserIds);
      upsertChat(response.data.chat);
      setNewChatOpen(false);
      setSelectedUserIds([]);
      setContactQuery('');
    } catch (addError) {
      setError(getErrorMessage(addError, 'Не удалось добавить участников.'));
    } finally {
      setCreatingChat(false);
    }
  };

  const createGroupChat = async () => {
    if (!groupTitle.trim() || selectedUserIds.length === 0) return;
    setCreatingChat(true);
    setError('');
    try {
      const response = await messenger.createGroupChat(groupTitle.trim(), selectedUserIds);
      upsertChat(response.data.chat);
      setMessages([]);
      setHasOlderMessages(false);
      setLoadedMessagesChatId(null);
      setActiveChatId(response.data.chat._id);
      setNewChatOpen(false);
      setGroupTitle('');
      setSelectedUserIds([]);
      setContactQuery('');
    } catch (createError) {
      setError(getErrorMessage(createError, 'Не удалось создать групповой чат.'));
    } finally {
      setCreatingChat(false);
    }
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    const messageText = (editingMessageId ? editingText : text).trim();
    if (!messageText || !activeChat || !user || sending) return;

    setSending(true);
    setError('');
    try {
      const recipients = await getChatRecipientKeys(activeChat.participants);
      const encryptedText = await encryptMessage(messageText, recipients);
      if (editingMessageId) {
        const response = await messenger.editMessage(activeChat._id, editingMessageId, encryptedText);
        const rendered = await toDisplayMessage(response.data.message, user.id);
        setMessages((current) => current.map((message) =>
          message._id === editingMessageId ? { ...rendered, displayText: messageText } : message,
        ));
        setEditingMessageId(null);
        setEditingText('');
        return;
      }
      const socket = getSocket();
      if (!socket) throw new Error('Нет соединения с сервером сообщений. Попробуйте ещё раз.');
      const response = await new Promise<{ status?: string; error?: string; message?: ChatMessage }>(
        (resolve, reject) => {
          socket.timeout(15000).emit(
            'send_message',
            { chatId: activeChat._id, encryptedText, type: 'text' },
            (timeoutError: Error | null, result: { status?: string; error?: string; message?: ChatMessage }) => {
              if (timeoutError) reject(new Error('Сервер не ответил. Проверьте соединение и повторите отправку.'));
              else resolve(result);
            },
          );
        },
      );
      if (response.status !== 'ok' || !response.message) {
        throw new Error(response.error || 'Не удалось отправить сообщение.');
      }
      const rendered = { ...response.message, displayText: messageText };
      setMessages((current) => current.some((item) => item._id === rendered._id)
        ? current
        : [...current, rendered]);
      setText('');
    } catch (sendError) {
      setError(getErrorMessage(sendError, 'Не удалось отправить сообщение.'));
    } finally {
      setSending(false);
    }
  };

  const sendImage = async (file?: File) => {
    if (!file || !activeChat || !user) return;
    if (!file.type.startsWith('image/')) {
      setError('Можно прикрепить только изображение.');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError('Размер изображения должен быть не больше 700 КБ.');
      return;
    }
    const socket = getSocket();
    if (!socket) {
      setError('Нет соединения с сервером сообщений. Попробуйте ещё раз.');
      return;
    }

    setSending(true);
    setError('');
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string'
          ? resolve(reader.result)
          : reject(new Error('Не удалось прочитать изображение.'));
        reader.onerror = () => reject(new Error('Не удалось прочитать изображение.'));
        reader.readAsDataURL(file);
      });
      const recipients = await getChatRecipientKeys(activeChat.participants);
      const encryptedText = await encryptMessage(dataUrl, recipients);
      const response = await new Promise<{ status?: string; error?: string; message?: ChatMessage }>(
        (resolve, reject) => {
          socket.timeout(15000).emit(
            'send_message',
            { chatId: activeChat._id, encryptedText, type: 'image' },
            (timeoutError: Error | null, result: { status?: string; error?: string; message?: ChatMessage }) => {
              if (timeoutError) reject(new Error('Сервер не ответил. Попробуйте отправить изображение ещё раз.'));
              else resolve(result);
            },
          );
        },
      );
      if (response.status !== 'ok' || !response.message) {
        throw new Error(response.error || 'Не удалось отправить изображение.');
      }
      const rendered = { ...response.message, displayText: dataUrl };
      setMessages((current) => current.some((item) => item._id === rendered._id)
        ? current
        : [...current, rendered]);
    } catch (sendError) {
      setError(getErrorMessage(sendError, 'Не удалось отправить изображение.'));
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const deleteMessage = async (messageId?: string) => {
    if (!activeChat || !messageId || !window.confirm('Удалить это сообщение?')) return;
    setError('');
    try {
      await messenger.deleteMessage(activeChat._id, messageId);
      setMessages((current) => current.filter((message) => message._id !== messageId));
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Не удалось удалить сообщение.'));
    }
  };

  const openNewChat = () => {
    setNewChatMode('direct');
    setContactQuery('');
    setError('');
    setNewChatOpen(true);
  };

  const openAddParticipants = () => {
    setNewChatMode('add');
    setSelectedUserIds([]);
    setContactQuery('');
    setError('');
    setNewChatOpen(true);
  };

  const loadOlderMessages = async () => {
    if (!activeChat || !messages[0]?.createdAt || loadingOlderMessages) return;
    setLoadingOlderMessages(true);
    setError('');
    try {
      const page = await messenger.messages(activeChat._id, messages[0].createdAt);
      const older = [...(page.data.messages || [])].sort(
        (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
      );
      const rendered = await Promise.all(older.map((message) => toDisplayMessage(message, user?.id || '')));
      const existingIds = new Set(messages.map((message) => message._id).filter(Boolean));
      const unique = rendered.filter((message) => !message._id || !existingIds.has(message._id));
      shouldAutoScrollRef.current = false;
      setMessages((current) => [...unique, ...current]);
      setHasOlderMessages(older.length === 50);
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Не удалось загрузить более ранние сообщения.'));
    } finally {
      setLoadingOlderMessages(false);
    }
  };

  const handleTextChange = (value: string) => {
    if (editingMessageId) {
      setEditingText(value);
      return;
    }
    setText(value);
    if (!activeChat) return;
    if (!typingActiveRef.current) {
      getSocket()?.emit('typing', { chatId: activeChat._id });
      typingActiveRef.current = true;
      window.setTimeout(() => {
        typingActiveRef.current = false;
      }, 1200);
    }
  };

  const totalUnread = chats.reduce((total, chat) => total + (chat.unreadCount || 0), 0);

  return (
    <main className="flex h-full min-h-0 w-full bg-[#090d16] text-slate-100">
      <aside className={`${activeChat ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-r border-white/[0.07] bg-[#0c111d] md:w-[340px] lg:w-[380px]`}>
        <div className="flex items-center justify-between px-5 pb-4 pt-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-lg shadow-indigo-500/20">
              <MessageCircle size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">OurSocial</h1>
              <p className="text-[11px] text-slate-500">ваши разговоры — в одном месте</p>
            </div>
          </div>
          <button
            type="button"
            onClick={openNewChat}
            className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400"
            aria-label="Новый чат"
            title="Новый чат"
          >
            <Plus size={20} />
          </button>
        </div>

        <div className="px-4 pb-4">
          <label className="flex h-11 items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 text-slate-500 transition focus-within:border-indigo-400/50 focus-within:bg-white/[0.055]">
            <Search size={17} />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Поиск по чатам"
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-600"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} aria-label="Очистить поиск">
                <X size={15} />
              </button>
            )}
          </label>
        </div>

        <div className="flex items-center gap-2 px-4 pb-3">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${filter === 'all' ? 'bg-indigo-500/15 text-indigo-200' : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-300'}`}
          >
            Все чаты <span className="ml-1 text-slate-500">{chats.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter(filter === 'unread' ? 'all' : 'unread')}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${filter === 'unread' ? 'bg-indigo-500/15 text-indigo-200' : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-300'}`}
          >
            Непрочитанные {totalUnread > 0 && <span className="ml-1">{totalUnread}</span>}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {loadingChats ? (
            <div className="space-y-2 p-1" aria-label="Загрузка чатов">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="flex animate-pulse items-center gap-3 rounded-xl p-3">
                  <div className="h-12 w-12 rounded-2xl bg-white/[0.06]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-2/3 rounded bg-white/[0.06]" />
                    <div className="h-2.5 w-full rounded bg-white/[0.04]" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="flex h-full min-h-48 flex-col items-center justify-center px-6 text-center">
              <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-white/[0.04] text-slate-500">
                {searchQuery || filter === 'unread' ? <Search size={20} /> : <MessageCircle size={20} />}
              </div>
              <p className="text-sm font-medium text-slate-300">
                {searchQuery || filter === 'unread' ? 'Чаты не найдены' : 'Здесь пока тихо'}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {searchQuery || filter === 'unread' ? 'Попробуйте изменить запрос.' : 'Начните разговор — найдите человека и напишите ему.'}
              </p>
              {!searchQuery && filter === 'all' && (
                <button
                  type="button"
                  onClick={openNewChat}
                  className="mt-4 rounded-lg bg-indigo-500/15 px-3 py-2 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/25"
                >
                  Создать первый чат
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredChats.map((chat) => {
                const isActive = chat._id === activeChatId;
                const otherId = chat.opponent?.id || '';
                const isOnline = otherId && onlineUsers.has(String(otherId));
                return (
                  <button
                    type="button"
                    key={chat._id}
                    onClick={() => selectChat(chat)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${isActive ? 'bg-indigo-500/[0.13] ring-1 ring-indigo-400/20' : 'hover:bg-white/[0.04]'}`}
                  >
                    <div className="relative shrink-0">
                      <Avatar name={getChatName(chat)} url={chat.avatar || undefined} group={chat.type === 'group'} size="md" />
                      {chat.type === 'direct' && (
                        <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0c111d] ${isOnline ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`truncate text-[13px] font-semibold ${isActive ? 'text-white' : 'text-slate-200'}`}>{getChatName(chat)}</p>
                        <time className="shrink-0 text-[10px] text-slate-500">{formatTime(chat.lastMessage?.createdAt || chat.updatedAt)}</time>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <p className="truncate text-xs text-slate-500">{getMessagePreview(chat.lastMessage)}</p>
                        {!!chat.unreadCount && (
                          <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-indigo-500 px-1.5 text-[10px] font-bold text-white">
                            {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-white/[0.07] px-4 py-3.5">
          <button
            type="button"
            onClick={() => navigate('/profile')}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left"
          >
            <Avatar name={user?.displayName || user?.name || user?.username} url={user?.avatarUrl} size="sm" />
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold text-slate-200">{user?.displayName || user?.name || user?.username}</span>
              <span className="block truncate text-[10px] text-slate-500">@{user?.username}</span>
            </span>
          </button>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-500" title={socketConnected ? 'Соединение активно' : 'Нет соединения'}>
            <span className={`h-1.5 w-1.5 rounded-full ${socketConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            {socketConnected ? 'В сети' : 'Переподключение'}
          </span>
          <button
            type="button"
            onClick={() => { logout(); navigate('/login'); }}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-300"
            aria-label="Выйти"
            title="Выйти из аккаунта"
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      <section className={`${activeChat ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col bg-[radial-gradient(ellipse_at_top_right,_rgba(99,102,241,0.08),_transparent_45%)]`}>
        {activeChat ? (
          <>
            <header className="flex h-[76px] shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#0c111d]/80 px-4 backdrop-blur-xl sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveChatId(null)}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-400 hover:bg-white/[0.06] md:hidden"
                  aria-label="Назад к чатам"
                >
                  <ArrowLeft size={19} />
                </button>
                <Avatar name={getChatName(activeChat)} url={activeChat.avatar || undefined} group={activeChat.type === 'group'} size="md" />
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-slate-100">{getChatName(activeChat)}</h2>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                    {typingUser ? (
                      <span className="animate-pulse text-indigo-300">{typingUser} печатает…</span>
                    ) : activeChat.type === 'group' ? (
                      <><Users size={12} /> {activeChat.participants?.length || 0} участников</>
                    ) : (
                      <>
                        <span className={`h-1.5 w-1.5 rounded-full ${onlineUsers.has(String(activeChat.opponent?.id)) ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                        {onlineUsers.has(String(activeChat.opponent?.id)) ? 'В сети' : 'Не в сети'}
                      </>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {activeChat.type === 'group' && (
                  <button
                    type="button"
                    onClick={openAddParticipants}
                    className="grid h-9 w-9 place-items-center rounded-xl text-slate-500 transition hover:bg-white/[0.05] hover:text-indigo-300"
                    aria-label="Добавить участников"
                    title="Добавить участников"
                  >
                    <UserPlus size={17} />
                  </button>
                )}
                <div className="flex items-center gap-2 rounded-full border border-emerald-400/10 bg-emerald-400/[0.05] px-2.5 py-1.5 text-[10px] font-medium text-emerald-300/80">
                  <ShieldCheck size={13} />
                  <span className="hidden sm:inline">Сквозное шифрование</span>
                  <span className="sm:hidden">E2E</span>
                </div>
              </div>
            </header>

            {error && (
              <div role="alert" className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-xl border border-rose-400/20 bg-rose-400/[0.08] px-3 py-2 text-xs text-rose-200 sm:mx-6">
                <span>{error}</span>
                <button type="button" onClick={() => setError('')} aria-label="Закрыть сообщение об ошибке">
                  <X size={15} />
                </button>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 md:px-8">
              {loadingMessages ? (
                <div className="grid h-full place-items-center text-sm text-slate-500">
                  <span className="flex items-center gap-3">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
                    Загружаем историю…
                  </span>
                </div>
              ) : messages.length === 0 ? (
                <div className="grid h-full place-items-center">
                  <div className="max-w-xs text-center">
                    <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-[22px] border border-indigo-400/10 bg-indigo-400/[0.07] text-indigo-300">
                      <MessageCircle size={28} />
                    </div>
                    <h3 className="text-base font-semibold text-slate-200">Начните разговор</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">Напишите сообщение — оно будет доступно только участникам этого чата.</p>
                  </div>
                </div>
              ) : (
                <div className="mx-auto flex max-w-4xl flex-col gap-3">
                  <div className="mb-2 flex justify-center">
                    <span className="rounded-full border border-white/[0.06] bg-white/[0.025] px-3 py-1 text-[10px] text-slate-500">
                      🔒 Сообщения защищены сквозным шифрованием
                    </span>
                  </div>
                  {hasOlderMessages && (
                    <button
                      type="button"
                      onClick={() => void loadOlderMessages()}
                      disabled={loadingOlderMessages}
                      className="mx-auto mb-2 rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1.5 text-[11px] text-slate-400 transition hover:bg-white/[0.05] hover:text-slate-200 disabled:opacity-50"
                    >
                      {loadingOlderMessages ? 'Загружаем…' : 'Загрузить более ранние сообщения'}
                    </button>
                  )}
                  {messages.map((message, index) => {
                    const mine = message.senderId === user?.id;
                    const previous = messages[index - 1];
                    const showDate = !previous || formatMessageDate(previous.createdAt) !== formatMessageDate(message.createdAt);
                    const isRead = mine && (message.readBy || []).some((id) => id !== user?.id);
                    return (
                      <div key={message._id || `${message.createdAt}-${index}`}>
                        {showDate && (
                          <div className="my-4 flex justify-center">
                            <span className="rounded-full bg-white/[0.035] px-3 py-1 text-[10px] text-slate-500">
                              {formatMessageDate(message.createdAt)}
                            </span>
                          </div>
                        )}
                        <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <div className="group/message relative max-w-[88%] sm:max-w-[72%]">
                          <div className={`rounded-2xl px-3.5 py-2.5 shadow-sm ${mine ? 'rounded-br-md border border-indigo-400/15 bg-gradient-to-br from-indigo-500/25 to-indigo-600/15 text-slate-100' : 'rounded-bl-md border border-white/[0.07] bg-[#141b29] text-slate-200'}`}>
                            {!mine && activeChat.type === 'group' && (
                              <p className="mb-1 text-[10px] font-semibold text-cyan-300">{message.senderName || 'Участник'}</p>
                            )}
                            {message.type === 'image' ? (
                              <button type="button" onClick={() => setPreviewImage(message.displayText)} className="block overflow-hidden rounded-lg">
                                <img src={message.displayText} alt="Изображение из чата" className="max-h-72 max-w-full object-cover" />
                              </button>
                            ) : (
                              <p className="whitespace-pre-wrap break-words text-[13px] leading-6">{message.displayText}</p>
                            )}
                            <div className={`mt-1.5 flex items-center justify-end gap-1.5 text-[9px] ${mine ? 'text-indigo-200/60' : 'text-slate-500'}`}>
                              {message.isEdited && <span>изменено</span>}
                              <time>{formatTime(message.createdAt)}</time>
                              {mine && (isRead ? <CheckCheck size={13} className="text-cyan-300" /> : <Check size={13} />)}
                            </div>
                          </div>
                          {mine && message.type === 'text' && message._id && (
                            <div className="absolute -top-8 right-0 flex translate-y-1 items-center gap-1 rounded-lg border border-white/[0.08] bg-[#111927] p-1 opacity-0 shadow-lg transition group-hover/message:translate-y-0 group-hover/message:opacity-100 focus-within:opacity-100">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMessageId(message._id || null);
                                  setEditingText(message.displayText);
                                  setError('');
                                }}
                                className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-white/[0.06] hover:text-indigo-200"
                                aria-label="Редактировать сообщение"
                                title="Редактировать"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => void deleteMessage(message._id)}
                                className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-rose-400/10 hover:text-rose-300"
                                aria-label="Удалить сообщение"
                                title="Удалить"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {typingUser && (
                    <div className="self-start rounded-2xl rounded-bl-md border border-white/[0.07] bg-[#141b29] px-4 py-3 text-xs text-slate-400">
                      <span className="mr-2 inline-flex gap-1 align-middle">
                        <span className="h-1 w-1 animate-bounce rounded-full bg-indigo-300" />
                        <span className="h-1 w-1 animate-bounce rounded-full bg-indigo-300 [animation-delay:120ms]" />
                        <span className="h-1 w-1 animate-bounce rounded-full bg-indigo-300 [animation-delay:240ms]" />
                      </span>
                      {typingUser} печатает
                    </div>
                  )}
                  <div ref={messageEndRef} />
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-white/[0.06] bg-[#0c111d]/70 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-4">
              <form onSubmit={sendMessage} className="mx-auto flex max-w-4xl items-end gap-2 rounded-2xl border border-white/[0.08] bg-[#131a28] p-2 shadow-lg shadow-black/10 transition focus-within:border-indigo-400/30">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => void sendImage(event.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-white/[0.05] hover:text-indigo-300 disabled:opacity-40"
                  aria-label="Прикрепить изображение"
                  title="Прикрепить изображение (до 700 КБ)"
                >
                  <Paperclip size={19} />
                </button>
                {editingMessageId && (
                  <button
                    type="button"
                    onClick={() => { setEditingMessageId(null); setEditingText(''); }}
                    className="grid h-10 w-8 shrink-0 place-items-center text-slate-500 hover:text-slate-200"
                    aria-label="Отменить редактирование"
                    title="Отменить"
                  >
                    <X size={17} />
                  </button>
                )}
                <textarea
                  value={editingMessageId ? editingText : text}
                  onChange={(event) => handleTextChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder={editingMessageId ? 'Измените сообщение…' : 'Напишите сообщение…'}
                  rows={1}
                  maxLength={4000}
                  className="max-h-32 min-h-10 flex-1 resize-y bg-transparent px-1 py-2.5 text-[13px] leading-5 text-slate-100 outline-none placeholder:text-slate-600"
                  disabled={sending}
                />
                <button
                  type="submit"
                  disabled={sending || !(editingMessageId ? editingText : text).trim()}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Отправить сообщение"
                  title="Отправить"
                >
                  {editingMessageId ? <Check size={17} /> : <Send size={17} className={sending ? 'animate-pulse' : ''} />}
                </button>
              </form>
              <p className="mx-auto mt-2 max-w-4xl text-[9px] text-slate-600">
                Enter — отправить · Shift + Enter — новая строка
              </p>
            </div>
          </>
        ) : (
          <div className="relative grid flex-1 place-items-center overflow-hidden px-6">
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/[0.045] blur-3xl" />
            <div className="relative max-w-md text-center">
              <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-[28px] border border-indigo-400/10 bg-gradient-to-br from-indigo-500/[0.12] to-cyan-400/[0.06] text-indigo-300 shadow-2xl shadow-indigo-500/10">
                <MessageCircle size={34} strokeWidth={1.5} />
              </div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.25em] text-indigo-300/70">Your space to connect</p>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-100 sm:text-3xl">Разговоры начинаются здесь</h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-500">
                Выберите диалог слева или начните новый. Общайтесь лично или создайте группу для всех своих.
              </p>
              <button
                type="button"
                onClick={openNewChat}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400"
              >
                <Plus size={17} /> Начать общение
              </button>
              {error && <p role="alert" className="mt-4 text-xs text-rose-300">{error}</p>}
            </div>
            <div className="absolute bottom-6 flex items-center gap-2 text-[10px] text-slate-600">
              <ShieldCheck size={13} className="text-emerald-400/70" /> Сообщения защищены сквозным шифрованием
            </div>
          </div>
        )}
      </section>

      {newChatOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setNewChatOpen(false);
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="new-chat-title" className="flex max-h-[min(680px,90dvh)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#101725] shadow-2xl shadow-black/50">
            <header className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
              <div>
                <h2 id="new-chat-title" className="font-semibold text-slate-100">
                  {newChatMode === 'add' ? 'Добавить участников' : 'Новое сообщение'}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {newChatMode === 'add' ? `Пригласите в «${activeChat?.title || 'групповой чат'}»` : 'Найдите собеседника или создайте группу'}
                </p>
              </div>
              <button type="button" onClick={() => setNewChatOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl text-slate-500 hover:bg-white/[0.05] hover:text-white" aria-label="Закрыть">
                <X size={18} />
              </button>
            </header>
            <div className="flex gap-2 px-5 pt-4">
              <button
                type="button"
                onClick={() => setNewChatMode('direct')}
                className={`flex-1 rounded-xl py-2 text-xs font-semibold transition ${newChatMode === 'direct' ? 'bg-indigo-500/15 text-indigo-200' : 'text-slate-500 hover:bg-white/[0.04]'}`}
                hidden={newChatMode === 'add'}
              >
                Личный чат
              </button>
              <button
                type="button"
                onClick={() => setNewChatMode('group')}
                className={`flex-1 rounded-xl py-2 text-xs font-semibold transition ${newChatMode === 'group' ? 'bg-indigo-500/15 text-indigo-200' : 'text-slate-500 hover:bg-white/[0.04]'}`}
                hidden={newChatMode === 'add'}
              >
                Групповой чат
              </button>
            </div>
            {newChatMode !== 'direct' && (
              <form onSubmit={(event) => { event.preventDefault(); void createGroupChat(); }} className="px-5 pt-4">
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Название группы</label>
                <input
                  value={groupTitle}
                  onChange={(event) => setGroupTitle(event.target.value)}
                  maxLength={60}
                  required
                  placeholder="Например, Друзья"
                  className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-400/40"
                />
              </form>
            )}
            <div className="px-5 pb-2 pt-4">
              <label className="flex h-10 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 text-slate-500 focus-within:border-indigo-400/40">
                <Search size={16} />
                <input
                  autoFocus
                  value={contactQuery}
                  onChange={(event) => setContactQuery(event.target.value)}
                  placeholder="Имя или имя пользователя"
                  className="min-w-0 flex-1 bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-600"
                />
              </label>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
              {contacts.length === 0 ? (
                <div className="grid h-32 place-items-center px-4 text-center text-xs text-slate-500">
                  {contactQuery ? 'Пользователи не найдены.' : 'Пока нет пользователей для отображения.'}
                </div>
              ) : (
                contacts.map((contact) => {
                  const selected = selectedUserIds.includes(contact.id);
                  return (
                    <button
                      type="button"
                      key={contact.id}
                      disabled={creatingChat}
                      onClick={() => {
                        if (newChatMode === 'direct') {
                          void createDirectChat(contact);
                        } else {
                          setSelectedUserIds((current) => selected
                            ? current.filter((id) => id !== contact.id)
                            : [...current, contact.id]);
                        }
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[0.045] disabled:opacity-50"
                    >
                      <Avatar name={contact.displayName || contact.name || contact.username} url={contact.avatarUrl || contact.avatar || undefined} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-200">{contact.displayName || contact.name || contact.username}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-slate-500">@{contact.username}</span>
                      </span>
                      {newChatMode === 'group' && (
                        <span className={`grid h-5 w-5 place-items-center rounded-md border ${selected ? 'border-indigo-400 bg-indigo-500 text-white' : 'border-slate-600 text-transparent'}`}>
                          <Check size={13} />
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
            {error && <p role="alert" className="mx-5 mb-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
            {(newChatMode === 'group' || newChatMode === 'add') && (
              <footer className="flex items-center justify-between border-t border-white/[0.07] px-5 py-4">
                <span className="text-xs text-slate-500">Выбрано: {selectedUserIds.length}</span>
                <button
                  type="button"
                  onClick={() => void (newChatMode === 'group' ? createGroupChat() : addGroupParticipants())}
                  disabled={creatingChat || (newChatMode === 'group' && !groupTitle.trim()) || selectedUserIds.length === 0}
                  className="rounded-xl bg-indigo-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {creatingChat ? 'Сохраняем…' : newChatMode === 'group' ? 'Создать группу' : 'Добавить участников'}
                </button>
              </footer>
            )}
            {creatingChat && newChatMode === 'direct' && (
              <div className="border-t border-white/[0.07] px-5 py-3 text-center text-xs text-slate-500">Открываем диалог…</div>
            )}
          </section>
        </div>
      )}

      {previewImage && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/85 p-4" onClick={() => setPreviewImage('')}>
          <button type="button" onClick={() => setPreviewImage('')} className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Закрыть изображение">
            <X size={20} />
          </button>
          <img src={previewImage} alt="Полноразмерное изображение" className="max-h-[90vh] max-w-full rounded-xl object-contain" onClick={(event) => event.stopPropagation()} />
        </div>
      )}
    </main>
  );
}

function Avatar({ name, url, group = false, size = 'md' }: { name?: string; url?: string; group?: boolean; size?: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'h-10 w-10 rounded-xl text-sm' : 'h-12 w-12 rounded-2xl text-base';
  if (url) {
    return <img src={url} alt="" className={`${sizeClass} shrink-0 border border-white/10 object-cover`} />;
  }
  return (
    <span className={`${sizeClass} grid shrink-0 place-items-center border border-indigo-300/10 bg-gradient-to-br from-indigo-500/20 to-cyan-500/10 font-semibold text-indigo-100`}>
      {group ? <Users size={size === 'sm' ? 17 : 19} /> : getInitial(name)}
    </span>
  );
}
