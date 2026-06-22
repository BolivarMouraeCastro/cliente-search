'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import EmailTimeline from '@/components/EmailTimeline';
import FileList from '@/components/FileList';
import MovementsTimeline from '@/components/MovementsTimeline';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Client, Email, DriveFile } from '@/types';

type TabKey = 'emails' | 'movements' | 'files' | 'data';

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
  numeroProcesso: 'Número do Processo',
};

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = decodeURIComponent(params.id as string);

  const [client, setClient] = useState<Client | null>(null);
  const [emails, setEmails] = useState<Email[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [hearings, setHearings] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [movements, setMovements] = useState<any>(null);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [movementsError, setMovementsError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('emails');
  const [loadingClient, setLoadingClient] = useState(true);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);

  // Report state
  const [reportLoading, setReportLoading] = useState(false);
  const [reportText, setReportText] = useState<string | null>(null);
  const [reportError, setReportError] = useState('');

  const handleGenerateReport = async () => {
    if (reportText) {
      setReportText(null);
      return;
    }
    if (!client) return;
    setReportLoading(true);
    setReportError('');
    try {
      const res = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: client.nome,
          emails: emails.slice(0, 20).map((e) => ({
            subject: e.subject,
            date: e.date,
            snippet: e.snippet,
          })),
          files: files.slice(0, 15).map((f) => ({
            name: f.name,
            modifiedTime: f.modifiedTime,
          })),
          hearings: hearings.map((h: any) => ({
            data: h.dataAudiencia,
            horario: h.horario,
            tipo: h.tipoAudiencia,
            orgao: h.orgaoJulgador,
            isFuture: h.isFuture,
          })),
          movements: movements?.movements?.slice(0, 15)?.map((m: any) => ({
            name: m.name,
            date: m.date,
            complement: m.complement,
          })) || [],
          processNumber: client.numeroProcesso,
          empresa: client.empresa,
        }),
      });
      const data = await res.json();
      if (res.ok && data.report) {
        setReportText(data.report);
      } else {
        setReportError(data.error || 'Erro ao gerar relatório');
      }
    } catch {
      setReportError('Erro de conexão ao gerar relatório');
    } finally {
      setReportLoading(false);
    }
  };

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

  // Fetch emails and files when client is loaded
  useEffect(() => {
    if (!client) return;

    async function fetchData() {
      setLoadingEmails(true);
      setLoadingFiles(true);
      try {
        // Fetch Emails — passa data de entrada para filtrar processos antigos
        const emailParams = new URLSearchParams({
          clientName: client!.nome,
          clientId: client!.id,
        });
        if (client!.numeroProcesso) emailParams.set('processNumber', client!.numeroProcesso);
        if (client!.entrada) emailParams.set('entrada', client!.entrada);

        const resEmails = await fetch(`/api/emails?${emailParams.toString()}`);
        let emailsData = [];
        if (resEmails.ok) {
          const data = await resEmails.json();
          emailsData = data.emails || [];
          setEmails(emailsData);
          if (data.statusUpdated) {
            const clientRes = await fetch(`/api/clients?id=${encodeURIComponent(client!.id)}`);
            if (clientRes.ok) {
              const clientData = await clientRes.json();
              if (clientData.client) setClient(clientData.client);
            }
          }
        }

        // Fetch Files
        const resFiles = await fetch(
          `/api/files?clientName=${encodeURIComponent(client!.nome)}&clientId=${encodeURIComponent(client!.id)}`
        );
        let filesData = [];
        if (resFiles.ok) {
          const data = await resFiles.json();
          filesData = data.files || [];
          setFiles(filesData);
        }

        // Fetch Hearings (from external spreadsheet)
        try {
          const hearingParams = new URLSearchParams({ clientName: client!.nome });
          if (client!.numeroProcesso) hearingParams.set('processNumber', client!.numeroProcesso);
          if (client!.entrada) hearingParams.set('entrada', client!.entrada);

          const resHearings = await fetch(`/api/hearings?${hearingParams.toString()}`);
          if (resHearings.ok) {
            const hearingsData = await resHearings.json();
            setHearings(hearingsData.hearings || []);
          }
        } catch {
          setHearings([]);
        }
      } catch {
        setEmails([]);
        setFiles([]);
      } finally {
        setLoadingEmails(false);
        setLoadingFiles(false);
      }
    }
    fetchData();
  }, [client?.id]);

  // Fetch movements from DataJud EAGERLY when client loads
  // (not just when tab is clicked — we need the real phase for all views)
  useEffect(() => {
    if (!client) return;
    const processNum = client.numeroProcesso;
    if (!processNum || processNum.trim() === '' || movements) return;

    async function fetchMovements() {
      setLoadingMovements(true);
      setMovementsError(null);
      try {
        const res = await fetch(
          `/api/movements?processNumber=${encodeURIComponent(processNum!)}`
        );
        if (res.ok) {
          const data = await res.json();
          setMovements(data);
        } else {
          const err = await res.json();
          setMovementsError(err.error || 'Erro ao consultar DataJud');
        }
      } catch {
        setMovementsError('Erro de conexão com DataJud');
      } finally {
        setLoadingMovements(false);
      }
    }
    fetchMovements();
  }, [client?.id]);

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
    { key: 'movements', label: '🏛️ Movimentações (CNJ)' },
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
        {client.numeroProcesso && (
          <div style={{ fontSize: '0.85rem', color: 'var(--accent-purple, #8b5cf6)', fontFamily: 'monospace', fontWeight: 600, marginTop: '0.25rem' }}>
            Processo: {client.numeroProcesso}
          </div>
        )}
        <div className="client-detail-badges">
          {(() => {
            // Filter hearings for THIS specific process
            const processFilteredHearings = client.numeroProcesso
              ? hearings.filter((h) => h.numeroProcesso && (
                  h.numeroProcesso.includes(client.numeroProcesso!) ||
                  client.numeroProcesso!.includes(h.numeroProcesso)
                ))
              : hearings;
            const hasFutureHearing = processFilteredHearings.some((h) => h.isFuture);
            
            // Priority: DataJud > Future hearing > Spreadsheet status
            let displayStatus = client.status;
            let badgeClass = getStatusBadgeClass(client.status || '');
            
            if (movements?.currentPhase?.name) {
              displayStatus = movements.currentPhase.name.toUpperCase();
              badgeClass = getStatusBadgeClass(displayStatus);
            }
            if (hasFutureHearing) {
              displayStatus = 'AUDIÊNCIA MARCADA';
              badgeClass = 'badge-pendente';
            }
            
            return displayStatus ? (
              <span className={`badge ${badgeClass}`}>
                <span className="badge-dot" />
                {displayStatus}
              </span>
            ) : null;
          })()}
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
        {client.status?.toUpperCase().trim() === 'ARQUIVADO' && (
          <div style={{
            marginTop: '1rem',
            padding: '0.75rem 1rem',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ef4444' }}>Processo Arquivado</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Este processo foi encerrado (certidão de arquivamento ou trânsito em julgado detectado).</div>
            </div>
          </div>
        )}
        {client.status?.toUpperCase().trim() === 'BOLIVAR' && (
          <div style={{
            marginTop: '1rem',
            padding: '0.75rem 1rem',
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-blue)' }}>Processo Novo (Bolivar)</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Este processo está aguardando distribuição. Ainda não possui número de processo judicial.</div>
            </div>
          </div>
        )}
      </div>

      {/* Report Button */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button
          onClick={handleGenerateReport}
          disabled={reportLoading}
          className="report-generate-btn"
        >
          {reportLoading ? (
            <>
              <div className="upload-spinner" style={{ width: 16, height: 16 }} />
              Gerando...
            </>
          ) : reportText ? (
            <>📋 Fechar Relatório</>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              Gerar Relatório
            </>
          )}
        </button>
        {reportError && (
          <span style={{ color: 'var(--error)', fontSize: '0.8rem', alignSelf: 'center' }}>{reportError}</span>
        )}
      </div>

      {/* Report Display */}
      {reportText && (
        <div className="report-container">
          <div className="report-header">
            <span className="report-title">📋 Relatório de Andamento Processual</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="report-action-btn"
                onClick={() => {
                  navigator.clipboard.writeText(reportText);
                  alert('Relatório copiado!');
                }}
              >
                📋 Copiar
              </button>
              <button
                className="report-action-btn whatsapp"
                onClick={() => {
                  const text = encodeURIComponent(`📋 *Relatório — ${client.nome}*\n\n${reportText}`);
                  window.open(`https://wa.me/?text=${text}`, '_blank');
                }}
              >
                💬 WhatsApp
              </button>
            </div>
          </div>
          <div className="report-body" dangerouslySetInnerHTML={{
            __html: reportText
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/\n/g, '<br/>')
              .replace(/^- /gm, '• ')
          }} />
        </div>
      )}

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
            <EmailTimeline
              emails={emails}
              hearings={hearings}
              clientProcessNumber={client?.numeroProcesso}
              datajudPhase={movements?.currentPhase || null}
            />
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

        {activeTab === 'movements' && (
          client?.numeroProcesso ? (
            <MovementsTimeline
              movements={movements?.movements || []}
              materiasSummary={movements?.materiasSummary || []}
              tribunal={movements?.tribunal || ''}
              classe={movements?.classe || ''}
              assunto={movements?.assunto || ''}
              orgaoJulgador={movements?.orgaoJulgador || ''}
              totalMovements={movements?.totalMovements || 0}
              loading={loadingMovements}
              error={movementsError}
              currentPhase={movements?.currentPhase || null}
            />
          ) : (
            <div style={{
              background: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              borderRadius: '0.75rem', padding: '2rem', textAlign: 'center',
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📭</div>
              <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                Número de processo não encontrado
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                O processo precisa ter um número para consultar movimentações no DataJud.
              </div>
            </div>
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
