import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Pencil, Plus } from 'lucide-react';
import { api, type Lot } from '../api';
import { dateFmt, kgFmt, money, todayISO } from '../format';
import { Badge, Button, Card, Empty, ErrorMsg, Field, Input, Modal, PageHeader, Spinner, Textarea } from '../components/ui';
import { useInvalidateAll } from '../components/SaleForm';

export function LotsPage() {
  const { data = [], isLoading } = useQuery({ queryKey: ['lots'], queryFn: () => api<Lot[]>('/lots') });
  const [editing, setEditing] = useState<Lot | null | undefined>(); // null = novo

  return (
    <div>
      <PageHeader title="Lotes" actions={<Button onClick={() => setEditing(null)}><Plus size={18} /> Novo lote</Button>} />
      <p className="mb-4 text-sm text-stone-500">
        Cada compra de goma do fornecedor é um lote. O custo vem dos lançamentos de saída ligados ao lote no Financeiro.
      </p>
      {isLoading ? <Spinner /> : !data.length ? <Empty>Nenhum lote.</Empty> : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((l) => {
            const pct = l.quantityKg ? Math.min(100, (l.soldKg / l.quantityKg) * 100) : null;
            return (
              <Card key={l.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 font-semibold">
                      {l.code} {l.closed ? <Badge>Encerrado</Badge> : <Badge tone="green">Ativo</Badge>}
                    </div>
                    <div className="text-xs text-stone-500">Comprado em {dateFmt(l.purchaseDate)}{l.supplier ? ` · ${l.supplier}` : ''}</div>
                  </div>
                  <button className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100" onClick={() => setEditing(l)} aria-label="Editar"><Pencil size={16} /></button>
                </div>
                {pct != null && (
                  <div className="mt-3">
                    <div className="h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full bg-brand-600" style={{ width: `${pct}%` }} /></div>
                    <div className="mt-1 text-xs text-stone-500">{kgFmt(l.soldKg)} de {kgFmt(l.quantityKg)} · resta {kgFmt(l.availableKg)}</div>
                  </div>
                )}
                <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div><dt className="text-xs text-stone-500">Vendido</dt><dd className="font-medium">{kgFmt(l.soldKg)}</dd></div>
                  <div><dt className="text-xs text-stone-500">Receita</dt><dd className="font-medium">{money(l.revenue)}</dd></div>
                  <div><dt className="text-xs text-stone-500">Custo</dt><dd className="font-medium">{money(l.cost)}</dd></div>
                  <div><dt className="text-xs text-stone-500">Pendente entrega</dt><dd>{kgFmt(l.pendingKg)}</dd></div>
                  <div><dt className="text-xs text-stone-500">Vendas</dt><dd>{l.salesCount}</dd></div>
                  <div>
                    <dt className="text-xs text-stone-500">Resultado</dt>
                    <dd className={`font-semibold ${l.profit >= 0 ? 'text-leaf-600' : 'text-red-600'}`}>{money(l.profit)}</dd>
                  </div>
                </dl>
                <Link to={`/vendas?lotId=${l.id}`} className="mt-3 inline-block text-sm text-brand-700 hover:underline">Ver vendas do lote →</Link>
              </Card>
            );
          })}
        </div>
      )}
      {editing !== undefined && <LotFormModal lot={editing ?? undefined} onClose={() => setEditing(undefined)} />}
    </div>
  );
}

function LotFormModal({ lot, onClose }: { lot?: Lot; onClose: () => void }) {
  const invalidate = useInvalidateAll();
  const [f, setF] = useState({
    code: lot?.code ?? `LO-${todayISO().replace(/-/g, '')}`,
    purchaseDate: lot?.purchaseDate.slice(0, 10) ?? todayISO(),
    quantityKg: lot?.quantityKg?.toString() ?? '',
    supplier: lot?.supplier ?? '',
    notes: lot?.notes ?? '',
    closed: lot?.closed ?? false,
  });
  const save = useMutation({
    mutationFn: () => {
      const body = { ...f, quantityKg: f.quantityKg ? Number(f.quantityKg) : null, supplier: f.supplier || null, notes: f.notes || null };
      return lot ? api(`/lots/${lot.id}`, { method: 'PATCH', body }) : api('/lots', { body });
    },
    onSuccess: () => { invalidate(); onClose(); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };
  return (
    <Modal open onClose={onClose} title={lot ? `Editar ${lot.code}` : 'Novo lote'}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Código"><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} required /></Field>
          <Field label="Data da compra"><Input type="date" value={f.purchaseDate} onChange={(e) => setF({ ...f, purchaseDate: e.target.value })} required /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantidade (kg)"><Input type="number" step="0.001" min="0" value={f.quantityKg} onChange={(e) => setF({ ...f, quantityKg: e.target.value })} /></Field>
          <Field label="Fornecedor"><Input value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} /></Field>
        </div>
        <Field label="Observações"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        {lot && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.closed} onChange={(e) => setF({ ...f, closed: e.target.checked })} className="h-4 w-4 accent-brand-600" /> Lote encerrado (não aparece em novas vendas)
          </label>
        )}
        {!lot && <p className="text-xs text-stone-500">Depois lance o valor pago no Financeiro como “Compra de lote” ligado a este lote.</p>}
        <ErrorMsg error={save.error} />
        <Button type="submit" className="w-full" disabled={save.isPending}>Salvar</Button>
      </form>
    </Modal>
  );
}
