'use client';

import { useState, useEffect } from 'react';

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
  const dashIdx = raw.indexOf(' - ');
  if (dashIdx === -1) {
    return { cliente: raw, prescricao: '', empresa: '' };
  }

  const cliente = raw.substring(0, dashIdx).trim();
  const rest = raw.substring(dashIdx + 3).trim();

  const dateMatch = rest.match(/(\d{1,2}[\/\.]\d{1,2}[\/\.]\d{2,4})/);
  if (dateMatch) {
    const prescricao = dateMatch[1];
    const afterDate = rest.substring(rest.indexOf(prescricao) + prescricao.length).trim();
    const empresa = afterDate.replace(/^[\s\-,eE]+/, '').trim();
    return { cliente, prescricao, empresa };
  }

  return { cliente, prescricao: '', empresa: rest };
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

export default function IniciaisPage() {
  // Iniciais Stats
  const [lawyers, setLawyers] = useState<LawyerData[]>([]);
  const [totalIniciais, setTotalIniciais] = useState(0);
  const [iniciaisLoading, setIniciaisLoading] = useState(true);
  const [iniciaisError, setIniciaisError] = useState<string | null>(null);
  const [expandedLawyer, setExpandedLawyer] = useState<string | null>(null);

  // Search in Bolivar
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  
  // Move Folder
  const [movingFolderId, setMovingFolderId] = useState<string | null>(null);
  const [moveSuccess, setMoveSuccess] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!searchQuery || searchQuery.length < 3) return;
    setIsSearching(true);
    setSearchError(null);
    setMoveSuccess(null);
    try {
      const res = await fetch(`/api/bolivar-search?q=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      } else {
        const data = await res.json().catch(() => ({}));
        setSearchError(data.error || 'Erro ao buscar');
      }
    } catch {
      setSearchError('Erro de conexão');
    } finally {
      setIsSearching(false);
    }
  };

  const handleMoveFolder = async (folderId: string, destinationType: 'URGENTE' | 'PERGUNTANDO') => {
    setMovingFolderId(folderId);
    setSearchError(null);
    try {
      const res = await fetch('/api/move-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId, destinationType })
      });
      if (res.ok) {
        const destinationText = destinationType === 'URGENTE' 
          ? 'ALESSANDRA > INICIAIS PARA FAZER > CLIENTES URGENTES' 
          : 'ELITON > INICIAIS PARA FAZER';
        setMoveSuccess(`Processo movido com sucesso para ${destinationText}!`);
        // Remove from results list
        setSearchResults(prev => prev.filter(r => r.id !== folderId));
        // Refresh iniciais data after 2 seconds to let Drive sync
        setTimeout(() => fetchIniciais(), 2000);
      } else {
        const data = await res.json().catch(() => ({}));
        setSearchError(data.error || 'Erro ao mover a pasta');
      }
    } catch {
      setSearchError('Erro de conexão ao mover a pasta');
    } finally {
      setMovingFolderId(null);
    }
  };

  const fetchIniciais = async () => {
    setIniciaisLoading(true);
    setIniciaisError(null);
    try {
      const res = await fetch('/api/iniciais');
      if (res.ok) {
        const data = await res.json();
        setLawyers(data.lawyers || []);
        setTotalIniciais(data.totalGeral || 0);
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
  };

  useEffect(() => {
    fetchIniciais();
  }, []);


  return (
    <div className="detail-page" style={{ paddingTop: '1rem' }}>
      {/* ===================== BOLIVAR SEARCH ===================== */}
      <div style={{ marginBottom: '2.5rem' }}>
        <h2 style={{
          fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)',
          margin: '0 0 0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
        }}>
          🔍 Buscar Cliente no Bolivar
        </h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 1rem' }}>
          Pesquise clientes que estão na pasta do Bolivar e clique para enviá-los para ALESSANDRA &gt; CLIENTES URGENTES.
        </p>

        <div style={{ display: 'flex', gap: '0.5rem', maxWidth: '600px', marginBottom: '1.5rem' }}>
          <input 
            type="text" 
            placeholder="Nome do cliente..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            style={{
              flex: 1, padding: '0.75rem 1rem', borderRadius: '0.5rem',
              border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)',
              color: 'white', fontSize: '0.9rem'
            }}
          />
          <button 
            onClick={handleSearch}
            disabled={isSearching || searchQuery.length < 3}
            style={{
              background: isSearching ? '#555' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
              color: 'white', fontWeight: 700, padding: '0 1.5rem', borderRadius: '0.5rem',
              border: 'none', cursor: isSearching ? 'wait' : 'pointer'
            }}
          >
            {isSearching ? 'Buscando...' : 'Buscar'}
          </button>
        </div>

        {searchError && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '0.5rem', padding: '0.75rem 1rem', color: '#fca5a5', fontSize: '0.85rem',
            marginBottom: '1rem', maxWidth: '600px'
          }}>⚠️ {searchError}</div>
        )}

        {moveSuccess && (
          <div style={{
            background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '0.5rem', padding: '0.75rem 1rem', color: '#86efac', fontSize: '0.85rem',
            marginBottom: '1rem', maxWidth: '600px'
          }}>✅ {moveSuccess}</div>
        )}

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '800px' }}>
            {searchResults.map((res) => (
              <div key={res.id} style={{
                background: 'rgba(14, 14, 20, 0.5)', border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '0.75rem', padding: '1rem 1.25rem',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>{res.cliente}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: '1rem', marginTop: '0.25rem' }}>
                    {res.empresa && <span>🏢 {res.empresa}</span>}
                    {res.prescricao && <span style={{ color: '#f59e0b' }}>⚠️ Prescrição: {res.prescricao}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
                  <button
                    onClick={() => handleMoveFolder(res.id, 'URGENTE')}
                    disabled={movingFolderId === res.id}
                    style={{
                      background: movingFolderId === res.id ? '#555' : 'linear-gradient(135deg, #10b981, #059669)',
                      color: 'white', fontWeight: 700, padding: '0.6rem 1rem', borderRadius: '0.5rem',
                      border: 'none', cursor: movingFolderId === res.id ? 'wait' : 'pointer',
                      fontSize: '0.85rem', width: '100%'
                    }}
                  >
                    {movingFolderId === res.id ? '⏳ Movendo...' : '📤 CLIENTE URGENTE'}
                  </button>
                  <button
                    onClick={() => handleMoveFolder(res.id, 'PERGUNTANDO')}
                    disabled={movingFolderId === res.id}
                    style={{
                      background: movingFolderId === res.id ? '#555' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                      color: 'white', fontWeight: 700, padding: '0.6rem 1rem', borderRadius: '0.5rem',
                      border: 'none', cursor: movingFolderId === res.id ? 'wait' : 'pointer',
                      fontSize: '0.85rem', width: '100%'
                    }}
                  >
                    {movingFolderId === res.id ? '⏳ Movendo...' : '❓ CLIENTE PERGUNTANDO'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '2.5rem' }}>
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
    </div>
  );
}
