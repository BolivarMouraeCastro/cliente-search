import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getClientFiles } from "@/lib/drive";
import { getClientById, updateClientStatus } from "@/lib/sheets";

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
    const clientId = searchParams.get("clientId");

    if (!clientName || clientName.trim() === "") {
      return NextResponse.json(
        { error: "Missing required parameter: clientName" },
        { status: 400 }
      );
    }

    const files = await getClientFiles(
      session.accessToken,
      clientName.trim()
    );

    // Auto-detect "RECIBO" file and update status to "DISTRIBUÍDO"
    let statusUpdated = false;
    if (clientId && files.length > 0) {
      const hasRecibo = files.some((file) =>
        file.name.toUpperCase().includes("RECIBO")
      );

      if (hasRecibo) {
        const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
        if (spreadsheetId) {
          // Check current status first
          const client = await getClientById(
            session.accessToken,
            spreadsheetId,
            clientId
          );

          if (
            client &&
            client.status.toUpperCase() !== "DISTRIBUÍDO" &&
            client.status.toUpperCase() !== "DISTRIBUIDO"
          ) {
            statusUpdated = await updateClientStatus(
              session.accessToken,
              spreadsheetId,
              clientId,
              "DISTRIBUÍDO"
            );

            if (statusUpdated) {
              console.log(
                `Auto-updated status to DISTRIBUÍDO for client: ${clientName} (row ${clientId})`
              );
            }
          }
        }
      }
    }

    return NextResponse.json({
      files,
      total: files.length,
      statusUpdated,
    });
  } catch (error) {
    console.error("API /api/files error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
