'use client';

import { useState, useEffect } from 'react';

// Dynamic colors for chart bars
const BAR_COLORS = [
  '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
  '#06b6d4', '#a855f7', '#eab308', '#22c55e', '#e11d48',
];

interface StatusData {
  status: string;
  count: number;
}

export default function DashboardPage() {
  // Dashboard
  const [totalClients, setTotalClients] = useState(0);
  const [statusData, setStatusData] = useState<StatusData[]>([]);
  const [dashLoading, setDashLoading] = useState(true);

  // (Manual sync states removed - using Auto-Sync)

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

      {/* Petições Iniciais removido para rota /iniciais */}
    </div>
  );
}
