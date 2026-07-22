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
 * Busca todas as pastas no Drive cujo nome segue o padrão #YYYY (ex: #2024, #2025, #2026).
 * Cada pasta dessas representa um ano de processos distribuídos.
 */
async function fetchYearFolders(accessToken: string): Promise<Array<{ id: string; name: string }>> {
  const allFolders: Array<{ id: string; name: string }> = [];
  let pageToken: string | undefined = undefined;

  const q = `name contains '#' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

  do {
    const params = new URLSearchParams({
      q,
      fields: 'nextPageToken, files(id, name)',
      pageSize: '1000',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      corpora: 'allDrives',
    });
    if (pageToken) params.append('pageToken', pageToken);

    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.files) allFolders.push(...data.files);
        pageToken = data.nextPageToken;
      } else {
        console.error('Drive fetch error (year folders):', await res.text());
        pageToken = undefined;
      }
    } catch (e) {
      console.error('Drive fetch exception (year folders):', e);
      pageToken = undefined;
    }
  } while (pageToken);

  // Filtrar apenas pastas com nome no padrão exato #YYYY (ex: #2024, #2025, #2026)
  const yearPattern = /^#(\d{4})$/;
  return allFolders.filter(f => yearPattern.test(f.name));
}

/**
 * Conta TODAS as subpastas diretas dentro de uma pasta (com paginação completa).
 * Cada subpasta = 1 processo distribuído.
 * Retorna também a lista de subpastas para exibição no modal.
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
    // Buscar dados em paralelo:
    // 1. Pastas #YYYY no Drive (para distribuição por ano)
    // 2. Clientes da planilha (para novos clientes mês/ano)
    // =====================================================================
    const [yearFolders, allClients] = await Promise.all([
      fetchYearFolders(session.accessToken),
      getClients(session.accessToken, SPREADSHEET_ID),
    ]);

    // =====================================================================
    // DISTRIBUIÇÃO POR ANO
    // Para cada pasta #YYYY, conta as subpastas (cada subpasta = 1 processo)
    // =====================================================================
    const yearPattern = /^#(\d{4})$/;

    // Buscar subpastas de cada ano em paralelo
    const yearDataPromises = yearFolders.map(async (folder) => {
      const match = folder.name.match(yearPattern);
      if (!match) return null;

      const year = match[1];
      const subfolders = await countSubfoldersInFolder(session.accessToken as string, folder.id);

      return {
        year,
        count: subfolders.length,
        processos: subfolders,
      } as YearDistribution;
    });

    const yearDataResults = await Promise.all(yearDataPromises);

    // Filtrar nulls e ordenar por ano decrescente
    const distribuicaoPorAno: YearDistribution[] = yearDataResults
      .filter((d): d is YearDistribution => d !== null)
      .sort((a, b) => b.year.localeCompare(a.year));

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
        yearFoldersFound: yearFolders.map(f => f.name),
        totalYearFolders: yearFolders.length,
        totalDistribuidos,
      }
    });

  } catch (error: unknown) {
    console.error('Metrics error:', error);
    const message = error instanceof Error ? error.message : 'Erro interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
