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
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/publicacoes', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setByAdvogado(data.byAdvogado || {});
        setTotal(data.total || 0);
      } else {
        setError(data.error || 'Erro ao processar PDF');
      }
    } catch {
      setError('Erro de conexão ao processar PDF');
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
      {/* Header */}
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

      {/* Error */}
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

      {/* Loading */}
      {isLoading && (
        <div className="agenda-loading">
          <div className="upload-spinner" style={{ width: 32, height: 32 }} />
          <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>Processando PDF...</p>
        </div>
      )}

      {/* Results */}
      {hasResults && !isLoading && (
        <>
          {/* Summary bar */}
          <div className="pub-summary">
            <span className="pub-summary-total">{total} publicação{total !== 1 ? 'ões' : ''} encontrada{total !== 1 ? 's' : ''}</span>
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

          {/* Grouped by advogado */}
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
                          {pub.adverso && (
                            <div className="pub-card-adverso">vs {pub.adverso}</div>
                          )}
                        </div>
                        {pub.data && (
                          <div className="pub-card-date">{pub.data}</div>
                        )}
                      </div>

                      <div className="pub-card-meta">
                        {pub.numeroProcesso && (
                          <span className="pub-card-processo">{pub.numeroProcesso}</span>
                        )}
                        {pub.vara && (
                          <span className="pub-card-vara">{pub.vara}</span>
                        )}
                      </div>

                      {pub.descricao && (
                        <>
                          <div
                            className={`pub-card-desc ${isExpanded ? 'expanded' : ''}`}
                          >
                            {pub.descricao}
                          </div>
                          <button
                            className="pub-card-expand"
                            onClick={() => toggleExpand(cardKey)}
                          >
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
