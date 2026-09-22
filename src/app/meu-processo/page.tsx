'use client';

import { useState, useRef, useEffect } from 'react';

/* ==================== TYPES ==================== */
interface AudienciaData {
  data: string; horario: string; tipo: string; orgaoJulgador: string;
  modalidade: string; endereco: string; advogado: string;
}
interface PastHearingData {
  data: string; horario: string; tipo: string;
  orgaoJulgador: string; advogado: string; status: string;
}
interface ProcessoData {
  numeroProcesso?: string; empresa?: string; entrada?: string;
  materia?: string; advogado?: string; fase?: string;
  proximoPasso?: string; audiencia?: AudienciaData | null;
  audienciasPassadas?: PastHearingData[];
}
interface ConsultaResult {
  found: boolean; error?: string; message?: string;
  nome?: string; cpf?: string; processos?: ProcessoData[];
}

/* ==================== HELPERS ==================== */
function formatCPF(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/* ==================== TIMELINE DATA ==================== */
const TIMELINE_STAGES = [
  { key: 'contrato', label: 'Contrato Assinado', icon: '📝' },
  { key: 'inicial', label: 'Petição Inicial', icon: '📄' },
  { key: 'distribuido', label: 'Processo Distribuído', icon: '⚖️' },
  { key: 'audiencia_conciliacao', label: 'Audiência de Conciliação', icon: '🤝' },
  { key: 'audiencia_instrucao', label: 'Audiência de Instrução', icon: '📋' },
  { key: 'sentenca', label: 'Sentença', icon: '🔨' },
  { key: 'recurso', label: 'Recurso / Execução', icon: '📊' },
];

function getTimelineIndex(fase?: string): number {
  if (!fase) return 0;
  const f = fase.toUpperCase();
  if (f.includes('ELABORA')) return 1;
  if (f.includes('DISTRIBU')) return 2;
  if (f.includes('CONCILIA') && f.includes('AGENDADA')) return 3;
  if (f.includes('CONCILIA') || f.includes('PÓS-CONCILIA') || f.includes('POS-CONCILIA')) return 4;
  if (f.includes('INSTRU') && f.includes('AGENDADA')) return 4;
  if (f.includes('INSTRU') || f.includes('SENTENÇA') || f.includes('SENTENCA') || f.includes('AGUARDANDO SENT')) return 5;
  if (f.includes('JULGAMENTO') || f.includes('PÓS-JULGAMENTO') || f.includes('RECURSO') || f.includes('ENCERRADO')) return 6;
  if (f.includes('AUDIÊNCIA') || f.includes('AUDIENCIA')) return 3;
  return 2; // default: at least distributed
}

/* ==================== FAQ DATA ==================== */
const FAQ_ITEMS = [
  { q: 'Quanto tempo demora meu processo?', a: 'Um processo trabalhista pode levar de 6 meses a 3 anos, dependendo da complexidade. A maioria resolve entre 1 e 2 anos. Nosso escritório trabalha para agilizar ao máximo.' },
  { q: 'O que é audiência de conciliação?', a: 'É a primeira audiência, onde o juiz tenta um acordo entre você e a empresa. Caso não haja acordo, o processo segue para a audiência de instrução. É obrigatório comparecer.' },
  { q: 'Posso faltar na audiência?', a: 'NÃO. A falta do reclamante (você) na audiência pode causar o arquivamento do processo. Se tiver impedimento, avise o escritório com antecedência para justificar.' },
  { q: 'O que acontece se eu não comparecer?', a: 'Se faltar na audiência inaugural, o processo será ARQUIVADO. Se faltar na audiência de instrução, será aplicada a penalidade de confissão ficta (presume-se que os fatos alegados pela empresa são verdadeiros).' },
  { q: 'Quando vou receber meus direitos?', a: 'Após a sentença favorável e trânsito em julgado, inicia-se a fase de execução. O prazo para recebimento depende da empresa. Em caso de acordo, o pagamento segue o prazo combinado.' },
  { q: 'O que é audiência online/telepresencial?', a: 'É uma audiência realizada por videoconferência. Você recebe um link de acesso e participa de casa. Precisa de câmera, microfone e internet estável. Tenha seu RG em mãos.' },
  { q: 'Posso acompanhar meu processo no tribunal?', a: 'Sim! Acesse o site do PJe (pje.trt2.jus.br) e pesquise pelo número do seu processo. Lá constam todas as movimentações oficiais.' },
];

/* ==================== CHECKLIST DATA ==================== */
const CHECKLIST_PRESENCIAL = [
  'Levar RG e CPF originais',
  'Levar Carteira de Trabalho (física ou digital)',
  'Chegar 1 hora antes no local',
  'Vestimenta adequada (sem boné, bermuda ou chinelo)',
  'Levar documentos solicitados pelo advogado',
  'Manter o celular no silencioso durante a audiência',
];
const CHECKLIST_ONLINE = [
  'Testar câmera e microfone com antecedência',
  'Estar em local silencioso e bem iluminado',
  'Acessar o link 1 hora antes para testar',
  'Manter o celular/computador carregado',
  'Ter RG em mãos para identificação',
  'Usar fones de ouvido para melhor áudio',
];

/* ==================== MAIN PAGE ==================== */
export default function MeuProcessoPage() {
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ConsultaResult | null>(null);

  const handleConsulta = async () => {
    const digits = cpf.replace(/\D/g, '');
    if (!nome.trim() || nome.trim().length < 3) {
      setResult({ found: false, error: 'Informe seu nome completo.' }); return;
    }
    if (digits.length !== 11) {
      setResult({ found: false, error: 'Informe os 11 dígitos do CPF.' }); return;
    }
    setLoading(true); setResult(null);
    try {
      const res = await fetch('/api/public/consulta', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nome.trim(), cpf: digits }),
      });
      setResult(await res.json());
    } catch { setResult({ found: false, error: 'Erro de conexão. Tente novamente.' }); }
    setLoading(false);
  };

  const processos = result?.processos || [];
  const showResults = result && result.found && processos.length > 0;

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 1rem',
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '1.5rem', maxWidth: '500px' }}>
        <div style={{
          width: '80px', height: '80px', borderRadius: '50%', margin: '0 auto 0.75rem',
          background: 'linear-gradient(135deg, rgba(212,175,55,0.15), rgba(30,41,59,0.8))',
          border: '2px solid rgba(212,175,55,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 30px rgba(212,175,55,0.1)',
        }}>
          <img src="/bmc-logo.png" alt="BM&C" style={{ width: '55px', height: '55px', objectFit: 'contain' }} />
        </div>
        <div style={{ fontSize: '1.5rem', color: '#f1f5f9', fontWeight: 700 }}>BM&C Advogados</div>
        <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>Consulte o andamento do seu processo</p>
      </div>

      {/* Login Form */}
      {!showResults && (
        <div style={{
          background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(148,163,184,0.15)',
          borderRadius: '1rem', padding: '1.5rem', maxWidth: '460px', width: '100%',
        }}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ color: '#cbd5e1', fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Nome Completo</label>
            <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome completo"
              style={{ ...inputStyle }} />
          </div>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ color: '#cbd5e1', fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>CPF</label>
            <input type="text" value={cpf} onChange={(e) => setCpf(formatCPF(e.target.value))}
              onKeyDown={(e) => e.key === 'Enter' && handleConsulta()} placeholder="000.000.000-00"
              style={{ ...inputStyle, fontFamily: 'monospace' }} />
          </div>
          <button onClick={handleConsulta} disabled={loading} style={{
            width: '100%', padding: '0.85rem', borderRadius: '0.5rem', border: 'none',
            background: loading ? '#475569' : 'linear-gradient(135deg, #3b82f6, #6366f1)',
            color: '#fff', fontWeight: 700, fontSize: '0.95rem', cursor: loading ? 'not-allowed' : 'pointer',
          }}>
            {loading ? '⏳ Consultando...' : '🔍 Acessar Meu Processo'}
          </button>
          {result && !result.found && (
            <div style={{ marginTop: '1rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '0.5rem', padding: '0.75rem', color: '#fca5a5', fontSize: '0.85rem', textAlign: 'center' }}>
              {result.error}
            </div>
          )}
          {result && result.found && processos.length === 0 && result.message && (
            <div style={{ marginTop: '1rem', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)',
              borderRadius: '0.5rem', padding: '0.75rem', color: '#93c5fd', fontSize: '0.85rem', textAlign: 'center' }}>
              {result.message}
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {showResults && (
        <div style={{ maxWidth: '550px', width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Welcome Bar */}
          <div style={{
            background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(148,163,184,0.15)',
            borderRadius: '1rem', padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f1f5f9' }}>{result!.nome}</div>
              {processos.length > 1 && <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{processos.length} processos</div>}
            </div>
            <button onClick={() => { setResult(null); setNome(''); setCpf(''); }} style={{
              padding: '0.4rem 0.75rem', borderRadius: '0.4rem', border: '1px solid rgba(148,163,184,0.2)',
              background: 'transparent', color: '#94a3b8', fontSize: '0.75rem', cursor: 'pointer',
            }}>Sair</button>
          </div>

          {/* Process Cards */}
          {processos.map((p, i) => (
            <ProcessCard key={i} processo={p} index={i} total={processos.length} nome={result!.nome || ''} cpf={result!.cpf || ''} />
          ))}


          {/* Indicação */}
          <IndicacaoSection nome={result!.nome || ''} />

          {/* NPS */}
          <AvaliacaoSection nome={result!.nome || ''} cpf={result!.cpf || ''} />

          {/* FAQ */}
          <FAQSection />
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: '2rem', color: '#475569', fontSize: '0.75rem', textAlign: 'center' }}>
        BM&C Advogados © {new Date().getFullYear()} — Todos os direitos reservados
      </div>

      {/* Chat IA Widget Flutuante */}
      {result && processos.length > 0 && (
        <ChatSection nome={result.nome || ''} cpf={result.cpf || ''} processos={processos} />
      )}
    </div>
  );
}

/* ==================== PROCESS CARD ==================== */
function ProcessCard({ processo: p, index, total, nome, cpf }: {
  processo: ProcessoData; index: number; total: number; nome: string; cpf: string;
}) {
  const timelineIdx = getTimelineIndex(p.fase);
  const isOnline = p.audiencia?.modalidade?.includes('Online') || false;

  return (
    <div style={{ background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: '1rem', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(148,163,184,0.1)', background: 'rgba(99,102,241,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {total > 1 && (
            <div style={{
              width: '26px', height: '26px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0,
            }}>{index + 1}</div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            {p.numeroProcesso && <div style={{ color: '#a78bfa', fontSize: '0.8rem', fontFamily: 'monospace', fontWeight: 600 }}>{p.numeroProcesso}</div>}
            {p.empresa && <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '0.1rem' }}>vs {p.empresa}</div>}
          </div>
        </div>
      </div>

      {/* Info */}
      {(p.entrada || p.advogado) && (
        <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid rgba(148,163,184,0.1)' }}>
          <div style={{ display: 'flex', gap: '2rem' }}>
            {p.entrada && <Field label="Entrada" value={p.entrada} />}
            {p.advogado && <Field label="Advogado" value={p.advogado} />}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(148,163,184,0.1)', background: 'rgba(99,102,241,0.02)' }}>
        <div style={{ color: '#818cf8', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
          Andamento do Processo
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {TIMELINE_STAGES.map((stage, i) => {
            const completed = i <= timelineIdx;
            const isCurrent = i === timelineIdx;
            return (
              <div key={stage.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                {/* Line + Dot */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '20px', flexShrink: 0 }}>
                  <div style={{
                    width: isCurrent ? '18px' : '14px', height: isCurrent ? '18px' : '14px', borderRadius: '50%',
                    background: completed
                      ? isCurrent ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : '#4ade80'
                      : 'rgba(71,85,105,0.4)',
                    border: isCurrent ? '2px solid rgba(99,102,241,0.5)' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.5rem', color: '#fff', transition: 'all 0.3s',
                    boxShadow: isCurrent ? '0 0 12px rgba(99,102,241,0.4)' : 'none',
                  }}>
                    {completed && !isCurrent ? '✓' : ''}
                  </div>
                  {i < TIMELINE_STAGES.length - 1 && (
                    <div style={{
                      width: '2px', height: '20px',
                      background: i < timelineIdx ? '#4ade80' : 'rgba(71,85,105,0.3)',
                    }} />
                  )}
                </div>
                {/* Label */}
                <div style={{
                  paddingTop: isCurrent ? '0' : '0',
                  color: completed ? (isCurrent ? '#e2e8f0' : '#94a3b8') : '#475569',
                  fontSize: isCurrent ? '0.8rem' : '0.75rem',
                  fontWeight: isCurrent ? 700 : 400,
                  lineHeight: '18px',
                }}>
                  {stage.icon} {stage.label}
                  {isCurrent && <span style={{ color: '#818cf8', fontSize: '0.65rem', marginLeft: '0.3rem' }}>← Aqui</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Phase Description */}
      {p.fase && p.proximoPasso && (
        <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid rgba(148,163,184,0.1)' }}>
          <div style={{ color: '#94a3b8', fontSize: '0.75rem', lineHeight: 1.4 }}>{p.proximoPasso}</div>
        </div>
      )}

      {/* Hearing */}
      {p.audiencia && (
        <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid rgba(148,163,184,0.1)', background: 'rgba(34,197,94,0.03)' }}>
          <div style={{ color: '#4ade80', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
            Próxima Audiência
          </div>
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            <Field label="Data e Horário" value={`${p.audiencia.data} às ${p.audiencia.horario || 'A confirmar'}`} bold />
            {p.audiencia.tipo && <Field label="Tipo" value={p.audiencia.tipo} />}
            <Field label="Modalidade" value={p.audiencia.modalidade} valueColor={isOnline ? '#60a5fa' : '#e2e8f0'} />
            {p.audiencia.orgaoJulgador && <Field label="Vara / Órgão" value={p.audiencia.orgaoJulgador} />}
            {p.audiencia.endereco && !isOnline && (
              <div>
                <div style={{ color: '#64748b', fontSize: '0.65rem', fontWeight: 600 }}>Endereço</div>
                <div style={{ color: '#e2e8f0', fontSize: '0.8rem' }}>{p.audiencia.endereco}</div>
                <button onClick={() => window.open(`https://www.google.com/maps/search/${encodeURIComponent(p.audiencia!.endereco)}`, '_blank')}
                  style={{ marginTop: '0.2rem', padding: '0.15rem 0.4rem', borderRadius: '0.25rem', border: 'none',
                    background: 'rgba(59,130,246,0.15)', color: '#60a5fa', fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer' }}>
                  📍 Abrir no Google Maps
                </button>
              </div>
            )}
            {p.audiencia.advogado && <Field label="Advogado" value={p.audiencia.advogado} />}
          </div>
        </div>
      )}

      {/* Checklist Pré-Audiência */}
      {p.audiencia && <ChecklistSection isOnline={isOnline} />}

      {/* No future hearing */}
      {!p.audiencia && p.numeroProcesso && (
        <div style={{ padding: '0.6rem 1.25rem', borderBottom: '1px solid rgba(148,163,184,0.1)',
          textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>Nenhuma audiência agendada</div>
      )}

      {/* Past hearings */}
      {p.audienciasPassadas && p.audienciasPassadas.length > 0 && (
        <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid rgba(148,163,184,0.1)' }}>
          <div style={{ color: '#64748b', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
            📅 Audiências Realizadas
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {p.audienciasPassadas.map((ph, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.5rem 0.7rem', borderRadius: '0.5rem',
                background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)',
              }}>
                <div>
                  <div style={{ color: '#e2e8f0', fontSize: '0.78rem', fontWeight: 600 }}>
                    {ph.data} {ph.horario ? `às ${ph.horario}` : ''}
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '0.68rem' }}>
                    {ph.tipo || 'Audiência'} {ph.orgaoJulgador ? `• ${ph.orgaoJulgador}` : ''}
                  </div>
                </div>
                <span style={{
                  padding: '0.2rem 0.5rem', borderRadius: '1rem',
                  background: 'rgba(34,197,94,0.15)', color: '#4ade80',
                  fontSize: '0.6rem', fontWeight: 700,
                }}>
                  ✓ Realizada
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* WhatsApp */}
      <div style={{ padding: '0.75rem 1.25rem' }}>
        <button onClick={() => {
          const proc = p.numeroProcesso ? `, processo ${p.numeroProcesso}` : '';
          const msg = encodeURIComponent(`Olá! Meu nome é ${nome}, CPF ${cpf}${proc}. Gostaria de informações sobre meu processo.`);
          window.open(`https://wa.me/5511943241698?text=${msg}`, '_blank');
        }} style={{
          width: '100%', padding: '0.7rem', borderRadius: '0.5rem', border: 'none',
          background: 'linear-gradient(135deg, #25D366, #128C7E)',
          color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
        }}>💬 Falar com o Escritório</button>
      </div>
    </div>
  );
}

/* ==================== CHECKLIST ==================== */
function ChecklistSection({ isOnline }: { isOnline: boolean }) {
  const [checks, setChecks] = useState<boolean[]>([]);
  const items = isOnline ? CHECKLIST_ONLINE : CHECKLIST_PRESENCIAL;

  const toggle = (i: number) => {
    const next = [...checks];
    next[i] = !next[i];
    setChecks(next);
  };

  return (
    <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid rgba(148,163,184,0.1)', background: 'rgba(251,191,36,0.03)' }}>
      <div style={{ color: '#fbbf24', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
        ✅ Checklist Pré-Audiência
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {items.map((item, i) => (
          <button key={i} onClick={() => toggle(i)} style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none',
            cursor: 'pointer', textAlign: 'left', padding: '0.25rem 0',
          }}>
            <div style={{
              width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0,
              border: checks[i] ? 'none' : '1.5px solid rgba(148,163,184,0.3)',
              background: checks[i] ? '#4ade80' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.6rem', color: '#fff', transition: 'all 0.2s',
            }}>
              {checks[i] ? '✓' : ''}
            </div>
            <span style={{
              color: checks[i] ? '#64748b' : '#cbd5e1', fontSize: '0.78rem',
              textDecoration: checks[i] ? 'line-through' : 'none', transition: 'all 0.2s',
            }}>{item}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ==================== INDICAÇÃO ==================== */
function IndicacaoSection({ nome }: { nome: string }) {
  const [open, setOpen] = useState(false);
  const [nomeInd, setNomeInd] = useState('');
  const [tel, setTel] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    if (!nomeInd.trim() || !tel.trim()) { setError('Preencha todos os campos.'); return; }
    const digits = tel.replace(/\D/g, '');
    if (digits.length < 10) { setError('Telefone inválido.'); return; }
    setError('');
    try {
      const res = await fetch('/api/public/indicacao', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nomeIndicador: nome, nomeIndicado: nomeInd.trim(), telefone: digits }),
      });
      if (res.ok) { setSent(true); } else { setError('Erro ao enviar. Tente novamente.'); }
    } catch { setError('Erro de conexão.'); }
  };

  return (
    <div style={{ background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: '1rem', overflow: 'hidden' }}>
      <button onClick={() => !sent && setOpen(!open)} style={{
        width: '100%', padding: '1rem 1.25rem', border: 'none', background: 'rgba(34,197,94,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
      }}>
        <span style={{ color: '#4ade80', fontWeight: 700, fontSize: '0.85rem' }}>👥 Indique um amigo</span>
        <span style={{ color: '#64748b', fontSize: '0.75rem' }}>{sent ? '✅ Enviado!' : open ? '▲' : '▼'}</span>
      </button>
      {open && !sent && (
        <div style={{ padding: '0.75rem 1.25rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <p style={{ color: '#94a3b8', fontSize: '0.75rem', margin: 0 }}>Conhece alguém que precisa de um advogado trabalhista? Indique!</p>
          <input type="text" placeholder="Nome do indicado" value={nomeInd} onChange={(e) => setNomeInd(e.target.value)}
            style={{ ...inputStyle, fontSize: '0.85rem', padding: '0.6rem 0.75rem' }} />
          <input type="text" placeholder="Telefone (WhatsApp)" value={tel} onChange={(e) => setTel(formatPhone(e.target.value))}
            style={{ ...inputStyle, fontSize: '0.85rem', padding: '0.6rem 0.75rem' }} />
          {error && <div style={{ color: '#fca5a5', fontSize: '0.75rem' }}>{error}</div>}
          <button onClick={send} style={{
            padding: '0.6rem', borderRadius: '0.5rem', border: 'none',
            background: 'linear-gradient(135deg, #4ade80, #22c55e)', color: '#fff', fontWeight: 700,
            fontSize: '0.8rem', cursor: 'pointer',
          }}>Enviar Indicação</button>
        </div>
      )}
    </div>
  );
}

/* ==================== AVALIAÇÃO (NPS) ==================== */
function AvaliacaoSection({ nome, cpf }: { nome: string; cpf: string }) {
  const [nota, setNota] = useState(0);
  const [hover, setHover] = useState(0);
  const [comentario, setComentario] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    if (nota === 0) { setError('Selecione uma nota.'); return; }
    setError('');
    try {
      const res = await fetch('/api/public/avaliacao', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, cpf, nota, comentario: comentario.trim() }),
      });
      if (res.ok) { setSent(true); } else { setError('Erro ao enviar.'); }
    } catch { setError('Erro de conexão.'); }
  };

  if (sent) {
    return (
      <div style={{
        background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(148,163,184,0.15)',
        borderRadius: '1rem', padding: '1.25rem', textAlign: 'center',
      }}>
        <div style={{ fontSize: '1.5rem', marginBottom: '0.3rem' }}>🙏</div>
        <div style={{ color: '#f1f5f9', fontWeight: 600 }}>Obrigado pela sua avaliação!</div>
        <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Sua opinião nos ajuda a melhorar.</div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(148,163,184,0.15)',
      borderRadius: '1rem', padding: '1.25rem',
    }}>
      <div style={{ color: '#d4af37', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.75rem' }}>⭐ Avalie nosso atendimento</div>
      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.75rem', justifyContent: 'center' }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onClick={() => setNota(n)} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.8rem', padding: '0.1rem',
              filter: n <= (hover || nota) ? 'none' : 'grayscale(1) opacity(0.3)', transition: 'all 0.15s',
              transform: n <= (hover || nota) ? 'scale(1.1)' : 'scale(1)',
            }}>⭐</button>
        ))}
      </div>
      <textarea placeholder="Deixe um comentário (opcional)" value={comentario}
        onChange={(e) => setComentario(e.target.value)} rows={2}
        style={{ ...inputStyle, resize: 'none', fontSize: '0.8rem', padding: '0.6rem 0.75rem', marginBottom: '0.5rem' }} />
      {error && <div style={{ color: '#fca5a5', fontSize: '0.75rem', marginBottom: '0.3rem' }}>{error}</div>}
      <button onClick={send} style={{
        width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: 'none',
        background: nota > 0 ? 'linear-gradient(135deg, #d4af37, #b8860b)' : '#475569',
        color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: nota > 0 ? 'pointer' : 'not-allowed',
      }}>Enviar Avaliação</button>
    </div>
  );
}

/* ==================== FAQ ==================== */
function FAQSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <div style={{ background: 'rgba(30,41,59,0.8)', border: '1px solid rgba(148,163,184,0.15)', borderRadius: '1rem', overflow: 'hidden' }}>
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid rgba(148,163,184,0.1)' }}>
        <div style={{ color: '#60a5fa', fontSize: '0.85rem', fontWeight: 700 }}>❓ Perguntas Frequentes</div>
      </div>
      {FAQ_ITEMS.map((item, i) => (
        <div key={i} style={{ borderBottom: i < FAQ_ITEMS.length - 1 ? '1px solid rgba(148,163,184,0.08)' : 'none' }}>
          <button onClick={() => setOpenIdx(openIdx === i ? null : i)} style={{
            width: '100%', padding: '0.75rem 1.25rem', border: 'none', background: 'transparent',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', textAlign: 'left',
          }}>
            <span style={{ color: '#e2e8f0', fontSize: '0.8rem', fontWeight: 500, flex: 1, paddingRight: '0.5rem' }}>{item.q}</span>
            <span style={{ color: '#64748b', fontSize: '0.7rem', flexShrink: 0, transition: 'transform 0.2s',
              transform: openIdx === i ? 'rotate(180deg)' : 'none' }}>▼</span>
          </button>
          {openIdx === i && (
            <div style={{ padding: '0 1.25rem 0.75rem', color: '#94a3b8', fontSize: '0.78rem', lineHeight: 1.5 }}>
              {item.a}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ==================== CHAT IA WIDGET FLUTUANTE ==================== */
function ChatSection({ nome, cpf, processos }: { nome: string; cpf: string; processos: any[] }) {
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'ai'; text: string }>>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const suggestions = [
    'Em que fase está meu processo?',
    'Tenho audiência marcada?',
    'O que aconteceu até agora?',
    'Quanto tempo demora?',
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const sendMessage = async (question: string) => {
    if (!question.trim() || loading) return;
    setInput('');
    setShowSuggestions(false);
    setMessages(prev => [...prev, { role: 'user', text: question.trim() }]);
    setLoading(true);

    try {
      const res = await fetch('/api/public/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, cpf, pergunta: question.trim(), processos }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'ai', text: data.resposta || data.error || 'Erro ao processar.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'ai', text: 'Erro de conexão. Tente novamente.' }]);
    }
    setLoading(false);
  };

  // Botão flutuante quando fechado
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Abrir chat"
        style={{
          position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 9999,
          width: '60px', height: '60px', borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa)',
          border: 'none', cursor: 'pointer',
          boxShadow: '0 8px 32px rgba(99,102,241,0.4), 0 0 60px rgba(139,92,246,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.3s ease',
          animation: 'chatPulse 2s infinite',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </button>
    );
  }

  return (
    <>
      <style>{`
        @keyframes chatPulse {
          0%, 100% { box-shadow: 0 8px 32px rgba(99,102,241,0.4), 0 0 0 0 rgba(139,92,246,0.3); }
          50% { box-shadow: 0 8px 32px rgba(99,102,241,0.4), 0 0 0 10px rgba(139,92,246,0); }
        }
        @keyframes chatSlideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes typingDot {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-4px); }
        }
        .chat-suggestion:hover {
          background: rgba(99,102,241,0.15) !important;
          border-color: rgba(139,92,246,0.4) !important;
          transform: translateY(-1px);
        }
        .chat-input-field:focus {
          border-color: rgba(139,92,246,0.5) !important;
          box-shadow: 0 0 0 2px rgba(139,92,246,0.15);
        }
      `}</style>
      <div style={{
        position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 9999,
        width: '380px', maxWidth: 'calc(100vw - 2rem)',
        height: '520px', maxHeight: 'calc(100vh - 6rem)',
        borderRadius: '1.25rem',
        background: 'linear-gradient(180deg, rgba(15,23,42,0.98), rgba(20,27,45,0.98))',
        border: '1px solid rgba(148,163,184,0.12)',
        boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 40px rgba(99,102,241,0.08)',
        backdropFilter: 'blur(20px)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        animation: 'chatSlideUp 0.3s ease-out',
      }}>
        {/* Header */}
        <div style={{
          padding: '1rem 1.25rem',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))',
          borderBottom: '1px solid rgba(148,163,184,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            </div>
            <div>
              <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '0.9rem', letterSpacing: '-0.01em' }}>Assistente BM&C</div>
              <div style={{ color: '#6366f1', fontSize: '0.65rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                Online agora
              </div>
            </div>
          </div>
          <button onClick={() => setOpen(false)} style={{
            width: '32px', height: '32px', borderRadius: '8px',
            background: 'rgba(51,65,85,0.5)', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#94a3b8', fontSize: '1.1rem', transition: 'all 0.2s',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.2)'; e.currentTarget.style.color = '#ef4444'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(51,65,85,0.5)'; e.currentTarget.style.color = '#94a3b8'; }}
          >
            ✕
          </button>
        </div>

        {/* Messages Area */}
        <div style={{
          flex: 1, padding: '1rem', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: '0.75rem',
        }}>
          {/* Welcome message */}
          {messages.length === 0 && (
            <div style={{
              padding: '0.85rem 1rem', borderRadius: '0.75rem 0.75rem 0.75rem 0.2rem',
              background: 'rgba(51,65,85,0.6)', maxWidth: '90%',
            }}>
              <div style={{ color: '#e2e8f0', fontSize: '0.82rem', lineHeight: 1.5 }}>
                Olá, <strong>{nome.split(' ')[0]}</strong>! 👋<br/>
                Sou o assistente virtual do BM&C. Como posso ajudar?
              </div>
            </div>
          )}

          {/* Suggestions */}
          {messages.length === 0 && showSuggestions && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.25rem' }}>
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  className="chat-suggestion"
                  onClick={() => sendMessage(s)}
                  style={{
                    padding: '0.45rem 0.75rem', borderRadius: '1rem',
                    border: '1px solid rgba(148,163,184,0.15)',
                    background: 'rgba(30,41,59,0.6)', color: '#a78bfa',
                    fontSize: '0.72rem', fontWeight: 500, cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Message bubbles */}
          {messages.map((msg, i) => (
            <div key={i} style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              padding: '0.65rem 0.9rem',
              borderRadius: msg.role === 'user' ? '0.75rem 0.75rem 0.2rem 0.75rem' : '0.75rem 0.75rem 0.75rem 0.2rem',
              background: msg.role === 'user'
                ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                : 'rgba(51,65,85,0.6)',
              color: '#f1f5f9', fontSize: '0.8rem', lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              boxShadow: msg.role === 'user' ? '0 2px 8px rgba(99,102,241,0.25)' : 'none',
            }}>
              {msg.text}
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div style={{
              alignSelf: 'flex-start', padding: '0.7rem 1rem', borderRadius: '0.75rem 0.75rem 0.75rem 0.2rem',
              background: 'rgba(51,65,85,0.6)', display: 'flex', gap: '0.3rem', alignItems: 'center',
            }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{
                  width: '7px', height: '7px', borderRadius: '50%',
                  background: '#a78bfa', display: 'inline-block',
                  animation: `typingDot 1.4s ${i * 0.2}s infinite`,
                }} />
              ))}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div style={{
          padding: '0.75rem 1rem',
          borderTop: '1px solid rgba(148,163,184,0.08)',
          background: 'rgba(15,23,42,0.5)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              className="chat-input-field"
              type="text" value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage(input)}
              placeholder="Digite sua pergunta..."
              disabled={loading}
              style={{
                flex: 1, padding: '0.65rem 0.85rem', borderRadius: '0.75rem',
                border: '1px solid rgba(148,163,184,0.15)',
                background: 'rgba(30,41,59,0.6)', color: '#f1f5f9',
                fontSize: '0.82rem', outline: 'none',
                transition: 'all 0.2s',
              }}
            />
            <button onClick={() => sendMessage(input)} disabled={loading || !input.trim()} style={{
              width: '38px', height: '38px', borderRadius: '0.75rem', border: 'none',
              background: (loading || !input.trim()) ? 'rgba(51,65,85,0.5)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              cursor: (loading || !input.trim()) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s', flexShrink: 0,
              boxShadow: (loading || !input.trim()) ? 'none' : '0 2px 8px rgba(99,102,241,0.3)',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
          <div style={{ marginTop: '0.4rem', color: '#475569', fontSize: '0.58rem', textAlign: 'center' }}>
            Assistente IA • Consulte seu advogado para orientações específicas
          </div>
        </div>
      </div>
    </>
  );
}

/* ==================== SHARED ==================== */
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.8rem 1rem', borderRadius: '0.5rem',
  border: '1px solid rgba(148,163,184,0.2)', background: 'rgba(15,23,42,0.6)',
  color: '#f1f5f9', fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box',
};

function Field({ label, value, bold, valueColor }: { label: string; value: string; bold?: boolean; valueColor?: string }) {
  return (
    <div>
      <div style={{ color: '#64748b', fontSize: '0.65rem', fontWeight: 600 }}>{label}</div>
      <div style={{ color: valueColor || '#e2e8f0', fontSize: '0.8rem', fontWeight: bold ? 700 : 500 }}>{value}</div>
    </div>
  );
}
