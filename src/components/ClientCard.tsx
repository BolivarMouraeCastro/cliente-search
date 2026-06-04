'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
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

interface ReportData {
  fase: string;
  resumo: string;
  audiencia?: string;
  processo?: string;
  empresa?: string;
  emailCount: number;
  movimentacoes: number;
}

export default function ClientCard({ client }: ClientCardProps) {
  const router = useRouter();
  const [showReport, setShowReport] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [reportError, setReportError] = useState('');

  const handleClick = () => {
    router.push(`/client/${encodeURIComponent(client.id)}`);
  };

  const handleGenerateReport = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (showReport && reportData) {
      setShowReport(false);
      return;
    }

    setShowReport(true);
    setReportLoading(true);
    setReportError('');

    try {
      let emailData: any = { emails: [] };
      let movData: any = { movements: [], currentPhase: '' };

      if (client.numeroProcesso) {
        // HAS process number → search ONLY by process number (not by name) to avoid mixing
        try {
          const emailRes = await fetch(
            `/api/emails?clientName=${encodeURIComponent(client.nome)}&clientId=${encodeURIComponent(client.id)}&processNumber=${encodeURIComponent(client.numeroProcesso)}`
          );
          if (emailRes.ok) emailData = await emailRes.json();
        } catch { /* continue */ }

        // Fetch DataJud movements for THIS specific process
        try {
          const movRes = await fetch(`/api/movements?processNumber=${encodeURIComponent(client.numeroProcesso)}`);
          if (movRes.ok) movData = await movRes.json();
        } catch { /* continue */ }
      }
      // If NO process number → don't search emails (would mix data from other processes)
      // Use only the spreadsheet status

      // Determine phase: DataJud (most precise) > email detection > spreadsheet status
      const rawPhase = movData.currentPhase;
      const phaseFromMov = rawPhase ? (typeof rawPhase === 'string' ? rawPhase : rawPhase.name || rawPhase.simple || '') : '';
      const fase = phaseFromMov || (client.numeroProcesso ? (emailData.newStatus || client.status) : client.status) || 'Sem informação';

      // Find next hearing (only from emails of THIS process)
      let audiencia = '';
      for (const email of (emailData.emails || [])) {
        if (email.hearingDate) {
          const hDate = new Date(email.hearingDate);
          if (hDate > new Date()) {
            audiencia = `${String(hDate.getDate()).padStart(2, '0')}/${String(hDate.getMonth() + 1).padStart(2, '0')}/${hDate.getFullYear()}`;
            if (email.hearingType) audiencia += ` (${email.hearingType})`;
            break;
          }
        }
      }

      // Build friendly summary
      const faseUpper = fase.toUpperCase();
      let resumo = '';
      const nomeCliente = client.nome;
      const empresaCliente = client.empresa || 'a empresa';
      const numProcesso = client.numeroProcesso || '';

      if (!client.numeroProcesso) {
        resumo = `O processo de ${nomeCliente} contra ${empresaCliente} ainda não possui número de processo. Status atual: ${fase}. A equipe está acompanhando.`;
      } else if (faseUpper.includes('DISTRIBUÍ') || faseUpper.includes('DISTRIBUI')) {
        resumo = `O processo de ${nomeCliente} contra ${empresaCliente} foi distribuído na Justiça com o número ${numProcesso}. Estamos aguardando a marcação da audiência.`;
      } else if (faseUpper.includes('CITAÇÃO') || faseUpper.includes('CITACAO')) {
        resumo = `A empresa ${empresaCliente} foi notificada (citada) sobre o processo nº ${numProcesso} de ${nomeCliente}. Próximo passo: audiência.`;
      } else if (faseUpper.includes('AUDIÊNCIA') || faseUpper.includes('AUDIENCIA')) {
        resumo = `O processo nº ${numProcesso} de ${nomeCliente} está na fase de Audiência.${audiencia ? ` Próxima audiência: ${audiencia}.` : ''} O advogado está acompanhando.`;
      } else if (faseUpper.includes('PERÍCIA') || faseUpper.includes('PERICIA')) {
        resumo = `O processo nº ${numProcesso} de ${nomeCliente} está na fase de Perícia. Um perito foi designado para avaliar as questões técnicas.`;
      } else if (faseUpper.includes('SENTENÇA') || faseUpper.includes('SENTENCA')) {
        resumo = `O juiz proferiu a Sentença no processo nº ${numProcesso} de ${nomeCliente} contra ${empresaCliente}. O advogado está analisando.`;
      } else if (faseUpper.includes('RECURSO')) {
        resumo = `O processo nº ${numProcesso} de ${nomeCliente} está na fase de Recurso. Aguardando análise do tribunal superior.`;
      } else if (faseUpper.includes('ACÓRDÃO') || faseUpper.includes('ACORDAO')) {
        resumo = `O tribunal proferiu o Acórdão no processo nº ${numProcesso} de ${nomeCliente}.`;
      } else if (faseUpper.includes('EXECUÇÃO') || faseUpper.includes('EXECUCAO')) {
        resumo = `O processo nº ${numProcesso} de ${nomeCliente} está na fase de Execução — cumprimento/cobrança da decisão judicial.`;
      } else if (faseUpper.includes('TRÂNSITO') || faseUpper.includes('TRANSITO')) {
        resumo = `O processo nº ${numProcesso} de ${nomeCliente} transitou em julgado — decisão definitiva.`;
      } else if (faseUpper.includes('ARQUIVADO') || faseUpper.includes('ENCERRADO')) {
        resumo = `O processo nº ${numProcesso} de ${nomeCliente} contra ${empresaCliente} foi finalizado e arquivado.`;
      } else if (faseUpper.includes('BOLIVAR') || faseUpper.includes('FAZER INICIAL')) {
        resumo = `O processo de ${nomeCliente} está em fase inicial — a petição inicial está sendo elaborada.`;
      } else {
        resumo = `O processo${numProcesso ? ` nº ${numProcesso}` : ''} de ${nomeCliente} contra ${empresaCliente} está com status "${fase}".`;
      }

      setReportData({
        fase,
        resumo,
        audiencia: audiencia || undefined,
        processo: client.numeroProcesso || undefined,
        empresa: client.empresa || undefined,
        emailCount: emailData.emails?.length || 0,
        movimentacoes: movData.movements?.length || 0,
      });
    } catch (err: any) {
      console.error('Report error:', err);
      setReportError(`Erro: ${err?.message || 'Falha ao gerar relatório'}`);
    } finally {
      setReportLoading(false);
    }
  };

  const handleCopyReport = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!reportData) return;
    const text = `📋 Relatório — ${client.nome}\n\n` +
      `📌 Fase atual: ${reportData.fase}\n` +
      (reportData.processo ? `📄 Processo: ${reportData.processo}\n` : '') +
      (reportData.empresa ? `🏢 Empresa: ${reportData.empresa}\n` : '') +
      (reportData.audiencia ? `📅 Próxima audiência: ${reportData.audiencia}\n` : '') +
      `\n${reportData.resumo}`;
    navigator.clipboard.writeText(text);
  };

  const handleWhatsApp = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!reportData) return;
    const msg = `Olá! Aqui é do escritório *BM&C Advogados*. Segue atualização do seu processo:\n\n` +
      `📌 *Fase atual:* ${reportData.fase}\n` +
      (reportData.processo ? `📄 *Processo:* ${reportData.processo}\n` : '') +
      (reportData.audiencia ? `📅 *Próxima audiência:* ${reportData.audiencia}\n` : '') +
      `\n${reportData.resumo}\n\nQualquer dúvida, estamos à disposição! 🤝`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
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
        {client.status?.toUpperCase().trim() === 'ARQUIVADO' && (
          <span style={{
            fontSize: '0.65rem',
            fontWeight: 700,
            color: '#ef4444',
            background: 'rgba(239, 68, 68, 0.1)',
            padding: '0.15rem 0.5rem',
            borderRadius: '0.25rem',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            letterSpacing: '0.05em',
          }}>
            ENCERRADO
          </span>
        )}
      </div>

      {/* Entry date */}
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

      {/* Número do processo */}
      {client.numeroProcesso && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.4rem 0.75rem',
          background: 'rgba(139, 92, 246, 0.08)',
          borderRadius: '0.5rem',
          marginBottom: '0.75rem',
          border: '1px solid rgba(139, 92, 246, 0.15)',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-purple, #8b5cf6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <span style={{ fontSize: '0.75rem', color: 'var(--accent-purple, #8b5cf6)', fontWeight: 600, fontFamily: 'monospace' }}>
            {client.numeroProcesso}
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

      {/* Generate Report Button */}
      <div style={{ padding: '0 0.75rem 0.5rem', display: 'flex', gap: '0.5rem' }}>
        <button
          onClick={handleGenerateReport}
          style={{
            flex: 1,
            padding: '0.55rem 0.75rem',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            background: showReport && reportData
              ? 'rgba(212, 175, 55, 0.15)'
              : 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1))',
            border: showReport && reportData
              ? '1px solid rgba(212, 175, 55, 0.3)'
              : '1px solid rgba(139, 92, 246, 0.2)',
            color: showReport && reportData ? '#d4af37' : '#a78bfa',
            fontWeight: 600,
            fontSize: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
            transition: 'all 0.2s',
          }}
        >
          📋 {showReport && reportData ? 'Fechar Relatório' : 'Gerar Relatório'}
        </button>
      </div>

      {/* Report Panel */}
      {showReport && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            margin: '0 0.75rem 0.75rem',
            padding: '1rem',
            background: 'rgba(14, 14, 20, 0.8)',
            border: '1px solid rgba(212, 175, 55, 0.2)',
            borderRadius: '0.75rem',
            animation: 'fadeIn 0.3s ease',
          }}
        >
          {reportLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'center', padding: '1rem' }}>
              <div className="shimmer" style={{ width: '20px', height: '20px', borderRadius: '50%' }} />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Buscando emails e movimentações...</span>
            </div>
          ) : reportError ? (
            <div style={{ fontSize: '0.8rem', color: '#ef4444', textAlign: 'center' }}>{reportError}</div>
          ) : reportData ? (
            <>
              {/* Phase Badge */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem',
                padding: '0.5rem 0.75rem', background: 'rgba(212, 175, 55, 0.08)', borderRadius: '0.5rem',
                border: '1px solid rgba(212, 175, 55, 0.15)',
              }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 500 }}>FASE ATUAL:</span>
                <span style={{ fontSize: '0.8rem', color: '#d4af37', fontWeight: 700 }}>{reportData.fase}</span>
              </div>

              {/* Stats */}
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div style={{
                  flex: 1, padding: '0.4rem', background: 'rgba(59, 130, 246, 0.06)', borderRadius: '0.4rem',
                  textAlign: 'center', border: '1px solid rgba(59, 130, 246, 0.1)',
                }}>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--accent-blue)' }}>{reportData.emailCount}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Emails</div>
                </div>
                <div style={{
                  flex: 1, padding: '0.4rem', background: 'rgba(139, 92, 246, 0.06)', borderRadius: '0.4rem',
                  textAlign: 'center', border: '1px solid rgba(139, 92, 246, 0.1)',
                }}>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#a78bfa' }}>{reportData.movimentacoes}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Movimentações</div>
                </div>
              </div>

              {/* Hearing */}
              {reportData.audiencia && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem',
                  padding: '0.5rem 0.75rem', background: 'rgba(34, 197, 94, 0.08)', borderRadius: '0.5rem',
                  border: '1px solid rgba(34, 197, 94, 0.15)',
                }}>
                  <span style={{ fontSize: '1rem' }}>📅</span>
                  <span style={{ fontSize: '0.78rem', color: '#22c55e', fontWeight: 600 }}>Próxima audiência: {reportData.audiencia}</span>
                </div>
              )}

              {/* Summary */}
              <div style={{
                fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6,
                padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0.5rem',
                marginBottom: '0.75rem', borderLeft: '3px solid rgba(212, 175, 55, 0.3)',
              }}>
                {reportData.resumo}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={handleCopyReport}
                  style={{
                    flex: 1, padding: '0.5rem', borderRadius: '0.4rem', cursor: 'pointer',
                    background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.2)',
                    color: '#a78bfa', fontWeight: 600, fontSize: '0.7rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
                    transition: 'all 0.2s',
                  }}
                >
                  📄 Copiar
                </button>
                <button
                  onClick={handleWhatsApp}
                  style={{
                    flex: 1, padding: '0.5rem', borderRadius: '0.4rem', cursor: 'pointer',
                    background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)',
                    color: '#22c55e', fontWeight: 600, fontSize: '0.7rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
                    transition: 'all 0.2s',
                  }}
                >
                  💬 WhatsApp
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}

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
