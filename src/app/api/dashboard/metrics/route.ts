import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getClients } from '@/lib/sheets';

export const dynamic = 'force-dynamic';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? '';

// Pasta "# RECIBO" no Drive - contém TODOS os recibos de distribuição
// Caminho: 1- PROCESSO > 1 INICIAIS > 1 INICIAIS PRONTAS > 01 DISTRIBUIDO > # RECIBO
// Se o ID mudar, atualizar aqui. A rota /api/find-folder pode ajudar a encontrar.
const RECIBO_FOLDER_ID = process.env.RECIBO_FOLDER_ID ?? '';

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
 * Busca TODOS os arquivos dentro da pasta # RECIBO, com paginação completa.
 */
async function fetchAllRecibosFromFolder(accessToken: string, folderId: string): Promise<any[]> {
  let allFiles: any[] = [];
  let pageToken: string | undefined = undefined;

  // Se não tiver folder ID, busca globalmente por "RECIBO"
  const q = folderId
    ? `'${folderId}' in parents and trashed = false`
    : `name contains 'RECIBO' and mimeType = 'application/pdf' and trashed = false`;

  do {
    const params = new URLSearchParams({
      q,
      fields: 'nextPageToken, files(id, name, createdTime)',
      pageSize: '1000',
      orderBy: 'createdTime desc',
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
        if (data.files) allFiles = allFiles.concat(data.files);
        pageToken = data.nextPageToken;
      } else {
        console.error('Drive fetch error:', await res.text());
        pageToken = undefined;
      }
    } catch (e) {
      console.error('Drive fetch exception:', e);
      pageToken = undefined;
    }
  } while (pageToken);

  return allFiles;
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
    // Buscar dados em paralelo
    // =====================================================================
    let reciboFolderId = RECIBO_FOLDER_ID;

    // Se não tiver o ID configurado, tenta encontrar a pasta automaticamente
    if (!reciboFolderId) {
      try {
        const q = `name = '# RECIBO' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
        const params = new URLSearchParams({
          q,
          fields: 'files(id, name)',
          supportsAllDrives: 'true',
          includeItemsFromAllDrives: 'true',
          corpora: 'allDrives',
        });
        const folderRes = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
          headers: { Authorization: `Bearer ${session.accessToken}` },
        });
        if (folderRes.ok) {
          const folderData = await folderRes.json();
          if (folderData.files && folderData.files.length > 0) {
            reciboFolderId = folderData.files[0].id;
          }
        }
      } catch (e) {
        console.error('Error finding # RECIBO folder:', e);
      }
    }

    const [allRecibos, allClients] = await Promise.all([
      fetchAllRecibosFromFolder(session.accessToken, reciboFolderId),
      getClients(session.accessToken, SPREADSHEET_ID),
    ]);

    // =====================================================================
    // DISTRIBUIÇÃO POR ANO
    // Cada arquivo na pasta # RECIBO = 1 distribuição
    // O ano é extraído da data de criação do arquivo no Drive (createdTime)
    // =====================================================================
    const yearMap = new Map<string, ProcessoItem[]>();

    for (const file of allRecibos) {
      const createdDate = new Date(file.createdTime);
      const year = createdDate.getFullYear().toString();

      if (!yearMap.has(year)) {
        yearMap.set(year, []);
      }

      yearMap.get(year)!.push({
        id: file.id,
        name: file.name || 'Recibo',
        createdTime: file.createdTime,
      });
    }

    // Ordenar por ano decrescente
    const distribuicaoPorAno: YearDistribution[] = Array.from(yearMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([year, processos]) => ({
        year,
        count: processos.length,
        processos,
      }));

    const totalDistribuidos = allRecibos.length;

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
        reciboFolderFound: !!reciboFolderId,
        reciboFolderId: reciboFolderId || 'não encontrado',
        totalFilesInFolder: allRecibos.length,
      }
    });

  } catch (error: unknown) {
    console.error('Metrics error:', error);
    const message = error instanceof Error ? error.message : 'Erro interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
