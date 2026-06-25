import { getSheetsService } from '@/lib/google-auth';

const HEARINGS_SPREADSHEET_ID =
  process.env.HEARINGS_SPREADSHEET_ID ??
  '1eXJz8UCQImJIqaEHe8V8cwuuJ0YkABviUzz7wOQdFVA';

export interface HearingInput {
  data: string;
  horario: string;
  reclamante: string;
  reclamada: string;
  processo: string;
  vara: string;
  tipo: string;
  advogado: string;
  modalidade: 'online' | 'presencial' | 'julgamento';
}

export async function appendHearing(
  accessToken: string,
  hearing: HearingInput,
) {
  const sheets = getSheetsService(accessToken);

  // Append the row to the AUDIÊNCIA tab
  const row = [
    hearing.data,
    hearing.horario,
    hearing.reclamante,
    hearing.reclamada,
    hearing.processo,
    hearing.vara,
    hearing.tipo,
    hearing.advogado,
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: HEARINGS_SPREADSHEET_ID,
    range: 'AUDIÊNCIA!A:H',
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });

  // Apply background color based on modalidade
  if (hearing.modalidade !== 'presencial') {
    // Get the sheetId for the AUDIÊNCIA tab
    const ssInfo = await sheets.spreadsheets.get({
      spreadsheetId: HEARINGS_SPREADSHEET_ID,
      fields: 'sheets.properties',
    });
    const sheetId =
      ssInfo.data.sheets?.find((s) =>
        s.properties?.title?.includes('AUDIÊNCIA'),
      )?.properties?.sheetId ?? 0;

    // Get the last row number (the one we just appended)
    const allRows = await sheets.spreadsheets.values.get({
      spreadsheetId: HEARINGS_SPREADSHEET_ID,
      range: 'AUDIÊNCIA!A:A',
    });
    const lastRow = (allRows.data.values?.length || 1) - 1; // 0-indexed

    const bgColor =
      hearing.modalidade === 'online'
        ? { red: 0, green: 176 / 255, blue: 240 / 255 }
        : { red: 1, green: 1, blue: 0 };

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: HEARINGS_SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId,
                startRowIndex: lastRow,
                endRowIndex: lastRow + 1,
                startColumnIndex: 0,
                endColumnIndex: 8,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: bgColor,
                },
              },
              fields: 'userEnteredFormat.backgroundColor',
            },
          },
        ],
      },
    });
  }

  return { success: true, modalidade: hearing.modalidade };
}
