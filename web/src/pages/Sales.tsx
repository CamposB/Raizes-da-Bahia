import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, HandCoins, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api, qs, type Lot, type Product, type Sale } from '../api';
import { dateFmt, money, qtyFmt, qtySum } from '../format';
import { Button, Card, DeliveryBadge, Empty, Input, PageHeader, PaymentBadge, Select, Spinner } from '../components/ui';
import { PaymentModal, SaleFormModal, useInvalidateAll } from '../components/SaleForm';

export function SalesPage() {
  const [params, setParams] = useSearchParams();
  const filters = {
    q: params.get('q') ?? '',
    status: params.get('status') ?? '',
    payment: params.get('payment') ?? '',
    productId: params.get('productId') ?? '',
    lotId: params.get('lotId') ?? '',
  };
  const setFilter = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    v ? p.set(k, v) : p.delete(k);
    setParams(p, { replace: true });
  };

  const { data, isLoading } = useQuery({
    queryKey: ['sales', filters],
    queryFn: () => api<{ rows: Sale[]; summary: { count: number; kg: number; un: number; total: number; open: number } }>(`/sales${qs(filters)}`),
  });
  const { data: lots = [] } = useQuery({ queryKey: ['lots'], queryFn: () => api<Lot[]>('/lots') });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: () => api<Product[]>('/products') });

  const [editing, setEditing] = useState<Sale | undefined>();
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<Sale | undefined>();
  const invalidate = useInvalidateAll();

  const deliver = useMutation({
    mutationFn: (s: Sale) => api(`/sales/${s.id}`, { method: 'PATCH', body: { deliveryStatus: 'ENTREGUE' } }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (s: Sale) => api(`/sales/${s.id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
  const confirmRemove = (s: Sale) => {
    if (confirm(`Excluir a venda #${s.number} de ${s.customer.name}? Os recebimentos continuam no financeiro.`)) remove.mutate(s);
  };

  const Actions = ({ s }: { s: Sale }) => (
    <div className="flex justify-end gap-1">
      {s.deliveryStatus === 'PENDENTE' && (
        <IconBtn title="Marcar como entregue" onClick={() => deliver.mutate(s)}><CheckCircle2 size={18} /></IconBtn>
      )}
      {s.open > 0 && <IconBtn title="Registrar recebimento" onClick={() => setPaying(s)}><HandCoins size={18} /></IconBtn>}
      <IconBtn title="Editar" onClick={() => setEditing(s)}><Pencil size={18} /></IconBtn>
      <IconBtn title="Excluir" onClick={() => confirmRemove(s)}><Trash2 size={18} /></IconBtn>
    </div>
  );

  return (
    <div>
      <PageHeader title="Vendas" actions={<Button onClick={() => setCreating(true)} className="hidden md:inline-flex"><Plus size={18} /> Nova venda</Button>}>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
          <div className="relative col-span-2 md:col-span-1">
            <Search size={16} className="absolute left-3 top-3 text-stone-400" />
            <Input placeholder="Buscar cliente…" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} className="pl-9" />
          </div>
          <Select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">Todas as entregas</option>
            <option value="PENDENTE">Pendentes</option>
            <option value="ENTREGUE">Entregues</option>
            <option value="CANCELADO">Canceladas</option>
          </Select>
          <Select value={filters.payment} onChange={(e) => setFilter('payment', e.target.value)}>
            <option value="">Todos pagamentos</option>
            <option value="ABERTO">A receber</option>
            <option value="PAGO">Pagas</option>
          </Select>
          <Select value={filters.productId} onChange={(e) => setFilter('productId', e.target.value)}>
            <option value="">Todos os produtos</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Select value={filters.lotId} onChange={(e) => setFilter('lotId', e.target.value)}>
            <option value="">Todos os lotes</option>
            {lots.map((l) => <option key={l.id} value={l.id}>{l.code}</option>)}
          </Select>
        </div>
      </PageHeader>

      {data && (
        <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-stone-600">
          <span><b>{data.summary.count}</b> vendas</span>
          <span><b>{qtySum(data.summary)}</b></span>
          <span>Total <b>{money(data.summary.total)}</b></span>
          {data.summary.open > 0 && <span className="text-red-600">A receber <b>{money(data.summary.open)}</b></span>}
        </div>
      )}

      {isLoading ? <Spinner /> : !data?.rows.length ? <Empty>Nenhuma venda encontrada.</Empty> : (
        <>
          {/* mobile: cartões */}
          <div className="space-y-2 md:hidden">
            {data.rows.map((s) => (
              <Card key={s.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link to={`/clientes/${s.customer.id}`} className="block truncate font-medium">{s.customer.name}</Link>
                    <div className="text-xs text-stone-500">#{s.number} · {dateFmt(s.date)} · {s.product.name}{s.lot ? ` · ${s.lot.code}` : ''}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold tabular-nums">{money(s.total)}</div>
                    <div className="text-xs text-stone-500">{qtyFmt(s.quantity, s.product.unit)}</div>
                  </div>
                </div>
                {s.notes && <div className="mt-1 text-xs italic text-stone-500">{s.notes}</div>}
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex gap-1"><DeliveryBadge status={s.deliveryStatus} /><PaymentBadge status={s.paymentStatus} /></div>
                  <Actions s={s} />
                </div>
              </Card>
            ))}
          </div>

          {/* desktop: tabela */}
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-stone-200 text-left text-xs uppercase text-stone-500">
                <tr>
                  <th className="px-4 py-3">#</th><th className="px-4 py-3">Data</th><th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Produto</th><th className="px-4 py-3 text-right">Qtd.</th><th className="px-4 py-3 text-right">Preço</th><th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Lote</th><th className="px-4 py-3">Entrega</th><th className="px-4 py-3">Pagamento</th><th />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.rows.map((s) => (
                  <tr key={s.id} className="hover:bg-stone-50">
                    <td className="px-4 py-2 text-stone-500">{s.number}</td>
                    <td className="px-4 py-2">{dateFmt(s.date)}</td>
                    <td className="px-4 py-2">
                      <Link to={`/clientes/${s.customer.id}`} className="font-medium hover:text-brand-700">{s.customer.name}</Link>
                      {s.notes && <div className="text-xs text-stone-500">{s.notes}</div>}
                    </td>
                    <td className="px-4 py-2">{s.product.name}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{qtyFmt(s.quantity, s.product.unit)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(s.unitPrice)}</td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">{money(s.total)}</td>
                    <td className="px-4 py-2 text-stone-500">{s.lot?.code ?? '—'}</td>
                    <td className="px-4 py-2"><DeliveryBadge status={s.deliveryStatus} /></td>
                    <td className="px-4 py-2"><PaymentBadge status={s.paymentStatus} /></td>
                    <td className="px-2 py-2"><Actions s={s} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <SaleFormModal open={creating || !!editing} sale={editing} onClose={() => { setCreating(false); setEditing(undefined); }} />
      {paying && <PaymentModal open onClose={() => setPaying(undefined)} customerId={paying.customerId} preselect={[paying.id]} />}
    </div>
  );
}

export const IconBtn = ({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) => (
  <button title={title} aria-label={title} onClick={onClick} className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-brand-700">
    {children}
  </button>
);
