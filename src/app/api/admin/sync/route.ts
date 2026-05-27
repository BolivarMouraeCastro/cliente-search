import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getClients, updateClientStatus } from "@/lib/sheets";
import { getGmailService } from "@/lib/google-auth";
import { getDriveService } from "@/lib/google-auth";
import { detectCurrentPhase, isStatusAdvanced, SHEET_STATUSES } from "@/lib/phases";

export const dynamic = "force-dynamic";

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? "";

// Global sync state
let syncState = {
  running: false,
  total: 0,
  totalPending: 0,
  processed: 0,
  updated: 0,
  skipped: 0,
  errors: 0,
  currentClient: "",
  log: [] as string[],
  startedAt: "",
  finishedAt: "",
  batchNumber: 0,
  remainingAfterBatch: 0,
};

function isAlreadyClassified(status: string): boolean {
  const upper = status.toUpperCase().trim();
  return SHEET_STATUSES.some((s) => upper.includes(s) || s.includes(upper));
}

/**
 * Fetch ALL TRT emails at once (up to 500).
 * Returns a map: clientName -> emails[]
 */
async function fetchAllTRTEmails(accessToken: string): Promise<Map<string, Array<{ subject: string; snippet: string; body: string; from: string }>>> {
  const gmail = getGmailService(accessToken);
  const clientEmailsMap = new Map<string, Array<{ subject: string; snippet: string; body: string; from: string }>>();

  try {
    // Search for all TRT emails at once
    const queries = [
      'from:trt',
      'subject:TRT',
      'subject:"Atualizações de Informações Processuais"',
    ];

    const allMessageIds = new Set<string>();

    for (const q of queries) {
      try {
        let pageToken: string | undefined;
        let pages = 0;

        do {
          const listRes = await gmail.users.messages.list({
            userId: 'me',
            q,
            maxResults: 200,
            pageToken,
          });

          const messages = listRes.data.messages || [];
          for (const m of messages) {
            if (m.id) allMessageIds.add(m.id);
          }

          pageToken = listRes.data.nextPageToken || undefined;
          pages++;
        } while (pageToken && pages < 5); // Max 5 pages per query = 1000 messages
      } catch {
        // If one query fails, continue with others
      }
    }

    console.log(`[SYNC] Found ${allMessageIds.size} TRT email IDs total`);

    // Fetch each email's details (in batches of 20)
    const messageIds = Array.from(allMessageIds);

    for (let i = 0; i < messageIds.length; i += 20) {
      const batch = messageIds.slice(i, i + 20);

      const emailPromises = batch.map(async (msgId) => {
        try {
          const msgRes = await gmail.users.messages.get({
            userId: 'me',
            id: msgId,
            format: 'metadata',
            metadataHeaders: ['Subject', 'From'],
          });

          const headers = msgRes.data.payload?.headers || [];
          const subject = headers.find((h) => h.name === 'Subject')?.value || '';
          const from = headers.find((h) => h.name === 'From')?.value || '';
          const snippet = msgRes.data.snippet || '';

          return { id: msgId, subject, from, snippet, body: '' };
        } catch {
          return null;
        }
      });

      const results = await Promise.all(emailPromises);

      for (const email of results) {
        if (!email) continue;

        // Extract client name from subject/snippet
        // TRT emails usually contain the process number but we need to match by name
        // We'll store ALL emails and match later
        const key = `${email.subject}|||${email.snippet}`;
        if (!clientEmailsMap.has(key)) {
          clientEmailsMap.set(key, []);
        }
        clientEmailsMap.get(key)!.push(email);
      }

      // Small delay between batches
      if (i + 20 < messageIds.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  } catch (err) {
    console.error('[SYNC] Error fetching TRT emails:', err);
  }

  return clientEmailsMap;
}

/**
 * Fetch ALL RECIBO files from Drive at once.
 * Returns a Set of folder names (client names) that have RECIBO.
 */
async function fetchAllReciboClients(accessToken: string): Promise<Set<string>> {
  const drive = getDriveService(accessToken);
  const clientsWithRecibo = new Set<string>();

  try {
    let pageToken: string | undefined;
    let pages = 0;

    do {
      const res = await drive.files.list({
        q: "name contains 'RECIBO' and trashed = false",
        fields: 'files(id, name, parents), nextPageToken',
        pageSize: 500,
        pageToken,
      });

      const files = res.data.files || [];

      // For each RECIBO file, get its parent folder name
      for (const file of files) {
        if (file.parents && file.parents.length > 0) {
          try {
            const parentRes = await drive.files.get({
              fileId: file.parents[0],
              fields: 'name',
            });
            if (parentRes.data.name) {
              clientsWithRecibo.add(parentRes.data.name.toUpperCase().trim());
            }
          } catch {
            // Skip if can't get parent
          }
        }
      }

      pageToken = res.data.nextPageToken || undefined;
      pages++;
    } while (pageToken && pages < 5);

    console.log(`[SYNC] Found ${clientsWithRecibo.size} clients with RECIBO files`);
  } catch (err) {
    console.error('[SYNC] Error fetching RECIBO files:', err);
  }

  return clientsWithRecibo;
}

/**
 * POST /api/admin/sync — Smart bulk sync using batch API calls.
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.accessToken) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in." },
        { status: 401 }
      );
    }

    if (syncState.running) {
      return NextResponse.json(
        { error: "Sync already in progress", progress: syncState },
        { status: 409 }
      );
    }

    // Reset state
    syncState = {
      running: true,
      total: 0,
      totalPending: 0,
      processed: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      currentClient: "",
      log: [],
      startedAt: new Date().toISOString(),
      finishedAt: "",
      batchNumber: (syncState.batchNumber || 0) + 1,
      remainingAfterBatch: 0,
    };

    const accessToken = session.accessToken;

    // Start async processing
    (async () => {
      try {
        // Step 1: Get all clients from spreadsheet
        syncState.log.push("📋 Carregando clientes da planilha...");
        const allClients = await getClients(accessToken, SPREADSHEET_ID);
        syncState.total = allClients.length;

        const pendingClients = allClients.filter((c) => !isAlreadyClassified(c.status));
        syncState.totalPending = pendingClients.length;
        syncState.log.push(`📊 ${allClients.length} clientes total, ${pendingClients.length} pendentes de classificação`);

        if (pendingClients.length === 0) {
          syncState.log.push("🎉 Todos os clientes já estão classificados!");
          syncState.running = false;
          syncState.finishedAt = new Date().toISOString();
          return;
        }

        // Step 2: Fetch all RECIBO files from Drive (single search)
        syncState.log.push("📁 Buscando arquivos RECIBO no Drive...");
        syncState.currentClient = "Buscando RECIBOs no Drive...";
        const clientsWithRecibo = await fetchAllReciboClients(accessToken);
        syncState.log.push(`📁 Encontrados ${clientsWithRecibo.size} clientes com RECIBO`);

        // Step 3: Update clients that have RECIBO
        syncState.log.push("🔄 Atualizando clientes com RECIBO...");
        let reciboUpdated = 0;

        for (const client of pendingClients) {
          syncState.processed++;
          syncState.currentClient = client.nome;

          const nameUpper = client.nome.toUpperCase().trim();
          
          // Check if client has RECIBO (match by name)
          const hasRecibo = clientsWithRecibo.has(nameUpper) || 
            Array.from(clientsWithRecibo).some((folder) => 
              folder.includes(nameUpper) || nameUpper.includes(folder)
            );

          if (hasRecibo) {
            try {
              await updateClientStatus(
                accessToken,
                SPREADSHEET_ID,
                client.id,
                "DISTRIBUÍDO"
              );
              syncState.updated++;
              reciboUpdated++;
              syncState.log.push(`✅ ${client.nome}: "${client.status}" → DISTRIBUÍDO (RECIBO encontrado)`);
            } catch {
              syncState.errors++;
              syncState.log.push(`❌ ${client.nome}: Erro ao atualizar`);
            }
            // Small delay for Sheets API
            await new Promise((r) => setTimeout(r, 300));
          } else {
            syncState.skipped++;
          }
        }

        syncState.log.push(`\n📊 Resumo: ${reciboUpdated} atualizados via RECIBO, ${syncState.skipped} sem RECIBO encontrado`);

      } catch (err) {
        syncState.errors++;
        syncState.log.push(`❌ Erro geral: ${err instanceof Error ? err.message : "Erro desconhecido"}`);
      }

      syncState.running = false;
      syncState.finishedAt = new Date().toISOString();
      syncState.currentClient = "";
      syncState.log.push(
        `\n🏁 Sincronização concluída! ${syncState.updated} atualizados, ${syncState.skipped} sem mudança, ${syncState.errors} erros.`
      );
    })();

    return NextResponse.json({
      message: "Sync started",
      total: syncState.total,
    });
  } catch (error) {
    syncState.running = false;
    console.error("Bulk sync error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/admin/sync — Check sync progress.
 */
export async function GET() {
  return NextResponse.json(syncState);
}
