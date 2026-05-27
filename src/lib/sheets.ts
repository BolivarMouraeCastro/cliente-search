import { getSheetsService } from "@/lib/google-auth";
import { Client } from "@/types";
import Fuse from "fuse.js";

// ---------------------------------------------------------------------------
// In-memory cache (60-second TTL)
// ---------------------------------------------------------------------------
interface CacheEntry {
  data: Client[];
  timestamp: number;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

function getCachedClients(key: string): Client[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedClients(key: string, data: Client[]): void {
  cache.set(key, { data, timestamp: Date.now() });
}

// ---------------------------------------------------------------------------
// Column mapping  A=ENTRADA … J=FUNÇÃO
// ---------------------------------------------------------------------------

/**
 * Format a date value from Google Sheets to DD/MM/YYYY.
 * Handles: serial numbers (45170), ISO dates (2023-09-01),
 * US format (9/1/2023 or 09/01/2023), and already-correct BR format.
 */
function formatDate(value: string): string {
  if (!value || value.trim() === "") return "";

  const trimmed = value.trim();

  // Check if it's a Google Sheets serial number (pure number)
  if (/^\d{4,5}$/.test(trimmed)) {
    const serial = parseInt(trimmed, 10);
    // Google Sheets epoch is December 30, 1899
    const epoch = new Date(1899, 11, 30);
    const date = new Date(epoch.getTime() + serial * 86400000);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  // Check if it's ISO format: YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(trimmed)) {
    const parts = trimmed.split(/[-T]/);
    const day = String(parseInt(parts[2], 10)).padStart(2, "0");
    const month = String(parseInt(parts[1], 10)).padStart(2, "0");
    const year = parts[0];
    return `${day}/${month}/${year}`;
  }

  // Check if it's US format: M/D/YYYY or MM/DD/YYYY (month first)
  // Google Sheets API often returns dates in the spreadsheet's locale format
  // We detect US format when the first number is <= 12 and second > 12
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const parts = trimmed.split("/");
    const first = parseInt(parts[0], 10);
    const second = parseInt(parts[1], 10);

    // If first value > 12, it's already DD/MM/YYYY (BR format)
    if (first > 12) {
      return trimmed;
    }

    // If second value > 12, first must be month (US format) -> convert
    if (second > 12) {
      const day = String(second).padStart(2, "0");
      const month = String(first).padStart(2, "0");
      return `${day}/${month}/${parts[2]}`;
    }

    // Both <= 12, ambiguous. Assume it's already DD/MM/YYYY since the
    // spreadsheet is Brazilian
    return trimmed;
  }

  // Already formatted or unknown format, return as-is
  return trimmed;
}

function rowToClient(row: string[], index: number): Client {
  return {
    id: String(index),
    entrada: formatDate(row[0] ?? ""),
    nome: row[1] ?? "",
    admissao: formatDate(row[2] ?? ""),
    demissao: formatDate(row[3] ?? ""),
    status: row[4] ?? "",
    materia: row[5] ?? "",
    origem: row[6] ?? "",
    responsavel: row[7] ?? "",
    empresa: row[8] ?? "",
    funcao: row[9] ?? "",
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch all clients from the first sheet of the given spreadsheet.
 * Results are cached for 60 seconds keyed by spreadsheetId.
 */
export async function getClients(
  accessToken: string,
  spreadsheetId: string
): Promise<Client[]> {
  const cacheKey = `clients:${spreadsheetId}`;
  const cached = getCachedClients(cacheKey);
  if (cached) return cached;

  try {
    const sheets = getSheetsService(accessToken);

    // Read all values from the first sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "A:J",
      valueRenderOption: "FORMATTED_VALUE",
      dateTimeRenderOption: "FORMATTED_STRING",
    });

    const rows = response.data.values;
    if (!rows || rows.length <= 1) {
      // No data (or only header row)
      return [];
    }


    // Skip the header row (index 0). Row index 2 = spreadsheet row 2, etc.
    const clients: Client[] = rows
      .slice(1)
      .map((row, i) => rowToClient(row, i + 2))
      .filter((c) => c.nome.trim() !== "");

    setCachedClients(cacheKey, clients);
    return clients;
  } catch (error) {
    console.error("Error fetching clients from Sheets:", error);
    throw new Error("Failed to fetch clients from Google Sheets");
  }
}

/**
 * Fuzzy-search clients by query. Searches across nome, empresa, materia,
 * and status fields using Fuse.js.
 */
export async function searchClients(
  accessToken: string,
  spreadsheetId: string,
  query: string
): Promise<Client[]> {
  const allClients = await getClients(accessToken, spreadsheetId);

  if (!query || query.trim() === "") {
    return allClients;
  }

  const fuse = new Fuse(allClients, {
    keys: ["nome", "empresa", "materia", "status"],
    threshold: 0.35,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });

  const results = fuse.search(query.trim());
  return results.map((r) => r.item);
}

/**
 * Get a specific client by their row-index id.
 */
export async function getClientById(
  accessToken: string,
  spreadsheetId: string,
  id: string
): Promise<Client | null> {
  const allClients = await getClients(accessToken, spreadsheetId);
  return allClients.find((c) => c.id === id) ?? null;
}

/**
 * Update the STATUS column (E) for a specific client row.
 * Also invalidates the cache so the next read reflects the change.
 */
export async function updateClientStatus(
  accessToken: string,
  spreadsheetId: string,
  rowIndex: string,
  newStatus: string
): Promise<boolean> {
  try {
    const sheets = getSheetsService(accessToken);

    // STATUS is column E, rowIndex is the actual spreadsheet row number
    const range = `E${rowIndex}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      requestBody: {
        values: [[newStatus]],
      },
    });

    // Invalidate cache so next fetch reflects the update
    cache.delete(`clients:${spreadsheetId}`);

    console.log(`Updated status for row ${rowIndex} to "${newStatus}"`);
    return true;
  } catch (error) {
    console.error("Error updating client status:", error);
    return false;
  }
}

/**
 * Update multiple fields for a specific client row.
 * Supports: empresa (column I), funcao (column J).
 */
export async function updateClientFields(
  accessToken: string,
  spreadsheetId: string,
  rowIndex: string,
  fields: { empresa?: string; funcao?: string }
): Promise<boolean> {
  try {
    const sheets = getSheetsService(accessToken);
    const requests: Promise<unknown>[] = [];

    if (fields.empresa !== undefined) {
      requests.push(
        sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `I${rowIndex}`,
          valueInputOption: "RAW",
          requestBody: { values: [[fields.empresa]] },
        })
      );
    }

    if (fields.funcao !== undefined) {
      requests.push(
        sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `J${rowIndex}`,
          valueInputOption: "RAW",
          requestBody: { values: [[fields.funcao]] },
        })
      );
    }

    await Promise.all(requests);

    // Invalidate cache
    cache.delete(`clients:${spreadsheetId}`);

    console.log(`Updated fields for row ${rowIndex}: empresa=${fields.empresa}, funcao=${fields.funcao}`);
    return true;
  } catch (error) {
    console.error("Error updating client fields:", error);
    return false;
  }
}

/**
 * Append a new client row to the end of the spreadsheet.
 * Columns: A=Entrada, B=Nome, C=Admissão, D=Demissão, E=Status, F=Matéria, G=Origem, H=Responsável, I=Empresa, J=Função
 */
export async function appendClientRow(
  accessToken: string,
  spreadsheetId: string,
  data: { nome: string; status?: string; empresa?: string; funcao?: string }
): Promise<boolean> {
  try {
    const sheets = getSheetsService(accessToken);

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "A:J",
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [[
          "", // A - Entrada
          data.nome, // B - Nome
          "", // C - Admissão
          "", // D - Demissão
          data.status || "", // E - Status
          "", // F - Matéria
          "", // G - Origem
          "", // H - Responsável
          data.empresa || "", // I - Empresa
          data.funcao || "", // J - Função
        ]],
      },
    });

    // Invalidate cache
    cache.delete(`clients:${spreadsheetId}`);

    console.log(`Appended new row: ${data.nome}, status=${data.status}`);
    return true;
  } catch (error) {
    console.error("Error appending client row:", error);
    return false;
  }
}
