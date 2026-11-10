import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { X } from 'lucide-react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({ variant = 'primary', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:opacity-50',
        variant === 'primary' && 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-700',
        variant === 'secondary' && 'border border-stone-300 bg-surface text-stone-700 hover:bg-stone-50',
        variant === 'ghost' && 'text-stone-600 hover:bg-stone-100',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
        className,
      )}
    />
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-stone-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

const inputCls =
  'rounded-lg border border-stone-300 bg-surface px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200';

// largura total por padrão, a menos que o className já defina uma (ex.: w-auto)
const fieldCls = (className?: string) => cx(inputCls, !/(^|\s)w-/.test(className ?? '') && 'w-full', className);

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={fieldCls(p.className)} />;

export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={fieldCls(p.className)} />;

export const Textarea = (p: React.ComponentProps<'textarea'>) => (
  <textarea rows={2} {...p} className={fieldCls(p.className)} />
);

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-xl border border-stone-200 bg-surface shadow-sm', className)}>{children}</div>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <Card className="p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</div>
      <div
        className={cx(
          'mt-1 whitespace-nowrap text-lg font-semibold tabular-nums sm:text-2xl',
          tone === 'good' && 'text-leaf-600',
          tone === 'warn' && 'text-amber-600',
          tone === 'bad' && 'text-red-600',
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-sm text-stone-500">{sub}</div>}
    </Card>
  );
}

const badgeTones: Record<string, string> = {
  green: 'bg-green-100 text-green-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
  gray: 'bg-stone-100 text-stone-600',
  blue: 'bg-sky-100 text-sky-800',
};
export const Badge = ({ tone = 'gray', children }: { tone?: keyof typeof badgeTones; children: ReactNode }) => (
  <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', badgeTones[tone])}>{children}</span>
);

export const DeliveryBadge = ({ status }: { status: string }) =>
  status === 'ENTREGUE' ? <Badge tone="green">Entregue</Badge> : status === 'CANCELADO' ? <Badge tone="gray">Cancelado</Badge> : <Badge tone="amber">Pendente</Badge>;

export const PaymentBadge = ({ status }: { status: string }) =>
  status === 'PAGO' ? <Badge tone="green">Pago</Badge> : status === 'PARCIAL' ? <Badge tone="blue">Parcial</Badge> : status === 'ABERTO' ? <Badge tone="red">A receber</Badge> : null;

export function PageHeader({ title, actions, children }: { title: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-stone-800 md:text-2xl">{title}</h1>
        <div className="flex gap-2">{actions}</div>
      </div>
      {children}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center md:p-4" onClick={onClose}>
      <div
        className={cx('max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-xl md:rounded-2xl pb-safe', wide ? 'md:max-w-2xl' : 'md:max-w-md')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-stone-500 hover:bg-stone-100" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="py-10 text-center text-sm text-stone-500">{children}</div>
);

export const Spinner = () => (
  <div className="flex justify-center py-10">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
  </div>
);

export const ErrorMsg = ({ error }: { error: unknown }) =>
  error ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{(error as Error).message}</div> : null;

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-lg border border-stone-300 bg-surface p-0.5 text-sm">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx('rounded-md px-3 py-1.5', value === o.value ? 'bg-brand-600 text-white' : 'text-stone-600 hover:bg-stone-100')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---- Confirmação ----
// window.confirm() não funciona em alguns navegadores embutidos e apps instalados (retorna "não" na hora),
// então a confirmação é feita com um modal próprio. Uso: if (await confirmDialog('Excluir?')) ...
type ConfirmReq = { message: string; danger: boolean; resolve: (ok: boolean) => void };
let pushConfirm: ((r: ConfirmReq) => void) | null = null;

export const confirmDialog = (message: string, { danger = true } = {}) =>
  new Promise<boolean>((resolve) => (pushConfirm ? pushConfirm({ message, danger, resolve }) : resolve(window.confirm(message))));

/** Montado uma vez no app; mostra os pedidos de confirmDialog(). */
export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmReq | null>(null);
  useEffect(() => {
    pushConfirm = setReq;
    return () => { pushConfirm = null; };
  }, []);
  const close = (ok: boolean) => { req?.resolve(ok); setReq(null); };
  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (!req) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => close(false)}>
      <div className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
        <p className="text-sm text-stone-700">{req.message}</p>
        <div className="mt-5 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => close(false)}>Cancelar</Button>
          <Button variant={req.danger ? 'danger' : 'primary'} className="flex-1" onClick={() => close(true)} autoFocus>Confirmar</Button>
        </div>
      </div>
    </div>
  );
}
