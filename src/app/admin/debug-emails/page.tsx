'use client';

import { useState } from 'react';

interface DebugEmail {
  id: string;
  date: string;
  subject: string;
  snippet: string;
  body: string;
  from: string;
  processNumber?: string;
  phase?: string;
  audienciaData?: string;
  audienciaHora?: string;
  audienciaOrgao?: string;
}

export default function DebugEmailsPage() {
  const [clientName, setClientName] = useState('');
  const [emails, setEmails] = useState<DebugEmail[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const search = async () => {
    if (!clientName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/emails?clientName=${encodeURIComponent(clientName.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setEmails(data.emails || []);
      }
    } catch {
      setEmails([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto', color: '#fff', fontFamily: 'monospace' }}>
      <h1 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>🔍 Debug: E-mails Brutos do Cliente</h1>
      <p style={{ fontSize: '0.8rem', color: '#999', marginBottom: '1rem' }}>
        Esta página mostra o conteúdo real dos e-mails para diagnosticar por que a extração de audiência não está funcionando.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}>
        <input
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          placeholder="Nome do cliente (ex: KAYQUE AUGUSTO)"
          style={{
            flex: 1, padding: '0.75rem', borderRadius: '0.5rem',
            background: '#1a1a2e', border: '1px solid #333', color: '#fff',
            fontSize: '0.9rem',
          }}
        />
        <button
          onClick={search}
          disabled={loading}
          style={{
            padding: '0.75rem 1.5rem', borderRadius: '0.5rem',
            background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer',
            fontWeight: 700, fontSize: '0.85rem',
          }}
        >
          {loading ? 'Buscando...' : 'Buscar'}
        </button>
      </div>

      {emails.length > 0 && (
        <div style={{ fontSize: '0.75rem', color: '#10b981', marginBottom: '1rem' }}>
          {emails.length} e-mails encontrados
        </div>
      )}

      {emails.map((email, i) => {
        const isExpanded = expandedId === email.id;
        const hasAudiencia = email.subject.toLowerCase().includes('audiência') ||
          email.subject.toLowerCase().includes('audiencia') ||
          email.body?.substring(0, 2000).toLowerCase().includes('audiência') ||
          email.body?.substring(0, 2000).toLowerCase().includes('audiencia');

        return (
          <div key={email.id} style={{
            marginBottom: '1rem', borderRadius: '0.75rem',
            border: hasAudiencia ? '2px solid #f59e0b' : '1px solid #333',
            background: hasAudiencia ? 'rgba(245, 158, 11, 0.05)' : '#111',
            overflow: 'hidden',
          }}>
            <div
              onClick={() => setExpandedId(isExpanded ? null : email.id)}
              style={{ padding: '1rem', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#666' }}>#{i + 1} — {email.date}</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: hasAudiencia ? '#f59e0b' : '#ddd', marginTop: '0.25rem' }}>
                    {hasAudiencia && '📅 '}{email.subject}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#888', marginTop: '0.25rem' }}>De: {email.from}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {email.phase && <div style={{ fontSize: '0.65rem', color: '#3b82f6' }}>Fase: {email.phase}</div>}
                  {email.processNumber && <div style={{ fontSize: '0.65rem', color: '#8b5cf6' }}>Proc: {email.processNumber}</div>}
                </div>
              </div>

              {/* Extração detectada */}
              <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', borderRadius: '0.25rem', background: email.audienciaData ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: email.audienciaData ? '#10b981' : '#ef4444' }}>
                  Data: {email.audienciaData || 'NÃO DETECTADA'}
                </div>
                <div style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', borderRadius: '0.25rem', background: email.audienciaHora ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: email.audienciaHora ? '#10b981' : '#ef4444' }}>
                  Hora: {email.audienciaHora || 'NÃO DETECTADA'}
                </div>
                <div style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', borderRadius: '0.25rem', background: email.audienciaOrgao ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: email.audienciaOrgao ? '#10b981' : '#ef4444' }}>
                  Órgão: {email.audienciaOrgao || 'NÃO DETECTADO'}
                </div>
              </div>
            </div>

            {isExpanded && (
              <div style={{ padding: '1rem', borderTop: '1px solid #333', background: '#0a0a0f' }}>
                <div style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 700, marginBottom: '0.5rem' }}>
                  CONTEÚDO BRUTO DO E-MAIL (primeiros 3000 caracteres):
                </div>
                <pre style={{
                  fontSize: '0.7rem', color: '#ccc', lineHeight: 1.5,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  maxHeight: '400px', overflowY: 'auto',
                  background: '#050510', padding: '1rem', borderRadius: '0.5rem',
                }}>
                  {email.body?.substring(0, 3000) || '(sem corpo)'}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
