import { useEffect, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { CheckCircle2, AlertCircle, ArrowRight, Loader2, MessageCircle } from 'lucide-react';
import { authApi } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function VerifyEmail() {
  const location = useLocation();
  const navigate = useNavigate();
  const { register } = useAuth();

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Подтверждаем ваш адрес электронной почты…');

  useEffect(() => {
    const runVerification = async () => {
      try {
        const searchParams = new URLSearchParams(location.search);
        let email = searchParams.get('email') || '';
        const code = searchParams.get('code') || '';
        const token = searchParams.get('token') || '';
        const registrationTokenParam = searchParams.get('registrationToken') || '';

        // If email was not in search, check hash parameters
        if (!email && location.hash.includes('?')) {
          const hashQuery = location.hash.split('?')[1];
          const hashParams = new URLSearchParams(hashQuery);
          email = hashParams.get('email') || email;
        }

        let registrationToken = registrationTokenParam;

        if (!registrationToken) {
          if (token && email) {
            const res = await authApi.verifyEmailToken(email, token);
            registrationToken = res.data.registrationToken;
          } else if (code && email) {
            const res = await authApi.verifyEmailCode(email, code);
            registrationToken = res.data.registrationToken;
          } else {
            setStatus('error');
            setMessage('В ссылке подтверждения отсутствуют необходимые параметры.');
            return;
          }
        }

        // Check if there is pending registration in sessionStorage
        const saved = sessionStorage.getItem('pendingRegistration');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed.email && parsed.password && parsed.username && registrationToken) {
              await register(parsed.email, parsed.password, parsed.username, registrationToken);
              sessionStorage.removeItem('pendingRegistration');
              setStatus('success');
              setMessage('Почта успешно подтверждена! Входим в аккаунт…');
              setTimeout(() => {
                navigate('/', { replace: true });
              }, 1200);
              return;
            }
          } catch {
            // ignore JSON parse error
          }
        }

        // If opened on another device / session without saved password
        if (registrationToken && email) {
          sessionStorage.setItem('verifiedEmailToken', registrationToken);
          sessionStorage.setItem('verifiedEmailAddress', email);
          setStatus('success');
          setMessage('Email успешно подтверждён в 1 клик! Завершите ввод имени и пароля.');
          setTimeout(() => {
            navigate('/register', { replace: true });
          }, 1800);
          return;
        }

        setStatus('success');
        setMessage('Email успешно подтверждён!');
      } catch (err: any) {
        console.error('Email verification error:', err);
        setStatus('error');
        setMessage(
          err?.response?.data?.detail ||
          err?.response?.data?.error ||
          'Срок действия ссылки истёк или она уже была использована.'
        );
      }
    };

    runVerification();
  }, [location, navigate, register]);

  return (
    <main className="relative grid h-full w-full place-items-center overflow-y-auto bg-[#090d16] px-4 py-8 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(99,102,241,0.18),transparent_55%)]" />
      <div className="relative w-full max-w-[430px]">
        <div className="mb-8 flex items-center justify-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-lg shadow-indigo-500/25">
            <MessageCircle size={21} />
          </span>
          <span className="text-xl font-bold tracking-tight">OurSocial</span>
        </div>

        <section className="rounded-[28px] border border-white/[0.08] bg-[#101725]/90 p-8 text-center shadow-2xl backdrop-blur-xl">
          {status === 'loading' && (
            <div className="flex flex-col items-center py-6">
              <Loader2 className="h-12 w-12 animate-spin text-indigo-400 mb-4" />
              <h1 className="text-xl font-semibold mb-2">Подтверждение в 1 клик</h1>
              <p className="text-sm text-slate-400">{message}</p>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center py-6">
              <div className="h-14 w-14 rounded-2xl bg-emerald-500/20 text-emerald-400 grid place-items-center mb-4">
                <CheckCircle2 size={32} />
              </div>
              <h1 className="text-xl font-semibold mb-2 text-white">Успешно!</h1>
              <p className="text-sm text-slate-300 leading-relaxed mb-6">{message}</p>
              <button
                onClick={() => navigate('/')}
                className="flex items-center justify-center gap-2 w-full h-12 bg-indigo-500 hover:bg-indigo-400 text-white font-semibold rounded-xl transition"
              >
                Перейти в мессенджер <ArrowRight size={16} />
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center py-6">
              <div className="h-14 w-14 rounded-2xl bg-rose-500/20 text-rose-400 grid place-items-center mb-4">
                <AlertCircle size={32} />
              </div>
              <h1 className="text-xl font-semibold mb-2 text-white">Ошибка подтверждения</h1>
              <p className="text-sm text-rose-200 leading-relaxed mb-6">{message}</p>
              <Link
                to="/register"
                className="flex items-center justify-center gap-2 w-full h-12 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-xl transition"
              >
                Вернуться к регистрации
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
