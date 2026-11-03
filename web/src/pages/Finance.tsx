import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowDownCircle, ArrowUpCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, qs, type Lot, type Transaction } from '../api';
import { dateFmt, money, todayISO } from '../format';
import { Badge, Button, Card, Empty, ErrorMsg, Field, Input, Modal, PageHeader, Segmented, Select, Spinner, Stat } from '../components/ui';
import { CustomerPicker, useInvalidateAll } from '../components/SaleForm';
import { IconBtn } from './Sales';

export function FinancePage() {
  const [type, setType] = useState('');
  const [transferred, setTransferred] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [editing, setEditing] = useState<Transaction | null | undefined>();
  const [selected, setSelected] = useState<string[]>([]);
  const invalidate = useInvalidateAll();

  const filters = { type, transferred, from, to };
  const { data, isLoading } = useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => api<{ rows: Transaction[]; summary: { income: number; expense: number; balance: number } }>(`/transactions${qs(filters)}`),
  });

  const remove = useMutation({ mutationFn: (t: Transaction) => api(`/transactions/${t.id}`, { method: 'DELETE' }), onSuccess: invalidate });
  const markTransferred = useMutation({
    mutationFn: () => api('/transactions/mark-transferred', { body: { ids: selected, date: todayISO() } }),
    onSuccess: () => { setSelected([]); invalidate(); },
  });
  const toggle = (id: string) => setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div>
      <PageHeader title="Financeiro" actions={<Button onClick={() => setEditing(null)}><Plus size={18} /> Lançamento</Button>}>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Segmented value={type} onChange={setType} options={[{ value: '', label: 'Tudo' }, { value: 'ENTRADA', label: 'Entradas' }, { value: 'SAIDA', label: 'Saídas' }]} />
          <Select value={transferred} onChange={(e) => setTransferred(e.target.value)} className="w-auto">
            <option value="">Transferência: todas</option>
            <option value="false">Não transferidas</option>
            <option value="true">Transferidas</option>
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" aria-label="De" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" aria-label="Até" />
        </div>
      </PageHeader>

      {data && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <Stat label="Entradas" value={money(data.summary.income)} tone="good" />
          <Stat label="Saídas" value={money(data.summary.expense)} tone="bad" />
          <Stat label="Saldo" value={money(data.summary.balance)} />
        </div>
      )}

      {selected.length > 0 && (
        <div className="sticky top-14 z-20 mb-3 flex items-center justify-between rounded-lg bg-brand-600 px-4 py-2 text-sm text-white md:top-2">
          <span>{selected.length} selecionado(s)</span>
          <button className="font-medium underline" onClick={() => markTransferred.mutate()}>Marcar como transferido p/ Nubank</button>
        </div>
      )}

      {isLoading ? <Spinner /> : !data?.rows.length ? <Empty>Nenhum lançamento.</Empty> : (
        <Card>
          <ul className="divide-y divide-stone-100">
            {data.rows.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2.5 text-sm md:px-4">
                {t.type === 'ENTRADA' && !t.transferred ? (
                  <input type="checkbox" checked={selected.includes(t.id)} onChange={() => toggle(t.id)} className="h-4 w-4 shrink-0 accent-brand-600" aria-label="Selecionar" />
                ) : <span className="w-4 shrink-0" />}
                {t.type === 'ENTRADA' ? <ArrowDownCircle size={20} className="shrink-0 text-leaf-600" /> : <ArrowUpCircle size={20} className="shrink-0 text-red-500" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{t.customer?.name ?? t.description ?? t.category}</div>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-stone-500">
                    <span>#{t.number} · {dateFmt(t.date)}</span>
                    <span>{t.category}</span>
                    {t.paymentMethod && <span>{t.paymentMethod}</span>}
                    {t.lot && <span>{t.lot.code}</span>}
                    {!!t.allocations?.length && <span>vendas {t.allocations.map((a) => '#' + a.sale.number).join(', ')}</span>}
                    {t.type === 'ENTRADA' && (t.transferred ? <Badge tone="green">Nubank {t.transferredAt ? dateFmt(t.transferredAt).slice(0, 5) : ''}</Badge> : <Badge tone="amber">Não transferido</Badge>)}
                  </div>
                </div>
                <span className={`shrink-0 font-semibold tabular-nums ${t.type === 'ENTRADA' ? 'text-leaf-600' : 'text-red-600'}`}>
                  {t.type === 'SAIDA' ? '−' : ''}{money(t.amount)}
                </span>
                <div className="hidden shrink-0 md:flex">
                  <IconBtn title="Editar" onClick={() => setEditing(t)}><Pencil size={16} /></IconBtn>
                  <IconBtn title="Excluir" onClick={() => confirm('Excluir este lançamento? Vendas ligadas a ele voltam a ficar em aberto.') && remove.mutate(t)}><Trash2 size={16} /></IconBtn>
                </div>
                <button className="shrink-0 p-1 text-stone-400 md:hidden" onClick={() => setEditing(t)} aria-label="Editar"><Pencil size={16} /></button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {editing !== undefined && <TransactionFormModal tx={editing ?? undefined} onClose={() => setEditing(undefined)} onDelete={(t) => remove.mutate(t)} />}
    </div>
  );
}

function TransactionFormModal({ tx, onClose, onDelete }: { tx?: Transaction; onClose: () => void; onDelete: (t: Transaction) => void }) {
  const invalidate = useInvalidateAll();
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => api<Record<'ENTRADA' | 'SAIDA', string[]>>('/transactions/categories') });
  const { data: lots = [] } = useQuery({ queryKey: ['lots'], queryFn: () => api<Lot[]>('/lots') });
  const [f, setF] = useState({
    type: tx?.type ?? ('SAIDA' as 'ENTRADA' | 'SAIDA'),
    date: tx?.date.slice(0, 10) ?? todayISO(),
    amount: tx?.amount.toString() ?? '',
    category: tx?.category ?? 'Compra de lote',
    description: tx?.description ?? '',
    paymentMethod: tx?.paymentMethod ?? 'PIX',
    customer: { id: tx?.customer?.id, name: tx?.customer?.name ?? '' } as { id?: string; name: string },
    lotId: tx?.lotId ?? '',
    transferred: tx?.transferred ?? false,
  });
  const cats = categories?.[f.type] ?? [];
  const save = useMutation({
    mutationFn: async () => {
      let customerId = f.customer.id ?? null;
      if (!customerId && f.customer.name.trim()) customerId = (await api('/customers', { body: { name: f.customer.name.trim() } })).id;
      const body = {
        type: f.type, date: f.date, amount: Number(f.amount), category: f.category, description: f.description || null,
        paymentMethod: f.paymentMethod || null, customerId, lotId: f.lotId || null, transferred: f.transferred,
      };
      return tx ? api(`/transactions/${tx.id}`, { method: 'PATCH', body }) : api('/transactions', { body });
    },
    onSuccess: () => { invalidate(); onClose(); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };

  return (
    <Modal open onClose={onClose} title={tx ? `Lançamento #${tx.number}` : 'Novo lançamento'}>
      <form onSubmit={submit} className="space-y-3">
        <Segmented
          value={f.type}
          onChange={(v) => setF({ ...f, type: v, category: v === 'ENTRADA' ? 'Venda' : 'Compra de lote' })}
          options={[{ value: 'SAIDA', label: 'Saída (despesa)' }, { value: 'ENTRADA', label: 'Entrada' }]}
        />
        {tx?.allocations?.length ? (
          <p className="text-xs text-stone-500">Este recebimento quita as vendas {tx.allocations.map((a) => '#' + a.sale.number).join(', ')}.</p>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor (R$)"><Input type="number" step="0.01" min="0.01" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required /></Field>
          <Field label="Data"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoria">
            <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {[...new Set([...cats, f.category])].map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Forma de pagamento">
            <Select value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value })}>
              {['PIX', 'Dinheiro', 'Cartão', 'Outro'].map((m) => <option key={m}>{m}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Descrição"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Ex.: Compra quinto lote, adesivos…" /></Field>
        {f.type === 'ENTRADA' ? (
          <>
            <Field label="Cliente (opcional)"><CustomerPicker value={f.customer} onChange={(v) => setF({ ...f, customer: v })} /></Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.transferred} onChange={(e) => setF({ ...f, transferred: e.target.checked })} className="h-4 w-4 accent-brand-600" /> Já transferido para o Nubank
            </label>
          </>
        ) : (
          <Field label="Lote (para custo do lote)">
            <Select value={f.lotId} onChange={(e) => setF({ ...f, lotId: e.target.value })}>
              <option value="">— nenhum —</option>
              {lots.map((l) => <option key={l.id} value={l.id}>{l.code}</option>)}
            </Select>
          </Field>
        )}
        <ErrorMsg error={save.error} />
        <div className="flex gap-2">
          {tx && (
            <Button type="button" variant="secondary" onClick={() => { if (confirm('Excluir este lançamento?')) { onDelete(tx); onClose(); } }}>
              <Trash2 size={16} />
            </Button>
          )}
          <Button type="submit" className="flex-1" disabled={save.isPending}>Salvar</Button>
        </div>
      </form>
    </Modal>
  );
}
