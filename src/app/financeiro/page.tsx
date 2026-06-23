'use client';

import { useState, useRef, useEffect } from 'react';

interface Transacao {
  id: string;
  data: string;
  nome: string;
  valor: number;
  valorFormatado: string;
  tipo: 'entrada' | 'saida';
  categoria: 'alvara' | 'acordo' | 'outros';
  cliente: string;
  processo: string;
  parcelas: string;
}

interface ContaReceber {
  cliente: string;
  processo: string;
  vencimento: string;
  valor: number;
  status: string;
  descricao: string;
  parcela: string;
}

// ── Donut Chart Component ─────────────────────────────────────────────
function DonutChart({ segments, total, label, onClick }: {
  segments: { value: number; color: string; label: string }[];
  total: number;
  label: string;
  onClick?: () => void;
}) {
  const size = 180;
  const strokeWidth = 28;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        {/* Background circle */}
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={strokeWidth} />
        {/* Segments */}
        {segments.map((seg, i) => {
          const pct = total > 0 ? seg.value / total : 0;
          const dashArray = `${pct * circumference} ${circumference}`;
          const el = (
            <circle
              key={i}
              cx={size / 2} cy={size / 2} r={radius}
              fill="none" stroke={seg.color} strokeWidth={strokeWidth}
              strokeDasharray={dashArray}
              strokeDashoffset={-offset}
              strokeLinecap="round"
              style={{ transition: 'all 0.6s ease' }}
            />
          );
          offset += pct * circumference;
          return el;
        })}
        {/* Center text */}
        <text x={size / 2} y={size / 2 - 8} textAnchor="middle" style={{ transform: 'rotate(90deg)', transformOrigin: 'center', fontSize: '0.7rem', fill: 'var(--text-muted)' }}>
          {label}
        </text>
        <text x={size / 2} y={size / 2 + 12} textAnchor="middle" style={{ transform: 'rotate(90deg)', transformOrigin: 'center', fontSize: '1rem', fontWeight: 800, fill: 'var(--text-primary)' }}>
          R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </text>
      </svg>
      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem', justifyContent: 'center' }}>
        {segments.map((seg, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: seg.color }} />
            {seg.label}: R$ {seg.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </div>
        ))}
      </div>
    </div>
  );
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

// ── Categorize: Alvará vs Acordo ──────────────────────────────────────
const ALVARA_BANKS = ['BANCO DO BRASIL', 'CAIXA ECONOMICA', 'CAIXA ECON', 'CEF'];

function categorizeTransaction(nome: string): 'alvara' | 'acordo' | 'outros' {
  const upper = nome.toUpperCase();
  for (const bank of ALVARA_BANKS) {
    if (upper.includes(bank)) return 'alvara';
  }
  return 'acordo';
}

// ── Parse bank statement ──────────────────────────────────────────────
function parseExtrato(text: string): Transacao[] {
  const transacoes: Transacao[] = [];
  let currentDate = '';
  const MONTHS: Record<string, string> = {
    'janeiro': '01', 'fevereiro': '02', 'março': '03', 'marco': '03',
    'abril': '04', 'maio': '05', 'junho': '06',
    'julho': '07', 'agosto': '08', 'setembro': '09',
    'outubro': '10', 'novembro': '11', 'dezembro': '12',
  };

  const segments = text.split(/(?=\d{1,2}\s+de\s+\w+\s+de\s+\d{4}\s+Saldo)/i);

  for (const segment of segments) {
    const dateMatch = segment.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})\s+Saldo/i);
    if (dateMatch) {
      const day = dateMatch[1].padStart(2, '0');
      const month = MONTHS[dateMatch[2].toLowerCase()] || '01';
      currentDate = `${day}/${month}/${dateMatch[3]}`;
    }
    if (!currentDate) continue;

    const txPattern = /(Pix (?:recebido|enviado)|Transfer[eê]ncia recebida)[:\s]+"?(?:Cp\s*[:.]\s*[\d]*[-]?)?([^"]+)"?\s+(-?R\$\s*[\d.,]+)/gi;
    let match;
    while ((match = txPattern.exec(segment)) !== null) {
      const tipoRaw = match[1].toLowerCase();
      const nome = match[2].trim().replace(/^[-\s]+/, '').replace(/["]+$/, '');
      const valorStr = match[3].replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
      const valor = parseFloat(valorStr);
      if (isNaN(valor) || valor === 0) continue;

      const isEntrada = tipoRaw.includes('recebido') || tipoRaw.includes('recebida');
      const categoria = isEntrada ? categorizeTransaction(nome) : 'outros';

      transacoes.push({
        id: `tx-${transacoes.length}`,
        data: currentDate,
        nome,
        valor: Math.abs(valor),
        valorFormatado: `R$ ${Math.abs(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        tipo: isEntrada ? 'entrada' : 'saida',
        categoria,
        cliente: '',
        processo: '',
        parcelas: '',
      });
    }
  }
  return transacoes;
}

// ── Parse PROMAD financial report ─────────────────────────────────────
function parseContasReceber(text: string): ContaReceber[] {
  const contas: ContaReceber[] = [];
  const blocks = text.split(/(?=[A-Z\u00C0-\u00FF]{2,}[\sA-Z\u00C0-\u00FF]*\.{0,3}\s*\n?\s*\d{7})/);

  for (const block of blocks) {
    const clientMatch = block.match(/([A-Z\u00C0-\u00FF][A-Z\u00C0-\u00FF\s\.]+?)[\s.]*(\d{7}-[\d.]+)/);
    if (!clientMatch) continue;
    const cliente = clientMatch[1].trim().replace(/\.{2,}$/, '').trim();
    const processo = clientMatch[2].trim();
    const dateMatch = block.match(/(\d{2}\/\d{2}\/\d{4})/);
    const vencimento = dateMatch ? dateMatch[1] : '';
    const valorMatch = block.match(/Valor:\s*R\$\s*([\d.,]+)/i);
    const valor = valorMatch ? parseFloat(valorMatch[1].replace(/\./g, '').replace(',', '.')) : 0;
    const isPago = /\bPago\b/i.test(block);
    const parcelaMatch = block.match(/(\d+[ªa]\s*parcela|Entrada)/i);
    const parcela = parcelaMatch ? parcelaMatch[1] : '';

    if (cliente && processo) {
      contas.push({ cliente, processo, vencimento, valor, status: isPago ? 'Pago' : 'A vencer', descricao: parcela, parcela });
    }
  }
  return contas;
}

// ── Match ─────────────────────────────────────────────────────────────
function matchWithPromad(transacoes: Transacao[], contas: ContaReceber[]): Transacao[] {
  return transacoes.map(tx => {
    if (tx.tipo !== 'entrada') return tx;
    const txNome = tx.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const conta of contas) {
      const contaNome = conta.cliente.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const txWords = txNome.split(/\s+/).filter(w => w.length > 2);
      const contaWords = contaNome.split(/\s+/).filter(w => w.length > 2);
      let matchCount = 0;
      for (const tw of txWords) {
        if (contaWords.some(cw => cw.includes(tw) || tw.includes(cw))) matchCount++;
      }
      if (matchCount >= 2 || (matchCount >= 1 && Math.abs(tx.valor - conta.valor) < 0.01)) {
        // Count remaining parcelas for this client
        const clienteContas = contas.filter(c => c.cliente === conta.cliente && c.status === 'A vencer');
        return { ...tx, cliente: conta.cliente, processo: conta.processo, parcelas: `${clienteContas.length} parcela(s) restante(s)` };
      }
    }
    return tx;
  });
}

// ── Tabs ──────────────────────────────────────────────────────────────
type Tab = 'resumo' | 'alvaras' | 'acordos';

// ── Component ─────────────────────────────────────────────────────────
export default function FinanceiroPage() {
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [contas, setContas] = useState<ContaReceber[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('resumo');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const extratoRef = useRef<HTMLInputElement>(null);
  const promadRef = useRef<HTMLInputElement>(null);

  const handleExtrato = async (file: File) => {
    setLoading(true); setError('');
    try {
      const text = await extractTextFromPDF(file);
      const txs = parseExtrato(text);
      if (txs.length === 0) { setError('Nenhuma transação encontrada no extrato.'); return; }
      const matched = contas.length > 0 ? matchWithPromad(txs, contas) : txs;
      setTransacoes(matched);
    } catch (err) { setError(`Erro: ${err instanceof Error ? err.message : String(err)}`); }
    finally { setLoading(false); }
  };

  const handlePromad = async (file: File) => {
    setLoading(true); setError('');
    try {
      const text = await extractTextFromPDF(file);
      const parsed = parseContasReceber(text);
      setContas(parsed);
      if (transacoes.length > 0 && parsed.length > 0) setTransacoes(matchWithPromad(transacoes, parsed));
    } catch (err) { setError(`Erro: ${err instanceof Error ? err.message : String(err)}`); }
    finally { setLoading(false); }
  };

  const handleSync = async () => {
    const entradas = transacoes.filter(t => t.tipo === 'entrada');
    if (entradas.length === 0) { setError('Nenhuma entrada para sincronizar.'); return; }
    setSyncing(true); setError(''); setSuccess('');
    try {
      const payload = entradas.map(t => ({
        cliente: t.cliente || t.nome,
        reclamada: '',
        processo: t.processo,
        dataRecebimento: t.data,
        dataRepasse: '',
        valor: t.valorFormatado,
        tipo: t.categoria === 'alvara' ? 'ALVARÁ' : 'ACORDO',
      }));
      const res = await fetch('/api/financeiro/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transacoes: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`✅ ${data.count} transação(ões) sincronizada(s)!`);
    } catch (err) { setError(`Erro: ${err instanceof Error ? err.message : String(err)}`); }
    finally { setSyncing(false); }
  };

  // Computed
  const entradas = transacoes.filter(t => t.tipo === 'entrada');
  const saidas = transacoes.filter(t => t.tipo === 'saida');
  const alvaras = entradas.filter(t => t.categoria === 'alvara');
  const acordos = entradas.filter(t => t.categoria === 'acordo');
  const totalEntradas = entradas.reduce((s, t) => s + t.valor, 0);
  const totalSaidas = saidas.reduce((s, t) => s + t.valor, 0);
  const totalAlvaras = alvaras.reduce((s, t) => s + t.valor, 0);
  const totalAcordos = acordos.reduce((s, t) => s + t.valor, 0);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'resumo', label: '📊 Resumo', count: transacoes.length },
    { key: 'alvaras', label: '🏛️ Alvarás', count: alvaras.length },
    { key: 'acordos', label: '🤝 Acordos', count: acordos.length },
  ];

  return (
    <div className="detail-page">
      <section className="hero">
        <h1 className="hero-title" style={{ fontSize: '1.8rem' }}>💰 Financeiro</h1>
        <p className="hero-subtitle">Extrato bancário + Relatório PROMAD = Planilha automática</p>
      </section>

      {/* Upload areas */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="upload-dropzone" style={{ padding: '1.5rem', cursor: 'pointer' }} onClick={() => extratoRef.current?.click()}>
          <input ref={extratoRef} type="file" accept=".pdf" style={{ display: 'none' }}
            onChange={(e) => { if (e.target.files?.[0]) handleExtrato(e.target.files[0]); e.target.value = ''; }} />
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏦</div>
          <div className="upload-dropzone-title" style={{ fontSize: '0.9rem' }}>Extrato Bancário</div>
          <div className="upload-dropzone-desc" style={{ fontSize: '0.75rem' }}>PDF do Banco Inter</div>
          {transacoes.length > 0 && <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#10b981' }}>✅ {transacoes.length} transações</div>}
        </div>
        <div className="upload-dropzone" style={{ padding: '1.5rem', cursor: 'pointer' }} onClick={() => promadRef.current?.click()}>
          <input ref={promadRef} type="file" accept=".pdf" style={{ display: 'none' }}
            onChange={(e) => { if (e.target.files?.[0]) handlePromad(e.target.files[0]); e.target.value = ''; }} />
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
          <div className="upload-dropzone-title" style={{ fontSize: '0.9rem' }}>Relatório PROMAD</div>
          <div className="upload-dropzone-desc" style={{ fontSize: '0.75rem' }}>Contas a receber (opcional)</div>
          {contas.length > 0 && <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#10b981' }}>✅ {contas.length} contas</div>}
        </div>
      </div>

      {error && <div style={{ padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '0.75rem', color: '#ef4444', fontSize: '0.85rem', marginBottom: '1rem' }}>❌ {error}</div>}
      {success && <div style={{ padding: '0.75rem 1rem', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '0.75rem', color: '#10b981', fontSize: '0.85rem', marginBottom: '1rem' }}>{success}</div>}
      {loading && <div className="agenda-loading"><div className="upload-spinner" style={{ width: 32, height: 32 }} /><p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>Processando PDF...</p></div>}

      {/* Content */}
      {transacoes.length > 0 && !loading && (
        <>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
            {tabs.map(tab => (
              <button key={tab.key} onClick={() => { setActiveTab(tab.key); setShowDetails(false); }}
                style={{
                  padding: '0.5rem 1rem', borderRadius: '0.5rem 0.5rem 0 0', border: 'none', cursor: 'pointer',
                  background: activeTab === tab.key ? 'rgba(212,175,55,0.12)' : 'transparent',
                  color: activeTab === tab.key ? '#d4af37' : 'var(--text-muted)',
                  fontWeight: activeTab === tab.key ? 700 : 500, fontSize: '0.85rem',
                  borderBottom: activeTab === tab.key ? '2px solid #d4af37' : '2px solid transparent',
                }}>
                {tab.label} ({tab.count})
              </button>
            ))}
            <button onClick={handleSync} disabled={syncing}
              style={{
                marginLeft: 'auto', padding: '0.4rem 1rem', borderRadius: '999px',
                background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0a0a0f',
                border: 'none', fontWeight: 700, fontSize: '0.78rem', cursor: syncing ? 'wait' : 'pointer',
              }}>
              {syncing ? '⏳...' : '📊 Sincronizar Planilha'}
            </button>
          </div>

          {/* ── RESUMO TAB ──────────────────────────────────────────── */}
          {activeTab === 'resumo' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                {/* Main donut */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '1rem', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '1rem' }}>FLUXO GERAL</div>
                  <DonutChart
                    segments={[
                      { value: totalEntradas, color: '#10b981', label: 'Entradas' },
                      { value: totalSaidas, color: '#ef4444', label: 'Saídas' },
                    ]}
                    total={totalEntradas + totalSaidas}
                    label="Total movimentado"
                  />
                </div>
                {/* Alvaras donut */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '1rem', border: '1px solid var(--border-subtle)', cursor: 'pointer' }}
                  onClick={() => setActiveTab('alvaras')}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '1rem' }}>🏛️ ALVARÁS</div>
                  <DonutChart
                    segments={[{ value: totalAlvaras, color: '#6366f1', label: 'Alvarás' }]}
                    total={totalAlvaras}
                    label={`${alvaras.length} pagamento${alvaras.length !== 1 ? 's' : ''}`}
                  />
                </div>
                {/* Acordos donut */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '1rem', border: '1px solid var(--border-subtle)', cursor: 'pointer' }}
                  onClick={() => setActiveTab('acordos')}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '1rem' }}>🤝 ACORDOS</div>
                  <DonutChart
                    segments={[{ value: totalAcordos, color: '#f59e0b', label: 'Acordos' }]}
                    total={totalAcordos}
                    label={`${acordos.length} pagamento${acordos.length !== 1 ? 's' : ''}`}
                  />
                </div>
              </div>

              {/* Summary cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                <div className="metric-card"><div className="metric-value" style={{ color: '#10b981' }}>R$ {totalEntradas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div><div className="metric-label">Total Entradas</div></div>
                <div className="metric-card"><div className="metric-value" style={{ color: '#ef4444' }}>R$ {totalSaidas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div><div className="metric-label">Total Saídas</div></div>
                <div className="metric-card"><div className="metric-value" style={{ color: '#6366f1' }}>R$ {totalAlvaras.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div><div className="metric-label">Alvarás</div></div>
                <div className="metric-card"><div className="metric-value" style={{ color: '#f59e0b' }}>R$ {totalAcordos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div><div className="metric-label">Acordos</div></div>
              </div>
            </div>
          )}

          {/* ── ALVARÁS TAB ─────────────────────────────────────────── */}
          {activeTab === 'alvaras' && (
            <div>
              <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                <div style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '1rem', border: '1px solid var(--border-subtle)' }}
                  onClick={() => setShowDetails(!showDetails)}>
                  <DonutChart
                    segments={alvaras.map((a, i) => ({
                      value: a.valor,
                      color: `hsl(${240 + i * 30}, 70%, 60%)`,
                      label: a.nome.substring(0, 20),
                    }))}
                    total={totalAlvaras}
                    label={`${alvaras.length} alvará${alvaras.length !== 1 ? 's' : ''}`}
                    onClick={() => setShowDetails(!showDetails)}
                  />
                  <div style={{ textAlign: 'center', marginTop: '0.75rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {showDetails ? '▲ Ocultar detalhes' : '▼ Clique para ver detalhes'}
                  </div>
                </div>

                {/* Info */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                    Pagamentos via <strong>Banco do Brasil</strong> e <strong>Caixa Econômica</strong> são identificados como alvarás judiciais.
                  </div>
                  <div className="metric-card" style={{ marginBottom: '0.75rem' }}>
                    <div className="metric-value" style={{ color: '#6366f1', fontSize: '1.5rem' }}>R$ {totalAlvaras.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                    <div className="metric-label">Total em Alvarás</div>
                  </div>
                </div>
              </div>

              {/* Expanded list */}
              {showDetails && (
                <div style={{ animation: 'slideUp 0.3s ease-out' }}>
                  {alvaras.map(tx => (
                    <div key={tx.id} className="agenda-card" style={{ borderLeftColor: '#6366f1', marginBottom: '0.5rem', cursor: 'pointer' }}
                      onClick={() => setExpandedId(expandedId === tx.id ? null : tx.id)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div className="agenda-card-name" style={{ fontSize: '0.8rem' }}>{tx.cliente || tx.nome}</div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{tx.data}</div>
                        </div>
                        <div style={{ fontWeight: 800, color: '#6366f1', fontSize: '0.9rem' }}>{tx.valorFormatado}</div>
                      </div>
                      {expandedId === tx.id && (
                        <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
                          {tx.processo && <div style={{ fontSize: '0.72rem', color: '#d4af37' }}>Processo: {tx.processo}</div>}
                          {tx.parcelas && <div style={{ fontSize: '0.72rem', color: '#10b981', marginTop: '0.2rem' }}>{tx.parcelas}</div>}
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Origem: {tx.nome}</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {alvaras.length === 0 && <div className="empty-state"><div className="empty-state-title">Nenhum alvará identificado</div></div>}
            </div>
          )}

          {/* ── ACORDOS TAB ─────────────────────────────────────────── */}
          {activeTab === 'acordos' && (
            <div>
              <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                <div style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '1rem', border: '1px solid var(--border-subtle)' }}
                  onClick={() => setShowDetails(!showDetails)}>
                  <DonutChart
                    segments={acordos.slice(0, 8).map((a, i) => ({
                      value: a.valor,
                      color: `hsl(${30 + i * 25}, 80%, 55%)`,
                      label: a.nome.substring(0, 15),
                    })).concat(acordos.length > 8 ? [{ value: acordos.slice(8).reduce((s, t) => s + t.valor, 0), color: '#94a3b8', label: `+${acordos.length - 8} outros` }] : [])}
                    total={totalAcordos}
                    label={`${acordos.length} acordo${acordos.length !== 1 ? 's' : ''}`}
                    onClick={() => setShowDetails(!showDetails)}
                  />
                  <div style={{ textAlign: 'center', marginTop: '0.75rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {showDetails ? '▲ Ocultar detalhes' : '▼ Clique para ver detalhes'}
                  </div>
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                    Pagamentos de <strong>pessoas e empresas</strong> são identificados como acordos judiciais.
                  </div>
                  <div className="metric-card" style={{ marginBottom: '0.75rem' }}>
                    <div className="metric-value" style={{ color: '#f59e0b', fontSize: '1.5rem' }}>R$ {totalAcordos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                    <div className="metric-label">Total em Acordos</div>
                  </div>
                  {contas.length > 0 && (
                    <div style={{ fontSize: '0.75rem', color: '#10b981' }}>✅ PROMAD vinculado — parcelas identificadas</div>
                  )}
                </div>
              </div>

              {showDetails && (
                <div style={{ animation: 'slideUp 0.3s ease-out' }}>
                  {acordos.map(tx => (
                    <div key={tx.id} className="agenda-card" style={{ borderLeftColor: '#f59e0b', marginBottom: '0.5rem', cursor: 'pointer' }}
                      onClick={() => setExpandedId(expandedId === tx.id ? null : tx.id)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div className="agenda-card-name" style={{ fontSize: '0.8rem' }}>{tx.cliente || tx.nome}</div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{tx.data}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          {tx.parcelas && <span style={{ fontSize: '0.65rem', color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>{tx.parcelas}</span>}
                          <span style={{ fontWeight: 800, color: '#f59e0b', fontSize: '0.9rem' }}>{tx.valorFormatado}</span>
                        </div>
                      </div>
                      {expandedId === tx.id && (
                        <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
                          {tx.processo && <div style={{ fontSize: '0.72rem', color: '#d4af37' }}>Processo: {tx.processo}</div>}
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Pagador: {tx.nome}</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {acordos.length === 0 && <div className="empty-state"><div className="empty-state-title">Nenhum acordo identificado</div></div>}
            </div>
          )}
        </>
      )}

      {transacoes.length === 0 && !loading && (
        <div className="empty-state" style={{ marginTop: '2rem' }}>
          <div className="empty-state-icon">🏦</div>
          <div className="empty-state-title">Suba o extrato bancário</div>
          <div className="empty-state-desc">O sistema identifica alvarás e acordos automaticamente.</div>
        </div>
      )}
    </div>
  );
}
