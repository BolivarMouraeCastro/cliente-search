'use client';

import React, { useState, useCallback } from 'react';
import LoadingSpinner from '@/components/LoadingSpinner';

interface ProcessEntry {
  reclamante: string;
  reclamada: string;
  numeroProcesso: string;
  advogado: string;
  dataAudiencia: string;
  lastMovementDate: string;
  lastMovementDesc: string;
}

interface PhaseGroup {
  phase: { id: string; name: string; simple: string; order: number };
  processes: ProcessEntry[];
}

interface MonthData {
  month: number;
  year: number;
  totalProcessos: number;
  encontrados: number;
  naoEncontrados: number;
  fases: PhaseGroup[];
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR');
  } catch {
    return dateStr;
  }
}

const MONTH_NAMES = [
  '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const PHASE_COLORS: Record<string, string> = {
  execucao: '#f97316', transito: '#059669', acordao: '#059669',
  recurso: '#ef4444', sentenca: '#10b981', pericia: '#6366f1',
  audiencia_instrucao: '#f59e0b', audiencia_una: '#f59e0b',
  audiencia_inicial: '#f59e0b', acordo: '#22c55e',
  citacao: '#3b82f6', distribuicao: '#64748b',
};

const PHASE_ICONS: Record<string, string> = {
  execucao: '🔨', transito: '✅', acordao: '📋', recurso: '📄',
  sentenca: '⚖️', pericia: '🔬', audiencia_instrucao: '🗓️',
  audiencia_una: '🗓️', audiencia_inicial: '🗓️', acordo: '🤝',
  citacao: '📨', distribuicao: '📌',
};

export default function MateriasDashboardPage() {
  const [allData, setAllData] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);

  // Track which month we're loading next
  const [nextMonth, setNextMonth] = useState(1);
  const [nextYear, setNextYear] = useState(2025);
  const [loadingLabel, setLoadingLabel] = useState('');

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const isFinished = nextYear > currentYear || (nextYear === currentYear && nextMonth > currentMonth);

  const loadMonth = useCallback(async (month: number, year: number) => {
    setLoading(true);
    setError(null);
    setLoadingLabel(`${MONTH_NAMES[month]} ${year}`);

    try {
      const res = await fetch(`/api/materias?month=${month}&year=${year}`);
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || `Erro ${res.status}`);
        return;
      }

      setAllData(prev => [...prev, json]);

      // Advance to next month
      if (month === 12) {
        setNextMonth(1);
        setNextYear(year + 1);
      } else {
        setNextMonth(month + 1);
        setNextYear(year);
      }
    } catch (err: any) {
      setError(`Erro de conexão: ${err?.message || 'desconhecido'}`);
    } finally {
      setLoading(false);
      setLoadingLabel('');
    }
  }, []);

  // Merge all loaded months into a single view
  const mergedPhases = new Map<string, PhaseGroup>();
  let totalProcessos = 0;
  let totalEncontrados = 0;
  let totalNaoEncontrados = 0;

  for (const md of allData) {
    totalProcessos += md.totalProcessos;
    totalEncontrados += md.encontrados;
    totalNaoEncontrados += md.naoEncontrados;

    for (const group of md.fases) {
      const existing = mergedPhases.get(group.phase.id);
      if (existing) {
        existing.processes.push(...group.processes);
      } else {
        mergedPhases.set(group.phase.id, {
          phase: group.phase,
          processes: [...group.processes],
        });
      }
    }
  }

  const sortedPhases = Array.from(mergedPhases.values())
    .sort((a, b) => b.phase.order - a.phase.order);

  // Loaded months summary
  const loadedMonths = allData.map(d => `${MONTH_NAMES[d.month]}/${d.year}`);

  return (
    <div className="detail-page" style={{ paddingTop: '1rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          🏛️ Painel de Matérias (DataJud)
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Carregue os processos mês a mês a partir da Planilha de Audiências. Cada mês é consultado no CNJ para detectar a fase atual.
        </p>
      </div>

      {/* Month Loader Control */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(139, 92, 246, 0.06))',
        border: '1px solid rgba(59, 130, 246, 0.2)',
        borderRadius: '1rem', padding: '1.5rem', marginBottom: '1.5rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '1rem',
      }}>
        <div>
          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.3rem' }}>
            Próximo mês a carregar
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            {isFinished ? '✅ Todos os meses carregados!' : `${MONTH_NAMES[nextMonth]} ${nextYear}`}
          </div>
          {loadedMonths.length > 0 && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
              Carregados: {loadedMonths.join(', ')}
            </div>
          )}
        </div>

        {!isFinished && (
          <button
            onClick={() => loadMonth(nextMonth, nextYear)}
            disabled={loading}
            style={{
              background: loading ? 'var(--border)' : 'var(--accent-blue)',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '2rem',
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              transition: 'all 0.2s',
              boxShadow: loading ? 'none' : '0 4px 12px rgba(59, 130, 246, 0.3)',
            }}
          >
            {loading ? (
              <>
                <LoadingSpinner size="sm" />
                Buscando {loadingLabel}...
              </>
            ) : (
              <>🔍 Carregar {MONTH_NAMES[nextMonth]} {nextYear}</>
            )}
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '0.75rem', padding: '1rem', marginBottom: '1rem',
          color: '#ef4444', fontSize: '0.85rem',
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Summary Stats */}
      {allData.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '1rem', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>Processos Analisados</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)' }}>{totalProcessos}</div>
            </div>
            <div style={{ background: 'rgba(16, 185, 129, 0.05)', padding: '1rem', borderRadius: '1rem', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
              <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: '#10b981', fontWeight: 700 }}>Encontrados no CNJ</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#10b981' }}>{totalEncontrados}</div>
            </div>
            <div style={{ background: 'rgba(239, 68, 68, 0.05)', padding: '1rem', borderRadius: '1rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: '#ef4444', fontWeight: 700 }}>Não Indexados / Recentes</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ef4444' }}>{totalNaoEncontrados}</div>
            </div>
          </div>

          {/* Phases Grid */}
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>📊 Fases Atuais</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
            {sortedPhases.map((group) => {
              const isExpanded = expandedPhase === group.phase.id;
              const color = PHASE_COLORS[group.phase.id] || '#64748b';
              const icon = PHASE_ICONS[group.phase.id] || '📋';

              return (
                <div
                  key={group.phase.id}
                  style={{
                    background: 'var(--bg-secondary)',
                    border: isExpanded ? `2px solid ${color}` : '1px solid var(--border)',
                    borderRadius: '1rem', overflow: 'hidden',
                    transition: 'all 0.25s ease',
                    boxShadow: isExpanded ? `0 4px 20px ${color}20` : 'none',
                  }}
                >
                  <div
                    onClick={() => setExpandedPhase(isExpanded ? null : group.phase.id)}
                    style={{
                      padding: '1.25rem', cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: isExpanded ? `${color}08` : 'transparent',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>{icon}</span> {group.phase.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                        {group.phase.simple}
                      </div>
                    </div>
                    <div style={{
                      background: color, color: 'white', fontSize: '1.1rem', fontWeight: 800,
                      minWidth: '38px', height: '38px', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: `0 2px 8px ${color}40`,
                    }}>
                      {group.processes.length}
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-primary)', maxHeight: '400px', overflowY: 'auto' }}>
                      {group.processes.map((p, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: '0.85rem 1.25rem',
                            borderBottom: idx === group.processes.length - 1 ? 'none' : '1px solid var(--border)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                                {p.reclamante}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                                vs {p.reclamada}
                              </div>
                              <div style={{ fontSize: '0.7rem', color: color, fontFamily: 'monospace', marginTop: '0.3rem', fontWeight: 600 }}>
                                {p.numeroProcesso}
                              </div>
                            </div>
                            {p.advogado && (
                              <div style={{
                                fontSize: '0.7rem', color: 'var(--text-muted)',
                                background: 'var(--bg-secondary)', padding: '0.25rem 0.6rem',
                                borderRadius: '1rem', fontWeight: 600, whiteSpace: 'nowrap',
                              }}>
                                👤 {p.advogado}
                              </div>
                            )}
                          </div>
                          {p.lastMovementDesc && (
                            <div style={{
                              fontSize: '0.7rem', color: 'var(--text-secondary)',
                              marginTop: '0.4rem', fontStyle: 'italic',
                              display: 'flex', alignItems: 'center', gap: '0.3rem',
                            }}>
                              <span style={{ color }}>●</span>
                              Última mov: {p.lastMovementDesc}
                              {p.lastMovementDate && ` (${formatDate(p.lastMovementDate)})`}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Empty state */}
      {allData.length === 0 && !loading && (
        <div style={{
          textAlign: 'center', padding: '3rem 1rem',
          background: 'var(--bg-secondary)', borderRadius: '1rem',
          border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🏛️</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            Comece carregando Janeiro 2025
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Clique no botão acima para buscar os processos do primeiro mês. Depois vá avançando mês a mês.
          </div>
        </div>
      )}

      {/* Source */}
      <div style={{
        textAlign: 'center', marginTop: '2rem', padding: '0.75rem',
        fontSize: '0.65rem', color: 'var(--text-muted)',
        borderTop: '1px solid var(--border)',
      }}>
        Dados públicos do DataJud (CNJ) · Processos da Planilha de Audiências (somente leitura)
      </div>
    </div>
  );
}
