import { getSheetsService } from '@/lib/google-auth';

const SPREADSHEET_ID = '11ni1pXu0QbPQ_QmMGxdqdT4PsDNz6Z0ITBUW-E1ogMM';

const ACORDO_TAB = 'ACORDO';

const HEADERS = [
  'DATA ACORDO',
  'RECLAMANTE',
  'RECLAMADA',
  'Nº PROCESSO',
  'VARA',
  'VALOR ACORDO',
  'VALOR BRUTO (70%)',
  'VALOR LÍQUIDO (30%)',
  'PARCELAS',
  'DATA 1ª PARCELA',
  'FGTS LIBERADO',
  'SEGURO DESEMPREGO',
  'ADVOGADO',
];

export interface AcordoInput {
  reclamante: string;
  reclamada: string;
  processo: string;
  vara: string;
  valorAcordo: number;
  parcelas: number;
  dataPrimeiraParcela: string;
  fgtsLiberado: boolean;
  seguroDesemprego: boolean;
  advogado: string;
  dataAcordo: string;
}

export async function appendAcordo(
  accessToken: string,
  acordo: AcordoInput,
) {
  const sheets = getSheetsService(accessToken);

  const valorBruto = acordo.valorAcordo * 0.7;
  const valorLiquido = acordo.valorAcordo * 0.3;

  // Try to read the ACORDO tab; if it doesn't exist, create it
  try {
    await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${ACORDO_TAB}!A1:A1`,
    });
  } catch {
    // Tab doesn't exist — create it and add headers
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: ACORDO_TAB } } }],
      },
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${ACORDO_TAB}!A1:M1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
  }

  // Format valor for Brazilian display
  const formatBRL = (v: number) =>
    v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Append the row
  const row = [
    acordo.dataAcordo,
    acordo.reclamante,
    acordo.reclamada,
    acordo.processo,
    acordo.vara,
    `R$ ${formatBRL(acordo.valorAcordo)}`,
    `R$ ${formatBRL(valorBruto)}`,
    `R$ ${formatBRL(valorLiquido)}`,
    acordo.parcelas,
    acordo.dataPrimeiraParcela,
    acordo.fgtsLiberado ? 'SIM' : 'NÃO',
    acordo.seguroDesemprego ? 'SIM' : 'NÃO',
    acordo.advogado,
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${ACORDO_TAB}!A:A`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });

  return { success: true, valorBruto, valorLiquido };
}
