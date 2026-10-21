import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect, type FormEvent } from 'react';
import { ArrowLeft, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ContactRound, Copy, Crown, Download, ExternalLink, FileText, Forward, Paperclip, Pencil, Phone, Pin, Reply, Search, Smile, Trash2, UserRoundPlus, UserRoundX, Video, X } from 'lucide-react';
import { isAxiosError } from 'axios';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api, keysApi, type Contact, type User } from '../api/client';
import { getSocket } from '../api/socket';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/useToast';
import { decryptBytes, decryptMessage, encryptBytes, encryptMessage, isEncryptedMessage, packAttachmentPayload, unpackAttachmentPayload } from '../crypto/encrypt';
import WorkspaceSidebarHeader from '../components/layout/WorkspaceSidebarHeader';
import EmojiPicker from '../components/chat/EmojiPicker';
import EncryptionNotice, { canSendEncryptedMessages } from '../components/EncryptionNotice';
import { useCallActions } from '../context/CallContext';
import { formatAppDateTime, formatAppTime, getAppTimeZone } from '../time';

interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  text: string;
  type: 'text' | 'image' | 'file';
  fileName?: string;
  contentType?: string;
  fileData?: string;
  reactions: { userId: string; emoji: string }[];
  pinned?: boolean;
  pinnedAt?: string | null;
  edited?: boolean;
  replyTo?: string | null;
  forwardedFrom?: string | null;
  createdAt: string;
  read: boolean;
}

const REACTIONS = ['❤️', '👍', '😂', '🔥', '🎉', '😢'] as const;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf', 'text/plain', 'text/csv', 'application/zip',
]);

function highlightText(text: string, query: string) {
  if (!query.trim()) return text;
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.split(new RegExp(`(${escapedQuery})`, 'ig')).map((part, index) =>
    part.toLocaleLowerCase().includes(query.toLocaleLowerCase())
      ? <mark key={index} className="rounded bg-amber-300/30 text-inherit">{part}</mark>
      : part,
  );
}

function formatLastSeen(value?: string | null) {
  if (!value) return 'Не в сети';

  const lastSeen = new Date(value);
  if (Number.isNaN(lastSeen.getTime())) return 'Не в сети';

  const now = new Date();
  const elapsed = now.getTime() - lastSeen.getTime();
  if (elapsed < 60_000) return 'Был(а) в сети только что';
  if (elapsed < 60 * 60_000) return `Был(а) в сети ${Math.floor(elapsed / 60_000)} мин. назад`;

  const time = formatAppTime(lastSeen);
  const dateKey = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: getAppTimeZone(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  if (dateKey(lastSeen) === dateKey(now)) return `Был(а) сегодня в ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dateKey(lastSeen) === dateKey(yesterday)) return `Был(а) вчера в ${time}`;

  return `Был(а) в сети ${formatAppDateTime(lastSeen, {
    day: 'numeric',
    month: 'short',
    year: lastSeen.getFullYear() === now.getFullYear() ? undefined : 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function chatDraftKey(userId: string, chatId: string) {
  return `skyline:draft:${userId}:${chatId}`;
}

function readChatDraft(userId: string | undefined, chatId: string) {
  if (!userId) return '';
  try {
    return localStorage.getItem(chatDraftKey(userId, chatId)) || '';
  } catch {
    return '';
  }
}

function writeChatDraft(userId: string | null | undefined, chatId: string | null | undefined, value: string) {
  if (!userId || !chatId) return;
  try {
    const key = chatDraftKey(userId, chatId);
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch (error) {
    console.warn('Не удалось сохранить черновик сообщения:', error);
  }
}

async function decryptChatMessage(message: ChatMessage, userId?: string): Promise<ChatMessage> {
  if (message.type === 'text' && isEncryptedMessage(message.text)) {
    return { ...message, text: await decryptMessage(message.text, userId) };
  }
  if (message.type !== 'text' && message.fileData?.startsWith('skyline-e2e:v4:')) {
    try {
      const payload = unpackAttachmentPayload(await decryptBytes(message.fileData, userId));
      if (!payload || !ALLOWED_ATTACHMENT_TYPES.has(payload.metadata.contentType) || !payload.data.length || payload.data.length > 2 * 1024 * 1024) {
        throw new Error('Invalid encrypted attachment');
      }
      let binary = '';
      for (let offset = 0; offset < payload.data.length; offset += 0x8000) {
        binary += String.fromCharCode(...payload.data.subarray(offset, offset + 0x8000));
      }
      return {
        ...message,
        type: payload.metadata.contentType.startsWith('image/') ? 'image' : 'file',
        fileName: payload.metadata.fileName,
        contentType: payload.metadata.contentType,
        fileData: `data:${payload.metadata.contentType};base64,${btoa(binary)}`,
      };
    } catch {
      return { ...message, type: 'file', fileName: 'Зашифрованное вложение недоступно', fileData: '' };
    }
  }
  return message;
}

export default function Chats() {
  const navigate = useNavigate();
  const { user: currentUser, e2eeStatus } = useAuth();
  const showToast = useToast();
  const { startCall } = useCallActions();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(() => new Set());
  const [activeChat, setActiveChat] = useState<(User & { nickname?: string }) | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [searchingHistory, setSearchingHistory] = useState(false);
  const [searchedHistoryPages, setSearchedHistoryPages] = useState(0);
  const [text, setText] = useState('');
  const [chatSearch, setChatSearch] = useState('');
  const [activeSearchResult, setActiveSearchResult] = useState(0);
  const [chatError, setChatError] = useState('');
  const [sending, setSending] = useState(false);
  const [openMessageMenu, setOpenMessageMenu] = useState<string | null>(null);
  const [messageMenuPosition, setMessageMenuPosition] = useState({ x: 0, y: 0 });
  const [messageMenuClosing, setMessageMenuClosing] = useState(false);
  const [pinningMessageId, setPinningMessageId] = useState<string | null>(null);
  const [activePinnedIndex, setActivePinnedIndex] = useState(0);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<ChatMessage | null>(null);
  const [lightboxClosing, setLightboxClosing] = useState(false);
  const [profilePanelOpen, setProfilePanelOpen] = useState(false);
  const [profilePanelClosing, setProfilePanelClosing] = useState(false);
  const [chatProfile, setChatProfile] = useState<User | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searching, setSearching] = useState(false);
  const [panelError, setPanelError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [messageEditDraft, setMessageEditDraft] = useState('');
  const [userContextMenu, setUserContextMenu] = useState<{
    user: User & { nickname?: string };
    contact: Contact | null;
    x: number;
    y: number;
  } | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyingMessage, setReplyingMessage] = useState<ChatMessage | null>(null);
  const [replyPreviews, setReplyPreviews] = useState<Record<string, ChatMessage | null>>({});
  const [forwardingMessage, setForwardingMessage] = useState<ChatMessage | null>(null);
  const [forwardSearch, setForwardSearch] = useState('');
  const [forwarding, setForwarding] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesListRef = useRef<HTMLDivElement>(null);
  const pendingScrollHeightRef = useRef<number | null>(null);
  const messageRefs = useRef(new Map<string, HTMLDivElement>());
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const messageFormRef = useRef<HTMLFormElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const incomingTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageMenuCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lightboxCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinnedHighlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileRequestRef = useRef(0);
  const typingRecipientRef = useRef<string | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeChatIdRef = useRef<string | null>(null);
  const activeChatId = activeChat ? String(activeChat.id) : null;

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  const stopTyping = (recipientId = typingRecipientRef.current) => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    if (recipientId && typingRecipientRef.current === recipientId) {
      getSocket()?.emit('typing', { recipientId, isTyping: false });
      typingRecipientRef.current = null;
    }
  };

  useEffect(() => {
    async function loadUsers() {
      try {
        const res = await api.get<Contact[]>('/contacts');
        setContacts(res.data.filter((contact) => contact.id !== currentUser?.id && !contact.chatHidden));
      } catch (e) {
        console.error('Ошибка загрузки контактов:', e);
        setPanelError('Не удалось загрузить контакты.');
        showToast('Не удалось загрузить контакты.', 'error');
      } finally {
        setLoading(false);
      }
    }
    loadUsers();
  }, [currentUser?.id, showToast]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !currentUser?.id) return;

    const handleNewMessage = (event: { action: string; senderId?: string }) => {
      if (event.action !== 'created') return;
      if (event.senderId && event.senderId !== currentUser.id && event.senderId !== activeChatIdRef.current) {
        showToast('Новое сообщение в другом чате.', 'info');
      }
      void api.get<Contact[]>('/contacts').then((response) => {
        setContacts(response.data.filter((contact) => contact.id !== currentUser.id && !contact.chatHidden));
      }).catch((error: unknown) => {
        console.error('Не удалось обновить список контактов после нового сообщения:', error);
      });
    };

    socket.on('message_changed', handleNewMessage);
    return () => {
      socket.off('message_changed', handleNewMessage);
    };
  }, [currentUser?.id, showToast]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query.startsWith('@') || query.length < 4) return;

    let isCurrentSearch = true;
    const timeout = setTimeout(async () => {
      setSearching(true);
      setPanelError('');
      try {
        const res = await api.get<User[]>('/users/search', { params: { q: query } });
        if (isCurrentSearch) {
          setSearchResults(res.data.filter((user) => user.id !== currentUser?.id));
        }
      } catch (error) {
        console.error('Ошибка поиска пользователей:', error);
        if (isCurrentSearch) {
          setPanelError('Не удалось выполнить поиск пользователей.');
          showToast('Не удалось выполнить поиск пользователей.', 'error');
        }
      } finally {
        if (isCurrentSearch) setSearching(false);
      }
    }, 250);

    return () => {
      isCurrentSearch = false;
      clearTimeout(timeout);
    };
  }, [searchQuery, currentUser?.id, showToast]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handlePresenceSnapshot = (presence: { userIds: string[] }) => {
      setOnlineUsers(new Set((presence.userIds || []).map(String)));
    };
    const handleUserOnline = (presence: { userId: string }) => {
      setOnlineUsers((current) => new Set(current).add(String(presence.userId)));
    };
    const handleUserOffline = (presence: { userId: string; lastSeen?: string }) => {
      setOnlineUsers((current) => {
        const next = new Set(current);
        next.delete(String(presence.userId));
        return next;
      });
      if (presence.lastSeen) {
        setContacts((current) => current.map((contact) =>
          contact.id === String(presence.userId) ? { ...contact, lastSeen: presence.lastSeen } : contact,
        ));
        setSearchResults((current) => current.map((user) =>
          user.id === String(presence.userId) ? { ...user, lastSeen: presence.lastSeen } : user,
        ));
        setActiveChat((current) =>
          current?.id === String(presence.userId) ? { ...current, lastSeen: presence.lastSeen } : current,
        );
        setChatProfile((current) =>
          current?.id === String(presence.userId) ? { ...current, lastSeen: presence.lastSeen } : current,
        );
      }
    };
    const requestPresence = () => socket.emit('get_presence');
    const handleDisconnect = () => setOnlineUsers(new Set());

    socket.on('presence_snapshot', handlePresenceSnapshot);
    socket.on('user_online', handleUserOnline);
    socket.on('user_offline', handleUserOffline);
    socket.on('connect', requestPresence);
    socket.on('disconnect', handleDisconnect);
    requestPresence();

    return () => {
      socket.off('presence_snapshot', handlePresenceSnapshot);
      socket.off('user_online', handleUserOnline);
      socket.off('user_offline', handleUserOffline);
      socket.off('connect', requestPresence);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  useEffect(() => {
    if (incomingTypingTimeoutRef.current) {
      clearTimeout(incomingTypingTimeoutRef.current);
      incomingTypingTimeoutRef.current = null;
    }

    if (!activeChat) return;

    const socket = getSocket();
    if (!socket) return;

    const handleUserTyping = (presence: { userId: string; username?: string; isTyping: boolean }) => {
      if (String(presence.userId) !== String(activeChat.id)) return;

      if (incomingTypingTimeoutRef.current) {
        clearTimeout(incomingTypingTimeoutRef.current);
        incomingTypingTimeoutRef.current = null;
      }

      if (presence.isTyping) {
        setTypingUser(presence.username || activeChat.username || 'Пользователь');
        incomingTypingTimeoutRef.current = setTimeout(() => setTypingUser(null), 2500);
      } else {
        setTypingUser(null);
      }
    };

    socket.on('user_typing', handleUserTyping);
    return () => {
      socket.off('user_typing', handleUserTyping);
      if (incomingTypingTimeoutRef.current) {
        clearTimeout(incomingTypingTimeoutRef.current);
        incomingTypingTimeoutRef.current = null;
      }
    };
  }, [activeChat]);

  useEffect(() => () => {
    stopTyping();
    if (incomingTypingTimeoutRef.current) {
      clearTimeout(incomingTypingTimeoutRef.current);
    }
    if (messageMenuCloseTimeoutRef.current) clearTimeout(messageMenuCloseTimeoutRef.current);
    if (lightboxCloseTimeoutRef.current) clearTimeout(lightboxCloseTimeoutRef.current);
    if (profileCloseTimeoutRef.current) clearTimeout(profileCloseTimeoutRef.current);
    if (pinnedHighlightTimeoutRef.current) clearTimeout(pinnedHighlightTimeoutRef.current);
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  }, []);

  const closeMessageMenu = useCallback(() => {
    if (!openMessageMenu || messageMenuClosing) return;
    setMessageMenuClosing(true);
    messageMenuCloseTimeoutRef.current = setTimeout(() => {
      setOpenMessageMenu(null);
      setMessageMenuClosing(false);
      messageMenuCloseTimeoutRef.current = null;
    }, 140);
  }, [openMessageMenu, messageMenuClosing]);

  const closeLightbox = useCallback(() => {
    if (!lightboxImage || lightboxClosing) return;
    setLightboxClosing(true);
    lightboxCloseTimeoutRef.current = setTimeout(() => {
      setLightboxImage(null);
      setLightboxClosing(false);
      lightboxCloseTimeoutRef.current = null;
    }, 180);
  }, [lightboxImage, lightboxClosing]);

  const closeProfilePanel = useCallback(() => {
    if (!profilePanelOpen || profilePanelClosing) return;
    setProfilePanelClosing(true);
    profileCloseTimeoutRef.current = setTimeout(() => {
      setProfilePanelOpen(false);
      setProfilePanelClosing(false);
      profileCloseTimeoutRef.current = null;
    }, 180);
  }, [profilePanelOpen, profilePanelClosing]);

  useEffect(() => {
    if (!openMessageMenu && !lightboxImage && !profilePanelOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('[data-message-menu]') || event.target.closest('[data-message-menu-trigger]') || event.target.closest('[data-emoji-picker]')) return;
      closeMessageMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMessageMenu();
        closeLightbox();
        closeProfilePanel();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMessageMenu, lightboxImage, profilePanelOpen, messageMenuClosing, lightboxClosing, closeMessageMenu, closeLightbox, closeProfilePanel]);

  useLayoutEffect(() => {
    if (pendingScrollHeightRef.current !== null && messagesListRef.current) {
      const heightDifference = messagesListRef.current.scrollHeight - pendingScrollHeightRef.current;
      messagesListRef.current.scrollTop += heightDifference;
      pendingScrollHeightRef.current = null;
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat?.id, messages.length]);

  useLayoutEffect(() => {
    const input = textInputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 144)}px`;
  }, [text]);

  const refreshMessages = async (userId: string, before?: string) => {
    const response = await api.get<ChatMessage[]>(`/messages/${userId}`, {
      params: { limit: 20, ...(before ? { before } : {}) },
    });
    const decryptedMessages = await Promise.all(
      response.data.map((message) => decryptChatMessage(message, currentUser?.id)),
    );
    if (activeChatIdRef.current !== String(userId)) return decryptedMessages;
    if (before) {
      pendingScrollHeightRef.current = messagesListRef.current?.scrollHeight ?? null;
      setMessages((current) => {
        const existingIds = new Set(current.map((message) => message.id));
        return [...decryptedMessages.filter((message) => !existingIds.has(message.id)), ...current];
      });
    } else {
      setMessages(decryptedMessages);
    }
    setHasMoreMessages(decryptedMessages.length === 20);
    return decryptedMessages;
  };

  useEffect(() => {
    const missingReplyIds = [...new Set(messages
      .map((message) => message.replyTo)
      .filter((messageId): messageId is string => typeof messageId === 'string' && messageId.length > 0 && !(messageId in replyPreviews)))];
    if (!missingReplyIds.length || !currentUser?.id) return;

    let active = true;
    void Promise.all(missingReplyIds.map(async (messageId) => {
      try {
        const response = await api.get<ChatMessage>(`/messages/${messageId}/preview`);
        return [messageId, await decryptChatMessage(response.data, currentUser.id)] as const;
      } catch {
        return [messageId, null] as const;
      }
    })).then((entries) => {
      if (active) setReplyPreviews((current) => ({ ...current, ...Object.fromEntries(entries) }));
    });

    return () => { active = false; };
  }, [messages, currentUser?.id, replyPreviews]);

  const loadOlderMessages = async () => {
    if (!activeChat || loadingOlderMessages || !hasMoreMessages || !messages.length) return;
    setLoadingOlderMessages(true);
    try {
      await refreshMessages(String(activeChat.id), messages[0].id);
    } catch (error) {
      console.error('Не удалось загрузить предыдущие сообщения:', error);
      showToast('Не удалось загрузить более старые сообщения.', 'error');
    } finally {
      setLoadingOlderMessages(false);
    }
  };

  const searchEntireHistory = async () => {
    if (!activeChat || !hasMoreMessages || searchingHistory || !messages.length) return;
    const chatId = String(activeChat.id);
    let cursor = messages[0].id;
    let pages = 0;
    setSearchingHistory(true);
    setSearchedHistoryPages(0);
    try {
      while (cursor && activeChatIdRef.current === chatId) {
        const response = await api.get<ChatMessage[]>(`/messages/${chatId}`, { params: { limit: 20, before: cursor } });
        const page = await Promise.all(response.data.map((message) => decryptChatMessage(message, currentUser?.id)));
        if (activeChatIdRef.current !== chatId) break;
        if (!page.length) {
          setHasMoreMessages(false);
          break;
        }
        setMessages((current) => {
          const currentIds = new Set(current.map((message) => message.id));
          return [...page.filter((message) => !currentIds.has(message.id)), ...current];
        });
        cursor = page[0].id;
        pages += 1;
        setSearchedHistoryPages(pages);
        setHasMoreMessages(page.length === 20);
        if (page.length < 20) break;
      }
    } catch (error) {
      console.error('Не удалось выполнить поиск по всей истории:', error);
      showToast('Не удалось загрузить часть истории для поиска.', 'error');
    } finally {
      setSearchingHistory(false);
    }
  };

  const openChatProfile = async () => {
    if (!activeChat) return;
    const requestId = ++profileRequestRef.current;
    setChatProfile(activeChat);
    setProfileError('');
    setProfilePanelClosing(false);
    if (profileCloseTimeoutRef.current) clearTimeout(profileCloseTimeoutRef.current);
    setProfilePanelOpen(true);
    setProfileLoading(true);
    try {
      const response = await api.get<User>(`/users/${activeChat.id}`);
      if (requestId === profileRequestRef.current) setChatProfile(response.data);
    } catch (error) {
      console.error('Не удалось загрузить профиль собеседника:', error);
      if (requestId === profileRequestRef.current) {
        setProfileError('Не удалось загрузить актуальный профиль. Показаны доступные данные.');
      }
    } finally {
      if (requestId === profileRequestRef.current) setProfileLoading(false);
    }
  };

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !activeChat) return;

    const handleMessageChanged = (event: { messageId: string; action: string; senderId?: string; receiverId?: string; groupId?: string; message?: Partial<ChatMessage> }) => {
      if (!event?.messageId) return;
      if (event.groupId) return;
      if (
        event.senderId
        && event.receiverId
        && event.senderId !== activeChat.id
        && event.receiverId !== activeChat.id
      ) return;
      if (event.action === 'deleted') {
        setMessages((previous) => previous.filter((message) => message.id !== event.messageId));
        return;
      }
      if (event.message) {
        const updatedMessage = event.message;
        void (async () => {
          const text = updatedMessage.text && isEncryptedMessage(updatedMessage.text)
            ? await decryptMessage(updatedMessage.text, currentUser?.id)
            : updatedMessage.text;
          setMessages((previous) => previous.map((message) =>
            message.id === event.messageId
              ? { ...message, ...updatedMessage, ...(text === undefined ? {} : { text }) }
              : message,
          ));
        })().catch((error: unknown) => {
          console.error('Не удалось расшифровать обновлённое сообщение:', error);
          setMessages((previous) => previous.map((message) =>
            message.id === event.messageId
              ? {
                ...message,
                text: updatedMessage.text && isEncryptedMessage(updatedMessage.text)
                  ? '[Зашифрованное сообщение]'
                  : message.text,
              }
              : message,
          ));
        });
        return;
      }
      void api.get<ChatMessage[]>(`/messages/${activeChat.id}`, { params: { limit: 20 } }).then((response) => {
        void api.get<Contact[]>('/contacts').then((res) => setContacts(res.data)).catch(() => undefined);
        return Promise.all(response.data.map((message) => decryptChatMessage(message, currentUser?.id)));
      }).then((decryptedMessages) => {
        if (activeChatIdRef.current !== String(activeChat.id)) return;
        setMessages((previous) => {
          const refreshedIds = new Set(decryptedMessages.map((message) => message.id));
          const olderLoaded = previous.filter((message) => !refreshedIds.has(message.id));
          return [...olderLoaded, ...decryptedMessages];
        });
      }).catch((error: unknown) => {
        console.error('Не удалось обновить сообщения:', error);
        showToast('Не удалось обновить переписку.', 'error');
      });
    };

    socket.on('message_changed', handleMessageChanged);
    return () => {
      socket.off('message_changed', handleMessageChanged);
    };
  }, [activeChat, currentUser?.id, showToast]);

  const searchMatches = useMemo(() => chatSearch.trim()
    ? messages.filter((message) =>
      `${message.text} ${message.fileName || ''}`.toLocaleLowerCase().includes(chatSearch.trim().toLocaleLowerCase()),
    )
    : [], [chatSearch, messages]);
  const pinnedMessages = useMemo(() => messages
    .filter((message) => message.pinned)
    .sort((first, second) =>
      new Date(second.pinnedAt || second.createdAt).getTime()
      - new Date(first.pinnedAt || first.createdAt).getTime(),
    ), [messages]);
  const selectedPinnedIndex = Math.min(activePinnedIndex, Math.max(0, pinnedMessages.length - 1));
  const activePinnedMessage = pinnedMessages[selectedPinnedIndex];

  const jumpToPinnedMessage = (message: ChatMessage) => {
    messageRefs.current.get(message.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedMessageId(message.id);
    if (pinnedHighlightTimeoutRef.current) clearTimeout(pinnedHighlightTimeoutRef.current);
    pinnedHighlightTimeoutRef.current = setTimeout(() => {
      setHighlightedMessageId(null);
      pinnedHighlightTimeoutRef.current = null;
    }, 1800);
  };

  const navigatePinnedMessage = (index: number) => {
    const normalizedIndex = (index + pinnedMessages.length) % pinnedMessages.length;
    setActivePinnedIndex(normalizedIndex);
    const message = pinnedMessages[normalizedIndex];
    if (message) jumpToPinnedMessage(message);
  };
  const selectedSearchResult = Math.min(activeSearchResult, Math.max(0, searchMatches.length - 1));

  useEffect(() => {
    const message = searchMatches[selectedSearchResult];
    if (message) {
      messageRefs.current.get(message.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [searchMatches, selectedSearchResult]);

  const handleSelectChat = async (user: User & { nickname?: string }) => {
    stopTyping();
    setTypingUser(null);
    setActivePinnedIndex(0);
    profileRequestRef.current += 1;
    setProfilePanelOpen(false);
    setChatProfile(null);
    setActiveChat(user);
    setMessages([]);
    setText(readChatDraft(currentUser?.id, String(user.id)));
    setReplyingMessage(null);
    setEditingMessageId(null);
    setHasMoreMessages(false);
    setLoadingMessages(true);
    setChatError('');
    setChatSearch('');
    try {
      await refreshMessages(user.id);
    } catch (e) {
      console.error("Ошибка загрузки истории:", e);
      setChatError('Не удалось загрузить историю сообщений.');
      showToast('Не удалось загрузить историю сообщений.', 'error');
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSaveContact = async (user: User, existingNickname = '') => {
    const nickname = window.prompt(
      existingNickname ? 'Изменить имя контакта' : 'Как записать пользователя в контактах?',
      existingNickname || user.displayName || user.username,
    );
    if (nickname === null) return;
    if (!nickname.trim()) {
      setPanelError('Имя контакта не может быть пустым.');
      showToast('Имя контакта не может быть пустым.', 'error');
      return;
    }

    try {
      const res = await api.put('/contacts', { userId: user.id, nickname: nickname.trim() });
      setContacts((current) => {
        const updated = { ...user, nickname: res.data.contact.nickname };
        return [updated, ...current.filter((contact) => contact.id !== user.id)];
      });
      setActiveChat((current) => current?.id === user.id ? { ...current, nickname: res.data.contact.nickname } : current);
      setPanelError('');
    } catch (error) {
      console.error('Ошибка сохранения контакта:', error);
      setPanelError('Не удалось сохранить контакт.');
      showToast('Не удалось сохранить контакт.', 'error');
    }
  };

  const handleRemoveContact = async (contact: Contact) => {
    if (!window.confirm(`Удалить «${contact.nickname}» из контактов?`)) return;
    try {
      await api.delete(`/contacts/${contact.id}`);
      setContacts((current) => current.filter((item) => item.id !== contact.id));
    } catch (error) {
      console.error('Ошибка удаления контакта:', error);
      setPanelError('Не удалось удалить контакт.');
      showToast('Не удалось удалить контакт.', 'error');
    }
  };

  const handleDeleteChat = async (contact: Contact) => {
    if (!window.confirm(`Удалить историю чата с «${contact.nickname}» только у вас?`)) return;
    try {
      await api.delete(`/chats/${contact.id}`);
      writeChatDraft(currentUser?.id, String(contact.id), '');
      setContacts((current) => current.filter((item) => item.id !== contact.id));
      if (activeChat?.id === contact.id) {
        stopTyping(contact.id);
        setMessages([]);
        setText('');
        setReplyingMessage(null);
        setActiveChat(null);
      }
      showToast('История чата удалена только у вас.', 'success');
    } catch (error) {
      console.error('Не удалось удалить чат:', error);
      showToast('Не удалось удалить чат.', 'error');
    }
  };

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !activeChat || sending) return;
    if (!canSendEncryptedMessages(e2eeStatus)) { showToast('Отправка приостановлена: сначала восстановите ключ переписки на этом устройстве.', 'error'); return; }

    const targetChat = activeChat;
    const replyTarget = replyingMessage;
    const msgText = text;
    stopTyping(String(targetChat.id));
    setSending(true);
    setChatError('');

    try {
      if (!currentUser?.id) throw new Error('Не удалось определить текущего пользователя.');

      const [recipientKeyResponse, ownKeyResponse] = await Promise.all([
        keysApi.get(String(targetChat.id)),
        keysApi.me(),
      ]);
      const recipientKey = recipientKeyResponse.data?.publicKey;
      const ownKey = ownKeyResponse.data?.publicKey;
      if (!recipientKey || !ownKey) {
        throw new Error('Не удалось получить ключи шифрования. Сообщение не отправлено.');
      }
      const encryptedText = await encryptMessage(msgText, [
        { userId: String(targetChat.id), publicKey: recipientKey },
        { userId: currentUser.id, publicKey: ownKey },
      ]);
      if (!encryptedText.startsWith('skyline-e2e:v3:')) {
        throw new Error('Не удалось зашифровать сообщение. Оно не было отправлено.');
      }

      const response = replyTarget
        ? await api.post<ChatMessage>(`/messages/${replyTarget.id}/reply`, { text: encryptedText, type: 'text' })
        : await api.post<ChatMessage>('/messages', {
          receiverId: targetChat.id,
          text: encryptedText,
          type: 'text',
        });
      if (activeChatIdRef.current === String(targetChat.id)) {
        setMessages((previous) => [...previous, { ...response.data, text: msgText }]);
        setText('');
        setReplyingMessage(null);
      }
      writeChatDraft(currentUser.id, String(targetChat.id), '');
      void api.get<Contact[]>('/contacts').then((res) => setContacts(res.data)).catch(() => undefined);
    } catch (err) {
      console.error("Ошибка отправки:", err);
      const detail = isAxiosError(err) && err.response?.data?.detail
        ? err.response.data.detail
        : 'Не удалось отправить сообщение. Проверьте соединение с сервером.';
      if (activeChatIdRef.current === String(targetChat.id)) {
        setChatError(detail);
        showToast(
          isAxiosError(err) && err.response?.status === 429
            ? 'Слишком часто отправляете сообщения. Подождите немного.'
            : detail,
          'error',
        );
      }
    } finally {
      setSending(false);
    }
  };

  const handleAttachment = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !activeChat || sending) return;
    if (!canSendEncryptedMessages(e2eeStatus)) { showToast('Отправка приостановлена: сначала восстановите ключ переписки на этом устройстве.', 'error'); return; }
    const targetChat = activeChat;
    const replyTarget = replyingMessage;
    if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
      setChatError('Можно отправить JPG, PNG, GIF, WebP, PDF, TXT, CSV или ZIP.');
      showToast('Неподдерживаемый формат файла.', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setChatError('Размер вложения не должен превышать 2 МБ.');
      showToast('Размер вложения не должен превышать 2 МБ.', 'error');
      return;
    }
    if (!file.size) {
      setChatError('Нельзя отправить пустой файл.');
      showToast('Нельзя отправить пустой файл.', 'error');
      return;
    }

    setSending(true);
    setChatError('');
    try {
      if (!currentUser?.id) throw new Error('Не удалось определить текущего пользователя.');
      const [recipientKeyResponse, ownKeyResponse] = await Promise.all([
        keysApi.get(String(targetChat.id)),
        keysApi.me(),
      ]);
      const recipients = [
        { userId: String(targetChat.id), publicKey: recipientKeyResponse.data?.publicKey || '' },
        { userId: currentUser.id, publicKey: ownKeyResponse.data?.publicKey || '' },
      ];
      if (recipients.some((recipient) => !recipient.publicKey)) {
        throw new Error('Не удалось получить ключи участников. Вложение не отправлено.');
      }
      const packed = packAttachmentPayload(new Uint8Array(await file.arrayBuffer()), {
        fileName: file.name,
        contentType: file.type,
      });
      const encryptedFileData = await encryptBytes(packed, recipients);
      if (!encryptedFileData.startsWith('skyline-e2e:v4:')) {
        throw new Error('Не удалось зашифровать вложение. Оно не было отправлено.');
      }
      const response = replyTarget
        ? await api.post<ChatMessage>(`/messages/${replyTarget.id}/reply`, {
          type: 'file',
          fileData: encryptedFileData,
        })
        : await api.post<ChatMessage>('/messages', {
          receiverId: targetChat.id,
          text: '',
          type: 'file',
          fileName: '',
          contentType: '',
          fileData: encryptedFileData,
        });
      const decryptedMessage = await decryptChatMessage(response.data, currentUser.id);
      if (activeChatIdRef.current === String(targetChat.id)) {
        setMessages((previous) => [...previous, decryptedMessage]);
        setReplyingMessage(null);
      }
      showToast('Файл отправлен.', 'success');
    } catch (error) {
      console.error('Ошибка отправки вложения:', error);
      if (activeChatIdRef.current === String(targetChat.id)) {
        setChatError('Не удалось отправить файл. Проверьте его формат и размер.');
        showToast('Не удалось отправить файл. Проверьте формат и размер.', 'error');
      }
    } finally {
      setSending(false);
    }
  };

  const handleDeleteMessage = async (message: ChatMessage) => {
    if (!window.confirm('Удалить это сообщение без возможности восстановления?')) return;
    try {
      await api.delete(`/messages/${message.id}`);
      setMessages((previous) => previous.filter((item) => item.id !== message.id));
      closeMessageMenu();
      setChatError('');
      showToast('Сообщение удалено.', 'success');
    } catch (error) {
      console.error('Ошибка удаления сообщения:', error);
      setChatError('Не удалось удалить сообщение.');
      showToast('Не удалось удалить сообщение.', 'error');
    }
  };

  const handleEditMessage = async (message: ChatMessage) => {
    const rawText = messageEditDraft.trim();
    if (!rawText || !activeChat || !currentUser?.id) return;
    if (!canSendEncryptedMessages(e2eeStatus)) { showToast('Изменение приостановлено: сначала восстановите ключ переписки на этом устройстве.', 'error'); return; }
    try {
      const [recipientKeyResponse, ownKeyResponse] = await Promise.all([
        keysApi.get(String(activeChat.id)),
        keysApi.me(),
      ]);
      const recipientKey = recipientKeyResponse.data.publicKey;
      const ownKey = ownKeyResponse.data.publicKey;
      if (!recipientKey || !ownKey) {
        throw new Error('Не удалось получить ключи шифрования. Изменение не сохранено.');
      }
      const encryptedText = await encryptMessage(rawText, [
        { userId: String(activeChat.id), publicKey: recipientKey },
        { userId: currentUser.id, publicKey: ownKey },
      ]);
      if (!encryptedText.startsWith('skyline-e2e:v3:')) {
        throw new Error('Не удалось зашифровать текст. Изменение не сохранено.');
      }

      const response = await api.patch<ChatMessage>(`/messages/${message.id}`, { text: encryptedText });
      setMessages((previous) => previous.map((item) =>
        item.id === message.id ? { ...response.data, text: rawText } : item,
      ));
      setEditingMessageId(null);
      setMessageEditDraft('');
      showToast('Сообщение изменено.', 'success');
    } catch (error) {
      console.error('Не удалось изменить сообщение:', error);
      showToast('Не удалось изменить сообщение.', 'error');
    }
  };

  const handleForwardMessage = async (target: Contact) => {
    const source = forwardingMessage;
    if (!source || !currentUser?.id || forwarding) return;
    if (!canSendEncryptedMessages(e2eeStatus)) { showToast('Пересылка приостановлена: сначала восстановите ключ переписки на этом устройстве.', 'error'); return; }
    setForwarding(true);
    try {
      let payload: { targetUserId: string; text?: string; type: 'text' | 'file'; fileData?: string };
      if (source.type === 'text') {
        const [recipientKeyResponse, ownKeyResponse] = await Promise.all([
          keysApi.get(String(target.id)),
          keysApi.me(),
        ]);
        const recipientKey = recipientKeyResponse.data?.publicKey;
        const ownKey = ownKeyResponse.data?.publicKey;
        if (!recipientKey || !ownKey) throw new Error('Не удалось получить ключи получателей. Пересылка не выполнена.');
        const encryptedText = await encryptMessage(source.text, [
          { userId: String(target.id), publicKey: recipientKey },
          { userId: currentUser.id, publicKey: ownKey },
        ]);
        if (!encryptedText.startsWith('skyline-e2e:v3:')) throw new Error('Не удалось зашифровать пересылаемое сообщение.');
        payload = { targetUserId: String(target.id), text: encryptedText, type: 'text' };
      } else {
        if (!source.fileData || !source.fileName || !source.contentType || !ALLOWED_ATTACHMENT_TYPES.has(source.contentType)) {
          throw new Error('Исходное вложение недоступно для пересылки.');
        }
        const sourceBlob = await fetch(source.fileData).then((response) => {
          if (!response.ok) throw new Error('Не удалось прочитать вложение.');
          return response.blob();
        });
        if (!sourceBlob.size || sourceBlob.size > 2 * 1024 * 1024) throw new Error('Вложение превышает допустимый размер.');
        const [recipientKeyResponse, ownKeyResponse] = await Promise.all([
          keysApi.get(String(target.id)),
          keysApi.me(),
        ]);
        const recipients = [
          { userId: String(target.id), publicKey: recipientKeyResponse.data?.publicKey || '' },
          { userId: currentUser.id, publicKey: ownKeyResponse.data?.publicKey || '' },
        ];
        if (recipients.some((recipient) => !recipient.publicKey)) throw new Error('Не удалось получить ключи получателей. Пересылка не выполнена.');
        const packed = packAttachmentPayload(new Uint8Array(await sourceBlob.arrayBuffer()), {
          fileName: source.fileName,
          contentType: source.contentType,
        });
        const encryptedFile = await encryptBytes(packed, recipients);
        if (!encryptedFile.startsWith('skyline-e2e:v4:')) throw new Error('Не удалось зашифровать вложение.');
        payload = { targetUserId: String(target.id), type: 'file', fileData: encryptedFile };
      }

      const response = await api.post<ChatMessage>(`/messages/${source.id}/forward`, payload);
      if (activeChatIdRef.current === String(target.id)) {
        const decrypted = await decryptChatMessage(response.data, currentUser.id);
        setMessages((current) => [...current, decrypted]);
      }
      setForwardingMessage(null);
      setForwardSearch('');
      showToast(`Сообщение переслано ${target.nickname || target.displayName || target.username}.`, 'success');
    } catch (error) {
      console.error('Не удалось переслать сообщение:', error);
      showToast(error instanceof Error ? error.message : 'Не удалось переслать сообщение.', 'error');
    } finally {
      setForwarding(false);
    }
  };

  const handleExportChat = async (format: 'json' | 'html') => {
    if (!activeChat) return;
    try {
      const response = await api.get(`/messages/${activeChat.id}/export`, {
        params: { format },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `pulse-chat-${activeChat.username}.${format}`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(`История скачана в формате ${format.toUpperCase()}.`, 'success');
    } catch (error) {
      console.error('Не удалось экспортировать переписку:', error);
      showToast('Не удалось экспортировать историю чата.', 'error');
    }
  };

  const handleReaction = async (message: ChatMessage, emoji: string) => {
    const previousReactions = message.reactions;
    const alreadyReacted = previousReactions.some((reaction) =>
      reaction.userId === currentUser?.id && reaction.emoji === emoji,
    );
    const updatedReactions = alreadyReacted
      ? previousReactions.filter((reaction) => !(reaction.userId === currentUser?.id && reaction.emoji === emoji))
      : [...previousReactions, { userId: String(currentUser?.id), emoji }];
    setMessages((previous) => previous.map((item) =>
      item.id === message.id ? { ...item, reactions: updatedReactions } : item,
    ));
    try {
      await api.post(`/messages/${message.id}/reactions`, { emoji });
      closeMessageMenu();
      setChatError('');
    } catch (error) {
      console.error('Ошибка сохранения реакции:', error);
      setMessages((previous) => previous.map((item) =>
        item.id === message.id ? { ...item, reactions: previousReactions } : item,
      ));
      setChatError('Не удалось сохранить реакцию.');
      showToast('Не удалось сохранить реакцию.', 'error');
    }
  };

  const handleTogglePin = async (message: ChatMessage) => {
    if (!activeChat || pinningMessageId) return;
    setPinningMessageId(message.id);
    try {
      await api.post<{ status: string; pinned: boolean }>(`/messages/${message.id}/pin`, {
        pinned: !message.pinned,
      });
      const refreshedMessages = await refreshMessages(String(activeChat.id));
      const savedMessage = refreshedMessages.find((item) => item.id === message.id);
      if (!savedMessage || savedMessage.pinned !== !message.pinned) {
        throw new Error('Сервер не подтвердил сохранение закрепления.');
      }
      if (!message.pinned) setActivePinnedIndex(0);
      closeMessageMenu();
      setChatError('');
      showToast(message.pinned ? 'Сообщение откреплено.' : 'Сообщение закреплено.', 'success');
    } catch (error) {
      console.error('Ошибка закрепления сообщения:', error);
      const detail = isAxiosError(error) && error.response?.status === 404
        ? 'На сервере не найден маршрут закрепления. Обновите Python API и повторите попытку.'
        : 'Не удалось сохранить закрепление. Проверьте соединение и повторите попытку.';
      setChatError(detail);
      showToast(detail, 'error');
    } finally {
      setPinningMessageId(null);
    }
  };

  const showMessageMenu = (messageId: string, x: number, y: number) => {
    if (messageMenuCloseTimeoutRef.current) clearTimeout(messageMenuCloseTimeoutRef.current);
    setMessageMenuClosing(false);
    setOpenMessageMenu(messageId);
    setMessageMenuPosition({
      x: Math.max(8, Math.min(x, window.innerWidth - 224)),
      y: Math.max(8, Math.min(y, window.innerHeight - 196)),
    });
  };

  const handleChatSearch = (value: string) => {
    setChatSearch(value);
    setActiveSearchResult(0);
  };

  const handleTextChange = (value: string) => {
    setText(value);
    writeChatDraft(currentUser?.id, activeChatId, value);
    if (!activeChat) return;

    const recipientId = String(activeChat.id);
    if (!value.trim()) {
      stopTyping(recipientId);
      return;
    }

    const socket = getSocket();
    if (!socket) return;

    if (typingRecipientRef.current !== recipientId) {
      stopTyping();
      socket.emit('typing', { recipientId, isTyping: true });
      typingRecipientRef.current = recipientId;
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => stopTyping(recipientId), 1500);
  };

  const insertEmoji = (emoji: string) => {
    const input = textInputRef.current;
    const start = input?.selectionStart ?? text.length;
    const end = input?.selectionEnd ?? text.length;
    handleTextChange(text.slice(0, start) + emoji + text.slice(end));
    requestAnimationFrame(() => {
      input?.focus();
      const caret = start + emoji.length;
      input?.setSelectionRange(caret, caret);
    });
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setSearchResults([]);
    setSearching(false);
    setPanelError('');
    if (!value.trim().startsWith('@') || value.trim().length < 4) return;
    setSearching(true);
  };

  const visibleUsers: (User & { nickname?: string })[] = searchQuery.trim() ? searchResults : contacts;

  return (
    <div className="animate-fade-in absolute left-0 top-0 flex h-full w-full overflow-hidden bg-bg-base font-sans text-t-primary selection:bg-accent/30">
      
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { font-family: 'Inter', sans-serif; }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(var(--accent-rgb), 0.3); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(16, 185, 129, 0.6); }
        @keyframes slideIn { from { opacity: 0; transform: translateY(15px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-5px); } }
        .animate-slide-in { animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .glass-panel { background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.05); }
        .glass-active { background: linear-gradient(90deg, rgba(var(--accent-rgb), 0.15) 0%, rgba(var(--accent-rgb), 0.05) 100%); border-left: 3px solid var(--accent); }
      `}</style>

      {/* 1. ЛЕВАЯ КОЛОНКА */}
      <div className={`${activeChat ? 'hidden md:flex md:w-[340px]' : 'flex w-full'} shrink-0 flex-col glass-panel border-r border-slate-800/60 h-full z-10 relative`}>
        <WorkspaceSidebarHeader
          searchValue={searchQuery}
          onSearchChange={handleSearchChange}
          searchPlaceholder="Найти по @username целиком..."
        />
        {searchQuery.trim() && !searchQuery.trim().startsWith('@') && (
          <p className="px-4 pt-2 text-[10px] text-slate-500">Укажите полный username вместе с @, например @darius_writer.</p>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 px-2 flex justify-between">
            <span>{searchQuery.trim() ? `Результаты (${visibleUsers.length})` : `Чаты (${contacts.length})`}</span>
            <span className="text-[10px] normal-case tracking-normal text-slate-600">
              {onlineUsers.size} в сети
            </span>
          </h3>
          
          {loading && (
            <div role="status" aria-label="Загрузка контактов" className="space-y-2 px-1">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="flex animate-pulse items-center gap-3 rounded-2xl p-2.5">
                  <div className="h-10 w-10 rounded-xl bg-slate-800" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-2/3 rounded bg-slate-800" />
                    <div className="h-2 w-1/2 rounded bg-slate-800/70" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {searching && <p className="text-xs text-slate-500 px-2 animate-pulse">Ищем пользователей...</p>}
          {panelError && <p role="alert" className="px-2 py-1 text-xs text-rose-300">{panelError}</p>}
          
          {!loading && !searching && visibleUsers.length === 0 && (
            <p className="px-2 py-3 text-xs text-slate-500">
              {searchQuery.trim() ? 'Точный username не найден. Проверьте @ и написание.' : 'Контактов пока нет. Найдите пользователя по полному @username.'}
            </p>
          )}

          {visibleUsers.map((user, idx) => {
            const contact = contacts.find((item) => item.id === user.id);
            return (
            <button type="button"
              key={user.id} 
              onClick={() => handleSelectChat(contact ? { ...user, nickname: contact.nickname } : user)}
              aria-label={`Открыть чат с ${contact?.nickname || user.displayName || user.username}`}
              onContextMenu={(event) => {
                event.preventDefault();
                setUserContextMenu({
                  user: contact ? { ...user, nickname: contact.nickname } : user,
                  contact: contact ?? null,
                  x: Math.max(8, Math.min(event.clientX, window.innerWidth - 240)),
                  y: Math.max(8, Math.min(event.clientY, window.innerHeight - 300)),
                });
              }}
              aria-haspopup="menu"
              className={`chat-card chat-list-item w-full p-2.5 rounded-2xl text-left cursor-pointer flex items-center gap-3 ${
                activeChat?.id === user.id 
                  ? 'chat-active glass-active shadow-[0_0_15px_rgba(var(--accent-rgb),0.1)]' 
                  : ''
              }`}
              style={{ animationDelay: `${idx * 30}ms` }}
            >
              <div className="relative">
                <div className="w-10 h-10 overflow-hidden rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-sm font-bold text-slate-300">
                  {user.avatarUrl
                    ? <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                    : user.username?.[0]?.toUpperCase()}
                </div>
                <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0f172a] ${onlineUsers.has(String(user.id)) ? 'bg-emerald-500' : 'bg-slate-600'}`}></span>
              </div>
              <span className="flex-1 min-w-0">
                <span className="flex min-w-0 items-center justify-between gap-2 text-xs font-bold text-slate-200">
                  <span className="truncate">{contact?.nickname || user.nickname || user.displayName || user.username}</span>
                  {((user as Contact).unreadCount ?? 0) > 0 && activeChat?.id !== user.id && (
                    <span className="badge-pop grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-white">
                      {(user as Contact).unreadCount! > 99 ? '99+' : (user as Contact).unreadCount}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[10px] text-slate-500">@{user.username}</span>
                <span className="mt-1 block truncate text-[10px] text-slate-600">{user.statusText || (onlineUsers.has(String(user.id)) ? 'В сети' : 'Откройте, чтобы продолжить общение')}</span>
              </span>
            </button>
          );})}
        </div>
      </div>

      {/* 2. ЦЕНТРАЛЬНАЯ КОЛОНКА */}
      <div className={`${activeChat ? 'flex' : 'hidden'} min-w-0 min-h-0 flex-1 flex-col bg-bg-base h-full relative z-0`}>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-accent/10 via-[#090d16] to-black pointer-events-none"></div>

        {activeChat ? (
          <>
            <EncryptionNotice />
            <div className="relative z-10 flex flex-col gap-2 border-b border-slate-800/60 p-2.5 glass-panel sm:gap-3 sm:p-4">
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                  <button type="button" onClick={() => {
                    stopTyping(String(activeChat.id));
                    setTypingUser(null);
                    setActiveChat(null);
                  }} className="md:hidden rounded-xl p-2 text-slate-300 hover:bg-white/10" aria-label="Назад к контактам">
                    <ArrowLeft size={19} />
                  </button>
                  <div className="w-10 h-10 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center font-bold text-slate-200 border border-slate-600/50">
                    {activeChat.avatarUrl
                      ? <img src={activeChat.avatarUrl} alt="" className="h-full w-full rounded-xl object-cover" />
                      : activeChat.username?.[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="flex min-w-0 items-center gap-2 font-bold text-sm text-t-primary">
                      <button type="button" onClick={() => void openChatProfile()} aria-label={`Профиль ${activeChat.displayName || activeChat.username}`} className="truncate text-left transition hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
                        {activeChat.nickname || activeChat.displayName || activeChat.username}
                      </button>
                    </h3>
                    <p className={`text-[10px] flex items-center gap-1 ${onlineUsers.has(String(activeChat.id)) ? 'text-emerald-400' : 'text-slate-500'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${onlineUsers.has(String(activeChat.id)) ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
                      {onlineUsers.has(String(activeChat.id)) ? 'В сети' : formatLastSeen(activeChat.lastSeen)}
                    </p>
                  </div>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <label className="relative min-w-0 flex-1 sm:flex-initial">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      value={chatSearch}
                      onChange={(event) => handleChatSearch(event.target.value)}
                      placeholder="Поиск в переписке"
                      aria-label="Поиск по сообщениям"
                      className="w-full sm:w-36 md:w-44 rounded-xl border border-white/[0.08] bg-white/[0.03] py-2 pl-9 pr-2 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-accent/50"
                    />
                  </label>
                  {chatSearch && (
                    <div className="flex items-center gap-1 text-[10px] text-t-secondary">
                      <span>{searchMatches.length ? `${selectedSearchResult + 1}/${searchMatches.length}` : '0/0'}</span>
                      <button type="button" aria-label="Предыдущий результат" disabled={!searchMatches.length} onClick={() => setActiveSearchResult((index) => (index - 1 + searchMatches.length) % searchMatches.length)} className="rounded p-1 hover:bg-white/10 disabled:opacity-40"><ChevronUp size={14} /></button>
                      <button type="button" aria-label="Следующий результат" disabled={!searchMatches.length} onClick={() => setActiveSearchResult((index) => (index + 1) % searchMatches.length)} className="rounded p-1 hover:bg-white/10 disabled:opacity-40"><ChevronDown size={14} /></button>
                      <button type="button" aria-label="Закрыть поиск" onClick={() => handleChatSearch('')} className="rounded p-1 hover:bg-white/10"><X size={14} /></button>
                    </div>
                  )}
                  {chatSearch && hasMoreMessages && <button type="button" disabled={searchingHistory} onClick={() => void searchEntireHistory()} className="max-w-28 rounded-lg border border-white/10 px-2 py-1.5 text-[10px] leading-tight text-t-secondary hover:border-accent/30 hover:text-accent disabled:opacity-50 sm:max-w-none">{searchingHistory ? `Ищем… ${searchedHistoryPages}` : 'Искать дальше'}</button>}
                  <button type="button" onClick={() => void openChatProfile()} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/[0.08] px-2.5 sm:px-3 py-2 text-xs text-slate-300 transition hover:bg-white/5 hover:text-white">
                    <ContactRound size={15} /> <span className="hidden sm:inline">Профиль</span>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => startCall({ id: String(activeChat.id), name: activeChat.nickname || activeChat.displayName || activeChat.username, avatarUrl: activeChat.avatarUrl }, false)} title="Голосовой звонок" aria-label="Начать голосовой звонок" className="rounded-lg p-2 text-slate-500 transition hover:bg-white/[0.06] hover:text-accent"><Phone size={15} /></button>
                    <button type="button" onClick={() => startCall({ id: String(activeChat.id), name: activeChat.nickname || activeChat.displayName || activeChat.username, avatarUrl: activeChat.avatarUrl }, true)} title="Видеозвонок" aria-label="Начать видеозвонок" className="rounded-lg p-2 text-slate-500 transition hover:bg-white/[0.06] hover:text-accent"><Video size={15} /></button>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" title="Скачать переписку JSON" aria-label="Экспортировать историю чата в JSON" onClick={() => void handleExportChat('json')} className="rounded-lg p-2 text-slate-500 transition hover:bg-white/[0.06] hover:text-accent"><Download size={15} /></button>
                    <button type="button" title="Скачать переписку HTML" aria-label="Экспортировать историю чата в HTML" onClick={() => void handleExportChat('html')} className="rounded-lg p-2 text-slate-500 transition hover:bg-white/[0.06] hover:text-accent"><FileText size={15} /></button>
                  </div>
                </div>
              </div>
              {activePinnedMessage && (
                <div className="pinned-strip flex min-w-0 items-center gap-2 overflow-hidden rounded-2xl border border-amber-300/15 bg-amber-300/[0.06] p-2 shadow-lg sm:ml-[3.25rem] sm:gap-3 sm:p-2.5">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-amber-300/10 text-amber-300">
                    <Pin size={15} />
                  </div>
                  <button
                    type="button"
                    title="Перейти к закреплённому сообщению"
                    onClick={() => jumpToPinnedMessage(activePinnedMessage)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-300">
                      Закреплённое сообщение{pinnedMessages.length > 1 ? ` · ${selectedPinnedIndex + 1} из ${pinnedMessages.length}` : ''}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-amber-100/90">
                      {activePinnedMessage.text || activePinnedMessage.fileName || 'Вложение'}
                    </span>
                  </button>
                  {pinnedMessages.length > 1 && (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        aria-label="Предыдущее закреплённое сообщение"
                        onClick={() => navigatePinnedMessage(selectedPinnedIndex + 1)}
                        className="rounded-lg p-1.5 text-amber-200/70 transition hover:bg-amber-200/10 hover:text-amber-100"
                      >
                        <ChevronLeft size={17} />
                      </button>
                      <button
                        type="button"
                        aria-label="Следующее закреплённое сообщение"
                        onClick={() => navigatePinnedMessage(selectedPinnedIndex - 1)}
                        className="rounded-lg p-1.5 text-amber-200/70 transition hover:bg-amber-200/10 hover:text-amber-100"
                      >
                        <ChevronRight size={17} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div
              ref={messagesListRef}
              onScroll={(event) => {
                if (event.currentTarget.scrollTop <= 48) void loadOlderMessages();
              }}
              className="chat-wallpaper-surface flex-1 min-h-0 p-3 sm:p-6 space-y-4 overflow-y-auto custom-scrollbar relative z-10"
            >
              {chatError && <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.08] px-3 py-2 text-xs text-rose-200">{chatError}</div>}
              {loadingOlderMessages && (
                <div role="status" aria-label="Загружаем сообщения" className="space-y-2 py-2">
                  <div className="h-10 w-2/3 animate-pulse rounded-2xl bg-slate-800/70" />
                  <div className="ml-auto h-10 w-1/2 animate-pulse rounded-2xl bg-accent/50" />
                </div>
              )}
              {loadingMessages && messages.length === 0 && (
                <div role="status" aria-label="Загружаем переписку" className="space-y-3 py-4">
                  {[0, 1, 2, 3].map((item) => (
                    <div key={item} className={`h-12 animate-pulse rounded-2xl bg-slate-800/70 ${item % 2 ? 'ml-auto w-2/3' : 'w-3/4'}`} />
                  ))}
                </div>
              )}
            <div className="text-center text-slate-600 text-[10px] font-mono my-4 flex items-center justify-center gap-2">
                <span className="h-px w-8 bg-slate-800"></span> Начало защищенной сессии <span className="h-px w-8 bg-slate-800"></span>
              </div>
              
              {messages.map((m) => {
                const isMe = m.senderId === currentUser?.id;
                const quotedMessage = m.replyTo
                  ? messages.find((message) => message.id === m.replyTo) || replyPreviews[m.replyTo] || undefined
                  : undefined;
                return (
                  <div key={m.id} ref={(element) => { if (element) messageRefs.current.set(m.id, element); else messageRefs.current.delete(m.id); }} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-slide-in`}>
                    <div className={`message-row-content max-w-[88%] sm:max-w-[80%] ${highlightedMessageId === m.id ? 'pinned-message-highlight' : ''}`}>
                      <div
                        onContextMenu={(event) => {
                          event.preventDefault();
                          showMessageMenu(m.id, event.clientX, event.clientY);
                        }}
                        onTouchStart={(event) => {
                          const touch = event.touches[0];
                          longPressTimerRef.current = setTimeout(() => {
                            showMessageMenu(m.id, touch.clientX, touch.clientY);
                          }, 500);
                        }}
                        onTouchEnd={() => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } }}
                        onTouchMove={() => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } }}
                        className={`chat-message chat-message-bubble max-w-full p-3.5 rounded-2xl text-xs leading-relaxed relative border ${
                          isMe
                            ? 'chat-message-own rounded-br-none shadow-[0_4px_20px_rgba(var(--accent-rgb),0.18)]'
                            : 'chat-message-other rounded-bl-none shadow-lg'
                        }`}
                      >
                        {m.pinned && (
                          <div className="pinned-message-label mb-2 flex items-center gap-1 text-[10px] text-amber-200/90">
                            <Pin size={12} /> Закреплено
                          </div>
                        )}
                        {m.forwardedFrom && <div className="mb-2 flex items-center gap-1 text-[10px] font-medium text-slate-400"><Forward size={11} /> Переслано</div>}
                        {m.type === 'image' && m.fileData ? (
                          localStorage.getItem('skylineMediaPreview') !== 'false'
                            ? <button type="button" onClick={() => { setLightboxClosing(false); setLightboxImage(m); }} aria-label={`Открыть изображение ${m.fileName || ''}`} className="mb-2 block max-w-full cursor-zoom-in rounded-lg focus:outline-none focus:ring-2 focus:ring-accent">
                                <img src={m.fileData} alt={m.fileName || 'Изображение'} className="max-h-[55vh] max-w-full rounded-lg object-contain sm:max-h-72" />
                              </button>
                            : <a href={m.fileData} download={m.fileName || 'image'} className="mb-2 flex items-center gap-2 rounded-lg bg-black/10 p-3 hover:bg-black/20"><FileText size={20} /><span className="max-w-56 break-all">{m.fileName || 'Скачать изображение'}</span></a>
                        ) : m.type === 'file' && m.fileData ? (
                          <a href={m.fileData} download={m.fileName || 'attachment'} className="mb-2 flex items-center gap-2 rounded-lg bg-black/10 p-3 hover:bg-black/20">
                            <FileText size={20} />
                            <span className="max-w-56 break-all">{m.fileName || 'Скачать файл'}</span>
                          </a>
                        ) : null}
                        {editingMessageId === m.id ? (
                          <div className="min-w-48 space-y-2">
                            <textarea value={messageEditDraft} onChange={(event) => setMessageEditDraft(event.target.value)} maxLength={4000} className="w-full rounded-lg border border-white/10 bg-slate-950/50 p-2 text-xs text-white outline-none focus:border-accent/50" />
                            <div className="flex justify-end gap-2">
                              <button type="button" onClick={() => setEditingMessageId(null)} className="text-[10px] text-slate-300">Отмена</button>
                              <button type="button" onClick={() => void handleEditMessage(m)} className="text-[10px] font-semibold text-accent">Сохранить</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {m.replyTo && (
                              <button
                                type="button"
                                disabled={!messages.some((item) => item.id === m.replyTo)}
                                onClick={() => m.replyTo && messageRefs.current.get(m.replyTo)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                                className="mb-2 block w-full rounded-lg border-l-2 border-accent/60 bg-black/15 px-2.5 py-1.5 text-left disabled:cursor-default"
                                aria-label="Перейти к сообщению, на которое ответили"
                              >
                                <p className="text-[9px] font-semibold uppercase tracking-wider text-accent">
                                  {quotedMessage?.senderId === currentUser?.id ? 'Вы' : quotedMessage ? `@${activeChat?.username ?? 'собеседник'}` : 'Ответ на сообщение'}
                                </p>
                                <p className="truncate text-[10px] text-slate-300">
                                  {quotedMessage?.text || (quotedMessage && quotedMessage.type !== 'text' ? '📎 Вложение' : 'Исходное сообщение недоступно')}
                                </p>
                              </button>
                            )}
                            {m.text && <div className="chat-message-content whitespace-pre-wrap break-words">{highlightText(m.text, chatSearch)}</div>}
                            {m.edited && <span className="mt-1 block text-right text-[9px] text-t-secondary">изменено</span>}
                          </>
                        )}
                        <div className={`mt-1.5 flex items-center justify-end gap-1 text-[9px] font-mono ${isMe ? 'text-accent/70' : 'text-t-secondary/70'}`}>
                          <time>{m.createdAt ? formatAppTime(m.createdAt) : ''}</time>
                          {isMe && localStorage.getItem('skylineShowReadReceipts') !== 'false' && (
                            m.read
                              ? <CheckCheck size={13} aria-label="Прочитано" className="text-sky-300" />
                              : <Check size={13} aria-label="Отправлено" />
                          )}
                        </div>
                      </div>
                      {REACTIONS.some((emoji) => m.reactions.some((reaction) => reaction.emoji === emoji)) && (
                        <div className={`mt-1 flex flex-wrap gap-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                          {REACTIONS.map((emoji) => {
                            const matchingReactions = m.reactions.filter((reaction) => reaction.emoji === emoji);
                            if (!matchingReactions.length) return null;
                            const mine = matchingReactions.some((reaction) => reaction.userId === currentUser?.id);
                            return (
                              <button key={emoji} type="button" onClick={() => void handleReaction(m, emoji)} aria-label={`Снять реакцию ${emoji}`} className={`reaction-chip rounded-full border px-2.5 py-1 text-[10px] shadow-sm transition ${mine ? 'border-accent/50 bg-accent/20' : 'border-white/[0.07] bg-slate-900/50 hover:bg-slate-700/70'}`}>
                                {emoji}<span className="ml-1 text-slate-300">{matchingReactions.length}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] sm:p-4 relative z-10">
              {typingUser && (
                <div role="status" className="mb-2 flex items-center gap-2 px-2 text-xs text-t-secondary">
                  <span className="flex gap-1" aria-hidden="true">
                    <span className="h-1 w-1 animate-bounce rounded-full bg-accent" />
                    <span className="h-1 w-1 animate-bounce rounded-full bg-accent [animation-delay:120ms]" />
                    <span className="h-1 w-1 animate-bounce rounded-full bg-accent [animation-delay:240ms]" />
                  </span>
                  <span className="inline-flex items-center gap-1.5">{typingUser}<span className="typing-dots"><span /><span /><span /></span></span>
                </div>
              )}
              <input ref={attachmentInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,text/csv,application/zip" onChange={(event) => void handleAttachment(event)} className="hidden" />
              {replyingMessage && (
                <div className="mb-2 flex items-center gap-3 rounded-2xl border-l-2 border-accent bg-white/[0.04] px-3.5 py-2.5 animate-slide-up">
                  <Reply size={15} className="shrink-0 text-accent" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-accent">
                      Ответить {replyingMessage.senderId === currentUser?.id ? 'себе' : `@${activeChat?.username ?? ''}`}
                    </p>
                    <p className="truncate text-xs text-t-secondary">{replyingMessage.text || '📎 Вложение'}</p>
                  </div>
                  <button type="button" onClick={() => setReplyingMessage(null)} aria-label="Отменить ответ" className="grid min-h-[44px] min-w-[44px] place-items-center rounded-xl text-t-secondary transition hover:bg-white/5 hover:text-t-primary">
                    <X size={15} />
                  </button>
                </div>
              )}
               <form ref={messageFormRef} onSubmit={handleSend} className="glass-panel p-1.5 sm:p-2 rounded-2xl flex items-end gap-1 sm:gap-2 shadow-2xl focus-within:ring-2 focus-within:ring-accent/30 transition-all">
                 <div className="relative">
                   <button type="button" onClick={() => setShowEmojiPicker((v) => !v)} className={`p-2.5 rounded-xl transition-all ${showEmojiPicker ? 'text-accent bg-accent/10' : 'text-t-secondary hover:text-slate-200 hover:bg-slate-800/80'}`} title="Эмодзи" aria-label="Эмодзи" aria-expanded={showEmojiPicker}>
                     <Smile size={19} />
                   </button>
                   {showEmojiPicker && (
                     <div className="absolute bottom-full left-0 z-30 mb-2">
                       <EmojiPicker onPick={(emoji) => insertEmoji(emoji)} onClose={() => setShowEmojiPicker(false)} />
                     </div>
                   )}
                 </div>
                 <button type="button" onClick={() => attachmentInputRef.current?.click()} disabled={sending} className="p-2.5 rounded-xl text-t-secondary hover:text-slate-200 hover:bg-slate-800/80 transition-all disabled:opacity-50" title="Прикрепить изображение или файл" aria-label="Прикрепить файл">
                   <Paperclip size={19} />
                 </button>
                  <textarea
                    ref={textInputRef}
                    value={text}
                    onChange={e => handleTextChange(e.target.value)}
                    onKeyDown={(event) => {
                       if (event.key === 'Enter' && !event.shiftKey && localStorage.getItem('skylineEnterToSend') !== 'false') {
                        event.preventDefault();
                         messageFormRef.current?.requestSubmit();
                      }
                    }}
                     onInput={(event) => {
                       event.currentTarget.style.height = 'auto';
                       event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 144)}px`;
                     }}
                    placeholder="Введите сообщение..."
                     aria-label="Текст сообщения"
                     rows={1}
                     maxLength={4000}
                     className="min-w-0 max-h-36 min-h-10 flex-1 resize-none overflow-y-auto bg-transparent px-1 sm:px-2 py-2 text-sm leading-5 text-t-primary placeholder-slate-500 focus:outline-none"
                    disabled={sending}
                 />
                 <button type="submit" disabled={sending || !text.trim()} className="btn-shine p-2.5 rounded-xl bg-gradient-to-r from-accent-from to-accent-to text-slate-950 hover:opacity-90 transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.6)] disabled:opacity-50">
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                 </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 relative z-10">
             <div className="w-24 h-24 mb-6 rounded-full bg-slate-800/30 flex items-center justify-center border border-slate-700/30 animate-float">
               <svg className="w-10 h-10 text-accent/50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
             </div>
             <p className="text-sm font-medium text-t-secondary">Выберите пользователя</p>
             <p className="text-xs text-slate-600 mt-1">чтобы начать общение</p>
          </div>
        )}
        {profilePanelOpen && chatProfile && (
          <div className={`profile-panel-layer absolute inset-0 z-40 flex justify-end ${profilePanelClosing ? 'profile-layer-out' : 'profile-layer-in'}`}>
            <button
              type="button"
              aria-label="Закрыть профиль"
              onClick={closeProfilePanel}
              className="profile-panel-backdrop absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            />
            <aside
              aria-label={`Профиль @${chatProfile.username}`}
              className={`profile-side-panel relative z-10 flex h-full w-[min(360px,90vw)] flex-col border-l border-white/10 bg-panel/95 text-t-primary shadow-2xl backdrop-blur-2xl ${profilePanelClosing ? 'profile-panel-out' : 'profile-panel-in'}`}
            >
              <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Профиль</p>
                  <p className="mt-1 text-xs text-slate-500">Информация о собеседнике</p>
                </div>
                <button type="button" onClick={closeProfilePanel} aria-label="Закрыть профиль" className="rounded-xl p-2 text-t-secondary transition hover:bg-white/10 hover:text-white">
                  <X size={18} />
                </button>
              </div>
              <div className="custom-scrollbar flex-1 overflow-y-auto px-5 py-6">
                <div className="flex flex-col items-center text-center">
                  <div className="relative mb-4 h-24 w-24 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-accent-from to-accent-to shadow-xl shadow-black/40">
                    {chatProfile.avatarUrl
                      ? <img src={chatProfile.avatarUrl} alt={`Аватар ${chatProfile.username}`} className="h-full w-full object-cover" />
                      : <span className="grid h-full place-items-center text-3xl font-bold text-white">{chatProfile.username[0]?.toLocaleUpperCase('ru-RU')}</span>}
                    <span className={`absolute bottom-1 right-1 h-4 w-4 rounded-full border-[3px] border-[#101725] ${onlineUsers.has(String(chatProfile.id)) ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                  </div>
                  <h2 className="max-w-full truncate text-xl font-semibold">{chatProfile.displayName || chatProfile.username}</h2>
                  <p className="mt-1 text-sm text-t-secondary">@{chatProfile.username}</p>
                  <p className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${onlineUsers.has(String(chatProfile.id)) ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-white/[0.08] bg-white/[0.04] text-t-secondary'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${onlineUsers.has(String(chatProfile.id)) ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                    {onlineUsers.has(String(chatProfile.id)) ? 'В сети' : 'Не в сети'}
                  </p>
                </div>

                {chatProfile.statusText && (
                  <div className="profile-info-card mt-7 rounded-2xl border border-accent/10 bg-accent/[0.06] p-4">
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">Статус</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{chatProfile.statusText}</p>
                  </div>
                )}
                {chatProfile.bio && (
                  <div className="profile-info-card mt-3 rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4">
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">О себе</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{chatProfile.bio}</p>
                  </div>
                )}
                {chatProfile.lastSeen && !onlineUsers.has(String(chatProfile.id)) && (
                  <p className="mt-4 px-1 text-xs text-slate-500">
                    Последний раз в сети: {formatAppDateTime(chatProfile.lastSeen, { second: '2-digit' })}
                  </p>
                )}
                {profileLoading && <p role="status" className="mt-5 text-center text-xs text-slate-500">Обновляем профиль…</p>}
                {profileError && <p role="status" className="mt-4 rounded-xl bg-amber-300/[0.07] p-3 text-xs text-amber-200/80">{profileError}</p>}
              </div>
              <div className="border-t border-white/[0.08] p-4">
                <button
                  type="button"
                  onClick={() => navigate(`/users/${chatProfile.id}`)}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent/15 text-sm font-medium text-accent transition hover:bg-accent/25 hover:text-white"
                >
                  <ExternalLink size={15} /> Открыть полный профиль
                </button>
              </div>
            </aside>
          </div>
        )}
      </div>
      {userContextMenu && createPortal(
        <div
          className="fixed inset-0 z-[90]"
          onClick={() => setUserContextMenu(null)}
          onContextMenu={(event) => { event.preventDefault(); setUserContextMenu(null); }}
          onKeyDown={(event) => { if (event.key === 'Escape') setUserContextMenu(null); }}
          role="presentation"
        >
          <div
            role="menu"
            aria-label={`Действия с пользователем @${userContextMenu.user.username}`}
            onClick={(event) => event.stopPropagation()}
            className="fixed w-56 rounded-2xl border border-white/10 bg-slate-950/95 p-2.5 shadow-2xl backdrop-blur-xl"
            style={{ left: userContextMenu.x, top: userContextMenu.y }}
          >
            <div className="mb-1 border-b border-white/[0.08] px-3 py-2">
              <p className="truncate text-xs font-semibold text-slate-200">{userContextMenu.user.displayName || userContextMenu.user.username}</p>
              <p className="mt-0.5 truncate text-[10px] text-slate-500">@{userContextMenu.user.username}</p>
            </div>
            {userContextMenu.user.isPremium && (
              <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-medium text-amber-200" role="menuitem">
                <Crown size={15} className="fill-amber-300/20 text-amber-300" /> Skyline Premium
              </div>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => { navigate(`/users/${userContextMenu.user.id}`); setUserContextMenu(null); }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-medium text-slate-200 transition hover:bg-accent/10 hover:text-accent"
            >
              <ExternalLink size={15} /> Открыть профиль
            </button>
            {userContextMenu.contact ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { void handleSaveContact(userContextMenu.user, userContextMenu.contact?.nickname); setUserContextMenu(null); }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-medium text-slate-200 transition hover:bg-white/10"
                >
                  <Pencil size={15} /> Изменить имя контакта
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const contact = userContextMenu.contact;
                    if (contact) void handleDeleteChat(contact);
                    setUserContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-medium text-rose-300 transition hover:bg-rose-400/10"
                >
                  <Trash2 size={15} /> Удалить историю чата
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    const contact = userContextMenu.contact;
                    if (contact) void handleRemoveContact(contact);
                    setUserContextMenu(null);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-medium text-rose-300 transition hover:bg-rose-400/10"
                >
                  <UserRoundX size={15} /> Удалить из контактов
                </button>
              </>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => { void handleSaveContact(userContextMenu.user); setUserContextMenu(null); }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-medium text-emerald-300 transition hover:bg-emerald-400/10"
              >
                <UserRoundPlus size={15} /> Добавить в контакты
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
      {openMessageMenu && (() => {
        const menuMessage = messages.find((message) => message.id === openMessageMenu);
        if (!menuMessage) return null;
        const canDeleteMessage = menuMessage.senderId === currentUser?.id;
        const position = {
          left: Math.max(8, Math.min(messageMenuPosition.x, window.innerWidth - 216)),
          top: Math.max(8, Math.min(messageMenuPosition.y, window.innerHeight - 190)),
        };
        return createPortal(
          <div
            data-message-menu
            role="menu"
            aria-label="Действия с сообщением"
            onAnimationEnd={(event) => {
              if (messageMenuClosing && event.currentTarget === event.target) setOpenMessageMenu(null);
            }}
            className={`message-action-menu fixed z-[100] w-52 rounded-2xl border border-white/10 bg-slate-950/95 p-2.5 shadow-2xl backdrop-blur-xl ${messageMenuClosing ? 'message-menu-out' : 'message-menu-in'}`}
            style={position}
          >
            <div className="message-reaction-picker mb-2 rounded-xl bg-white/[0.035] p-1.5">
              <p className="px-1.5 pb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">Быстрая реакция</p>
              <div className="flex items-center justify-between gap-1">
                {REACTIONS.map((emoji) => {
                  const active = menuMessage.reactions.some((reaction) =>
                    reaction.userId === currentUser?.id && reaction.emoji === emoji,
                  );
                  return (
                    <button
                      key={emoji}
                      type="button"
                      role="menuitem"
                      onClick={() => void handleReaction(menuMessage, emoji)}
                      aria-label={`Поставить реакцию ${emoji}`}
                      className={`message-reaction-option flex h-10 min-w-10 items-center justify-center rounded-xl text-xl transition ${active ? 'bg-accent/20 ring-1 ring-accent/30' : 'hover:bg-white/10'}`}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setReplyingMessage(menuMessage);
                closeMessageMenu();
                window.setTimeout(() => textInputRef.current?.focus(), 50);
              }}
              className="message-action-item flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-medium text-slate-200 transition hover:bg-accent/10 hover:text-accent"
            >
              <Reply size={15} /> Ответить
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setForwardingMessage(menuMessage);
                setForwardSearch('');
                closeMessageMenu();
              }}
              className="message-action-item flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-medium text-slate-200 transition hover:bg-accent/10 hover:text-accent"
            >
              <Forward size={15} /> Переслать
            </button>
            {menuMessage.text && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  void navigator.clipboard?.writeText(menuMessage.text);
                  closeMessageMenu();
                }}
                className="message-action-item flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-medium text-slate-200 transition hover:bg-accent/10 hover:text-accent"
              >
                <Copy size={15} /> Копировать текст
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              disabled={pinningMessageId === menuMessage.id}
              onClick={() => void handleTogglePin(menuMessage)}
              className="message-action-item flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-medium text-slate-200 transition hover:bg-amber-300/10 hover:text-amber-200 disabled:opacity-50"
            >
              <Pin size={15} className={menuMessage.pinned ? 'text-amber-300' : ''} />
              {pinningMessageId === menuMessage.id ? 'Сохраняю...' : menuMessage.pinned ? 'Открепить сообщение' : 'Закрепить сообщение'}
            </button>
            {canDeleteMessage && (
              menuMessage.type === 'text' && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setEditingMessageId(menuMessage.id);
                    setMessageEditDraft(menuMessage.text);
                    closeMessageMenu();
                  }}
                  className="message-action-item flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-medium text-slate-200 transition hover:bg-accent/10 hover:text-accent"
                >
                  <Pencil size={15} /> Редактировать
                </button>
              )
            )}
            {canDeleteMessage && (
              <button
                type="button"
                role="menuitem"
                onClick={() => void handleDeleteMessage(menuMessage)}
                className="message-action-item flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-medium text-rose-300 transition hover:bg-rose-400/10"
              >
                <Trash2 size={15} /> Удалить сообщение
              </button>
            )}
          </div>,
          document.body,
        );
      })()}
      {lightboxImage?.fileData && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lightboxImage.fileName || 'Просмотр изображения'}
          onClick={closeLightbox}
          className={`image-lightbox fixed inset-0 z-[110] flex items-center justify-center bg-black/90 p-3 sm:p-8 ${lightboxClosing ? 'image-lightbox-out' : 'image-lightbox-in'}`}
        >
          <button type="button" onClick={closeLightbox} aria-label="Закрыть изображение" className="absolute right-3 top-3 z-10 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20 sm:right-5 sm:top-5">
            <X size={20} />
          </button>
          <img
            src={lightboxImage.fileData}
            alt={lightboxImage.fileName || 'Изображение'}
            onClick={(event) => event.stopPropagation()}
            onAnimationEnd={(event) => {
              if (lightboxClosing && event.currentTarget === event.target) setLightboxImage(null);
            }}
            className="max-h-[90dvh] max-w-full rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
      {forwardingMessage && createPortal(
        <div
          role="presentation"
          onClick={(event) => { if (event.target === event.currentTarget && !forwarding) setForwardingMessage(null); }}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
        >
          <section role="dialog" aria-modal="true" aria-labelledby="forward-dialog-title" className="w-full max-w-md rounded-3xl border border-white/10 bg-panel p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 id="forward-dialog-title" className="text-sm font-semibold text-t-primary">Переслать сообщение</h2>
                <p className="mt-1 text-[11px] text-t-secondary">Копия будет заново зашифрована для выбранного контакта.</p>
              </div>
              <button type="button" disabled={forwarding} onClick={() => setForwardingMessage(null)} aria-label="Закрыть" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-t-secondary hover:bg-white/5 hover:text-white disabled:opacity-50"><X size={17} /></button>
            </div>
            <input value={forwardSearch} onChange={(event) => setForwardSearch(event.target.value)} autoFocus placeholder="Найти контакт" aria-label="Найти получателя" className="mb-3 h-11 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 text-sm text-t-primary outline-none placeholder:text-slate-500 focus:border-accent/50" />
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {contacts
                .filter((contact) => `${contact.nickname || ''} ${contact.displayName || ''} ${contact.username}`.toLocaleLowerCase().includes(forwardSearch.trim().toLocaleLowerCase()))
                .map((contact) => (
                  <button key={contact.id} type="button" disabled={forwarding} onClick={() => void handleForwardMessage(contact)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[0.06] disabled:cursor-wait disabled:opacity-50">
                    <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-accent/15 text-xs font-semibold text-accent">{contact.avatarUrl ? <img src={contact.avatarUrl} alt="" className="h-full w-full object-cover" /> : (contact.displayName || contact.username)[0]?.toLocaleUpperCase()}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-t-primary">{contact.nickname || contact.displayName || contact.username}</span><span className="block truncate text-[11px] text-t-secondary">@{contact.username}</span></span>
                    {forwarding ? <span className="text-[10px] text-accent">Отправляю…</span> : <Forward size={15} className="text-t-secondary" />}
                  </button>
                ))}
              {!contacts.some((contact) => `${contact.nickname || ''} ${contact.displayName || ''} ${contact.username}`.toLocaleLowerCase().includes(forwardSearch.trim().toLocaleLowerCase())) && <p className="px-3 py-8 text-center text-xs text-t-secondary">Контакты не найдены.</p>}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
