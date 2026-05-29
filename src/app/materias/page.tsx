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


  // Track which month we're loading next
  const [nextMonth, setNextMonth] = useState(1);
  const [nextYear, setNextYear] = useState(2019);
  const [loadingLabel, setLoadingLabel] = useState('');
  const [autoLoading, setAutoLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // Restore saved data from localStorage on mount
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem('materias_data');
      const savedNext = localStorage.getItem('materias_next');
      if (saved && savedNext) {
        const parsedData = JSON.parse(saved) as MonthData[];
        const parsedNext = JSON.parse(savedNext) as { month: number; year: number };
        if (parsedData.length > 0) {
          setAllData(parsedData);
          setNextMonth(parsedNext.month);
          setNextYear(parsedNext.year);
        }
      }
    } catch { /* ignore parse errors */ }
    setInitialized(true);
  }, []);

  // Save to localStorage whenever data changes
  React.useEffect(() => {
    if (!initialized || allData.length === 0) return;
    try {
      localStorage.setItem('materias_data', JSON.stringify(allData));
      localStorage.setItem('materias_next', JSON.stringify({ month: nextMonth, year: nextYear }));
    } catch { /* storage full, ignore */ }
  }, [allData, nextMonth, nextYear, initialized]);

  const isFinished = nextYear > currentYear || (nextYear === currentYear && nextMonth > currentMonth);

  const loadMonth = useCallback(async (month: number, year: number): Promise<boolean> => {
    setLoading(true);
    setError(null);
    setLoadingLabel(`${MONTH_NAMES[month]} ${year}`);

    try {
      const res = await fetch(`/api/materias?month=${month}&year=${year}`);
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || `Erro ${res.status}`);
        return false;
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
      return true;
    } catch (err: any) {
      setError(`Erro de conexão: ${err?.message || 'desconhecido'}`);
      return false;
    } finally {
      setLoading(false);
      setLoadingLabel('');
    }
  }, []);

  // Auto-load all remaining months
  const loadAll = useCallback(async () => {
    setAutoLoading(true);
    let m = nextMonth;
    let y = nextYear;

    while (!(y > currentYear || (y === currentYear && m > currentMonth))) {
      const success = await loadMonth(m, y);
      if (!success) break; // Stop on error

      // Advance
      if (m === 12) { m = 1; y += 1; }
      else { m += 1; }

      // Small delay to avoid overwhelming
      await new Promise(r => setTimeout(r, 500));
    }
    setAutoLoading(false);
  }, [nextMonth, nextYear, currentMonth, currentYear, loadMonth]);

  const clearData = useCallback(() => {
    setAllData([]);
    setNextMonth(1);
    setNextYear(2019);
    localStorage.removeItem('materias_data');
    localStorage.removeItem('materias_next');
  }, []);

  // Generate and download a Word document for a phase
  const downloadWord = useCallback((group: PhaseGroup) => {
    const today = new Date().toLocaleDateString('pt-BR');
    const rows = group.processes.map((p, i) =>
      `<tr>
        <td style="padding:6px 10px;border:1px solid #ccc;text-align:center;">${i + 1}</td>
        <td style="padding:6px 10px;border:1px solid #ccc;font-weight:bold;">${p.reclamante}</td>
        <td style="padding:6px 10px;border:1px solid #ccc;font-family:monospace;font-size:11px;">${p.numeroProcesso}</td>
        <td style="padding:6px 10px;border:1px solid #ccc;">${p.reclamada}</td>
        <td style="padding:6px 10px;border:1px solid #ccc;">${p.advogado || '—'}</td>
      </tr>`
    ).join('');

    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:w="urn:schemas-microsoft-com:office:word"
            xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8">
      <style>
        body { font-family: Calibri, Arial, sans-serif; margin: 40px; }
        h1 { font-size: 18px; color: #1a1a1a; margin-bottom: 4px; }
        h2 { font-size: 13px; color: #666; font-weight: normal; margin-top: 0; }
        table { border-collapse: collapse; width: 100%; margin-top: 16px; }
        th { background: #2563eb; color: white; padding: 8px 10px; border: 1px solid #1d4ed8; text-align: left; font-size: 12px; }
        td { font-size: 12px; }
        .footer { margin-top: 24px; font-size: 10px; color: #999; }
      </style></head>
      <body>
        <h1>${group.phase.name}</h1>
        <h2>${group.phase.simple} — ${group.processes.length} processos</h2>
        <table>
          <tr>
            <th style="width:30px;">#</th>
            <th>Reclamante</th>
            <th>Nº Processo</th>
            <th>Reclamada</th>
            <th>Advogado</th>
          </tr>
          ${rows}
        </table>
        <p class="footer">Gerado em ${today} — BM&C Advogados · Dados do DataJud (CNJ)</p>
      </body></html>
    `;

    const blob = new Blob([html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${group.phase.name.replace(/[^a-zA-Zà-ú0-9 ]/g, '')}.doc`;
    a.click();
    URL.revokeObjectURL(url);
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
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.3rem' }}>
              {isFinished ? 'Status' : 'Próximo mês a carregar'}
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {isFinished ? '✅ Todos os meses carregados!' : `${MONTH_NAMES[nextMonth]} ${nextYear}`}
            </div>
            {loadedMonths.length > 0 && (
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                💾 Dados salvos automaticamente · {loadedMonths.length} {loadedMonths.length === 1 ? 'mês carregado' : 'meses carregados'}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {/* Load single month */}
            {!isFinished && (
              <button
                onClick={() => loadMonth(nextMonth, nextYear)}
                disabled={loading || autoLoading}
                style={{
                  background: loading ? 'var(--border)' : 'var(--accent-blue)',
                  color: 'white', border: 'none',
                  padding: '0.6rem 1.2rem', borderRadius: '2rem',
                  fontSize: '0.8rem', fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  boxShadow: loading ? 'none' : '0 3px 10px rgba(59, 130, 246, 0.3)',
                }}
              >
                {loading && !autoLoading ? (
                  <><LoadingSpinner size="sm" /> {loadingLabel}...</>
                ) : (
                  <>🔍 {MONTH_NAMES[nextMonth]} {nextYear}</>
                )}
              </button>
            )}

            {/* Load ALL remaining months */}
            {!isFinished && (
              <button
                onClick={loadAll}
                disabled={loading || autoLoading}
                style={{
                  background: autoLoading ? 'var(--border)' : 'linear-gradient(135deg, #10b981, #059669)',
                  color: 'white', border: 'none',
                  padding: '0.6rem 1.2rem', borderRadius: '2rem',
                  fontSize: '0.8rem', fontWeight: 700,
                  cursor: autoLoading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  boxShadow: autoLoading ? 'none' : '0 3px 10px rgba(16, 185, 129, 0.3)',
                }}
              >
                {autoLoading ? (
                  <><LoadingSpinner size="sm" /> Carregando {loadingLabel}...</>
                ) : (
                  <>⚡ Carregar Todos</>
                )}
              </button>
            )}

            {/* Clear/Reset */}
            {allData.length > 0 && (
              <button
                onClick={clearData}
                disabled={loading || autoLoading}
                style={{
                  background: 'transparent', color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  padding: '0.6rem 1rem', borderRadius: '2rem',
                  fontSize: '0.75rem', fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                🗑️ Limpar
              </button>
            )}
          </div>
        </div>
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
            {sortedPhases.map((group) => {
              const color = PHASE_COLORS[group.phase.id] || '#64748b';
              const icon = PHASE_ICONS[group.phase.id] || '📋';

              return (
                <div
                  key={group.phase.id}
                  style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderLeft: `4px solid ${color}`,
                    borderRadius: '1rem', overflow: 'hidden',
                    padding: '1.25rem',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                      background: color, color: 'white', fontSize: '1rem', fontWeight: 800,
                      minWidth: '38px', height: '38px', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: `0 2px 8px ${color}40`,
                    }}>
                      {group.processes.length}
                    </div>
                    <div>
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {icon} {group.phase.name}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {group.phase.simple}
                      </div>
                    </div>
                  </div>

                  {/* Download Word Button */}
                  <button
                    onClick={() => downloadWord(group)}
                    title={`Baixar lista de ${group.phase.name} em Word`}
                    style={{
                      background: 'rgba(59, 130, 246, 0.1)',
                      color: '#3b82f6',
                      border: '1px solid rgba(59, 130, 246, 0.25)',
                      width: '40px', height: '40px',
                      borderRadius: '0.75rem',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: '1.1rem',
                      transition: 'all 0.15s',
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(59, 130, 246, 0.2)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(59, 130, 246, 0.1)'; }}
                  >
                    📥
                  </button>
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
            Comece carregando {MONTH_NAMES[nextMonth]} {nextYear}
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
