'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface LogEntry {
  row: string;
  clientName: string;
  currentStatus?: string;
  matchedHearing?: string;
  cnj?: string;
  status: string;
  message: string;
}

export default function SyncAudienciasPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [allLogs, setAllLogs] = useState<LogEntry[]>([]);
  const [totalSemProcesso, setTotalSemProcesso] = useState(0);
  const [totalProcessed, setTotalProcessed] = useState(0);
  const [totalUpdated, setTotalUpdated] = useState(0);
  const [totalNotFound, setTotalNotFound] = useState(0);
  const [totalErrors, setTotalErrors] = useState(0);
  const [statusMessage, setStatusMessage] = useState('🚀 Iniciando...');
  const [isFinished, setIsFinished] = useState(false);
  const stopRef = useRef(false);
  const hasStarted = useRef(false);

  const BATCH_SIZE = 30;

  const runSync = useCallback(async () => {
    setIsRunning(true);
    setIsFinished(false);
    setAllLogs([]);
    setTotalSemProcesso(0);
    setTotalProcessed(0);
    setTotalUpdated(0);
    setTotalNotFound(0);
    setTotalErrors(0);
    stopRef.current = false;

    let offset = 0;
    let hasMore = true;
    let updatedTotal = 0;
    let notFoundTotal = 0;
    let errorsTotal = 0;
    let processedTotal = 0;

    setStatusMessage('🔍 Cruzando planilha de audiências com planilha de entrada...');

    while (hasMore && !stopRef.current) {
      try {
        const url = `/api/sync-audiencias?offset=${offset}&limit=${BATCH_SIZE}`;
        setStatusMessage(`⚙️ Processando lote ${Math.floor(offset / BATCH_SIZE) + 1}...`);

        const res = await fetch(url);
        if (!res.ok) {
          let errMsg = 'Falha na requisição';
          try { const err = await res.json(); errMsg = err.error || errMsg; } catch { /* */ }
          setStatusMessage(`❌ Erro: ${errMsg}`);
          break;
        }

        const data = await res.json();

        setTotalSemProcesso(data.summary.totalClientesSemProcesso);
        processedTotal += data.summary.batchProcessed;
        updatedTotal += data.summary.updated;
        notFoundTotal += data.summary.notFound;
        errorsTotal += data.summary.errors;

        setTotalProcessed(processedTotal);
        setTotalUpdated(updatedTotal);
        setTotalNotFound(notFoundTotal);
        setTotalErrors(errorsTotal);
        setAllLogs(prev => [...prev, ...data.logs]);

        hasMore = data.summary.hasMoreBatches;
        offset = data.summary.nextUrl ? parseInt(new URL(data.summary.nextUrl, 'http://x').searchParams.get('offset') || '0') : 0;

        if (hasMore) {
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido';
        setStatusMessage(`❌ Erro de rede: ${message}`);
        break;
      }
    }

    if (stopRef.current) {
      setStatusMessage('⏸️ Pausado.');
    } else {
      setStatusMessage(`✅ Concluído! ${updatedTotal} processos atualizados na planilha.`);
    }
    setIsFinished(true);
    setIsRunning(false);
  }, []);

  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      runSync();
    }
  }, [runSync]);

  const getStatusColor = (status: string) => {
    if (status.includes('Gravado') || status.includes('Teste OK')) return '#10b981';
    if (status.includes('Erro')) return '#ef4444';
    if (status.includes('Sem Match')) return '#f59e0b';
    if (status.includes('Já Distribu')) return '#6b7280';
    return '#818cf8';
  };

  const progress = totalSemProcesso > 0 ? Math.round((totalProcessed / totalSemProcesso) * 100) : 0;

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '0.5rem' }}>
          🔗 Cruzamento: Audiências → Entrada de Processo
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
          Busca o nº do processo (CNJ) na planilha de audiências e preenche na planilha de entrada (Coluna K + Status DISTRIBUÍDO).
        </p>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'center' }}>
        {!isRunning && isFinished && (
          <button onClick={runSync} style={{
            padding: '0.75rem 2rem', fontSize: '1rem', fontWeight: 700, color: '#0a0a0f',
            background: 'linear-gradient(135deg, #d4af37, #f5d678)', border: 'none',
            borderRadius: '12px', cursor: 'pointer', boxShadow: '0 4px 15px rgba(212, 175, 55, 0.3)',
          }}>🔄 Rodar Novamente</button>
        )}
        {isRunning && (
          <button onClick={() => { stopRef.current = true; }} style={{
            padding: '0.75rem 2rem', fontSize: '1rem', fontWeight: 700, color: '#fff',
            background: '#ef4444', border: 'none', borderRadius: '12px', cursor: 'pointer',
          }}>⏸️ Parar</button>
        )}
        <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{statusMessage}</span>
      </div>

      {totalSemProcesso > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>
            <span>{totalProcessed} de {totalSemProcesso} clientes verificados</span>
            <span>{progress}%</span>
          </div>
          <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '999px', overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #d4af37, #f5d678)', borderRadius: '999px', transition: 'width 0.5s ease' }} />
          </div>
        </div>
      )}

      {totalSemProcesso > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#10b981' }}>{totalUpdated}</div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>ATUALIZADOS</div>
          </div>
          <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f59e0b' }}>{totalNotFound}</div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>SEM MATCH</div>
          </div>
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '12px', padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ef4444' }}>{totalErrors}</div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>ERROS</div>
          </div>
        </div>
      )}

      {allLogs.length > 0 && (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', fontWeight: 700, color: '#e2e8f0', fontSize: '0.9rem' }}>
            📋 Relatório ({allLogs.length} registros)
          </div>
          <div style={{ maxHeight: '500px', overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'rgba(212,175,55,0.4) transparent' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.05)', position: 'sticky', top: 0 }}>
                  <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', color: '#94a3b8' }}>Status</th>
                  <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', color: '#94a3b8' }}>Linha</th>
                  <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', color: '#94a3b8' }}>Cliente (Entrada)</th>
                  <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', color: '#94a3b8' }}>CNJ Encontrado</th>
                  <th style={{ padding: '0.6rem 0.75rem', textAlign: 'left', color: '#94a3b8' }}>Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {allLogs.map((log, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      <span style={{
                        display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '999px',
                        fontSize: '0.7rem', fontWeight: 700,
                        background: `${getStatusColor(log.status)}22`, color: getStatusColor(log.status),
                      }}>{log.status}</span>
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', color: '#94a3b8' }}>{log.row}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: '#e2e8f0', fontWeight: 600 }}>{log.clientName}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: '#818cf8', fontFamily: 'monospace', fontSize: '0.75rem' }}>{log.cnj || '—'}</td>
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
