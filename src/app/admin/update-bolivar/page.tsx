'use client';

import { useState } from 'react';

export default function UpdateBolivarPage() {
  const [result, setResult] = useState<null | {
    updated: number; notFound: number; skipped: number; total: number; log: string[];
  }>(null);
  const [loading, setLoading] = useState(false);

  const handleRun = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/update-bolivar', { method: 'POST' });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({ updated: 0, notFound: 0, skipped: 0, total: 0, log: [`Erro: ${err}`] });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="detail-page" style={{ maxWidth: '800px', margin: '2rem auto' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
        Atualizar Clientes BOLIVAR
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
        Atualiza FUNÇÃO e EMPRESA dos clientes com status BOLIVAR (somente campos vazios).
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
        {loading ? '⏳ Atualizando...' : '🚀 Executar Atualização'}
      </button>

      {result && (
        <div style={{
          background: 'rgba(0,0,0,0.2)', borderRadius: '1rem', padding: '1.5rem',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
            <span style={{ color: '#10b981', fontWeight: 700 }}>✅ {result.updated} atualizados</span>
            <span style={{ color: 'var(--text-muted)' }}>⏭ {result.skipped} já preenchidos</span>
            <span style={{ color: '#ef4444' }}>❌ {result.notFound} não encontrados</span>
            <span style={{ color: 'var(--text-muted)' }}>Total: {result.total}</span>
          </div>

          <div style={{
            background: 'rgba(0,0,0,0.3)', borderRadius: '0.5rem', padding: '1rem',
            maxHeight: '500px', overflowY: 'auto', fontSize: '0.75rem',
            fontFamily: 'monospace', color: 'var(--text-muted)', lineHeight: 1.8,
          }}>
            {result.log.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
