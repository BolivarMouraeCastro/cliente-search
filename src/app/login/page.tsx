'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams?.get('error');
  const denied = searchParams?.get('denied');
  const [selectedRole, setSelectedRole] = useState<'admin' | 'colaborador' | null>(null);

  const handleLogin = (role: 'admin' | 'colaborador') => {
    // Store selected role in sessionStorage before redirect
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('login_role', role);
    }
    signIn('google', { callbackUrl: '/' });
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundImage: 'url(/bmc-wall.png)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      position: 'relative'
    }}>
      {/* Overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: 'rgba(18, 18, 20, 0.75)',
        background: 'linear-gradient(135deg, rgba(18,18,20,0.85) 0%, rgba(26,26,30,0.6) 100%)',
        backdropFilter: 'blur(4px)'
      }} />

      {/* Login Box */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        background: 'rgba(26, 26, 30, 0.65)',
        backdropFilter: 'blur(16px)',
        border: '1px solid var(--border-default)',
        borderRadius: '1.25rem',
        padding: '3rem 2.5rem',
        width: '100%',
        maxWidth: '420px',
        boxShadow: 'var(--shadow-xl)',
        textAlign: 'center',
        margin: '1rem'
      }}>
        {/* Logo */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '2.5rem',
            fontWeight: 800,
            letterSpacing: '0.05em',
            background: 'var(--gradient-brand)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            margin: 0,
            lineHeight: 1
          }}>
            BM&C
          </h1>
          <p style={{
            fontSize: '0.85rem',
            fontWeight: 500,
            color: 'var(--text-muted)',
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            marginTop: '0.5rem'
          }}>
            Advogados
          </p>
        </div>

        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '0.95rem' }}>
          Selecione seu perfil para acessar o sistema.
        </p>

        {error && (
          <div style={{
            background: 'var(--error-glow)',
            color: '#ef4444',
            padding: '0.75rem',
            borderRadius: '0.5rem',
            marginBottom: '1.5rem',
            fontSize: '0.85rem',
            border: '1px solid rgba(239, 68, 68, 0.2)'
          }}>
            Erro ao fazer login. Verifique as permissões.
          </div>
        )}

        {denied === 'true' && (
          <div style={{
            background: 'rgba(239,68,68,0.08)',
            color: '#ef4444',
            padding: '0.75rem',
            borderRadius: '0.5rem',
            marginBottom: '1.5rem',
            fontSize: '0.85rem',
            border: '1px solid rgba(239, 68, 68, 0.2)'
          }}>
            ⛔ Acesso negado. Seu email não está cadastrado. Solicite acesso ao administrador.
          </div>
        )}

        {/* Two Role Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* Admin Button */}
          <button
            onClick={() => handleLogin('admin')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '1rem 1.25rem',
              background: 'linear-gradient(135deg, rgba(212,175,55,0.15), rgba(212,175,55,0.05))',
              color: '#d4af37',
              border: '1px solid rgba(212,175,55,0.3)',
              borderRadius: '0.75rem',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(212,175,55,0.25), rgba(212,175,55,0.1))';
              e.currentTarget.style.boxShadow = '0 8px 32px rgba(212,175,55,0.15)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.background = 'linear-gradient(135deg, rgba(212,175,55,0.15), rgba(212,175,55,0.05))';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{
              width: 40, height: 40, borderRadius: '0.5rem',
              background: 'rgba(212,175,55,0.15)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem',
              flexShrink: 0,
            }}>
              👑
            </div>
            <div style={{ textAlign: 'left' }}>
              <div>Administrador</div>
              <div style={{ fontSize: '0.7rem', fontWeight: 400, color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                Acesso completo ao sistema
              </div>
            </div>
            <svg style={{ marginLeft: 'auto', width: 20, height: 20, opacity: 0.5 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>

          {/* Colaborador Button */}
          <button
            onClick={() => handleLogin('colaborador')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '1rem 1.25rem',
              background: 'rgba(255,255,255,0.03)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '0.75rem',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
              e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.2)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{
              width: 40, height: 40, borderRadius: '0.5rem',
              background: 'rgba(255,255,255,0.06)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem',
              flexShrink: 0,
            }}>
              👤
            </div>
            <div style={{ textAlign: 'left' }}>
              <div>Colaborador</div>
              <div style={{ fontSize: '0.7rem', fontWeight: 400, color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                Estagiários e equipe
              </div>
            </div>
            <svg style={{ marginLeft: 'auto', width: 20, height: 20, opacity: 0.5 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>

        <div style={{ marginTop: '2.5rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1.5rem' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Restrito apenas para colaboradores autorizados.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }} />}>
      <LoginContent />
    </Suspense>
  );
}
