'use client';

import { useSession } from 'next-auth/react';
import { useState } from 'react';

export default function TokenInfoPage() {
  const { data: session, status } = useSession();
  const [copied, setCopied] = useState(false);

  if (status === 'loading') {
    return (
      <div className="detail-page">
        <div className="agenda-loading">
          <div className="upload-spinner" style={{ width: 32, height: 32 }} />
          <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>Carregando...</p>
        </div>
      </div>
    );
  }

  if (!session?.user?.email) {
    return (
      <div className="detail-page">
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Faça login primeiro.
        </div>
      </div>
    );
  }

  const refreshToken = (session as any)?.refreshToken || '';

  const handleCopy = async () => {
    if (refreshToken) {
      await navigator.clipboard.writeText(refreshToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <div className="detail-page">
      <section className="hero">
        <h1 className="hero-title" style={{ fontSize: '1.8rem' }}>🔑 Token Info</h1>
        <p className="hero-subtitle">Informações do token da conta logada</p>
      </section>

      <div style={{ padding: '1.5rem' }}>
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: '1rem',
          padding: '1.5rem',
          border: '1px solid var(--border)',
        }}>
          <div style={{ marginBottom: '1rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Email:</span>
            <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '1rem' }}>
              {session.user.email}
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Refresh Token:</span>
            {refreshToken ? (
              <div style={{
                background: 'rgba(0,0,0,0.3)',
                borderRadius: '0.5rem',
                padding: '0.75rem',
                marginTop: '0.5rem',
                wordBreak: 'break-all',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                color: '#4ade80',
                maxHeight: '200px',
                overflow: 'auto',
              }}>
                {refreshToken}
              </div>
            ) : (
              <div style={{
                color: '#f59e0b',
                padding: '0.75rem',
                background: 'rgba(245, 158, 11, 0.1)',
                borderRadius: '0.5rem',
                marginTop: '0.5rem',
                fontSize: '0.85rem',
              }}>
                ⚠️ Token não encontrado. Faça logout e login novamente.
              </div>
            )}
          </div>

          {refreshToken && (
            <button
              onClick={handleCopy}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                border: 'none',
                background: copied ? '#22c55e' : 'var(--accent-gold)',
                color: '#000',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: '0.9rem',
                transition: 'all 0.2s',
              }}
            >
              {copied ? '✅ Copiado!' : '📋 Copiar Token'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
