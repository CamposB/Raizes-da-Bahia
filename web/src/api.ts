// No web o front e a API ficam no mesmo domínio. No app mobile (Capacitor) defina VITE_API_URL.
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const TOKEN_KEY = 'raizes.token';

export const tokenStore = {
  get: () => {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set: (t: string | null) => {
    try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* sem storage */ }
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(`${BASE}/api${path}`, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: {
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/auth/login') onUnauthorized();
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Erro ao comunicar com o servidor');
  return data as T;
}

export const qs = (params: Record<string, string | undefined | null>) => {
  const p = Object.entries(params).filter(([, v]) => v) as [string, string][];
  return p.length ? '?' + new URLSearchParams(p).toString() : '';
};

// ---- tipos ----
export type Role = 'ADMIN' | 'OPERADOR';
export interface User { id: string; name: string; email: string; role: Role; active?: boolean }
export interface Customer {
  id: string; name: string; group: string | null; phone: string | null; notes: string | null; active: boolean; optOut?: boolean;
  salesCount?: number; totalKg?: number; totalSpent?: number; openBalance?: number; lastPurchase?: string | null;
}
export interface Lot {
  id: string; code: string; purchaseDate: string; quantityKg: number | null; supplier: string | null; notes: string | null;
  closed: boolean; soldKg: number; deliveredKg: number; pendingKg: number; availableKg: number | null;
  revenue: number; cost: number; profit: number; salesCount: number;
}
export type DeliveryStatus = 'PENDENTE' | 'ENTREGUE' | 'CANCELADO';
export type PaymentStatus = 'PAGO' | 'PARCIAL' | 'ABERTO' | 'NA';
export interface Sale {
  id: string; number: number; date: string; customerId: string; customer: { id: string; name: string; group: string | null };
  quantityKg: number; unitPrice: number; total: number; deliveryStatus: DeliveryStatus; deliveredAt: string | null;
  lotId: string | null; lot: { id: string; code: string } | null; notes: string | null; legacyCode: string | null;
  paid: number; open: number; paymentStatus: PaymentStatus;
  payments: { amount: number; transaction: { id: string; number: number; date: string; paymentMethod: string | null } }[];
}
export interface Transaction {
  id: string; number: number; date: string; type: 'ENTRADA' | 'SAIDA'; category: string; description: string | null;
  amount: number; paymentMethod: string | null; transferred: boolean; transferredAt: string | null;
  customerId: string | null; customer: { id: string; name: string } | null; lotId: string | null; lot: { id: string; code: string } | null;
  allocations?: { amount: number; sale: { id: string; number: number } }[];
}
