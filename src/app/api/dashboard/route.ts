import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getClients } from "@/lib/sheets";

export const dynamic = "force-dynamic";

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? "";

// Pasta do Bolivar no Drive (bolivarmouraecastro@gmail.com)
// Cada subpasta = 1 processo do Bolivar
const BOLIVAR_FOLDER_ID = "10qkRpTzO4hwiR_QIFt_KlCT1Rw7KRKJh";

/**
 * Conta TODAS as subpastas diretas dentro de uma pasta do Drive (com paginação).
 * Retorna apenas a contagem total.
 */
async function countSubfoldersInFolder(
  accessToken: string,
  folderId: string
): Promise<number> {
  let total = 0;
  let pageToken: string | undefined = undefined;

  const q = `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

  do {
    const params = new URLSearchParams({
      q,
      fields: "nextPageToken, files(id)",
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      corpora: "allDrives",
    });
    if (pageToken) params.append("pageToken", pageToken);

    try {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?${params}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(30000),
        }
      );

      if (res.ok) {
        const data = await res.json();
        if (data.files) total += data.files.length;
        pageToken = data.nextPageToken;
      } else {
        console.error("Drive fetch error (Bolivar folder):", await res.text());
        pageToken = undefined;
      }
    } catch (e) {
      console.error("Drive fetch exception (Bolivar folder):", e);
      pageToken = undefined;
    }
  } while (pageToken);

  return total;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.accessToken) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in." },
        { status: 401 }
      );
    }

    // Buscar dados em paralelo: planilha + pasta Bolivar no Drive
    const [clients, bolivarDriveCount] = await Promise.all([
      getClients(session.accessToken, SPREADSHEET_ID),
      countSubfoldersInFolder(session.accessToken as string, BOLIVAR_FOLDER_ID),
    ]);

    // Normalize: remove accents so DISTRIBUIDO = DISTRIBUÍDO, etc.
    function normalize(str: string): string {
      return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
    }

    // Display label: keep the accented version as the canonical label
    const canonicalLabels: Record<string, string> = {};

    // Count ALL unique statuses from the spreadsheet (real data)
    const statusCounts: Record<string, number> = {};

    for (const client of clients) {
      const raw = (client.status || "").toUpperCase().trim();
      if (!raw) {
        statusCounts["SEM STATUS"] = (statusCounts["SEM STATUS"] || 0) + 1;
        canonicalLabels["SEM STATUS"] = "SEM STATUS";
      } else {
        const key = normalize(raw);
        statusCounts[key] = (statusCounts[key] || 0) + 1;
        // Prefer the accented version as display label
        if (!canonicalLabels[key] || raw.includes("Í") || raw.includes("Ã") || raw.includes("Ç") || raw.includes("É")) {
          canonicalLabels[key] = raw;
        }
      }
    }

    // Substituir a contagem do BOLIVAR pela contagem real da pasta do Drive
    const bolivarKey = "BOLIVAR";
    if (bolivarDriveCount > 0) {
      statusCounts[bolivarKey] = bolivarDriveCount;
      canonicalLabels[bolivarKey] = "BOLIVAR";
    }

    // Sort by count (descending), use accented labels for display
    const statusDistribution = Object.entries(statusCounts)
      .map(([key, count]) => ({ status: canonicalLabels[key] || key, count }))
      .sort((a, b) => b.count - a.count);

    // Recalcular total considerando a contagem real do Bolivar
    const totalClients = statusDistribution.reduce((sum, s) => sum + s.count, 0);

    return NextResponse.json({
      totalClients,
      statusDistribution,
    });
  } catch (error) {
    console.error("API /api/dashboard error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
