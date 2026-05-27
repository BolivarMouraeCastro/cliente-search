import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getClientEmails, getRecentUpdates } from "@/lib/gmail";
import { getClientById, updateClientStatus } from "@/lib/sheets";
import { detectCurrentPhase, isStatusAdvanced } from "@/lib/phases";

export const dynamic = "force-dynamic";

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? "";

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

    // If no clientName provided, return recent tribunal updates
    if (!clientName || clientName.trim() === "") {
      const emails = await getRecentUpdates(session.accessToken);
      return NextResponse.json({ emails, total: emails.length });
    }

    // Search for emails related to the specific client
    const emails = await getClientEmails(
      session.accessToken,
      clientName.trim()
    );

    // Auto-update status based on detected phase
    let statusUpdated = false;
    let newStatus: string | null = null;

    if (clientId && SPREADSHEET_ID && emails.length > 0) {
      // Use the shared phase classification to detect the most advanced phase
      const detectedStatus = detectCurrentPhase(emails);

      if (detectedStatus) {
        // Check the client's current status
        const client = await getClientById(
          session.accessToken,
          SPREADSHEET_ID,
          clientId
        );

        if (client) {
          const currentStatus = client.status.toUpperCase().trim();

          // Only update if the detected phase is more advanced
          // or if the current status doesn't match any known phase
          if (isStatusAdvanced(currentStatus, detectedStatus) || !currentStatus) {
            const updated = await updateClientStatus(
              session.accessToken,
              SPREADSHEET_ID,
              clientId,
              detectedStatus
            );

            if (updated) {
              statusUpdated = true;
              newStatus = detectedStatus;
              console.log(
                `Auto-updated status to "${detectedStatus}" for client: ${clientName} (row ${clientId})`
              );
            }
          }
        }
      }
    }

    return NextResponse.json({
      emails,
      total: emails.length,
      statusUpdated,
      newStatus,
    });
  } catch (error) {
    console.error("API /api/emails error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
