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

    const { searchParams } = new URL(req.url);
    const isTest = searchParams.get("test") === "true"; 
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 5; 

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

    for (const file of files) {
      const logEntry: any = { fileId: file.id, fileName: file.name };

      try {
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

        const fileContentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`, {
          headers: { Authorization: `Bearer ${session.accessToken}` }
        });

        if (!fileContentRes.ok) {
          logEntry.status = "Erro";
          logEntry.message = "Falha ao baixar o binário.";
          logs.push(logEntry);
          continue;
        }

        const arrayBuffer = await fileContentRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const pdfData = await pdf(buffer);
        const text = pdfData.text || "";

        const cnjRegex = /\d{7}-\d{2}\.\d{4}\.\d{1}\.\d{2}\.\d{4}/;
        const match = text.match(cnjRegex);

        if (!match) {
          logEntry.status = "Ignorado";
          logEntry.message = "Nenhum CNJ encontrado.";
          logs.push(logEntry);
          continue;
        }

        const cnjEncontrado = match[0];
        logEntry.extractedCNJ = cnjEncontrado;

        const matchedClients = await searchClients(session.accessToken, SPREADSHEET_ID, parentName);
        
        if (matchedClients.length === 0) {
          logEntry.status = "Atenção";
          logEntry.message = `CNJ encontrado, mas pasta "${parentName}" não bate com a planilha.`;
          logs.push(logEntry);
          continue;
        }

        const client = matchedClients[0];
        logEntry.matchedClient = client.nome;
        logEntry.matchedRow = client.id;
        
        if (client.numeroProcesso && client.numeroProcesso.includes(cnjEncontrado)) {
          logEntry.status = "Ignorado";
          logEntry.message = `Cliente já possui CNJ.`;
          logs.push(logEntry);
          continue;
        }

        if (isTest) {
          logEntry.status = "Sucesso (Teste)";
          logEntry.message = `Atualizaria linha ${client.id} com CNJ ${cnjEncontrado}.`;
        } else {
          const processUpdateSuccess = await writeProcessNumber(session.accessToken, SPREADSHEET_ID, client.id, cnjEncontrado);
          const statusUpdateSuccess = await updateClientStatus(session.accessToken, SPREADSHEET_ID, client.id, "DISTRIBUÍDO");
          
          if (processUpdateSuccess && statusUpdateSuccess) {
            logEntry.status = "Sucesso";
            logEntry.message = `CNJ salvo na linha ${client.id}.`;
          } else {
            logEntry.status = "Erro";
            logEntry.message = "Falha ao gravar na planilha.";
          }
        }
        logs.push(logEntry);
      } catch (err: any) {
        logEntry.status = "Erro Critico";
        logEntry.message = err.message;
        logs.push(logEntry);
      }
    }

    return NextResponse.json({ summary: { isTestMode: isTest, filesFetched: files.length, limitRequested: limit }, logs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 });
  }
}
