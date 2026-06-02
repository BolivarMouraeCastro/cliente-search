import { getSheetsService } from "@/lib/google-auth";

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? '';
const SHEET_NAME = "Lixeira Virtual";

// In-memory cache for fast filtering
let trashedCache: Set<string> | null = null;
let lastFetch = 0;

export async function ensureLixeiraSheet(accessToken: string) {
  const sheets = getSheetsService(accessToken);
  
  try {
    const info = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const exists = info.data.sheets?.some(s => s.properties?.title === SHEET_NAME);
    
    if (!exists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{
            addSheet: { properties: { title: SHEET_NAME } }
          }]
        }
      });
      // Add header
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A1:B1`,
        valueInputOption: 'RAW',
        requestBody: { values: [['Folder ID', 'Folder Name']] }
      });
    }
  } catch (error) {
    console.error("Failed to ensure Lixeira sheet:", error);
  }
}

export async function getLixeiraIds(accessToken: string): Promise<Set<string>> {
  if (trashedCache && Date.now() - lastFetch < 60000) {
    return trashedCache;
  }

  const sheets = getSheetsService(accessToken);
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:A`
    });
    
    const rows = res.data.values || [];
    const ids = rows.map(r => r[0]).filter(Boolean);
    trashedCache = new Set(ids);
    lastFetch = Date.now();
    return trashedCache;
  } catch (error) {
    // If sheet doesn't exist yet, just return empty
    return new Set();
  }
}

export async function addToLixeira(accessToken: string, folderId: string, folderName: string) {
  await ensureLixeiraSheet(accessToken);
  const sheets = getSheetsService(accessToken);
  
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A:B`,
    valueInputOption: 'RAW',
    requestBody: { values: [[folderId, folderName]] }
  });
  
  if (trashedCache) {
    trashedCache.add(folderId);
  }
}
