import { Link } from 'react-router-dom';
import { CloudLightning } from 'lucide-react';
import GlassPanel from '../components/ui/GlassPanel';

export default function VerifyEmail() {
  return (
    <main className="grid h-full w-full place-items-center bg-bg-base px-4 py-8 text-t-primary">
      <GlassPanel className="w-full max-w-md p-6 text-center">
        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-3xl bg-accent/15 text-accent">
          <CloudLightning size={26} />
        </span>
        <h1 className="text-xl font-semibold">Подтверждение больше не требуется</h1>
        <p className="mt-2 text-sm leading-6 text-t-secondary">
          В Skyline можно создать аккаунт без подтверждения электронной почты и номера телефона.
        </p>
        <Link to="/register" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90">
          Перейти к регистрации
        </Link>
      </GlassPanel>
    </main>
  );
}
