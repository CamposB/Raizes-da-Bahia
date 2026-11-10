import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Boxes, HeartHandshake, Home, LogOut, Menu, Monitor, Moon, Package, Plus, Settings, ShoppingBasket, Sun, Users, UserCog, Wallet } from 'lucide-react';
import { useAuth } from '../auth';
import { useTheme, type ThemeMode } from '../theme';
import { SaleFormModal } from './SaleForm';

const themeOptions: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Automático (igual ao aparelho)', icon: Monitor },
];

function ThemeToggle({ mode, onChange }: { mode: ThemeMode; onChange: (m: ThemeMode) => void }) {
  return (
    <div className="flex rounded-lg border border-stone-200 p-0.5" role="radiogroup" aria-label="Tema">
      {themeOptions.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={mode === o.value}
          title={o.label}
          aria-label={o.label}
          onClick={() => onChange(o.value)}
          className={`flex flex-1 items-center justify-center rounded-md py-1.5 ${mode === o.value ? 'bg-brand-100 text-brand-700' : 'text-stone-500 hover:bg-stone-100'}`}
        >
          <o.icon size={16} />
        </button>
      ))}
    </div>
  );
}

const nav = [
  { to: '/', label: 'Início', icon: Home, end: true },
  { to: '/vendas', label: 'Vendas', icon: ShoppingBasket },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/crm', label: 'CRM', icon: HeartHandshake },
  { to: '/lotes', label: 'Lotes', icon: Boxes },
  { to: '/financeiro', label: 'Financeiro', icon: Wallet },
];

export function Layout() {
  const { user, logout } = useAuth();
  const [newSale, setNewSale] = useState(false);
  const [more, setMore] = useState(false);
  const [theme, setTheme] = useTheme();
  const navigate = useNavigate();
  const extra = [
    ...(user?.role === 'ADMIN'
      ? [
          { to: '/produtos', label: 'Produtos', icon: Package },
          { to: '/usuarios', label: 'Usuários', icon: UserCog },
        ]
      : []),
    { to: '/configuracoes', label: 'Configurações', icon: Settings },
  ];

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-100 text-brand-700' : 'text-stone-600 hover:bg-stone-100'}`;

  return (
    <div className="min-h-screen md:flex">
      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-stone-200 bg-surface p-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <img src="/icon.svg" className="h-9 w-9" alt="" />
          <div>
            <div className="font-semibold leading-tight text-brand-700">Raízes da Bahia</div>
            <div className="text-xs text-stone-500">Gestão de vendas</div>
          </div>
        </div>
        <button
          onClick={() => setNewSale(true)}
          className="mb-4 flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus size={18} /> Nova venda
        </button>
        <nav className="flex flex-1 flex-col gap-1">
          {[...nav, ...extra].map((n) => (
            <NavLink key={n.to} to={n.to} end={'end' in n} className={linkCls}>
              <n.icon size={18} /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-stone-200 pt-3">
          <div className="mb-3 px-1"><ThemeToggle mode={theme} onChange={setTheme} /></div>
          <div className="px-3 text-sm font-medium">{user?.name}</div>
          <div className="px-3 text-xs text-stone-500">{user?.role === 'ADMIN' ? 'Administrador' : 'Operador'}</div>
          <button onClick={logout} className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100">
            <LogOut size={18} /> Sair
          </button>
        </div>
      </aside>

      {/* Topo mobile */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-stone-200 bg-surface/95 px-4 py-3 backdrop-blur md:hidden">
        <div className="flex items-center gap-2">
          <img src="/icon.svg" className="h-7 w-7" alt="" />
          <span className="font-semibold text-brand-700">Raízes da Bahia</span>
        </div>
        <button onClick={() => setMore(!more)} className="rounded-lg p-1.5 text-stone-600 hover:bg-stone-100" aria-label="Menu">
          <Menu size={22} />
        </button>
      </header>
      {more && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMore(false)}>
          <div className="absolute right-3 top-14 w-56 rounded-xl border border-stone-200 bg-surface p-2 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="px-3 py-2 text-sm font-medium">{user?.name}</div>
            {[nav[3], nav[4], ...extra].map((n) => (
              <NavLink key={n.to} to={n.to} className={linkCls} onClick={() => setMore(false)}>
                <n.icon size={18} /> {n.label}
              </NavLink>
            ))}
            <div className="px-1 py-2"><ThemeToggle mode={theme} onChange={setTheme} /></div>
            <button onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100">
              <LogOut size={18} /> Sair
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-4 md:px-8 md:pb-10 md:pt-8">
        <Outlet />
      </main>

      {/* Barra inferior mobile */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-stone-200 bg-surface md:hidden">
        {[nav[0], nav[1]].map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? 'text-brand-600' : 'text-stone-500'}`}>
            <n.icon size={22} /> {n.label}
          </NavLink>
        ))}
        <button onClick={() => setNewSale(true)} className="flex flex-col items-center justify-center" aria-label="Nova venda">
          <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg">
            <Plus size={26} />
          </span>
        </button>
        {[nav[2], nav[5]].map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? 'text-brand-600' : 'text-stone-500'}`}>
            <n.icon size={22} /> {n.label}
          </NavLink>
        ))}
      </nav>

      <SaleFormModal open={newSale} onClose={() => setNewSale(false)} onSaved={() => navigate('/vendas')} />
    </div>
  );
}
