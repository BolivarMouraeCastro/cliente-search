import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getClients, searchClients, getClientById } from "@/lib/sheets";
import { getEffectiveAccessToken } from '@/lib/admin-token';

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const accessToken = await getEffectiveAccessToken(session?.user?.email, (session as any)?.accessToken);

    if (!accessToken) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in." },
        { status: 401 }
      );
    }

    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    if (!spreadsheetId) {
      console.error("GOOGLE_SPREADSHEET_ID environment variable is not set");
      return NextResponse.json(
        { error: "Server configuration error: spreadsheet ID missing" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const id = searchParams.get("id");

    // Get a specific client by ID
    if (id) {
      const client = await getClientById(accessToken, spreadsheetId, id);

      if (!client) {
        return NextResponse.json(
          { error: "Client not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({ client });
    }

    // Search clients by query
    if (search) {
      const clients = await searchClients(
        accessToken,
        spreadsheetId,
        search
      );

      return NextResponse.json({ clients, total: clients.length });
    }

    // Return all clients
    const clients = await getClients(accessToken, spreadsheetId);
    return NextResponse.json({ clients, total: clients.length });
  } catch (error) {
    console.error("API /api/clients error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
