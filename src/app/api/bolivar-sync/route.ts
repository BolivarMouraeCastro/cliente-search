// API: Sincronização BOLIVAR — compara Drive com Planilha

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getClients } from '@/lib/sheets';

const BOLIVAR_FOLDER_ID = '1rpodIJgyoKYpka37q1PaDsiT5krmyWAZ';
const INICIAIS_FOLDER_ID = '1AFf7qFK2cYNPDmOJuAqVFfiqK2pmMBuZ';
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? '';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
}

// Fetch children of a folder
async function listFolder(token: string, folderId: string): Promise<DriveFile[]> {
  const all: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, parents)',
      pageSize: '1000',
    });
    if (pageToken) params.set('pageToken', pageToken);
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return all;
      const data = await res.json();
      all.push(...(data.files || []));
      pageToken = data.nextPageToken;
    } catch { return all; }
  } while (pageToken);
  return all;
}

// Search for a file by name within a folder tree
async function searchFile(token: string, query: string): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    q: query,
    fields: 'files(id, name, mimeType, parents)',
    pageSize: '50',
  });
  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.files || [];
  } catch { return []; }
}

const isFolder = (f: DriveFile) => f.mimeType === 'application/vnd.google-apps.folder';

// Normalize name for comparison (remove accents, lowercase, trim)
function normalize(name: string): string {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SyncResult {
  // Clients that are in the Drive folder — keep as BOLIVAR
  kept: { nome: string; row: number }[];
  // Clients NOT in Drive, but have RECIBO → DISTRIBUÍDO
  distributed: { nome: string; row: number; reciboFile: string }[];
  // Clients NOT in Drive, found in lawyer folders → FAZER INICIAL
  withLawyer: { nome: string; row: number; lawyer: string }[];
  // Clients NOT in Drive, not found anywhere → WARNING
  unknown: { nome: string; row: number }[];
  // Drive folder names (for reference)
  driveFolders: string[];
  // Stats
  totalSpreadsheet: number;
  totalDrive: number;
}

export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const token = session.accessToken;

    // Step 1: Read BOLIVAR Drive folder
    const bolivarItems = await listFolder(token, BOLIVAR_FOLDER_ID);
    const bolivarFolders = bolivarItems.filter(isFolder);
    const bolivarNames = bolivarFolders.map(f => f.name);
    const bolivarNormalized = new Set(bolivarNames.map(normalize));

    // Step 2: Read spreadsheet — find all BOLIVAR status
    const clients = await getClients(token, SPREADSHEET_ID);
    const bolivarClients = clients.filter(c =>
      normalize(c.status) === 'bolivar'
    );

    // Step 3: Compare
    const kept: SyncResult['kept'] = [];
    const distributed: SyncResult['distributed'] = [];
    const withLawyer: SyncResult['withLawyer'] = [];
    const unknown: SyncResult['unknown'] = [];

    // Read lawyer folders (Iniciais) for cross-reference
    const lawyerFolders = (await listFolder(token, INICIAIS_FOLDER_ID)).filter(isFolder);
    
    // Build a set of all client names in lawyer folders (BFS 3 levels deep)
    const lawyerClientMap = new Map<string, string>(); // normalized name → lawyer name
    for (const lawyer of lawyerFolders) {
      const level2 = await listFolder(token, lawyer.id);
      for (const item of level2.filter(isFolder)) {
        // Level 3: items inside status/category folders
        const level3 = await listFolder(token, item.id);
        for (const client of level3.filter(isFolder)) {
          lawyerClientMap.set(normalize(client.name), lawyer.name);
          // Level 4: inside sub-categories
          const level4 = await listFolder(token, client.id);
          for (const sub of level4.filter(isFolder)) {
            lawyerClientMap.set(normalize(sub.name), lawyer.name);
          }
        }
      }
    }

    // Process each BOLIVAR client from spreadsheet
    for (const client of bolivarClients) {
      const clientNorm = normalize(client.nome);
      const row = parseInt(client.id, 10);

      // Check if still in BOLIVAR Drive folder
      let foundInDrive = false;
      for (const dName of bolivarNormalized) {
        if (dName.includes(clientNorm) || clientNorm.includes(dName)) {
          foundInDrive = true;
          break;
        }
      }

      if (foundInDrive) {
        kept.push({ nome: client.nome, row });
        continue;
      }

      // Not in Drive — search for RECIBO PDF
      const reciboResults = await searchFile(token,
        `name contains 'RECIBO' and mimeType = 'application/pdf' and fullText contains '${client.nome.split(' ')[0]}'`
      );
      
      if (reciboResults.length > 0) {
        distributed.push({ nome: client.nome, row, reciboFile: reciboResults[0].name });
        continue;
      }

      // Check lawyer folders
      let foundLawyer: string | null = null;
      for (const [lName, lawyer] of lawyerClientMap) {
        if (lName.includes(clientNorm) || clientNorm.includes(lName)) {
          foundLawyer = lawyer;
          break;
        }
      }

      if (foundLawyer) {
        withLawyer.push({ nome: client.nome, row, lawyer: foundLawyer });
        continue;
      }

      // Not found anywhere
      unknown.push({ nome: client.nome, row });
    }

    const result: SyncResult = {
      kept,
      distributed,
      withLawyer,
      unknown,
      driveFolders: bolivarNames,
      totalSpreadsheet: bolivarClients.length,
      totalDrive: bolivarFolders.length,
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error('Bolivar sync error:', err);
    return NextResponse.json(
      { error: `Erro: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

// POST: Apply changes to spreadsheet
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { updates } = body as { updates: { row: number; newStatus: string }[] };

    if (!updates || updates.length === 0) {
      return NextResponse.json({ error: 'Nenhuma atualização' }, { status: 400 });
    }

    // Update status column (E = column 5) for each row
    const batchData = updates.map(u => ({
      range: `E${u.row}`,
      values: [[u.newStatus]],
    }));

    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          valueInputOption: 'RAW',
          data: batchData,
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `Erro ao gravar: ${errText}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, updated: updates.length });
  } catch (err) {
    return NextResponse.json(
      { error: `Erro: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
