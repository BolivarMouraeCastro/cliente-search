'use client';

import { useState, useEffect, useCallback } from 'react';

interface Hearing {
  dataAudiencia: string;
  horario: string;
  reclamante: string;
  reclamada: string;
  numeroProcesso: string;
  orgaoJulgador: string;
  tipoAudiencia: string;
  advogado: string;
  isFuture: boolean;
}

function parseDateBR(dateStr: string): Date | null {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  let year = parseInt(parts[2], 10);
  if (year < 100) year += 2000;
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  return new Date(year, month, day);
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDateBR(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatFullDateBR(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

const DAYS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX'];

function getTypeColor(tipo: string): string {
  const t = tipo.toUpperCase();
  if (t.includes('CONCILIA')) return '#f59e0b';
  if (t.includes('INSTRU')) return '#6366f1';
  if (t.includes('JULGA')) return '#ef4444';
  if (t.includes('PERICI')) return '#8b5cf6';
  return '#10b981';
}

export default function AgendaPublicaPage() {
  const [hearings, setHearings] = useState<Hearing[]>([]);
  const [advogados, setAdvogados] = useState<string[]>([]);
  const [selectedAdvogado, setSelectedAdvogado] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  // A partir de sábado 00h, mostra a semana que vem automaticamente
  const [weekStart] = useState(() => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=dom, 6=sab
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      // Sábado ou Domingo → mostra próxima semana (segunda que vem)
      const nextMonday = new Date(now);
      const daysUntilMonday = dayOfWeek === 0 ? 1 : 2; // dom→+1, sab→+2
      nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);
      nextMonday.setHours(0, 0, 0, 0);
      return nextMonday;
    }
    return getMonday(now);
  });
  const [collapsedDays, setCollapsedDays] = useState<Record<number, boolean>>({});

  const toggleDay = (dayIndex: number) => {
    setCollapsedDays(prev => ({ ...prev, [dayIndex]: !prev[dayIndex] }));
  };

  const fetchHearings = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedAdvogado) params.set('advogado', selectedAdvogado);
      const res = await fetch(`/api/public/agenda?${params}`);
      if (res.ok) {
        const data = await res.json();
        setHearings(data.hearings || []);
        setAdvogados(data.advogados || []);
      }
    } catch (err) {
      console.error('Error loading agenda:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedAdvogado]);

  useEffect(() => {
    fetchHearings();
  }, [fetchHearings]);

  // Group hearings by day of the week
  const weekDays: Date[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    weekDays.push(d);
  }

  const hearingsByDay: Hearing[][] = weekDays.map((day) => {
    return hearings.filter((h) => {
      const hDate = parseDateBR(h.dataAudiencia);
      if (!hDate) return false;
      return (
        hDate.getDate() === day.getDate() &&
        hDate.getMonth() === day.getMonth() &&
        hDate.getFullYear() === day.getFullYear()
      );
    });
  });

  const totalWeek = hearingsByDay.reduce((sum, d) => sum + d.length, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 4);

  // Styles
  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #0a0e1a 0%, #111827 100%)',
    color: '#e5e7eb',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  };

  const headerStyle: React.CSSProperties = {
    background: 'rgba(17, 24, 39, 0.95)',
    borderBottom: '1px solid rgba(212, 175, 55, 0.2)',
    padding: '1.25rem 1.5rem',
    position: 'sticky',
    top: 0,
    zIndex: 10,
    backdropFilter: 'blur(12px)',
  };

  const logoStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '1rem',
  };

  const navStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '0.75rem',
  };

  const navBtnStyle: React.CSSProperties = {
    padding: '0.4rem 0.6rem',
    borderRadius: '0.4rem',
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.05)',
    color: '#e5e7eb',
    cursor: 'pointer',
    fontSize: '0.85rem',
  };

  const filterStyle: React.CSSProperties = {
    padding: '0.5rem 0.75rem',
    borderRadius: '0.5rem',
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.05)',
    color: '#e5e7eb',
    fontSize: '0.8rem',
    minWidth: '180px',
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '0.75rem',
    padding: '1.25rem',
    maxWidth: '1400px',
    margin: '0 auto',
  };

  const dayStyle = (isToday: boolean, isEmpty: boolean): React.CSSProperties => ({
    background: isToday ? 'rgba(212, 175, 55, 0.06)' : 'rgba(255,255,255,0.02)',
    border: isToday ? '1px solid rgba(212, 175, 55, 0.25)' : '1px solid rgba(255,255,255,0.06)',
    borderRadius: '0.75rem',
    overflow: 'hidden',
    opacity: isEmpty ? 0.6 : 1,
  });

  const dayHeaderStyle = (isToday: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 0.85rem',
    background: isToday ? 'rgba(212, 175, 55, 0.1)' : 'rgba(255,255,255,0.03)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    cursor: 'pointer',
    userSelect: 'none',
  });

  const cardStyle = (borderColor: string): React.CSSProperties => ({
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderLeft: `3px solid ${borderColor}`,
    borderRadius: '0.5rem',
    padding: '0.65rem 0.75rem',
    fontSize: '0.78rem',
  });

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={logoStyle}>
          <img
            src="/bmc-logo.png"
            alt="BM&C Advogados"
            style={{ width: '50px', height: '50px', borderRadius: '50%', objectFit: 'cover' }}
          />
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#d4af37' }}>
              Agenda de Audiências
            </div>
            <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
              BM&C Advogados • Atualização em tempo real
            </div>
          </div>
          {totalWeek > 0 && !isLoading && (
            <span style={{
              marginLeft: 'auto',
              padding: '0.25rem 0.75rem',
              borderRadius: '1rem',
              background: 'rgba(212, 175, 55, 0.15)',
              color: '#d4af37',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}>
              {totalWeek} audiência{totalWeek !== 1 ? 's' : ''} na semana
            </span>
          )}
        </div>

        {/* Navigation */}
        <div style={navStyle}>
          <div style={{
            padding: '0.4rem 0.75rem', fontSize: '0.8rem', fontWeight: 600,
            color: '#d4af37', letterSpacing: '0.02em',
          }}>
            📅 Semana: {formatFullDateBR(weekStart)} — {formatFullDateBR(weekEnd)}
          </div>

          {/* Filter */}
          <select
            style={filterStyle}
            value={selectedAdvogado}
            onChange={(e) => setSelectedAdvogado(e.target.value)}
          >
            <option value="">Todos os advogados</option>
            {advogados.map((adv) => (
              <option key={adv} value={adv}>{adv}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#9ca3af' }}>
          <div style={{
            width: '40px', height: '40px', border: '3px solid rgba(212,175,55,0.2)',
            borderTopColor: '#d4af37', borderRadius: '50%', margin: '0 auto 1rem',
            animation: 'spin 1s linear infinite',
          }} />
          Carregando audiências...
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Week grid */}
      {!isLoading && (
        <div style={gridStyle}>
          {weekDays.map((day, i) => {
            const dayHearings = hearingsByDay[i];
            const isToday =
              day.getDate() === new Date().getDate() &&
              day.getMonth() === new Date().getMonth() &&
              day.getFullYear() === new Date().getFullYear();

            return (
              <div key={i} style={dayStyle(isToday, dayHearings.length === 0)}>
                {/* Day header */}
                <div
                  style={dayHeaderStyle(isToday)}
                  onClick={() => toggleDay(i)}
                >
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>{DAYS[i]}</span>
                  <span style={{
                    width: '28px', height: '28px', borderRadius: '50%', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.85rem',
                    background: isToday ? '#d4af37' : 'transparent',
                    color: isToday ? '#111' : '#e5e7eb',
                  }}>
                    {day.getDate()}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>{formatDateBR(day)}</span>
                  {dayHearings.length > 0 && (
                    <span style={{
                      marginLeft: 'auto', fontSize: '0.65rem', padding: '0.15rem 0.4rem',
                      borderRadius: '0.75rem', background: 'rgba(212, 175, 55, 0.15)', color: '#d4af37',
                      fontWeight: 600,
                    }}>
                      {dayHearings.length}
                    </span>
                  )}
                </div>

                {/* Hearing cards */}
                <div style={{
                  display: collapsedDays[i] ? 'none' : 'flex',
                  flexDirection: 'column', gap: '0.4rem', padding: '0.5rem',
                }}>
                  {dayHearings.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#4b5563', padding: '0.75rem', fontSize: '0.75rem' }}>
                      Sem audiências
                    </div>
                  )}
                  {dayHearings.map((h, j) => (
                    <div key={j} style={cardStyle(getTypeColor(h.tipoAudiencia))}>
                      {h.horario && (
                        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#d4af37', marginBottom: '0.25rem' }}>
                          🕐 {h.horario}
                        </div>
                      )}
                      <div style={{ fontWeight: 700, color: '#e5e7eb', marginBottom: '0.2rem' }}>
                        {h.reclamante}
                      </div>
                      {h.reclamada && (
                        <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginBottom: '0.2rem' }}>
                          vs {h.reclamada}
                        </div>
                      )}
                      {h.tipoAudiencia && (
                        <div style={{
                          display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '0.75rem',
                          background: getTypeColor(h.tipoAudiencia) + '22',
                          color: getTypeColor(h.tipoAudiencia),
                          fontSize: '0.65rem', fontWeight: 700, marginBottom: '0.25rem',
                        }}>
                          {h.tipoAudiencia}
                        </div>
                      )}
                      {h.advogado && (
                        <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '0.15rem' }}>
                          👤 {h.advogado}
                        </div>
                      )}
                      {h.orgaoJulgador && (
                        <div style={{ fontSize: '0.68rem', color: '#6b7280', marginTop: '0.1rem' }}>
                          🏛️ {h.orgaoJulgador}
                        </div>
                      )}
                      {h.numeroProcesso && (
                        <div style={{ fontSize: '0.65rem', color: '#4b5563', marginTop: '0.1rem', fontFamily: 'monospace' }}>
                          {h.numeroProcesso}
                        </div>
                      )}
                      {/* WhatsApp button to contact client */}
                      <button
                        onClick={async () => {
                          const msg =
                            `Olá *${h.reclamante}*! 👋\n\n` +
                            `Informamos que sua audiência está agendada:\n\n` +
                            `📅 *Data:* ${h.dataAudiencia}\n` +
                            `🕐 *Horário:* ${h.horario || 'A confirmar'}\n` +
                            (h.tipoAudiencia ? `📋 *Tipo:* ${h.tipoAudiencia}\n` : '') +
                            (h.orgaoJulgador ? `🏛️ *Local:* ${h.orgaoJulgador}\n` : '') +
                            (h.advogado ? `👨‍⚖️ *Advogado responsável:* ${h.advogado}\n` : '') +
                            (h.numeroProcesso ? `📄 *Processo:* ${h.numeroProcesso}\n` : '') +
                            `\nPor favor, confirme o recebimento. Qualquer dúvida, estamos à disposição! 🤝\n\n` +
                            `*BM&C Advogados*`;
                          const encoded = encodeURIComponent(msg);
                          try {
                            const res = await fetch(`/api/public/contatos-lookup?nome=${encodeURIComponent(h.reclamante)}`);
                            const data = await res.json();
                            if (data.found && data.telefone) {
                              window.open(`https://wa.me/${data.telefone}?text=${encoded}`, '_blank');
                            } else {
                              const go = confirm(
                                `Contato "${h.reclamante}" não encontrado nos Contatos.\n\nDeseja enviar sem número?\n(Cadastre o telefone em "Contatos" no painel administrativo)`
                              );
                              if (go) window.open(`https://wa.me/?text=${encoded}`, '_blank');
                            }
                          } catch {
                            window.open(`https://wa.me/?text=${encoded}`, '_blank');
                          }
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.3rem',
                          marginTop: '0.4rem', padding: '0.3rem 0.6rem',
                          borderRadius: '0.4rem', border: 'none',
                          background: 'rgba(37,211,102,0.12)', color: '#25D366',
                          cursor: 'pointer', fontSize: '0.68rem', fontWeight: 600,
                          width: 'fit-content',
                        }}
                      >
                        💬 Avisar Reclamante
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty week */}
      {!isLoading && totalWeek === 0 && (
        <div style={{
          textAlign: 'center', padding: '4rem 1rem', color: '#6b7280',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📅</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#9ca3af' }}>
            Nenhuma audiência nesta semana
          </div>
          <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
            Use as setas para navegar para outras semanas.
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{
        textAlign: 'center', padding: '1.5rem', color: '#4b5563', fontSize: '0.7rem',
        borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: '2rem',
      }}>
        BM&C Advogados • Agenda atualizada em tempo real • {new Date().getFullYear()}
      </div>
    </div>
  );
}
