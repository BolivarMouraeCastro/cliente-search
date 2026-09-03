'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

const ADMIN_EMAIL = 'gabriielroberto10@gmail.com';

interface AdminData {
  users: Array<{ email: string; nome: string; role: string; dataCadastro: string }>;
  activities: Array<{ timestamp: string; email: string; nome: string; acao: string; detalhes: string }>;
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<string>('');
  const [kickingEmail, setKickingEmail] = useState<string | null>(null);
  const [kickMessage, setKickMessage] = useState<string | null>(null);

  const fetchData = () => {
    fetch('/api/admin')
      .then(res => res.json())
      .then((d: AdminData) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    if (session?.user?.email === ADMIN_EMAIL) {
      fetchData();
    } else if (status !== 'loading') {
      setLoading(false);
    }
  }, [session, status]);

  const handleKick = async (email: string) => {
    if (!confirm(`Deseja forçar a saída de ${email}?`)) return;
    setKickingEmail(email);
    setKickMessage(null);
    try {
      const res = await fetch('/api/admin/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setKickMessage(`✅ ${email} foi desconectado!`);
        // Refresh data
        fetchData();
      } else {
        setKickMessage(`❌ Erro ao desconectar ${email}`);
      }
    } catch {
      setKickMessage('❌ Erro de conexão');
    }
    setKickingEmail(null);
    setTimeout(() => setKickMessage(null), 4000);
  };

  if (status === 'loading' || loading) {
    return (
      <div className="detail-page" style={{ padding: '2rem' }}>
        <h1 style={{ color: '#d4af37', marginBottom: '2rem' }}>📋 Painel Administrativo</h1>
        <div style={{
          background: 'var(--card-bg)', border: '1px solid var(--card-border)',
          borderRadius: '1rem', padding: '2rem', height: '200px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1rem', color: 'var(--text-muted)',
        }}>
          Carregando dados do painel...
        </div>
      </div>
    );
  }

  if (session?.user?.email !== ADMIN_EMAIL) {
    return (
      <div className="detail-page" style={{ padding: '4rem', textAlign: 'center', color: '#ef4444', fontSize: '1.5rem', fontWeight: 'bold' }}>
        ⛔ Acesso negado
      </div>
    );
  }

  if (!data) return <div className="detail-page" style={{ padding: '2rem', color: '#fff' }}>Erro ao carregar dados.</div>;

  const today = new Date().toISOString().split('T')[0];

  const loginsToday = data.activities.filter(act => {
    try {
      const actDate = new Date(act.timestamp).toISOString().split('T')[0];
      return act.acao === 'LOGIN' && actDate === today;
    } catch { return false; }
  });

  const filteredActivities = data.activities
    .filter(act => act.acao === 'CLIQUE_SIDEBAR' || act.acao === 'LOGIN' || act.acao === 'KICK')
    .filter(act => {
      if (!dateFilter) return true;
      try {
        const actDate = new Date(act.timestamp).toISOString().split('T')[0];
        return actDate === dateFilter;
      } catch { return false; }
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const sectionStyle = {
    background: 'var(--card-bg)', border: '1px solid var(--card-border)',
    borderRadius: '1rem', padding: '1.5rem', marginBottom: '1.5rem',
    overflowX: 'auto' as const,
  };

  const thStyle = {
    padding: '0.75rem', textAlign: 'left' as const,
    borderBottom: '1px solid var(--card-border)', color: '#d4af37',
    fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  };

  const tdStyle = {
    padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.04)',
    color: 'var(--text-secondary)', fontSize: '0.85rem',
  };

  const kickBtnStyle = {
    padding: '0.35rem 0.75rem', borderRadius: '0.4rem',
    border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)',
    color: '#ef4444', fontSize: '0.75rem', fontWeight: 600,
    cursor: 'pointer', transition: 'all 0.2s',
  };

  return (
    <div className="detail-page" style={{ padding: '1.5rem' }}>
      <h1 style={{ color: '#d4af37', marginBottom: '0.25rem', fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        📋 Painel Administrativo
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.5rem' }}>
        Gerencie usuários e monitore atividades do sistema
      </p>

      {/* Kick message */}
      {kickMessage && (
        <div style={{
          padding: '0.75rem 1rem', borderRadius: '0.5rem', marginBottom: '1rem',
          background: kickMessage.startsWith('✅') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${kickMessage.startsWith('✅') ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          color: kickMessage.startsWith('✅') ? '#4ade80' : '#ef4444',
          fontSize: '0.85rem', fontWeight: 600,
        }}>
          {kickMessage}
        </div>
      )}

      {/* Usuarios Cadastrados */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 700, margin: 0 }}>
            👥 Usuários Cadastrados
          </h2>
          <span style={{ color: '#d4af37', fontWeight: 800, fontSize: '0.9rem' }}>{data.users.length}</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Nome</th>
              <th style={thStyle}>Cadastro</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((user, i) => (
              <tr key={i}>
                <td style={tdStyle}>{user.email}</td>
                <td style={tdStyle}>{user.nome}</td>
                <td style={tdStyle}>
                  {user.dataCadastro ? new Date(user.dataCadastro).toLocaleDateString('pt-BR') : '—'}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  {user.email !== ADMIN_EMAIL && (
                    <button
                      onClick={() => handleKick(user.email)}
                      disabled={kickingEmail === user.email}
                      style={{
                        ...kickBtnStyle,
                        opacity: kickingEmail === user.email ? 0.5 : 1,
                      }}
                    >
                      {kickingEmail === user.email ? '...' : '🚪 Sair'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {data.users.length === 0 && (
              <tr><td colSpan={4} style={{ ...tdStyle, textAlign: 'center', padding: '1.5rem' }}>Nenhum usuário cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Logins Hoje */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 700, margin: 0 }}>
            🔑 Logins Hoje
          </h2>
          <span style={{ color: '#4ade80', fontWeight: 800, fontSize: '0.9rem' }}>{loginsToday.length}</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Hora</th>
              <th style={thStyle}>Tipo</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {loginsToday.map((login, i) => (
              <tr key={i}>
                <td style={tdStyle}>{login.email}</td>
                <td style={tdStyle}>{new Date(login.timestamp).toLocaleTimeString('pt-BR')}</td>
                <td style={tdStyle}>{login.detalhes || 'Login'}</td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  {login.email !== ADMIN_EMAIL && (
                    <button
                      onClick={() => handleKick(login.email)}
                      disabled={kickingEmail === login.email}
                      style={{
                        ...kickBtnStyle,
                        opacity: kickingEmail === login.email ? 0.5 : 1,
                      }}
                    >
                      {kickingEmail === login.email ? '...' : '🚪 Sair'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {loginsToday.length === 0 && (
              <tr><td colSpan={4} style={{ ...tdStyle, textAlign: 'center', padding: '1.5rem' }}>Nenhum login hoje.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Relatório de Atividades */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <h2 style={{ color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 700, margin: 0 }}>
            📊 Relatório de Atividades
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="date"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              style={{
                padding: '0.4rem 0.75rem', borderRadius: '0.4rem',
                border: '1px solid var(--card-border)', background: 'rgba(0,0,0,0.3)',
                color: '#fff', colorScheme: 'dark', outline: 'none', fontSize: '0.8rem',
              }}
            />
            {dateFilter && (
              <button
                onClick={() => setDateFilter('')}
                style={{
                  padding: '0.4rem 0.75rem', borderRadius: '0.4rem',
                  border: 'none', background: 'rgba(212,175,55,0.15)',
                  color: '#d4af37', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem',
                }}
              >
                Limpar
              </button>
            )}
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Ação</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Detalhes</th>
              <th style={thStyle}>Data/Hora</th>
            </tr>
          </thead>
          <tbody>
            {filteredActivities.slice(0, 100).map((act, i) => (
              <tr key={i}>
                <td style={{
                  ...tdStyle,
                  color: act.acao === 'LOGIN' ? '#4ade80' : act.acao === 'KICK' ? '#ef4444' : '#60a5fa',
                  fontWeight: 600, fontSize: '0.8rem',
                }}>
                  {act.acao === 'LOGIN' ? '● LOGIN' : act.acao === 'KICK' ? '● KICK' : '● CLIQUE'}
                </td>
                <td style={tdStyle}>{act.email}</td>
                <td style={tdStyle}>{act.detalhes}</td>
                <td style={tdStyle}>{new Date(act.timestamp).toLocaleString('pt-BR')}</td>
              </tr>
            ))}
            {filteredActivities.length === 0 && (
              <tr>
                <td colSpan={4} style={{ ...tdStyle, textAlign: 'center', padding: '1.5rem' }}>
                  Nenhuma atividade{dateFilter ? ` em ${dateFilter}` : ''}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
