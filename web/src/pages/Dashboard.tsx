import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api';
import { kgFmt, money, monthFmt, qtyFmt, qtySum } from '../format';
import { Card, PageHeader, Spinner, Stat } from '../components/ui';

interface Dash {
  cash: number; income: number; expense: number; notTransferred: number;
  receivable: { count: number; total: number };
  pendingDelivery: { count: number; kg: number; un: number; total: number };
  month: { count: number; kg: number; un: number; total: number; byProduct: { id: string; name: string; unit: 'KG' | 'UN'; quantity: number; total: number }[] };
  totals: { kg: number; un: number; sales: number; customers: number };
  series: { month: string; kg: number; sales: number; income: number; expense: number }[];
  topCustomers: { id: string; name: string; kg: number; total: number }[];
  currentLot: { id: string; code: string; quantityKg: number | null; soldKg: number; revenue: number; cost: number } | null;
}

export function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dash>('/dashboard') });
  if (isLoading || !data) return <Spinner />;
  const series = data.series.map((s) => ({ ...s, label: monthFmt(s.month) }));

  return (
    <div className="space-y-5">
      <PageHeader title="Visão geral" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Saldo em caixa" value={money(data.cash)} sub={`${money(data.notTransferred)} a transferir`} tone={data.cash >= 0 ? 'good' : 'bad'} />
        <Link to="/vendas?payment=ABERTO">
          <Stat label="A receber" value={money(data.receivable.total)} sub={`${data.receivable.count} venda(s)`} tone={data.receivable.total ? 'bad' : undefined} />
        </Link>
        <Link to="/vendas?status=PENDENTE">
          <Stat label="Entregas pendentes" value={qtySum(data.pendingDelivery)} sub={`${data.pendingDelivery.count} pedido(s) · ${money(data.pendingDelivery.total)}`} tone={data.pendingDelivery.count ? 'warn' : undefined} />
        </Link>
        <Stat
          label="Vendas no mês"
          value={money(data.month.total)}
          sub={
            <>
              {data.month.count} venda(s)
              {data.month.byProduct.map((p) => (
                <span key={p.id} className="block truncate text-xs">{qtyFmt(p.quantity, p.unit)} · {p.name}</span>
              ))}
            </>
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-semibold">Vendas por mês</h2>
            <span className="text-sm text-stone-500">{qtySum(data.totals)} vendidos no total</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ left: -10, right: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-stone-200)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-stone-500)' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--color-stone-500)' }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v, name) => [name === 'kg' ? kgFmt(Number(v)) : money(Number(v)), name === 'sales' ? 'Vendido' : name === 'expense' ? 'Despesas' : 'Kg']} cursor={{ fill: 'var(--color-stone-100)' }} contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-stone-200)', borderRadius: 8 }} labelStyle={{ color: 'var(--color-stone-800)' }} />
                <Bar dataKey="sales" fill="var(--color-brand-600)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" fill="var(--color-brand-200)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex gap-4 text-xs text-stone-500">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-brand-600" /> Vendido</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-brand-200" /> Despesas</span>
          </div>
        </Card>

        <div className="space-y-4">
          {data.currentLot && (
            <Card className="p-4">
              <h2 className="mb-2 font-semibold">Lote atual · {data.currentLot.code}</h2>
              <dl className="space-y-1 text-sm">
                <Row k="Vendido" v={kgFmt(data.currentLot.soldKg)} />
                {data.currentLot.quantityKg != null && <Row k="Disponível" v={kgFmt(data.currentLot.quantityKg - data.currentLot.soldKg)} />}
                <Row k="Receita" v={money(data.currentLot.revenue)} />
                <Row k="Custo" v={money(data.currentLot.cost)} />
                <Row k="Resultado" v={<b className={data.currentLot.revenue - data.currentLot.cost >= 0 ? 'text-leaf-600' : 'text-red-600'}>{money(data.currentLot.revenue - data.currentLot.cost)}</b>} />
              </dl>
            </Card>
          )}
          <Card className="p-4">
            <h2 className="mb-2 font-semibold">Melhores clientes</h2>
            <ol className="space-y-1.5 text-sm">
              {data.topCustomers.map((c, i) => (
                <li key={c.id} className="flex justify-between gap-2">
                  <Link to={`/clientes/${c.id}`} className="truncate hover:text-brand-700">{i + 1}. {c.name}</Link>
                  <span className="shrink-0 tabular-nums text-stone-600">{money(c.total)}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total entradas" value={money(data.income)} />
        <Stat label="Total saídas" value={money(data.expense)} />
        <Stat label="Clientes" value={data.totals.customers} />
      </div>
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex justify-between"><dt className="text-stone-500">{k}</dt><dd className="tabular-nums">{v}</dd></div>
);
