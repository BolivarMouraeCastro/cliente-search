import { getSheetsService } from "@/lib/google-auth";

// ---------------------------------------------------------------------------
// Planilha de Audiências (SOMENTE LEITURA)
// ---------------------------------------------------------------------------
// Colunas: A=Data, B=Horário, C=Reclamante, D=Reclamada, E=Nº Processo,
//          F=Órgão Julgador, G=Tipo, H=Advogado
// ---------------------------------------------------------------------------

const HEARINGS_SPREADSHEET_ID =
  process.env.HEARINGS_SPREADSHEET_ID ?? "1eXJz8UCQImJIqaEHe8V8cwuuJ0YkABviUzz7wOQdFVA";

export interface Hearing {
  dataAudiencia: string;
  horario: string;
  reclamante: string;
  reclamada: string;
  numeroProcesso: string;
  orgaoJulgador: string;
  tipoAudiencia: string;
  advogado: string;
  /** Whether the hearing is in the future */
  isFuture: boolean;
}

// ---------------------------------------------------------------------------
// In-memory cache (120-second TTL — read-only, can cache longer)
// ---------------------------------------------------------------------------
interface HearingsCacheEntry {
  data: Hearing[];
  timestamp: number;
}

const CACHE_TTL_MS = 120_000;
let hearingsCache: HearingsCacheEntry | null = null;

/**
 * Format a date value to DD/MM/YYYY (same logic as sheets.ts).
 */
function formatDateValue(value: string): string {
  if (!value || value.trim() === "") return "";
  const trimmed = value.trim();

  // Google Sheets serial number
  if (/^\d{4,5}$/.test(trimmed)) {
    const serial = parseInt(trimmed, 10);
    const epoch = new Date(1899, 11, 30);
    const date = new Date(epoch.getTime() + serial * 86400000);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  // ISO format
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(trimmed)) {
    const parts = trimmed.split(/[-T]/);
    const day = String(parseInt(parts[2], 10)).padStart(2, "0");
    const month = String(parseInt(parts[1], 10)).padStart(2, "0");
    return `${day}/${month}/${parts[0]}`;
  }

  // US format M/D/YYYY → DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const parts = trimmed.split("/");
    const first = parseInt(parts[0], 10);
    const second = parseInt(parts[1], 10);
    if (first > 12) return trimmed; // already DD/MM/YYYY
    if (second > 12) {
      return `${String(second).padStart(2, "0")}/${String(first).padStart(2, "0")}/${parts[2]}`;
    }
    return trimmed; // ambiguous, assume BR
  }

  return trimmed;
}

/**
 * Parse a DD/MM/YYYY date string into a Date object.
 */
function parseDateBR(dateStr: string): Date | null {
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  let year = parseInt(parts[2], 10);
  if (year < 100) year += 2000;
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  return new Date(year, month, day, 23, 59, 59);
}

function rowToHearing(row: string[]): Hearing {
  const dataStr = formatDateValue(row[0] ?? "");
  const parsed = parseDateBR(dataStr);
  const isFuture = parsed ? parsed > new Date() : false;

  return {
    dataAudiencia: dataStr,
    horario: (row[1] ?? "").trim(),
    reclamante: (row[2] ?? "").trim(),
    reclamada: (row[3] ?? "").trim(),
    numeroProcesso: (row[4] ?? "").trim(),
    orgaoJulgador: (row[5] ?? "").trim(),
    tipoAudiencia: (row[6] ?? "").trim(),
    advogado: (row[7] ?? "").trim(),
    isFuture,
  };
}

/**
 * Fetch ALL hearings from the hearings spreadsheet (READ-ONLY).
 */
async function getAllHearings(accessToken: string): Promise<Hearing[]> {
  // Check cache
  if (hearingsCache && Date.now() - hearingsCache.timestamp < CACHE_TTL_MS) {
    return hearingsCache.data;
  }

  try {
    const sheets = getSheetsService(accessToken);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: HEARINGS_SPREADSHEET_ID,
      range: "A:H",
      valueRenderOption: "FORMATTED_VALUE",
      dateTimeRenderOption: "FORMATTED_STRING",
    });

    const rows = response.data.values;
    if (!rows || rows.length <= 1) return [];

    // Skip header row
    const hearings = rows
      .slice(1)
      .map((row) => rowToHearing(row))
      .filter((h) => h.reclamante.trim() !== "");

    // Cache
    hearingsCache = { data: hearings, timestamp: Date.now() };

    return hearings;
  } catch (error) {
    console.error("Error fetching hearings spreadsheet:", error);
    return [];
  }
}

/**
 * Normalize a name for comparison (remove accents, lowercase, trim).
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find hearings for a specific client by name and/or process number.
 * Matches by:
 * 1. Exact process number (if available)
 * 2. Client name (fuzzy — name contains or is contained)
 */
export async function getClientHearings(
  accessToken: string,
  clientName: string,
  processNumber?: string
): Promise<Hearing[]> {
  const allHearings = await getAllHearings(accessToken);

  const normalizedClientName = normalizeName(clientName);

  // If we have a process number, filter ONLY by it to avoid mixing
  // audiências from different processes of the same client
  if (processNumber && processNumber.trim() !== '') {
    return allHearings.filter((h) => {
      if (!h.numeroProcesso) return false;
      return (
        h.numeroProcesso.includes(processNumber) ||
        processNumber.includes(h.numeroProcesso)
      );
    });
  }

  // No process number — fall back to name matching
  return allHearings.filter((h) => {
    const normalizedHearingName = normalizeName(h.reclamante);
    if (normalizedHearingName && normalizedClientName) {
      return (
        normalizedHearingName === normalizedClientName ||
        normalizedHearingName.includes(normalizedClientName) ||
        normalizedClientName.includes(normalizedHearingName)
      );
    }
    return false;
  });
}
