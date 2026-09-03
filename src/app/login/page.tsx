'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams?.get('error');
  const kicked = searchParams?.get('kicked');

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const result = await signIn('credentials', {
      email: email.trim().toLowerCase(),
      password: senha,
      redirect: false,
    });

    if (result?.error) {
      setMessage({ type: 'error', text: 'Email ou senha incorretos.' });
      setLoading(false);
    } else {
      window.location.href = '/dashboard';
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !senha || !nome) {
      setMessage({ type: 'error', text: 'Preencha todos os campos.' });
      return;
    }
    if (senha.length < 4) {
      setMessage({ type: 'error', text: 'A senha deve ter pelo menos 4 caracteres.' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), senha, nome: nome.trim() }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({ type: 'success', text: 'Conta criada! Fazendo login...' });
        // Auto login after registration
        const loginResult = await signIn('credentials', {
          email: email.trim().toLowerCase(),
          password: senha,
          redirect: false,
        });
        if (loginResult?.ok) {
          window.location.href = '/dashboard';
        } else {
          setMessage({ type: 'success', text: 'Conta criada! Faça login agora.' });
          setMode('login');
          setLoading(false);
        }
      } else {
        setMessage({ type: 'error', text: data.error || 'Erro ao criar conta.' });
        setLoading(false);
      }
    } catch {
      setMessage({ type: 'error', text: 'Erro de conexão.' });
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '0.85rem 1rem',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '0.6rem',
    color: 'white',
    fontSize: '0.9rem',
    outline: 'none',
    boxSizing: 'border-box' as const,
    transition: 'border-color 0.2s',
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
        padding: '2.5rem 2rem',
        width: '100%',
        maxWidth: '400px',
        boxShadow: 'var(--shadow-xl)',
        textAlign: 'center',
        margin: '1rem'
      }}>
        {/* Logo */}
        <div style={{ marginBottom: '1.5rem' }}>
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

        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          {mode === 'login' ? 'Entre com suas credenciais' : 'Crie sua conta'}
        </p>


        {/* Error/Success Messages */}
        {(error || message) && (
          <div style={{
            background: message?.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.08)',
            color: message?.type === 'success' ? '#4ade80' : '#ef4444',
            padding: '0.75rem',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
            fontSize: '0.8rem',
            border: `1px solid ${message?.type === 'success' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
          }}>
            {message?.text || 'Erro ao fazer login.'}
          </div>
        )}

        {/* Form */}
        <form onSubmit={mode === 'login' ? handleCredentialsLogin : handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {mode === 'register' && (
            <input
              type="text"
              placeholder="Nome completo"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              style={inputStyle}
              required
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            required
          />
          <input
            type="password"
            placeholder="Senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            style={inputStyle}
            required
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '0.85rem',
              marginTop: '0.5rem',
              background: 'linear-gradient(135deg, #d4af37, #aa8035)',
              border: 'none',
              borderRadius: '0.6rem',
              color: 'white',
              fontWeight: 700,
              fontSize: '0.95rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              transition: 'all 0.2s',
            }}
          >
            {loading ? (mode === 'login' ? 'Entrando...' : 'Criando conta...') : (mode === 'login' ? 'Entrar' : 'Criar Conta')}
          </button>
        </form>

        {/* Toggle Login/Register */}
        <div style={{ marginTop: '1rem' }}>
          <button
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setMessage(null); }}
            style={{
              background: 'none',
              border: 'none',
              color: '#d4af37',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600,
              textDecoration: 'underline',
            }}
          >
            {mode === 'login' ? 'Não tem conta? Criar agora' : 'Já tem conta? Fazer login'}
          </button>
        </div>

        {/* Divider */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          margin: '1.5rem 0 1rem',
        }}>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>OU</span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
        </div>

        {/* Google Login */}
        <button
          onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.6rem',
            padding: '0.75rem',
            background: 'rgba(255,255,255,0.05)',
            color: 'var(--text-secondary)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '0.6rem',
            fontSize: '0.85rem',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Entrar com Google
        </button>

        <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            Sistema exclusivo para colaboradores autorizados.
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
