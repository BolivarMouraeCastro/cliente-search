'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

const ADMIN_EMAIL = 'advogadosbmc@gmail.com';

interface Usuario {
  email: string;
  nome: string;
  role: string;
  dataCadastro: string;
}

interface Atividade {
  timestamp: string;
  email: string;
  nome: string;
  acao: string;
  detalhes: string;
}

export default function UsuariosPage() {
  const { data: session, status } = useSession();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [novoEmail, setNovoEmail] = useState('');
  const [novoNome, setNovoNome] = useState('');
  const [adding, setAdding] = useState(false);
  const [activeTab, setActiveTab] = useState<'usuarios' | 'atividades'>('usuarios');
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const isAdmin = status === 'authenticated' && session?.user?.email?.toLowerCase().trim() === ADMIN_EMAIL;

  useEffect(() => {
    if (status !== 'authenticated') return;
    if (isAdmin) loadData();
  }, [status, isAdmin]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersRes, actRes] = await Promise.all([
        fetch('/api/usuarios'),
        fetch('/api/usuarios/atividades'),
      ]);
      const usersData = await usersRes.json();
      const actData = await actRes.json();
      setUsuarios(usersData.users || []);
      setAtividades(actData.atividades || []);
    } catch { setError('Erro ao carregar dados'); }
    finally { setLoading(false); }
  };

  const handleAdd = async () => {
    if (!novoEmail || !novoNome) { setError('Preencha email e nome'); return; }
    setAdding(true); setError(''); setSuccess('');
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: novoEmail.toLowerCase().trim(), nome: novoNome.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(`✅ ${novoNome} cadastrado! Agora ele pode acessar com o email ${novoEmail} pelo botão "Colaborador".`);
      setNovoEmail(''); setNovoNome(''); setShowAddForm(false);
      loadData();
    } catch (err) { setError(`Erro: ${err instanceof Error ? err.message : String(err)}`); }
    finally { setAdding(false); }
  };

  const handleDelete = async (email: string, nome: string) => {
    if (!confirm(`Remover ${nome} (${email})?`)) return;
    try {
      const res = await fetch('/api/usuarios', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error('Erro ao remover');
      setSuccess(`${nome} removido com sucesso`);
      loadData();
    } catch { setError('Erro ao remover usuário'); }
  };

  const userActivities = selectedUser
    ? atividades.filter(a => a.email === selectedUser)
    : atividades;

  if (status === 'loading' || (loading && isAdmin)) {
    return (
      <div className="detail-page">
        <div className="agenda-loading">
          <div className="upload-spinner" style={{ width: 32, height: 32 }} />
          <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>Carregando...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="detail-page">
        <div className="agenda-loading">
          <div className="upload-spinner" style={{ width: 32, height: 32 }} />
          <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>Verificando permissões...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="detail-page">
      <section className="hero">
        <h1 className="hero-title" style={{ fontSize: '1.8rem' }}>👥 Usuários</h1>
        <p className="hero-subtitle">Cadastre colaboradores e acompanhe atividades</p>
      </section>

      {error && (
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '0.75rem', color: '#ef4444', fontSize: '0.85rem', marginBottom: '1rem', cursor: 'pointer' }} onClick={() => setError('')}>
          ❌ {error}
        </div>
      )}
      {success && (
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '0.75rem', color: '#10b981', fontSize: '0.85rem', marginBottom: '1rem', cursor: 'pointer' }} onClick={() => setSuccess('')}>
          {success}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
        {[
          { key: 'usuarios' as const, label: '👤 Colaboradores', count: usuarios.length },
          { key: 'atividades' as const, label: '📋 Atividades', count: atividades.length },
        ].map(tab => (
          <button key={tab.key} onClick={() => { setActiveTab(tab.key); setSelectedUser(null); }}
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
      </div>

      {/* ── COLABORADORES TAB ──────────────────────────────────────── */}
      {activeTab === 'usuarios' && (
        <div>
          {/* How it works */}
          <div style={{
            padding: '1rem 1.25rem', background: 'rgba(99,102,241,0.05)', borderRadius: '0.75rem',
            border: '1px solid rgba(99,102,241,0.15)', marginBottom: '1.5rem', fontSize: '0.8rem',
            color: 'var(--text-secondary)', lineHeight: 1.7,
          }}>
            <strong style={{ color: '#6366f1' }}>ℹ️ Como funciona:</strong><br />
            1. Cadastre o <strong>email Google</strong> do estagiário abaixo<br />
            2. Envie o link do sistema para ele<br />
            3. Ele clica em <strong>&quot;Colaborador&quot;</strong> e faz login com o Google<br />
            4. Verá apenas: Buscar Cliente, Fazer Inicial, Adicionar Documento, Agenda
          </div>

          {/* Add button */}
          <button onClick={() => setShowAddForm(!showAddForm)}
            style={{
              marginBottom: '1rem', padding: '0.6rem 1.4rem', borderRadius: '999px',
              background: showAddForm ? 'rgba(239,68,68,0.1)' : 'linear-gradient(135deg, #d4af37, #b8962e)',
              color: showAddForm ? '#ef4444' : '#0a0a0f',
              border: showAddForm ? '1px solid rgba(239,68,68,0.3)' : 'none',
              fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
            }}>
            {showAddForm ? '✕ Cancelar' : '+ Cadastrar Colaborador'}
          </button>

          {/* Add form */}
          {showAddForm && (
            <div style={{
              padding: '1.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '1rem',
              border: '1px solid var(--border-subtle)', marginBottom: '1.5rem',
              animation: 'slideUp 0.2s ease-out',
            }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1.25rem' }}>
                📝 Cadastrar novo colaborador
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>Nome completo</label>
                  <input
                    value={novoNome}
                    onChange={(e) => setNovoNome(e.target.value)}
                    placeholder="Ex: João Silva"
                    style={{
                      width: '100%', padding: '0.7rem 1rem', borderRadius: '0.6rem',
                      background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none',
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'rgba(212,175,55,0.4)'}
                    onBlur={(e) => e.target.style.borderColor = 'var(--border-subtle)'}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem', fontWeight: 600 }}>Email Google do estagiário</label>
                  <input
                    value={novoEmail}
                    onChange={(e) => setNovoEmail(e.target.value)}
                    placeholder="estagiario@gmail.com"
                    type="email"
                    style={{
                      width: '100%', padding: '0.7rem 1rem', borderRadius: '0.6rem',
                      background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none',
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'rgba(212,175,55,0.4)'}
                    onBlur={(e) => e.target.style.borderColor = 'var(--border-subtle)'}
                  />
                </div>
                <button
                  onClick={handleAdd}
                  disabled={adding || !novoEmail || !novoNome}
                  style={{
                    padding: '0.7rem 1.5rem', borderRadius: '0.6rem',
                    background: (!novoEmail || !novoNome) ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #d4af37, #b8962e)',
                    color: (!novoEmail || !novoNome) ? 'var(--text-muted)' : '#0a0a0f',
                    border: 'none', fontWeight: 700, fontSize: '0.9rem',
                    cursor: (!novoEmail || !novoNome || adding) ? 'not-allowed' : 'pointer',
                    width: '100%',
                  }}>
                  {adding ? '⏳ Cadastrando...' : '✓ Cadastrar Colaborador'}
                </button>
              </div>
            </div>
          )}

          {/* Users list */}
          {usuarios.length === 0 && !showAddForm ? (
            <div className="empty-state">
              <div className="empty-state-icon">👤</div>
              <div className="empty-state-title">Nenhum colaborador cadastrado</div>
              <div className="empty-state-desc">Clique em &quot;Cadastrar Colaborador&quot; para adicionar estagiários ao sistema.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {usuarios.map((user) => {
                const userActs = atividades.filter(a => a.email === user.email);
                const lastAct = userActs.length > 0 ? userActs[0] : null;
                return (
                  <div key={user.email} className="agenda-card" style={{ borderLeftColor: '#6366f1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: '50%',
                            background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(99,102,241,0.05))',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.85rem', fontWeight: 700, color: '#6366f1',
                          }}>
                            {user.nome.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="agenda-card-name" style={{ fontSize: '0.85rem', margin: 0 }}>{user.nome}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{user.email}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: '0.65rem', padding: '0.15rem 0.5rem', borderRadius: '999px',
                            background: 'rgba(99,102,241,0.12)', color: '#6366f1', fontWeight: 600,
                          }}>
                            Colaborador
                          </span>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                            📅 Cadastrado: {user.dataCadastro}
                          </span>
                          {lastAct && (
                            <span style={{ fontSize: '0.65rem', color: '#10b981' }}>
                              Último acesso: {lastAct.timestamp}
                            </span>
                          )}
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                            {userActs.length} ações
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => { setSelectedUser(user.email); setActiveTab('atividades'); }}
                          style={{
                            padding: '0.35rem 0.7rem', borderRadius: '0.4rem',
                            background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)',
                            color: '#d4af37', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 600,
                          }}>
                          📋 Ver ações
                        </button>
                        <button
                          onClick={() => handleDelete(user.email, user.nome)}
                          style={{
                            padding: '0.35rem 0.7rem', borderRadius: '0.4rem',
                            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                            color: '#ef4444', fontSize: '0.7rem', cursor: 'pointer',
                          }}>
                          ✕ Remover
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── ATIVIDADES TAB ─────────────────────────────────────────── */}
      {activeTab === 'atividades' && (
        <div>
          {selectedUser && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <button onClick={() => setSelectedUser(null)} style={{
                padding: '0.35rem 0.7rem', borderRadius: '0.4rem', background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer',
              }}>← Todos</button>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#d4af37' }}>
                Atividades de {selectedUser}
              </span>
            </div>
          )}

          {userActivities.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <div className="empty-state-title">Nenhuma atividade registrada</div>
              <div className="empty-state-desc">As ações dos colaboradores aparecerão aqui conforme eles usam o sistema.</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.6rem 0.4rem', textAlign: 'left' }}>DATA/HORA</th>
                    <th style={{ padding: '0.6rem 0.4rem', textAlign: 'left' }}>USUÁRIO</th>
                    <th style={{ padding: '0.6rem 0.4rem', textAlign: 'left' }}>AÇÃO</th>
                    <th style={{ padding: '0.6rem 0.4rem', textAlign: 'left' }}>DETALHES</th>
                  </tr>
                </thead>
                <tbody>
                  {userActivities.slice(0, 100).map((act, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '0.5rem 0.4rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '0.72rem' }}>{act.timestamp}</td>
                      <td style={{ padding: '0.5rem 0.4rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.78rem' }}>{act.nome}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{act.email}</div>
                      </td>
                      <td style={{ padding: '0.5rem 0.4rem' }}>
                        <span style={{
                          padding: '0.15rem 0.5rem', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 700,
                          background: 'rgba(212,175,55,0.1)', color: '#d4af37',
                        }}>
                          {act.acao}
                        </span>
                      </td>
                      <td style={{ padding: '0.5rem 0.4rem', color: 'var(--text-secondary)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {act.detalhes}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
