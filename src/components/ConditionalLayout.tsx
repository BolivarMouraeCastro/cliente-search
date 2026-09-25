'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

const PUBLIC_ROUTES = ['/meu-processo', '/agenda-publica'];

export default function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_ROUTES.some(r => pathname.startsWith(r));

  if (isPublic) {
    return <>{children}</>;
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">{children}</main>
    </div>
  );
}
