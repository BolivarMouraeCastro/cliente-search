'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect, useCallback } from 'react';

export type UserRole = 'admin' | 'colaborador' | 'unauthorized' | 'loading';

const ADMIN_EMAIL = 'advogadosbmc@gmail.com';

export function useUserRole(): { role: UserRole; isAdmin: boolean; isLoading: boolean } {
  const { data: session, status } = useSession();
  const [role, setRole] = useState<UserRole>(() => {
    // Initialize from sessionStorage to avoid flash
    if (typeof window !== 'undefined') {
      const cached = sessionStorage.getItem('user_role') as UserRole;
      if (cached === 'admin' || cached === 'colaborador') return cached;
    }
    return 'loading';
  });

  useEffect(() => {
    if (status === 'loading') return;
    if (!session?.user?.email) { setRole('unauthorized'); return; }

    const email = session.user.email.toLowerCase().trim();

    // Admin check - direct, no API needed
    if (email === ADMIN_EMAIL) {
      setRole('admin');
      if (typeof window !== 'undefined') sessionStorage.setItem('user_role', 'admin');
      return;
    }

    // For non-admin, check if registered as collaborator via API
    fetch('/api/usuarios')
      .then(res => res.json())
      .then(data => {
        const r = data.role === 'colaborador' ? 'colaborador' : 'unauthorized';
        setRole(r);
        if (typeof window !== 'undefined') sessionStorage.setItem('user_role', r);
      })
      .catch(() => {
        setRole('unauthorized');
      });
  }, [session, status]);

  return {
    role,
    isAdmin: role === 'admin',
    isLoading: status === 'loading',
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
