'use client';

import { useState, useEffect } from 'react';

const BAR_COLORS = [
  '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
  '#06b6d4', '#a855f7', '#eab308', '#22c55e', '#e11d48',
];

interface StatusData {
  status: string;
  count: number;
}

interface YearData {
  year: string;
  count: number;
  processos: Array<{ id: string; name: string; createdTime: string }>;
}

interface MonthData {
  month: number;
  monthName: string;
  count: number;
}

export default function DashboardPage() {
  const [totalClients, setTotalClients] = useState(0);
  const [statusData, setStatusData] = useState<StatusData[]>([]);
  const [dashLoading, setDashLoading] = useState(true);

  const [metricsData, setMetricsData] = useState<any>({
    novosClientesMes: { count: 0, items: [] },
    novosClientesAno: { count: 0, items: [] },
  });
  const [distribuicaoPorAno, setDistribuicaoPorAno] = useState<YearData[]>([]);
  const [distribuicaoPorMes, setDistribuicaoPorMes] = useState<MonthData[]>([]);
  const [totalDistribuidos, setTotalDistribuidos] = useState(0);
  const [metricsLoading, setMetricsLoading] = useState(true);

  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);

  const [autoSyncState, setAutoSyncState] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [autoSyncMessage, setAutoSyncMessage] = useState('');

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

  useEffect(() => {
    fetchDashboardData();

    const fetchMetrics = async () => {
      setMetricsLoading(true);
      try {
        const res = await fetch('/api/dashboard/metrics');
        if (res.ok) {
          const data = await res.json();
          setMetricsData({
            novosClientesMes: data.novosClientesMes || { count: 0, items: [] },
            novosClientesAno: data.novosClientesAno || { count: 0, items: [] },
          });
          setDistribuicaoPorAno(data.distribuicaoPorAno || []);
          setDistribuicaoPorMes(data.distribuicaoPorMes || []);
          setTotalDistribuidos(data.totalDistribuidos || 0);
        }
      } catch { /* ignore */ }
      finally { setMetricsLoading(false); }
    };

    fetchMetrics();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-Sync
  useEffect(() => {
    let isMounted = true;
    async function runAutoSync() {
      if (!isMounted) return;
      setAutoSyncState('running');
      setAutoSyncMessage('Verificando alterações no Drive...');
      try {
        let appliedCount = 0;
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
          if (appliedCount > 0) fetchDashboardData();
          setTimeout(() => { if (isMounted) setAutoSyncState('idle'); }, 5000);
        }
      } catch {
        if (isMounted) {
          setAutoSyncState('error');
          setAutoSyncMessage('Erro na sincronização automática.');
        }
      }
    }
    const timer = setTimeout(runAutoSync, 1000);
    return () => { isMounted = false; clearTimeout(timer); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const top10 = statusData
    .filter(s => {
      const upper = s.status.toUpperCase();
      return upper.includes('BOLIVAR') || upper.includes('PREJUIZO') || upper.includes('PREJUÍZO') || upper.includes('FAZER INICIAL');
    })
    .slice(0, 10);

  const novosClientesMesCount = metricsData.novosClientesMes?.count || 0;
  const novosClientesAnoCount = metricsData.novosClientesAno?.count || 0;
  const novosClientesGoal = 200;
  const novosClientesAnoGoal = 2400;

  const getDonutProps = (count: number, goal: number, color: string) => {
    const cx = 80, cy = 80, r = 60;
    const circumference = 2 * Math.PI * r;
    const pct = Math.min(count / goal, 1);
    const dashLen = pct * circumference;
    return { cx, cy, r, circumference, dashLen, color };
  };

  const donutNovosMes = getDonutProps(novosClientesMesCount, novosClientesGoal, '#f59e0b');
  const donutNovosAno = getDonutProps(novosClientesAnoCount, novosClientesAnoGoal, '#ef4444');

  return (
    <div className="detail-page" style={{ paddingTop: '1rem' }}>
      <div style={{ marginTop: '1rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
            fontSize: '0.85rem', fontWeight: 600, animation: 'fadeIn 0.3s ease-out'
          }}>
            {autoSyncState === 'running' && (
              <div style={{ width: '16px', height: '16px', border: '2px solid #60a5fa', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            )}
            {autoSyncState === 'success' && '✨ '}
            {autoSyncState === 'error' && '⚠️ '}
            {autoSyncMessage}
          </div>
        )}

        {/* ══════════════════ ENTRADAS (BOLIVAR) ══════════════════ */}
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1rem' }}>📥 Entradas (Bolivar)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>

          {/* Novos Clientes Mês */}
          <div
            className="stat-card"
            onClick={() => !metricsLoading && setSelectedMetric('novosClientesMes')}
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '1rem', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1.5rem', cursor: 'pointer', transition: 'transform 0.2s' }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div style={{ position: 'relative', width: '100px', height: '100px' }}>
              <svg width="100" height="100" viewBox="0 0 160 160">
                <circle cx={donutNovosMes.cx} cy={donutNovosMes.cy} r={donutNovosMes.r} fill="none" stroke="rgba(245, 158, 11, 0.15)" strokeWidth="18" />
                <circle cx={donutNovosMes.cx} cy={donutNovosMes.cy} r={donutNovosMes.r} fill="none" stroke={donutNovosMes.color} strokeWidth="18" strokeDasharray={`${donutNovosMes.dashLen} ${donutNovosMes.circumference - donutNovosMes.dashLen}`} strokeDashoffset={0} strokeLinecap="round" transform={`rotate(-90 ${donutNovosMes.cx} ${donutNovosMes.cy})`} style={{ transition: 'all 0.8s ease' }} />
              </svg>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>{metricsLoading ? '—' : novosClientesMesCount}</span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Novos Clientes (Mês)</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Meta: {novosClientesGoal}</div>
              <div style={{ fontSize: '0.7rem', color: donutNovosMes.color, background: 'rgba(245, 158, 11, 0.1)', padding: '2px 8px', borderRadius: '10px', display: 'inline-block', marginTop: '0.5rem' }}>Ver Lista</div>
            </div>
          </div>

          {/* Entrada Anual */}
          <div
            className="stat-card"
            onClick={() => !metricsLoading && setSelectedMetric('novosClientesAno')}
            style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '1rem', padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1.5rem', cursor: 'pointer', transition: 'transform 0.2s' }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div style={{ position: 'relative', width: '100px', height: '100px' }}>
              <svg width="100" height="100" viewBox="0 0 160 160">
                <circle cx={donutNovosAno.cx} cy={donutNovosAno.cy} r={donutNovosAno.r} fill="none" stroke="rgba(239, 68, 68, 0.15)" strokeWidth="18" />
                <circle cx={donutNovosAno.cx} cy={donutNovosAno.cy} r={donutNovosAno.r} fill="none" stroke={donutNovosAno.color} strokeWidth="18" strokeDasharray={`${donutNovosAno.dashLen} ${donutNovosAno.circumference - donutNovosAno.dashLen}`} strokeDashoffset={0} strokeLinecap="round" transform={`rotate(-90 ${donutNovosAno.cx} ${donutNovosAno.cy})`} style={{ transition: 'all 0.8s ease' }} />
              </svg>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>{metricsLoading ? '—' : novosClientesAnoCount}</span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Entrada Anual</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Meta: {novosClientesAnoGoal}</div>
              <div style={{ fontSize: '0.7rem', color: donutNovosAno.color, background: 'rgba(239, 68, 68, 0.1)', padding: '2px 8px', borderRadius: '10px', display: 'inline-block', marginTop: '0.5rem' }}>Ver Lista</div>
            </div>
          </div>
        </div>

        {/* ══════════════════ GRÁFICO MENSAL 2026 (Barras Verticais) ══════════════════ */}
        {!metricsLoading && distribuicaoPorMes.length > 0 && (() => {
          const maxMonthCount = Math.max(...distribuicaoPorMes.map(m => m.count), 1);
          const totalMes2026 = distribuicaoPorMes.reduce((s, m) => s + m.count, 0);
          const BAR_COLOR = '#3b82f6';
          const chartHeight = 220;
          const MONTH_SHORT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
          const gridLines = 4;
          const gridStep = Math.ceil(maxMonthCount / gridLines);
          const gridValues = Array.from({ length: gridLines + 1 }, (_, i) => i * gridStep);

          return (
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1rem' }}>
                📅 Processos Distribuídos por Mês — 2026
              </h3>

              <div style={{
                background: 'var(--card-bg)', border: '1px solid var(--card-border)',
                borderRadius: '1rem', padding: '1.5rem',
              }}>
                <div style={{ display: 'flex', gap: '0', height: `${chartHeight + 50}px` }}>
                  {/* Eixo Y */}
                  <div style={{
                    display: 'flex', flexDirection: 'column-reverse', justifyContent: 'space-between',
                    height: `${chartHeight}px`, paddingRight: '0.5rem', minWidth: '30px',
                  }}>
                    {gridValues.map(v => (
                      <span key={v} style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textAlign: 'right' }}>{v}</span>
                    ))}
                  </div>

                  {/* Barras */}
                  <div style={{ flex: 1, display: 'flex', position: 'relative' }}>
                    {/* Grid lines */}
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: `${chartHeight}px`,
                      display: 'flex', flexDirection: 'column-reverse', justifyContent: 'space-between',
                      pointerEvents: 'none',
                    }}>
                      {gridValues.map(v => (
                        <div key={v} style={{ width: '100%', height: '1px', background: 'rgba(255,255,255,0.06)' }} />
                      ))}
                    </div>

                    {/* Barras verticais */}
                    <div style={{
                      display: 'flex', alignItems: 'flex-end', gap: '4px',
                      width: '100%', height: `${chartHeight}px`,
                    }}>
                      {distribuicaoPorMes.map((m) => {
                        const barHeight = Math.max(2, (m.count / (gridStep * gridLines || 1)) * chartHeight);
                        return (
                          <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: BAR_COLOR }}>{m.count}</span>
                            <div style={{
                              width: '100%', maxWidth: '40px', height: `${barHeight}px`,
                              background: BAR_COLOR, borderRadius: '4px 4px 0 0',
                              transition: 'height 0.8s ease',
                            }} />
                          </div>
                        );
                      })}
                    </div>

                    {/* Labels meses */}
                    <div style={{
                      position: 'absolute', bottom: '-25px', left: 0, right: 0,
                      display: 'flex', gap: '4px',
                    }}>
                      {distribuicaoPorMes.map((m) => (
                        <div key={m.month} style={{
                          flex: 1, textAlign: 'center',
                          fontSize: '0.55rem', fontWeight: 700, color: 'var(--text-muted)',
                        }}>
                          {MONTH_SHORT[m.month - 1]}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Total 2026 */}
                <div style={{
                  marginTop: '1.5rem', paddingTop: '1rem',
                  borderTop: '1px solid var(--card-border)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>Total Distribuídos em 2026</span>
                  <span style={{ fontSize: '1.3rem', fontWeight: 900, color: BAR_COLOR }}>{totalMes2026}</span>
                </div>
              </div>
            </div>
          );
        })()}

        {metricsLoading && (
          <div style={{ marginBottom: '2rem' }}>
            <div className="shimmer" style={{ height: '300px', borderRadius: '1rem' }} />
          </div>
        )}

        {/* Donut Chart - Status */}
        {!dashLoading && statusData.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem' }}>
            <div style={{
              background: 'var(--card-bg)', border: '1px solid var(--card-border)',
              borderRadius: '1rem', padding: '1.5rem', width: '100%', maxWidth: '500px'
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
                        <circle key={p.status} cx={cx} cy={cy} r={r} fill="none"
                          stroke={BAR_COLORS[idx % BAR_COLORS.length]} strokeWidth="24"
                          strokeDasharray={`${dashLen} ${circumference - dashLen}`}
                          strokeDashoffset={-dashOff}
                          transform={`rotate(-90 ${cx} ${cy})`}
                          style={{ transition: 'all 0.8s ease' }}
                        />
                      );
                    });
                  })()}
                  <text x="90" y="85" textAnchor="middle" fill="var(--text-primary)" fontSize="28" fontWeight="800">
                    {totalDistribuidos}
                  </text>
                  <text x="90" y="105" textAnchor="middle" fill="var(--text-muted)" fontSize="10">
                    processos
                  </text>
                </svg>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {top10.map((p, idx) => (
                  <div key={p.status} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.72rem' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: BAR_COLORS[idx % BAR_COLORS.length], flexShrink: 0 }} />
                    <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{p.status}</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{p.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {dashLoading && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '1.5rem' }}>
            <div className="shimmer" style={{ height: '350px', borderRadius: '1rem' }} />
            <div className="shimmer" style={{ height: '350px', borderRadius: '1rem' }} />
          </div>
        )}

        {/* ══════════════════ TOTAIS POR ANO (simples) ══════════════════ */}
        {!metricsLoading && distribuicaoPorAno.length > 0 && (
          <div style={{
            background: 'var(--card-bg)', border: '1px solid var(--card-border)',
            borderRadius: '0.75rem', padding: '1rem 1.25rem', marginTop: '2rem',
          }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              📊 Total de Processos Distribuídos por Ano
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {distribuicaoPorAno.map((y) => (
                <div key={y.year} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{y.year}</span>
                  <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{y.count}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--card-border)', marginTop: '0.25rem', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#d4af37' }}>Total Geral</span>
                <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#d4af37' }}>{totalDistribuidos}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════ MODAL: Entradas ══════════════════ */}
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
            <button onClick={() => setSelectedMetric(null)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            <h2 style={{ margin: '0 0 1.5rem', color: 'var(--text-primary)', fontSize: '1.25rem', fontWeight: 800 }}>
              {selectedMetric === 'novosClientesMes' && 'Novos Clientes (Mês)'}
              {selectedMetric === 'novosClientesAno' && 'Entrada Anual'}
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
                  Nenhum registro encontrado neste período.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
