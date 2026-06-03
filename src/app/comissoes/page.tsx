'use client';

import { useState, useEffect, useCallback } from 'react';

interface TipoData {
  nome: string;
  abrev: string;
  count: number;
  clientes: string[];
}

interface AdvogadoData {
  nome: string;
  total: number;
  tipos: TipoData[];
}

interface TipoGlobal {
  nome: string;
  count: number;
}

const DONUT_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#10b981',
  '#eab308', '#ef4444', '#06b6d4', '#84cc16', '#f43f5e',
  '#6366f1', '#14b8a6', '#a855f7', '#f59e0b', '#22c55e',
];

function DonutChart({ data, size = 140, label }: { data: { name: string; value: number; color: string }[]; size?: number; label: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = size / 2;
  const strokeWidth = 24;
  const innerR = r - strokeWidth;

  if (total === 0) {
    // Empty state: gray ring with 0
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={r} cy={r} r={innerR} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} />
          <text x={r} y={r - 4} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="1.5rem" fontWeight="800">0</text>
          <text x={r} y={r + 12} textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="0.55rem" fontWeight="600">PEÇAS</text>
        </svg>
        <div style={{ marginTop: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center' }}>
          {label}
        </div>
      </div>
    );
  }

  let cumulative = 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {data.map((d, i) => {
          const pct = d.value / total;
          const dashArray = 2 * Math.PI * innerR;
          const dashOffset = dashArray * (1 - pct);
          const rotation = cumulative * 360 - 90;
          cumulative += pct;
          return (
            <circle
              key={i}
              cx={r} cy={r} r={innerR}
              fill="none"
              stroke={d.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dashArray}`}
              strokeDashoffset={`${dashOffset}`}
              transform={`rotate(${rotation} ${r} ${r})`}
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
          );
        })}
        <text x={r} y={r - 4} textAnchor="middle" fill="white" fontSize="1.5rem" fontWeight="800">
          {total}
        </text>
        <text x={r} y={r + 12} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize="0.55rem" fontWeight="600">
          PEÇAS
        </text>
      </svg>
      <div style={{ marginTop: '0.4rem', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center' }}>
        {label}
      </div>
    </div>
  );
}

export default function ComissoesPage() {
  const [advogados, setAdvogados] = useState<AdvogadoData[]>([]);
  const [tiposGlobal, setTiposGlobal] = useState<TipoGlobal[]>([]);
  const [totalFilings, setTotalFilings] = useState(0);
  const [totalDays, setTotalDays] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAdvogado, setSelectedAdvogado] = useState<string | null>(null);
  const [expandedTipo, setExpandedTipo] = useState<string | null>(null);

  // Iniciais state
  interface IniciaisAdv { nome: string; total: number; mesAtual: number; clientes: { cliente: string; empresa: string; data: string }[] }
  const [iniciaisAdvs, setIniciaisAdvs] = useState<IniciaisAdv[]>([]);
  const [iniciaisMes, setIniciaisMes] = useState('');
  const [iniciaisLoading, setIniciaisLoading] = useState(true);
  const [expandedIniciais, setExpandedIniciais] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/comissoes');
      if (res.ok) {
        const data = await res.json();
        setAdvogados(data.advogados || []);
        setTiposGlobal(data.tiposGlobal || []);
        setTotalFilings(data.totalFilings || 0);
        setTotalDays(data.totalDays || 0);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || 'Erro ao carregar comissões');
      }
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Fetch iniciais
    fetch('/api/comissoes-iniciais')
      .then(r => r.json())
      .then(d => { setIniciaisAdvs(d.advogados || []); setIniciaisMes(d.mesAtual || ''); })
      .catch(() => {})
      .finally(() => setIniciaisLoading(false));
  }, [fetchData]);

  const selectedData = advogados.find(a => a.nome === selectedAdvogado);

  return (
    <div className="detail-page" style={{ paddingTop: '1rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{
          fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)',
          margin: '0 0 0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          💰 Comissões — Prazos Protocolados
        </h1>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
          Acompanhe as peças processuais protocoladas por cada advogado. Dados extraídos da pasta PROTOCOLO PJE.
        </p>
      </div>

      {/* ==================== PETIÇÃO INICIAL ==================== */}
      <div style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          📝 Petição Inicial {iniciaisMes && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>— {iniciaisMes}</span>}
        </h2>

        {iniciaisLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
            {[1,2,3,4].map(i => <div key={i} className="shimmer" style={{ height: '120px', borderRadius: '0.75rem' }} />)}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
            {iniciaisAdvs.map((adv) => (
              <div key={adv.nome} style={{
                background: 'rgba(14, 14, 20, 0.5)', border: `1px solid ${expandedIniciais === adv.nome ? 'rgba(212, 175, 55, 0.3)' : 'rgba(255, 255, 255, 0.06)'}`,
                borderRadius: '0.75rem', overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.3s',
              }}>
                <div
                  onClick={() => setExpandedIniciais(expandedIniciais === adv.nome ? null : adv.nome)}
                  style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>{adv.nome}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                      {adv.total} total • {adv.mesAtual} este mês
                    </div>
                  </div>
                  <div style={{
                    width: '50px', height: '50px', borderRadius: '50%',
                    background: adv.mesAtual > 0
                      ? 'linear-gradient(135deg, rgba(212, 175, 55, 0.2), rgba(212, 175, 55, 0.05))'
                      : 'rgba(255,255,255,0.03)',
                    border: `2px solid ${adv.mesAtual > 0 ? 'rgba(212, 175, 55, 0.4)' : 'rgba(255,255,255,0.08)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.2rem', fontWeight: 800,
                    color: adv.mesAtual > 0 ? '#d4af37' : 'rgba(255,255,255,0.2)',
                  }}>
                    {adv.mesAtual}
                  </div>
                </div>

                {expandedIniciais === adv.nome && (
                  <div style={{ padding: '0 1rem 1rem', maxHeight: '250px', overflowY: 'auto' }}>
                    {adv.clientes.length === 0 ? (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textAlign: 'center', padding: '0.5rem' }}>
                        Nenhuma inicial na CORREÇÃO
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {adv.clientes.map((c, ci) => (
                          <div key={ci} style={{
                            padding: '0.5rem 0.6rem', background: 'rgba(0,0,0,0.2)',
                            borderRadius: '0.35rem', borderLeft: '2px solid rgba(212, 175, 55, 0.3)',
                          }}>
                            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                              {c.cliente}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', gap: '0.75rem', marginTop: '0.1rem' }}>
                              {c.empresa && <span>🏢 {c.empresa}</span>}
                              <span>📅 {c.data}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ==================== DIVIDER ==================== */}
      <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '0 0 2rem' }} />

      {/* Summary Cards */}
      {!loading && !error && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '1rem', marginBottom: '2rem'
        }}>
          <div style={{
            background: 'rgba(14, 14, 20, 0.6)', border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '0.75rem', padding: '1.25rem', textAlign: 'center'
          }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#3b82f6' }}>{totalFilings}</div>
            <div style={{ fontSize: '0.75rem', color: '#93c5fd', fontWeight: 600 }}>TOTAL DE PEÇAS</div>
          </div>
          <div style={{
            background: 'rgba(14, 14, 20, 0.6)', border: '1px solid rgba(139, 92, 246, 0.3)',
            borderRadius: '0.75rem', padding: '1.25rem', textAlign: 'center'
          }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#8b5cf6' }}>{advogados.length}</div>
            <div style={{ fontSize: '0.75rem', color: '#c4b5fd', fontWeight: 600 }}>ADVOGADOS</div>
          </div>
          <div style={{
            background: 'rgba(14, 14, 20, 0.6)', border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '0.75rem', padding: '1.25rem', textAlign: 'center'
          }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#10b981' }}>{tiposGlobal.length}</div>
            <div style={{ fontSize: '0.75rem', color: '#6ee7b7', fontWeight: 600 }}>TIPOS DE PEÇA</div>
          </div>
          <div style={{
            background: 'rgba(14, 14, 20, 0.6)', border: '1px solid rgba(249, 115, 22, 0.3)',
            borderRadius: '0.75rem', padding: '1.25rem', textAlign: 'center'
          }}>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f97316' }}>{totalDays}</div>
            <div style={{ fontSize: '0.75rem', color: '#fdba74', fontWeight: 600 }}>DIAS DE PRAZO</div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="shimmer" style={{ height: '180px', borderRadius: '1rem' }} />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '0.75rem', padding: '1rem', color: '#fca5a5', fontSize: '0.85rem',
        }}>
          ⚠️ {error}
          <button onClick={fetchData} style={{
            marginLeft: '1rem', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '0.5rem', padding: '0.4rem 0.8rem', color: '#fca5a5', cursor: 'pointer', fontSize: '0.8rem'
          }}>Tentar Novamente</button>
        </div>
      )}

      {/* Donut Charts Grid */}
      {!loading && !error && (
        <>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1rem' }}>
            📊 Produção por Advogado
          </h2>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '1.5rem', marginBottom: '2rem'
          }}>
            {advogados.map((adv, idx) => {
              const donutData = adv.tipos.map((t, ti) => ({
                name: t.nome,
                value: t.count,
                color: DONUT_COLORS[ti % DONUT_COLORS.length],
              }));
              return (
                <div
                  key={adv.nome}
                  onClick={() => setSelectedAdvogado(selectedAdvogado === adv.nome ? null : adv.nome)}
                  style={{
                    background: selectedAdvogado === adv.nome ? 'rgba(59, 130, 246, 0.08)' : 'rgba(14, 14, 20, 0.5)',
                    border: `1px solid ${selectedAdvogado === adv.nome ? 'rgba(59, 130, 246, 0.4)' : 'rgba(255, 255, 255, 0.06)'}`,
                    borderRadius: '1rem', padding: '1.5rem', cursor: 'pointer',
                    transition: 'all 0.3s', textAlign: 'center',
                  }}
                >
                  <DonutChart data={donutData} label={adv.nome} />
                  <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.3rem', justifyContent: 'center' }}>
                    {adv.tipos.slice(0, 3).map((t, ti) => (
                      <span key={t.nome} style={{
                        fontSize: '0.55rem', padding: '0.1rem 0.3rem', borderRadius: '0.2rem',
                        background: `${DONUT_COLORS[ti % DONUT_COLORS.length]}22`,
                        color: DONUT_COLORS[ti % DONUT_COLORS.length],
                        border: `1px solid ${DONUT_COLORS[ti % DONUT_COLORS.length]}33`,
                      }}>
                        {t.abrev} ({t.count})
                      </span>
                    ))}
                    {adv.tipos.length > 3 && (
                      <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>
                        +{adv.tipos.length - 3}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detail Panel */}
          {selectedData && (
            <div style={{
              background: 'rgba(14, 14, 20, 0.6)', border: '1px solid rgba(59, 130, 246, 0.2)',
              borderRadius: '1rem', padding: '1.5rem', marginBottom: '2rem',
            }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1rem' }}>
                📋 Detalhamento — {selectedData.nome} ({selectedData.total} peças)
              </h3>
              {selectedData.total === 0 ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem', fontSize: '0.85rem' }}>
                  Nenhuma peça registrada ainda. A contagem começa a partir de 08/06/2026.
                </div>
              ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {selectedData.tipos.map((tipo, ti) => (
                  <div key={tipo.nome}>
                    <div
                      onClick={() => setExpandedTipo(expandedTipo === tipo.nome ? null : tipo.nome)}
                      style={{
                        padding: '0.75rem 1rem', borderRadius: '0.5rem', cursor: 'pointer',
                        background: 'rgba(0, 0, 0, 0.2)',
                        borderLeft: `3px solid ${DONUT_COLORS[ti % DONUT_COLORS.length]}`,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {tipo.nome}
                        </span>
                        <span style={{
                          fontSize: '0.6rem', padding: '0.1rem 0.4rem', borderRadius: '0.25rem',
                          background: `${DONUT_COLORS[ti % DONUT_COLORS.length]}22`,
                          color: DONUT_COLORS[ti % DONUT_COLORS.length],
                          fontWeight: 700,
                        }}>
                          {tipo.abrev}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{
                          fontSize: '1.1rem', fontWeight: 800,
                          color: DONUT_COLORS[ti % DONUT_COLORS.length],
                        }}>
                          {tipo.count}
                        </span>
                        <span style={{
                          color: 'var(--text-muted)', fontSize: '0.8rem',
                          transform: expandedTipo === tipo.nome ? 'rotate(180deg)' : 'rotate(0)',
                          transition: 'transform 0.2s', display: 'inline-block',
                        }}>▼</span>
                      </div>
                    </div>
                    {expandedTipo === tipo.nome && (
                      <div style={{
                        padding: '0.5rem 1rem 0.5rem 1.5rem',
                        display: 'flex', flexDirection: 'column', gap: '0.2rem',
                      }}>
                        {tipo.clientes.map((c, ci) => (
                          <div key={ci} style={{
                            fontSize: '0.75rem', color: 'var(--text-muted)',
                            padding: '0.25rem 0.5rem', background: 'rgba(0,0,0,0.15)',
                            borderRadius: '0.25rem',
                          }}>
                            {c}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              )}
            </div>
          )}

          {/* Global Types Summary */}
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1rem' }}>
            📈 Distribuição Geral por Tipo de Peça
          </h2>
          <div style={{
            background: 'rgba(14, 14, 20, 0.5)', border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '1rem', padding: '1.5rem',
          }}>
            {tiposGlobal.map((tipo, idx) => {
              const pct = totalFilings > 0 ? (tipo.count / totalFilings * 100) : 0;
              return (
                <div key={tipo.nome} style={{ marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{tipo.nome}</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: DONUT_COLORS[idx % DONUT_COLORS.length] }}>
                      {tipo.count} ({pct.toFixed(1)}%)
                    </span>
                  </div>
                  <div style={{
                    height: '6px', background: 'rgba(255,255,255,0.05)',
                    borderRadius: '3px', overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%', width: `${pct}%`,
                      background: `linear-gradient(90deg, ${DONUT_COLORS[idx % DONUT_COLORS.length]}, ${DONUT_COLORS[idx % DONUT_COLORS.length]}88)`,
                      borderRadius: '3px', transition: 'width 0.5s ease',
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
