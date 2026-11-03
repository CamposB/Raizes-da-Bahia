const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const kg = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

export const money = (v: number | null | undefined) => brl.format(v ?? 0);
export const kgFmt = (v: number | null | undefined) => `${kg.format(v ?? 0)} kg`;

/** ISO (yyyy-mm-dd...) -> dd/mm/aaaa, sem conversão de fuso */
export const dateFmt = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

export const monthFmt = (ym: string) => {
  const [y, m] = ym.split('-');
  return `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+m - 1]}/${y.slice(2)}`;
};

export const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
