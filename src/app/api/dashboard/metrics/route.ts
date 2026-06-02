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

    // Date boundaries
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    
    // Monday as start of week
    const currentDay = now.getDay();
    const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1; // 0 is Sunday
    const startOfWeekDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - distanceToMonday);
    startOfWeekDate.setHours(0, 0, 0, 0);
    const startOfWeek = startOfWeekDate.toISOString();

    // Query 1: Novos Clientes (All folders created in Bolivar this year - we will filter month locally to save API calls, but we only really need month)
    const novosClientesQuery = `'${BOLIVAR_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and createdTime >= '${startOfMonth}' and trashed = false`;
    
    // Query 2: Processos Distribuídos (Files containing "RECIBO" created this year globally)
    const distribuidosQuery = `name contains 'RECIBO' and createdTime >= '${startOfYear}' and trashed = false and mimeType != 'application/vnd.google-apps.folder'`;

    const fetchDriveItems = async (query: string) => {
      let allItems: any[] = [];
      let pageToken: string | undefined = undefined;

      do {
        const params = new URLSearchParams({
          q: query,
          fields: 'nextPageToken, files(id, name, createdTime, parents)',
          pageSize: '1000',
          orderBy: 'createdTime desc',
          supportsAllDrives: 'true',
          includeItemsFromAllDrives: 'true'
        });
        if (pageToken) params.append('pageToken', pageToken);
        
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
          headers: { Authorization: `Bearer ${session.accessToken}` },
          signal: AbortSignal.timeout(15000)
        });
        
        if (!res.ok) {
          console.error('Drive query failed:', await res.text());
          break;
        }
        
        const data = await res.json();
        if (data.files) {
          allItems = allItems.concat(data.files);
        }
        pageToken = data.nextPageToken;
      } while (pageToken);

      return {
        count: allItems.length,
        items: allItems
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

    // Filter "distribuidos" into Week and Year
    const distribuidosSemana = distribuidos.items.filter((item: any) => item.createdTime >= startOfWeek);
    
    return NextResponse.json({
      novosClientesMes: novosClientes,
      distribuidosAno: distribuidos,
      distribuidosSemana: {
        count: distribuidosSemana.length,
        items: distribuidosSemana
      }
    });

  } catch (error: any) {
    console.error('Metrics error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
