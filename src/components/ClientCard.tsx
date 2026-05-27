'use client';

import { useRouter } from 'next/navigation';
import { Client } from '@/types';

interface ClientCardProps {
  client: Client;
}

function getStatusBadgeClass(status: string): string {
  const s = status.toLowerCase().trim();
  if (s.includes('ativo') || s.includes('active') || s.includes('em andamento'))
    return 'badge-ativo';
  if (s.includes('pendente') || s.includes('pending') || s.includes('aguardando'))
    return 'badge-pendente';
  if (s.includes('encerrado') || s.includes('closed') || s.includes('finalizado') || s.includes('arquivado'))
    return 'badge-encerrado';
  if (s.includes('urgente') || s.includes('urgent'))
    return 'badge-urgente';
  return 'badge-default';
}

export default function ClientCard({ client }: ClientCardProps) {
  const router = useRouter();

  const handleClick = () => {
    router.push(`/client/${encodeURIComponent(client.id)}`);
  };

  return (
    <div className="client-card" onClick={handleClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && handleClick()}>
      <div className="client-card-header">
        <div>
          <div className="client-card-name">{client.nome}</div>
          {client.empresa && (
            <div className="client-card-company">{client.empresa}</div>
          )}
        </div>
        {client.status && (
          <span className={`badge ${getStatusBadgeClass(client.status)}`}>
            <span className="badge-dot" />
            {client.status}
          </span>
        )}
      </div>

      {/* Entry date - prominent for distinguishing duplicate clients */}
      {client.entrada && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 0.75rem',
          background: 'rgba(59, 130, 246, 0.08)',
          borderRadius: '0.5rem',
          marginBottom: '0.75rem',
          border: '1px solid rgba(59, 130, 246, 0.15)',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span style={{ fontSize: '0.8rem', color: 'var(--accent-blue)', fontWeight: 600 }}>
            Entrada: {client.entrada}
          </span>
        </div>
      )}

      <div className="client-card-body">
        {client.materia && (
          <div className="client-card-meta">
            <svg className="client-card-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            {client.materia}
          </div>
        )}
        {client.responsavel && (
          <div className="client-card-meta">
            <svg className="client-card-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            {client.responsavel}
          </div>
        )}
        {client.funcao && (
          <div className="client-card-meta">
            <svg className="client-card-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
            {client.funcao}
          </div>
        )}
      </div>

      <div className="client-card-footer">
        <span className="client-card-date">
          {client.origem ? `Origem: ${client.origem}` : ''}
        </span>
        <svg className="client-card-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </div>
  );
}
