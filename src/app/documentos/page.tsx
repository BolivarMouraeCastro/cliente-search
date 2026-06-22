'use client';

import { useState, useCallback, useRef } from 'react';
import SearchBar from '@/components/SearchBar';
import { Client } from '@/types';

export default function DocumentosPage() {
  const [query, setQuery] = useState('');
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Selected client state
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // Upload state
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<{ name: string; progress: number; status: 'uploading' | 'done' | 'error'; message?: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSearch = useCallback(async (searchQuery: string) => {
    setQuery(searchQuery);
    setSelectedClient(null);
    if (!searchQuery.trim()) {
      setClients([]);
      setHasSearched(false);
      return;
    }
    setIsLoading(true);
    setHasSearched(true);
    try {
      const res = await fetch(`/api/clients?search=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients || []);
      } else { setClients([]); }
    } catch { setClients([]); }
    finally { setIsLoading(false); }
  }, []);

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
  };

  const handleBackToSearch = () => {
    setSelectedClient(null);
    setUploadingFiles([]);
  };

  // --- Upload Logic ---
  const uploadFile = async (file: File) => {
    if (!selectedClient) return;

    const fileEntry = { name: file.name, progress: 0, status: 'uploading' as const };
    setUploadingFiles((prev) => [...prev, fileEntry]);
    const idx = uploadingFiles.length;

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('clientName', selectedClient.nome);
      formData.append('clientId', selectedClient.id);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      setUploadingFiles((prev) => {
        const updated = [...prev];
        const target = updated.find((f) => f.name === file.name && f.status === 'uploading');
        if (target) {
          if (res.ok) {
            target.status = 'done';
            target.progress = 100;
            target.message = data.message || 'Enviado!';
          } else {
            target.status = 'error';
            target.message = data.error || 'Erro no upload';
          }
        }
        return updated;
      });
    } catch {
      setUploadingFiles((prev) => {
        const updated = [...prev];
        const target = updated.find((f) => f.name === file.name && f.status === 'uploading');
        if (target) {
          target.status = 'error';
          target.message = 'Erro de conexão';
        }
        return updated;
      });
    }
  };

  const handleFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      uploadFile(file);
    }
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      e.target.value = '';
    }
  };

  // --- RENDER ---

  // Upload view (client selected)
  if (selectedClient) {
    return (
      <div className="detail-page">
        {/* Back button */}
        <button onClick={handleBackToSearch} className="upload-back-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Voltar à busca
        </button>

        {/* Client info header */}
        <div className="upload-client-header">
          <div className="upload-client-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <div>
            <div className="upload-client-name">{selectedClient.nome}</div>
            {selectedClient.empresa && (
              <div className="upload-client-company">{selectedClient.empresa}</div>
            )}
            {selectedClient.numeroProcesso && (
              <div className="upload-client-process">Processo: {selectedClient.numeroProcesso}</div>
            )}
          </div>
        </div>

        {/* Drop zone */}
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
            multiple
            accept=".pdf,.mp4,.mp3,.wav,.ogg,.webm,.avi,.mov,.jpeg,.jpg,.png,.webp"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <div className="upload-dropzone-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div className="upload-dropzone-title">
            {isDragging ? 'Solte o arquivo aqui!' : 'Arraste arquivos aqui'}
          </div>
          <div className="upload-dropzone-desc">
            ou <span className="upload-dropzone-link">clique para selecionar</span>
          </div>
          <div className="upload-dropzone-formats">
            PDF · Áudio (MP3, MP4, WAV) · Vídeo (MP4, AVI) · Imagens (JPG, PNG)
          </div>
          <div className="upload-dropzone-rename">
            📝 O arquivo será renomeado para: <strong>{selectedClient.nome.toUpperCase().replace(/\s+/g, '_')}_{new Date().toLocaleDateString('pt-BR').replace(/\//g, '.')}.ext</strong>
          </div>
        </div>

        {/* Upload progress list */}
        {uploadingFiles.length > 0 && (
          <div className="upload-list">
            <div className="upload-list-title">Arquivos enviados</div>
            {uploadingFiles.map((file, i) => (
              <div key={i} className={`upload-item ${file.status}`}>
                <div className="upload-item-icon">
                  {file.status === 'uploading' && (
                    <div className="upload-spinner" />
                  )}
                  {file.status === 'done' && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  {file.status === 'error' && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  )}
                </div>
                <div className="upload-item-info">
                  <div className="upload-item-name">{file.name}</div>
                  <div className={`upload-item-status ${file.status}`}>
                    {file.status === 'uploading' && 'Enviando...'}
                    {file.status === 'done' && (file.message || '✅ Enviado com sucesso!')}
                    {file.status === 'error' && (file.message || '❌ Erro no envio')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Search view (no client selected)
  return (
    <div className="detail-page">
      {/* Hero */}
      <section className="hero">
        <h1 className="hero-title" style={{ fontSize: '1.8rem' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '0.5rem' }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Adicionar Documento
        </h1>
        <p className="hero-subtitle">Busque o cliente e faça upload de documentos na pasta dele</p>
      </section>

      {/* Search */}
      <SearchBar onSearch={handleSearch} isLoading={isLoading} value={query} />

      {/* Loading */}
      {isLoading && (
        <div className="clients-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="shimmer shimmer-card" />
          ))}
        </div>
      )}

      {/* Results */}
      {!isLoading && hasSearched && (
        <>
          <div className="results-header">
            <span className="results-title">Selecione o cliente</span>
            <span className="results-count">
              {clients.length} {clients.length === 1 ? 'encontrado' : 'encontrados'}
            </span>
          </div>

          {clients.length > 0 ? (
            <div className="clients-grid">
              {clients.map((client, index) => (
                <div
                  key={client.id}
                  style={{ animationDelay: `${index * 0.05}s`, cursor: 'pointer' }}
                  onClick={() => handleSelectClient(client)}
                >
                  <div className="card upload-client-card">
                    <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div className="upload-card-avatar">
                        {client.nome.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className="client-card-name" style={{ fontSize: '1rem' }}>{client.nome}</div>
                        {client.empresa && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{client.empresa}</div>
                        )}
                      </div>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
              </div>
              <div className="empty-state-title">Nenhum cliente encontrado</div>
              <div className="empty-state-desc">
                Tente buscar por nome, empresa ou número do processo.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
