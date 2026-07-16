import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getClients, writeProcessNumber, updateClientStatus, searchClients } from "@/lib/sheets";
// @ts-ignore
import pdf from "pdf-parse";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? "";

/**
 * Busca TODOS os PDFs com "RECIBO" no nome em TODO o Drive (incluindo Shared Drives),
 * criados no ano especificado, com paginação completa.
 * Isso garante que nenhuma subpasta seja ignorada, independente do nome:
 * "#AVISAR AUDIÊNCIA", "##AVISADO DA AUDIÊNCIA (OK)", "#SÓ MANDAR EMAIL",
 * "#SÓ PLANILHAR", "não jogar", etc.
 */
async function fetchAllRecibosGlobal(accessToken: string, year: string): Promise<any[]> {
  let allFiles: any[] = [];
  let pageToken: string | undefined = undefined;

  const q = `name contains 'RECIBO' and mimeType = 'application/pdf' and trashed = false and createdTime >= '${year}-01-01T00:00:00' and createdTime < '${parseInt(year) + 1}-01-01T00:00:00'`;

  do {
    const params = new URLSearchParams({
      q,
      fields: 'nextPageToken, files(id, name, parents, createdTime)',
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
        signal: AbortSignal.timeout(12000),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.files) allFiles = allFiles.concat(data.files);
        pageToken = data.nextPageToken;
      } else {
        console.error('Drive search failed:', await res.text());
        pageToken = undefined;
      }
    } catch (e) {
      console.error('Drive search error:', e);
      pageToken = undefined;
    }
  } while (pageToken);

  return allFiles;
}

/**
 * Sobe na hierarquia de pastas para encontrar o nome do cliente.
 * Tenta subir até 3 níveis para pegar o nome correto,
 * ignorando subpastas como "#AVISAR AUDIÊNCIA", "#SÓ MANDAR EMAIL", etc.
 */
async function getClientFolderName(accessToken: string, fileParentId: string): Promise<string> {
  const SUBFOLDERS_TO_SKIP = [
    '#avisar audiência', '#avisar audiencia',
    '##avisado da audiência (ok)', '##avisado da audiencia (ok)',
    '#só mandar email', '#so mandar email',
    '#só planilhar', '#so planilhar',
    'não jogar', 'nao jogar',
    'não mexer', 'nao mexer',
    'protocolo ok', 'nova pasta', 'new folder',
  ];

  let currentId = fileParentId;

  // Sobe até 3 níveis na hierarquia de pastas
  for (let level = 0; level < 3; level++) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${currentId}?fields=name,parents&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!res.ok) return "Desconhecido";

      const data = await res.json();
      const folderName = (data.name || "").trim();
      const lowerName = folderName.toLowerCase();

      // Se o nome da pasta NÃO é uma subpasta conhecida, é o nome do cliente
      const isSubfolder = SUBFOLDERS_TO_SKIP.some(skip => lowerName.includes(skip));

      if (!isSubfolder && folderName.length > 0) {
        return folderName;
      }

      // Se é uma subpasta, sobe mais um nível
      if (data.parents && data.parents.length > 0) {
        currentId = data.parents[0];
      } else {
        return folderName; // Não tem mais pai, retorna o que tem
      }
    } catch (e) {
      return "Desconhecido";
    }
  }

  return "Desconhecido";
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
    const limit = limitParam ? parseInt(limitParam, 10) : 15;
    const offsetParam = searchParams.get("offset");
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;
    const year = searchParams.get("year") || "2026";

    // ETAPA 1: Busca GLOBAL — todos os RECIBOs de 2026 em TODO o Drive
    const allRecibos = await fetchAllRecibosGlobal(session.accessToken, year);

    // ETAPA 2: Aplicar offset e limit para processar em lotes
    const batch = allRecibos.slice(offset, offset + limit);

    const logs = [];
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const file of batch) {
      const logEntry: any = { fileId: file.id, fileName: file.name };

      try {
        // Subir na hierarquia de pastas para encontrar o nome do cliente
        let clientFolderName = "Desconhecido";
        if (file.parents && file.parents.length > 0) {
          clientFolderName = await getClientFolderName(session.accessToken, file.parents[0]);
        }
        logEntry.parentFolder = clientFolderName;

        // Baixar o PDF
        const fileContentRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`,
          { headers: { Authorization: `Bearer ${session.accessToken}` } }
        );

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

        // Match com a planilha pelo nome da pasta do cliente
        const matchedClients = await searchClients(session.accessToken, SPREADSHEET_ID, clientFolderName);

        if (matchedClients.length === 0) {
          logEntry.status = "Sem Match";
          logEntry.message = `CNJ ${cnj} extraído, mas "${clientFolderName}" não bate com nenhum cliente.`;
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
          logEntry.message = `${client.nome} já tem CNJ ${cnj}.`;
          logs.push(logEntry);
          skipped++;
          continue;
        }

        // Atualizar planilha
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

    const nextOffset = offset + limit;
    const hasMore = nextOffset < allRecibos.length;

    return NextResponse.json({
      summary: {
        isTestMode: isTest,
        year,
        totalRecibosFound: allRecibos.length,
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
