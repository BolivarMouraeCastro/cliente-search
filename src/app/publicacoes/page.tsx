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

// ── Identificação do tipo de ação ─────────────────────────────────────
function identificarTipoAcao(descricao: string): string {
  const d = descricao.toLowerCase();
  if (d.includes('recurso de revista') || /\br\.?\s?r\.?\b/.test(d)) return 'RR';
  if (d.includes('contrarraz') && d.includes('revista')) return 'CRRR';
  if (d.includes('recurso ordinário') || d.includes('recurso ordinario') || /\br\.?\s?o\.?\b/.test(d)) return 'R.O';
  if (d.includes('contrarraz') && (d.includes('ordinário') || d.includes('ordinario'))) return 'CRRO';
  if (d.includes('réplica') || d.includes('replica')) return 'RÉPLICA';
  if (d.includes('alvará') || d.includes('alvara')) return 'ALVARÁ';
  if (d.includes('trânsito em julgado') || d.includes('transito em julgado')) return 'TRÂNSITO EM JULGADO';
  if (d.includes('acordo') && (d.includes('homolog') || d.includes('manifest'))) return 'MANIFESTAÇÃO APÓS ACORDO';
  if (d.includes('inss') || d.includes('previdenciário') || d.includes('previdenciario')) return 'INSS';
  if (d.includes('audiência') || d.includes('audiencia')) return 'AUDIÊNCIA';
  if (d.includes('execução') || d.includes('execucao') || d.includes('liquidação') || d.includes('liquidacao')) return 'EXECUÇÃO';
  if (d.includes('cálculo') || d.includes('calculo')) return 'CÁLCULOS';
  if (d.includes('sentença') || d.includes('sentenca')) return 'SENTENÇA';
  if (d.includes('manifest') || d.includes('prazo') || d.includes('intimação') || d.includes('intimacao')) return 'MANIFESTAÇÃO';
  if (d.includes('cível') || d.includes('civel')) return 'CÍVEL E TRABALHISTA';
  return 'MANIFESTAÇÃO';
}

function atribuirAdvogado(tipoAcao: string): string {
  const t = tipoAcao.toUpperCase();
  if (t === 'RR' || t === 'CRRR' || t === 'RÉPLICA') return 'ROBSON';
  if (t === 'EXECUÇÃO' || t === 'CÁLCULOS') return 'ROBSON';
  if (t === 'ALVARÁ' || t === 'TRÂNSITO EM JULGADO' || t === 'MANIFESTAÇÃO APÓS ACORDO') return 'JOÃO PAULO';
  if (t === 'INSS') return 'JOÃO PAULO';
  if (t === 'AUDIÊNCIA') return 'JOÃO CARLOS';
  if (t === 'R.O' || t === 'CRRO') return 'DENIS';
  if (t === 'MANIFESTAÇÃO' || t === 'CÍVEL E TRABALHISTA' || t === 'SENTENÇA') return 'DENIS';
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
  return '#d4af37';
}

const ADVOGADO_COLORS: Record<string, string> = {
  'DENIS': '#f59e0b',
  'ROBSON': '#10b981',
  'SIMON': '#6366f1',
  'JOÃO CARLOS': '#ef4444',
  'JOÃO PAULO': '#8b5cf6',
  'NYCOLLE': '#ec4899',
};

// ── PDF extraction via CDN ────────────────────────────────────────────
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

// ── Parse publications from text ──────────────────────────────────────
function parsePublicacoes(text: string, pdfId: string): Publicacao[] {
  const splitPattern = /(?=Cliente\s+[A-Z\u00C0-\u00FF])/g;
  const blocks = text.split(splitPattern);
  const publicacoes: Publicacao[] = [];

  for (let idx = 0; idx < blocks.length; idx++) {
    const block = blocks[idx];
    if (block.trim().length < 50) continue;
    if (!/N[uú]mero do processo/i.test(block)) continue;

    let cliente = '', adverso = '', numeroProcesso = '', data = '', vara = '', descricao = '';

    const cm = block.match(/^Cliente[\s:]+([A-Z\u00C0-\u00FF][A-Z\u00C0-\u00FF\s\.]+?)[\s]+N[uú]mero/i);
    if (cm) cliente = cm[1].trim();
    const pm = block.match(/N[uú]mero do processo[\s:]+(\d[\d.\-\/]+)/i);
    if (pm) numeroProcesso = pm[1].trim();
    const am = block.match(/Adverso[\s:]+([\s\S]+?)(?:\s*Pasta|\s*Respons[aá]vel)/i);
    if (am) adverso = am[1].trim();
    const dm = block.match(/Data da Disponibiliza[cç][aã]o[\s:]+(\d{2}\/\d{2}\/\d{4})/i);
    if (dm) data = dm[1].trim();
    const vm = block.match(/Vara[\s:]+([^\n]+?)(?:\s*[OÓ]rg[aã]o|\s*Descri)/i);
    if (vm) vara = vm[1].trim();
    const descM = block.match(/Descri[cç][aã]o[\s:]+([\s\S]+)/i);
    if (descM) descricao = descM[1].replace(/https?:\/\/[^\s]+/g, '').trim();

    if (cliente || numeroProcesso) {
      const tipoAcao = identificarTipoAcao(descricao);
      const advogadoAtribuido = atribuirAdvogado(tipoAcao);
      const id = `${pdfId}-${idx}`;
      publicacoes.push({ id, cliente, adverso, numeroProcesso, data, vara, descricao, tipoAcao, advogadoAtribuido, concluido: false });
    }
  }
  return publicacoes;
}

// ── LocalStorage for "concluido" state ────────────────────────────────
function getConcluidosMap(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem('pub_concluidos') || '{}'); } catch { return {}; }
}
function saveConcluido(id: string, value: boolean) {
  const map = getConcluidosMap();
  map[id] = value;
  localStorage.setItem('pub_concluidos', JSON.stringify(map));
}

// ── Component ─────────────────────────────────────────────────────────
export default function PublicacoesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [publicacoes, setPublicacoes] = useState<Publicacao[]>([]);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [filterAdvogado, setFilterAdvogado] = useState('');
  const [showConcluidos, setShowConcluidos] = useState(false);

  const loadFromDrive = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/publicacoes');
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erro'); return; }

      if (!data.pdfs || data.pdfs.length === 0) {
        setError('Nenhum PDF encontrado na pasta do Drive.');
        return;
      }

      const allPubs: Publicacao[] = [];
      const concluidos = getConcluidosMap();

      for (const pdf of data.pdfs) {
        // Convert base64 to ArrayBuffer
        const binary = atob(pdf.base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const text = await extractTextFromPDF(bytes.buffer);
        const pubs = parsePublicacoes(text, pdf.id);
        // Apply saved concluido state
        for (const p of pubs) {
          p.concluido = concluidos[p.id] === true;
        }
        allPubs.push(...pubs);
      }

      if (allPubs.length === 0) {
        setError('PDFs encontrados mas nenhuma publicação reconhecida. Verifique se são do PROMAD.');
      }

      setPublicacoes(allPubs);
    } catch (err) {
      setError(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFromDrive(); }, [loadFromDrive]);

  const handleConcluir = (id: string) => {
    setPublicacoes(prev => prev.map(p => {
      if (p.id === id) {
        const newVal = !p.concluido;
        saveConcluido(id, newVal);
        return { ...p, concluido: newVal };
      }
      return p;
    }));
  };

  const toggleExpand = (id: string) => {
    setExpandedCard(prev => prev === id ? null : id);
  };

  // Group by assigned lawyer
  const byAdvogado: Record<string, Publicacao[]> = {};
  for (const pub of publicacoes) {
    if (!showConcluidos && pub.concluido) continue;
    if (filterAdvogado && pub.advogadoAtribuido !== filterAdvogado) continue;
    const key = pub.advogadoAtribuido;
    if (!byAdvogado[key]) byAdvogado[key] = [];
    byAdvogado[key].push(pub);
  }
  const advogados = [...new Set(publicacoes.map(p => p.advogadoAtribuido))].sort();
  const totalPendentes = publicacoes.filter(p => !p.concluido).length;
  const totalConcluidos = publicacoes.filter(p => p.concluido).length;

  return (
    <div className="detail-page">
      <section className="hero">
        <h1 className="hero-title" style={{ fontSize: '1.8rem' }}>📰 Publicações</h1>
        <p className="hero-subtitle">Prazos do PROMAD — distribuídos automaticamente</p>
      </section>

      {error && <div style={{ padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '0.75rem', color: '#ef4444', fontSize: '0.85rem', marginBottom: '1rem' }}>❌ {error}</div>}

      {loading && (
        <div className="agenda-loading">
          <div className="upload-spinner" style={{ width: 32, height: 32 }} />
          <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>Carregando publicações do Drive...</p>
        </div>
      )}

      {!loading && publicacoes.length > 0 && (
        <>
          {/* Summary bar */}
          <div className="pub-summary">
            <span className="pub-summary-total">📋 {totalPendentes} pendente{totalPendentes !== 1 ? 's' : ''}</span>
            <span className="pub-summary-advs" style={{ color: '#10b981' }}>✅ {totalConcluidos} concluído{totalConcluidos !== 1 ? 's' : ''}</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={showConcluidos} onChange={(e) => setShowConcluidos(e.target.checked)} />
              Mostrar concluídos
            </label>
            {advogados.length > 1 && (
              <select className="agenda-filter" value={filterAdvogado} onChange={(e) => setFilterAdvogado(e.target.value)}>
                <option value="">Todos os advogados</option>
                {advogados.map(adv => (
                  <option key={adv} value={adv}>{adv} ({publicacoes.filter(p => p.advogadoAtribuido === adv && !p.concluido).length})</option>
                ))}
              </select>
            )}
            <button onClick={loadFromDrive} className="pub-card-expand" style={{ marginLeft: 'auto' }}>🔄 Atualizar</button>
          </div>

          {/* Groups by lawyer — agenda style */}
          {Object.entries(byAdvogado).sort().map(([advogado, pubs]) => {
            const color = ADVOGADO_COLORS[advogado] || '#d4af37';
            const pendentes = pubs.filter(p => !p.concluido).length;

            return (
              <div key={advogado} className="pub-group" style={{ marginBottom: '1.5rem' }}>
                {/* Lawyer header */}
                <div className="pub-group-header" style={{ borderLeft: `4px solid ${color}` }}>
                  <div className="pub-group-avatar" style={{ background: color }}>
                    {advogado.charAt(0)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="pub-group-name">{advogado}</div>
                    <div className="pub-group-count">
                      {pendentes} pendente{pendentes !== 1 ? 's' : ''}
                      {pubs.length !== pendentes && ` • ${pubs.length - pendentes} concluído${(pubs.length - pendentes) !== 1 ? 's' : ''}`}
                    </div>
                  </div>
                </div>

                {/* Publication cards — accordion */}
                <div className="pub-cards">
                  {pubs.map((pub) => {
                    const isOpen = expandedCard === pub.id;
                    const tipoColor = getTipoColor(pub.tipoAcao);

                    return (
                      <div key={pub.id} className={`pub-card ${pub.concluido ? 'pub-card-done' : ''}`}>
                        {/* Clickable header */}
                        <div className="pub-card-top" onClick={() => toggleExpand(pub.id)} style={{ cursor: 'pointer' }}>
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ fontSize: '1rem' }}>{isOpen ? '▼' : '▶'}</span>
                            <div>
                              <div className="pub-card-cliente" style={{ textDecoration: pub.concluido ? 'line-through' : 'none', opacity: pub.concluido ? 0.6 : 1 }}>
                                {pub.cliente || 'Sem nome'}
                              </div>
                              {pub.adverso && <div className="pub-card-adverso">vs {pub.adverso}</div>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span className="agenda-card-badge" style={{ background: tipoColor + '22', color: tipoColor, fontSize: '0.65rem' }}>
                              {pub.tipoAcao}
                            </span>
                            {pub.data && <span className="pub-card-date">{pub.data}</span>}
                          </div>
                        </div>

                        {/* Expanded content */}
                        {isOpen && (
                          <div style={{ padding: '0.75rem 0 0.5rem 2rem', animation: 'slideUp 0.2s ease-out' }}>
                            <div className="pub-card-meta" style={{ marginBottom: '0.5rem' }}>
                              {pub.numeroProcesso && <span className="pub-card-processo">{pub.numeroProcesso}</span>}
                              {pub.vara && <span className="pub-card-vara">{pub.vara}</span>}
                            </div>

                            {pub.descricao && (
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '0.75rem', maxHeight: '200px', overflowY: 'auto' }}>
                                {pub.descricao}
                              </div>
                            )}

                            <button
                              onClick={(e) => { e.stopPropagation(); handleConcluir(pub.id); }}
                              style={{
                                padding: '0.4rem 1rem',
                                borderRadius: '999px',
                                border: pub.concluido ? '1px solid #10b981' : '1px solid var(--border-subtle)',
                                background: pub.concluido ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.05)',
                                color: pub.concluido ? '#10b981' : 'var(--text-primary)',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                              }}
                            >
                              {pub.concluido ? '✅ Concluído' : '☐ Concluir'}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
