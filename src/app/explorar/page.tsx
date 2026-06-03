'use client';

import { useState, useEffect } from 'react';

export default function ExplorarPrazosPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/explore-prazos')
      .then(res => res.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError('Erro ao carregar'); setLoading(false); });
  }, []);

  return (
    <div className="detail-page" style={{ paddingTop: '1rem' }}>
      <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '1rem' }}>
        🔍 Explorando Pasta de Prazos
      </h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        Esta página é temporária — serve para eu entender como estão organizados os arquivos.
        <br/>Por favor, tire um print desta tela e me envie!
      </p>

      {loading && <div className="shimmer" style={{ height: '200px', borderRadius: '1rem' }} />}
      {error && <div style={{ color: '#fca5a5' }}>⚠️ {error}</div>}

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{
            background: 'rgba(14,14,20,0.6)', border: '1px solid rgba(59,130,246,0.2)',
            borderRadius: '0.75rem', padding: '1.25rem',
          }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#93c5fd', marginBottom: '0.5rem' }}>
              📁 Total de sub-pastas encontradas: {data.totalFolders}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.8 }}>
              {data.allFolderNames?.map((name: string, i: number) => (
                <span key={i} style={{
                  display: 'inline-block', background: 'rgba(255,255,255,0.05)',
                  padding: '0.2rem 0.5rem', borderRadius: '0.3rem', margin: '0.15rem',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}>
                  {name}
                </span>
              ))}
            </div>
          </div>

          {data.samples?.map((sample: any, idx: number) => (
            <div key={idx} style={{
              background: 'rgba(14,14,20,0.6)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '0.75rem', padding: '1.25rem',
            }}>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fbbf24', marginBottom: '0.75rem' }}>
                📂 {sample.folder} ({sample.files?.length || 0} arquivos)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {sample.files?.map((file: string, fi: number) => (
                  <div key={fi} style={{
                    fontSize: '0.78rem', color: 'var(--text-secondary)',
                    padding: '0.4rem 0.6rem', background: 'rgba(0,0,0,0.2)',
                    borderRadius: '0.3rem', fontFamily: 'monospace',
                  }}>
                    {file}
                  </div>
                ))}
                {(!sample.files || sample.files.length === 0) && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Pasta vazia</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
