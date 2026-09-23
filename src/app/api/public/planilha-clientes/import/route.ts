import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getAdminAccessToken } from '@/lib/admin-token';
import { getSheetsService } from '@/lib/google-auth';


const SPREADSHEET_ID = '11ni1pXu0QbPQ_QmMGxdqdT4PsDNz6Z0ITBUW-E1ogMM';
const TAB = 'PlanilhaClientes';
const BATCH_SIZE = 500;

async function ensureTab(sheets: any) {
  try {
    await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${TAB}!A1`,
    });
  } catch {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: TAB } } }],
        },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${TAB}!A1:D1`,
        valueInputOption: 'RAW',
        requestBody: { values: [['NOME_COMPLETO', 'CPF', 'NUMERO_PROCESSO', 'EMPRESA']] },
      });
    } catch {}
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  try {
    const body = await request.json();
    const validRows = body.data as string[][];
    
    if (!validRows || validRows.length === 0) {
      return NextResponse.json({ error: 'Nenhum registro válido enviado' }, { status: 400 });
    }

    const token = await getAdminAccessToken();
    const sheets = getSheetsService(token);
    await ensureTab(sheets);

    // Import in batches
    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${TAB}!A:D`,
        valueInputOption: 'RAW',
        requestBody: { values: batch },
      });
    }

    return NextResponse.json({ success: true, imported: validRows.length });
  } catch (error: any) {
    console.error('Import error:', error);
    return NextResponse.json({ error: 'Erro ao processar arquivo: ' + (error?.message || 'desconhecido') }, { status: 500 });
  }
}
