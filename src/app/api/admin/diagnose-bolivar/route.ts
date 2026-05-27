import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getClients } from "@/lib/sheets";

export const dynamic = "force-dynamic";

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? "";

function normalize(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replace(/\s+/g, " ");
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const allClients = await getClients(session.accessToken, SPREADSHEET_ID);

    // All clients with BOLIVAR status
    const bolivarClients = allClients.filter(
      (c) => c.status.toUpperCase().trim() === "BOLIVAR"
    );

    // Check for duplicates (same normalized name appearing more than once)
    const nameCount = new Map<string, Array<{ id: string; nome: string; funcao: string; empresa: string }>>();

    for (const client of bolivarClients) {
      const key = normalize(client.nome);
      if (!nameCount.has(key)) {
        nameCount.set(key, []);
      }
      nameCount.get(key)!.push({
        id: client.id,
        nome: client.nome,
        funcao: client.funcao || "",
        empresa: client.empresa || "",
      });
    }

    const duplicates: Array<{ nome: string; rows: Array<{ id: string; nome: string; funcao: string; empresa: string }> }> = [];
    const unique: string[] = [];

    for (const [name, entries] of nameCount) {
      if (entries.length > 1) {
        duplicates.push({ nome: name, rows: entries });
      } else {
        unique.push(entries[0].nome);
      }
    }

    // Sort duplicates by count
    duplicates.sort((a, b) => b.rows.length - a.rows.length);

    return NextResponse.json({
      totalBolivar: bolivarClients.length,
      uniqueNames: nameCount.size,
      duplicateNames: duplicates.length,
      duplicateRows: bolivarClients.length - nameCount.size,
      duplicates: duplicates.slice(0, 100), // Show top 100
      allBolivarNames: bolivarClients.map((c) => ({
        row: c.id,
        nome: c.nome,
        funcao: c.funcao,
        empresa: c.empresa,
      })),
    });
  } catch (error) {
    console.error("Diagnostic error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 500 });
  }
}
