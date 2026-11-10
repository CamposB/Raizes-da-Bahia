import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, type Product, type ProductUnit, type User } from '../api';
import { money } from '../format';
import { useAuth } from '../auth';
import { Badge, Button, Card, ErrorMsg, Field, Input, Modal, PageHeader, Segmented, Select, Spinner } from '../components/ui';
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
  const [pw, setPw] = useState({ current: '', next: '' });
  const changePw = useMutation({ mutationFn: () => api('/auth/change-password', { body: pw }), onSuccess: () => setPw({ current: '', next: '' }) });

  return (
    <div className="max-w-lg space-y-4">
      <PageHeader title="Configurações" />
      {user?.role === 'ADMIN' && (
        <Card className="p-4">
          <h2 className="mb-1 font-semibold">Preços</h2>
          <p className="text-sm text-stone-600">
            Os preços ficam no cadastro de cada produto. <Link to="/produtos" className="font-medium text-brand-700">Ir para Produtos →</Link>
          </p>
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

export function ProductsPage() {
  const { data = [], isLoading } = useQuery({ queryKey: ['products'], queryFn: () => api<Product[]>('/products') });
  const [editing, setEditing] = useState<Product | null | undefined>();
  return (
    <div>
      <PageHeader title="Produtos" actions={<Button onClick={() => setEditing(null)}><Plus size={18} /> Novo produto</Button>} />
      {isLoading ? <Spinner /> : (
        <Card>
          <ul className="divide-y divide-stone-100">
            {data.map((p) => (
              <li key={p.id} className={`flex items-center justify-between gap-3 px-4 py-3 ${p.active ? '' : 'opacity-60'}`}>
                <div className="min-w-0">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-sm text-stone-500">
                    {money(p.price)} por {p.unit === 'KG' ? 'kg' : 'unidade'} · {p.salesCount ?? 0} venda(s){p.usesLots ? ' · usa lotes' : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!p.active && <Badge tone="red">Inativo</Badge>}
                  <Button variant="ghost" onClick={() => setEditing(p)}>Editar</Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="mt-3 text-sm text-stone-500">O primeiro produto ativo da lista já vem selecionado na nova venda. Produto com vendas não pode ser apagado, só desativado.</p>
      {editing !== undefined && <ProductFormModal product={editing ?? undefined} onClose={() => setEditing(undefined)} />}
    </div>
  );
}

function ProductFormModal({ product, onClose }: { product?: Product; onClose: () => void }) {
  const invalidate = useInvalidateAll();
  const [f, setF] = useState({
    name: product?.name ?? '',
    unit: product?.unit ?? ('UN' as ProductUnit),
    price: product?.price.toString() ?? '',
    usesLots: product?.usesLots ?? false,
    active: product?.active ?? true,
    sortOrder: product?.sortOrder.toString() ?? '0',
  });
  const save = useMutation({
    mutationFn: () => {
      const body = { ...f, price: Number(f.price), sortOrder: Number(f.sortOrder) || 0 };
      return product ? api(`/products/${product.id}`, { method: 'PATCH', body }) : api('/products', { body });
    },
    onSuccess: () => { invalidate(); onClose(); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };
  return (
    <Modal open onClose={onClose} title={product ? 'Editar produto' : 'Novo produto'}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Nome"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Provolone 300 g" required /></Field>
        <Field label="Vendido por">
          <Segmented value={f.unit} onChange={(unit) => setF({ ...f, unit })} options={[{ value: 'UN', label: 'Unidade' }, { value: 'KG', label: 'Quilo (kg)' }]} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Preço por ${f.unit === 'KG' ? 'kg' : 'unidade'} (R$)`}>
            <Input type="number" step="0.01" min="0" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} required />
          </Field>
          <Field label="Ordem" hint="Menor aparece primeiro">
            <Input type="number" step="1" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value })} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.usesLots} onChange={(e) => setF({ ...f, usesLots: e.target.checked })} className="h-4 w-4 accent-brand-600" /> Vendas ligadas a um lote (como a goma)
        </label>
        {product && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="h-4 w-4 accent-brand-600" /> Ativo (aparece na nova venda)
          </label>
        )}
        <ErrorMsg error={save.error} />
        <Button type="submit" className="w-full" disabled={save.isPending}>Salvar</Button>
      </form>
    </Modal>
  );
}
