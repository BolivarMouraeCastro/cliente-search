'use client';

import { useState, useRef } from 'react';

interface LogEntry {
  fileId: string;
  fileName: string;
  parentFolder?: string;
  extractedCNJ?: string;
  matchedClient?: string;
  matchedRow?: string;
  status: string;
  message: string;
}

interface SyncResult {
  summary: {
    isTestMode: boolean;
    year: string;
    totalRecibosFound: number;
    totalFoldersScanned: number;
    batchProcessed: number;
    offset: number;
    nextOffset: number | null;
    hasMoreBatches: boolean;
    updated: number;
    skipped: number;
    errors: number;
    nextUrl: string | null;
  };
  logs: LogEntry[];
}

export default function SyncPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [allLogs, setAllLogs] = useState<LogEntry[]>([]);
  const [totalFound, setTotalFound] = useState(0);
  const [totalProcessed, setTotalProcessed] = useState(0);
  const [totalUpdated, setTotalUpdated] = useState(0);
  const [totalSkipped, setTotalSkipped] = useState(0);
  const [totalErrors, setTotalErrors] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Pronto para iniciar');
  const [isFinished, setIsFinished] = useState(false);
  const stopRef = useRef(false);

  const BATCH_SIZE = 10;

  async function runSync() {
    setIsRunning(true);
    setIsFinished(false);
    setAllLogs([]);
    setTotalFound(0);
    setTotalProcessed(0);
    setTotalUpdated(0);
    setTotalSkipped(0);
    setTotalErrors(0);
    stopRef.current = false;

    let offset = 0;
    let hasMore = true;
    let updatedTotal = 0;
    let skippedTotal = 0;
    let errorsTotal = 0;
    let processedTotal = 0;

    setStatusMessage('🔍 Buscando recibos no Drive...');

    while (hasMore && !stopRef.current) {
      try {
        const url = `/api/sync-recibos?year=2026&offset=${offset}&limit=${BATCH_SIZE}`;
        setStatusMessage(`⚙️ Processando lote ${Math.floor(offset / BATCH_SIZE) + 1} (arquivos ${offset + 1} a ${offset + BATCH_SIZE})...`);

        const res = await fetch(url);
        if (!res.ok) {
          const err = await res.json();
          setStatusMessage(`❌ Erro: ${err.error || 'Falha na requisição'}`);
          break;
        }

        const data: SyncResult = await res.json();

        setTotalFound(data.summary.totalRecibosFound);
        processedTotal += data.summary.batchProcessed;
        updatedTotal += data.summary.updated;
        skippedTotal += data.summary.skipped;
        errorsTotal += data.summary.errors;

        setTotalProcessed(processedTotal);
        setTotalUpdated(updatedTotal);
        setTotalSkipped(skippedTotal);
        setTotalErrors(errorsTotal);
        setAllLogs(prev => [...prev, ...data.logs]);

        hasMore = data.summary.hasMoreBatches;
        offset = data.summary.nextOffset || 0;

        if (hasMore) {
          // Pequena pausa entre lotes para não sobrecarregar
          await new Promise(r => setTimeout(r, 1000));
        }
      } catch (err: any) {
        setStatusMessage(`❌ Erro de rede: ${err.message}`);
        break;
      }
    }

    if (stopRef.current) {
      setStatusMessage('⏸️ Sincronização pausada pelo usuário.');
    } else {
      setStatusMessage(`✅ Concluído! ${updatedTotal} processos atualizados na planilha.`);
    }

    setIsFinished(true);
    setIsRunning(false);
  }

  function stopSync() {
    stopRef.current = true;
    setStatusMessage('⏸️ Parando após o lote atual...');
  }

  const getStatusColor = (status: string) => {
    if (status.includes('Gravado') || status.includes('Teste OK')) return '#10b981';
    if (status.includes('Erro')) return '#ef4444';
    if (status.includes('Atenção') || status.includes('Sem Match')) return '#f59e0b';
    if (status.includes('Ignorado') || status.includes('Já Preenchido')) return '#6b7280';
    return '#818cf8';
  };

  const progress = totalFound > 0 ? Math.round((totalProcessed / totalFound) * 100) : 0;

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          🤖 Robô de Sincronização de Recibos
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
          Varre todas as pastas de Distribuídos (incluindo subpastas), extrai o CNJ dos PDFs e atualiza a planilha automaticamente.
        </p>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {!isRunning ? (
          <button
            onClick={runSync}
            style={{
              padding: '0.75rem 2rem',
              fontSize: '1rem',
              fontWeight: 700,
              color: '#0a0a0f',
              background: 'linear-gradient(135deg, #d4af37, #f5d678)',
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(212, 175, 55, 0.3)',
              transition: 'all 0.2s',
            }}
          >
            🚀 Iniciar Sincronização (2026)
          </button>
        ) : (
          <button
            onClick={stopSync}
            style={{
              padding: '0.75rem 2rem',
              fontSize: '1rem',
              fontWeight: 700,
              color: '#fff',
              background: '#ef4444',
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer',
            }}
          >
            ⏸️ Parar
          </button>
        )}

        <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{statusMessage}</span>
      </div>

      {/* Progress Bar */}
      {totalFound > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>
            <span>{totalProcessed} de {totalFound} recibos processados</span>
            <span>{progress}%</span>
          </div>
          <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
            <div style={{
              width: `${progress}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #d4af37, #f5d678)',
              borderRadius: '999px',
              transition: 'width 0.5s ease',
            }} />
          </div>
        </div>
      )}

      {/* Stats Cards */}
      {totalFound > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#10b981' }}>{totalUpdated}</div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>ATUALIZADOS</div>
          </div>
          <div style={{ background: 'rgba(107, 114, 128, 0.1)', border: '1px solid rgba(107, 114, 128, 0.2)', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#6b7280' }}>{totalSkipped}</div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>IGNORADOS</div>
          </div>
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ef4444' }}>{totalErrors}</div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>ERROS</div>
          </div>
          <div style={{ background: 'rgba(212, 175, 55, 0.1)', border: '1px solid rgba(212, 175, 55, 0.2)', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#d4af37' }}>{totalFound}</div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>TOTAL RECIBOS</div>
          </div>
        </div>
      )}

      {/* Logs Table */}
      {allLogs.length > 0 && (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', fontWeight: 700, color: '#e2e8f0', fontSize: '0.9rem' }}>
            📋 Relatório Detalhado ({allLogs.length} registros)
          </div>
          <div style={{ maxHeight: '500px', overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(212,175,55,0.4) transparent' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.05)', position: 'sticky', top: 0 }}>
                  <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Pasta (Cliente)</th>
                  <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>CNJ Extraído</th>
                  <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Match Planilha</th>
                  <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', color: '#94a3b8', fontWeight: 600 }}>Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {allLogs.map((log, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '999px',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        background: `${getStatusColor(log.status)}22`,
                        color: getStatusColor(log.status),
                      }}>
                        {log.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', color: '#e2e8f0', fontWeight: 600 }}>{log.parentFolder || '—'}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: '#818cf8', fontFamily: 'monospace', fontSize: '0.75rem' }}>{log.extractedCNJ || '—'}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: '#94a3b8' }}>{log.matchedClient ? `${log.matchedClient} (L${log.matchedRow})` : '—'}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: '#64748b', fontSize: '0.75rem', maxWidth: '300px' }}>{log.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
