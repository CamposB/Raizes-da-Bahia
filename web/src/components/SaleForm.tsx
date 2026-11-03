import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus } from 'lucide-react';
import { api, type Customer, type Lot, type Sale } from '../api';
import { money, todayISO } from '../format';
import { Button, ErrorMsg, Field, Input, Modal, Segmented, Select, Textarea } from './ui';

export function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

/** Campo de cliente com busca; permite cadastrar um novo digitando o nome. */
export function CustomerPicker({ value, onChange }: { value: { id?: string; name: string }; onChange: (v: { id?: string; name: string }) => void }) {
  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: () => api<Customer[]>('/customers') });
  const [open, setOpen] = useState(false);
  const term = value.name.trim().toLowerCase();
  const matches = customers.filter((c) => c.active && (!term || c.name.toLowerCase().includes(term))).slice(0, 8);
  const exact = customers.some((c) => c.name.toLowerCase() === term);
  return (
    <div className="relative">
      <Input
        value={value.name}
        placeholder="Buscar ou cadastrar cliente"
        onChange={(e) => onChange({ name: e.target.value })}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        required
      />
      {open && (matches.length > 0 || (term && !exact)) && (
        <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-stone-200 bg-surface shadow-lg">
          {matches.map((c) => (
            <button
              type="button"
              key={c.id}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-brand-50"
              onMouseDown={() => onChange({ id: c.id, name: c.name })}
            >
              <span>{c.name}</span>
              {!!c.openBalance && <span className="text-xs text-red-600">deve {money(c.openBalance)}</span>}
            </button>
          ))}
          {term && !exact && (
            <div className="border-t border-stone-100 px-3 py-2 text-sm text-brand-700">+ Novo cliente: “{value.name.trim()}”</div>
          )}
        </div>
      )}
      {value.id && <div className="mt-1 text-xs text-leaf-600">Cliente cadastrado ✓</div>}
      {!value.id && term && <div className="mt-1 text-xs text-stone-500">Será cadastrado como novo cliente</div>}
    </div>
  );
}

export function SaleFormModal({ open, onClose, sale, onSaved }: { open: boolean; onClose: () => void; sale?: Sale; onSaved?: () => void }) {
  const invalidate = useInvalidateAll();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => api<Record<string, string>>('/settings') });
  const { data: lots = [] } = useQuery({ queryKey: ['lots'], queryFn: () => api<Lot[]>('/lots') });
  const openLots = useMemo(() => lots.filter((l) => !l.closed || l.id === sale?.lotId), [lots, sale]);

  const [f, setF] = useState({
    date: todayISO(),
    customer: { name: '' } as { id?: string; name: string },
    quantityKg: 1,
    unitPrice: 21,
    customTotal: '' as string,
    lotId: '',
    deliveryStatus: 'PENDENTE' as Sale['deliveryStatus'],
    notes: '',
    paidNow: false,
    method: 'PIX',
  });

  useEffect(() => {
    if (!open) return;
    if (sale) {
      setF({
        date: sale.date.slice(0, 10),
        customer: { id: sale.customer.id, name: sale.customer.name },
        quantityKg: sale.quantityKg,
        unitPrice: sale.unitPrice,
        customTotal: Math.abs(sale.total - sale.quantityKg * sale.unitPrice) > 0.009 ? String(sale.total) : '',
        lotId: sale.lotId ?? '',
        deliveryStatus: sale.deliveryStatus,
        notes: sale.notes ?? '',
        paidNow: false,
        method: 'PIX',
      });
    } else {
      setF((p) => ({
        ...p,
        date: todayISO(),
        customer: { id: undefined, name: '' },
        quantityKg: 1,
        unitPrice: Number(settings?.pricePerKg ?? 21),
        customTotal: '',
        lotId: openLots[0]?.id ?? '',
        deliveryStatus: 'PENDENTE',
        notes: '',
        paidNow: false,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sale?.id]);

  // dados que chegam depois de abrir o formulário (preço padrão e lote atual)
  useEffect(() => {
    if (open && !sale && settings) setF((p) => ({ ...p, unitPrice: Number(settings.pricePerKg) }));
  }, [open, sale, settings]);
  useEffect(() => {
    if (open && !sale && openLots[0]) setF((p) => (p.lotId ? p : { ...p, lotId: openLots[0].id }));
  }, [open, sale, openLots]);

  const total = f.customTotal !== '' ? Number(f.customTotal) : Math.round(f.quantityKg * f.unitPrice * 100) / 100;

  const save = useMutation({
    mutationFn: () => {
      const body = {
        date: f.date,
        ...(f.customer.id ? { customerId: f.customer.id } : { newCustomerName: f.customer.name.trim() }),
        quantityKg: Number(f.quantityKg),
        unitPrice: Number(f.unitPrice),
        ...(f.customTotal !== '' ? { total: Number(f.customTotal) } : {}),
        lotId: f.lotId || null,
        deliveryStatus: f.deliveryStatus,
        notes: f.notes || null,
        ...(f.paidNow && !sale ? { paidNow: { method: f.method } } : {}),
      };
      if (sale) {
        // edição: se o cliente digitado for novo, cria antes
        return (async () => {
          let customerId = f.customer.id;
          if (!customerId) customerId = (await api<Customer>('/customers', { body: { name: f.customer.name.trim() } })).id;
          const { newCustomerName, ...rest } = body as any;
          return api(`/sales/${sale.id}`, { method: 'PATCH', body: { ...rest, customerId, total } });
        })();
      }
      return api('/sales', { body });
    },
    onSuccess: () => {
      invalidate();
      onClose();
      onSaved?.();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Modal open={open} onClose={onClose} title={sale ? `Editar venda #${sale.number}` : 'Nova venda'}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Cliente">
          <CustomerPicker value={f.customer} onChange={(v) => set('customer', v)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantidade (kg)">
            <div className="flex items-center gap-1">
              <button type="button" className="rounded-lg border border-stone-300 p-2.5" onClick={() => set('quantityKg', Math.max(0.5, f.quantityKg - 1))} aria-label="Menos">
                <Minus size={16} />
              </button>
              <Input type="number" step="0.001" min="0.001" inputMode="decimal" value={f.quantityKg} onChange={(e) => set('quantityKg', Number(e.target.value))} className="text-center" required />
              <button type="button" className="rounded-lg border border-stone-300 p-2.5" onClick={() => set('quantityKg', f.quantityKg + 1)} aria-label="Mais">
                <Plus size={16} />
              </button>
            </div>
          </Field>
          <Field label="Preço por kg (R$)">
            <Input type="number" step="0.01" min="0" inputMode="decimal" value={f.unitPrice} onChange={(e) => set('unitPrice', Number(e.target.value))} required />
          </Field>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-brand-50 px-4 py-3">
          <span className="text-sm text-stone-600">Total</span>
          <span className="text-xl font-semibold text-brand-700">{money(total)}</span>
        </div>
        <details className="text-sm" open={f.customTotal !== ''}>
          <summary className="cursor-pointer text-stone-500">Desconto / total diferente</summary>
          <div className="mt-2">
            <Input type="number" step="0.01" min="0" placeholder="Total combinado (R$)" value={f.customTotal} onChange={(e) => set('customTotal', e.target.value)} />
          </div>
        </details>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data">
            <Input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} required />
          </Field>
          <Field label="Lote">
            <Select value={f.lotId} onChange={(e) => set('lotId', e.target.value)}>
              <option value="">— sem lote —</option>
              {openLots.map((l) => (
                <option key={l.id} value={l.id}>{l.code}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Entrega">
          <Segmented
            value={f.deliveryStatus}
            onChange={(v) => set('deliveryStatus', v)}
            options={[
              { value: 'PENDENTE', label: 'Pendente' },
              { value: 'ENTREGUE', label: 'Entregue' },
              ...(sale ? [{ value: 'CANCELADO' as const, label: 'Cancelado' }] : []),
            ]}
          />
        </Field>
        {!sale && (
          <div className="rounded-lg border border-stone-200 p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={f.paidNow} onChange={(e) => set('paidNow', e.target.checked)} className="h-4 w-4 accent-brand-600" />
              Cliente já pagou
            </label>
            {f.paidNow && (
              <Select className="mt-2" value={f.method} onChange={(e) => set('method', e.target.value)}>
                {['PIX', 'Dinheiro', 'Cartão', 'Outro'].map((m) => <option key={m}>{m}</option>)}
              </Select>
            )}
          </div>
        )}
        <Field label="Observação">
          <Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Ex.: sem peneirar, entregar no BRAS" />
        </Field>
        <ErrorMsg error={save.error} />
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button type="submit" className="flex-1" disabled={save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar'}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Registrar recebimento de um cliente, quitando uma ou mais vendas em aberto. */
export function PaymentModal({ open, onClose, customerId, preselect }: { open: boolean; onClose: () => void; customerId: string; preselect?: string[] }) {
  const invalidate = useInvalidateAll();
  const { data } = useQuery({
    queryKey: ['sales', { customerId, payment: 'ABERTO' }],
    queryFn: () => api<{ rows: Sale[] }>(`/sales?customerId=${customerId}&payment=ABERTO`),
    enabled: open && !!customerId,
  });
  const sales = data?.rows ?? [];
  const [selected, setSelected] = useState<string[]>([]);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState('PIX');
  const [transferred, setTransferred] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(preselect ?? []);
      setDate(todayISO());
      setTransferred(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const due = sales.filter((s) => selected.includes(s.id)).reduce((s, x) => s + x.open, 0);
  useEffect(() => setAmount(due ? due.toFixed(2) : ''), [due]);

  const save = useMutation({
    mutationFn: () => api('/payments', { body: { customerId, date, amount: Number(amount), method, saleIds: selected, transferred } }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  return (
    <Modal open={open} onClose={onClose} title="Registrar recebimento">
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
        <div>
          <div className="mb-2 text-sm font-medium text-stone-700">Vendas em aberto</div>
          {sales.length === 0 && <div className="text-sm text-stone-500">Nenhuma venda em aberto.</div>}
          <div className="space-y-1">
            {sales.map((s) => (
              <label key={s.id} className="flex items-center justify-between rounded-lg border border-stone-200 px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-brand-600"
                    checked={selected.includes(s.id)}
                    onChange={(e) => setSelected((p) => (e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id)))}
                  />
                  #{s.number} · {s.date.slice(8, 10)}/{s.date.slice(5, 7)} · {s.quantityKg} kg
                </span>
                <span className="font-medium">{money(s.open)}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor recebido (R$)">
            <Input type="number" step="0.01" min="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </Field>
          <Field label="Data">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
        </div>
        <Field label="Forma de pagamento">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {['PIX', 'Dinheiro', 'Cartão', 'Outro'].map((m) => <option key={m}>{m}</option>)}
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={transferred} onChange={(e) => setTransferred(e.target.checked)} className="h-4 w-4 accent-brand-600" />
          Já transferido para a conta (Nubank)
        </label>
        <ErrorMsg error={save.error} />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button type="submit" className="flex-1" disabled={!selected.length || save.isPending}>Confirmar</Button>
        </div>
      </form>
    </Modal>
  );
}
