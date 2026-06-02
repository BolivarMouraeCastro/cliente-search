import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

const BOLIVAR_FOLDER_ID = '10qkRpTzO4hwiR_QIFt_KlCT1Rw7KRKJh';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Determine the start of the current month
    const now = new Date();
    // UTC string for the first day of the current month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Query 1: Novos Clientes (Folders created in Bolivar this month)
    const novosClientesQuery = `'${BOLIVAR_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and createdTime >= '${startOfMonth}' and trashed = false`;
    
    // Query 2: Processos Distribuídos (Files containing "RECIBO" created this month globally)
    const distribuidosQuery = `name contains 'RECIBO' and createdTime >= '${startOfMonth}' and trashed = false and mimeType != 'application/vnd.google-apps.folder'`;

    const fetchDriveItems = async (query: string) => {
      const params = new URLSearchParams({
        q: query,
        fields: 'files(id, name, createdTime, parents)',
        pageSize: '1000',
        orderBy: 'createdTime desc',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true'
      });
      
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
        signal: AbortSignal.timeout(8000)
      });
      
      if (!res.ok) {
        console.error('Drive query failed:', await res.text());
        return { count: 0, items: [] };
      }
      
      const data = await res.json();
      return {
        count: (data.files || []).length,
        items: data.files || []
      };
    };

    const [novosClientes, distribuidos] = await Promise.all([
      fetchDriveItems(novosClientesQuery),
      fetchDriveItems(distribuidosQuery)
    ]);

    // Resolve parent folder names for the "distribuidos" items
    const parentNameCache = new Map<string, string>();
    for (const item of distribuidos.items) {
      if (item.parents && item.parents.length > 0) {
        const parentId = item.parents[0];
        if (!parentNameCache.has(parentId)) {
          const res = await fetch(`https://www.googleapis.com/drive/v3/files/${parentId}?fields=name&supportsAllDrives=true`, {
            headers: { Authorization: `Bearer ${session.accessToken}` }
          });
          if (res.ok) {
            const data = await res.json();
            parentNameCache.set(parentId, data.name || 'Pasta Desconhecida');
          } else {
            parentNameCache.set(parentId, 'Pasta Desconhecida');
          }
        }
        item.name = parentNameCache.get(parentId) || item.name;
      }
    }

    return NextResponse.json({
      novosClientes,
      distribuidos
    });

  } catch (error: any) {
    console.error('Metrics error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
