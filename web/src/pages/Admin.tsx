import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, type User } from '../api';
import { useAuth } from '../auth';
import { Badge, Button, Card, ErrorMsg, Field, Input, Modal, PageHeader, Select, Spinner } from '../components/ui';
import { useInvalidateAll } from '../components/SaleForm';

export function UsersPage() {
  const { user: me } = useAuth();
  const { data = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: () => api<User[]>('/users') });
  const [editing, setEditing] = useState<User | null | undefined>();
  return (
    <div>
      <PageHeader title="Usuários" actions={<Button onClick={() => setEditing(null)}><Plus size={18} /> Novo usuário</Button>} />
      {isLoading ? <Spinner /> : (
        <Card>
          <ul className="divide-y divide-stone-100">
            {data.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-medium">{u.name} {u.id === me?.id && <span className="text-xs text-stone-500">(você)</span>}</div>
                  <div className="truncate text-sm text-stone-500">{u.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={u.role === 'ADMIN' ? 'blue' : 'gray'}>{u.role === 'ADMIN' ? 'Admin' : 'Operador'}</Badge>
                  {!u.active && <Badge tone="red">Inativo</Badge>}
                  <Button variant="ghost" onClick={() => setEditing(u)}>Editar</Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="mt-3 text-sm text-stone-500">Operadores lançam vendas e pagamentos. Administradores também gerenciam usuários e configurações.</p>
      {editing !== undefined && <UserFormModal user={editing ?? undefined} onClose={() => setEditing(undefined)} />}
    </div>
  );
}

function UserFormModal({ user, onClose }: { user?: User; onClose: () => void }) {
  const invalidate = useInvalidateAll();
  const [f, setF] = useState({ name: user?.name ?? '', email: user?.email ?? '', password: '', role: user?.role ?? 'OPERADOR', active: user?.active ?? true });
  const save = useMutation({
    mutationFn: () =>
      user
        ? api(`/users/${user.id}`, { method: 'PATCH', body: { name: f.name, role: f.role, active: f.active, ...(f.password ? { password: f.password } : {}) } })
        : api('/users', { body: f }),
    onSuccess: () => { invalidate(); onClose(); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };
  return (
    <Modal open onClose={onClose} title={user ? 'Editar usuário' : 'Novo usuário'}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Nome"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        <Field label="E-mail"><Input type="email" value={f.email} disabled={!!user} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
        <Field label={user ? 'Nova senha (deixe vazio para manter)' : 'Senha'}>
          <Input type="password" autoComplete="new-password" minLength={6} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required={!user} />
        </Field>
        <Field label="Perfil">
          <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as User['role'] })}>
            <option value="OPERADOR">Operador</option>
            <option value="ADMIN">Administrador</option>
          </Select>
        </Field>
        {user && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="h-4 w-4 accent-brand-600" /> Ativo
          </label>
        )}
        <ErrorMsg error={save.error} />
        <Button type="submit" className="w-full" disabled={save.isPending}>Salvar</Button>
      </form>
    </Modal>
  );
}

export function SettingsPage() {
  const { user } = useAuth();
  const invalidate = useInvalidateAll();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api<Record<string, string>>('/settings') });
  const [price, setPrice] = useState('');
  useEffect(() => { if (settings) setPrice(settings.pricePerKg); }, [settings]);
  const saveSettings = useMutation({ mutationFn: () => api('/settings', { method: 'PUT', body: { pricePerKg: price } }), onSuccess: invalidate });

  const [pw, setPw] = useState({ current: '', next: '' });
  const changePw = useMutation({ mutationFn: () => api('/auth/change-password', { body: pw }), onSuccess: () => setPw({ current: '', next: '' }) });

  return (
    <div className="max-w-lg space-y-4">
      <PageHeader title="Configurações" />
      {user?.role === 'ADMIN' && (
        <Card className="p-4">
          <h2 className="mb-3 font-semibold">Vendas</h2>
          <form onSubmit={(e) => { e.preventDefault(); saveSettings.mutate(); }} className="flex items-end gap-2">
            <Field label="Preço padrão por kg (R$)"><Input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
            <Button type="submit" disabled={saveSettings.isPending}>Salvar</Button>
          </form>
          {saveSettings.isSuccess && <p className="mt-2 text-sm text-leaf-600">Salvo!</p>}
        </Card>
      )}
      <Card className="p-4">
        <h2 className="mb-3 font-semibold">Trocar minha senha</h2>
        <form onSubmit={(e) => { e.preventDefault(); changePw.mutate(); }} className="space-y-3">
          <Field label="Senha atual"><Input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></Field>
          <Field label="Nova senha"><Input type="password" autoComplete="new-password" minLength={6} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required /></Field>
          <ErrorMsg error={changePw.error} />
          {changePw.isSuccess && <p className="text-sm text-leaf-600">Senha alterada!</p>}
          <Button type="submit" disabled={changePw.isPending}>Alterar senha</Button>
        </form>
      </Card>
      <Card className="p-4 text-sm text-stone-600">
        <h2 className="mb-2 font-semibold text-stone-800">Instalar no celular</h2>
        <p><b>iPhone:</b> abra no Safari → botão Compartilhar → “Adicionar à Tela de Início”.</p>
        <p className="mt-1"><b>Android:</b> abra no Chrome → menu ⋮ → “Instalar app”.</p>
      </Card>
    </div>
  );
}
