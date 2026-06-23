'use client';

import { useState, useEffect, useCallback } from 'react';

interface Publicacao {
  id: string;
  cliente: string;
  adverso: string;
  numeroProcesso: string;
  data: string;
  vara: string;
  descricao: string;
  tipoAcao: string;
  advogadoAtribuido: string;
  concluido: boolean;
}

// ── Identification ────────────────────────────────────────────────────
function identificarTipoAcao(descricao: string): string {
  const d = descricao.toLowerCase();
  if (d.includes('recurso de revista')) return 'RR';
  if (d.includes('contrarraz') && d.includes('revista')) return 'CRRR';
  if (d.includes('recurso ordinário') || d.includes('recurso ordinario')) return 'R.O';
  if (d.includes('contrarraz') && (d.includes('ordinário') || d.includes('ordinario'))) return 'CRRO';
  if (d.includes('réplica') || d.includes('replica')) return 'RÉPLICA';
  if (d.includes('alvará') || d.includes('alvara')) return 'ALVARÁ';
  if (d.includes('trânsito em julgado') || d.includes('transito em julgado')) return 'TRÂNSITO EM JULGADO';
  if (d.includes('acordo') && (d.includes('homolog') || d.includes('manifest'))) return 'APÓS ACORDO';
  if (d.includes('inss') || d.includes('previdenciário') || d.includes('previdenciario')) return 'INSS';
  if (d.includes('audiência') || d.includes('audiencia')) return 'AUDIÊNCIA';
  if (d.includes('execução') || d.includes('execucao') || d.includes('liquidação') || d.includes('liquidacao')) return 'EXECUÇÃO';
  if (d.includes('cálculo') || d.includes('calculo')) return 'CÁLCULOS';
  if (d.includes('sentença') || d.includes('sentenca')) return 'SENTENÇA';
  if (d.includes('manifest') || d.includes('prazo') || d.includes('intimação') || d.includes('intimacao')) return 'MANIFESTAÇÃO';
  return 'PRAZO';
}

function autoAtribuir(tipoAcao: string): string {
  const t = tipoAcao.toUpperCase();
  if (t === 'RR' || t === 'CRRR' || t === 'RÉPLICA') return 'ROBSON';
  if (t === 'EXECUÇÃO' || t === 'CÁLCULOS') return 'ROBSON';
  if (t === 'ALVARÁ' || t === 'TRÂNSITO EM JULGADO' || t === 'APÓS ACORDO') return 'JOÃO PAULO';
  if (t === 'INSS') return 'JOÃO PAULO';
  if (t === 'AUDIÊNCIA') return 'JOÃO CARLOS';
  if (t === 'R.O' || t === 'CRRO') return 'DENIS';
  if (t === 'MANIFESTAÇÃO' || t === 'SENTENÇA') return 'DENIS';
  return 'SIMON';
}

function getTipoColor(tipo: string): string {
  const t = tipo.toUpperCase();
  if (t.includes('R.O') || t.includes('CRRO')) return '#f59e0b';
  if (t.includes('RR') || t.includes('CRRR')) return '#ef4444';
  if (t.includes('RÉPLICA')) return '#8b5cf6';
  if (t.includes('EXECUÇÃO') || t.includes('CÁLCULO')) return '#10b981';
  if (t.includes('AUDIÊNCIA')) return '#6366f1';
  if (t.includes('INSS')) return '#ec4899';
  if (t.includes('ALVARÁ')) return '#14b8a6';
  if (t.includes('TRÂNSITO') || t.includes('ACORDO')) return '#f97316';
  if (t.includes('MANIFESTAÇÃO')) return '#d4af37';
  return '#94a3b8';
}

// ── PDF extraction ────────────────────────────────────────────────────
async function extractTextFromPDF(arrayBuffer: ArrayBuffer): Promise<string> {
  const pdfjsUrl = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js';
  if (!(window as any).pdfjsLib) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = pdfjsUrl;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Falha ao carregar PDF.js'));
      document.head.appendChild(script);
    });
    (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = '';
  }
  const pdfjsLib = (window as any).pdfjsLib;
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer), disableWorker: true }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item: any) => item.str || '').join(' '));
  }
  return pages.join('\n');
}

function parsePublicacoes(text: string, pdfId: string): Publicacao[] {
  const blocks = text.split(/(?=Cliente\s+[A-Z\u00C0-\u00FF])/g);
  const publicacoes: Publicacao[] = [];
  for (let idx = 0; idx < blocks.length; idx++) {
    const block = blocks[idx];
    if (block.trim().length < 50 || !/N[uú]mero do processo/i.test(block)) continue;
    let cliente = '', adverso = '', numeroProcesso = '', data = '', vara = '', descricao = '';
    const cm = block.match(/^Cliente[\s:]+([A-Z\u00C0-\u00FF][A-Z\u00C0-\u00FF\s\.]+?)[\s]+N[uú]mero/i);
    if (cm) cliente = cm[1].trim();
    const pm = block.match(/N[uú]mero do processo[\s:]+(\d[\d.\-\/]+)/i);
    if (pm) numeroProcesso = pm[1].trim();
    const am = block.match(/Adverso[\s:]+([\s\S]+?)(?:\s*Pasta|\s*Respons[aá]vel)/i);
    if (am) adverso = am[1].trim();
    const dm2 = block.match(/Data da Disponibiliza[cç][aã]o[\s:]+(\d{2}\/\d{2}\/\d{4})/i);
    if (dm2) data = dm2[1].trim();
    const vmatch = block.match(/Vara[\s:]+([^\n]+?)(?:\s*[OÓ]rg[aã]o|\s*Descri)/i);
    if (vmatch) vara = vmatch[1].trim();
    const descM = block.match(/Descri[cç][aã]o[\s:]+([\s\S]+)/i);
    if (descM) descricao = descM[1].replace(/https?:\/\/[^\s]+/g, '').trim();
    if (cliente || numeroProcesso) {
      const tipoAcao = identificarTipoAcao(descricao);
      publicacoes.push({ id: `${pdfId}-${idx}`, cliente, adverso, numeroProcesso, data, vara, descricao, tipoAcao, advogadoAtribuido: autoAtribuir(tipoAcao), concluido: false });
    }
  }
  return publicacoes;
}

// ── LocalStorage ──────────────────────────────────────────────────────
function getConcluidosMap(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem('pub_concluidos') || '{}'); } catch { return {}; }
}
function saveConcluido(id: string, val: boolean) {
  const m = getConcluidosMap(); m[id] = val;
  localStorage.setItem('pub_concluidos', JSON.stringify(m));
}
function getReassignments(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem('pub_reassign') || '{}'); } catch { return {}; }
}
function saveReassignment(id: string, advogado: string) {
  const m = getReassignments(); m[id] = advogado;
  localStorage.setItem('pub_reassign', JSON.stringify(m));
}

const COLUMNS = ['SIMON', 'DENIS', 'ROBSON', 'JOÃO CARLOS', 'JOÃO PAULO', 'NYCOLLE'];

// ── Component ─────────────────────────────────────────────────────────
export default function PublicacoesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [publicacoes, setPublicacoes] = useState<Publicacao[]>([]);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const loadFromDrive = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/publicacoes');
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erro'); return; }
      if (!data.pdfs || data.pdfs.length === 0) { setError('Nenhum PDF na pasta do Drive.'); return; }
      const allPubs: Publicacao[] = [];
      const concluidos = getConcluidosMap();
      const reassignments = getReassignments();
      for (const pdf of data.pdfs) {
        const binary = atob(pdf.base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const text = await extractTextFromPDF(bytes.buffer);
        const pubs = parsePublicacoes(text, pdf.id);
        for (const p of pubs) {
          p.concluido = concluidos[p.id] === true;
          // Apply manual reassignment if exists
          if (reassignments[p.id]) p.advogadoAtribuido = reassignments[p.id];
        }
        allPubs.push(...pubs);
      }
      if (allPubs.length === 0) setError('PDFs encontrados mas nenhuma publicação reconhecida.');
      setPublicacoes(allPubs);
    } catch (err) { setError(`Erro: ${err instanceof Error ? err.message : String(err)}`); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadFromDrive(); }, [loadFromDrive]);

  const handleConcluir = (id: string) => {
    setPublicacoes(prev => prev.map(p => {
      if (p.id === id) { const v = !p.concluido; saveConcluido(id, v); return { ...p, concluido: v }; }
      return p;
    }));
  };

  // ── Drag & Drop handlers ────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, pubId: string) => {
    e.dataTransfer.setData('text/plain', pubId);
    setDragId(pubId);
  };

  const handleDragOver = (e: React.DragEvent, colName: string) => {
    e.preventDefault();
    setDragOverCol(colName);
  };

  const handleDragLeave = () => {
    setDragOverCol(null);
  };

  const handleDrop = (e: React.DragEvent, targetAdvogado: string) => {
    e.preventDefault();
    const pubId = e.dataTransfer.getData('text/plain');
    setDragOverCol(null);
    setDragId(null);
    if (!pubId) return;

    // Reassign
    saveReassignment(pubId, targetAdvogado);
    setPublicacoes(prev => prev.map(p =>
      p.id === pubId ? { ...p, advogadoAtribuido: targetAdvogado } : p
    ));
  };

  // Group by lawyer — SIMON sees ALL + his own
  const byAdvogado: Record<string, Publicacao[]> = {};
  for (const col of COLUMNS) byAdvogado[col] = [];

  for (const pub of publicacoes) {
    const key = pub.advogadoAtribuido;
    if (byAdvogado[key]) {
      byAdvogado[key].push(pub);
    } else {
      byAdvogado[key] = [pub];
    }
  }

  // SIMON always gets a copy of ALL publications
  byAdvogado['SIMON'] = [...publicacoes];

  const totalPubs = publicacoes.length;
  const totalPendentes = publicacoes.filter(p => !p.concluido).length;

  return (
    <div className="detail-page">
      {/* Header */}
      <div className="agenda-header">
        <div className="agenda-title-row">
          <h1 className="agenda-title">📰 Publicações</h1>
          {totalPubs > 0 && (
            <span className="agenda-week-total">{totalPendentes} prazo{totalPendentes !== 1 ? 's' : ''} pendente{totalPendentes !== 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="agenda-nav">
          <button onClick={loadFromDrive} className="agenda-today-btn">🔄 Atualizar</button>
        </div>
      </div>

      {error && <div style={{ padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '0.75rem', color: '#ef4444', fontSize: '0.85rem', marginBottom: '1rem' }}>❌ {error}</div>}

      {loading && (
        <div className="agenda-loading">
          <div className="upload-spinner" style={{ width: 32, height: 32 }} />
          <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>Carregando publicações do Drive...</p>
        </div>
      )}

      {/* Kanban Grid */}
      {!loading && totalPubs > 0 && (
        <div className="agenda-grid">
          {COLUMNS.map((advogado) => {
            const pubs = byAdvogado[advogado] || [];
            const pendentes = pubs.filter(p => !p.concluido).length;
            const isSimon = advogado === 'SIMON';
            const isDragTarget = dragOverCol === advogado;

            return (
              <div
                key={advogado}
                className={`agenda-day ${isDragTarget ? 'today' : ''}`}
                onDragOver={(e) => handleDragOver(e, advogado)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, advogado)}
              >
                {/* Column header */}
                <div className="agenda-day-header">
                  <span className="agenda-day-name" style={{ fontSize: isSimon ? '0.75rem' : undefined }}>
                    {isSimon ? '📋 SIMON (TODOS)' : advogado}
                  </span>
                </div>
                <div className="agenda-day-count">
                  {isSimon ? `${pubs.length} total` : `${pendentes} prazo${pendentes !== 1 ? 's' : ''}`}
                </div>

                {/* Cards */}
                <div className="agenda-day-cards">
                  {pubs.length === 0 && (
                    <div className="agenda-empty-day" style={{ padding: '2rem 0.5rem', fontSize: '0.75rem' }}>
                      Arraste cards aqui
                    </div>
                  )}
                  {pubs.map((pub) => {
                    const isOpen = expandedCard === pub.id;
                    const tipoColor = getTipoColor(pub.tipoAcao);
                    const isDragging = dragId === pub.id;

                    return (
                      <div
                        key={pub.id}
                        className="agenda-card"
                        draggable
                        onDragStart={(e) => handleDragStart(e, pub.id)}
                        style={{
                          borderLeftColor: tipoColor,
                          opacity: pub.concluido ? 0.35 : isDragging ? 0.5 : 1,
                          cursor: 'grab',
                          padding: isOpen ? '0.6rem 0.75rem' : '0.4rem 0.75rem',
                        }}
                        onClick={() => setExpandedCard(isOpen ? null : pub.id)}
                      >
                        {/* Compact: single line with name + arrow */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{isOpen ? '▼' : '▶'}</span>
                          <span className="agenda-card-name" style={{
                            textDecoration: pub.concluido ? 'line-through' : 'none',
                            fontSize: '0.78rem',
                            margin: 0,
                          }}>
                            {pub.cliente || 'Sem nome'}
                          </span>
                          {pub.concluido && <span style={{ fontSize: '0.65rem' }}>✅</span>}
                          {isSimon && pub.advogadoAtribuido !== 'SIMON' && (
                            <span style={{ fontSize: '0.6rem', color: tipoColor, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                              → {pub.advogadoAtribuido}
                            </span>
                          )}
                        </div>

                        {/* Expanded */}
                        {isOpen && (
                          <div style={{ marginTop: '0.5rem', animation: 'slideUp 0.2s ease-out' }} onClick={(e) => e.stopPropagation()}>
                            {pub.adverso && <div className="agenda-card-company">vs {pub.adverso}</div>}
                            <div className="agenda-card-badge" style={{ background: tipoColor + '22', color: tipoColor, marginTop: '0.3rem' }}>
                              {pub.tipoAcao}
                            </div>
                            {pub.numeroProcesso && <div className="agenda-card-process" style={{ marginTop: '0.3rem' }}>{pub.numeroProcesso}</div>}
                            {pub.vara && <div className="agenda-card-court">{pub.vara}</div>}
                            {pub.data && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>📅 {pub.data}</div>}

                            {pub.descricao && (
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: '0.5rem', maxHeight: '100px', overflowY: 'auto', padding: '0.4rem', background: 'rgba(0,0,0,0.2)', borderRadius: '0.5rem' }}>
                                {pub.descricao.substring(0, 400)}{pub.descricao.length > 400 ? '...' : ''}
                              </div>
                            )}

                            {!isSimon && (
                              <button
                                onClick={() => handleConcluir(pub.id)}
                                style={{
                                  marginTop: '0.5rem', padding: '0.35rem 0.8rem', borderRadius: '999px', width: '100%',
                                  border: pub.concluido ? '1px solid #10b981' : '1px solid rgba(212,175,55,0.3)',
                                  background: pub.concluido ? 'rgba(16,185,129,0.15)' : 'rgba(212,175,55,0.1)',
                                  color: pub.concluido ? '#10b981' : '#d4af37',
                                  fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                                }}
                              >
                                {pub.concluido ? '✅ Concluído' : '☐ Concluir'}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && totalPubs === 0 && !error && (
        <div className="empty-state" style={{ marginTop: '2rem' }}>
          <div className="empty-state-icon">📰</div>
          <div className="empty-state-title">Nenhuma publicação encontrada</div>
          <div className="empty-state-desc">Suba um PDF do PROMAD na pasta do Google Drive.</div>
        </div>
      )}
    </div>
  );
}
