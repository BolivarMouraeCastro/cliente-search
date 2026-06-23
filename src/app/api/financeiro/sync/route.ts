import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getSheetsService } from '@/lib/google-auth';

const SPREADSHEET_ID = '11ni1pXu0QbPQ_QmMGxdqdT4PsDNz6Z0ITBUW-E1ogMM';
const SHEET_NAME = 'Financeiro';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const accessToken = (session as any)?.accessToken;
    if (!accessToken) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { transacoes } = await req.json();
    if (!transacoes || !Array.isArray(transacoes) || transacoes.length === 0) {
      return NextResponse.json({ error: 'Nenhuma transação para sincronizar' }, { status: 400 });
    }

    const sheets = getSheetsService(accessToken);

    // Check if the sheet exists, create header if needed
    try {
      const sheetData = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A1:G1`,
      });

      if (!sheetData.data.values || sheetData.data.values.length === 0) {
        // Add header row
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!A1:G1`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [['CLIENTE', 'RECLAMADA', 'Nº PROCESSO', 'DATA RECEBIMENTO', 'REPASSE CLIENTE', 'VALOR', 'TIPO']],
          },
        });
      }
    } catch {
      // Sheet might not exist, try creating it
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: {
            requests: [{
              addSheet: {
                properties: { title: SHEET_NAME },
              },
            }],
          },
        });
        // Add header
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!A1:G1`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [['CLIENTE', 'RECLAMADA', 'Nº PROCESSO', 'DATA RECEBIMENTO', 'REPASSE CLIENTE', 'VALOR', 'TIPO']],
          },
        });
      } catch (createErr) {
        console.error('Error creating sheet:', createErr);
      }
    }

    // Prepare rows
    const rows = transacoes.map((t: any) => [
      t.cliente || '',
      t.reclamada || '',
      t.processo || '',
      t.dataRecebimento || '',
      t.dataRepasse || '',
      t.valor || '',
      t.tipo || '',
    ]);

    // Append rows
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:G`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: rows,
      },
    });

    return NextResponse.json({ success: true, count: rows.length });
  } catch (err) {
    console.error('Financeiro sync error:', err);
    return NextResponse.json(
      { error: `Erro: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
