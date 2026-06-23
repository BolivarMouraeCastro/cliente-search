import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getLixeiraIds } from '@/lib/lixeira';
import { getEffectiveAccessToken } from '@/lib/admin-token';

const BOLIVAR_FOLDER_ID = '10qkRpTzO4hwiR_QIFt_KlCT1Rw7KRKJh';

// Parse initial petition folder names
function parseInicialName(raw: string): { cliente: string; prescricao: string; empresa: string } {
  const dashIdx = raw.indexOf(' - ');
  if (dashIdx === -1) {
    return { cliente: raw, prescricao: '', empresa: '' };
  }

  const cliente = raw.substring(0, dashIdx).trim();
  const rest = raw.substring(dashIdx + 3).trim();

  const dateMatch = rest.match(/(\d{1,2}[\/\.]\d{1,2}[\/\.]\d{2,4})/);
  if (dateMatch) {
    const prescricao = dateMatch[1];
    const afterDate = rest.substring(rest.indexOf(prescricao) + prescricao.length).trim();
    const empresa = afterDate.replace(/^[\s\-,eE]+/, '').trim();
    return { cliente, prescricao, empresa };
  }

  return { cliente, prescricao: '', empresa: rest };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const accessToken = await getEffectiveAccessToken(session?.user?.email, (session as any)?.accessToken);
    if (!accessToken) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get('q');
    
    if (!query || query.length < 3) {
      return NextResponse.json({ results: [] });
    }

    // Escape single quotes for Google Drive query
    const safeQuery = query.replace(/'/g, "\\'");
    const driveQuery = `'${BOLIVAR_FOLDER_ID}' in parents and name contains '${safeQuery}' and not name contains '[MOVIDO]' and trashed = false and mimeType = 'application/vnd.google-apps.folder'`;

    const params = new URLSearchParams({
      q: driveQuery,
      fields: 'files(id, name, createdTime)',
      pageSize: '20',
      orderBy: 'createdTime desc',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true'
    });

    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Drive API Error:', err);
      return NextResponse.json({ error: 'Erro ao buscar no Drive' }, { status: 500 });
    }

    const data = await res.json();
    const files = data.files || [];
    
    // Virtual Trash filtering
    const lixeiraIds = await getLixeiraIds(accessToken);

    const results = files
      .filter((f: any) => !lixeiraIds.has(f.id))
      .map((f: any) => {
        const parsed = parseInicialName(f.name);
        return {
          id: f.id,
          name: f.name,
          createdTime: f.createdTime,
          cliente: parsed.cliente,
          prescricao: parsed.prescricao,
          empresa: parsed.empresa
        };
      });

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}
