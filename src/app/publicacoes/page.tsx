'use client';

import { useState, useRef } from 'react';

interface Publicacao {
  cliente: string;
  adverso: string;
  advogado: string;
  numeroProcesso: string;
  data: string;
  pagina: string;
  vara: string;
  orgao: string;
  jornal: string;
  descricao: string;
}

/**
 * Extract text from PDF using browser's pdfjs loaded from CDN.
 */
async function extractTextFromPDF(file: File): Promise<string> {
  const pdfjsUrl = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js';

  // Load script if not already loaded
  if (!(window as any).pdfjsLib) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = pdfjsUrl;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Falha ao carregar biblioteca PDF. Verifique sua conexão.'));
      document.head.appendChild(script);
    });
    // Disable worker to avoid CORS issues
    (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = '';
  }

  const pdfjsLib = (window as any).pdfjsLib;
  if (!pdfjsLib) {
    throw new Error('Biblioteca PDF não carregou. Recarregue a página.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    disableWorker: true,
  }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: any) => item.str || '')
      .join(' ');
    pages.push(text);
  }

  return pages.join('\n');
}

/**
 * Parse extracted text into publications.
 */
function parsePublicacoes(text: string): Publicacao[] {
  const blocks = text.split(/Publica[çc][ãa]o\s+Jur[ií]dica\s+Impressa/i);
  const publicacoes: Publicacao[] = [];

  for (const block of blocks) {
    if (block.trim().length < 50) continue;

    const pub: Publicacao = {
      cliente: '', adverso: '', advogado: '', numeroProcesso: '',
      data: '', pagina: '', vara: '', orgao: '', jornal: '', descricao: '',
    };

    // Cliente
    const clienteMatch = block.match(/Cliente[\s:]+([A-Z\u00C0-\u00FF][A-Z\u00C0-\u00FF\s]+?)(?:\s*N[uú]mero|\s*Adverso)/i);
    if (clienteMatch) pub.cliente = clienteMatch[1].trim();

    // Número do processo
    const processoMatch = block.match(/N[uú]mero do processo[\s:]+(\d[\d.\-\/]+)/i);
    if (processoMatch) pub.numeroProcesso = processoMatch[1].trim();

    // Adverso
    const adversoMatch = block.match(/Adverso[\s:]+([\s\S]+?)(?:\s*Pasta|\s*Respons[aá]vel)/i);
    if (adversoMatch) pub.adverso = adversoMatch[1].trim();

    // Advogado
    const advMatch = block.match(/(?:Respons[aá]vel|Advogado)[\s:]+([A-Z\u00C0-\u00FF][A-Z\u00C0-\u00FF\s]+?)(?:\s*Data|\s*Jornal|\s*\d{2}\/)/i);
    if (advMatch) pub.advogado = advMatch[1].trim();

    // Data
    const dataMatch = block.match(/Data da Disponibiliza[cç][aã]o[\s:]+(\d{2}\/\d{2}\/\d{4})/i);
    if (dataMatch) pub.data = dataMatch[1].trim();

    // Jornal
    const jornalMatch = block.match(/Jornal[\s:]+([\s\S]+?)(?:\s*P[aá]gina)/i);
    if (jornalMatch) pub.jornal = jornalMatch[1].trim();

    // Página
    const paginaMatch = block.match(/P[aá]gina[\s:]+(\d+)/i);
    if (paginaMatch) pub.pagina = paginaMatch[1].trim();

    // Vara
    const varaMatch = block.match(/Vara[\s:]+([^\n]+?)(?:\s*[OÓ]rg[aã]o|\s*Descri)/i);
    if (varaMatch) pub.vara = varaMatch[1].trim();

    // Órgão
    const orgaoMatch = block.match(/[OÓ]rg[aã]o[\s:]+([^\n]+?)(?:\s*Vara|\s*Descri)/i);
    if (orgaoMatch) pub.orgao = orgaoMatch[1].trim();

    // Descrição
    const descMatch = block.match(/Descri[cç][aã]o[\s:]+([\s\S]+)/i);
    if (descMatch) pub.descricao = descMatch[1].trim();

    if (pub.cliente || pub.numeroProcesso) {
      publicacoes.push(pub);
    }
  }

  return publicacoes;
}

export default function PublicacoesPage() {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [byAdvogado, setByAdvogado] = useState<Record<string, Publicacao[]>>({});
  const [total, setTotal] = useState(0);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [filterAdvogado, setFilterAdvogado] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (file.type !== 'application/pdf') {
      setError('Apenas arquivos PDF são aceitos.');
      return;
    }
    setIsLoading(true);
    setError('');
    setByAdvogado({});
    setTotal(0);

    try {
      // Extract text directly in the browser
      const text = await extractTextFromPDF(file);

      if (!text || text.trim().length === 0) {
        setError('PDF vazio ou não foi possível extrair texto.');
        return;
      }

      // Parse publications
      const publicacoes = parsePublicacoes(text);

      if (publicacoes.length === 0) {
        setError('Nenhuma publicação encontrada. Verifique se é um relatório do PROMAD.');
        return;
      }

      // Group by advogado
      const grouped: Record<string, Publicacao[]> = {};
      for (const pub of publicacoes) {
        const key = pub.advogado || 'SEM ADVOGADO';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(pub);
      }

      setByAdvogado(grouped);
      setTotal(publicacoes.length);
    } catch (err) {
      setError(`Erro ao processar PDF: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
      e.target.value = '';
    }
  };

  const toggleExpand = (key: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const advogados = Object.keys(byAdvogado).sort();
  const filtered = filterAdvogado
    ? { [filterAdvogado]: byAdvogado[filterAdvogado] || [] }
    : byAdvogado;

  const hasResults = total > 0;

  return (
    <div className="detail-page">
      <section className="hero">
        <h1 className="hero-title" style={{ fontSize: '1.8rem' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.5rem' }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          Publicações
        </h1>
        <p className="hero-subtitle">Faça upload do PDF do PROMAD para distribuir as publicações</p>
      </section>

      {/* Upload zone */}
      <div
        className={`upload-dropzone ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <div className="upload-dropzone-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </div>
        <div className="upload-dropzone-title">
          {isDragging ? 'Solte o PDF aqui!' : 'Arraste o PDF do PROMAD aqui'}
        </div>
        <div className="upload-dropzone-desc">
          ou <span className="upload-dropzone-link">clique para selecionar</span>
        </div>
        <div className="upload-dropzone-formats">Apenas PDF</div>
      </div>

      {error && (
        <div style={{
          padding: '0.75rem 1rem',
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: '0.75rem',
          color: '#ef4444',
          fontSize: '0.85rem',
          marginBottom: '1rem',
        }}>
          ❌ {error}
        </div>
      )}

      {isLoading && (
        <div className="agenda-loading">
          <div className="upload-spinner" style={{ width: 32, height: 32 }} />
          <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>Processando PDF...</p>
        </div>
      )}

      {hasResults && !isLoading && (
        <>
          <div className="pub-summary">
            <span className="pub-summary-total">{total} publicação{total !== 1 ? 'ões' : ''}</span>
            <span className="pub-summary-advs">{advogados.length} advogado{advogados.length !== 1 ? 's' : ''}</span>
            {advogados.length > 1 && (
              <select
                className="agenda-filter"
                value={filterAdvogado}
                onChange={(e) => setFilterAdvogado(e.target.value)}
              >
                <option value="">Todos os advogados</option>
                {advogados.map((adv) => (
                  <option key={adv} value={adv}>{adv} ({byAdvogado[adv].length})</option>
                ))}
              </select>
            )}
          </div>

          {Object.entries(filtered).map(([advogado, pubs]) => (
            <div key={advogado} className="pub-group">
              <div className="pub-group-header">
                <div className="pub-group-avatar">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
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
                        {pub.data && <div className="pub-card-date">{pub.data}</div>}
                      </div>

                      <div className="pub-card-meta">
                        {pub.numeroProcesso && <span className="pub-card-processo">{pub.numeroProcesso}</span>}
                        {pub.vara && <span className="pub-card-vara">{pub.vara}</span>}
                      </div>

                      {pub.descricao && (
                        <>
                          <div className={`pub-card-desc ${isExpanded ? 'expanded' : ''}`}>
                            {pub.descricao}
                          </div>
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
