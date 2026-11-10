import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, HandCoins, MessageCircle, Pencil, Plus, Search, Merge } from 'lucide-react';
import { api, type Customer, type Sale, type Transaction } from '../api';
import { dateFmt, money, qtyFmt, qtySum } from '../format';
import { Badge, Button, Card, DeliveryBadge, Empty, ErrorMsg, Field, Input, Modal, PageHeader, PaymentBadge, Select, Spinner, Stat, Textarea } from '../components/ui';
import { PaymentModal, useInvalidateAll } from '../components/SaleForm';

export function CustomersPage() {
  const [q, setQ] = useState('');
  const [onlyDebt, setOnlyDebt] = useState(false);
  const [creating, setCreating] = useState(false);
  const { data = [], isLoading } = useQuery({ queryKey: ['customers'], queryFn: () => api<Customer[]>('/customers') });
  const term = q.trim().toLowerCase();
  const rows = data
    .filter((c) => !term || c.name.toLowerCase().includes(term) || c.group?.toLowerCase().includes(term))
    .filter((c) => !onlyDebt || (c.openBalance ?? 0) > 0);

  return (
    <div>
      <PageHeader title="Clientes" actions={<Button onClick={() => setCreating(true)}><Plus size={18} /> Novo</Button>}>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <Search size={16} className="absolute left-3 top-3 text-stone-400" />
            <Input placeholder="Buscar por nome ou grupo…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyDebt} onChange={(e) => setOnlyDebt(e.target.checked)} className="h-4 w-4 accent-brand-600" /> Só quem deve
          </label>
        </div>
      </PageHeader>
      {isLoading ? <Spinner /> : !rows.length ? <Empty>Nenhum cliente.</Empty> : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((c) => (
            <Link key={c.id} to={`/clientes/${c.id}`}>
              <Card className={`p-3 transition hover:border-brand-200 ${c.active ? '' : 'opacity-60'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{c.name}</div>
                    <div className="text-xs text-stone-500">
                      {c.salesCount} compra(s) · {qtySum({ kg: c.totalKg ?? 0, un: c.totalUn })} · última {dateFmt(c.lastPurchase)}
                    </div>
                  </div>
                  {c.group && <Badge>{c.group}</Badge>}
                </div>
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-stone-600">{money(c.totalSpent)}</span>
                  {(c.openBalance ?? 0) > 0 && <span className="font-medium text-red-600">deve {money(c.openBalance)}</span>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <CustomerFormModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function CustomerFormModal({ open, onClose, customer }: { open: boolean; onClose: () => void; customer?: Customer }) {
  const invalidate = useInvalidateAll();
  const [f, setF] = useState({ name: customer?.name ?? '', group: customer?.group ?? '', phone: customer?.phone ?? '', notes: customer?.notes ?? '', optOut: customer?.optOut ?? false });
  const save = useMutation({
    mutationFn: () => {
      const body = { name: f.name, group: f.group || null, phone: f.phone || null, notes: f.notes || null, optOut: f.optOut };
      return customer ? api(`/customers/${customer.id}`, { method: 'PATCH', body }) : api('/customers', { body });
    },
    onSuccess: () => { invalidate(); onClose(); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };
  return (
    <Modal open={open} onClose={onClose} title={customer ? 'Editar cliente' : 'Novo cliente'}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Nome"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        <Field label="Grupo / origem" hint="Ex.: PWI, Brejas, Encanto"><Input value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })} /></Field>
        <Field label="WhatsApp"><Input type="tel" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="(11) 99999-9999" /></Field>
        <Field label="Observações"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.optOut} onChange={(e) => setF({ ...f, optOut: e.target.checked })} className="h-4 w-4 accent-brand-600" /> Não quer receber mensagens (CRM)
        </label>
        <ErrorMsg error={save.error} />
        <Button type="submit" className="w-full" disabled={save.isPending}>Salvar</Button>
      </form>
    </Modal>
  );
}

function MergeModal({ open, onClose, target }: { open: boolean; onClose: () => void; target: Customer }) {
  const invalidate = useInvalidateAll();
  const { data = [] } = useQuery({ queryKey: ['customers'], queryFn: () => api<Customer[]>('/customers') });
  const [fromId, setFromId] = useState('');
  const merge = useMutation({
    mutationFn: () => api(`/customers/${target.id}/merge`, { body: { fromId } }),
    onSuccess: () => { invalidate(); onClose(); },
  });
  return (
    <Modal open={open} onClose={onClose} title="Juntar cadastros">
      <p className="mb-3 text-sm text-stone-600">
        As vendas e pagamentos do cliente escolhido passam para <b>{target.name}</b>, e o cadastro duplicado é apagado.
      </p>
      <Select value={fromId} onChange={(e) => setFromId(e.target.value)}>
        <option value="">Selecione o cadastro duplicado…</option>
        {data.filter((c) => c.id !== target.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
      <ErrorMsg error={merge.error} />
      <Button className="mt-4 w-full" disabled={!fromId || merge.isPending} onClick={() => merge.mutate()}>Juntar</Button>
    </Modal>
  );
}

export function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => api<Customer & { sales: Sale[]; transactions: Transaction[] }>(`/customers/${id}`),
  });
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [merging, setMerging] = useState(false);
  if (isLoading || !data) return <Spinner />;

  const valid = data.sales.filter((s) => s.deliveryStatus !== 'CANCELADO');
  const open = valid.reduce((s, x) => s + x.open, 0);
  const total = valid.reduce((s, x) => s + x.total, 0);
  const qty = qtySum({
    kg: valid.filter((s) => s.product.unit === 'KG').reduce((s, x) => s + x.quantity, 0),
    un: valid.filter((s) => s.product.unit === 'UN').reduce((s, x) => s + x.quantity, 0),
  });
  const phone = data.phone?.replace(/\D/g, '');
  const reminder = encodeURIComponent(`Olá ${data.name.split(' ')[0]}! Passando para lembrar do valor em aberto da tapioca: ${money(open)}. Obrigado! 🙂`);

  return (
    <div className="space-y-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-stone-500 hover:text-brand-700"><ArrowLeft size={16} /> Voltar</button>
      <PageHeader
        title={data.name}
        actions={
          <>
            <Button variant="secondary" onClick={() => setMerging(true)} title="Juntar cadastro duplicado"><Merge size={16} /></Button>
            <Button variant="secondary" onClick={() => setEditing(true)}><Pencil size={16} /> Editar</Button>
          </>
        }
      >
        <div className="mt-1 flex flex-wrap gap-2 text-sm text-stone-500">
          {data.group && <Badge>{data.group}</Badge>}
          {data.phone && <span>{data.phone}</span>}
          {data.notes && <span className="italic">{data.notes}</span>}
        </div>
      </PageHeader>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Comprou" value={money(total)} sub={`${valid.length} venda(s)`} />
        <Stat label="Quantidade" value={qty} />
        <Stat label="Em aberto" value={money(open)} tone={open > 0 ? 'bad' : 'good'} />
      </div>

      {open > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setPaying(true)}><HandCoins size={18} /> Registrar recebimento</Button>
          {phone && (
            <a href={`https://wa.me/55${phone}?text=${reminder}`} target="_blank" rel="noreferrer">
              <Button variant="secondary"><MessageCircle size={18} /> Cobrar no WhatsApp</Button>
            </a>
          )}
        </div>
      )}

      <Card>
        <h2 className="border-b border-stone-100 px-4 py-3 font-semibold">Histórico de compras</h2>
        {!data.sales.length ? <Empty>Sem compras.</Empty> : (
          <ul className="divide-y divide-stone-100">
            {data.sales.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div>
                  <div>#{s.number} · {dateFmt(s.date)} · {qtyFmt(s.quantity, s.product.unit)} {s.product.name}</div>
                  {((s as any).lot || s.notes) && <div className="text-xs text-stone-500">{[(s as any).lot?.code, s.notes].filter(Boolean).join(' · ')}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <DeliveryBadge status={s.deliveryStatus} />
                  <PaymentBadge status={s.paymentStatus} />
                  <span className="w-20 text-right font-medium tabular-nums">{money(s.total)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="border-b border-stone-100 px-4 py-3 font-semibold">Pagamentos recebidos</h2>
        {!data.transactions.length ? <Empty>Nenhum pagamento.</Empty> : (
          <ul className="divide-y divide-stone-100">
            {data.transactions.map((t) => (
              <li key={t.id} className="flex justify-between px-4 py-2.5 text-sm">
                <span>{dateFmt(t.date)} · {t.paymentMethod ?? '—'} {t.description ? `· ${t.description}` : ''}</span>
                <span className="font-medium text-leaf-600 tabular-nums">{money(t.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing && <CustomerFormModal open onClose={() => setEditing(false)} customer={data} />}
      {merging && <MergeModal open onClose={() => setMerging(false)} target={data} />}
      <PaymentModal open={paying} onClose={() => setPaying(false)} customerId={data.id} preselect={valid.filter((s) => s.open > 0).map((s) => s.id)} />
    </div>
  );
}
