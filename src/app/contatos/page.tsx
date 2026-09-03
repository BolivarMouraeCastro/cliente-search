'use client';

import React, { useEffect, useState } from 'react';

interface Contato {
  nome: string;
  cpf: string;
  telefone: string;
  dataCadastro: string;
  rowIndex: number;
}

function formatCPF(cpf: string): string {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11) return cpf;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length < 12) return phone;
  const ddd = d.slice(2, 4);
  const num = d.slice(4);
  if (num.length === 9) return `+55 (${ddd}) ${num.slice(0,5)}-${num.slice(5)}`;
  return `+55 (${ddd}) ${num.slice(0,4)}-${num.slice(4)}`;
}

function cpfMask(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

function phoneMask(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 13);
  if (d.length <= 2) return `+${d}`;
  if (d.length <= 4) return `+${d.slice(0,2)} (${d.slice(2)}`;
  if (d.length <= 9) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4)}`;
  return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`;
}

const PER_PAGE = 30;

export default function ContatosPage() {
  const [allContatos, setAllContatos] = useState<Contato[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Contato | null>(null);
  const [formNome, setFormNome] = useState('');
  const [formCpf, setFormCpf] = useState('');
  const [formTel, setFormTel] = useState('+55 ');
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const fetchContatos = async () => {
    try {
      const res = await fetch('/api/contatos');
      if (res.ok) setAllContatos(await res.json());
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchContatos(); }, []);

  // Filter by search
  const filtered = search
    ? allContatos.filter(c => c.nome.toLowerCase().includes(search.toLowerCase()))
    : allContatos;

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const startIdx = (currentPage - 1) * PER_PAGE;
  const contatos = filtered.slice(startIdx, startIdx + PER_PAGE);
  const showing = { from: startIdx + 1, to: Math.min(startIdx + PER_PAGE, filtered.length), total: filtered.length };

  // Reset page when search changes
  useEffect(() => { setPage(1); }, [search]);

  const flash = (type: 'ok' | 'err', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 6000);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setImporting(true);
    setImportProgress('Enviando arquivo...');

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/contatos/import', { method: 'POST', body: formData });
      const data = await res.json();

      if (res.ok) {
        setImportProgress('');
        flash('ok', `✅ ${data.imported} contatos importados!` +
          (data.skipped > 0 ? ` (${data.skipped} ignorados)` : '') +
          `\nColunas: Nome="${data.columns.nome}", CPF="${data.columns.cpf}", Tel="${data.columns.telefone}"`);
        setLoading(true);
        fetchContatos();
      } else {
        flash('err', data.error || 'Erro na importação');
      }
    } catch { flash('err', 'Erro de conexão'); }
    setImporting(false);
    setImportProgress('');
  };

  const openAdd = () => { setEditing(null); setFormNome(''); setFormCpf(''); setFormTel('+55 '); setShowForm(true); };
  const openEdit = (c: Contato) => { setEditing(c); setFormNome(c.nome); setFormCpf(formatCPF(c.cpf)); setFormTel(formatPhone(c.telefone)); setShowForm(true); };

  const handleSave = async () => {
    const cpfDigits = formCpf.replace(/\D/g, '');
    const telDigits = formTel.replace(/\D/g, '');
    if (!formNome.trim()) return flash('err', 'Nome é obrigatório');
    if (cpfDigits.length !== 11) return flash('err', 'CPF deve ter 11 dígitos');
    if (telDigits.length < 12) return flash('err', 'Telefone inválido (inclua DDD)');
    setSaving(true);
    try {
      const method = editing ? 'PUT' : 'POST';
      const body = editing
        ? { rowIndex: editing.rowIndex, nome: formNome, cpf: cpfDigits, telefone: telDigits }
        : { nome: formNome, cpf: cpfDigits, telefone: telDigits };
      const res = await fetch('/api/contatos', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { flash('ok', editing ? 'Atualizado!' : 'Adicionado!'); setShowForm(false); setLoading(true); fetchContatos(); }
      else { const d = await res.json(); flash('err', d.error || 'Erro'); }
    } catch { flash('err', 'Erro de conexão'); }
    setSaving(false);
  };

  const handleDelete = async (c: Contato) => {
    if (!confirm(`Excluir ${c.nome}?`)) return;
    try { await fetch('/api/contatos', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rowIndex: c.rowIndex }) }); flash('ok', 'Excluído'); setLoading(true); fetchContatos(); }
    catch { flash('err', 'Erro'); }
  };

  const inputStyle = { width: '100%', padding: '0.7rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--border-default)', background: 'rgba(0,0,0,0.2)', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none' };
  const labelStyle = { display: 'block' as const, color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600 as const, marginBottom: '0.3rem' };
  const pageBtnStyle = (active: boolean) => ({
    padding: '0.4rem 0.75rem', borderRadius: '0.35rem', border: 'none',
    background: active ? 'rgba(212,175,55,0.2)' : 'transparent',
    color: active ? '#d4af37' : 'var(--text-muted)',
    cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', transition: 'all 0.15s',
  });

  return (
    <div className="detail-page" style={{ padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ color: 'var(--text-primary)', fontSize: '1.3rem', fontWeight: 800, margin: 0 }}>📱 Contatos</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>Gerencie os contatos dos clientes para envio via WhatsApp</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input id="excel-import" type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} style={{ display: 'none' }} />
          <button onClick={() => document.getElementById('excel-import')?.click()} disabled={importing} style={{
            padding: '0.6rem 1.2rem', borderRadius: '0.5rem', border: '1px solid var(--border-default)',
            background: 'transparent', color: importing ? 'var(--text-muted)' : '#4ade80',
            fontWeight: 700, fontSize: '0.85rem', cursor: importing ? 'not-allowed' : 'pointer',
          }}>
            {importing ? '⏳ Importando...' : '📥 Importar Excel'}
          </button>
          <button onClick={openAdd} style={{ padding: '0.6rem 1.2rem', borderRadius: '0.5rem', border: 'none', background: 'var(--gradient-brand)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
            + Adicionar Contato
          </button>
        </div>
      </div>

      {/* Messages */}
      {message && (
        <div style={{ padding: '0.7rem 1rem', borderRadius: '0.5rem', marginBottom: '1rem', background: message.type === 'ok' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${message.type === 'ok' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, color: message.type === 'ok' ? '#4ade80' : '#ef4444', fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'pre-line' }}>
          {message.text}
        </div>
      )}

      {importing && (
        <div style={{ padding: '1rem', borderRadius: '0.5rem', marginBottom: '1rem', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', color: '#60a5fa', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 20, height: 20, border: '2px solid rgba(96,165,250,0.3)', borderTopColor: '#60a5fa', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          {importProgress || 'Processando Excel... pode levar alguns segundos para 8000+ contatos'}
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setShowForm(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: '1rem', padding: '2rem', width: '100%', maxWidth: '450px', boxShadow: 'var(--shadow-xl)' }}>
            <h2 style={{ color: 'var(--text-primary)', fontSize: '1.1rem', marginBottom: '1.5rem', fontWeight: 700 }}>{editing ? '✏️ Editar Contato' : '➕ Novo Contato'}</h2>
            <div style={{ marginBottom: '1rem' }}><label style={labelStyle}>Nome Completo *</label><input value={formNome} onChange={e => setFormNome(e.target.value)} placeholder="Ex: João da Silva" style={inputStyle} /></div>
            <div style={{ marginBottom: '1rem' }}><label style={labelStyle}>CPF *</label><input value={formCpf} onChange={e => setFormCpf(cpfMask(e.target.value))} placeholder="000.000.000-00" maxLength={14} style={inputStyle} /></div>
            <div style={{ marginBottom: '1.5rem' }}><label style={labelStyle}>WhatsApp *</label><input value={formTel} onChange={e => setFormTel(phoneMask(e.target.value))} placeholder="+55 (00) 00000-0000" maxLength={19} style={inputStyle} /></div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setShowForm(false)} style={{ flex: 1, padding: '0.7rem', borderRadius: '0.5rem', border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: '0.7rem', borderRadius: '0.5rem', border: 'none', background: saving ? 'rgba(212,175,55,0.3)' : 'var(--gradient-brand)', color: '#fff', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? 'Salvando...' : editing ? 'Atualizar' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Search + Pagination Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Buscar contato..." style={{ ...inputStyle, maxWidth: '300px', background: 'var(--bg-card)', padding: '0.55rem 0.75rem', fontSize: '0.85rem' }} />
        {!loading && filtered.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
              {showing.from}–{showing.to} de {showing.total}
            </span>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} style={pageBtnStyle(false)} title="Anterior">
              ‹
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} style={pageBtnStyle(false)} title="Próxima">
              ›
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: '1rem', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Carregando...</div>
        ) : contatos.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📭</div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{search ? 'Nenhum contato encontrado' : 'Nenhum contato cadastrado'}</p>
            {!search && <button onClick={openAdd} style={{ marginTop: '1rem', padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--border-default)', background: 'transparent', color: '#d4af37', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>Adicionar primeiro contato</button>}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['NOME', 'CPF', 'TELEFONE', 'AÇÕES'].map(h => (
                  <th key={h} style={{ padding: '0.75rem 1rem', textAlign: h === 'AÇÕES' ? 'center' : 'left', borderBottom: '1px solid var(--border-default)', color: '#d4af37', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contatos.map((c) => (
                <tr key={c.rowIndex}>
                  <td style={{ padding: '0.6rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.04)', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.83rem' }}>{c.nome}</td>
                  <td style={{ padding: '0.6rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.04)', color: 'var(--text-secondary)', fontSize: '0.83rem', fontFamily: 'monospace' }}>{formatCPF(c.cpf)}</td>
                  <td style={{ padding: '0.6rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.04)', color: 'var(--text-secondary)', fontSize: '0.83rem' }}>{formatPhone(c.telefone)}</td>
                  <td style={{ padding: '0.6rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center' }}>
                      <button onClick={() => window.open(`https://wa.me/${c.telefone}`, '_blank')} title="WhatsApp" style={{ padding: '0.3rem 0.4rem', borderRadius: '0.3rem', border: 'none', background: 'rgba(37,211,102,0.15)', color: '#25D366', cursor: 'pointer', fontSize: '0.85rem' }}>💬</button>
                      <button onClick={() => openEdit(c)} title="Editar" style={{ padding: '0.3rem 0.4rem', borderRadius: '0.3rem', border: 'none', background: 'rgba(212,175,55,0.1)', color: '#d4af37', cursor: 'pointer', fontSize: '0.85rem' }}>✏️</button>
                      <button onClick={() => handleDelete(c)} title="Excluir" style={{ padding: '0.3rem 0.4rem', borderRadius: '0.3rem', border: 'none', background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem' }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Bottom Pagination */}
      {!loading && filtered.length > PER_PAGE && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.25rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <button onClick={() => setPage(1)} disabled={currentPage <= 1} style={pageBtnStyle(false)}>«</button>
          <button onClick={() => setPage(p => p - 1)} disabled={currentPage <= 1} style={pageBtnStyle(false)}>‹ Anterior</button>
          {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
            let p: number;
            if (totalPages <= 7) { p = i + 1; }
            else if (currentPage <= 4) { p = i + 1; }
            else if (currentPage >= totalPages - 3) { p = totalPages - 6 + i; }
            else { p = currentPage - 3 + i; }
            return (
              <button key={p} onClick={() => setPage(p)} style={pageBtnStyle(p === currentPage)}>{p}</button>
            );
          })}
          <button onClick={() => setPage(p => p + 1)} disabled={currentPage >= totalPages} style={pageBtnStyle(false)}>Próxima ›</button>
          <button onClick={() => setPage(totalPages)} disabled={currentPage >= totalPages} style={pageBtnStyle(false)}>»</button>
        </div>
      )}

      <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.75rem', textAlign: 'center' }}>
        Total: {allContatos.length} contato{allContatos.length !== 1 ? 's' : ''}
      </p>
    </div>
  );
}
