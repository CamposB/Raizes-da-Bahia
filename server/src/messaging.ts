/**
 * Mensagens do CRM.
 *
 * Hoje o envio é manual: o sistema monta o texto e abre o WhatsApp do usuário (wa.me).
 * Para o envio automático no futuro, basta implementar um `MessageSender` (ex.: WhatsApp
 * Cloud API, Z-API, Twilio) e um job que processe os ContactLog com status QUEUED.
 */
import type { ContactLog } from '@prisma/client';

export interface TemplateVars {
  nome: string;
  dias: number | null;
  ultima_compra: string | null; // dd/mm/aaaa
  valor_aberto: number;
  preco: number;
}

export const TEMPLATE_VARIABLES: { key: keyof TemplateVars; label: string }[] = [
  { key: 'nome', label: 'Primeiro nome do cliente' },
  { key: 'dias', label: 'Dias sem comprar' },
  { key: 'ultima_compra', label: 'Data da última compra' },
  { key: 'valor_aberto', label: 'Valor em aberto (R$)' },
  { key: 'preco', label: 'Preço da goma (1º produto do cadastro)' },
];

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Tira o grupo entre parênteses e pega o primeiro nome: "Gustavo (PWI)" -> "Gustavo" */
export const firstName = (name: string) => name.replace(/\(.*?\)/g, '').trim().split(/\s+/)[0] ?? name;

export function renderTemplate(body: string, v: TemplateVars) {
  const values: Record<string, string> = {
    nome: v.nome,
    dias: v.dias == null ? '' : String(v.dias),
    ultima_compra: v.ultima_compra ?? '',
    valor_aberto: brl(v.valor_aberto),
    preco: brl(v.preco),
  };
  return body.replace(/\{(\w+)\}/g, (m, k) => (k in values ? values[k] : m));
}

/** Telefone brasileiro só com dígitos e DDI 55, ou null se inválido. */
export function normalizePhone(phone: string | null | undefined) {
  const d = (phone ?? '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
  return null;
}

export const whatsappLink = (phone: string, text: string) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;

// ---- Ponto de extensão para o envio automático ----
export interface MessageSender {
  readonly channel: 'WHATSAPP';
  send(to: string, text: string): Promise<{ ok: true } | { ok: false; error: string }>;
}

/** Processa a fila de mensagens agendadas. Ainda não há um sender configurado. */
export async function processQueue(_sender: MessageSender, _pending: ContactLog[]) {
  throw new Error('Envio automático ainda não implementado');
}

export const DEFAULT_TEMPLATES = [
  {
    name: 'Sentimos sua falta',
    body: 'Oi {nome}! Tudo bem? 😊 Faz {dias} dias que você não pega tapioca com a gente. Saiu goma fresquinha, por {preco} o kg. Quer que eu separe pra você?',
  },
  {
    name: 'Lote novo chegou',
    body: 'Oi {nome}! Chegou lote novo de goma de tapioca da Raízes da Bahia 🌱 {preco} o kg. Posso reservar quantos kg pra você?',
  },
  {
    name: 'Lembrete de pagamento',
    body: 'Oi {nome}! Passando pra lembrar do valor em aberto da tapioca: {valor_aberto}. Pode ser por PIX. Obrigado! 🙏',
  },
];
