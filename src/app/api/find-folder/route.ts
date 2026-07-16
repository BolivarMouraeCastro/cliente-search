import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Buscar a pasta "# RECIBO" dentro da hierarquia conhecida
    const q = `name = '# RECIBO' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const params = new URLSearchParams({
      q,
      fields: 'files(id, name, parents)',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      corpora: 'allDrives',
    });

    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${session.accessToken}` }
    });

    if (!res.ok) {
      return NextResponse.json({ error: await res.text() }, { status: 500 });
    }

    const data = await res.json();
    return NextResponse.json({ folders: data.files || [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
