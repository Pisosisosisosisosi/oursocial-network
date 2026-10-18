import { useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { Link } from 'react-router-dom';
import { ArrowRight, LockKeyhole, Mail, MessageCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (loginError: unknown) {
      const data = isAxiosError(loginError)
        ? loginError.response?.data as { detail?: string; error?: string } | undefined
        : undefined;
      setError(data?.detail || data?.error || 'Не удалось войти. Проверьте email и пароль.');
    } finally {
      setLoading(false);
    }
  };

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
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-indigo-300">С возвращением</p>
            <h1 className="text-2xl font-semibold tracking-tight">Войти в Pulse</h1>
            <p className="mt-2 text-sm text-slate-500">Войдите, чтобы открыть чаты и контакты.</p>
          </div>

          {error && (
            <div role="alert" className="mb-5 rounded-xl border border-rose-400/20 bg-rose-400/[0.08] px-3.5 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400">
                <Mail size={14} className="text-slate-600" /> Электронная почта
              </span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
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
                autoComplete="current-password"
                required
                placeholder="Ваш пароль"
                className="h-12 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-400/50 focus:bg-white/[0.05]"
              />
            </label>
            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Входим…' : <>Войти <ArrowRight size={16} /></>}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Ещё нет аккаунта?{' '}
            <Link to="/register" className="font-semibold text-indigo-300 hover:text-indigo-200">Зарегистрироваться</Link>
          </p>
        </section>

        <p className="mt-5 flex items-center justify-center gap-2 text-[11px] text-slate-600">
          <ShieldCheck size={14} className="text-emerald-400/70" /> Ваша переписка защищена.
        </p>
      </div>
    </main>
  );
}
