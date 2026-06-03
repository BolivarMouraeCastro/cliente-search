'use client';

import { useState, useEffect, useCallback } from 'react';

interface PrescricaoClient {
  nome: string;
  empresa: string;
  demissao: string;
  prescricaoDate: string;
  driveFolderId: string | null;
  driveFolderName: string | null;
  source: 'planilha' | 'ambos';
  confirmado: boolean;
  diasRestantes: number;
}

interface PrescricaoMonth {
  month: string;
  label: string;
  clients: PrescricaoClient[];
}

const MONTH_NAMES: Record<string, string> = {
  '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
  '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
  '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro',
};

export default function PrescricoesPage() {
  const [months, setMonths] = useState<PrescricaoMonth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [movingIds, setMovingIds] = useState<Set<string>>(new Set());
  const [batchMoving, setBatchMoving] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [moveResults, setMoveResults] = useState<{ success: string[]; errors: string[] }>({ success: [], errors: [] });

  const fetchPrescricoes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/prescricoes');
      if (res.ok) {
        const data = await res.json();
        setMonths(data.months || []);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || 'Erro ao carregar prescrições');
      }
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrescricoes();
  }, [fetchPrescricoes]);

  const handleMoveSingle = async (client: PrescricaoClient) => {
    if (!client.driveFolderId) return;
    const key = client.driveFolderId;
    setMovingIds(prev => new Set(prev).add(key));
    try {
      const res = await fetch('/api/move-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: client.driveFolderId, destinationType: 'ELITON_INICIAIS' })
      });
      if (res.ok) {
        setMoveResults(prev => ({ ...prev, success: [...prev.success, client.nome] }));
        // Remove from months list
        setMonths(prev => prev.map(m => ({
          ...m,
          clients: m.clients.filter(c => c.driveFolderId !== client.driveFolderId)
        })));
      } else {
        const data = await res.json().catch(() => ({}));
        setMoveResults(prev => ({ ...prev, errors: [...prev.errors, `${client.nome}: ${data.error || 'Erro'}`] }));
      }
    } catch {
      setMoveResults(prev => ({ ...prev, errors: [...prev.errors, `${client.nome}: Erro de conexão`] }));
    } finally {
      setMovingIds(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  };

  const handleBatchMove = async (month: PrescricaoMonth) => {
    const moveable = month.clients.filter(c => c.driveFolderId);
    if (moveable.length === 0) return;
    setBatchMoving(month.month);
    setBatchProgress({ done: 0, total: moveable.length });
    setMoveResults({ success: [], errors: [] });

    for (let i = 0; i < moveable.length; i++) {
      const client = moveable[i];
      try {
        const res = await fetch('/api/move-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderId: client.driveFolderId, destinationType: 'ELITON_INICIAIS' })
        });
        if (res.ok) {
          setMoveResults(prev => ({ ...prev, success: [...prev.success, client.nome] }));
          setMonths(prev => prev.map(m => ({
            ...m,
            clients: m.clients.filter(c => c.driveFolderId !== client.driveFolderId)
          })));
        } else {
          const data = await res.json().catch(() => ({}));
          setMoveResults(prev => ({ ...prev, errors: [...prev.errors, `${client.nome}: ${data.error || 'Erro'}`] }));
        }
      } catch {
        setMoveResults(prev => ({ ...prev, errors: [...prev.errors, `${client.nome}: Erro de conexão`] }));
      }
      setBatchProgress({ done: i + 1, total: moveable.length });
    }

    setBatchMoving(null);
    setBatchProgress(null);
  };

  const totalPrescricoes = months.reduce((s, m) => s + m.clients.length, 0);

  const getUrgencyColor = (dias: number) => {
    if (dias <= 30) return '#ef4444';
    if (dias <= 60) return '#f97316';
    if (dias <= 90) return '#eab308';
    return '#22c55e';
  };

  const getUrgencyLabel = (dias: number) => {
    if (dias <= 30) return 'URGENTE';
    if (dias <= 60) return 'ATENÇÃO';
    if (dias <= 90) return 'PRÓXIMO';
    return 'OK';
  };

  return (
    <div className="detail-page" style={{ paddingTop: '1rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{
          fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)',
          margin: '0 0 0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          ⏰ Controle de Prescrições
        </h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
          Acompanhe os prazos de prescrição bienal dos processos trabalhistas. Dados cruzados entre o Drive do Bolivar e a Planilha de Entrada.
        </p>
      </div>

      {/* Summary Cards */}
      {!loading && !error && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '1rem', marginBottom: '2rem'
        }}>
          <div style={{
            background: 'rgba(14, 14, 20, 0.6)', border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '0.75rem', padding: '1.25rem', textAlign: 'center'
          }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#ef4444' }}>
              {months.reduce((s, m) => s + m.clients.filter(c => c.diasRestantes <= 30).length, 0)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#fca5a5', fontWeight: 600 }}>URGENTE (&lt;30 dias)</div>
          </div>
          <div style={{
            background: 'rgba(14, 14, 20, 0.6)', border: '1px solid rgba(249, 115, 22, 0.3)',
            borderRadius: '0.75rem', padding: '1.25rem', textAlign: 'center'
          }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f97316' }}>
              {months.reduce((s, m) => s + m.clients.filter(c => c.diasRestantes > 30 && c.diasRestantes <= 60).length, 0)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#fdba74', fontWeight: 600 }}>ATENÇÃO (30-60 dias)</div>
          </div>
          <div style={{
            background: 'rgba(14, 14, 20, 0.6)', border: '1px solid rgba(234, 179, 8, 0.3)',
            borderRadius: '0.75rem', padding: '1.25rem', textAlign: 'center'
          }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#eab308' }}>
              {months.reduce((s, m) => s + m.clients.filter(c => c.diasRestantes > 60 && c.diasRestantes <= 90).length, 0)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#fde047', fontWeight: 600 }}>PRÓXIMO (60-90 dias)</div>
          </div>
          <div style={{
            background: 'rgba(14, 14, 20, 0.6)', border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '0.75rem', padding: '1.25rem', textAlign: 'center'
          }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#22c55e' }}>
              {totalPrescricoes}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#86efac', fontWeight: 600 }}>TOTAL PENDENTES</div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="shimmer" style={{ height: '120px', borderRadius: '1rem' }} />
          ))}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '0.75rem', padding: '1rem', color: '#fca5a5', fontSize: '0.85rem',
        }}>
          ⚠️ {error}
          <button onClick={fetchPrescricoes} style={{
            marginLeft: '1rem', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '0.5rem', padding: '0.4rem 0.8rem', color: '#fca5a5', cursor: 'pointer', fontSize: '0.8rem'
          }}>
            Tentar Novamente
          </button>
        </div>
      )}

      {/* Move Results Toast */}
      {(moveResults.success.length > 0 || moveResults.errors.length > 0) && (
        <div style={{
          background: 'rgba(14, 14, 20, 0.8)', border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: '0.75rem', padding: '1rem', marginBottom: '1.5rem',
          position: 'relative'
        }}>
          <button onClick={() => setMoveResults({ success: [], errors: [] })} style={{
            position: 'absolute', top: '0.5rem', right: '0.75rem', background: 'none',
            border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem'
          }}>✕</button>
          {moveResults.success.length > 0 && (
            <div style={{ color: '#86efac', fontSize: '0.85rem', marginBottom: moveResults.errors.length > 0 ? '0.5rem' : 0 }}>
              ✅ Movidos com sucesso: {moveResults.success.join(', ')}
            </div>
          )}
          {moveResults.errors.length > 0 && (
            <div style={{ color: '#fca5a5', fontSize: '0.85rem' }}>
              ⚠️ Erros: {moveResults.errors.join(' | ')}
            </div>
          )}
        </div>
      )}

      {/* Month Cards */}
      {!loading && !error && months.map(month => (
        <div key={month.month} style={{
          background: 'rgba(14, 14, 20, 0.5)', border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '1rem', marginBottom: '1rem', overflow: 'hidden',
          transition: 'border-color 0.3s',
        }}>
          {/* Month Header */}
          <div
            onClick={() => setExpandedMonth(expandedMonth === month.month ? null : month.month)}
            style={{
              padding: '1.25rem 1.5rem', cursor: 'pointer',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: expandedMonth === month.month ? 'rgba(255, 255, 255, 0.02)' : 'transparent',
              transition: 'background 0.2s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{
                width: '42px', height: '42px', borderRadius: '0.75rem',
                background: `linear-gradient(135deg, ${month.clients.some(c => c.diasRestantes <= 30) ? '#ef4444' : month.clients.some(c => c.diasRestantes <= 60) ? '#f97316' : '#3b82f6'}, ${month.clients.some(c => c.diasRestantes <= 30) ? '#dc2626' : month.clients.some(c => c.diasRestantes <= 60) ? '#ea580c' : '#2563eb'})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.1rem', fontWeight: 800, color: 'white',
              }}>
                {month.month.split('/')[0]}
              </div>
              <div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {month.label}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {month.clients.length} {month.clients.length === 1 ? 'processo' : 'processos'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {month.clients.filter(c => c.driveFolderId).length > 0 && expandedMonth === month.month && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleBatchMove(month); }}
                  disabled={batchMoving === month.month}
                  style={{
                    background: batchMoving === month.month ? '#555' : 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                    color: 'white', fontWeight: 700, padding: '0.5rem 1rem', borderRadius: '0.5rem',
                    border: 'none', cursor: batchMoving === month.month ? 'wait' : 'pointer',
                    fontSize: '0.8rem', whiteSpace: 'nowrap',
                  }}
                >
                  {batchMoving === month.month
                    ? `⏳ ${batchProgress?.done}/${batchProgress?.total}`
                    : `📤 Mover Todos para Eliton (${month.clients.filter(c => c.driveFolderId).length})`
                  }
                </button>
              )}
              <span style={{
                color: 'var(--text-muted)', fontSize: '1.2rem',
                transform: expandedMonth === month.month ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.3s', display: 'inline-block',
              }}>
                ▼
              </span>
            </div>
          </div>

          {/* Client List */}
          {expandedMonth === month.month && (
            <div style={{ padding: '0 1.5rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {month.clients.sort((a, b) => a.diasRestantes - b.diasRestantes).map((client, idx) => (
                <div key={`${client.nome}-${idx}`} style={{
                  padding: '0.75rem 1rem',
                  background: 'rgba(0, 0, 0, 0.2)', border: `1px solid ${getUrgencyColor(client.diasRestantes)}22`,
                  borderRadius: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  borderLeft: `3px solid ${getUrgencyColor(client.diasRestantes)}`,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {client.nome}
                      </span>
                      <span style={{
                        fontSize: '0.6rem', fontWeight: 700, padding: '0.15rem 0.4rem',
                        borderRadius: '0.25rem', color: 'white',
                        background: getUrgencyColor(client.diasRestantes),
                      }}>
                        {getUrgencyLabel(client.diasRestantes)}
                      </span>
                      {client.confirmado && (
                        <span style={{
                          fontSize: '0.6rem', padding: '0.15rem 0.4rem',
                          borderRadius: '0.25rem', color: '#86efac',
                          background: 'rgba(34, 197, 94, 0.15)',
                          border: '1px solid rgba(34, 197, 94, 0.2)',
                        }}>
                          ✅ Confirmado
                        </span>
                      )}
                      {!client.driveFolderId && (
                        <span style={{
                          fontSize: '0.6rem', padding: '0.15rem 0.4rem',
                          borderRadius: '0.25rem', color: '#fbbf24',
                          background: 'rgba(251, 191, 36, 0.15)',
                          border: '1px solid rgba(251, 191, 36, 0.2)',
                        }}>
                          ⚠️ Sem pasta no Drive
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                      {client.empresa && <span>🏢 {client.empresa}</span>}
                      <span>📅 Demissão: {client.demissao}</span>
                      <span style={{ color: getUrgencyColor(client.diasRestantes), fontWeight: 600 }}>
                        ⏰ Prescreve: {client.prescricaoDate} ({client.diasRestantes} dias)
                      </span>
                    </div>
                  </div>
                  {client.driveFolderId && (
                    <button
                      onClick={() => handleMoveSingle(client)}
                      disabled={movingIds.has(client.driveFolderId)}
                      style={{
                        background: movingIds.has(client.driveFolderId) ? '#555' : 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                        color: 'white', fontWeight: 700, padding: '0.5rem 0.75rem', borderRadius: '0.5rem',
                        border: 'none', cursor: movingIds.has(client.driveFolderId) ? 'wait' : 'pointer',
                        fontSize: '0.78rem', whiteSpace: 'nowrap', flexShrink: 0,
                      }}
                    >
                      {movingIds.has(client.driveFolderId) ? '⏳ Movendo...' : '📤 Eliton'}
                    </button>
                  )}
                </div>
              ))}
              {month.clients.length === 0 && (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem', fontSize: '0.85rem' }}>
                  ✅ Nenhum processo pendente neste mês
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Empty state */}
      {!loading && !error && months.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '3rem', color: 'var(--text-muted)',
          background: 'rgba(14, 14, 20, 0.5)', borderRadius: '1rem',
          border: '1px solid rgba(255, 255, 255, 0.06)',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✅</div>
          <div style={{ fontSize: '1rem', fontWeight: 700 }}>Nenhuma prescrição pendente!</div>
          <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>Todos os processos estão dentro do prazo.</div>
        </div>
      )}
    </div>
  );
}
