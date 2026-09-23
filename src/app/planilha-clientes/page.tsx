'use client';

import { useState, useEffect } from 'react';

interface ClienteRow {
  rowIndex: number;
  nome: string;
  cpf: string;
  numeroProcesso: string;
  empresa: string;
}

const PER_PAGE = 30;

export default function PlanilhaClientesPage() {
  const [allClientes, setAllClientes] = useState<ClienteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [formNome, setFormNome] = useState('');
  const [formCpf, setFormCpf] = useState('');
  const [formProcesso, setFormProcesso] = useState('');
  const [formEmpresa, setFormEmpresa] = useState('');
  const [editRow, setEditRow] = useState<ClienteRow | null>(null);
  const [flash, setFlash] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [importing, setImporting] = useState(false);

  const showFlash = (type: 'ok' | 'err', msg: string) => {
    setFlash({ type, msg });
    setTimeout(() => setFlash(null), 4000);
  };

  const fetchClientes = async () => {
    try {
      const res = await fetch('/api/public/planilha-clientes');
      const contentType = res.headers.get('content-type') || '';
      
      if (res.redirected || !contentType.includes('application/json')) {
        // API retornou HTML (provavelmente redirect para login)
        showFlash('err', 'Sessão expirada. Faça login novamente.');
        return;
      }
      
      if (res.ok) {
        const data = await res.json();
        setAllClientes(Array.isArray(data) ? data : []);
      } else {
        const data = await res.json().catch(() => ({}));
        showFlash('err', data.error || `Erro ${res.status} ao carregar.`);
      }
    } catch (e: any) {
      console.error('fetchClientes error:', e);
      showFlash('err', 'Erro ao conectar: ' + (e?.message || 'verifique sua internet'));
    }
    setLoading(false);
  };

  useEffect(() => { fetchClientes(); }, []);

  const filtered = search
    ? allClientes.filter(c =>
        c.nome.toLowerCase().includes(search.toLowerCase()) ||
        c.cpf.includes(search.replace(/\D/g, '')) ||
        c.numeroProcesso.includes(search) ||
        (c.empresa && c.empresa.toLowerCase().includes(search.toLowerCase()))
      )
    : allClientes;

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const startIdx = (page - 1) * PER_PAGE;
  const clientes = filtered.slice(startIdx, startIdx + PER_PAGE);

  const formatCPF = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  };

  const handleSave = async () => {
    if (!formNome.trim() || !formCpf.trim()) {
      showFlash('err', 'Nome e CPF são obrigatórios.');
      return;
    }
    try {
      const body: any = { nome: formNome.trim(), cpf: formCpf.replace(/\D/g, ''), numeroProcesso: formProcesso.trim(), empresa: formEmpresa.trim() };
      const method = editRow ? 'PUT' : 'POST';
      if (editRow) body.rowIndex = editRow.rowIndex;
      const res = await fetch('/api/public/planilha-clientes', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      });
      const text = await res.text();
      if (res.ok) {
        showFlash('ok', editRow ? '✅ Atualizado!' : '✅ Adicionado!');
        setShowForm(false);
        setEditRow(null);
        setFormNome(''); setFormCpf(''); setFormProcesso(''); setFormEmpresa('');
        setLoading(true);
        fetchClientes();
      } else {
        try { const d = JSON.parse(text); showFlash('err', d.error || 'Erro ao salvar.'); } catch { showFlash('err', `Erro ${res.status} ao salvar.`); }
      }
    } catch (e: any) {
      showFlash('err', 'Falha na conexão: ' + (e?.message || ''));
    }
  };

  const handleDelete = async (c: ClienteRow) => {
    if (!confirm(`Excluir ${c.nome}?`)) return;
    try {
      await fetch('/api/public/planilha-clientes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIndex: c.rowIndex }),
        cache: 'no-store',
      });
      showFlash('ok', '🗑️ Excluído');
      setLoading(true);
      fetchClientes();
    } catch (e: any) {
      showFlash('err', 'Falha ao excluir: ' + (e?.message || ''));
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm('⚠️ TEM CERTEZA QUE DESEJA APAGAR TODOS OS CLIENTES?\nEsta ação não pode ser desfeita!')) return;
    try {
      const res = await fetch('/api/public/planilha-clientes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteAll: true }),
        cache: 'no-store',
      });
      if (res.ok) {
        showFlash('ok', '🗑️ Todos os clientes foram excluídos!');
        setLoading(true);
        fetchClientes();
      } else {
        showFlash('err', 'Erro ao excluir todos.');
      }
    } catch (e: any) {
      showFlash('err', 'Falha ao excluir todos: ' + (e?.message || ''));
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: '' }) as (string | number)[][];
      
      if (!rawData || rawData.length < 2) {
        showFlash('err', 'Planilha vazia ou sem dados');
        setImporting(false);
        e.target.value = '';
        return;
      }

      const NOME_KEYS = ['nome', 'razão social', 'razao social', 'nome completo', 'reclamante'];
      const CPF_KEYS = ['cpf', 'cpf/cnpj', 'documento', 'doc'];
      const PROC_KEYS = ['processo', 'andamento', 'ultimo andamento', 'último andamento', 'movimentação'];
      const EMPRESA_KEYS = ['reclamado', 'empresa', 'parte adversa', 'réu', 'reu'];
      
      const findColumn = (headers: string[], candidates: string[]) => {
        const normalized = headers.map(h => String(h).toLowerCase().trim());
        for (const candidate of candidates) {
          const idx = normalized.findIndex(h => h.includes(candidate));
          if (idx >= 0) return idx;
        }
        return -1;
      };

      let headerIdx = -1, nomeIdx = -1, cpfIdx = -1, procIdx = -1, empIdx = -1;
      for (let r = 0; r < Math.min(5, rawData.length); r++) {
        const row = rawData[r].map(c => String(c || ''));
        nomeIdx = findColumn(row, NOME_KEYS);
        cpfIdx = findColumn(row, CPF_KEYS);
        procIdx = findColumn(row, PROC_KEYS);
        empIdx = findColumn(row, EMPRESA_KEYS);
        if ([nomeIdx, cpfIdx, procIdx].filter(i => i >= 0).length >= 2) {
          headerIdx = r;
          break;
        }
      }

      if (headerIdx < 0 || nomeIdx < 0) {
         showFlash('err', 'Colunas "Nome" e/ou "CPF" não encontradas.');
         setImporting(false);
         e.target.value = '';
         return;
      }

      const validRows: string[][] = [];
      const dataRows = rawData.slice(headerIdx + 1);
      
      for (const row of dataRows) {
        const nome = String(row[nomeIdx] ?? '').trim().toUpperCase();
        if (!nome || nome.length < 2) continue;
        
        const cpf = cpfIdx >= 0 ? String(row[cpfIdx] ?? '').replace(/\D/g, '') : '';
        let processoStr = procIdx >= 0 ? String(row[procIdx] ?? '').trim() : '';
        let processo = processoStr;
        
        // Smart extract process number from text (e.g. from "Último Andamento" column)
        const procMatch = processoStr.match(/(?:Processo|Proc|Nº)\s*:?\s*([\d\.\-]+)/i);
        if (procMatch && procMatch[1].replace(/\D/g, '').length >= 7) {
            processo = procMatch[1].replace(/[^\d.-]/g, '');
        } else {
            // Find a generic 20-digit judicial format in the text
            const match20 = processoStr.match(/\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}/);
            if (match20) processo = match20[0];
        }
        
        let empresa = empIdx >= 0 ? String(row[empIdx] ?? '').trim().toUpperCase() : '';

        validRows.push([nome, cpf, processo, empresa]);
      }
      
      if (validRows.length === 0) {
        showFlash('err', 'Nenhum cliente válido encontrado na planilha.');
        setImporting(false);
        e.target.value = '';
        return;
      }

      showFlash('ok', `Processando ${validRows.length} clientes...`);

      // Send processed JSON to backend
      const res = await fetch('/api/public/planilha-clientes/import', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: validRows }) 
      });
      const text = await res.text();
      try {
        const data = JSON.parse(text);
        if (res.ok) {
          showFlash('ok', `✅ ${data.imported} clientes importados!`);
          fetchClientes();
        } else {
          showFlash('err', data.error || 'Erro na importação.');
        }
      } catch {
        showFlash('err', `Erro ${res.status}: resposta inválida.`);
      }
    } catch (e: any) {
      showFlash('err', 'Falha na leitura do Excel: ' + (e?.message || ''));
    }
    setImporting(false);
    e.target.value = '';
  };

  const startEdit = (c: ClienteRow) => {
    setEditRow(c);
    setFormNome(c.nome);
    setFormCpf(formatCPF(c.cpf));
    setFormProcesso(c.numeroProcesso);
    setFormEmpresa(c.empresa || '');
    setShowForm(true);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.6rem 0.75rem', borderRadius: '0.5rem',
    border: '1px solid var(--border)', background: 'var(--bg-secondary)',
    color: 'var(--text-primary)', fontSize: '0.85rem',
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem' }}>
      {/* Flash */}
      {flash && (
        <div style={{
          position: 'fixed', top: '1rem', right: '1rem', zIndex: 9999,
          padding: '0.75rem 1.25rem', borderRadius: '0.5rem',
          background: flash.type === 'ok' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
          border: `1px solid ${flash.type === 'ok' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          color: flash.type === 'ok' ? '#4ade80' : '#fca5a5',
          fontSize: '0.85rem', fontWeight: 600,
        }}>{flash.msg}</div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ color: 'var(--text-primary)', fontSize: '1.3rem', fontWeight: 800, margin: 0 }}>📋 Planilha de Clientes</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
            Gerencie os clientes com Nome, CPF e Nº do Processo para o portal do cliente
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button onClick={handleDeleteAll} style={{
            padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid rgba(239,68,68,0.3)',
            background: 'rgba(239,68,68,0.15)', color: '#fca5a5',
            fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer',
          }}>🗑️ Apagar Todos</button>
          <label style={{
            padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer',
            background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)',
            color: '#60a5fa', fontWeight: 700, fontSize: '0.8rem',
          }}>
            📥 Importar Excel
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} hidden />
          </label>
          <button onClick={() => { setEditRow(null); setFormNome(''); setFormCpf(''); setFormProcesso(''); setFormEmpresa(''); setShowForm(true); }} style={{
            padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none',
            background: 'linear-gradient(135deg, #d4af37, #b8941f)', color: '#fff',
            fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer',
          }}>+ Adicionar Cliente</button>
        </div>
      </div>

      {/* Import progress */}
      {importing && (
        <div style={{ padding: '1rem', background: 'rgba(59,130,246,0.1)', borderRadius: '0.5rem', color: '#93c5fd', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'center' }}>
          ⏳ Importando planilha... aguarde...
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div style={{
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: '0.75rem', padding: '1.25rem', marginBottom: '1.5rem',
        }}>
          <h3 style={{ color: 'var(--text-primary)', margin: '0 0 1rem', fontSize: '1rem' }}>
            {editRow ? '✏️ Editar Cliente' : '➕ Novo Cliente'}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
            <div>
              <label style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>Nome Completo *</label>
              <input value={formNome} onChange={e => setFormNome(e.target.value)} placeholder="Nome do cliente" style={inputStyle} />
            </div>
            <div>
              <label style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>CPF *</label>
              <input value={formCpf} onChange={e => setFormCpf(formatCPF(e.target.value))} placeholder="000.000.000-00" style={{ ...inputStyle, fontFamily: 'monospace' }} />
            </div>
            <div>
              <label style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>Nº Processo</label>
              <input value={formProcesso} onChange={e => setFormProcesso(e.target.value)} placeholder="0001234-56.2026.5.02.0001" style={{ ...inputStyle, fontFamily: 'monospace' }} />
            </div>
            <div>
              <label style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>Empresa (Reclamado)</label>
              <input value={formEmpresa} onChange={e => setFormEmpresa(e.target.value)} placeholder="Nome da empresa" style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button onClick={handleSave} style={{
              padding: '0.6rem 1.5rem', borderRadius: '0.5rem', border: 'none',
              background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff',
              fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
            }}>💾 Salvar</button>
            <button onClick={() => { setShowForm(false); setEditRow(null); }} style={{
              padding: '0.6rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text-muted)', fontSize: '0.85rem', cursor: 'pointer',
            }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{ marginBottom: '1rem' }}>
        <input
          value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="🔍 Buscar cliente..."
          style={{ ...inputStyle, maxWidth: '350px' }}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>⏳ Carregando...</div>
      ) : clientes.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem' }}>
          {search ? 'Nenhum resultado encontrado.' : 'Nenhum cliente cadastrado. Clique em "Adicionar Cliente" ou importe um Excel.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['NOME', 'CPF', 'Nº PROCESSO', 'EMPRESA', 'AÇÕES'].map(h => (
                  <th key={h} style={{
                    padding: '0.6rem 0.75rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: 700,
                    color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.05em',
                    borderBottom: '1px solid var(--border)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clientes.map(c => (
                <tr key={c.rowIndex} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 600 }}>{c.nome}</td>
                  <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontFamily: 'monospace' }}>{formatCPF(c.cpf)}</td>
                  <td style={{ padding: '0.6rem 0.75rem', color: c.numeroProcesso ? 'var(--text-secondary)' : 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                    {c.numeroProcesso || '—'}
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem', color: c.empresa ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: '0.8rem' }}>
                    {c.empresa || '—'}
                  </td>
                  <td style={{ padding: '0.6rem 0.75rem' }}>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      <button onClick={() => startEdit(c)} style={{
                        padding: '0.3rem 0.5rem', borderRadius: '0.25rem', border: 'none',
                        background: 'rgba(59,130,246,0.15)', color: '#60a5fa', fontSize: '0.7rem',
                        fontWeight: 700, cursor: 'pointer',
                      }}>✏️</button>
                      <button onClick={() => handleDelete(c)} style={{
                        padding: '0.3rem 0.5rem', borderRadius: '0.25rem', border: 'none',
                        background: 'rgba(239,68,68,0.15)', color: '#fca5a5', fontSize: '0.7rem',
                        fontWeight: 700, cursor: 'pointer',
                      }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          <span>{startIdx + 1}–{Math.min(startIdx + PER_PAGE, filtered.length)} de {filtered.length}</span>
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              style={{ padding: '0.3rem 0.6rem', borderRadius: '0.25rem', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: page === 1 ? 'not-allowed' : 'pointer' }}>‹</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              style={{ padding: '0.3rem 0.6rem', borderRadius: '0.25rem', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: page === totalPages ? 'not-allowed' : 'pointer' }}>›</button>
          </div>
        </div>
      )}

      {/* Total */}
      <div style={{ marginTop: '0.5rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
        Total: {allClientes.length} cliente{allClientes.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
