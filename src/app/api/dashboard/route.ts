import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getClients } from "@/lib/sheets";

export const dynamic = "force-dynamic";

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? "";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.accessToken) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in." },
        { status: 401 }
      );
    }

    const clients = await getClients(session.accessToken, SPREADSHEET_ID);

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

    // Sort by count (descending), use accented labels for display
    const statusDistribution = Object.entries(statusCounts)
      .map(([key, count]) => ({ status: canonicalLabels[key] || key, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      totalClients: clients.length,
      statusDistribution,
    });
  } catch (error) {
    console.error("API /api/dashboard error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
