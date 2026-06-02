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

  // Metrics
  const [metricsData, setMetricsData] = useState<any>({ 
    novosClientes: { count: 0, items: [] }, 
    distribuidos: { count: 0, items: [] } 
  });
  const [metricsLoading, setMetricsLoading] = useState(true);
  
  // Modals
  const [selectedMetric, setSelectedMetric] = useState<'novosClientes' | 'distribuidos' | null>(null);

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

  // Fetch dashboard and metrics on mount
  useEffect(() => {
    fetchDashboardData();
    
    // Fetch metrics independently
    const fetchMetrics = async () => {
      setMetricsLoading(true);
      try {
        const res = await fetch('/api/dashboard/metrics');
        if (res.ok) {
          const data = await res.json();
          setMetricsData({
            novosClientes: data.novosClientes || { count: 0, items: [] },
            distribuidos: data.distribuidos || { count: 0, items: [] }
          });
        }
      } catch { /* ignore */ }
      finally { setMetricsLoading(false); }
    };
    
    fetchMetrics();
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

          {/* Stats Cards - New Metrics */}
          <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div 
              className="stat-card" 
              onClick={() => !metricsLoading && setSelectedMetric('novosClientes')}
              style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '1rem', padding: '1.25rem', display: 'flex', flexDirection: 'column', cursor: 'pointer', transition: 'transform 0.2s' }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <div className="stat-card-label" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                Novos Clientes (Mês)
                <span style={{ fontSize: '0.7rem', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', padding: '2px 6px', borderRadius: '10px' }}>Ver Lista</span>
              </div>
              <div className="stat-card-value" style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f59e0b' }}>
                {metricsLoading ? '—' : metricsData.novosClientes.count}
              </div>
            </div>
            
            <div 
              className="stat-card" 
              onClick={() => !metricsLoading && setSelectedMetric('distribuidos')}
              style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '1rem', padding: '1.25rem', display: 'flex', flexDirection: 'column', cursor: 'pointer', transition: 'transform 0.2s' }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <div className="stat-card-label" style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                Distribuídos (Mês)
                <span style={{ fontSize: '0.7rem', color: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)', padding: '2px 6px', borderRadius: '10px' }}>Ver Lista</span>
              </div>
              <div className="stat-card-value" style={{ fontSize: '1.8rem', fontWeight: 800, color: '#3b82f6' }}>
                {metricsLoading ? '—' : metricsData.distribuidos.count}
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
      
      {/* Metrics Detail Modal */}
      {selectedMetric && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: '1rem'
        }} onClick={() => setSelectedMetric(null)}>
          <div style={{
            background: 'var(--card-bg)', border: '1px solid var(--card-border)',
            borderRadius: '1rem', padding: '2rem', width: '100%', maxWidth: '600px',
            maxHeight: '80vh', overflowY: 'auto', position: 'relative'
          }} onClick={e => e.stopPropagation()}>
            <button 
              onClick={() => setSelectedMetric(null)}
              style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
            >
              ✕
            </button>
            <h2 style={{ margin: '0 0 1.5rem', color: 'var(--text-primary)', fontSize: '1.25rem', fontWeight: 800 }}>
              {selectedMetric === 'novosClientes' ? 'Novos Clientes neste Mês' : 'Processos Distribuídos neste Mês'}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {metricsData[selectedMetric]?.items.map((item: any) => (
                <div key={item.id} style={{
                  padding: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)',
                  borderRadius: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{item.name}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    {new Date(item.createdTime).toLocaleDateString('pt-BR')}
                  </div>
                </div>
              ))}
              {metricsData[selectedMetric]?.items.length === 0 && (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>
                  Nenhum registro encontrado neste mês.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
}
