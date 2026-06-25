import { getSheetsService } from "@/lib/google-auth";

// ---------------------------------------------------------------------------
// Planilha de Perícias (aba "PERICIA" da mesma planilha de audiências)
// ---------------------------------------------------------------------------

const SPREADSHEET_ID =
  process.env.HEARINGS_SPREADSHEET_ID ?? "1eXJz8UCQImJIqaEHe8V8cwuuJ0YkABviUzz7wOQdFVA";

export interface PericiaSheet {
  data: string;
  horario: string;
  reclamante: string;
  reclamada: string;
  processo: string;
  tipo: string;
  perito: string;
  local: string;
  advogado: string;
  observacao: string;
  isFuture: boolean;
}

// ---------------------------------------------------------------------------
// In-memory cache (120-second TTL)
// ---------------------------------------------------------------------------
interface PericiasCacheEntry {
  data: PericiaSheet[];
  timestamp: number;
}

const CACHE_TTL_MS = 120_000;
let periciasCache: PericiasCacheEntry | null = null;

/**
 * Format a date value to DD/MM/YYYY.
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

/**
 * Map a row from the PERICIA sheet to a PericiaSheet object.
 * Column mapping will be auto-detected from header row.
 */
function rowToPericia(row: string[], columnMap: Record<string, number>): PericiaSheet {
  const get = (key: string) => (columnMap[key] !== undefined ? (row[columnMap[key]] ?? "").trim() : "");
  
  const dataStr = formatDateValue(get("data"));
  const parsed = parseDateBR(dataStr);
  const isFuture = parsed ? parsed > new Date() : false;

  return {
    data: dataStr,
    horario: get("horario"),
    reclamante: get("reclamante"),
    reclamada: get("reclamada"),
    processo: get("processo"),
    tipo: get("tipo"),
    perito: get("perito"),
    local: get("local"),
    advogado: get("advogado"),
    observacao: get("observacao"),
    isFuture,
  };
}

/**
 * Auto-detect column mapping from header row.
 * Matches common variations of column names.
 */
function detectColumns(headerRow: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  
  const matchers: [string, RegExp][] = [
    ["data", /data|dia|dt/i],
    ["horario", /hor[áa]rio|hora|hr/i],
    ["reclamante", /reclamante|autor|nome|periciand/i],
    ["reclamada", /reclamad[oa]|empresa|r[ée]u/i],
    ["processo", /processo|n[ºo°]?\s*proc|autos/i],
    ["tipo", /tipo|natureza|modalidade|objeto/i],
    ["perito", /perito|expert/i],
    ["local", /local|endere[çc]o|lugar/i],
    ["advogado", /advogado|respons[áa]vel|adv/i],
    ["observacao", /observa[çc][ãa]o|obs|nota|status|situa[çc]/i],
  ];

  for (let i = 0; i < headerRow.length; i++) {
    const header = (headerRow[i] || "").trim();
    if (!header) continue;
    
    for (const [key, regex] of matchers) {
      if (map[key] === undefined && regex.test(header)) {
        map[key] = i;
        break;
      }
    }
  }

  return map;
}

/**
 * Fetch ALL perícias from the PERICIA tab of the spreadsheet.
 */
export async function getAllPericiasFromSheet(accessToken: string): Promise<{
  pericias: PericiaSheet[];
  headers: string[];
  columnMap: Record<string, number>;
}> {
  // Check cache
  if (periciasCache && Date.now() - periciasCache.timestamp < CACHE_TTL_MS) {
    return { pericias: periciasCache.data, headers: [], columnMap: {} };
  }

  try {
    const sheets = getSheetsService(accessToken);

    // Try different possible sheet names
    const sheetNames = ["PERICIA", "PERICIAS", "Pericias", "Perícia", "Perícias", "pericia"];
    let rows: string[][] | undefined;
    let usedName = "";

    for (const name of sheetNames) {
      try {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `${name}!A:Z`,
          valueRenderOption: "FORMATTED_VALUE",
          dateTimeRenderOption: "FORMATTED_STRING",
        });
        rows = response.data.values as string[][] | undefined;
        usedName = name;
        break;
      } catch {
        // Try next name
      }
    }

    if (!rows || rows.length <= 1) {
      return { pericias: [], headers: [], columnMap: {} };
    }

    // Detect columns from header
    const headerRow = rows[0];
    const columnMap = detectColumns(headerRow);

    // If no columns detected, fall back to positional mapping
    if (Object.keys(columnMap).length === 0) {
      // Assume: A=Data, B=Horário, C=Reclamante, D=Reclamada, E=Processo, F=Tipo, G=Perito, H=Local
      const defaultMap: Record<string, number> = {
        data: 0, horario: 1, reclamante: 2, reclamada: 3,
        processo: 4, tipo: 5, perito: 6, local: 7, advogado: 8, observacao: 9,
      };
      Object.assign(columnMap, defaultMap);
    }

    const pericias = rows
      .slice(1)
      .map((row) => rowToPericia(row, columnMap))
      .filter((p) => p.data.trim() !== "" || p.reclamante.trim() !== "");

    // Cache
    periciasCache = { data: pericias, timestamp: Date.now() };

    console.log(`[Pericias Sheet] Loaded ${pericias.length} rows from "${usedName}" tab. Columns: ${JSON.stringify(columnMap)}`);

    return { pericias, headers: headerRow, columnMap };
  } catch (error) {
    console.error("Error fetching pericias spreadsheet:", error);
    return { pericias: [], headers: [], columnMap: {} };
  }
}
