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

  useEffect(() => {
    if (session?.user?.email === ADMIN_EMAIL) {
      fetch('/api/admin')
        .then(res => res.json())
        .then((data: AdminData) => {
          setData(data);
          setLoading(false);
        })
        .catch(err => {
          console.error('Failed to fetch admin data', err);
          setLoading(false);
        });
    } else if (status !== 'loading') {
      setLoading(false);
    }
  }, [session, status]);

  if (status === 'loading' || loading) {
    return (
      <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', color: '#fff' }}>
        <h1 style={{ color: '#d4af37', marginBottom: '2rem' }}>📋 Painel Administrativo</h1>
        <div style={{
          background: 'var(--card-bg, #1a1a1a)',
          border: '1px solid var(--card-border, #333)',
          borderRadius: '1rem',
          padding: '2rem',
          height: '200px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.2rem',
          color: '#888',
          animation: 'pulse 2s infinite',
        }}>
          Carregando dados do painel...
        </div>
      </div>
    );
  }

  if (session?.user?.email !== ADMIN_EMAIL) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', color: '#ff4444', fontSize: '1.5rem', fontWeight: 'bold' }}>
        Acesso negado
      </div>
    );
  }

  if (!data) return <div style={{ padding: '2rem', color: '#fff' }}>Erro ao carregar dados.</div>;

  const today = new Date().toISOString().split('T')[0];

  const loginsToday = data.activities.filter(act => {
    const actDate = new Date(act.timestamp).toISOString().split('T')[0];
    return act.acao === 'LOGIN' && actDate === today;
  });

  const filteredActivities = data.activities
    .filter(act => act.acao === 'CLIQUE_SIDEBAR' || act.acao === 'LOGIN')
    .filter(act => {
      if (!dateFilter) return true;
      const actDate = new Date(act.timestamp).toISOString().split('T')[0];
      return actDate === dateFilter;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const tableHeaderStyle = {
    padding: '1rem',
    textAlign: 'left' as const,
    borderBottom: '1px solid var(--card-border, #333)',
    color: '#d4af37',
    fontWeight: '600'
  };

  const tableCellStyle = {
    padding: '1rem',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    color: '#ddd'
  };

  const sectionStyle = {
    background: 'var(--card-bg, #1e1e1e)',
    border: '1px solid var(--card-border, #333)',
    borderRadius: '1rem',
    padding: '2rem',
    marginBottom: '2rem',
    overflowX: 'auto' as const
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <h1 style={{ color: '#d4af37', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        📋 Painel Administrativo
      </h1>

      <div style={sectionStyle}>
        <h2 style={{ color: '#fff', marginBottom: '1.5rem', fontSize: '1.5rem', display: 'flex', justifyContent: 'space-between' }}>
          <span>Usuários Cadastrados</span>
          <span style={{ color: '#d4af37' }}>Total: {data.users.length}</span>
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={tableHeaderStyle}>Email</th>
              <th style={tableHeaderStyle}>Nome</th>
              <th style={tableHeaderStyle}>Data de Cadastro</th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((user, i) => (
              <tr key={i} style={{ transition: 'background-color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                <td style={tableCellStyle}>{user.email}</td>
                <td style={tableCellStyle}>{user.nome}</td>
                <td style={tableCellStyle}>{new Date(user.dataCadastro).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={sectionStyle}>
        <h2 style={{ color: '#fff', marginBottom: '1.5rem', fontSize: '1.5rem', display: 'flex', justifyContent: 'space-between' }}>
          <span>Logins Hoje</span>
          <span style={{ color: '#d4af37' }}>Total: {loginsToday.length}</span>
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={tableHeaderStyle}>Email</th>
              <th style={tableHeaderStyle}>Hora</th>
              <th style={tableHeaderStyle}>Tipo / Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {loginsToday.map((login, i) => (
              <tr key={i} style={{ transition: 'background-color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                <td style={tableCellStyle}>{login.email}</td>
                <td style={tableCellStyle}>{new Date(login.timestamp).toLocaleTimeString()}</td>
                <td style={tableCellStyle}>{login.detalhes || 'Login normal'}</td>
              </tr>
            ))}
            {loginsToday.length === 0 && (
              <tr>
                <td colSpan={3} style={{ ...tableCellStyle, textAlign: 'center', padding: '2rem' }}>Nenhum login registrado hoje.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h2 style={{ color: '#fff', fontSize: '1.5rem', margin: 0 }}>
            Relatório de Atividades
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label style={{ color: '#ddd' }}>Filtrar por data:</label>
            <input 
              type="date" 
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--card-border, #444)',
                background: 'rgba(0,0,0,0.3)',
                color: '#fff',
                colorScheme: 'dark',
                outline: 'none',
              }}
            />
            {dateFilter && (
              <button 
                onClick={() => setDateFilter('')}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  background: 'rgba(212, 175, 55, 0.2)',
                  color: '#d4af37',
                  cursor: 'pointer',
                  fontWeight: '600',
                  transition: 'background 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(212, 175, 55, 0.3)'}
                onMouseOut={e => e.currentTarget.style.background = 'rgba(212, 175, 55, 0.2)'}
              >
                Limpar
              </button>
            )}
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={tableHeaderStyle}>Ação</th>
              <th style={tableHeaderStyle}>Email</th>
              <th style={tableHeaderStyle}>Página / Detalhes</th>
              <th style={tableHeaderStyle}>Data/Hora</th>
            </tr>
          </thead>
          <tbody>
            {filteredActivities.map((act, i) => (
              <tr key={i} style={{ transition: 'background-color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                <td style={{
                  ...tableCellStyle, 
                  color: act.acao === 'LOGIN' ? '#4ade80' : '#60a5fa', 
                  fontWeight: '600',
                  fontSize: '0.9rem'
                }}>
                  {act.acao === 'LOGIN' ? '● LOGIN' : '● CLIQUE'}
                </td>
                <td style={tableCellStyle}>{act.email}</td>
                <td style={tableCellStyle}>{act.detalhes}</td>
                <td style={tableCellStyle}>{new Date(act.timestamp).toLocaleString()}</td>
              </tr>
            ))}
            {filteredActivities.length === 0 && (
              <tr>
                <td colSpan={4} style={{ ...tableCellStyle, textAlign: 'center', padding: '2rem' }}>
                  Nenhuma atividade encontrada{dateFilter ? ` para a data ${dateFilter}` : ''}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
