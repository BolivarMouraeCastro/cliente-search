'use client';

import React, { useState } from 'react';

interface MovementClassification {
  category: string;
  icon: string;
  color: string;
}

interface Movement {
  date: string;
  description: string;
  complement: string;
  classification: MovementClassification;
}

interface MateriaSummary {
  category: string;
  icon: string;
  color: string;
  count: number;
}

interface MovementsTimelineProps {
  movements: Movement[];
  materiasSummary: MateriaSummary[];
  tribunal: string;
  classe: string;
  assunto: string;
  orgaoJulgador: string;
  totalMovements: number;
  loading: boolean;
  error: string | null;
  currentPhase?: { name: string; date: string; simple: string } | null;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatTime(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function MovementsTimeline({
  movements,
  materiasSummary,
  tribunal,
  classe,
  assunto,
  orgaoJulgador,
  totalMovements,
  loading,
  error,
  currentPhase,
}: MovementsTimelineProps) {
  const [filter, setFilter] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
        <div style={{
          width: 40, height: 40, border: '3px solid var(--border)',
          borderTop: '3px solid var(--accent)', borderRadius: '50%',
          animation: 'spin 1s linear infinite', margin: '0 auto 1rem',
        }} />
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Consultando movimentações no DataJud (CNJ)...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '0.75rem', padding: '1.5rem', textAlign: 'center',
      }}>
        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⚠️</div>
        <div style={{ color: '#ef4444', fontWeight: 600, marginBottom: '0.25rem' }}>
          Erro ao consultar DataJud
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{error}</div>
      </div>
    );
  }

  if (movements.length === 0) {
    return (
      <div style={{
        background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)',
        borderRadius: '0.75rem', padding: '2rem', textAlign: 'center',
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</div>
        <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
          Nenhuma movimentação encontrada
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
          O processo pode ainda não estar indexado no DataJud ou o número pode estar incorreto.
        </div>
      </div>
    );
  }

  const filteredMovements = filter
    ? movements.filter((m) => m.classification.category === filter)
    : movements;

  const displayMovements = showAll ? filteredMovements : filteredMovements.slice(0, 20);

  return (
    <div>
      {/* Smart Phase Detector Highlight */}
      {currentPhase && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.15))',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '1rem', padding: '1.25rem', marginBottom: '1.5rem',
          display: 'flex', gap: '1rem', alignItems: 'center'
        }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '50%',
            background: 'var(--bg-primary)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: '1.5rem', flexShrink: 0,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}>
            🤖
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#10b981', fontWeight: 700, marginBottom: '0.2rem' }}>
              Fase Atual Detectada
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {currentPhase.name}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem', lineHeight: 1.4 }}>
              {currentPhase.simple}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
              Baseado na movimentação de {formatDate(currentPhase.date)}
            </div>
          </div>
        </div>
      )}

      {/* Process Info Header */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(139, 92, 246, 0.08))',
        border: '1px solid rgba(59, 130, 246, 0.2)',
        borderRadius: '1rem', padding: '1.25rem', marginBottom: '1.5rem',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          marginBottom: '0.75rem', fontSize: '0.65rem', textTransform: 'uppercase',
          letterSpacing: '0.1em', color: 'var(--text-muted)', fontWeight: 700,
        }}>
          🏛️ Dados do DataJud (CNJ)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          {tribunal && (
            <div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Tribunal</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{tribunal}</div>
            </div>
          )}
          {orgaoJulgador && (
            <div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Órgão Julgador</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{orgaoJulgador}</div>
            </div>
          )}
          {classe && (
            <div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Classe</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{classe}</div>
            </div>
          )}
          {assunto && (
            <div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Assunto</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{assunto}</div>
            </div>
          )}
        </div>
        <div style={{
          marginTop: '0.75rem', padding: '0.5rem 0.75rem',
          background: 'rgba(16, 185, 129, 0.1)', borderRadius: '0.5rem',
          display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
          fontSize: '0.75rem', color: '#10b981', fontWeight: 600,
        }}>
          📊 {totalMovements} movimentações encontradas
        </div>
      </div>

      {/* Matérias Summary Cards */}
      {materiasSummary.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{
            fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em',
            color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.75rem',
          }}>
            📋 Classificação por Matéria
          </div>
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '0.5rem',
          }}>
            {/* "Todas" filter button */}
            <button
              onClick={() => setFilter(null)}
              style={{
                padding: '0.4rem 0.75rem', borderRadius: '2rem',
                border: `1px solid ${!filter ? '#3b82f6' : 'var(--border)'}`,
                background: !filter ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                color: !filter ? '#3b82f6' : 'var(--text-muted)',
                fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              Todas ({totalMovements})
            </button>

            {materiasSummary.map((m) => (
              <button
                key={m.category}
                onClick={() => setFilter(filter === m.category ? null : m.category)}
                style={{
                  padding: '0.4rem 0.75rem', borderRadius: '2rem',
                  border: `1px solid ${filter === m.category ? m.color : 'var(--border)'}`,
                  background: filter === m.category ? `${m.color}20` : 'transparent',
                  color: filter === m.category ? m.color : 'var(--text-muted)',
                  fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                }}
              >
                {m.icon} {m.category} ({m.count})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Movements Timeline */}
      <div style={{ position: 'relative' }}>
        {/* Vertical line */}
        <div style={{
          position: 'absolute', left: '8px', top: '12px', bottom: '12px',
          width: '2px', background: 'var(--border)', zIndex: 0,
        }} />

        {displayMovements.map((mov, i) => (
          <div
            key={i}
            style={{
              display: 'flex', gap: '1rem', marginBottom: '0.75rem',
              position: 'relative', zIndex: 1,
            }}
          >
            {/* Timeline dot */}
            <div style={{
              width: '18px', height: '18px', borderRadius: '50%',
              background: mov.classification.color,
              border: '3px solid var(--bg-secondary)',
              flexShrink: 0, marginTop: '4px',
              boxShadow: `0 0 0 2px ${mov.classification.color}40`,
            }} />

            {/* Movement card */}
            <div style={{
              flex: 1, background: 'var(--bg-secondary)',
              border: '1px solid var(--border)', borderRadius: '0.75rem',
              padding: '0.75rem 1rem',
              borderLeft: `3px solid ${mov.classification.color}`,
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'translateX(4px)';
                (e.currentTarget as HTMLElement).style.boxShadow = `0 2px 8px ${mov.classification.color}20`;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'translateX(0)';
                (e.currentTarget as HTMLElement).style.boxShadow = 'none';
              }}
            >
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.35rem',
              }}>
                <span style={{
                  fontSize: '0.65rem', padding: '0.15rem 0.5rem', borderRadius: '1rem',
                  background: `${mov.classification.color}18`,
                  color: mov.classification.color, fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}>
                  {mov.classification.icon} {mov.classification.category}
                </span>
                <div style={{
                  fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', gap: '0.35rem',
                }}>
                  📅 {formatDate(mov.date)} {formatTime(mov.date) && `· ${formatTime(mov.date)}`}
                </div>
              </div>

              <div style={{
                fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)',
                marginBottom: mov.complement ? '0.25rem' : 0,
              }}>
                {mov.description}
              </div>

              {mov.complement && (
                <div style={{
                  fontSize: '0.75rem', color: 'var(--text-muted)',
                  fontStyle: 'italic',
                }}>
                  {mov.complement}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Show more button */}
      {filteredMovements.length > 20 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          style={{
            width: '100%', padding: '0.75rem', marginTop: '1rem',
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: '0.75rem', color: '#3b82f6',
            fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(59, 130, 246, 0.15)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(59, 130, 246, 0.08)';
          }}
        >
          Ver todas as {filteredMovements.length} movimentações →
        </button>
      )}

      {/* Source attribution */}
      <div style={{
        textAlign: 'center', marginTop: '1.5rem', padding: '0.75rem',
        fontSize: '0.65rem', color: 'var(--text-muted)',
        borderTop: '1px solid var(--border)',
      }}>
        Dados públicos fornecidos pela API do DataJud — Conselho Nacional de Justiça (CNJ)
      </div>
    </div>
  );
}
