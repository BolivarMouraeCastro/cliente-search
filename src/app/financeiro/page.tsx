'use client';

import { useState, useRef } from 'react';

interface Transacao {
  id: string;
  data: string;
  descricao: string;
  nome: string;
  valor: number;
  valorFormatado: string;
  tipo: 'entrada' | 'saida';
  // Matched fields
  cliente: string;
  reclamada: string;
  processo: string;
  selecionado: boolean;
}

interface ContaReceber {
  cliente: string;
  processo: string;
  vencimento: string;
  valor: number;
  valorFormatado: string;
  status: string;
  descricao: string;
}

// ── PDF extraction ────────────────────────────────────────────────────
async function extractTextFromPDF(file: File): Promise<string> {
  const pdfjsUrl = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js';
  if (!(window as any).pdfjsLib) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = pdfjsUrl;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Falha ao carregar PDF.js'));
      document.head.appendChild(script);
    });
    (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = '';
  }
  const pdfjsLib = (window as any).pdfjsLib;
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer), disableWorker: true }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item: any) => item.str || '').join(' '));
  }
  return pages.join('\n');
}

// ── Parse bank statement ──────────────────────────────────────────────
function parseExtrato(text: string): Transacao[] {
  const transacoes: Transacao[] = [];
  let currentDate = '';

  // Match date headers like "25 de Maio de 2026"
  const MONTHS: Record<string, string> = {
    'janeiro': '01', 'fevereiro': '02', 'março': '03', 'marco': '03',
    'abril': '04', 'maio': '05', 'junho': '06',
    'julho': '07', 'agosto': '08', 'setembro': '09',
    'outubro': '10', 'novembro': '11', 'dezembro': '12',
  };

  // Split text into lines/segments
  const segments = text.split(/(?=\d{1,2}\s+de\s+\w+\s+de\s+\d{4}\s+Saldo)/i);

  for (const segment of segments) {
    // Extract date
    const dateMatch = segment.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})\s+Saldo/i);
    if (dateMatch) {
      const day = dateMatch[1].padStart(2, '0');
      const monthName = dateMatch[2].toLowerCase();
      const year = dateMatch[3];
      const month = MONTHS[monthName] || '01';
      currentDate = `${day}/${month}/${year}`;
    }

    if (!currentDate) continue;

    // Match PIX/Transfer transactions
    // Pattern: "Pix recebido: "Cp :XXXXX-NAME"     R$ X.XXX,XX"
    // Pattern: "Pix enviado: "Cp :XXXXX-NAME"      -R$ X.XXX,XX"
    // Pattern: "Transferencia recebida: "XXX"        R$ X.XXX,XX"
    const txPattern = /(Pix (?:recebido|enviado)|Transfer[eê]ncia recebida)[:\s]+"?(?:Cp\s*[:.]\s*[\d]*[-]?)?([^"]+)"?\s+(-?R\$\s*[\d.,]+)/gi;
    let match;

    while ((match = txPattern.exec(segment)) !== null) {
      const tipoRaw = match[1].toLowerCase();
      const nome = match[2].trim().replace(/^[-\s]+/, '').replace(/["]+$/, '');
      const valorStr = match[3].replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
      const valor = parseFloat(valorStr);

      if (isNaN(valor) || valor === 0) continue;

      const isEntrada = tipoRaw.includes('recebido') || tipoRaw.includes('recebida');
      const tipo = isEntrada ? 'entrada' : 'saida';

      transacoes.push({
        id: `tx-${transacoes.length}`,
        data: currentDate,
        descricao: match[0].substring(0, 100),
        nome: nome,
        valor: Math.abs(valor),
        valorFormatado: `R$ ${Math.abs(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        tipo,
        cliente: tipo === 'saida' ? nome : '',
        reclamada: tipo === 'entrada' ? nome : '',
        processo: '',
        selecionado: true,
      });
    }
  }

  return transacoes;
}

// ── Parse PROMAD financial report ─────────────────────────────────────
function parseContasReceber(text: string): ContaReceber[] {
  const contas: ContaReceber[] = [];

  // Pattern: CLIENT NAME\nPROCESS NUMBER\nDATE ... Value: R$ X.XXX,XX
  const blocks = text.split(/(?=[A-Z]{2,}[\sA-Z]*\.{3}\s*\n?\s*\d{7})/);

  for (const block of blocks) {
    // Try to extract client name + process
    const clientMatch = block.match(/([A-Z\u00C0-\u00FF][A-Z\u00C0-\u00FF\s\.]+?)[\s.]+(\d{7}-[\d.]+)/);
    if (!clientMatch) continue;

    const cliente = clientMatch[1].trim().replace(/\.{2,}$/, '').trim();
    const processo = clientMatch[2].trim();

    // Date
    const dateMatch = block.match(/(\d{2}\/\d{2}\/\d{4})/);
    const vencimento = dateMatch ? dateMatch[1] : '';

    // Value
    const valorMatch = block.match(/Valor:\s*R\$\s*([\d.,]+)/i);
    let valor = 0;
    let valorFormatado = '';
    if (valorMatch) {
      valor = parseFloat(valorMatch[1].replace(/\./g, '').replace(',', '.'));
      valorFormatado = `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    }

    // Status
    const isPago = /\bPago\b/i.test(block);
    const status = isPago ? 'Pago' : 'A vencer';

    // Description
    const descMatch = block.match(/Descri[çc][ãa]o:\s*(.+?)(?:\s*Valor|$)/i);
    const descricao = descMatch ? descMatch[1].trim() : '';

    if (cliente && processo) {
      contas.push({ cliente, processo, vencimento, valor, valorFormatado, status, descricao });
    }
  }

  return contas;
}

// ── Match transactions with PROMAD data ───────────────────────────────
function matchTransacoes(transacoes: Transacao[], contas: ContaReceber[]): Transacao[] {
  return transacoes.map(tx => {
    const txNome = tx.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    for (const conta of contas) {
      const contaNome = conta.cliente.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      // Check if names partially match (at least first+last name)
      const txWords = txNome.split(/\s+/).filter(w => w.length > 2);
      const contaWords = contaNome.split(/\s+/).filter(w => w.length > 2);

      let matchCount = 0;
      for (const tw of txWords) {
        if (contaWords.some(cw => cw.includes(tw) || tw.includes(cw))) matchCount++;
      }

      // Match if at least 2 words match, or if amounts are equal
      if (matchCount >= 2 || (matchCount >= 1 && Math.abs(tx.valor - conta.valor) < 0.01)) {
        return {
          ...tx,
          cliente: tx.tipo === 'saida' ? conta.cliente : tx.cliente,
          reclamada: tx.tipo === 'entrada' ? tx.nome : '',
          processo: conta.processo,
        };
      }
    }

    return tx;
  });
}

// ── Component ─────────────────────────────────────────────────────────
export default function FinanceiroPage() {
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [contas, setContas] = useState<ContaReceber[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filterTipo, setFilterTipo] = useState<'todos' | 'entrada' | 'saida'>('todos');
  const extratoRef = useRef<HTMLInputElement>(null);
  const promadRef = useRef<HTMLInputElement>(null);

  const handleExtrato = async (file: File) => {
    setLoading(true); setError('');
    try {
      const text = await extractTextFromPDF(file);
      const txs = parseExtrato(text);
      if (txs.length === 0) {
        setError('Nenhuma transação encontrada no extrato. Verifique se é um PDF do Banco Inter.');
        return;
      }
      // If we have PROMAD data, match
      const matched = contas.length > 0 ? matchTransacoes(txs, contas) : txs;
      setTransacoes(matched);
    } catch (err) {
      setError(`Erro ao processar extrato: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setLoading(false); }
  };

  const handlePromad = async (file: File) => {
    setLoading(true); setError('');
    try {
      const text = await extractTextFromPDF(file);
      const parsed = parseContasReceber(text);
      setContas(parsed);
      // Re-match existing transactions
      if (transacoes.length > 0 && parsed.length > 0) {
        setTransacoes(matchTransacoes(transacoes, parsed));
      }
    } catch (err) {
      setError(`Erro ao processar relatório: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setLoading(false); }
  };

  const handleSync = async () => {
    const selected = transacoes.filter(t => t.selecionado);
    if (selected.length === 0) { setError('Selecione pelo menos uma transação.'); return; }
    setSyncing(true); setError(''); setSuccess('');
    try {
      const payload = selected.map(t => ({
        cliente: t.tipo === 'saida' ? t.cliente || t.nome : t.cliente,
        reclamada: t.tipo === 'entrada' ? t.nome : t.reclamada,
        processo: t.processo,
        dataRecebimento: t.tipo === 'entrada' ? t.data : '',
        dataRepasse: t.tipo === 'saida' ? t.data : '',
        valor: t.valorFormatado,
        tipo: t.tipo === 'entrada' ? 'RECEBIDO' : 'REPASSE',
      }));

      const res = await fetch('/api/financeiro/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transacoes: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`✅ ${data.count} transação(ões) sincronizada(s) com a planilha!`);
    } catch (err) {
      setError(`Erro ao sincronizar: ${err instanceof Error ? err.message : String(err)}`);
    } finally { setSyncing(false); }
  };

  const toggleSelect = (id: string) => {
    setTransacoes(prev => prev.map(t => t.id === id ? { ...t, selecionado: !t.selecionado } : t));
  };

  const toggleAll = () => {
    const allSelected = filtered.every(t => t.selecionado);
    const filteredIds = new Set(filtered.map(t => t.id));
    setTransacoes(prev => prev.map(t => filteredIds.has(t.id) ? { ...t, selecionado: !allSelected } : t));
  };

  const filtered = transacoes.filter(t => filterTipo === 'todos' || t.tipo === filterTipo);
  const totalEntradas = transacoes.filter(t => t.tipo === 'entrada').reduce((s, t) => s + t.valor, 0);
  const totalSaidas = transacoes.filter(t => t.tipo === 'saida').reduce((s, t) => s + t.valor, 0);

  return (
    <div className="detail-page">
      <section className="hero">
        <h1 className="hero-title" style={{ fontSize: '1.8rem' }}>💰 Financeiro</h1>
        <p className="hero-subtitle">Suba o extrato bancário e o relatório do PROMAD para preencher a planilha automaticamente</p>
      </section>

      {/* Upload areas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
        {/* Extrato */}
        <div
          className="upload-dropzone"
          style={{ padding: '1.5rem', cursor: 'pointer' }}
          onClick={() => extratoRef.current?.click()}
        >
          <input ref={extratoRef} type="file" accept=".pdf" style={{ display: 'none' }}
            onChange={(e) => { if (e.target.files?.[0]) handleExtrato(e.target.files[0]); e.target.value = ''; }} />
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏦</div>
          <div className="upload-dropzone-title" style={{ fontSize: '0.9rem' }}>Extrato Bancário</div>
          <div className="upload-dropzone-desc" style={{ fontSize: '0.75rem' }}>PDF do Banco Inter</div>
          {transacoes.length > 0 && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#10b981' }}>
              ✅ {transacoes.length} transações carregadas
            </div>
          )}
        </div>

        {/* PROMAD */}
        <div
          className="upload-dropzone"
          style={{ padding: '1.5rem', cursor: 'pointer' }}
          onClick={() => promadRef.current?.click()}
        >
          <input ref={promadRef} type="file" accept=".pdf" style={{ display: 'none' }}
            onChange={(e) => { if (e.target.files?.[0]) handlePromad(e.target.files[0]); e.target.value = ''; }} />
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
          <div className="upload-dropzone-title" style={{ fontSize: '0.9rem' }}>Relatório PROMAD</div>
          <div className="upload-dropzone-desc" style={{ fontSize: '0.75rem' }}>Contas a receber (opcional)</div>
          {contas.length > 0 && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#10b981' }}>
              ✅ {contas.length} contas carregadas
            </div>
          )}
        </div>
      </div>

      {error && <div style={{ padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '0.75rem', color: '#ef4444', fontSize: '0.85rem', marginBottom: '1rem' }}>❌ {error}</div>}
      {success && <div style={{ padding: '0.75rem 1rem', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '0.75rem', color: '#10b981', fontSize: '0.85rem', marginBottom: '1rem' }}>{success}</div>}

      {loading && (
        <div className="agenda-loading">
          <div className="upload-spinner" style={{ width: 32, height: 32 }} />
          <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>Processando PDF...</p>
        </div>
      )}

      {/* Results */}
      {transacoes.length > 0 && !loading && (
        <>
          {/* Summary */}
          <div className="pub-summary" style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: '#10b981', fontWeight: 700, fontSize: '0.85rem' }}>
              ↓ Entradas: R$ {totalEntradas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
            <span style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.85rem' }}>
              ↑ Saídas: R$ {totalSaidas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
            <select className="agenda-filter" value={filterTipo} onChange={(e) => setFilterTipo(e.target.value as any)}>
              <option value="todos">Todos ({transacoes.length})</option>
              <option value="entrada">Entradas ({transacoes.filter(t => t.tipo === 'entrada').length})</option>
              <option value="saida">Saídas ({transacoes.filter(t => t.tipo === 'saida').length})</option>
            </select>
            <button
              onClick={handleSync}
              disabled={syncing}
              style={{
                marginLeft: 'auto', padding: '0.5rem 1.2rem', borderRadius: '999px',
                background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0a0a0f',
                border: 'none', fontWeight: 700, fontSize: '0.8rem', cursor: syncing ? 'wait' : 'pointer',
              }}
            >
              {syncing ? '⏳ Sincronizando...' : '📊 Sincronizar com Planilha'}
            </button>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.6rem 0.4rem', textAlign: 'left', width: '30px' }}>
                    <input type="checkbox" checked={filtered.every(t => t.selecionado)} onChange={toggleAll} />
                  </th>
                  <th style={{ padding: '0.6rem 0.4rem', textAlign: 'left' }}>DATA</th>
                  <th style={{ padding: '0.6rem 0.4rem', textAlign: 'left' }}>TIPO</th>
                  <th style={{ padding: '0.6rem 0.4rem', textAlign: 'left' }}>NOME</th>
                  <th style={{ padding: '0.6rem 0.4rem', textAlign: 'right' }}>VALOR</th>
                  <th style={{ padding: '0.6rem 0.4rem', textAlign: 'left' }}>PROCESSO</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tx) => (
                  <tr key={tx.id} style={{
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: tx.selecionado ? 'rgba(212,175,55,0.03)' : 'transparent',
                  }}>
                    <td style={{ padding: '0.5rem 0.4rem' }}>
                      <input type="checkbox" checked={tx.selecionado} onChange={() => toggleSelect(tx.id)} />
                    </td>
                    <td style={{ padding: '0.5rem 0.4rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{tx.data}</td>
                    <td style={{ padding: '0.5rem 0.4rem' }}>
                      <span style={{
                        padding: '0.15rem 0.5rem', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 700,
                        background: tx.tipo === 'entrada' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                        color: tx.tipo === 'entrada' ? '#10b981' : '#ef4444',
                      }}>
                        {tx.tipo === 'entrada' ? '↓ RECEBIDO' : '↑ REPASSE'}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem 0.4rem', color: 'var(--text-primary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.nome}
                    </td>
                    <td style={{
                      padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap',
                      color: tx.tipo === 'entrada' ? '#10b981' : '#ef4444',
                    }}>
                      {tx.tipo === 'saida' ? '-' : ''}{tx.valorFormatado}
                    </td>
                    <td style={{ padding: '0.5rem 0.4rem', color: tx.processo ? '#d4af37' : 'var(--text-muted)', fontSize: '0.72rem' }}>
                      {tx.processo || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {transacoes.length === 0 && !loading && (
        <div className="empty-state" style={{ marginTop: '2rem' }}>
          <div className="empty-state-icon">🏦</div>
          <div className="empty-state-title">Suba o extrato bancário</div>
          <div className="empty-state-desc">O sistema vai ler as transações e preencher a planilha automaticamente.</div>
        </div>
      )}
    </div>
  );
}
