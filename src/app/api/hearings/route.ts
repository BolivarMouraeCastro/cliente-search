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

    if (!clientName || clientName.trim() === "") {
      return NextResponse.json(
        { error: "clientName is required" },
        { status: 400 }
      );
    }

    const hearings = await getClientHearings(
      session.accessToken,
      clientName.trim(),
      processNumber || undefined
    );

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
