import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { BellOff, Bot, MessageCircle, Pencil, PhoneCall, Plus, Search, Trash2 } from 'lucide-react';
import { api, qs } from '../api';
import { dateFmt, money } from '../format';
import { Badge, Button, Card, confirmDialog, Empty, ErrorMsg, Field, Input, Modal, PageHeader, Segmented, Select, Spinner, Stat, Textarea } from '../components/ui';
import { useInvalidateAll } from '../components/SaleForm';

type Segment = 'ATIVO' | 'EM_RISCO' | 'INATIVO' | 'SEM_COMPRA';
type Channel = 'WHATSAPP' | 'LIGACAO' | 'PESSOALMENTE' | 'OUTRO';

interface CrmCustomer {
  id: string; name: string; group: string | null; phone: string | null; whatsapp: string | null; optOut: boolean;
  purchases: number; totalKg: number; totalSpent: number; openBalance: number;
  lastPurchase: string | null; daysSince: number | null; avgInterval: number | null; nextExpected: string | null;
  lastContact: { at: string; channel: Channel; status: string } | null;
  segment: Segment;
}
interface Template { id: string; name: string; body: string; active: boolean }
interface Contact {
  id: string; channel: Channel; status: string; message: string | null; notes: string | null; sentAt: string;
  customer: { id: string; name: string }; template: { name: string } | null; createdBy: { name: string } | null;
}

const SEGMENTS: Record<Segment, { label: string; tone: 'green' | 'amber' | 'red' | 'gray'; hint: string }> = {
  ATIVO: { label: 'Ativos', tone: 'green', hint: 'comprando no ritmo normal' },
  EM_RISCO: { label: 'Em risco', tone: 'amber', hint: 'atrasados em relação ao costume' },
  INATIVO: { label: 'Inativos', tone: 'red', hint: 'sem comprar no período' },
  SEM_COMPRA: { label: 'Sem compra', tone: 'gray', hint: 'cadastrados que nunca compraram' },
};
const CHANNELS: Record<Channel, string> = { WHATSAPP: 'WhatsApp', LIGACAO: 'Ligação', PESSOALMENTE: 'Pessoalmente', OUTRO: 'Outro' };
const PERIODS = [15, 30, 45, 60, 90];

const ago = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`;
};

export function CrmPage() {
  const [tab, setTab] = useState<'clientes' | 'mensagens' | 'historico'>('clientes');
  return (
    <div>
      <PageHeader title="CRM">
        <p className="mt-1 text-sm text-stone-500">Veja quem parou de comprar e chame de volta.</p>
        <div className="mt-3">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'clientes', label: 'Clientes' },
              { value: 'mensagens', label: 'Mensagens' },
              { value: 'historico', label: 'Histórico' },
            ]}
          />
        </div>
      </PageHeader>
      {tab === 'clientes' && <CustomersTab />}
      {tab === 'mensagens' && <TemplatesTab />}
      {tab === 'historico' && <HistoryTab />}
    </div>
  );
}

// ---------------- Clientes ----------------
function CustomersTab() {
  const [days, setDays] = useState(30);
  const [segment, setSegment] = useState<Segment | ''>('INATIVO');
  const [q, setQ] = useState('');
  const [contacting, setContacting] = useState<CrmCustomer | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['crm', days],
    queryFn: () => api<{ summary: Record<Segment, number>; lostPerCycle: number; rows: CrmCustomer[] }>(`/crm/customers${qs({ days: String(days) })}`),
  });
  const term = q.trim().toLowerCase();
  const rows = (data?.rows ?? [])
    .filter((r) => !segment || r.segment === segment)
    .filter((r) => !term || r.name.toLowerCase().includes(term) || r.group?.toLowerCase().includes(term));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-stone-600">Considerar inativo quem não compra há</span>
        <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-auto">
          {PERIODS.map((p) => <option key={p} value={p}>{p} dias</option>)}
        </Select>
        <span className="text-stone-600">ou mais</span>
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(Object.keys(SEGMENTS) as Segment[]).map((s) => (
            <button key={s} onClick={() => setSegment(segment === s ? '' : s)} className="text-left">
              <div className={`rounded-xl ${segment === s ? 'ring-2 ring-brand-500' : ''}`}>
                <Stat
                  label={SEGMENTS[s].label}
                  value={data.summary[s]}
                  sub={s === 'INATIVO' && data.lostPerCycle ? `≈ ${money(data.lostPerCycle)} por rodada de compras` : SEGMENTS[s].hint}
                  tone={s === 'INATIVO' ? 'bad' : s === 'EM_RISCO' ? 'warn' : s === 'ATIVO' ? 'good' : undefined}
                />
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="relative">
        <Search size={16} className="absolute left-3 top-3 text-stone-400" />
        <Input placeholder="Buscar cliente ou grupo…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? <Spinner /> : !rows.length ? <Empty>Nenhum cliente nessa situação. 🎉</Empty> : (
        <Card>
          <ul className="divide-y divide-stone-100">
            {rows.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/clientes/${c.id}`} className="font-medium hover:text-brand-700">{c.name}</Link>
                    <Badge tone={SEGMENTS[c.segment].tone}>{SEGMENTS[c.segment].label.replace(/s$/, '')}</Badge>
                    {c.optOut && <Badge><BellOff size={12} className="mr-1" />Não quer mensagens</Badge>}
                  </div>
                  <div className="mt-0.5 text-xs text-stone-500">
                    {c.lastPurchase ? (
                      <>
                        Última compra <b className="text-stone-700">{dateFmt(c.lastPurchase)}</b> ({c.daysSince} dias)
                        {c.avgInterval ? ` · costuma comprar a cada ${c.avgInterval} dias` : ''}
                        {' · '}{c.purchases} compra(s), {money(c.totalSpent)}
                      </>
                    ) : 'Nunca comprou'}
                    {c.openBalance > 0 && <span className="text-red-600"> · deve {money(c.openBalance)}</span>}
                  </div>
                  <div className="text-xs text-stone-500">
                    {c.lastContact ? `Último contato ${ago(c.lastContact.at)} (${CHANNELS[c.lastContact.channel]})` : 'Nenhum contato registrado'}
                    {!c.phone && <> · <span className="text-amber-600">sem telefone</span></>}
                  </div>
                </div>
                <Button variant="secondary" onClick={() => setContacting(c)} disabled={c.optOut}>
                  <MessageCircle size={16} /> Contatar
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {contacting && <ContactModal customer={contacting} onClose={() => setContacting(null)} />}
    </div>
  );
}

function ContactModal({ customer, onClose }: { customer: CrmCustomer; onClose: () => void }) {
  const invalidate = useInvalidateAll();
  const { data: tpl } = useQuery({ queryKey: ['crm-templates'], queryFn: () => api<{ templates: Template[] }>('/crm/templates') });
  const templates = (tpl?.templates ?? []).filter((t) => t.active);
  const [templateId, setTemplateId] = useState('');
  const [text, setText] = useState('');
  const [channel, setChannel] = useState<Channel>('WHATSAPP');
  const [notes, setNotes] = useState('');
  const [phone, setPhone] = useState(customer.phone ?? '');

  // sugere "Lembrete de pagamento" para quem deve, senão o primeiro modelo
  useEffect(() => {
    if (templateId || !templates.length) return;
    const pay = customer.openBalance > 0 && templates.find((t) => /pagamento/i.test(t.name));
    setTemplateId((pay || templates[0]).id);
  }, [templates, templateId, customer.openBalance]);

  useEffect(() => {
    if (!templateId) return;
    api<{ text: string }>('/crm/preview', { body: { customerId: customer.id, templateId } }).then((r) => setText(r.text));
  }, [templateId, customer.id]);

  const digits = phone.replace(/\D/g, '');
  const waPhone = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits.startsWith('55') && digits.length >= 12 ? digits : null;

  const log = useMutation({
    mutationFn: async () => {
      if (phone !== (customer.phone ?? '')) await api(`/customers/${customer.id}`, { method: 'PATCH', body: { phone: phone || null } });
      return api('/crm/contacts', {
        body: { customerId: customer.id, channel, templateId: channel === 'WHATSAPP' ? templateId || null : null, message: channel === 'WHATSAPP' ? text : null, notes: notes || null },
      });
    },
    onSuccess: () => { invalidate(); onClose(); },
  });

  const sendWhatsapp = () => {
    if (!waPhone) return;
    window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    log.mutate();
  };

  return (
    <Modal open onClose={onClose} title={`Contatar ${customer.name}`}>
      <div className="space-y-3">
        <Segmented value={channel} onChange={setChannel} options={(Object.keys(CHANNELS) as Channel[]).map((c) => ({ value: c, label: CHANNELS[c] }))} />
        <Field label="Telefone / WhatsApp" hint={!waPhone && phone ? 'Use DDD + número, ex.: (11) 98765-4321' : undefined}>
          <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 98765-4321" />
        </Field>
        {channel === 'WHATSAPP' ? (
          <>
            <Field label="Modelo">
              <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <Field label="Mensagem" hint="Você pode ajustar antes de enviar.">
              <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
          </>
        ) : (
          <Field label="Como foi o contato?">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: vai pegar 2 kg na sexta" />
          </Field>
        )}
        <ErrorMsg error={log.error} />
        {channel === 'WHATSAPP' ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="flex-1" onClick={sendWhatsapp} disabled={!waPhone || !text || log.isPending}>
              <MessageCircle size={18} /> Abrir WhatsApp e registrar
            </Button>
            <Button variant="secondary" onClick={() => log.mutate()} disabled={log.isPending}>Só registrar</Button>
          </div>
        ) : (
          <Button className="w-full" onClick={() => log.mutate()} disabled={log.isPending}><PhoneCall size={18} /> Registrar contato</Button>
        )}
      </div>
    </Modal>
  );
}

// ---------------- Mensagens ----------------
function TemplatesTab() {
  const invalidate = useInvalidateAll();
  const { data, isLoading } = useQuery({
    queryKey: ['crm-templates'],
    queryFn: () => api<{ templates: Template[]; variables: { key: string; label: string }[] }>('/crm/templates'),
  });
  const [editing, setEditing] = useState<Template | null | undefined>();
  const remove = useMutation({ mutationFn: (id: string) => api(`/crm/templates/${id}`, { method: 'DELETE' }), onSuccess: invalidate });

  if (isLoading || !data) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setEditing(null)}><Plus size={18} /> Novo modelo</Button></div>
      <div className="grid gap-3 md:grid-cols-2">
        {data.templates.map((t) => (
          <Card key={t.id} className={`p-4 ${t.active ? '' : 'opacity-60'}`}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="font-semibold">{t.name} {!t.active && <Badge>Desativado</Badge>}</div>
              <div className="flex">
                <button className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100" onClick={() => setEditing(t)} aria-label="Editar"><Pencil size={16} /></button>
                <button className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100" onClick={async () => (await confirmDialog(`Excluir o modelo "${t.name}"?`)) && remove.mutate(t.id)} aria-label="Excluir"><Trash2 size={16} /></button>
              </div>
            </div>
            <p className="whitespace-pre-wrap text-sm text-stone-600">{t.body}</p>
          </Card>
        ))}
      </div>

      <Card className="flex gap-3 border-dashed p-4">
        <Bot size={22} className="mt-0.5 shrink-0 text-brand-600" />
        <div className="text-sm text-stone-600">
          <div className="font-semibold text-stone-800">Envio automático <Badge tone="blue">em breve</Badge></div>
          Os modelos e o histórico já estão prontos para o envio automático. Exemplo: mandar “Sentimos sua falta” para quem passar de {`{dias}`} dias sem comprar, ou “Lote novo chegou” para todos os ativos. Clientes marcados como “não quer mensagens” ficam de fora.
        </div>
      </Card>

      {editing !== undefined && <TemplateModal template={editing ?? undefined} variables={data.variables} onClose={() => setEditing(undefined)} />}
    </div>
  );
}

function TemplateModal({ template, variables, onClose }: { template?: Template; variables: { key: string; label: string }[]; onClose: () => void }) {
  const invalidate = useInvalidateAll();
  const [name, setName] = useState(template?.name ?? '');
  const [body, setBody] = useState(template?.body ?? '');
  const [active, setActive] = useState(template?.active ?? true);
  const ref = useRef<HTMLTextAreaElement>(null);
  const save = useMutation({
    mutationFn: () => (template ? api(`/crm/templates/${template.id}`, { method: 'PATCH', body: { name, body, active } }) : api('/crm/templates', { body: { name, body } })),
    onSuccess: () => { invalidate(); onClose(); },
  });
  const insert = (key: string) => {
    const el = ref.current;
    const tag = `{${key}}`;
    if (!el) return setBody((b) => b + tag);
    const { selectionStart: s, selectionEnd: e } = el;
    setBody(body.slice(0, s) + tag + body.slice(e));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + tag.length, s + tag.length); });
  };
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };
  return (
    <Modal open onClose={onClose} title={template ? 'Editar modelo' : 'Novo modelo'}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
        <Field label="Mensagem"><Textarea ref={ref} rows={6} value={body} onChange={(e) => setBody(e.target.value)} required /></Field>
        <div>
          <div className="mb-1 text-xs text-stone-500">Toque para inserir uma variável:</div>
          <div className="flex flex-wrap gap-1.5">
            {variables.map((v) => (
              <button type="button" key={v.key} title={v.label} onClick={() => insert(v.key)} className="rounded-md bg-stone-100 px-2 py-1 font-mono text-xs text-stone-700 hover:bg-brand-100">
                {`{${v.key}}`}
              </button>
            ))}
          </div>
        </div>
        {template && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-brand-600" /> Ativo
          </label>
        )}
        <ErrorMsg error={save.error} />
        <Button type="submit" className="w-full" disabled={save.isPending}>Salvar</Button>
      </form>
    </Modal>
  );
}

// ---------------- Histórico ----------------
function HistoryTab() {
  const invalidate = useInvalidateAll();
  const { data = [], isLoading } = useQuery({ queryKey: ['crm-contacts'], queryFn: () => api<Contact[]>('/crm/contacts') });
  const remove = useMutation({ mutationFn: (id: string) => api(`/crm/contacts/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
  if (isLoading) return <Spinner />;
  if (!data.length) return <Empty>Nenhum contato registrado ainda. Use “Contatar” na aba Clientes.</Empty>;
  return (
    <Card>
      <ul className="divide-y divide-stone-100">
        {data.map((c) => (
          <li key={c.id} className="flex gap-3 px-4 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link to={`/clientes/${c.customer.id}`} className="font-medium hover:text-brand-700">{c.customer.name}</Link>
                <Badge>{CHANNELS[c.channel]}</Badge>
                {c.status !== 'MANUAL' && <Badge tone={c.status === 'SENT' ? 'green' : c.status === 'FAILED' ? 'red' : 'blue'}>{c.status === 'SENT' ? 'Enviado (auto)' : c.status === 'FAILED' ? 'Falhou' : 'Agendado'}</Badge>}
                <span className="text-xs text-stone-500">{new Date(c.sentAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}{c.createdBy ? ` · ${c.createdBy.name}` : ''}</span>
              </div>
              {c.template && <div className="text-xs text-stone-500">Modelo: {c.template.name}</div>}
              {(c.message || c.notes) && <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-stone-600">{c.message ?? c.notes}</p>}
            </div>
            <button className="self-start rounded-lg p-1.5 text-stone-400 hover:bg-stone-100" onClick={async () => (await confirmDialog('Excluir este registro?')) && remove.mutate(c.id)} aria-label="Excluir"><Trash2 size={16} /></button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
