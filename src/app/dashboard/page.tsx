'use client';

import { useState, useEffect } from 'react';

// Dynamic colors for chart bars
const BAR_COLORS = [
  '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
  '#06b6d4', '#a855f7', '#eab308', '#22c55e', '#e11d48',
];

const LAWYER_COLORS: Record<string, string> = {
  'ALESSANDRA': '#e91e63',
  'ELITON': '#2196f3',
  'JAMILLE': '#9c27b0',
  'JESSÉ': '#ff9800',
  'JESSE': '#ff9800',
};

function getLawyerColor(name: string): string {
  const upper = name.toUpperCase();
  for (const [key, color] of Object.entries(LAWYER_COLORS)) {
    if (upper.includes(key)) return color;
  }
  return '#D4AF37';
}

const STATUS_COLORS: Record<string, string> = {
  para_fazer: '#3b82f6',
  correcao: '#f59e0b',
  refazer: '#ef4444',
};

// Parse initial petition folder names: "NOME DO CLIENTE - DATA DE PRESCRIÇÃO E NOME DA EMPRESA"
function parseInicialName(raw: string): { cliente: string; prescricao: string; empresa: string } {
  // Try to split by " - " first
  const dashIdx = raw.indexOf(' - ');
  if (dashIdx === -1) {
    return { cliente: raw, prescricao: '', empresa: '' };
  }

  const cliente = raw.substring(0, dashIdx).trim();
  const rest = raw.substring(dashIdx + 3).trim();

  // Try to find a date pattern (dd/mm/yyyy or dd.mm.yyyy) in the rest
  const dateMatch = rest.match(/(\d{1,2}[\/\.]\d{1,2}[\/\.]\d{2,4})/);
  if (dateMatch) {
    const prescricao = dateMatch[1];
    // Everything after the date (and any separator) is the company
    const afterDate = rest.substring(rest.indexOf(prescricao) + prescricao.length).trim();
    // Remove leading separators like "e", "E", "-", ","
    const empresa = afterDate.replace(/^[\s\-,eE]+/, '').trim();
    return { cliente, prescricao, empresa };
  }

  // No date found — rest might just be company
  return { cliente, prescricao: '', empresa: rest };
}

interface StatusData {
  status: string;
  count: number;
}

interface IniciaisItem {
  name: string;
  id: string;
  createdTime?: string;
}

interface IniciaisStatus {
  statusId: string;
  statusLabel: string;
  items: IniciaisItem[];
}

interface LawyerData {
  name: string;
  folderId: string;
  statuses: IniciaisStatus[];
  totalItems: number;
}

export default function DashboardPage() {
  // Dashboard
  const [totalClients, setTotalClients] = useState(0);
  const [statusData, setStatusData] = useState<StatusData[]>([]);
  const [dashLoading, setDashLoading] = useState(true);

  // Iniciais
  const [lawyers, setLawyers] = useState<LawyerData[]>([]);
  const [totalIniciais, setTotalIniciais] = useState(0);
  const [iniciaisLoading, setIniciaisLoading] = useState(true);
  const [iniciaisError, setIniciaisError] = useState<string | null>(null);
  const [expandedLawyer, setExpandedLawyer] = useState<string | null>(null);

  // Bolivar Sync
  interface SyncItem { nome: string; row: number }
  const [syncData, setSyncData] = useState<{
    kept: SyncItem[]; missing: SyncItem[];
    extraInDrive: string[]; totalSpreadsheet: number; totalDrive: number;
  } | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncApplied, setSyncApplied] = useState(false);
  const [applyingSync, setApplyingSync] = useState(false);

  // Iniciais Sync (FAZER INICIAL)
  interface IniciaisItem { nome: string; lawyer: string; row: number; currentStatus: string }
  const [iniciaisData, setIniciaisData] = useState<{
    needsUpdate: IniciaisItem[]; alreadyCorrect: { nome: string; row: number }[];
    notInSheet: { nome: string; lawyer: string }[]; totalDrive: number;
    totalLawyers: string[];
  } | null>(null);
  const [iniciaisSyncLoading, setIniciaisSyncLoading] = useState(false);
  const [iniciaisSyncError, setIniciaisSyncError] = useState<string | null>(null);
  const [iniciaisApplied, setIniciaisApplied] = useState(false);
  const [applyingIniciais, setApplyingIniciais] = useState(false);

  // Extract fetchDashboard so we can call it after auto-sync
  const fetchDashboardData = async () => {
    setDashLoading(true);
    try {
      const res = await fetch('/api/dashboard');
      if (res.ok) {
        const data = await res.json();
        setTotalClients(data.totalClients || 0);
        setStatusData(data.statusDistribution || []);
      }
    } catch { /* ignore */ }
    finally { setDashLoading(false); }
  };

  // Fetch dashboard on mount
  useEffect(() => {
    fetchDashboardData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-Sync States
  const [autoSyncState, setAutoSyncState] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [autoSyncMessage, setAutoSyncMessage] = useState('');

  // Auto-Sync Effect
  useEffect(() => {
    let isMounted = true;
    async function runAutoSync() {
      if (!isMounted) return;
      setAutoSyncState('running');
      setAutoSyncMessage('Verificando alterações no Drive...');
      try {
        let appliedCount = 0;
        
        // 1. Bolivar
        const resBol = await fetch('/api/bolivar-sync');
        if (resBol.ok) {
          const bolData = await resBol.json();
          if (bolData.missing && bolData.missing.length > 0) {
            if (isMounted) setAutoSyncMessage(`Atualizando ${bolData.missing.length} processos Bolivar...`);
            const updates = bolData.missing.map((m: any) => ({ row: m.row, newStatus: 'DISTRIBUIDO' }));
            const postBol = await fetch('/api/bolivar-sync', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates })
            });
            if (postBol.ok) appliedCount += bolData.missing.length;
          }
        }

        // 2. Iniciais
        if (!isMounted) return;
        const resIni = await fetch('/api/iniciais-sync');
        if (resIni.ok) {
          const iniData = await resIni.json();
          if (iniData.needsUpdate && iniData.needsUpdate.length > 0) {
            if (isMounted) setAutoSyncMessage(`Atualizando ${iniData.needsUpdate.length} processos de Iniciais...`);
            const updates = iniData.needsUpdate.map((d: any) => ({ row: d.row }));
            const postIni = await fetch('/api/iniciais-sync', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates })
            });
            if (postIni.ok) appliedCount += iniData.needsUpdate.length;
          }
        }

        if (isMounted) {
          setAutoSyncState('success');
          setAutoSyncMessage(appliedCount > 0 
            ? `Sincronização automática concluída! ${appliedCount} clientes atualizados na planilha.`
            : 'Sincronização automática concluída! Planilha já estava 100% atualizada.');
          
          // Refresh dashboard if changes were made
          if (appliedCount > 0) {
            fetchDashboardData();
          }
          
          // Hide success message after 5 seconds
          setTimeout(() => {
            if (isMounted) setAutoSyncState('idle');
          }, 5000);
        }
      } catch (e) {
        if (isMounted) {
          setAutoSyncState('error');
          setAutoSyncMessage('Erro na sincronização automática. Você pode tentar manualmente abaixo.');
        }
      }
    }
    
    // Start auto-sync slightly after mount to let the UI render first
    const timer = setTimeout(runAutoSync, 1000);
    return () => { isMounted = false; clearTimeout(timer); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  // Fetch iniciais from Drive
  useEffect(() => {
    async function fetchIniciais() {
      setIniciaisLoading(true);
      setIniciaisError(null);
      try {
        const res = await fetch('/api/iniciais');
        if (res.ok) {
          const data = await res.json();
          setLawyers(data.lawyers || []);
          setTotalIniciais(data.totalGeral || 0);
          // Show debug info if no lawyers found
          if (data.debug && (!data.lawyers || data.lawyers.length === 0)) {
            setIniciaisError(data.debug);
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          setIniciaisError(errData.error || 'Erro ao carregar iniciais');
        }
      } catch {
        setIniciaisError('Erro de conexão');
      } finally {
        setIniciaisLoading(false);
      }
    }
    fetchIniciais();
  }, []);


  // Chart calculations
  const maxCount = Math.max(...statusData.map((s) => s.count), 1);
  const top10 = statusData.slice(0, 10);

  return (
    <div className="detail-page" style={{ paddingTop: '1rem' }}>
      {/* ========================== DASHBOARD ========================== */}
      <div style={{ marginTop: '1rem' }}>
          {/* Header */}
          <h2 style={{
            fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)',
            margin: '0 0 0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            📊 Dashboard Processual
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 1rem' }}>
            Dados em tempo real da planilha — os status são atualizados automaticamente conforme você consulta cada cliente
          </p>

          {/* Auto-Sync Banner */}
          {autoSyncState !== 'idle' && (
            <div style={{
              background: autoSyncState === 'running' ? 'rgba(59, 130, 246, 0.1)' : 
                         autoSyncState === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${autoSyncState === 'running' ? 'rgba(59, 130, 246, 0.3)' : 
                                  autoSyncState === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              borderRadius: '0.75rem', padding: '0.75rem 1rem', marginBottom: '1.5rem',
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              color: autoSyncState === 'running' ? '#60a5fa' : 
                     autoSyncState === 'success' ? '#4ade80' : '#f87171',
              fontSize: '0.85rem', fontWeight: 600,
              animation: 'fadeIn 0.3s ease-out'
            }}>
              {autoSyncState === 'running' && (
                <div style={{ width: '16px', height: '16px', border: '2px solid #60a5fa', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              )}
              {autoSyncState === 'success' && '✨ '}
              {autoSyncState === 'error' && '⚠️ '}
              {autoSyncMessage}
            </div>
          )}

          {/* Stats Cards */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-card-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div className="stat-card-label">Total de Clientes</div>
              <div className="stat-card-value blue">{dashLoading ? '—' : totalClients}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <div className="stat-card-label">Status Diferentes</div>
              <div className="stat-card-value green">{dashLoading ? '—' : statusData.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-blue-light)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <div className="stat-card-label">Distribuídos</div>
              <div className="stat-card-value blue">
                {dashLoading ? '—' : (statusData.find((s) => s.status.includes('DISTRIBU'))?.count || 0)}
              </div>
            </div>
          </div>

          {/* Charts */}
          {!dashLoading && statusData.length > 0 && (
            <div style={{
              display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)',
              gap: '1.5rem', marginTop: '1.5rem',
            }}>
              {/* Donut Chart */}
              <div style={{
                background: 'var(--card-bg)', border: '1px solid var(--card-border)',
                borderRadius: '1rem', padding: '1.5rem',
              }}>
                <h3 style={{
                  fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)',
                  margin: '0 0 1.25rem', textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  Distribuição por Status
                </h3>

                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                  <svg width="180" height="180" viewBox="0 0 180 180">
                    {(() => {
                      const cx = 90, cy = 90, r = 70;
                      const total = totalClients || 1;
                      let cumulative = 0;

                      return top10.map((p, idx) => {
                        const pct = p.count / total;
                        const circumference = 2 * Math.PI * r;
                        const dashLen = pct * circumference;
                        const dashOff = cumulative * circumference;
                        cumulative += pct;

                        return (
                          <circle
                            key={p.status}
                            cx={cx} cy={cy} r={r}
                            fill="none"
                            stroke={BAR_COLORS[idx % BAR_COLORS.length]}
                            strokeWidth="24"
                            strokeDasharray={`${dashLen} ${circumference - dashLen}`}
                            strokeDashoffset={-dashOff}
                            transform={`rotate(-90 ${cx} ${cy})`}
                            style={{ transition: 'all 0.8s ease' }}
                          />
                        );
                      });
                    })()}
                    <text x="90" y="85" textAnchor="middle" fill="var(--text-primary)" fontSize="28" fontWeight="800">
                      {totalClients}
                    </text>
                    <text x="90" y="105" textAnchor="middle" fill="var(--text-muted)" fontSize="10">
                      clientes
                    </text>
                  </svg>
                </div>

                {/* Legend */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {top10.map((p, idx) => (
                    <div key={p.status} style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.72rem',
                    }}>
                      <div style={{
                        width: '8px', height: '8px', borderRadius: '50%',
                        background: BAR_COLORS[idx % BAR_COLORS.length], flexShrink: 0,
                      }} />
                      <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{p.status}</span>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{p.count}</span>
                    </div>
                  ))}
                  {statusData.length > 10 && (
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      + {statusData.length - 10} outros status
                    </div>
                  )}
                </div>
              </div>

              {/* Bar Chart */}
              <div style={{
                background: 'var(--card-bg)', border: '1px solid var(--card-border)',
                borderRadius: '1rem', padding: '1.5rem',
              }}>
                <h3 style={{
                  fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)',
                  margin: '0 0 1.25rem', textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  Top 10 Status
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {top10.map((p, idx) => (
                    <div key={p.status}>
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        marginBottom: '0.2rem',
                      }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                          {p.status}
                        </span>
                        <span style={{
                          fontSize: '0.75rem', fontWeight: 800,
                          color: BAR_COLORS[idx % BAR_COLORS.length],
                        }}>
                          {p.count}
                        </span>
                      </div>
                      <div style={{
                        background: 'rgba(255,255,255,0.04)', borderRadius: '999px',
                        height: '6px', overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%', borderRadius: '999px',
                          background: `linear-gradient(90deg, ${BAR_COLORS[idx % BAR_COLORS.length]}88, ${BAR_COLORS[idx % BAR_COLORS.length]})`,
                          width: `${(p.count / maxCount) * 100}%`,
                          transition: 'width 0.8s ease',
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Loading */}
          {dashLoading && (
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: '1.5rem', marginTop: '1.5rem',
            }}>
              <div className="shimmer" style={{ height: '350px', borderRadius: '1rem' }} />
              <div className="shimmer" style={{ height: '350px', borderRadius: '1rem' }} />
            </div>
          )}
        </div>

      {/* ======================== INICIAIS (DRIVE) ======================== */}
      <div style={{ marginTop: '2.5rem' }}>
        <h2 style={{
          fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)',
          margin: '0 0 0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          📝 Fila de Petições Iniciais
        </h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 1.5rem' }}>
          Dados em tempo real do Google Drive — atualiza automaticamente quando pastas são adicionadas ou removidas
        </p>

        {/* Total geral */}
        {!iniciaisLoading && !iniciaisError && (
          <div style={{
            background: 'rgba(14, 14, 20, 0.5)',
            backdropFilter: 'blur(30px)',
            WebkitBackdropFilter: 'blur(30px)',
            border: '1px solid rgba(212, 175, 55, 0.12)',
            borderRadius: '1rem',
            padding: '1.25rem 1.5rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #D4AF37, #C5A059)',
              color: 'white', fontWeight: 900, fontSize: '1.5rem',
              minWidth: '50px', height: '50px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(212, 175, 55, 0.3)',
            }}>
              {totalIniciais}
            </div>
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Petições Iniciais em Andamento
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Total entre {lawyers.length} advogados — {lawyers.map(l => l.name).join(', ')}
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {iniciaisError && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '0.75rem',
            padding: '1rem 1.25rem',
            color: '#fca5a5',
            fontSize: '0.85rem',
            marginBottom: '1rem',
          }}>
            ⚠️ {iniciaisError}
          </div>
        )}

        {/* Loading */}
        {iniciaisLoading && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '1rem',
          }}>
            {[1,2,3,4].map(i => (
              <div key={i} className="shimmer" style={{ height: '200px', borderRadius: '1rem' }} />
            ))}
          </div>
        )}

        {/* Lawyer Cards */}
        {!iniciaisLoading && !iniciaisError && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '1rem',
          }}>
            {lawyers.map((lawyer) => {
              const color = getLawyerColor(lawyer.name);
              const isExpanded = expandedLawyer === lawyer.name;

              return (
                <div
                  key={lawyer.name}
                  style={{
                    background: 'rgba(14, 14, 20, 0.5)',
                    backdropFilter: 'blur(30px)',
                    WebkitBackdropFilter: 'blur(30px)',
                    border: `1px solid ${color}25`,
                    borderLeft: `4px solid ${color}`,
                    borderRadius: '1rem',
                    overflow: 'hidden',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {/* Lawyer Header */}
                  <div
                    onClick={() => setExpandedLawyer(isExpanded ? null : lawyer.name)}
                    style={{
                      padding: '1.25rem',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{
                        background: color, color: 'white', fontWeight: 800,
                        width: '42px', height: '42px', borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.85rem',
                        boxShadow: `0 2px 12px ${color}40`,
                      }}>
                        {lawyer.totalItems}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                          {lawyer.name}
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                          {lawyer.statuses.map(s => (
                            <span key={s.statusId} style={{
                              fontSize: '0.7rem',
                              color: STATUS_COLORS[s.statusId] || 'var(--text-muted)',
                              fontWeight: 600,
                            }}>
                              {s.items.length} {s.statusLabel.split(' ').slice(1).join(' ')}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div style={{ borderTop: `1px solid ${color}15`, padding: '0 1.25rem 1.25rem' }}>
                      {lawyer.statuses.map(s => (
                        <div key={s.statusId} style={{ marginTop: '1rem' }}>
                          <div style={{
                            fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase',
                            color: STATUS_COLORS[s.statusId] || 'var(--text-muted)',
                            letterSpacing: '0.05em', marginBottom: '0.5rem',
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                          }}>
                            {s.statusLabel}
                            <span style={{
                              background: `${STATUS_COLORS[s.statusId] || '#666'}20`,
                              padding: '0.1rem 0.5rem',
                              borderRadius: '1rem',
                              fontSize: '0.7rem',
                            }}>
                              {s.items.length}
                            </span>
                          </div>
                          {s.items.length === 0 ? (
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                              Nenhum item
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              {/* Table header */}
                              <div style={{
                                display: 'grid', gridTemplateColumns: '1fr auto 1fr',
                                gap: '0.5rem', padding: '0.3rem 0.5rem',
                                fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 700,
                                color: 'var(--text-muted)', letterSpacing: '0.04em',
                                borderBottom: '1px solid rgba(255,255,255,0.06)',
                              }}>
                                <span>Cliente</span>
                                <span>Prescrição</span>
                                <span>Empresa</span>
                              </div>
                              {s.items.map((item, idx) => {
                                const parsed = parseInicialName(item.name);
                                return (
                                  <div key={idx} style={{
                                    display: 'grid', gridTemplateColumns: '1fr auto 1fr',
                                    gap: '0.5rem',
                                    fontSize: '0.8rem',
                                    padding: '0.4rem 0.5rem',
                                    background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                                    borderRadius: '0.3rem',
                                    alignItems: 'center',
                                  }}>
                                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                      {parsed.cliente}
                                    </span>
                                    <span style={{
                                      fontSize: '0.7rem',
                                      color: parsed.prescricao ? '#f59e0b' : 'var(--text-muted)',
                                      fontFamily: 'monospace',
                                      fontWeight: 600,
                                      background: parsed.prescricao ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                                      padding: parsed.prescricao ? '0.1rem 0.4rem' : '0',
                                      borderRadius: '0.3rem',
                                      whiteSpace: 'nowrap',
                                    }}>
                                      {parsed.prescricao || '—'}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                      {parsed.empresa || '—'}
                                    </span>
                                  </div>
                                );
                              })}
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
        )}
      </div>

      {/* ====================== BOLIVAR SYNC ========================= */}
      <div style={{ marginTop: '2.5rem' }}>
        <h2 style={{
          fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)',
          margin: '0 0 0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          🔄 Sincronização Bolivar
        </h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 1rem' }}>
          Compara a pasta do Drive com a planilha — identifica quem saiu do Bolivar
        </p>

        {!syncData && !syncLoading && (
          <button
            onClick={async () => {
              setSyncLoading(true); setSyncError(null);
              try {
                const res = await fetch('/api/bolivar-sync');
                if (res.ok) {
                  const data = await res.json();
                  setSyncData(data);
                  if (data.debug) setSyncError(data.debug);
                }
                else { const e = await res.json().catch(() => ({})); setSyncError(e.error || 'Erro'); }
              } catch { setSyncError('Erro de conexão'); }
              finally { setSyncLoading(false); }
            }}
            style={{
              background: 'linear-gradient(135deg, #D4AF37, #C5A059)',
              color: '#000', fontWeight: 700, fontSize: '0.9rem',
              padding: '0.75rem 1.5rem', borderRadius: '0.75rem',
              border: 'none', cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(212, 175, 55, 0.3)',
            }}
          >
            🔍 Analisar Diferenças (Bolivar)
          </button>
        )}

        {syncLoading && (
          <div className="shimmer" style={{ width: '100%', height: '150px', borderRadius: '1rem' }} />
        )}

        {syncError && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '0.75rem', padding: '1rem 1.25rem', color: '#fca5a5', fontSize: '0.85rem',
          }}>
            ⚠️ {syncError}
          </div>
        )}

        {syncData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
              <div style={{
                background: 'rgba(14, 14, 20, 0.5)', backdropFilter: 'blur(30px)',
                border: '1px solid rgba(34, 197, 94, 0.2)', borderRadius: '0.75rem',
                padding: '1rem', textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#22c55e' }}>{syncData.kept.length}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>✅ Confirmados no Drive</div>
              </div>
              <div style={{
                background: 'rgba(14, 14, 20, 0.5)', backdropFilter: 'blur(30px)',
                border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '0.75rem',
                padding: '1rem', textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#ef4444' }}>{syncData.missing.length}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>❌ Não encontrados no Drive</div>
              </div>
              {syncData.extraInDrive.length > 0 && (
                <div style={{
                  background: 'rgba(14, 14, 20, 0.5)', backdropFilter: 'blur(30px)',
                  border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '0.75rem',
                  padding: '1rem', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#f59e0b' }}>{syncData.extraInDrive.length}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>⚠️ No Drive mas não na planilha</div>
                </div>
              )}
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Planilha: {syncData.totalSpreadsheet} com status BOLIVAR | Drive: {syncData.totalDrive} pastas
            </div>

            {/* Missing list */}
            {syncData.missing.length > 0 && (
              <div style={{
                background: 'rgba(14, 14, 20, 0.4)', borderRadius: '0.75rem',
                border: '1px solid rgba(239, 68, 68, 0.15)', padding: '1rem',
              }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ef4444', marginBottom: '0.5rem' }}>
                  ❌ Na planilha como BOLIVAR mas NÃO estão mais na pasta do Drive:
                </div>
                {syncData.missing.map((d, i) => (
                  <div key={i} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '0.25rem 0' }}>
                    • {d.nome} <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>(linha {d.row})</span>
                  </div>
                ))}
              </div>
            )}

            {/* Extra in Drive */}
            {syncData.extraInDrive.length > 0 && (
              <div style={{
                background: 'rgba(14, 14, 20, 0.4)', borderRadius: '0.75rem',
                border: '1px solid rgba(245, 158, 11, 0.15)', padding: '1rem',
              }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f59e0b', marginBottom: '0.5rem' }}>
                  ⚠️ No Drive mas sem registro na planilha:
                </div>
                {syncData.extraInDrive.map((name, i) => (
                  <div key={i} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '0.25rem 0' }}>
                    • {name}
                  </div>
                ))}
              </div>
            )}

            {/* Apply: update missing ones to DISTRIBUIDO */}
            {!syncApplied && syncData.missing.length > 0 && (
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  disabled={applyingSync}
                  onClick={async () => {
                    setApplyingSync(true);
                    try {
                      const updates = syncData.missing.map(d => ({ row: d.row, newStatus: 'DISTRIBUIDO' }));
                      const res = await fetch('/api/bolivar-sync', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ updates }),
                      });
                      if (res.ok) setSyncApplied(true);
                      else { const e = await res.json().catch(() => ({})); setSyncError(e.error || 'Erro'); }
                    } catch { setSyncError('Erro de conexão'); }
                    finally { setApplyingSync(false); }
                  }}
                  style={{
                    background: applyingSync ? '#555' : 'linear-gradient(135deg, #22c55e, #16a34a)',
                    color: 'white', fontWeight: 700, fontSize: '0.85rem',
                    padding: '0.6rem 1.25rem', borderRadius: '0.6rem',
                    border: 'none', cursor: applyingSync ? 'wait' : 'pointer',
                  }}
                >
                  {applyingSync ? '⏳ Aplicando...' : `✅ Marcar ${syncData.missing.length} como DISTRIBUÍDO`}
                </button>
                <button
                  onClick={() => { setSyncData(null); setSyncApplied(false); }}
                  style={{
                    background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)',
                    fontWeight: 600, fontSize: '0.85rem',
                    padding: '0.6rem 1.25rem', borderRadius: '0.6rem',
                    border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
                  }}
                >
                  ❌ Cancelar
                </button>
              </div>
            )}

            {syncApplied && (
              <div style={{
                background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: '0.75rem', padding: '1rem', color: '#86efac', fontSize: '0.85rem',
              }}>
                ✅ Planilha atualizada! Recarregue o Dashboard para ver os novos números.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ====================== INICIAIS SYNC ========================= */}
      <div style={{ marginTop: '2.5rem' }}>
        <h2 style={{
          fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)',
          margin: '0 0 0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          📋 Sincronização FAZER INICIAL
        </h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 1rem' }}>
          Compara as pastas dos advogados (Alessandra, Eliton, Jamille, Jessé) com a planilha
        </p>

        {!iniciaisData && !iniciaisSyncLoading && (
          <button
            onClick={async () => {
              setIniciaisSyncLoading(true); setIniciaisSyncError(null);
              try {
                const res = await fetch('/api/iniciais-sync');
                if (res.ok) {
                  const data = await res.json();
                  setIniciaisData(data);
                  if (data.error) setIniciaisSyncError(data.error);
                } else {
                  const e = await res.json().catch(() => ({}));
                  setIniciaisSyncError(e.error || 'Erro');
                }
              } catch { setIniciaisSyncError('Erro de conexão'); }
              finally { setIniciaisSyncLoading(false); }
            }}
            style={{
              background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)',
              color: '#fff', fontWeight: 700, fontSize: '0.9rem',
              padding: '0.75rem 1.5rem', borderRadius: '0.75rem',
              border: 'none', cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(139, 92, 246, 0.3)',
            }}
          >
            🔍 Analisar Diferenças (FAZER INICIAL)
          </button>
        )}

        {iniciaisSyncLoading && (
          <div className="shimmer" style={{ width: '100%', height: '150px', borderRadius: '1rem' }} />
        )}

        {iniciaisSyncError && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '0.75rem', padding: '1rem 1.25rem', color: '#fca5a5', fontSize: '0.85rem',
          }}>
            ⚠️ {iniciaisSyncError}
          </div>
        )}

        {iniciaisData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
              <div style={{
                background: 'rgba(14, 14, 20, 0.5)', backdropFilter: 'blur(30px)',
                border: '1px solid rgba(34, 197, 94, 0.2)', borderRadius: '0.75rem',
                padding: '1rem', textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#22c55e' }}>{iniciaisData.alreadyCorrect.length}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>✅ Já estão FAZER INICIAL</div>
              </div>
              <div style={{
                background: 'rgba(14, 14, 20, 0.5)', backdropFilter: 'blur(30px)',
                border: '1px solid rgba(139, 92, 246, 0.2)', borderRadius: '0.75rem',
                padding: '1rem', textAlign: 'center',
              }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#8B5CF6' }}>{iniciaisData.needsUpdate.length}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>📝 Precisam atualizar</div>
              </div>
              {iniciaisData.notInSheet.length > 0 && (
                <div style={{
                  background: 'rgba(14, 14, 20, 0.5)', backdropFilter: 'blur(30px)',
                  border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '0.75rem',
                  padding: '1rem', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#f59e0b' }}>{iniciaisData.notInSheet.length}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>⚠️ Não encontrados na planilha</div>
                </div>
              )}
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Drive: {iniciaisData.totalDrive} processos com advogados ({iniciaisData.totalLawyers.join(', ')})
            </div>

            {/* Needs update list */}
            {iniciaisData.needsUpdate.length > 0 && (
              <div style={{
                background: 'rgba(14, 14, 20, 0.4)', borderRadius: '0.75rem',
                border: '1px solid rgba(139, 92, 246, 0.15)', padding: '1rem',
                maxHeight: '300px', overflowY: 'auto',
              }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#8B5CF6', marginBottom: '0.5rem' }}>
                  📝 Serão atualizados para FAZER INICIAL (status atual diferente):
                </div>
                {iniciaisData.needsUpdate.map((d, i) => (
                  <div key={i} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '0.25rem 0' }}>
                    • {d.nome} <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>({d.lawyer} | atual: {d.currentStatus} | linha {d.row})</span>
                  </div>
                ))}
              </div>
            )}

            {/* Not in sheet */}
            {iniciaisData.notInSheet.length > 0 && (
              <div style={{
                background: 'rgba(14, 14, 20, 0.4)', borderRadius: '0.75rem',
                border: '1px solid rgba(245, 158, 11, 0.15)', padding: '1rem',
                maxHeight: '200px', overflowY: 'auto',
              }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f59e0b', marginBottom: '0.5rem' }}>
                  ⚠️ No Drive mas não encontrados na planilha:
                </div>
                {iniciaisData.notInSheet.map((d, i) => (
                  <div key={i} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '0.25rem 0' }}>
                    • {d.nome} <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>({d.lawyer})</span>
                  </div>
                ))}
              </div>
            )}

            {/* Apply button */}
            {!iniciaisApplied && iniciaisData.needsUpdate.length > 0 && (
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  disabled={applyingIniciais}
                  onClick={async () => {
                    setApplyingIniciais(true);
                    try {
                      const updates = iniciaisData.needsUpdate.map(d => ({ row: d.row }));
                      const res = await fetch('/api/iniciais-sync', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ updates }),
                      });
                      if (res.ok) setIniciaisApplied(true);
                      else { const e = await res.json().catch(() => ({})); setIniciaisSyncError(e.error || 'Erro'); }
                    } catch { setIniciaisSyncError('Erro de conexão'); }
                    finally { setApplyingIniciais(false); }
                  }}
                  style={{
                    background: applyingIniciais ? '#555' : 'linear-gradient(135deg, #8B5CF6, #7C3AED)',
                    color: 'white', fontWeight: 700, fontSize: '0.85rem',
                    padding: '0.6rem 1.25rem', borderRadius: '0.6rem',
                    border: 'none', cursor: applyingIniciais ? 'wait' : 'pointer',
                  }}
                >
                  {applyingIniciais ? '⏳ Aplicando...' : `✅ Marcar ${iniciaisData.needsUpdate.length} como FAZER INICIAL`}
                </button>
                <button
                  onClick={() => { setIniciaisData(null); setIniciaisApplied(false); }}
                  style={{
                    background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)',
                    fontWeight: 600, fontSize: '0.85rem',
                    padding: '0.6rem 1.25rem', borderRadius: '0.6rem',
                    border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
                  }}
                >
                  ❌ Cancelar
                </button>
              </div>
            )}

            {iniciaisApplied && (
              <div style={{
                background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: '0.75rem', padding: '1rem', color: '#86efac', fontSize: '0.85rem',
              }}>
                ✅ Planilha atualizada! Recarregue o Dashboard para ver os novos números.
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
