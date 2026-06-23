'use client';

import { useState, useRef } from 'react';

interface Publicacao {
  cliente: string;
  adverso: string;
  numeroProcesso: string;
  data: string;
  vara: string;
  descricao: string;
  tipoAcao: string;
  advogadoAtribuido: string;
}

// ── Regras de distribuição por advogado ────────────────────────────────
const REGRAS_DISTRIBUICAO: { advogado: string; tipos: string[]; keywords: string[][] }[] = [
  {
    advogado: 'DENIS',
    tipos: ['R.O', 'CRRO', 'MANIFESTAÇÃO', 'CÍVEL E TRABALHISTA'],
    keywords: [
      ['recurso', 'ordinário'],
      ['contrarraz', 'ordinário'],
      ['r.o'],
      ['crro'],
    ],
  },
  {
    advogado: 'ROBSON',
    tipos: ['R.O', 'CRRO', 'RR', 'CRRR', 'RÉPLICA', 'CÁLCULOS', 'EXECUÇÃO'],
    keywords: [
      ['recurso', 'revista'],
      ['contrarraz', 'revista'],
      ['réplica'],
      ['replica'],
      ['cálculo'],
      ['calculo'],
      ['execução'],
      ['execucao'],
      ['liquidação'],
      ['liquidacao'],
      ['r.r'],
      ['crrr'],
    ],
  },
  {
    advogado: 'SIMON',
    tipos: ['TODOS OS PRAZOS'],
    keywords: [], // Simon receives all deadlines - handled separately
  },
  {
    advogado: 'JOÃO CARLOS',
    tipos: ['MANIFESTAÇÃO', 'CÍVEL E TRABALHISTA', 'AUDIÊNCIA'],
    keywords: [
      ['audiência'],
      ['audiencia'],
    ],
  },
  {
    advogado: 'JOÃO PAULO',
    tipos: ['CÁLCULOS', 'EXECUÇÃO', 'ALVARÁ', 'MANIFESTAÇÃO APÓS ACORDO', 'TRÂNSITO EM JULGADO', 'MANIFESTAÇÃO', 'CÍVEL E TRABALHISTA', 'INSS'],
    keywords: [
      ['alvará'],
      ['alvara'],
      ['trânsito em julgado'],
      ['transito em julgado'],
      ['acordo'],
      ['inss'],
      ['previdenciário'],
      ['previdenciario'],
    ],
  },
  {
    advogado: 'NYCOLLE',
    tipos: ['INSS', 'AUDIÊNCIA', 'MANIFESTAÇÃO', 'CÍVEL E TRABALHISTA'],
    keywords: [
      ['inss'],
      ['audiência'],
      ['audiencia'],
    ],
  },
];

/**
 * Identify the action type from the publication description.
 */
function identificarTipoAcao(descricao: string): string {
  const d = descricao.toLowerCase();

  if (d.includes('recurso de revista') || d.includes('r.r.')) return 'RR';
  if (d.includes('contrarraz') && d.includes('revista')) return 'CRRR';
  if (d.includes('recurso ordinário') || d.includes('recurso ordinario') || d.includes('r.o.')) return 'R.O';
  if (d.includes('contrarraz') && d.includes('ordinário')) return 'CRRO';
  if (d.includes('contrarraz') && d.includes('ordinario')) return 'CRRO';
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

/**
 * Assign the publication to the correct lawyer based on action type.
 */
function atribuirAdvogado(tipoAcao: string): string {
  const t = tipoAcao.toUpperCase();

  // Specific types first (more specific rules)
  if (t === 'RR' || t === 'CRRR') return 'ROBSON';
  if (t === 'RÉPLICA') return 'ROBSON';
  if (t === 'ALVARÁ') return 'JOÃO PAULO';
  if (t === 'TRÂNSITO EM JULGADO') return 'JOÃO PAULO';
  if (t === 'MANIFESTAÇÃO APÓS ACORDO') return 'JOÃO PAULO';
  if (t === 'INSS') return 'JOÃO PAULO';
  if (t === 'EXECUÇÃO' || t === 'CÁLCULOS') return 'ROBSON';
  if (t === 'AUDIÊNCIA') return 'JOÃO CARLOS';
  if (t === 'R.O' || t === 'CRRO') return 'DENIS';
  if (t === 'MANIFESTAÇÃO' || t === 'CÍVEL E TRABALHISTA' || t === 'SENTENÇA') return 'DENIS';

  return 'SIMON'; // Default: Simon handles all remaining
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

// ── PDF extraction ────────────────────────────────────────────────────
async function extractTextFromPDF(file: File): Promise<string> {
  const pdfjsUrl = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js';

  if (!(window as any).pdfjsLib) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = pdfjsUrl;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Falha ao carregar biblioteca PDF.'));
      document.head.appendChild(script);
    });
    (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = '';
  }

  const pdfjsLib = (window as any).pdfjsLib;
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer), disableWorker: true }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item: any) => item.str || '').join(' ');
    pages.push(text);
  }
  return pages.join('\n');
}

// ── Parse publications ────────────────────────────────────────────────
function parsePublicacoes(text: string): Publicacao[] {
  // Each publication starts with "Cliente" followed by name and "Número do processo"
  // Split the text at each "Cliente" that appears as a field header
  const splitPattern = /(?=Cliente\s+[A-Z\u00C0-\u00FF])/g;
  const blocks = text.split(splitPattern);
  const publicacoes: Publicacao[] = [];

  for (const block of blocks) {
    if (block.trim().length < 50) continue;
    // Must contain "Número do processo" to be a valid publication
    if (!/N[uú]mero do processo/i.test(block)) continue;

    let cliente = '';
    let adverso = '';
    let numeroProcesso = '';
    let data = '';
    let vara = '';
    let descricao = '';

    // Cliente - extract name between "Cliente" and "Número do processo"
    const clienteMatch = block.match(/^Cliente[\s:]+([A-Z\u00C0-\u00FF][A-Z\u00C0-\u00FF\s\.]+?)[\s]+N[uú]mero/i);
    if (clienteMatch) cliente = clienteMatch[1].trim();

    // Número do processo
    const processoMatch = block.match(/N[uú]mero do processo[\s:]+(\d[\d.\-\/]+)/i);
    if (processoMatch) numeroProcesso = processoMatch[1].trim();

    // Adverso
    const adversoMatch = block.match(/Adverso[\s:]+([\s\S]+?)(?:\s*Pasta|\s*Respons[aá]vel)/i);
    if (adversoMatch) adverso = adversoMatch[1].trim();

    // Data da Disponibilização
    const dataMatch = block.match(/Data da Disponibiliza[cç][aã]o[\s:]+(\d{2}\/\d{2}\/\d{4})/i);
    if (dataMatch) data = dataMatch[1].trim();

    // Vara
    const varaMatch = block.match(/Vara[\s:]+([^\n]+?)(?:\s*[OÓ]rg[aã]o|\s*Descri)/i);
    if (varaMatch) vara = varaMatch[1].trim();

    // Descrição - everything after "Descrição" until the end of block
    const descMatch = block.match(/Descri[cç][aã]o[\s:]+([\s\S]+)/i);
    if (descMatch) {
      // Clean up: remove URLs and excess whitespace
      let desc = descMatch[1].trim();
      desc = desc.replace(/https?:\/\/[^\s]+/g, '').trim();
      descricao = desc;
    }

    if (cliente || numeroProcesso) {
      const tipoAcao = identificarTipoAcao(descricao);
      const advogadoAtribuido = atribuirAdvogado(tipoAcao);

      publicacoes.push({
        cliente, adverso, numeroProcesso, data, vara, descricao,
        tipoAcao, advogadoAtribuido,
      });
    }
  }

  return publicacoes;
}

// ── Component ─────────────────────────────────────────────────────────
export default function PublicacoesPage() {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [publicacoes, setPublicacoes] = useState<Publicacao[]>([]);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [filterAdvogado, setFilterAdvogado] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (file.type !== 'application/pdf') { setError('Apenas PDF.'); return; }
    setIsLoading(true);
    setError('');
    setPublicacoes([]);

    try {
      const text = await extractTextFromPDF(file);
      if (!text?.trim()) { setError('PDF vazio.'); return; }

      const pubs = parsePublicacoes(text);
      if (pubs.length === 0) { setError('Nenhuma publicação encontrada. Verifique se é do PROMAD.'); return; }

      setPublicacoes(pubs);
    } catch (err) {
      setError(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]); };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files?.[0]) { handleFile(e.target.files[0]); e.target.value = ''; } };
  const toggleExpand = (key: string) => { setExpandedCards((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; }); };

  // Group by assigned lawyer
  const byAdvogado: Record<string, Publicacao[]> = {};
  for (const pub of publicacoes) {
    const key = filterAdvogado ? (pub.advogadoAtribuido === filterAdvogado ? pub.advogadoAtribuido : null) : pub.advogadoAtribuido;
    if (key) {
      if (!byAdvogado[key]) byAdvogado[key] = [];
      byAdvogado[key].push(pub);
    }
  }
  const advogados = [...new Set(publicacoes.map(p => p.advogadoAtribuido))].sort();

  return (
    <div className="detail-page">
      <section className="hero">
        <h1 className="hero-title" style={{ fontSize: '1.8rem' }}>📰 Publicações</h1>
        <p className="hero-subtitle">Upload do PDF do PROMAD — distribuição automática por advogado</p>
      </section>

      {/* Upload */}
      <div className={`upload-dropzone ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}>
        <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileSelect} style={{ display: 'none' }} />
        <div className="upload-dropzone-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <div className="upload-dropzone-title">{isDragging ? 'Solte aqui!' : 'Arraste o PDF do PROMAD aqui'}</div>
        <div className="upload-dropzone-desc">ou <span className="upload-dropzone-link">clique para selecionar</span></div>
      </div>

      {error && <div style={{ padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '0.75rem', color: '#ef4444', fontSize: '0.85rem', marginBottom: '1rem' }}>❌ {error}</div>}

      {isLoading && (
        <div className="agenda-loading">
          <div className="upload-spinner" style={{ width: 32, height: 32 }} />
          <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>Processando PDF...</p>
        </div>
      )}

      {publicacoes.length > 0 && !isLoading && (
        <>
          {/* Summary */}
          <div className="pub-summary">
            <span className="pub-summary-total">{publicacoes.length} publicação{publicacoes.length !== 1 ? 'ões' : ''}</span>
            <span className="pub-summary-advs">{advogados.length} advogado{advogados.length !== 1 ? 's' : ''}</span>
            {advogados.length > 1 && (
              <select className="agenda-filter" value={filterAdvogado} onChange={(e) => setFilterAdvogado(e.target.value)}>
                <option value="">Todos os advogados</option>
                {advogados.map((adv) => (<option key={adv} value={adv}>{adv} ({publicacoes.filter(p => p.advogadoAtribuido === adv).length})</option>))}
              </select>
            )}
          </div>

          {/* Groups */}
          {Object.entries(byAdvogado).sort().map(([advogado, pubs]) => (
            <div key={advogado} className="pub-group">
              <div className="pub-group-header">
                <div className="pub-group-avatar">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
                <div>
                  <div className="pub-group-name">{advogado}</div>
                  <div className="pub-group-count">{pubs.length} publicação{pubs.length !== 1 ? 'ões' : ''}</div>
                </div>
              </div>

              <div className="pub-cards">
                {pubs.map((pub, j) => {
                  const cardKey = `${advogado}-${j}`;
                  const isExpanded = expandedCards.has(cardKey);
                  return (
                    <div key={j} className="pub-card">
                      <div className="pub-card-top">
                        <div style={{ flex: 1 }}>
                          <div className="pub-card-cliente">{pub.cliente || 'Sem nome'}</div>
                          {pub.adverso && <div className="pub-card-adverso">vs {pub.adverso}</div>}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          {pub.data && <div className="pub-card-date">{pub.data}</div>}
                          <div className="agenda-card-badge" style={{ background: getTipoColor(pub.tipoAcao) + '22', color: getTipoColor(pub.tipoAcao), marginTop: '0.25rem' }}>
                            {pub.tipoAcao}
                          </div>
                        </div>
                      </div>

                      <div className="pub-card-meta">
                        {pub.numeroProcesso && <span className="pub-card-processo">{pub.numeroProcesso}</span>}
                        {pub.vara && <span className="pub-card-vara">{pub.vara}</span>}
                      </div>

                      {pub.descricao && (
                        <>
                          <div className={`pub-card-desc ${isExpanded ? 'expanded' : ''}`}>{pub.descricao}</div>
                          <button className="pub-card-expand" onClick={() => toggleExpand(cardKey)}>
                            {isExpanded ? 'Ver menos ▲' : 'Ver descrição completa ▼'}
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
