'use client';

import { useState } from 'react';

export default function SetBolivarPage() {
  const [result, setResult] = useState<null | {
    statusUpdated: number; created: number; errors: number; totalProcessed: number; log: string[];
  }>(null);
  const [loading, setLoading] = useState(false);

  const handleRun = async () => {
    if (!confirm('⚠️ ATENÇÃO: Isso vai atualizar o STATUS de TODOS os clientes dos 3 lotes para "BOLIVAR". Clientes não encontrados serão CRIADOS. Deseja continuar?')) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/set-bolivar', { method: 'POST' });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({ statusUpdated: 0, created: 0, errors: 0, totalProcessed: 0, log: [`Erro: ${err}`] });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="detail-page" style={{ maxWidth: '900px', margin: '2rem auto' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
        ⚠️ Atualizar STATUS → BOLIVAR (Lotes 1, 2 e 3)
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
        Todos os nomes dos 3 lotes terão o STATUS atualizado para <strong style={{ color: '#f59e0b' }}>BOLIVAR</strong>.
      </p>
      <p style={{ color: '#ef4444', fontSize: '0.8rem', marginBottom: '1.5rem' }}>
        Clientes NÃO encontrados na planilha serão CRIADOS com nome + STATUS = BOLIVAR.
      </p>

      <button
        onClick={handleRun}
        disabled={loading}
        style={{
          padding: '0.75rem 2rem', borderRadius: '0.75rem', border: 'none',
          background: loading ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #f59e0b, #ef4444)',
          color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: loading ? 'not-allowed' : 'pointer',
          marginBottom: '1.5rem',
        }}
      >
        {loading ? '⏳ Processando... (pode demorar alguns minutos)' : '🚨 Executar Atualização BOLIVAR'}
      </button>

      {result && (
        <div style={{
          background: 'rgba(0,0,0,0.2)', borderRadius: '1rem', padding: '1.5rem',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem', fontSize: '0.85rem', flexWrap: 'wrap' }}>
            <span style={{ color: '#10b981', fontWeight: 700 }}>✅ {result.statusUpdated} STATUS atualizados</span>
            <span style={{ color: '#3b82f6', fontWeight: 700 }}>🆕 {result.created} novos criados</span>
            <span style={{ color: '#ef4444' }}>❌ {result.errors} erros</span>
            <span style={{ color: 'var(--text-muted)' }}>Total: {result.totalProcessed} nomes únicos</span>
          </div>

          <div style={{
            background: 'rgba(0,0,0,0.3)', borderRadius: '0.5rem', padding: '1rem',
            maxHeight: '600px', overflowY: 'auto', fontSize: '0.72rem',
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
