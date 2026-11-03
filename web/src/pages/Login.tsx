import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';
import { Button, ErrorMsg, Field, Input } from '../components/ui';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-100 to-brand-50 px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-stone-200 bg-surface p-6 shadow-sm">
        <div className="mb-2 flex flex-col items-center text-center">
          <img src="/icon.svg" alt="" className="mb-3 h-16 w-16" />
          <h1 className="text-xl font-semibold text-brand-700">Raízes da Bahia</h1>
          <p className="text-sm text-stone-500">Entre para gerenciar suas vendas</p>
        </div>
        <Field label="E-mail">
          <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Senha">
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <ErrorMsg error={error} />
        <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</Button>
      </form>
    </div>
  );
}
