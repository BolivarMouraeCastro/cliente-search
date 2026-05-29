import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getClientHearings } from "@/lib/hearings";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.accessToken) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const clientName = searchParams.get("clientName");
    const processNumber = searchParams.get("processNumber");
    const entrada = searchParams.get("entrada");

    if (!clientName || clientName.trim() === "") {
      return NextResponse.json(
        { error: "clientName is required" },
        { status: 400 }
      );
    }

    let hearings = await getClientHearings(
      session.accessToken,
      clientName.trim(),
      processNumber || undefined
    );

    // Filter by entry date if provided (only hearings near/after client entry)
    if (entrada && (!processNumber || processNumber.trim() === '')) {
      const parts = entrada.trim().split('/');
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        let year = parseInt(parts[2], 10);
        if (year < 100) year += 2000;
        // 60 days before entry date as cutoff
        const cutoff = new Date(year, month, day);
        cutoff.setDate(cutoff.getDate() - 60);

        hearings = hearings.filter((h) => {
          if (!h.dataAudiencia) return true;
          const hParts = h.dataAudiencia.split('/');
          if (hParts.length !== 3) return true;
          const hDay = parseInt(hParts[0], 10);
          const hMonth = parseInt(hParts[1], 10) - 1;
          let hYear = parseInt(hParts[2], 10);
          if (hYear < 100) hYear += 2000;
          const hDate = new Date(hYear, hMonth, hDay);
          return hDate >= cutoff;
        });
      }
    }

    // Sort: future hearings first (closest date first), then past (most recent first)
    hearings.sort((a, b) => {
      if (a.isFuture && !b.isFuture) return -1;
      if (!a.isFuture && b.isFuture) return 1;
      return 0;
    });

    return NextResponse.json({
      hearings,
      total: hearings.length,
      futureCount: hearings.filter((h) => h.isFuture).length,
    });
  } catch (error) {
    console.error("API /api/hearings error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
