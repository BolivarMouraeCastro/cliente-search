import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getClients, writeProcessNumber, updateClientStatus, searchClients } from "@/lib/sheets";
// @ts-ignore
import pdf from "pdf-parse";

// Evita que o Next.js faça cache agressivo desta rota
export const dynamic = "force-dynamic";

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? "";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    // Parse dos parâmetros da URL
    const { searchParams } = new URL(req.url);
    const isTest = searchParams.get("test") === "true"; // Modo Dry Run
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 5; // Padrão: 5 arquivos

    // Buscar os PDFs no Drive que contenham 'RECIBO' no nome
    const query = `name contains 'RECIBO' and mimeType = 'application/pdf' and trashed = false`;
    const driveParams = new URLSearchParams({
      q: query,
      fields: "files(id, name, parents)",
      pageSize: limit.toString(),
      orderBy: "createdTime desc",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true"
    });

    const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files?${driveParams}`, {
      headers: { Authorization: `Bearer ${session.accessToken}` }
    });

    if (!driveRes.ok) {
      const errorText = await driveRes.text();
      throw new Error(`Erro ao buscar no Drive: ${errorText}`);
    }

    const driveData = await driveRes.json();
    const files = driveData.files || [];

    const logs = [];

    // Loop em lotes (limitado a 'limit' iterações)
    for (const file of files) {
      const logEntry: any = {
        fileId: file.id,
        fileName: file.name,
      };

      try {
        // 1. Obter nome da pasta pai para tentar fazer match com o cliente na Planilha Mestra
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

        // 2. Baixar o conteúdo binário do PDF do Drive
        const fileContentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`, {
          headers: { Authorization: `Bearer ${session.accessToken}` }
        });

        if (!fileContentRes.ok) {
          logEntry.status = "Erro";
          logEntry.message = "Falha ao baixar o binário do arquivo PDF.";
          logs.push(logEntry);
          continue;
        }

        const arrayBuffer = await fileContentRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // 3. Extrair texto do PDF usando a biblioteca pdf-parse
        const pdfData = await pdf(buffer);
        const text = pdfData.text || "";

        // 4. Buscar número do processo via Expressão Regular (Regex CNJ)
        const cnjRegex = /\d{7}-\d{2}\.\d{4}\.\d{1}\.\d{2}\.\d{4}/;
        const match = text.match(cnjRegex);

        if (!match) {
          logEntry.status = "Ignorado";
          logEntry.message = "Nenhum número de processo (CNJ) encontrado no texto do PDF.";
          logs.push(logEntry);
          continue;
        }

        const cnjEncontrado = match[0];
        logEntry.extractedCNJ = cnjEncontrado;

        // 5. Encontrar o cliente na planilha que corresponda ao nome da pasta pai do PDF
        const matchedClients = await searchClients(session.accessToken, SPREADSHEET_ID, parentName);
        
        if (matchedClients.length === 0) {
          logEntry.status = "Atenção";
          logEntry.message = `CNJ ${cnjEncontrado} encontrado, mas não achamos um cliente correspondente à pasta "${parentName}" na planilha.`;
          logs.push(logEntry);
          continue;
        }

        // Pega o melhor match de cliente retornado pela busca fuzzy
        const client = matchedClients[0];
        logEntry.matchedClient = client.nome;
        logEntry.matchedRow = client.id;
        
        // Verifica se o cliente já possui esse número de processo salvo
        if (client.numeroProcesso && client.numeroProcesso.includes(cnjEncontrado)) {
          logEntry.status = "Ignorado";
          logEntry.message = `O cliente ${client.nome} (Linha ${client.id}) já possui o CNJ ${cnjEncontrado} preenchido.`;
          logs.push(logEntry);
          continue;
        }

        // 6. Atualizar a planilha (comportamento condicional com base na query `?test=true`)
        if (isTest) {
          logEntry.status = "Sucesso (Modo Teste)";
          logEntry.message = `[DRY RUN] Atualizaria a linha ${client.id} (Cliente: ${client.nome}) com o CNJ ${cnjEncontrado} e Status DISTRIBUÍDO.`;
        } else {
          // Efetivamente grava na planilha mestre
          const processUpdateSuccess = await writeProcessNumber(session.accessToken, SPREADSHEET_ID, client.id, cnjEncontrado);
          const statusUpdateSuccess = await updateClientStatus(session.accessToken, SPREADSHEET_ID, client.id, "DISTRIBUÍDO");
          
          if (processUpdateSuccess && statusUpdateSuccess) {
            logEntry.status = "Sucesso";
            logEntry.message = `[GRAVADO] CNJ ${cnjEncontrado} salvo e status alterado para DISTRIBUÍDO para o cliente ${client.nome} (Linha ${client.id}).`;
          } else {
            logEntry.status = "Erro";
            logEntry.message = `Falha ao gravar os dados na linha ${client.id} da planilha.`;
          }
        }

        logs.push(logEntry);

      } catch (err: any) {
        logEntry.status = "Erro Critico";
        logEntry.message = err.message;
        logs.push(logEntry);
      }
    }

    // Retorna um relatório super detalhado do que o robô fez neste lote
    return NextResponse.json({
      summary: {
        isTestMode: isTest,
        filesFetched: files.length,
        limitRequested: limit
      },
      logs
    });

  } catch (error: any) {
    console.error("Erro na rota /api/sync-recibos:", error);
    return NextResponse.json({ error: error.message || "Erro interno no servidor" }, { status: 500 });
  }
}
