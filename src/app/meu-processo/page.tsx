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

interface ConsultaResult {
  found: boolean;
  error?: string;
  message?: string;
  nome?: string;
  cpf?: string;
  numeroProcesso?: string;
  empresa?: string;
  entrada?: string;
  materia?: string;
  advogado?: string;
  fase?: string;
  proximoPasso?: string;
  audiencia?: AudienciaData | null;
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConsulta();
  };

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
          width: '90px', height: '90px', borderRadius: '50%', margin: '0 auto 1rem',
          background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.15), rgba(30, 41, 59, 0.8))',
          border: '2px solid rgba(212, 175, 55, 0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 30px rgba(212, 175, 55, 0.1)',
        }}>
          <img 
            src="/bmc-logo.png" 
            alt="BM&C Advogados" 
            style={{ width: '60px', height: '60px', objectFit: 'contain' }} 
          />
        </div>
        <div style={{
          fontSize: '1.6rem', marginBottom: '0.25rem',
          color: '#f1f5f9',
          fontWeight: 700, letterSpacing: '0.02em',
        }}>
          BM&C Advogados
        </div>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: 0 }}>
          Consulte o andamento do seu processo
        </p>
      </div>

      {/* Search Box */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.8)',
        border: '1px solid rgba(148, 163, 184, 0.15)',
        borderRadius: '1rem', padding: '2rem',
        maxWidth: '500px', width: '100%',
        backdropFilter: 'blur(10px)',
      }}>
        <label style={{ color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>
          Digite seu CPF
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={cpf}
            onChange={(e) => setCpf(formatCPF(e.target.value))}
            onKeyDown={handleKeyDown}
            placeholder="000.000.000-00"
            style={{
              flex: 1, padding: '0.85rem 1rem', borderRadius: '0.5rem',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              background: 'rgba(15, 23, 42, 0.6)', color: '#f1f5f9',
              fontSize: '1.1rem', fontFamily: 'monospace', outline: 'none',
              letterSpacing: '0.05em',
            }}
          />
          <button
            onClick={handleConsulta}
            disabled={loading}
            style={{
              padding: '0.85rem 1.5rem', borderRadius: '0.5rem', border: 'none',
              background: loading ? '#475569' : 'linear-gradient(135deg, #3b82f6, #6366f1)',
              color: '#fff', fontWeight: 700, fontSize: '0.9rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s', whiteSpace: 'nowrap',
            }}
          >
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

      {/* Result Card */}
      {result && result.found && (
        <div style={{
          marginTop: '1.5rem', maxWidth: '550px', width: '100%',
          background: 'rgba(30, 41, 59, 0.8)', border: '1px solid rgba(148, 163, 184, 0.15)',
          borderRadius: '1rem', overflow: 'hidden', backdropFilter: 'blur(10px)',
        }}>
          {/* Client Info */}
          <div style={{ padding: '1.5rem', borderBottom: '1px solid rgba(148, 163, 184, 0.1)' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '0.25rem' }}>
              👤 {result.nome}
            </div>
            {result.message && (
              <p style={{ color: '#94a3b8', margin: '0.5rem 0 0' }}>{result.message}</p>
            )}
            {result.numeroProcesso && (
              <div style={{
                display: 'inline-block', marginTop: '0.5rem', padding: '0.3rem 0.7rem',
                background: 'rgba(139, 92, 246, 0.1)', borderRadius: '0.4rem',
                border: '1px solid rgba(139, 92, 246, 0.2)',
                color: '#a78bfa', fontSize: '0.8rem', fontFamily: 'monospace', fontWeight: 600,
              }}>
                📄 {result.numeroProcesso}
              </div>
            )}
          </div>

          {/* Process Details */}
          {(result.empresa || result.entrada || result.advogado) && (
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(148, 163, 184, 0.1)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {result.empresa && (
                  <InfoItem icon="🏢" label="Empresa" value={result.empresa} />
                )}
                {result.entrada && (
                  <InfoItem icon="📅" label="Entrada" value={result.entrada} />
                )}
                {result.advogado && (
                  <InfoItem icon="👨‍⚖️" label="Advogado" value={result.advogado} />
                )}
              </div>
            </div>
          )}

          {/* Phase & Next Step */}
          {result.fase && (
            <div style={{
              padding: '1rem 1.5rem', borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
              background: 'rgba(99, 102, 241, 0.05)',
            }}>
              <div style={{ color: '#818cf8', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
                🔄 Fase Atual
              </div>
              <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.3rem' }}>
                {result.fase}
              </div>
              {result.proximoPasso && (
                <div style={{ color: '#94a3b8', fontSize: '0.85rem', lineHeight: 1.5 }}>
                  {result.proximoPasso}
                </div>
              )}
            </div>
          )}

          {/* Hearing Details */}
          {result.audiencia && (
            <div style={{
              padding: '1rem 1.5rem', borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
              background: 'rgba(34, 197, 94, 0.04)',
            }}>
              <div style={{ color: '#4ade80', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                📅 Próxima Audiência
              </div>

              <div style={{ display: 'grid', gap: '0.6rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.1rem' }}>📅</span>
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600 }}>Data e Horário</div>
                    <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '1.05rem' }}>
                      {result.audiencia.data} às {result.audiencia.horario || 'A confirmar'}
                    </div>
                  </div>
                </div>

                {result.audiencia.tipo && (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.1rem' }}>📋</span>
                    <div>
                      <div style={{ color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600 }}>Tipo</div>
                      <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{result.audiencia.tipo}</div>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.1rem' }}>
                    {result.audiencia.modalidade.includes('Online') ? '💻' : '🏛️'}
                  </span>
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600 }}>Modalidade</div>
                    <div style={{
                      color: result.audiencia.modalidade.includes('Online') ? '#60a5fa' : '#f1f5f9',
                      fontWeight: 700,
                    }}>
                      {result.audiencia.modalidade}
                    </div>
                  </div>
                </div>

                {result.audiencia.orgaoJulgador && (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.1rem' }}>🏛️</span>
                    <div>
                      <div style={{ color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600 }}>Vara / Órgão</div>
                      <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{result.audiencia.orgaoJulgador}</div>
                    </div>
                  </div>
                )}

                {result.audiencia.endereco && !result.audiencia.modalidade.includes('Online') && (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.1rem' }}>📍</span>
                    <div>
                      <div style={{ color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600 }}>Endereço</div>
                      <div style={{ color: '#e2e8f0', fontWeight: 500 }}>{result.audiencia.endereco}</div>
                      <button
                        onClick={() => window.open(`https://www.google.com/maps/search/${encodeURIComponent(result.audiencia!.endereco)}`, '_blank')}
                        style={{
                          marginTop: '0.3rem', padding: '0.2rem 0.5rem', borderRadius: '0.3rem',
                          border: 'none', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa',
                          fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        📍 Abrir no Google Maps
                      </button>
                    </div>
                  </div>
                )}

                {result.audiencia.advogado && (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.1rem' }}>👨‍⚖️</span>
                    <div>
                      <div style={{ color: '#94a3b8', fontSize: '0.7rem', fontWeight: 600 }}>Advogado Responsável</div>
                      <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{result.audiencia.advogado}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* No hearing */}
          {!result.audiencia && result.numeroProcesso && (
            <div style={{
              padding: '1rem 1.5rem', borderBottom: '1px solid rgba(148, 163, 184, 0.1)',
              textAlign: 'center', color: '#64748b', fontSize: '0.85rem',
            }}>
              📅 Nenhuma audiência agendada no momento
            </div>
          )}

          {/* WhatsApp Button */}
          <div style={{ padding: '1rem 1.5rem' }}>
            <button
              onClick={() => {
                const msg = encodeURIComponent(`Olá! Meu nome é ${result.nome}, CPF ${result.cpf}. Gostaria de informações sobre meu processo.`);
                window.open(`https://wa.me/5511943241698?text=${msg}`, '_blank');
              }}
              style={{
                width: '100%', padding: '0.85rem', borderRadius: '0.5rem', border: 'none',
                background: 'linear-gradient(135deg, #25D366, #128C7E)',
                color: '#fff', fontWeight: 700, fontSize: '0.95rem',
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: '0.5rem', transition: 'all 0.2s',
              }}
            >
              💬 Falar com o Escritório
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: '2rem', color: '#475569', fontSize: '0.75rem', textAlign: 'center' }}>
        BM&C Advogados © {new Date().getFullYear()} — Todos os direitos reservados
      </div>
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-start' }}>
      <span style={{ fontSize: '0.9rem' }}>{icon}</span>
      <div>
        <div style={{ color: '#64748b', fontSize: '0.7rem', fontWeight: 600 }}>{label}</div>
        <div style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 500 }}>{value}</div>
      </div>
    </div>
  );
}
