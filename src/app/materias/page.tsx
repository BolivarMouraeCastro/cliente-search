'use client';

import React, { useState, useEffect } from 'react';
import LoadingSpinner from '@/components/LoadingSpinner';

interface PhaseConfig {
  id: string;
  name: string;
  simple: string;
  sheetStatus: string;
  keywords: string[];
  order: number;
}

interface ProcessEntry {
  reclamante: string;
  reclamada: string;
  numeroProcesso: string;
  advogado: string;
  lastMovementDate: string;
  lastMovementDesc: string;
}

interface PhaseGroup {
  phase: PhaseConfig;
  processes: ProcessEntry[];
}

interface DashboardData {
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

// Phase colors
const PHASE_COLORS: Record<string, string> = {
  execucao: '#f97316',
  transito: '#059669',
  acordao: '#059669',
  recurso: '#ef4444',
  sentenca: '#10b981',
  pericia: '#6366f1',
  audiencia_instrucao: '#f59e0b',
  audiencia_una: '#f59e0b',
  audiencia_inicial: '#f59e0b',
  acordo: '#22c55e',
  citacao: '#3b82f6',
  distribuicao: '#64748b',
};

const PHASE_ICONS: Record<string, string> = {
  execucao: '🔨',
  transito: '✅',
  acordao: '📋',
  recurso: '📄',
  sentenca: '⚖️',
  pericia: '🔬',
  audiencia_instrucao: '🗓️',
  audiencia_una: '🗓️',
  audiencia_inicial: '🗓️',
  acordo: '🤝',
  citacao: '📨',
  distribuicao: '📌',
};

export default function MateriasDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/materias');
        if (res.ok) {
          const json = await res.json();
          setData(json);
        } else {
          setError('Erro ao carregar dados do DataJud.');
        }
      } catch {
        setError('Erro de conexão ao carregar painel.');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '1rem' }}>
        <LoadingSpinner size="lg" />
        <div style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
          Analisando processos da Planilha de Audiências no DataJud...
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Buscando movimentações de todos os processos. Isso pode levar alguns segundos na primeira vez.
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️</div>
        <h2 style={{ color: '#ef4444' }}>{error}</h2>
      </div>
    );
  }

  return (
    <div className="detail-page" style={{ paddingTop: '1rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          🏛️ Painel de Matérias (DataJud)
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Processos da <strong>Planilha de Audiências</strong> analisados em lote no Tribunal (CNJ). Clique em uma fase para ver os processos.
        </p>
      </div>

      {/* Summary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ background: 'var(--bg-secondary)', padding: '1.25rem', borderRadius: '1rem', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>Processos na Planilha</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)' }}>{data.totalProcessos}</div>
        </div>
        <div style={{ background: 'rgba(16, 185, 129, 0.05)', padding: '1.25rem', borderRadius: '1rem', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#10b981', fontWeight: 700 }}>Encontrados no CNJ</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#10b981' }}>{data.encontrados}</div>
        </div>
        <div style={{ background: 'rgba(239, 68, 68, 0.05)', padding: '1.25rem', borderRadius: '1rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#ef4444', fontWeight: 700 }}>Não Indexados / Recentes</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#ef4444' }}>{data.naoEncontrados}</div>
        </div>
      </div>

      {/* Phases Grid */}
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        📊 Fases Atuais
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
        {data.fases.map((group) => {
          const isExpanded = expandedPhase === group.phase.id;
          const color = PHASE_COLORS[group.phase.id] || '#64748b';
          const icon = PHASE_ICONS[group.phase.id] || '📋';

          return (
            <div
              key={group.phase.id}
              style={{
                background: 'var(--bg-secondary)',
                border: isExpanded ? `2px solid ${color}` : '1px solid var(--border)',
                borderRadius: '1rem',
                overflow: 'hidden',
                transition: 'all 0.25s ease',
                boxShadow: isExpanded ? `0 4px 20px ${color}20` : 'none',
              }}
            >
              {/* Card Header (Clickable) */}
              <div
                onClick={() => setExpandedPhase(isExpanded ? null : group.phase.id)}
                style={{
                  padding: '1.25rem',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: isExpanded ? `${color}08` : 'transparent',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = `${color}05`; }}
                onMouseLeave={(e) => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
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
                  background: color, color: 'white',
                  fontSize: '1.1rem', fontWeight: 800,
                  minWidth: '38px', height: '38px', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 2px 8px ${color}40`,
                }}>
                  {group.processes.length}
                </div>
              </div>

              {/* Expanded List */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
                  {group.processes.map((p, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '0.85rem 1.25rem',
                        borderBottom: idx === group.processes.length - 1 ? 'none' : '1px solid var(--border)',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-secondary)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
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

      {/* Source attribution */}
      <div style={{
        textAlign: 'center', marginTop: '2rem', padding: '0.75rem',
        fontSize: '0.65rem', color: 'var(--text-muted)',
        borderTop: '1px solid var(--border)',
      }}>
        Dados públicos do DataJud (CNJ) · Processos extraídos da Planilha de Audiências (somente leitura)
      </div>
    </div>
  );
}
