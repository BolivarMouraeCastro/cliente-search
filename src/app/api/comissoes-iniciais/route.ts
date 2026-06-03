import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

const INICIAIS_ROOT_FOLDER_ID = '1AFf7qFK2cYNPDmOJuAqVFfiqK2pmMBuZ';
const ADVOGADOS_INICIAIS = ['ELITON', 'ALESSANDRA', 'JESSÉ', 'JAMILLE'];

interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  createdTime?: string;
}

const isFolder = (item: DriveItem) => item.mimeType === 'application/vnd.google-apps.folder';

async function findFolder(token: string, nameContains: string, parentId: string): Promise<string | null> {
  const safeName = nameContains.replace(/'/g, "\\'");
  const params = new URLSearchParams({
    q: `'${parentId}' in parents and name contains '${safeName}' and trashed = false and mimeType = 'application/vnd.google-apps.folder'`,
    fields: 'files(id, name)',
    pageSize: '1',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
  });
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

async function listChildren(token: string, folderId: string, fields = 'id, name, mimeType'): Promise<DriveItem[]> {
  const all: DriveItem[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: `nextPageToken, files(${fields})`,
      pageSize: '500',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) break;
    const data = await res.json();
    all.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return all;
}

// Extract empresa from folder name if present (e.g., "JOÃO SILVA X EMPRESA LTDA")
function extractClienteEmpresa(folderName: string): { cliente: string; empresa: string } {
  // Common patterns: "CLIENTE X EMPRESA" or "CLIENTE x EMPRESA"
  const xMatch = folderName.match(/^(.+?)\s+[xX]\s+(.+)$/);
  if (xMatch) {
    return { cliente: xMatch[1].trim(), empresa: xMatch[2].trim() };
  }
  return { cliente: folderName.trim(), empresa: '' };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const token = session.accessToken;
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Process each lawyer in parallel
    const results = await Promise.all(ADVOGADOS_INICIAIS.map(async (advNome) => {
      // Find the lawyer's folder
      const advFolderId = await findFolder(token, advNome, INICIAIS_ROOT_FOLDER_ID);
      if (!advFolderId) {
        return { nome: advNome, total: 0, mesAtual: 0, clientes: [] as { cliente: string; empresa: string; data: string }[] };
      }

      // Find CORREÇÃO folder inside
      const correcaoId = await findFolder(token, 'CORREÇÃO', advFolderId);
      // Also try without accent
      const correcaoId2 = correcaoId || await findFolder(token, 'CORRECAO', advFolderId);
      if (!correcaoId2) {
        return { nome: advNome, total: 0, mesAtual: 0, clientes: [] as { cliente: string; empresa: string; data: string }[] };
      }

      // List all items in CORREÇÃO (folders = client processes)
      const items = await listChildren(token, correcaoId2, 'id, name, mimeType, createdTime');
      const folders = items.filter(isFolder);

      // Count total and this month's items
      let mesAtual = 0;
      const clientes: { cliente: string; empresa: string; data: string }[] = [];

      for (const folder of folders) {
        const created = folder.createdTime ? new Date(folder.createdTime) : null;
        const isThisMonth = created && created.getMonth() === currentMonth && created.getFullYear() === currentYear;
        
        if (isThisMonth) {
          mesAtual++;
        }

        const { cliente, empresa } = extractClienteEmpresa(folder.name);
        clientes.push({
          cliente,
          empresa,
          data: created ? `${String(created.getDate()).padStart(2, '0')}/${String(created.getMonth() + 1).padStart(2, '0')}/${created.getFullYear()}` : 'N/A',
        });
      }

      // Sort by most recent first
      clientes.sort((a, b) => {
        const [da, ma, ya] = a.data.split('/').map(Number);
        const [db, mb, yb] = b.data.split('/').map(Number);
        return (yb * 10000 + mb * 100 + db) - (ya * 10000 + ma * 100 + da);
      });

      return {
        nome: advNome,
        total: folders.length,
        mesAtual,
        clientes,
      };
    }));

    const mesNomes = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    return NextResponse.json({
      advogados: results,
      mesAtual: mesNomes[currentMonth],
      totalGeral: results.reduce((s, r) => s + r.total, 0),
      totalMes: results.reduce((s, r) => s + r.mesAtual, 0),
    });

  } catch (err) {
    console.error('Iniciais comissoes error:', err);
    return NextResponse.json(
      { error: `Erro: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
