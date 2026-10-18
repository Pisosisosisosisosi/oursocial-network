import { useEffect, useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, LockKeyhole, Mail, MessageCircle, ShieldCheck, User as UserIcon, X } from 'lucide-react';
import { authApi } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationError, setVerificationError] = useState('');
  const [verificationNotice, setVerificationNotice] = useState('');
  const [secondsRemaining, setSecondsRemaining] = useState(600);
  const [verificationLoading, setVerificationLoading] = useState(false);

  useEffect(() => {
    if (!verificationOpen || secondsRemaining <= 0) return;
    const timer = window.setTimeout(() => {
      setSecondsRemaining((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [verificationOpen, secondsRemaining]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authApi.sendEmailCode(email.trim());
      setSecondsRemaining(600);
      setVerificationCode('');
      setVerificationError('');
      setVerificationNotice('');
      setVerificationOpen(true);
    } catch (sendError: unknown) {
      const data = isAxiosError(sendError)
        ? sendError.response?.data as { detail?: string; error?: string } | undefined
        : undefined;
      setError(data?.detail || data?.error || 'Не удалось отправить код подтверждения. Попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setVerificationError('');
    setVerificationNotice('');
    setVerificationCode('');
    setVerificationLoading(true);
    try {
      await authApi.sendEmailCode(email.trim());
      setSecondsRemaining(600);
      setVerificationNotice('Если адрес может принять письмо, новый код отправлен.');
    } catch (sendError: unknown) {
      const data = isAxiosError(sendError)
        ? sendError.response?.data as { detail?: string; error?: string } | undefined
        : undefined;
      setVerificationError(data?.detail || data?.error || 'Не удалось отправить новый код.');
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleVerifyCode = async (event: FormEvent) => {
    event.preventDefault();
    if (verificationCode.length !== 6 || verificationLoading) return;
    setVerificationError('');
    setVerificationNotice('');
    setVerificationLoading(true);
    try {
      const response = await authApi.verifyEmailCode(email.trim(), verificationCode);
      await register(email.trim(), password, username.trim(), response.data.registrationToken);
      const redirectPath = sessionStorage.getItem('pulseAfterLogin');
      sessionStorage.removeItem('pulseAfterLogin');
      navigate(redirectPath || '/', { replace: true });
    } catch (verifyError: unknown) {
      const data = isAxiosError(verifyError)
        ? verifyError.response?.data as { detail?: string; error?: string } | undefined
        : undefined;
      const message = data?.detail || data?.error || 'Не удалось подтвердить email.';
      setVerificationError(message);
      if (message.toLocaleLowerCase('ru-RU').includes('слишком много попыток')) {
        setVerificationCode('');
      }
    } finally {
      setVerificationLoading(false);
    }
  };

  const formatCountdown = (seconds: number) =>
    `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;

  return (
    <main className="relative grid h-full w-full place-items-center overflow-y-auto bg-[#090d16] px-4 py-8 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(99,102,241,0.18),transparent_55%)]" />
      <div className="relative w-full max-w-[430px]">
        
        <div className="mb-8 flex items-center justify-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-lg shadow-indigo-500/25">
            <MessageCircle size={21} />
          </span>
          <span className="text-xl font-bold tracking-tight">Pulse</span>
        </div>

        <section className="rounded-[28px] border border-white/[0.08] bg-[#101725]/90 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-9">
          <div className="mb-7">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-indigo-300">Присоединяйтесь</p>
            <h1 className="text-2xl font-semibold tracking-tight">Создайте аккаунт</h1>
            <p className="mt-2 text-sm text-slate-500">Начните общаться с близкими и друзьями.</p>
          </div>

          {error && (
            <div role="alert" className="mb-5 rounded-xl border border-rose-400/20 bg-rose-400/[0.08] px-3.5 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400">
                <UserIcon size={14} className="text-slate-600" /> Юзернейм
              </span>
              <span className="flex h-12 items-center rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 text-sm text-slate-500 focus-within:border-indigo-400/50">
                @
                <input
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                  minLength={3}
                  maxLength={32}
                  pattern="[A-Za-z0-9_.-]+"
                  placeholder="Например, darius_writer"
                  className="h-full min-w-0 flex-1 bg-transparent pl-1 text-sm text-white outline-none placeholder:text-slate-600"
                />
              </span>
              <span className="mt-1 block text-[10px] text-slate-600">3–32 символа: латиница, цифры, точка, дефис или подчёркивание.</span>
            </label>
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400">
                <Mail size={14} className="text-slate-600" /> Электронная почта
              </span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                placeholder="name@example.com"
                className="h-12 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-400/50 focus:bg-white/[0.05]"
              />
            </label>
            <label className="block">
              <span className="mb-2 flex items-center justify-between text-xs font-medium text-slate-400">
                Пароль <LockKeyhole size={14} className="text-slate-600" />
              </span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                placeholder="Минимум 6 символов"
                className="h-12 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-400/50 focus:bg-white/[0.05]"
              />
            </label>
            <button
              type="submit"
              disabled={loading || !email.trim() || !password || !username.trim()}
              className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Создаем…' : <>Зарегистрироваться <ArrowRight size={16} /></>}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Уже есть аккаунт?{' '}
            <Link to="/login" className="font-semibold text-indigo-300 hover:text-indigo-200">Войти</Link>
          </p>
        </section>

        {verificationOpen && (
          <div
            className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !verificationLoading) setVerificationOpen(false);
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="email-verification-title"
              className="w-full max-w-md rounded-[28px] border border-white/[0.1] bg-[#101725] p-6 shadow-2xl sm:p-8"
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-300">Подтверждение почты</p>
                  <h2 id="email-verification-title" className="text-xl font-semibold">Введите код из письма</h2>
                </div>
                <button type="button" onClick={() => setVerificationOpen(false)} aria-label="Закрыть" className="rounded-xl p-2 text-slate-500 transition hover:bg-white/5 hover:text-white">
                  <X size={18} />
                </button>
              </div>
              <p className="mb-5 text-sm leading-relaxed text-slate-400">
                Если адрес может принять письмо, код отправлен на <span className="text-slate-200">{email.trim()}</span>.
                Он действует ещё <span className="font-mono text-indigo-300">{formatCountdown(secondsRemaining)}</span>.
              </p>
              {verificationError && (
                <div role="status" className="mb-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.08] px-3.5 py-3 text-sm text-rose-200">
                  {verificationError}
                </div>
              )}
              {verificationNotice && (
                <div role="status" className="mb-4 rounded-xl border border-indigo-400/20 bg-indigo-400/[0.08] px-3.5 py-3 text-sm text-indigo-200">
                  {verificationNotice}
                </div>
              )}
              <form onSubmit={handleVerifyCode} className="space-y-4">
                <label className="block">
                  <span className="mb-2 block text-xs font-medium text-slate-400">Шестизначный код</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={verificationCode}
                    onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    aria-label="Код подтверждения"
                    className="h-14 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] text-center font-mono text-2xl tracking-[0.45em] text-white outline-none transition placeholder:text-slate-700 focus:border-indigo-400/50"
                    required
                  />
                </label>
                <button type="submit" disabled={verificationLoading || verificationCode.length !== 6} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50">
                  {verificationLoading ? 'Проверяем…' : <>Подтвердить и создать аккаунт <ArrowRight size={16} /></>}
                </button>
              </form>
              <button type="button" onClick={() => void handleResendCode()} disabled={verificationLoading} className="mt-4 w-full rounded-xl px-3 py-2 text-xs font-medium text-indigo-300 transition hover:bg-indigo-400/10 disabled:opacity-50">
                {verificationLoading ? 'Отправляем…' : 'Отправить код повторно'}
              </button>
            </section>
          </div>
        )}

        <p className="mt-5 flex items-center justify-center gap-2 text-[11px] text-slate-600">
          <ShieldCheck size={14} className="text-emerald-400/70" /> Регистрация занимает всего минуту
        </p>
      </div>
    </main>
  );
}