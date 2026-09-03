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

export default function ContatosPage() {
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Contato | null>(null);
  const [formNome, setFormNome] = useState('');
  const [formCpf, setFormCpf] = useState('');
  const [formTel, setFormTel] = useState('+55 ');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const fetchContatos = async () => {
    try {
      const res = await fetch(`/api/contatos${search ? `?search=${encodeURIComponent(search)}` : ''}`);
      if (res.ok) setContatos(await res.json());
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchContatos(); }, [search]);

  const flash = (type: 'ok' | 'err', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3500);
  };

  const openAdd = () => {
    setEditing(null);
    setFormNome(''); setFormCpf(''); setFormTel('+55 ');
    setShowForm(true);
  };

  const openEdit = (c: Contato) => {
    setEditing(c);
    setFormNome(c.nome);
    setFormCpf(formatCPF(c.cpf));
    setFormTel(formatPhone(c.telefone));
    setShowForm(true);
  };

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

      const res = await fetch('/api/contatos', {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        flash('ok', editing ? 'Contato atualizado!' : 'Contato adicionado!');
        setShowForm(false);
        setLoading(true);
        fetchContatos();
      } else {
        const data = await res.json();
        flash('err', data.error || 'Erro ao salvar');
      }
    } catch { flash('err', 'Erro de conexão'); }
    setSaving(false);
  };

  const handleDelete = async (c: Contato) => {
    if (!confirm(`Excluir contato ${c.nome}?`)) return;
    try {
      await fetch('/api/contatos', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIndex: c.rowIndex }),
      });
      flash('ok', 'Contato excluído');
      setLoading(true);
      fetchContatos();
    } catch { flash('err', 'Erro ao excluir'); }
  };

  const inputStyle = {
    width: '100%', padding: '0.7rem 1rem', borderRadius: '0.5rem',
    border: '1px solid var(--border-default)', background: 'rgba(0,0,0,0.2)',
    color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none',
  };

  const labelStyle = {
    display: 'block', color: 'var(--text-secondary)', fontSize: '0.8rem',
    fontWeight: 600 as const, marginBottom: '0.3rem',
  };

  return (
    <div className="detail-page" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ color: 'var(--text-primary)', fontSize: '1.3rem', fontWeight: 800, margin: 0 }}>
            📱 Contatos
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
            Gerencie os contatos dos clientes para envio via WhatsApp
          </p>
        </div>
        <button onClick={openAdd} style={{
          padding: '0.6rem 1.2rem', borderRadius: '0.5rem', border: 'none',
          background: 'var(--gradient-brand)', color: '#fff', fontWeight: 700,
          fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s',
        }}>
          + Adicionar Contato
        </button>
      </div>

      {/* Message */}
      {message && (
        <div style={{
          padding: '0.7rem 1rem', borderRadius: '0.5rem', marginBottom: '1rem',
          background: message.type === 'ok' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${message.type === 'ok' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          color: message.type === 'ok' ? '#4ade80' : '#ef4444',
          fontSize: '0.85rem', fontWeight: 600,
        }}>
          {message.text}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }} onClick={() => setShowForm(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
            borderRadius: '1rem', padding: '2rem', width: '100%', maxWidth: '450px',
            boxShadow: 'var(--shadow-xl)',
          }}>
            <h2 style={{ color: 'var(--text-primary)', fontSize: '1.1rem', marginBottom: '1.5rem', fontWeight: 700 }}>
              {editing ? '✏️ Editar Contato' : '➕ Novo Contato'}
            </h2>

            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>Nome Completo *</label>
              <input value={formNome} onChange={e => setFormNome(e.target.value)}
                placeholder="Ex: João da Silva" style={inputStyle} />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>CPF *</label>
              <input value={formCpf} onChange={e => setFormCpf(cpfMask(e.target.value))}
                placeholder="000.000.000-00" maxLength={14} style={inputStyle} />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={labelStyle}>WhatsApp *</label>
              <input value={formTel} onChange={e => setFormTel(phoneMask(e.target.value))}
                placeholder="+55 (00) 00000-0000" maxLength={19} style={inputStyle} />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setShowForm(false)} style={{
                flex: 1, padding: '0.7rem', borderRadius: '0.5rem',
                border: '1px solid var(--border-default)', background: 'transparent',
                color: 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer',
              }}>
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving} style={{
                flex: 1, padding: '0.7rem', borderRadius: '0.5rem', border: 'none',
                background: saving ? 'rgba(212,175,55,0.3)' : 'var(--gradient-brand)',
                color: '#fff', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
              }}>
                {saving ? 'Salvando...' : editing ? 'Atualizar' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{ marginBottom: '1rem' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Buscar contato por nome..."
          style={{
            ...inputStyle, maxWidth: '400px',
            background: 'var(--bg-card)',
          }}
        />
      </div>

      {/* Contacts List */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-default)',
        borderRadius: '1rem', overflow: 'hidden',
      }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Carregando contatos...
          </div>
        ) : contatos.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📭</div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              {search ? 'Nenhum contato encontrado' : 'Nenhum contato cadastrado ainda'}
            </p>
            {!search && (
              <button onClick={openAdd} style={{
                marginTop: '1rem', padding: '0.5rem 1rem', borderRadius: '0.5rem',
                border: '1px solid var(--border-default)', background: 'transparent',
                color: '#d4af37', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem',
              }}>
                Adicionar primeiro contato
              </button>
            )}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['NOME', 'CPF', 'TELEFONE', 'AÇÕES'].map(h => (
                  <th key={h} style={{
                    padding: '0.75rem 1rem', textAlign: h === 'AÇÕES' ? 'center' : 'left',
                    borderBottom: '1px solid var(--border-default)', color: '#d4af37',
                    fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contatos.map((c) => (
                <tr key={c.rowIndex} style={{ transition: 'background 0.15s' }}
                  onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseOut={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.04)', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.85rem' }}>
                    {c.nome}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.04)', color: 'var(--text-secondary)', fontSize: '0.85rem', fontFamily: 'monospace' }}>
                    {formatCPF(c.cpf)}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.04)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    {formatPhone(c.telefone)}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                      {/* WhatsApp */}
                      <button
                        onClick={() => window.open(`https://wa.me/${c.telefone}`, '_blank')}
                        title="Abrir WhatsApp"
                        style={{
                          padding: '0.35rem 0.5rem', borderRadius: '0.35rem', border: 'none',
                          background: 'rgba(37,211,102,0.15)', color: '#25D366',
                          cursor: 'pointer', fontSize: '0.9rem', transition: 'all 0.2s',
                        }}
                      >
                        💬
                      </button>
                      {/* Edit */}
                      <button
                        onClick={() => openEdit(c)}
                        title="Editar"
                        style={{
                          padding: '0.35rem 0.5rem', borderRadius: '0.35rem', border: 'none',
                          background: 'rgba(212,175,55,0.1)', color: '#d4af37',
                          cursor: 'pointer', fontSize: '0.9rem', transition: 'all 0.2s',
                        }}
                      >
                        ✏️
                      </button>
                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(c)}
                        title="Excluir"
                        style={{
                          padding: '0.35rem 0.5rem', borderRadius: '0.35rem', border: 'none',
                          background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                          cursor: 'pointer', fontSize: '0.9rem', transition: 'all 0.2s',
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '1rem', textAlign: 'center' }}>
        Total: {contatos.length} contato{contatos.length !== 1 ? 's' : ''}
      </p>
    </div>
  );
}
