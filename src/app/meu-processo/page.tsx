'use client';

import { useState } from 'react';

interface AudienciaData {
  data: string;
  horario: string;
  tipo: string;
  orgaoJulgador: string;
  modalidade: string;
  endereco: string;
  advogado: string;
}

interface ProcessoData {
  numeroProcesso?: string;
  empresa?: string;
  entrada?: string;
  materia?: string;
  advogado?: string;
  fase?: string;
  proximoPasso?: string;
  audiencia?: AudienciaData | null;
}

interface ConsultaResult {
  found: boolean;
  error?: string;
  message?: string;
  nome?: string;
  cpf?: string;
  processos?: ProcessoData[];
}

function formatCPF(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export default function MeuProcessoPage() {
  const [cpf, setCpf] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ConsultaResult | null>(null);

  const handleConsulta = async () => {
    const digits = cpf.replace(/\D/g, '');
    if (digits.length !== 11) {
      setResult({ found: false, error: 'Informe os 11 dígitos do CPF.' });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/public/consulta?cpf=${digits}`);
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ found: false, error: 'Erro de conexão. Tente novamente.' });
    }
    setLoading(false);
  };

  const processos = result?.processos || [];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '2rem 1rem',
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '2rem', maxWidth: '500px' }}>
        <div style={{
          width: '80px', height: '80px', borderRadius: '50%', margin: '0 auto 0.75rem',
          background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.15), rgba(30, 41, 59, 0.8))',
          border: '2px solid rgba(212, 175, 55, 0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 30px rgba(212, 175, 55, 0.1)',
        }}>
          <img src="/bmc-logo.png" alt="BM&C Advogados" style={{ width: '55px', height: '55px', objectFit: 'contain' }} />
        </div>
        <div style={{ fontSize: '1.5rem', color: '#f1f5f9', fontWeight: 700 }}>BM&C Advogados</div>
        <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>Consulte o andamento do seu processo</p>
      </div>

      {/* Search */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(148, 163, 184, 0.15)',
        borderRadius: '1rem', padding: '1.5rem', maxWidth: '500px', width: '100%',
        backdropFilter: 'blur(10px)',
      }}>
        <label style={{ color: '#cbd5e1', fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
          Digite seu CPF
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text" value={cpf}
            onChange={(e) => setCpf(formatCPF(e.target.value))}
            onKeyDown={(e) => e.key === 'Enter' && handleConsulta()}
            placeholder="000.000.000-00"
            style={{
              flex: 1, padding: '0.8rem 1rem', borderRadius: '0.5rem',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              background: 'rgba(15, 23, 42, 0.6)', color: '#f1f5f9',
              fontSize: '1.05rem', fontFamily: 'monospace', outline: 'none',
            }}
          />
          <button onClick={handleConsulta} disabled={loading} style={{
            padding: '0.8rem 1.5rem', borderRadius: '0.5rem', border: 'none',
            background: loading ? '#475569' : 'linear-gradient(135deg, #3b82f6, #6366f1)',
            color: '#fff', fontWeight: 700, fontSize: '0.9rem',
            cursor: loading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
          }}>
            {loading ? '⏳' : '🔍 Consultar'}
          </button>
        </div>
      </div>

      {/* Error */}
      {result && !result.found && (
        <div style={{
          marginTop: '1.5rem', maxWidth: '500px', width: '100%',
          background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '0.75rem', padding: '1rem 1.5rem',
          color: '#fca5a5', fontSize: '0.9rem', textAlign: 'center',
        }}>
          ❌ {result.error || 'CPF não encontrado.'}
        </div>
      )}

      {/* No processes linked */}
      {result && result.found && result.message && processos.length === 0 && (
        <div style={{
          marginTop: '1.5rem', maxWidth: '500px', width: '100%',
          background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(148, 163, 184, 0.15)',
          borderRadius: '1rem', padding: '1.5rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '0.5rem' }}>{result.nome}</div>
          <p style={{ color: '#94a3b8', margin: 0 }}>{result.message}</p>
        </div>
      )}

      {/* Results */}
      {result && result.found && processos.length > 0 && (
        <div style={{ marginTop: '1.5rem', maxWidth: '550px', width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Client Name */}
          <div style={{ textAlign: 'center', marginBottom: '0.25rem' }}>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f1f5f9' }}>{result.nome}</div>
            {processos.length > 1 && (
              <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '0.15rem' }}>
                {processos.length} processos encontrados
              </div>
            )}
          </div>

          {/* Process Cards */}
          {processos.map((p, i) => (
            <ProcessCard key={i} processo={p} index={i} total={processos.length} nome={result.nome || ''} cpf={result.cpf || ''} />
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: '2rem', color: '#475569', fontSize: '0.75rem', textAlign: 'center' }}>
        BM&C Advogados © {new Date().getFullYear()} — Todos os direitos reservados
      </div>
    </div>
  );
}

function ProcessCard({ processo: p, index, total, nome, cpf }: {
  processo: ProcessoData; index: number; total: number; nome: string; cpf: string;
}) {
  return (
    <div style={{
      background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(148, 163, 184, 0.15)',
      borderRadius: '1rem', overflow: 'hidden', backdropFilter: 'blur(10px)',
    }}>
      {/* Header with process number + empresa */}
      <div style={{
        padding: '1rem 1.25rem',
        borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
        background: 'rgba(99, 102, 241, 0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {total > 1 && (
            <div style={{
              width: '26px', height: '26px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0,
            }}>
              {index + 1}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            {p.numeroProcesso && (
              <div style={{
                color: '#a78bfa', fontSize: '0.8rem', fontFamily: 'monospace', fontWeight: 600,
              }}>
                {p.numeroProcesso}
              </div>
            )}
            {p.empresa && (
              <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '0.1rem' }}>
                vs {p.empresa}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Info Grid */}
      {(p.entrada || p.advogado) && (
        <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <div style={{ display: 'flex', gap: '2rem' }}>
            {p.entrada && <Field label="Entrada" value={p.entrada} />}
            {p.advogado && <Field label="Advogado" value={p.advogado} />}
          </div>
        </div>
      )}

      {/* Phase */}
      {p.fase && (
        <div style={{
          padding: '0.75rem 1.25rem', borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
          background: 'rgba(99, 102, 241, 0.03)',
        }}>
          <div style={{ color: '#818cf8', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Fase Atual
          </div>
          <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.9rem', marginTop: '0.15rem' }}>{p.fase}</div>
          {p.proximoPasso && (
            <div style={{ color: '#94a3b8', fontSize: '0.75rem', lineHeight: 1.4, marginTop: '0.15rem' }}>{p.proximoPasso}</div>
          )}
        </div>
      )}

      {/* Hearing */}
      {p.audiencia && (
        <div style={{
          padding: '0.75rem 1.25rem', borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
          background: 'rgba(34, 197, 94, 0.03)',
        }}>
          <div style={{ color: '#4ade80', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
            Próxima Audiência
          </div>
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            <Field label="Data e Horário" value={`${p.audiencia.data} às ${p.audiencia.horario || 'A confirmar'}`} bold />
            {p.audiencia.tipo && <Field label="Tipo" value={p.audiencia.tipo} />}
            <Field label="Modalidade" value={p.audiencia.modalidade}
              valueColor={p.audiencia.modalidade.includes('Online') ? '#60a5fa' : '#e2e8f0'} />
            {p.audiencia.orgaoJulgador && <Field label="Vara / Órgão" value={p.audiencia.orgaoJulgador} />}
            {p.audiencia.endereco && !p.audiencia.modalidade.includes('Online') && (
              <div>
                <div style={{ color: '#64748b', fontSize: '0.65rem', fontWeight: 600 }}>Endereço</div>
                <div style={{ color: '#e2e8f0', fontSize: '0.8rem' }}>{p.audiencia.endereco}</div>
                <button
                  onClick={() => window.open(`https://www.google.com/maps/search/${encodeURIComponent(p.audiencia!.endereco)}`, '_blank')}
                  style={{
                    marginTop: '0.2rem', padding: '0.15rem 0.4rem', borderRadius: '0.25rem',
                    border: 'none', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa',
                    fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  📍 Abrir no Google Maps
                </button>
              </div>
            )}
            {p.audiencia.advogado && <Field label="Advogado" value={p.audiencia.advogado} />}
          </div>
        </div>
      )}

      {/* No hearing */}
      {!p.audiencia && p.numeroProcesso && (
        <div style={{
          padding: '0.6rem 1.25rem', borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
          textAlign: 'center', color: '#64748b', fontSize: '0.8rem',
        }}>
          Nenhuma audiência agendada
        </div>
      )}

      {/* WhatsApp */}
      <div style={{ padding: '0.75rem 1.25rem' }}>
        <button
          onClick={() => {
            const proc = p.numeroProcesso ? `, processo ${p.numeroProcesso}` : '';
            const msg = encodeURIComponent(`Olá! Meu nome é ${nome}, CPF ${cpf}${proc}. Gostaria de informações sobre meu processo.`);
            window.open(`https://wa.me/5511943241698?text=${msg}`, '_blank');
          }}
          style={{
            width: '100%', padding: '0.7rem', borderRadius: '0.5rem', border: 'none',
            background: 'linear-gradient(135deg, #25D366, #128C7E)',
            color: '#fff', fontWeight: 700, fontSize: '0.85rem',
            cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: '0.4rem',
          }}
        >
          💬 Falar com o Escritório
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, bold, valueColor }: {
  label: string; value: string; bold?: boolean; valueColor?: string;
}) {
  return (
    <div>
      <div style={{ color: '#64748b', fontSize: '0.65rem', fontWeight: 600 }}>{label}</div>
      <div style={{ color: valueColor || '#e2e8f0', fontSize: '0.8rem', fontWeight: bold ? 700 : 500 }}>{value}</div>
    </div>
  );
}
