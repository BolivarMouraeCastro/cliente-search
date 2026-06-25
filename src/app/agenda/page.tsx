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

interface Pericia {
  data: string;
  horario: string;
  reclamante: string;
  reclamada: string;
  processo: string;
  tipo: string;
  perito: string;
  local: string;
  emailSubject: string;
  emailDate: string;
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

export default function AgendaPage() {
  const [hearings, setHearings] = useState<Hearing[]>([]);
  const [advogados, setAdvogados] = useState<string[]>([]);
  const [selectedAdvogado, setSelectedAdvogado] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [collapsedDays, setCollapsedDays] = useState<Record<number, boolean>>({});
  const [pericias, setPericias] = useState<Pericia[]>([]);
  const [periciasLoading, setPericiasLoading] = useState(true);
  const [collapsedPericiaDays, setCollapsedPericiaDays] = useState<Record<number, boolean>>({});

  const toggleDay = (dayIndex: number) => {
    setCollapsedDays(prev => ({ ...prev, [dayIndex]: !prev[dayIndex] }));
  };

  const togglePericiaDay = (dayIndex: number) => {
    setCollapsedPericiaDays(prev => ({ ...prev, [dayIndex]: !prev[dayIndex] }));
  };

  const fetchHearings = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedAdvogado) params.set('advogado', selectedAdvogado);
      const res = await fetch(`/api/agenda?${params}`);
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

  // Fetch perícias
  useEffect(() => {
    const fetchPericias = async () => {
      setPericiasLoading(true);
      try {
        const res = await fetch('/api/pericias');
        if (res.ok) {
          const data = await res.json();
          setPericias(data.pericias || []);
        }
      } catch (err) {
        console.error('Error loading pericias:', err);
      } finally {
        setPericiasLoading(false);
      }
    };
    fetchPericias();
  }, []);

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

  // Group perícias by day of the week
  const periciasByDay: Pericia[][] = weekDays.map((day) => {
    return pericias.filter((p) => {
      const pDate = parseDateBR(p.data);
      if (!pDate) return false;
      return (
        pDate.getDate() === day.getDate() &&
        pDate.getMonth() === day.getMonth() &&
        pDate.getFullYear() === day.getFullYear()
      );
    });
  });

  const totalPericiaWeek = periciasByDay.reduce((sum, d) => sum + d.length, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 4);

  const goToday = () => setWeekStart(getMonday(new Date()));
  const goPrev = () => {
    const prev = new Date(weekStart);
    prev.setDate(prev.getDate() - 7);
    setWeekStart(prev);
  };
  const goNext = () => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + 7);
    setWeekStart(next);
  };

  const isCurrentWeek =
    getMonday(new Date()).getTime() === weekStart.getTime();

  return (
    <div className="detail-page">
      {/* Header */}
      <div className="agenda-header">
        <div className="agenda-title-row">
          <h1 className="agenda-title">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.5rem' }}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Agenda de Audiências
          </h1>
          {totalWeek > 0 && (
            <span className="agenda-week-total">{totalWeek} audiência{totalWeek !== 1 ? 's' : ''} na semana</span>
          )}
        </div>

        {/* Navigation */}
        <div className="agenda-nav">
          <div className="agenda-nav-btns">
            <button onClick={goPrev} className="agenda-nav-btn" title="Semana anterior">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div className="agenda-nav-label">
              {formatFullDateBR(weekStart)} — {formatFullDateBR(weekEnd)}
            </div>
            <button onClick={goNext} className="agenda-nav-btn" title="Próxima semana">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            {!isCurrentWeek && (
              <button onClick={goToday} className="agenda-today-btn">Hoje</button>
            )}
          </div>

          {/* Filter */}
          <select
            className="agenda-filter"
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
        <div className="agenda-loading">
          <div className="upload-spinner" style={{ width: 32, height: 32 }} />
          <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>Carregando audiências...</p>
        </div>
      )}

      {/* Week grid */}
      {!isLoading && (
        <div className="agenda-grid">
          {weekDays.map((day, i) => {
            const dayHearings = hearingsByDay[i];
            const isToday =
              day.getDate() === new Date().getDate() &&
              day.getMonth() === new Date().getMonth() &&
              day.getFullYear() === new Date().getFullYear();

            return (
              <div key={i} className={`agenda-day ${isToday ? 'today' : ''} ${dayHearings.length === 0 ? 'empty' : ''}`}>
                {/* Day header - clickable to collapse/expand */}
                <div
                  className="agenda-day-header"
                  onClick={() => toggleDay(i)}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  <span className="agenda-day-name">{DAYS[i]}</span>
                  <span className={`agenda-day-number ${isToday ? 'today' : ''}`}>
                    {day.getDate()}
                  </span>
                  <span className="agenda-day-month">{formatDateBR(day)}</span>
                  {dayHearings.length > 0 && (
                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      style={{
                        marginLeft: 'auto',
                        transition: 'transform 0.2s',
                        transform: collapsedDays[i] ? 'rotate(-90deg)' : 'rotate(0deg)',
                      }}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  )}
                </div>

                {dayHearings.length > 0 && (
                  <div
                    className="agenda-day-count"
                    onClick={() => toggleDay(i)}
                    style={{ cursor: 'pointer' }}
                  >
                    {dayHearings.length} audiência{dayHearings.length !== 1 ? 's' : ''}
                  </div>
                )}

                {/* Hearing cards - collapsible */}
                <div className="agenda-day-cards" style={{
                  maxHeight: collapsedDays[i] ? '0px' : '2000px',
                  overflow: 'hidden',
                  transition: 'max-height 0.3s ease',
                  opacity: collapsedDays[i] ? 0 : 1,
                }}>
                  {dayHearings.length === 0 && (
                    <div className="agenda-empty-day">—</div>
                  )}
                  {dayHearings.map((h, j) => (
                    <div
                      key={j}
                      className="agenda-card"
                      style={{ borderLeftColor: getTypeColor(h.tipoAudiencia) }}
                    >
                      {h.horario && (
                        <div className="agenda-card-time">{h.horario}</div>
                      )}
                      <div className="agenda-card-name">{h.reclamante}</div>
                      {h.reclamada && (
                        <div className="agenda-card-company">vs {h.reclamada}</div>
                      )}
                      {h.tipoAudiencia && (
                        <div className="agenda-card-badge" style={{ background: getTypeColor(h.tipoAudiencia) + '22', color: getTypeColor(h.tipoAudiencia) }}>
                          {h.tipoAudiencia}
                        </div>
                      )}
                      {h.advogado && (
                        <div className="agenda-card-lawyer">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                          {h.advogado}
                        </div>
                      )}
                      {h.orgaoJulgador && (
                        <div className="agenda-card-court">{h.orgaoJulgador}</div>
                      )}
                      {h.numeroProcesso && (
                        <div className="agenda-card-process">{h.numeroProcesso}</div>
                      )}
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
        <div className="empty-state" style={{ marginTop: '2rem' }}>
          <div className="empty-state-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div className="empty-state-title">Nenhuma audiência nesta semana</div>
          <div className="empty-state-desc">
            Use as setas para navegar para outras semanas.
          </div>
        </div>
      )}

      {/* ========== PERÍCIA SECTION ========== */}
      <div style={{ marginTop: '2.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
        <div className="agenda-header">
          <h1 className="agenda-title">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.5rem' }}>
              <path d="M9 2h6v2H9z" />
              <rect x="4" y="4" width="16" height="18" rx="2" />
              <path d="M9 14l2 2 4-4" />
            </svg>
            Agenda de Perícias
          </h1>
          {totalPericiaWeek > 0 && (
            <span className="agenda-week-total" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
              {totalPericiaWeek} perícia{totalPericiaWeek !== 1 ? 's' : ''} na semana
            </span>
          )}
        </div>

        {periciasLoading && (
          <div className="agenda-loading">
            <div className="upload-spinner" style={{ width: 32, height: 32 }} />
            <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>Carregando perícias...</p>
          </div>
        )}

        {!periciasLoading && (
          <div className="agenda-grid">
            {weekDays.map((day, i) => {
              const dayPericias = periciasByDay[i];
              const isToday =
                day.getDate() === new Date().getDate() &&
                day.getMonth() === new Date().getMonth() &&
                day.getFullYear() === new Date().getFullYear();

              return (
                <div key={i} className={`agenda-day ${isToday ? 'today' : ''} ${dayPericias.length === 0 ? 'empty' : ''}`}>
                  <div
                    className="agenda-day-header"
                    onClick={() => togglePericiaDay(i)}
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                  >
                    <span className="agenda-day-name">{DAYS[i]}</span>
                    <span className={`agenda-day-number ${isToday ? 'today' : ''}`}>
                      {day.getDate()}
                    </span>
                    <span className="agenda-day-month">{formatDateBR(day)}</span>
                    {dayPericias.length > 0 && (
                      <svg
                        width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        style={{
                          marginLeft: 'auto',
                          transition: 'transform 0.2s',
                          transform: collapsedPericiaDays[i] ? 'rotate(-90deg)' : 'rotate(0deg)',
                        }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    )}
                  </div>

                  {dayPericias.length > 0 && (
                    <div
                      className="agenda-day-count"
                      onClick={() => togglePericiaDay(i)}
                      style={{ cursor: 'pointer', background: 'rgba(99, 102, 241, 0.1)', color: '#818cf8' }}
                    >
                      {dayPericias.length} perícia{dayPericias.length !== 1 ? 's' : ''}
                    </div>
                  )}

                  <div className="agenda-day-cards" style={{
                    maxHeight: collapsedPericiaDays[i] ? '0px' : '2000px',
                    overflow: 'hidden',
                    transition: 'max-height 0.3s ease',
                    opacity: collapsedPericiaDays[i] ? 0 : 1,
                  }}>
                    {dayPericias.length === 0 && (
                      <div className="agenda-empty-day">—</div>
                    )}
                    {dayPericias.map((p, j) => (
                      <div
                        key={j}
                        className="agenda-card"
                        style={{ borderLeftColor: '#818cf8' }}
                      >
                        {p.horario && (
                          <div className="agenda-card-time">{p.horario}</div>
                        )}
                        <div className="agenda-card-name">{p.reclamante}</div>
                        {p.reclamada && (
                          <div className="agenda-card-company">vs {p.reclamada}</div>
                        )}
                        {p.tipo && (
                          <div className="agenda-card-type" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
                            {p.tipo}
                          </div>
                        )}
                        {p.perito && (
                          <div className="agenda-card-advogado">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                              <circle cx="12" cy="7" r="4" />
                            </svg>
                            {p.perito}
                          </div>
                        )}
                        {p.local && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            📍 {p.local}
                          </div>
                        )}
                        {p.processo && (
                          <div className="agenda-card-process">{p.processo}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!periciasLoading && totalPericiaWeek === 0 && (
          <div className="empty-state" style={{ marginTop: '1rem' }}>
            <div className="empty-state-icon">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 2h6v2H9z" />
                <rect x="4" y="4" width="16" height="18" rx="2" />
                <path d="M9 14l2 2 4-4" />
              </svg>
            </div>
            <div className="empty-state-title">Nenhuma perícia nesta semana</div>
            <div className="empty-state-desc">
              Perícias são extraídas automaticamente do email periciajjs@gmail.com
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
