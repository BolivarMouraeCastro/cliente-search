'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import EmailTimeline from '@/components/EmailTimeline';
import FileList from '@/components/FileList';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Client, Email, DriveFile } from '@/types';

type TabKey = 'emails' | 'files' | 'data';

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

const dataLabels: Record<string, string> = {
  entrada: 'Data de Entrada',
  nome: 'Nome Completo',
  admissao: 'Data de Admissão',
  demissao: 'Data de Demissão',
  status: 'Status',
  materia: 'Matéria',
  origem: 'Origem',
  responsavel: 'Responsável',
  empresa: 'Nome da Empresa',
  funcao: 'Função',
};

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = decodeURIComponent(params.id as string);

  const [client, setClient] = useState<Client | null>(null);
  const [emails, setEmails] = useState<Email[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('emails');
  const [loadingClient, setLoadingClient] = useState(true);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);

  // Fetch client data
  useEffect(() => {
    async function fetchClient() {
      setLoadingClient(true);
      try {
        const res = await fetch(`/api/clients?id=${encodeURIComponent(clientId)}`);
        if (res.ok) {
          const data = await res.json();
          setClient(data.client || null);
        }
      } catch {
        setClient(null);
      } finally {
        setLoadingClient(false);
      }
    }
    fetchClient();
  }, [clientId]);

  // Fetch emails when tab is active and client is loaded
  useEffect(() => {
    if (!client || activeTab !== 'emails') return;

    async function fetchEmails() {
      setLoadingEmails(true);
      try {
        const res = await fetch(
          `/api/emails?clientName=${encodeURIComponent(client!.nome)}&clientId=${encodeURIComponent(client!.id)}`
        );
        if (res.ok) {
          const data = await res.json();
          setEmails(data.emails || []);

          // If status was auto-updated to DISTRIBUÍDO, refresh client data
          if (data.statusUpdated) {
            const clientRes = await fetch(`/api/clients?id=${encodeURIComponent(client!.id)}`);
            if (clientRes.ok) {
              const clientData = await clientRes.json();
              if (clientData.client) {
                setClient(clientData.client);
              }
            }
          }
        }
      } catch {
        setEmails([]);
      } finally {
        setLoadingEmails(false);
      }
    }
    fetchEmails();
  }, [client, activeTab]);

  // Fetch files when tab is active and client is loaded
  useEffect(() => {
    if (!client || activeTab !== 'files') return;

    async function fetchFiles() {
      setLoadingFiles(true);
      try {
        const res = await fetch(
          `/api/files?clientName=${encodeURIComponent(client!.nome)}&clientId=${encodeURIComponent(client!.id)}`
        );
        if (res.ok) {
          const data = await res.json();
          setFiles(data.files || []);

          // If status was auto-updated to DISTRIBUÍDO, refresh client data
          if (data.statusUpdated) {
            const clientRes = await fetch(`/api/clients?id=${encodeURIComponent(client!.id)}`);
            if (clientRes.ok) {
              const clientData = await clientRes.json();
              if (clientData.client) {
                setClient(clientData.client);
              }
            }
          }
        }
      } catch {
        setFiles([]);
      } finally {
        setLoadingFiles(false);
      }
    }
    fetchFiles();
  }, [client, activeTab]);

  if (loadingClient) {
    return (
      <div className="detail-page">
        <div className="loading-center">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="detail-page">
        <button className="back-button" onClick={() => router.push('/')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Voltar
        </button>
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div className="empty-state-title">Cliente não encontrado</div>
          <div className="empty-state-desc">
            O cliente solicitado não foi encontrado na base de dados. Volte e tente novamente.
          </div>
        </div>
      </div>
    );
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'emails', label: 'Andamento Processual' },
    { key: 'files', label: 'Documentos' },
    { key: 'data', label: 'Dados do Cliente' },
  ];

  return (
    <div className="detail-page">
      {/* Back Button */}
      <button className="back-button" onClick={() => router.push('/')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Voltar à busca
      </button>

      {/* Client Header */}
      <div className="client-detail-header">
        <div className="client-detail-name">{client.nome}</div>
        {client.empresa && (
          <div className="client-detail-company">{client.empresa}</div>
        )}
        <div className="client-detail-badges">
          {client.status && (
            <span className={`badge ${getStatusBadgeClass(client.status)}`}>
              <span className="badge-dot" />
              {client.status}
            </span>
          )}
          {client.materia && (
            <span className="badge badge-default">
              <span className="badge-dot" />
              {client.materia}
            </span>
          )}
          {client.origem && (
            <span className="badge badge-default">
              <span className="badge-dot" />
              {client.origem}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="animate-fade-in">
        {activeTab === 'emails' && (
          loadingEmails ? (
            <div className="loading-center">
              <LoadingSpinner size="md" />
            </div>
          ) : (
            <EmailTimeline emails={emails} />
          )
        )}

        {activeTab === 'files' && (
          loadingFiles ? (
            <div className="loading-center">
              <LoadingSpinner size="md" />
            </div>
          ) : (
            <FileList files={files} />
          )
        )}

        {activeTab === 'data' && (
          <div className="data-grid">
            {Object.entries(dataLabels).map(([key, label]) => {
              const value = client[key as keyof Client];
              return (
                <div key={key} className="data-card">
                  <div className="data-card-label">{label}</div>
                  <div className="data-card-value">
                    {value || '—'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
