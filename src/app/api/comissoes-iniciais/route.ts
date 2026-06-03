import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getClients } from '@/lib/sheets';

const INICIAIS_ROOT_FOLDER_ID = '1AFf7qFK2cYNPDmOJuAqVFfiqK2pmMBuZ';
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? '';
const SHEET_NAME = 'COMISSOES_INICIAIS';
const ADVOGADOS_INICIAIS = ['ELITON', 'ALESSANDRA', 'JESSÉ', 'JAMILLE'];

interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
}

const isFolder = (item: DriveItem) => item.mimeType === 'application/vnd.google-apps.folder';

async function listChildren(token: string, folderId: string, fields = 'id, name, mimeType'): Promise<DriveItem[]> {
  const all: DriveItem[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: `nextPageToken, files(${fields})`,
      pageSize: '500',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) break;
    const data = await res.json();
    all.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return all;
}

function extractCliente(folderName: string): string {
  // Clean folder name: remove "(não mexer)", "Liberar Eliton", dates like "28-09-2027", etc.
  let clean = folderName
    .replace(/\(não mexer\)/gi, '')
    .replace(/\(nao mexer\)/gi, '')
    .replace(/^liberar\s+\w+\s+/i, '')
    .replace(/\s*-\s*\d{2}[.-]\d{2}[.-]\d{4}\s*/g, '') // remove dates like 28-09-2027
    .replace(/\.(docx?|pdf|odt|rtf)$/i, '')
    .trim();
  // Remove " X EMPRESA" part if present (we'll get empresa from spreadsheet)
  const xMatch = clean.match(/^(.+?)\s+[xX]\s+.+$/);
  if (xMatch) clean = xMatch[1].trim();
  return clean;
}

function normalize(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function findEmpresaInSheet(clienteName: string, allClients: { nome: string; empresa: string }[]): string {
  const normCliente = normalize(clienteName);
  if (!normCliente) return '';
  
  // Try exact match first
  for (const c of allClients) {
    if (normalize(c.nome) === normCliente) return c.empresa;
  }
  // Try partial match (first + last name)
  const parts = normCliente.split(' ');
  if (parts.length >= 2) {
    const first = parts[0];
    const last = parts[parts.length - 1];
    for (const c of allClients) {
      const cn = normalize(c.nome);
      if (cn.startsWith(first) && cn.endsWith(last)) return c.empresa;
    }
  }
  return '';
}

// ========== SHEETS HELPERS ==========

async function ensureSheet(token: string): Promise<boolean> {
  // Check if sheet tab exists
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return false;
  const data = await res.json();
  const exists = data.sheets?.some((s: any) => s.properties?.title === SHEET_NAME);

  if (!exists) {
    // Create the sheet tab
    const createRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{ addSheet: { properties: { title: SHEET_NAME } } }]
        }),
      }
    );
    if (!createRes.ok) return false;

    // Add header row
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!A1:F1?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          values: [['ADVOGADO', 'CLIENTE', 'EMPRESA', 'DATA', 'FOLDER_ID', 'MES_ANO']]
        }),
      }
    );
  }
  return true;
}

async function getSheetData(token: string): Promise<string[][]> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!A:F`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.values || [];
}

async function appendRows(token: string, rows: string[][]): Promise<void> {
  if (rows.length === 0) return;
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!A:F:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: rows }),
    }
  );
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const token = session.accessToken;
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const mesAnoAtual = `${String(currentMonth + 1).padStart(2, '0')}/${currentYear}`;
    const dataHoje = `${String(now.getDate()).padStart(2, '0')}/${String(currentMonth + 1).padStart(2, '0')}/${currentYear}`;

    // Ensure sheet exists
    await ensureSheet(token);

    // Get existing records from sheet
    const sheetData = await getSheetData(token);
    const existingFolderIds = new Set(sheetData.slice(1).map(row => row[4] || ''));

    // Load spreadsheet clients for empresa lookup
    const allClients = await getClients(token, SPREADSHEET_ID);
    const clientLookup = allClients.map(c => ({ nome: c.nome, empresa: c.empresa }));

    // Scan CORREÇÃO folders for NEW items and register them
    const newRows: string[][] = [];

    await Promise.all(ADVOGADOS_INICIAIS.map(async (advNome) => {
      // Find lawyer folder
      const rootChildren = await listChildren(token, INICIAIS_ROOT_FOLDER_ID);
      const advFolder = rootChildren.find(c => isFolder(c) && c.name.toUpperCase().includes(advNome));
      if (!advFolder) return;

      // Find CORREÇÃO
      const advChildren = await listChildren(token, advFolder.id);
      const correcaoFolder = advChildren.find(c => {
        if (!isFolder(c)) return false;
        const n = c.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        return n.includes('CORRECAO') || n.includes('CORRE');
      });
      if (!correcaoFolder) return;

      // List items in CORREÇÃO
      const items = await listChildren(token, correcaoFolder.id, 'id, name, mimeType, modifiedTime');
      const processFolders = items.filter(isFolder);
      const processItems = processFolders.length > 0 ? processFolders : items;

      for (const item of processItems) {
        // Skip if already registered
        if (existingFolderIds.has(item.id)) continue;

        const cliente = extractCliente(item.name);
        const empresa = findEmpresaInSheet(cliente, clientLookup);
        newRows.push([advNome, cliente, empresa, dataHoje, item.id, mesAnoAtual]);
        existingFolderIds.add(item.id);
      }
    }));

    // Append new records to sheet
    if (newRows.length > 0) {
      await appendRows(token, newRows);
    }

    // Re-read sheet for accurate counts (including just-added rows)
    const finalData = newRows.length > 0 ? await getSheetData(token) : sheetData;
    const rows = finalData.slice(1); // skip header

    // Build response per lawyer
    const advogados = ADVOGADOS_INICIAIS.map(advNome => {
      const advRows = rows.filter(r => (r[0] || '').toUpperCase() === advNome);
      const mesRows = advRows.filter(r => (r[5] || '') === mesAnoAtual);

      return {
        nome: advNome,
        total: advRows.length,
        mesAtual: mesRows.length,
        clientes: advRows
          .map(r => ({ cliente: r[1] || '', empresa: r[2] || '', data: r[3] || '' }))
          .reverse(), // most recent first
      };
    });

    const mesNomes = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    return NextResponse.json({
      advogados,
      mesAtual: mesNomes[currentMonth],
      totalGeral: advogados.reduce((s, a) => s + a.total, 0),
      totalMes: advogados.reduce((s, a) => s + a.mesAtual, 0),
    });

  } catch (err) {
    console.error('Iniciais comissoes error:', err);
    return NextResponse.json(
      { error: `Erro: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
