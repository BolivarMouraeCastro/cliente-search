// API: Sincronização FAZER INICIAL — compara pastas dos advogados com planilha

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getClients } from '@/lib/sheets';

const INICIAIS_FOLDER_ID = '1AFf7qFK2cYNPDmOJuAqVFfiqK2pmMBuZ';
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? '';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
}

const isFolder = (f: DriveFile) => f.mimeType === 'application/vnd.google-apps.folder';

async function listChildren(token: string, folderId: string): Promise<DriveFile[]> {
  const all: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, parents)',
      pageSize: '500',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
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

function normalize(name: string): string {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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

// Status-category keywords (these are dividers, not clients)
function isStatusFolder(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes('iniciais') || lower.includes('para fazer') ||
    lower.includes('correção') || lower.includes('correcao') ||
    lower.includes('refazer')
  );
}

const DIVIDER_KEYWORDS = [
  'processos antigos', 'clientes urgentes', 'clientes do escritório',
  'clientes do escritorio', 'clientes perguntando',
  'prescrições', 'prescricoes', 'prescriçoes',
  'iniciais para fazer', 'correção', 'correcao', 'refazer', 'r.i', 'ri',
];
function isDividerFolder(name: string): boolean {
  const trimmed = name.trim();
  if (/^\d+[.\-)\s]/.test(trimmed)) return true;
  const lower = trimmed.toLowerCase();
  return DIVIDER_KEYWORDS.some(kw => lower.includes(kw) || lower === kw);
}

export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }
    const token = session.accessToken;

    // Step 1: Get all lawyer folders
    const rootItems = await listChildren(token, INICIAIS_FOLDER_ID);
    const lawyerFolders = rootItems.filter(isFolder);

    // Step 2: For each lawyer, get status folders → client folders
    const allClients: { nome: string; lawyer: string }[] = [];

    for (const lawyer of lawyerFolders) {
      const lawyerChildren = await listChildren(token, lawyer.id);
      const statusFolders = lawyerChildren.filter(f => isFolder(f) && isStatusFolder(f.name));

      await Promise.all(statusFolders.map(async (sf) => {
        const sfChildren = await listChildren(token, sf.id);
        const clientFolders = sfChildren.filter(isFolder);

        await Promise.all(clientFolders.map(async (cf) => {
          if (isDividerFolder(cf.name)) {
            // It's a divider — real clients are inside
            const innerChildren = await listChildren(token, cf.id);
            for (const inner of innerChildren.filter(isFolder)) {
              allClients.push({ nome: inner.name, lawyer: lawyer.name });
            }
          } else {
            allClients.push({ nome: cf.name, lawyer: lawyer.name });
          }
        }));
      }));
    }

    // Step 3: Read spreadsheet
    const clients = await getClients(token, SPREADSHEET_ID);

    // Step 4: Find clients in Drive that currently do NOT have status "FAZER INICIAL"
    // These need to be updated
    const needsUpdate: { nome: string; lawyer: string; row: number; currentStatus: string }[] = [];
    const alreadyCorrect: { nome: string; row: number }[] = [];
    const notInSheet: { nome: string; lawyer: string }[] = [];

    for (const driveClient of allClients) {
      const match = clients.find(c => namesMatch(c.nome, driveClient.nome));
      if (match) {
        const row = parseInt(match.id, 10);
        const currentStatus = normalize(match.status);
        if (currentStatus === 'fazer inicial') {
          alreadyCorrect.push({ nome: match.nome, row });
        } else {
          needsUpdate.push({
            nome: match.nome,
            lawyer: driveClient.lawyer,
            row,
            currentStatus: match.status,
          });
        }
      } else {
        notInSheet.push({ nome: driveClient.nome, lawyer: driveClient.lawyer });
      }
    }

    return NextResponse.json({
      needsUpdate,
      alreadyCorrect,
      notInSheet,
      totalDrive: allClients.length,
      totalLawyers: lawyerFolders.map(l => l.name),
      sampleDrive: allClients.slice(0, 5).map(c => `${c.nome} (${c.lawyer})`),
    });
  } catch (err) {
    console.error('Iniciais sync error:', err);
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
    const { updates } = body as { updates: { row: number }[] };

    if (!updates || updates.length === 0) {
      return NextResponse.json({ error: 'Nenhuma atualização' }, { status: 400 });
    }

    const batchData = updates.map(u => ({
      range: `E${u.row}`,
      values: [['FAZER INICIAL']],
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
