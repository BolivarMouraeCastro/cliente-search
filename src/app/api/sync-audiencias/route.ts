import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getClients, writeProcessNumber, updateClientStatus } from "@/lib/sheets";
import { getAllHearings } from "@/lib/hearings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? "";

/**
 * Normaliza um nome para comparação (remove acentos, lowercase, espaços extras)
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Rota que cruza a planilha de AUDIÊNCIAS com a planilha de ENTRADA DE PROCESSO.
 * 
 * Para cada cliente na planilha de Entrada que NÃO tem nº de processo (Coluna K vazia):
 *   1. Busca na planilha de audiências por nome igual ou similar
 *   2. Se encontrar, pega o nº do processo (CNJ) da audiência
 *   3. Atualiza Coluna K (nº processo) e Coluna E (status → DISTRIBUÍDO)
 * 
 * Parâmetros:
 *   ?test=true  → modo de teste (não grava, só mostra o que faria)
 *   ?limit=20   → quantidade de clientes para processar por lote
 *   ?offset=0   → começar a partir de qual cliente
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const isTest = searchParams.get("test") === "true";
    const limit = parseInt(searchParams.get("limit") || "30", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // =====================================================================
    // 1. Buscar dados em paralelo
    // =====================================================================
    const [allClients, allHearings] = await Promise.all([
      getClients(session.accessToken, SPREADSHEET_ID),
      getAllHearings(session.accessToken),
    ]);

    // =====================================================================
    // 2. Criar mapa de audiências: nome normalizado → nº processo
    //    Se um cliente tem múltiplas audiências, pega a mais recente
    // =====================================================================
    const hearingMap = new Map<string, { cnj: string; reclamante: string }>();

    for (const h of allHearings) {
      const cnj = h.numeroProcesso.trim();
      if (!cnj) continue;

      const normalizedName = normalizeName(h.reclamante);
      if (!normalizedName) continue;

      // Só substitui se ainda não tiver
      if (!hearingMap.has(normalizedName)) {
        hearingMap.set(normalizedName, { cnj, reclamante: h.reclamante });
      }
    }

    // =====================================================================
    // 3. Filtrar clientes que NÃO têm nº de processo preenchido
    // =====================================================================
    const clientsSemProcesso = allClients.filter(c => {
      const num = (c.numeroProcesso || "").trim();
      return num === "";
    });

    // Aplicar offset e limit
    const batch = clientsSemProcesso.slice(offset, offset + limit);

    // =====================================================================
    // 4. Para cada cliente, tentar encontrar o CNJ na planilha de audiências
    // =====================================================================
    const logs: any[] = [];
    let updated = 0;
    let notFound = 0;
    let alreadyDistribuido = 0;
    let errors = 0;

    for (const client of batch) {
      const logEntry: any = {
        row: client.id,
        clientName: client.nome,
        currentStatus: client.status,
      };

      const normalizedClientName = normalizeName(client.nome);

      // Busca exata primeiro
      let match = hearingMap.get(normalizedClientName);

      // Se não encontrou exato, tenta busca parcial
      if (!match) {
        for (const [hearingName, hearingData] of hearingMap.entries()) {
          if (
            hearingName.includes(normalizedClientName) ||
            normalizedClientName.includes(hearingName)
          ) {
            match = hearingData;
            break;
          }
        }
      }

      if (!match) {
        logEntry.status = "Sem Match";
        logEntry.message = `Não encontrou "${client.nome}" na planilha de audiências.`;
        logs.push(logEntry);
        notFound++;
        continue;
      }

      logEntry.matchedHearing = match.reclamante;
      logEntry.cnj = match.cnj;

      // Verificar se já está como DISTRIBUÍDO
      const statusUpper = (client.status || "").toUpperCase();
      if (statusUpper.includes("DISTRIBU")) {
        logEntry.status = "Já Distribuído";
        logEntry.message = `Cliente já com status "${client.status}", mas sem nº processo. Vai preencher CNJ.`;
        alreadyDistribuido++;
      }

      if (isTest) {
        logEntry.status = logEntry.status || "Teste OK";
        logEntry.message = `[DRY RUN] Linha ${client.id} → CNJ: ${match.cnj}, Status → DISTRIBUÍDO`;
        logs.push(logEntry);
        updated++;
        continue;
      }

      // Gravar na planilha
      try {
        const okProcess = await writeProcessNumber(session.accessToken, SPREADSHEET_ID, client.id, match.cnj);
        const okStatus = await updateClientStatus(session.accessToken, SPREADSHEET_ID, client.id, "DISTRIBUÍDO");

        if (okProcess && okStatus) {
          logEntry.status = "Gravado ✅";
          logEntry.message = `Linha ${client.id}: CNJ ${match.cnj} salvo, status → DISTRIBUÍDO`;
          updated++;
        } else {
          logEntry.status = "Erro Gravação";
          logEntry.message = `Falha ao gravar na linha ${client.id}.`;
          errors++;
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Erro desconhecido";
        logEntry.status = "Erro";
        logEntry.message = msg;
        errors++;
      }

      logs.push(logEntry);
    }

    const nextOffset = offset + limit;
    const hasMore = nextOffset < clientsSemProcesso.length;

    return NextResponse.json({
      summary: {
        isTestMode: isTest,
        totalClientesSemProcesso: clientsSemProcesso.length,
        totalAudienciasComCNJ: hearingMap.size,
        batchProcessed: batch.length,
        offset,
        limit,
        updated,
        notFound,
        alreadyDistribuido,
        errors,
        hasMoreBatches: hasMore,
        nextUrl: hasMore
          ? `/api/sync-audiencias?offset=${nextOffset}&limit=${limit}${isTest ? "&test=true" : ""}`
          : null,
      },
      logs,
    });

  } catch (error: unknown) {
    console.error("Erro na rota /api/sync-audiencias:", error);
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
