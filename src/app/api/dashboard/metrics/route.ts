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
 * Conta TODOS os itens (pastas e arquivos) dentro de uma pasta do Drive.
 * Usa paginação completa para suportar 1000+ itens.
 * Cada item = 1 processo distribuído.
 */
async function countItemsInFolder(
  accessToken: string,
  folderId: string
): Promise<{ items: ProcessoItem[]; error?: string }> {
  const allItems: ProcessoItem[] = [];
  let pageToken: string | undefined = undefined;
  let lastError: string | undefined = undefined;

  // Conta TUDO dentro da pasta (sem filtro de mimeType)
  const q = `'${folderId}' in parents and trashed = false`;

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
          allItems.push(
            ...data.files.map((f: any) => ({
              id: f.id,
              name: f.name || 'Processo',
              createdTime: f.createdTime || new Date().toISOString(),
            }))
          );
        }
        pageToken = data.nextPageToken;
      } else {
        lastError = await res.text();
        console.error(`Drive fetch error (folder ${folderId}):`, lastError);
        pageToken = undefined;
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.error(`Drive fetch exception (folder ${folderId}):`, lastError);
      pageToken = undefined;
    }
  } while (pageToken);

  return { items: allItems, error: lastError };
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
    // IDs fixos das pastas — cada item dentro = 1 processo distribuído
    // =====================================================================
    const YEAR_FOLDERS: Record<string, string> = {
      '2025': '1Gy8nNHponNxrQeX-XwOfBOAXE7QarkBK',
      '2026': '1UZboUcb7IoZKcEWKYKMwy9o_v6JWNMFj',
    };

    // Buscar clientes da planilha
    const allClients = await getClients(session.accessToken as string, SPREADSHEET_ID);

    // =====================================================================
    // DISTRIBUIÇÃO POR ANO
    // Buscar itens de cada ano em paralelo
    // =====================================================================
    const debugErrors: Record<string, string> = {};

    const yearResults = await Promise.all(
      Object.entries(YEAR_FOLDERS).map(async ([year, folderId]) => {
        const result = await countItemsInFolder(session.accessToken as string, folderId);
        if (result.error) {
          debugErrors[year] = result.error;
        }
        return {
          year,
          count: result.items.length,
          processos: result.items,
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
        yearFolders: Object.entries(YEAR_FOLDERS).map(([year, id]) => ({ year, folderId: id })),
        totalDistribuidos,
        errors: Object.keys(debugErrors).length > 0 ? debugErrors : undefined,
      }
    });

  } catch (error: unknown) {
    console.error('Metrics error:', error);
    const message = error instanceof Error ? error.message : 'Erro interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
