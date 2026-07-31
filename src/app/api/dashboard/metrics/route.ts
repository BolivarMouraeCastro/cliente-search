import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getClients } from '@/lib/sheets';

export const dynamic = 'force-dynamic';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? '';

interface ProcessoItem {
  id: string;
  name: string;
  createdTime: string;
}

interface YearDistribution {
  year: string;
  count: number;
  processos: ProcessoItem[];
}

/**
 * Busca a pasta #2026 no Drive (ou o ano atual #YYYY).
 * Retorna o ID da pasta encontrada, ou null se não existir.
 */
async function findYearFolder(accessToken: string, year: string): Promise<string | null> {
  const folderName = `#${year}`;
  const q = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const params = new URLSearchParams({
    q,
    fields: 'files(id, name)',
    pageSize: '5',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
    corpora: 'allDrives',
  });

  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.files && data.files.length > 0) {
        return data.files[0].id;
      }
    } else {
      console.error(`Error finding folder ${folderName}:`, await res.text());
    }
  } catch (e) {
    console.error(`Exception finding folder ${folderName}:`, e);
  }

  return null;
}

/**
 * Conta TODAS as subpastas diretas dentro de uma pasta (com paginação completa).
 * Cada subpasta = 1 processo distribuído.
 * Suporta 1000+ subpastas com paginação automática.
 */
async function countSubfoldersInFolder(
  accessToken: string,
  folderId: string
): Promise<ProcessoItem[]> {
  const allSubfolders: ProcessoItem[] = [];
  let pageToken: string | undefined = undefined;

  const q = `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

  do {
    const params = new URLSearchParams({
      q,
      fields: 'nextPageToken, files(id, name, createdTime)',
      pageSize: '1000',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      corpora: 'allDrives',
    });
    if (pageToken) params.append('pageToken', pageToken);

    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(30000),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.files) {
          allSubfolders.push(
            ...data.files.map((f: any) => ({
              id: f.id,
              name: f.name || 'Processo',
              createdTime: f.createdTime || new Date().toISOString(),
            }))
          );
        }
        pageToken = data.nextPageToken;
      } else {
        console.error(`Drive fetch error (subfolders of ${folderId}):`, await res.text());
        pageToken = undefined;
      }
    } catch (e) {
      console.error(`Drive fetch exception (subfolders of ${folderId}):`, e);
      pageToken = undefined;
    }
  } while (pageToken);

  return allSubfolders;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const now = new Date();
    const currentYearStr = now.getFullYear().toString();
    const currentMonthStr = String(now.getMonth() + 1).padStart(2, '0');

    // =====================================================================
    // Pastas de processos distribuídos por ano no Drive
    // Cada subpasta dentro dessas pastas = 1 processo distribuído
    // =====================================================================
    const YEAR_FOLDERS: Record<string, string> = {
      '2025': '1Gy8nNHponNxrQeX-XwOfBOAXE7QarkBK',
      '2026': '', // será buscado dinamicamente pela pasta #2026
    };

    // Buscar a pasta #2026 dinamicamente e os clientes da planilha
    const [folder2026Id, allClients] = await Promise.all([
      findYearFolder(session.accessToken as string, '2026'),
      getClients(session.accessToken as string, SPREADSHEET_ID),
    ]);

    // Atualizar o ID da pasta 2026 se encontrado
    if (folder2026Id) {
      YEAR_FOLDERS['2026'] = folder2026Id;
    }

    // =====================================================================
    // DISTRIBUIÇÃO POR ANO
    // Buscar subpastas de cada ano em paralelo
    // =====================================================================
    const yearEntries = Object.entries(YEAR_FOLDERS).filter(([, id]) => id !== '');

    const yearResults = await Promise.all(
      yearEntries.map(async ([year, folderId]) => {
        const subfolders = await countSubfoldersInFolder(session.accessToken as string, folderId);
        return {
          year,
          count: subfolders.length,
          processos: subfolders,
        } as YearDistribution;
      })
    );

    // Ordenar por ano decrescente (2026 primeiro, depois 2025)
    const distribuicaoPorAno = yearResults.sort((a, b) => b.year.localeCompare(a.year));
    const totalDistribuidos = distribuicaoPorAno.reduce((sum, y) => sum + y.count, 0);

    // =====================================================================
    // NOVOS CLIENTES: Conta pela planilha de entrada (como antes)
    // =====================================================================
    const formatClientToItem = (c: { id?: string; nome?: string; empresa?: string; entrada: string }): ProcessoItem => {
      const parts = c.entrada.split('/');
      let isoDate = new Date().toISOString();
      if (parts.length === 3) {
        isoDate = `${parts[2]}-${parts[1]}-${parts[0]}T12:00:00.000Z`;
      }
      return {
        id: c.id || Math.random().toString(),
        name: c.nome || c.empresa || 'Cliente S/N',
        createdTime: isoDate,
      };
    };

    const novosClientesAnoItems = allClients.filter(c => c.entrada.endsWith(`/${currentYearStr}`));
    const novosClientesMesItems = novosClientesAnoItems.filter(c => c.entrada.includes(`/${currentMonthStr}/`));

    return NextResponse.json({
      novosClientesMes: { count: novosClientesMesItems.length, items: novosClientesMesItems.map(formatClientToItem) },
      novosClientesAno: { count: novosClientesAnoItems.length, items: novosClientesAnoItems.map(formatClientToItem) },
      distribuicaoPorAno,
      totalDistribuidos,
      debug: {
        yearFolders: yearEntries.map(([year, id]) => ({ year, folderId: id })),
        totalDistribuidos,
      }
    });

  } catch (error: unknown) {
    console.error('Metrics error:', error);
    const message = error instanceof Error ? error.message : 'Erro interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
