'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';

export type UserRole = 'admin' | 'colaborador' | 'unauthorized' | 'loading';

const ADMIN_EMAIL = 'advogadosbmc@gmail.com';

export function useUserRole(): { role: UserRole; isAdmin: boolean; isLoading: boolean } {
  const { data: session, status } = useSession();
  const [role, setRole] = useState<UserRole>('loading');

  useEffect(() => {
    if (status === 'loading') return;
    if (!session?.user?.email) { setRole('unauthorized'); return; }

    const email = session.user.email.toLowerCase();

    // Admin check
    if (email === ADMIN_EMAIL) {
      setRole('admin');
      if (typeof window !== 'undefined') sessionStorage.setItem('user_role', 'admin');
      return;
    }

    // Check if collaborator is registered
    fetch('/api/usuarios')
      .then(res => res.json())
      .then(data => {
        if (data.role === 'colaborador' || data.role === 'admin') {
          setRole(data.role);
          if (typeof window !== 'undefined') sessionStorage.setItem('user_role', data.role);
        } else {
          setRole('unauthorized');
          if (typeof window !== 'undefined') sessionStorage.setItem('user_role', 'unauthorized');
        }
      })
      .catch(() => {
        // Fallback: check sessionStorage
        if (typeof window !== 'undefined') {
          const stored = sessionStorage.getItem('user_role') as UserRole;
          if (stored) setRole(stored);
          else setRole('unauthorized');
        }
      });
  }, [session, status]);

  return {
    role,
    isAdmin: role === 'admin',
    isLoading: role === 'loading' || status === 'loading',
  };
}

// Activity logger
export function logActivity(acao: string, detalhes: string) {
  fetch('/api/usuarios/atividades', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acao, detalhes }),
  }).catch(() => {}); // Fire and forget
}
