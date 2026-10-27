import { useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CloudLightning, LockKeyhole, Mail, User as UserIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import GlassPanel from '../components/ui/GlassPanel';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(email.trim(), password, username.trim());
      const redirectPath = sessionStorage.getItem('skylineAfterLogin');
      sessionStorage.removeItem('skylineAfterLogin');
      sessionStorage.removeItem('pendingRegistration');
      sessionStorage.removeItem('verifiedEmailToken');
      sessionStorage.removeItem('verifiedEmailAddress');
      navigate(redirectPath || '/', { replace: true });
    } catch (registrationError: unknown) {
      const data = isAxiosError(registrationError)
        ? registrationError.response?.data as { detail?: string; error?: string } | undefined
        : undefined;
      setError(data?.detail || data?.error || 'Не удалось создать аккаунт. Проверьте данные и попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative grid h-full w-full place-items-center overflow-y-auto bg-bg-base px-4 py-8 text-t-primary animate-fade-in">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,var(--glow),transparent_55%)]" />
      <div className="relative w-full max-w-[430px]">
        <div className="mb-8 flex flex-col items-center gap-3">
          <span className="btn-glow grid h-14 w-14 place-items-center rounded-3xl bg-gradient-to-br from-accent-from to-accent-to shadow-lg">
            <CloudLightning size={26} />
          </span>
          <span className="text-2xl font-extrabold tracking-tight">Skyline</span>
        </div>

        <GlassPanel className="p-6 animate-scale-in">
          <h1 className="text-2xl font-semibold tracking-tight">Создать аккаунт</h1>
          <p className="mt-1 text-sm text-t-secondary">Создайте аккаунт и пользуйтесь Skyline в браузере и Android.</p>

          {error && (
            <div role="alert" className="login-error-shake mb-5 mt-5 rounded-xl border border-rose-400/20 bg-rose-400/[0.08] px-3.5 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Input
              type="text"
              label="Имя пользователя"
              icon={<UserIcon size={14} className="text-t-secondary" />}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
              minLength={3}
              maxLength={32}
              placeholder="username"
            />
            <Input
              type="email"
              label="Электронная почта"
              icon={<Mail size={14} className="text-t-secondary" />}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              placeholder="name@example.com"
            />
            <Input
              type="password"
              label="Пароль"
              icon={<LockKeyhole size={14} className="text-t-secondary" />}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required
              minLength={6}
              maxLength={128}
              placeholder="Минимум 6 символов"
            />
            <Button type="submit" disabled={loading || !email.trim() || !password || !username.trim()} className="mt-2">
              {loading ? 'Создаем…' : <>Зарегистрироваться <ArrowRight size={16} /></>}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-t-secondary">
            Уже есть аккаунт?{' '}
            <Link to="/login" className="font-semibold text-accent transition hover:opacity-80">Войти</Link>
          </p>
        </GlassPanel>
        <p className="mt-5 text-center text-[11px] text-slate-600">
          Подтверждение почты и номера телефона не требуется.
        </p>
      </div>
    </main>
  );
}
