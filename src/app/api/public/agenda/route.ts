import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const HEARINGS_SPREADSHEET_ID =
  process.env.HEARINGS_SPREADSHEET_ID ?? '1eXJz8UCQImJIqaEHe8V8cwuuJ0YkABviUzz7wOQdFVA';

interface Hearing {
  dataAudiencia: string;
  horario: string;
  reclamante: string;
  reclamada: string;
  numeroProcesso: string;
  orgaoJulgador: string;
  tipoAudiencia: string;
  advogado: string;
  isFuture: boolean;
}

function formatDateValue(value: string): string {
  if (!value || value.trim() === '') return '';
  const trimmed = value.trim();
  if (/^\d{4,5}$/.test(trimmed)) {
    const serial = parseInt(trimmed, 10);
    const epoch = new Date(1899, 11, 30);
    const date = new Date(epoch.getTime() + serial * 86400000);
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  }
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(trimmed)) {
    const parts = trimmed.split(/[-T]/);
    return `${String(parseInt(parts[2], 10)).padStart(2, '0')}/${String(parseInt(parts[1], 10)).padStart(2, '0')}/${parts[0]}`;
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const parts = trimmed.split('/');
    const first = parseInt(parts[0], 10);
    const second = parseInt(parts[1], 10);
    if (first > 12) return trimmed;
    if (second > 12) return `${String(second).padStart(2, '0')}/${String(first).padStart(2, '0')}/${parts[2]}`;
    return trimmed;
  }
  return trimmed;
}

function parseDateBR(dateStr: string): Date | null {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  let year = parseInt(parts[2], 10);
  if (year < 100) year += 2000;
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  return new Date(year, month, day, 23, 59, 59);
}

function rowToHearing(row: string[]): Hearing {
  const dataStr = formatDateValue(row[0] ?? '');
  const parsed = parseDateBR(dataStr);
  const isFuture = parsed ? parsed > new Date() : false;
  return {
    dataAudiencia: dataStr,
    horario: (row[1] ?? '').trim(),
    reclamante: (row[2] ?? '').trim(),
    reclamada: (row[3] ?? '').trim(),
    numeroProcesso: (row[4] ?? '').trim(),
    orgaoJulgador: (row[5] ?? '').trim(),
    tipoAudiencia: (row[6] ?? '').trim(),
    advogado: (row[7] ?? '').trim(),
    isFuture,
  };
}

/**
 * Fetch hearings from a PUBLIC Google Sheet using the gviz JSON endpoint.
 * No OAuth token needed — the spreadsheet must be shared as "Anyone with the link".
 */
async function fetchPublicSheetData(): Promise<string[][]> {
  // Use the Google Visualization API (works for public sheets without auth)
  const url = `https://docs.google.com/spreadsheets/d/${HEARINGS_SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=AUDIÊNCIA`;
  
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    // Try without sheet name (default first sheet)
    const url2 = `https://docs.google.com/spreadsheets/d/${HEARINGS_SPREADSHEET_ID}/gviz/tq?tqx=out:csv`;
    const res2 = await fetch(url2, { cache: 'no-store' });
    if (!res2.ok) {
      throw new Error(`Failed to fetch public sheet: ${res2.status} ${res2.statusText}`);
    }
    const csv = await res2.text();
    return parseCSV(csv);
  }
  
  const csv = await res.text();
  return parseCSV(csv);
}

/**
 * Simple CSV parser that handles quoted fields
 */
function parseCSV(csv: string): string[][] {
  const rows: string[][] = [];
  const lines = csv.split('\n');
  
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    rows.push(cells);
  }
  
  return rows;
}

/**
 * Fallback: try using the admin token via googleapis
 */
async function fetchWithAdminToken(): Promise<string[][]> {
  const { getAdminAccessToken } = await import('@/lib/admin-token');
  const { getSheetsService } = await import('@/lib/google-auth');
  
  const token = await getAdminAccessToken();
  const sheets = getSheetsService(token);
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: HEARINGS_SPREADSHEET_ID,
    range: 'A:H',
    valueRenderOption: 'FORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  });
  
  return (response.data.values || []) as string[][];
}

/**
 * GET /api/public/agenda — Public endpoint for hearings (no auth required).
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const advogadoFilter = searchParams.get('advogado')?.trim().toUpperCase() || '';

    // Try public CSV export first, then admin token as fallback
    let rows: string[][] = [];
    try {
      rows = await fetchPublicSheetData();
    } catch (csvError) {
      console.warn('Public CSV fetch failed, trying admin token:', csvError);
      try {
        rows = await fetchWithAdminToken();
      } catch (tokenError) {
        console.error('Admin token also failed:', tokenError);
        throw new Error(`Ambos métodos falharam. CSV: ${csvError instanceof Error ? csvError.message : String(csvError)}. Token: ${tokenError instanceof Error ? tokenError.message : String(tokenError)}`);
      }
    }

    if (rows.length <= 1) {
      return NextResponse.json({ hearings: [], advogados: [], total: 0 });
    }

    let hearings = rows
      .slice(1)
      .map((row) => rowToHearing(row))
      .filter((h) => h.reclamante.trim() !== '');

    const advogados = [...new Set(hearings.map((h) => h.advogado).filter(Boolean))].sort();

    if (advogadoFilter) {
      hearings = hearings.filter((h) => h.advogado.toUpperCase().includes(advogadoFilter));
    }

    hearings.sort((a, b) => {
      const dateA = parseDateForSort(a.dataAudiencia);
      const dateB = parseDateForSort(b.dataAudiencia);
      if (dateA !== dateB) return dateA - dateB;
      return (a.horario || '').localeCompare(b.horario || '');
    });

    return NextResponse.json({ hearings, advogados, total: hearings.length });
  } catch (err) {
    console.error('Public agenda error:', err);
    return NextResponse.json(
      { error: `Erro: ${err instanceof Error ? err.message : String(err)}`, hearings: [], advogados: [], total: 0 },
      { status: 500 }
    );
  }
}

function parseDateForSort(dateStr: string): number {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return 0;
  return parseInt(parts[2], 10) * 10000 + parseInt(parts[1], 10) * 100 + parseInt(parts[0], 10);
}
