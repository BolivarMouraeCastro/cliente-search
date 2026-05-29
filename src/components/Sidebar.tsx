'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useSession, signIn, signOut } from 'next-auth/react';
import Link from 'next/link';

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Close sidebar on escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const navLinks = [
    {
      href: '/dashboard',
      label: 'Dashboard',
      icon: (
        <svg className="sidebar-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      ),
    },
    {
      href: '/',
      label: 'Buscar Cliente',
      icon: (
        <svg className="sidebar-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      ),
    },
    {
      href: '/materias',
      label: 'Fases (CNJ)',
      icon: (
        <svg className="sidebar-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4" />
          <polyline points="14 2 14 8 20 8" />
          <path d="M2 15h10" />
          <path d="m9 18 3-3-3-3" />
        </svg>
      ),
    },
  ];

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="sidebar-toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Abrir menu"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {isOpen ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <>
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          )}
        </svg>
      </button>

      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay ${isOpen ? 'visible' : ''}`}
        onClick={() => setIsOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-brand" style={{ flexDirection: 'column', gap: '0.25rem', padding: 'var(--space-xl) var(--space-md)', textAlign: 'center' }}>
          <div style={{ marginBottom: '0.5rem', color: 'var(--accent-blue)', display: 'flex', justifyContent: 'center' }}>
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v18" />
              <path d="M3 10a4 4 0 0 0 8 0" />
              <path d="M3 10h8" />
              <path d="M13 10a4 4 0 0 0 8 0" />
              <path d="M13 10h8" />
              <path d="M12 7H4.5" />
              <path d="M12 7h7.5" />
              <path d="M7 3v4" />
              <path d="M17 3v4" />
              <path d="M9 21h6" />
            </svg>
          </div>
          <span style={{ 
            fontFamily: 'var(--font-serif)', 
            fontSize: '1.4rem', 
            fontWeight: 700, 
            letterSpacing: '0.05em',
            background: 'var(--gradient-brand)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            BM&C
          </span>
          <span style={{
            fontSize: '0.65rem',
            fontWeight: 500,
            color: 'var(--text-muted)',
            letterSpacing: '0.2em',
            textTransform: 'uppercase'
          }}>
            Advogados
          </span>
        </div>

        <nav className="sidebar-nav">
          {navLinks.map((link, i) => (
            <Link
              key={i}
              href={link.href}
              className={`sidebar-link ${pathname === link.href ? 'active' : ''}`}
            >
              {link.icon}
              <span className="sidebar-link-text">{link.label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          {session?.user ? (
            <>
              <div className="sidebar-avatar">
                {session.user.image ? (
                  <img src={session.user.image} alt={session.user.name || 'Avatar'} />
                ) : (
                  <div className="flex-center" style={{ width: '100%', height: '100%', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                    {(session.user.name || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{session.user.name}</div>
                <div className="sidebar-user-email">{session.user.email}</div>
              </div>
              <button
                className="sidebar-signout"
                onClick={() => signOut()}
                aria-label="Sair"
                title="Sair"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </>
          ) : (
            <button onClick={() => signIn('google', { callbackUrl: '/' })} className="sidebar-link" style={{ flex: 1, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: 'var(--space-sm) var(--space-md)' }}>
              <svg className="sidebar-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              <span className="sidebar-link-text">Entrar</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
