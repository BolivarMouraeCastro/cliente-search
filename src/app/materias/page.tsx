'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Client } from '@/types';
import { PhaseConfig } from '@/lib/phases';

interface PhaseGroup {
  phase: PhaseConfig;
  clients: {
    client: Client;
    lastMovementDate: string;
    lastMovementDesc: string;
  }[];
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

export default function MateriasDashboardPage() {
  const router = useRouter();
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
      } catch (err) {
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
          Analisando todos os processos no DataJud...
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Isso pode levar alguns segundos.</div>
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
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          🏛️ Painel de Matérias (DataJud)
        </h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Visão panorâmica do escritório. Os processos são analisados em lote diretamente na base do Tribunal para detectar a Fase Atual.
        </p>
      </div>

      {/* Summary Stats */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ flex: 1, background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '1rem', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>Total de Processos</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)' }}>{data.totalProcessos}</div>
        </div>
        <div style={{ flex: 1, background: 'rgba(16, 185, 129, 0.05)', padding: '1.5rem', borderRadius: '1rem', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#10b981', fontWeight: 700 }}>Processos Encontrados (CNJ)</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#10b981' }}>{data.encontrados}</div>
        </div>
        <div style={{ flex: 1, background: 'rgba(239, 68, 68, 0.05)', padding: '1.5rem', borderRadius: '1rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#ef4444', fontWeight: 700 }}>Não Indexados / Sigilosos</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#ef4444' }}>{data.naoEncontrados}</div>
        </div>
      </div>

      {/* Phases Grid */}
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem' }}>Fases Atuais</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1rem' }}>
        {data.fases.map((group) => {
          const isExpanded = expandedPhase === group.phase.id;
          return (
            <div 
              key={group.phase.id}
              style={{
                background: 'var(--bg-secondary)',
                border: isExpanded ? '1px solid var(--accent-blue)' : '1px solid var(--border)',
                borderRadius: '1rem',
                overflow: 'hidden',
                transition: 'all 0.2s',
                boxShadow: isExpanded ? '0 4px 20px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {/* Card Header (Clickable) */}
              <div 
                onClick={() => setExpandedPhase(isExpanded ? null : group.phase.id)}
                style={{
                  padding: '1.5rem',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: isExpanded ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                }}
              >
                <div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {group.phase.name}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    {group.phase.simple}
                  </div>
                </div>
                <div style={{ 
                  background: 'var(--accent-blue)', color: 'white', 
                  fontSize: '1.25rem', fontWeight: 800, 
                  width: '40px', height: '40px', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {group.clients.length}
                </div>
              </div>

              {/* Expanded List */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
                  {group.clients.map((c, idx) => (
                    <div 
                      key={idx}
                      style={{
                        padding: '1rem 1.5rem',
                        borderBottom: idx === group.clients.length - 1 ? 'none' : '1px solid var(--border)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                          {c.client.nome}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '0.2rem' }}>
                          {c.client.numeroProcesso}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.35rem', fontStyle: 'italic' }}>
                          Último mov: {c.lastMovementDesc} ({formatDate(c.lastMovementDate)})
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); router.push(`/client/${encodeURIComponent(c.client.id)}`); }}
                        style={{
                          background: 'rgba(59, 130, 246, 0.1)',
                          color: '#3b82f6',
                          border: 'none',
                          padding: '0.5rem 1rem',
                          borderRadius: '2rem',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Abrir
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
