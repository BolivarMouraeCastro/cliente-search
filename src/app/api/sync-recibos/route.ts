import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getClients, writeProcessNumber, updateClientStatus, searchClients } from "@/lib/sheets";
// @ts-ignore
import pdf from "pdf-parse";

export const dynamic = "force-dynamic";
// Aumenta o timeout para 60 segundos (máximo Vercel Pro)
export const maxDuration = 60;

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? "";

// IDs das pastas de "Distribuídos" onde os recibos ficam
// Inclui TODAS as subpastas: #avisar audiencia, #SO MANDAR EMAIL, não jogar, etc.
const DISTRIBUIDOS_PARENT_IDS = [
  '16HzOQdcORS4vwPaaVDSEh7nZEVOOMhkE',
  '1DfJ7CZIHw4kEfGM7ooVdW1nH-YeEgvEx',
  '1yyO-0H6-DJc6p4mx_ez3JhRJTRb-HoYD',
  '1ByXb7PttqXCrlkINlDSN23SRkG5lw4Mv',
  '1204Yh3nKmJY80xY4jG5imJSjMoBcjn2q'
];

/**
 * Busca recursiva de TODOS os IDs de subpastas dentro das pastas de Distribuídos.
 * Isso garante que subpastas como "#avisar audiencia", "#SO MANDAR EMAIL",
 * "não jogar" sejam incluídas na busca.
 */
async function getAllSubfolderIds(accessToken: string, parentIds: string[]): Promise<string[]> {
  const allIds = [...parentIds];
  const queue = [...parentIds];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    try {
      const q = `'${currentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      const params = new URLSearchParams({
        q,
        fields: 'files(id, name)',
        pageSize: '1000',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true'
      });

      const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (res.ok) {
        const data = await res.json();
        for (const folder of (data.files || [])) {
          allIds.push(folder.id);
          queue.push(folder.id); // Busca recursiva nas subpastas
        }
      }
    } catch (e) {
      // Ignora erros de subpastas individuais
    }
  }

  return allIds;
}

/**
 * Busca TODOS os PDFs com "RECIBO" no nome dentro de uma lista de pastas,
 * com paginação completa (sem perder arquivos).
 */
async function fetchAllRecibos(accessToken: string, folderIds: string[], yearFilter: string): Promise<any[]> {
  let allFiles: any[] = [];

  for (const folderId of folderIds) {
    let pageToken: string | undefined = undefined;
    do {
      const q = `'${folderId}' in parents and name contains 'RECIBO' and mimeType = 'application/pdf' and trashed = false and createdTime >= '${yearFilter}-01-01T00:00:00'`;
      const params = new URLSearchParams({
        q,
        fields: 'nextPageToken, files(id, name, parents, createdTime)',
        pageSize: '1000',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true'
      });
      if (pageToken) params.append('pageToken', pageToken);

      try {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (res.ok) {
          const data = await res.json();
          if (data.files) allFiles = allFiles.concat(data.files);
          pageToken = data.nextPageToken;
        } else {
          pageToken = undefined;
        }
      } catch (e) {
        pageToken = undefined;
      }
    } while (pageToken);
  }

  // Remove duplicatas por ID
  const seen = new Set<string>();
  return allFiles.filter(f => {
    if (seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Não autorizado. Faça login primeiro no sistema." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const isTest = searchParams.get("test") === "true";
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 20;
    const offsetParam = searchParams.get("offset");
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;
    const year = searchParams.get("year") || "2026";

    // ETAPA 1: Descobrir TODAS as subpastas recursivamente (inclui #avisar audiencia, não jogar, etc.)
    const allFolderIds = await getAllSubfolderIds(session.accessToken, DISTRIBUIDOS_PARENT_IDS);

    // ETAPA 2: Buscar TODOS os recibos de 2026 em TODAS as pastas e subpastas
    const allRecibos = await fetchAllRecibos(session.accessToken, allFolderIds, year);

    // ETAPA 3: Aplicar offset e limit para processar em lotes
    const batch = allRecibos.slice(offset, offset + limit);

    // ETAPA 4: Carregar todos os clientes da planilha uma única vez
    const allClients = await getClients(session.accessToken, SPREADSHEET_ID);

    const logs = [];
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const file of batch) {
      const logEntry: any = { fileId: file.id, fileName: file.name };

      try {
        // Obter nome da pasta pai (nome do cliente no Drive)
        let parentName = "Desconhecido";
        if (file.parents && file.parents.length > 0) {
          const parentId = file.parents[0];
          const parentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${parentId}?fields=name&supportsAllDrives=true`, {
            headers: { Authorization: `Bearer ${session.accessToken}` }
          });
          if (parentRes.ok) {
            const parentData = await parentRes.json();
            parentName = parentData.name || parentName;
          }
        }
        logEntry.parentFolder = parentName;

        // Baixar o PDF
        const fileContentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`, {
          headers: { Authorization: `Bearer ${session.accessToken}` }
        });

        if (!fileContentRes.ok) {
          logEntry.status = "Erro";
          logEntry.message = "Falha ao baixar PDF.";
          logs.push(logEntry);
          errors++;
          continue;
        }

        const arrayBuffer = await fileContentRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Extrair texto do PDF
        const pdfData = await pdf(buffer);
        const text = pdfData.text || "";

        // Regex CNJ
        const cnjRegex = /\d{7}-\d{2}\.\d{4}\.\d{1}\.\d{2}\.\d{4}/;
        const match = text.match(cnjRegex);

        if (!match) {
          logEntry.status = "Ignorado";
          logEntry.message = "Nenhum CNJ encontrado no PDF.";
          logs.push(logEntry);
          skipped++;
          continue;
        }

        const cnj = match[0];
        logEntry.extractedCNJ = cnj;

        // Match com a planilha pelo nome da pasta pai
        const matchedClients = await searchClients(session.accessToken, SPREADSHEET_ID, parentName);

        if (matchedClients.length === 0) {
          logEntry.status = "Sem Match";
          logEntry.message = `CNJ ${cnj} extraído, mas pasta "${parentName}" não bate com nenhum cliente.`;
          logs.push(logEntry);
          skipped++;
          continue;
        }

        const client = matchedClients[0];
        logEntry.matchedClient = client.nome;
        logEntry.matchedRow = client.id;

        // Pular se já tem CNJ preenchido
        if (client.numeroProcesso && client.numeroProcesso.includes(cnj)) {
          logEntry.status = "Já Preenchido";
          logEntry.message = `Cliente ${client.nome} já tem CNJ ${cnj}.`;
          logs.push(logEntry);
          skipped++;
          continue;
        }

        // Atualizar planilha (ou simular em modo teste)
        if (isTest) {
          logEntry.status = "Teste OK";
          logEntry.message = `[DRY RUN] Linha ${client.id} → CNJ ${cnj}, Status → DISTRIBUÍDO`;
          updated++;
        } else {
          const okProcess = await writeProcessNumber(session.accessToken, SPREADSHEET_ID, client.id, cnj);
          const okStatus = await updateClientStatus(session.accessToken, SPREADSHEET_ID, client.id, "DISTRIBUÍDO");

          if (okProcess && okStatus) {
            logEntry.status = "Gravado ✅";
            logEntry.message = `Linha ${client.id}: CNJ ${cnj} salvo, status → DISTRIBUÍDO`;
            updated++;
          } else {
            logEntry.status = "Erro Gravação";
            logEntry.message = `Falha ao gravar na linha ${client.id}.`;
            errors++;
          }
        }

        logs.push(logEntry);
      } catch (err: any) {
        logEntry.status = "Erro Crítico";
        logEntry.message = err.message;
        logs.push(logEntry);
        errors++;
      }
    }

    // Calcular próximo lote
    const nextOffset = offset + limit;
    const hasMore = nextOffset < allRecibos.length;

    return NextResponse.json({
      summary: {
        isTestMode: isTest,
        year,
        totalRecibosFound: allRecibos.length,
        totalFoldersScanned: allFolderIds.length,
        batchProcessed: batch.length,
        offset,
        nextOffset: hasMore ? nextOffset : null,
        hasMoreBatches: hasMore,
        updated,
        skipped,
        errors,
        nextUrl: hasMore
          ? `/api/sync-recibos?year=${year}&offset=${nextOffset}&limit=${limit}${isTest ? '&test=true' : ''}`
          : null
      },
      logs
    });

  } catch (error: any) {
    console.error("Erro na rota /api/sync-recibos:", error);
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 });
  }
}
