'use client';

import { useState } from 'react';

interface DiagResult {
  totalBolivar: number;
  uniqueNames: number;
  duplicateNames: number;
  duplicateRows: number;
  duplicates: Array<{ nome: string; rows: Array<{ id: string; nome: string; funcao: string; empresa: string }> }>;
  allBolivarNames: Array<{ row: string; nome: string; funcao: string; empresa: string }>;
}

export default function DiagnoseBolivarPage() {
  const [result, setResult] = useState<DiagResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const handleRun = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/diagnose-bolivar');
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="detail-page" style={{ maxWidth: '1000px', margin: '2rem auto' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
        🔍 Diagnóstico BOLIVAR
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
        Analisa todos os clientes com STATUS = BOLIVAR e identifica duplicatas.
      </p>

      <button
        onClick={handleRun}
        disabled={loading}
        style={{
          padding: '0.75rem 2rem', borderRadius: '0.75rem', border: 'none',
          background: loading ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
          color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: loading ? 'not-allowed' : 'pointer',
          marginBottom: '1.5rem',
        }}
      >
        {loading ? '⏳ Analisando...' : '🔍 Analisar'}
      </button>

      {result && (
        <>
          {/* Summary */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem',
          }}>
            {[
              { label: 'Total BOLIVAR', value: result.totalBolivar, color: '#f59e0b' },
              { label: 'Nomes Únicos', value: result.uniqueNames, color: '#3b82f6' },
              { label: 'Nomes Duplicados', value: result.duplicateNames, color: '#ef4444' },
              { label: 'Linhas Extras (duplicatas)', value: result.duplicateRows, color: '#ef4444' },
            ].map((s) => (
              <div key={s.label} style={{
                background: 'var(--card-bg)', border: '1px solid var(--card-border)',
                borderRadius: '0.75rem', padding: '1rem', textAlign: 'center',
              }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{s.label}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Duplicates */}
          {result.duplicates.length > 0 && (
            <div style={{
              background: 'var(--card-bg)', border: '1px solid var(--card-border)',
              borderRadius: '1rem', padding: '1.5rem', marginBottom: '1.5rem',
            }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#ef4444', marginBottom: '1rem' }}>
                ⚠️ Nomes Duplicados ({result.duplicates.length})
              </h3>
              <div style={{
                maxHeight: '400px', overflowY: 'auto', fontSize: '0.75rem', fontFamily: 'monospace',
              }}>
                {result.duplicates.map((dup, i) => (
                  <div key={i} style={{
                    marginBottom: '0.75rem', padding: '0.5rem', background: 'rgba(239,68,68,0.05)',
                    borderRadius: '0.5rem', border: '1px solid rgba(239,68,68,0.1)',
                  }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                      {dup.nome} ({dup.rows.length}x)
                    </div>
                    {dup.rows.map((r, j) => (
                      <div key={j} style={{ color: 'var(--text-muted)', paddingLeft: '1rem' }}>
                        Row {r.id}: &quot;{r.nome}&quot; | Função: {r.funcao || '—'} | Empresa: {r.empresa || '—'}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All names */}
          <button
            onClick={() => setShowAll(!showAll)}
            style={{
              padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--card-border)',
              background: 'var(--card-bg)', color: 'var(--text-primary)', cursor: 'pointer',
              fontSize: '0.8rem', marginBottom: '1rem',
            }}
          >
            {showAll ? 'Ocultar lista completa' : `Ver todos os ${result.totalBolivar} nomes`}
          </button>

          {showAll && (
            <div style={{
              background: 'rgba(0,0,0,0.2)', borderRadius: '0.75rem', padding: '1rem',
              maxHeight: '600px', overflowY: 'auto', fontSize: '0.7rem', fontFamily: 'monospace',
              color: 'var(--text-muted)', lineHeight: 1.6,
            }}>
              {result.allBolivarNames.map((c, i) => (
                <div key={i}>
                  Row {c.row}: {c.nome} {c.funcao ? `| ${c.funcao}` : ''} {c.empresa ? `| ${c.empresa}` : ''}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
