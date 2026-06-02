// API: Sincronização BOLIVAR — compara Drive com Planilha (optimized)

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getClients } from '@/lib/sheets';

const BOLIVAR_FOLDER_ID = '10qkRpTzO4hwiR_QIFt_KlCT1Rw7KRKJh';
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? '';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

let driveDebug = '';

async function listFolder(token: string, folderId: string): Promise<DriveFile[]> {
  const all: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and not name contains '[MOVIDO]' and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType)',
      pageSize: '1000',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        const errText = await res.text();
        driveDebug = `Drive API ${res.status}: ${errText}`;
        console.error('Drive error:', driveDebug);
        return all;
      }
      const data = await res.json();
      all.push(...(data.files || []));
      pageToken = data.nextPageToken;
    } catch (e) {
      driveDebug = `Fetch error: ${e instanceof Error ? e.message : String(e)}`;
      return all;
    }
  } while (pageToken);
  return all;
}

const isFolder = (f: DriveFile) => f.mimeType === 'application/vnd.google-apps.folder';

function normalize(name: string): string {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Check if two names match (fuzzy: one contains the other or first+last name match)
function namesMatch(sheetName: string, driveName: string): boolean {
  const a = normalize(sheetName);
  const b = normalize(driveName);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const partsA = a.split(' ');
  const partsB = b.split(' ');
  if (partsA.length >= 2 && partsB.length >= 2) {
    if (partsA[0] === partsB[0] && partsA[partsA.length - 1] === partsB[partsB.length - 1]) {
      return true;
    }
  }
  return false;
}

export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const token = session.accessToken;
    driveDebug = '';

    // Step 0: Verify folder is accessible
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${BOLIVAR_FOLDER_ID}?fields=id,name,mimeType&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) }
    );
    if (!metaRes.ok) {
      const errText = await metaRes.text();
      return NextResponse.json({
        kept: [], missing: [], extraInDrive: [], driveFolders: [],
        totalSpreadsheet: 0, totalDrive: 0,
        debug: `Não foi possível acessar a pasta (${metaRes.status}): ${errText}. ID: ${BOLIVAR_FOLDER_ID}`,
      });
    }
    const folderMeta = await metaRes.json();

    // Step 1: Read BOLIVAR Drive folder
    const bolivarItems = await listFolder(token, BOLIVAR_FOLDER_ID);
    const bolivarFolders = bolivarItems.filter(isFolder);
    const bolivarFiles = bolivarItems.filter(f => !isFolder(f));

    // Also check inside sub-folders (2 levels deep)
    // Check inside sub-folders (2 levels deep) using concurrent batches to prevent Vercel timeouts
    const allClientFolders: DriveFile[] = [];
    const subFolderNames: string[] = [];
    
    const BATCH_SIZE = 15;
    for (let i = 0; i < bolivarFolders.length; i += BATCH_SIZE) {
      const batch = bolivarFolders.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (folder) => {
        const children = await listFolder(token, folder.id);
        const childFolders = children.filter(isFolder);
        
        if (childFolders.length > 0) {
          subFolderNames.push(folder.name);
          allClientFolders.push(...childFolders);
        } else {
          allClientFolders.push(folder);
        }
      }));
    }

    // Combine: direct client folders + nested ones
    // If no sub-folders found, use direct list
    const clientFolders = allClientFolders.length > 0 ? allClientFolders : bolivarFolders;

    // If empty, return debug info
    if (clientFolders.length === 0) {
      return NextResponse.json({
        kept: [], missing: [], extraInDrive: [], driveFolders: [],
        totalSpreadsheet: 0, totalDrive: 0,
        debug: driveDebug || `Pasta "${folderMeta.name}" acessada. ${bolivarItems.length} itens (${bolivarFolders.length} pastas, ${bolivarFiles.length} arquivos). Nenhum processo encontrado.`,
      });
    }

    // Step 2: Read spreadsheet
    const clients = await getClients(token, SPREADSHEET_ID);
    const bolivarClients = clients.filter(c => normalize(c.status) === 'bolivar');

    // Step 3: Compare
    const kept: { nome: string; row: number }[] = [];
    const missing: { nome: string; row: number }[] = [];

    for (const client of bolivarClients) {
      const row = parseInt(client.id, 10);
      const found = clientFolders.some(f => namesMatch(client.nome, f.name));
      if (found) {
        kept.push({ nome: client.nome, row });
      } else {
        missing.push({ nome: client.nome, row });
      }
    }

    const extraInDrive: string[] = [];
    for (const folder of clientFolders) {
      const found = bolivarClients.some(c => namesMatch(c.nome, folder.name));
      if (!found) {
        extraInDrive.push(folder.name);
      }
    }

    // Sample names for debugging
    const sampleDrive = clientFolders.slice(0, 10).map(f => f.name);
    const sampleSheet = bolivarClients.slice(0, 10).map(c => c.nome);

    return NextResponse.json({
      kept,
      missing,
      extraInDrive,
      driveFolders: clientFolders.map(f => f.name),
      totalSpreadsheet: bolivarClients.length,
      totalDrive: clientFolders.length,
      totalItems: bolivarItems.length,
      subFolders: subFolderNames,
      sampleDrive,
      sampleSheet,
      debug: driveDebug || `Pasta "${folderMeta.name}": ${bolivarItems.length} itens diretos, ${bolivarFolders.length} sub-pastas, ${clientFolders.length} pastas de clientes encontradas`,
    });
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
