import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getSheetsService } from '@/lib/google-auth';

const SPREADSHEET_ID = '11ni1pXu0QbPQ_QmMGxdqdT4PsDNz6Z0ITBUW-E1ogMM';
const SHEET_NAME = 'Atividades';
const HEADERS = ['TIMESTAMP', 'EMAIL', 'NOME', 'ACAO', 'DETALHES'];

async function ensureSheetExists(sheets: ReturnType<typeof getSheetsService>) {
  try {
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });

    const sheetExists = spreadsheet.data.sheets?.some(
      (s) => s.properties?.title === SHEET_NAME
    );

    if (!sheetExists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: { title: SHEET_NAME },
              },
            },
          ],
        },
      });

      // Add header row to the new sheet
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A1:E1`,
        valueInputOption: 'RAW',
        requestBody: { values: [HEADERS] },
      });
    }
  } catch (error) {
    console.error('Error ensuring Atividades sheet exists:', error);
    throw error;
  }
}

async function ensureHeaders(sheets: ReturnType<typeof getSheetsService>) {
  const headerRow = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1:E1`,
  });

  const currentHeaders = headerRow.data.values?.[0];
  if (!currentHeaders || currentHeaders.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:E1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
  }
}

// GET — List activities, optionally filtered by email query param
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const accessToken = (session as any)?.accessToken;

    if (!session?.user?.email || !accessToken) {
      return NextResponse.json(
        { error: 'Não autenticado' },
        { status: 401 }
      );
    }

    const sheets = getSheetsService(accessToken);
    await ensureSheetExists(sheets);
    await ensureHeaders(sheets);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A2:E`,
    });

    const rows = response.data.values || [];

    let atividades = rows.map((row) => ({
      timestamp: row[0] || '',
      email: row[1] || '',
      nome: row[2] || '',
      acao: row[3] || '',
      detalhes: row[4] || '',
    }));

    // Filter by email if query param is provided
    const { searchParams } = new URL(request.url);
    const emailFilter = searchParams.get('email');

    if (emailFilter) {
      atividades = atividades.filter(
        (a) => a.email.toLowerCase() === emailFilter.toLowerCase()
      );
    }

    return NextResponse.json({ atividades });
  } catch (error: any) {
    console.error('GET /api/usuarios/atividades error:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar atividades', details: error?.message },
      { status: 500 }
    );
  }
}

// POST — Log a new activity for the current user
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const accessToken = (session as any)?.accessToken;

    if (!session?.user?.email || !accessToken) {
      return NextResponse.json(
        { error: 'Não autenticado' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { acao, detalhes } = body;

    if (!acao) {
      return NextResponse.json(
        { error: 'Ação é obrigatória' },
        { status: 400 }
      );
    }

    const sheets = getSheetsService(accessToken);
    await ensureSheetExists(sheets);
    await ensureHeaders(sheets);

    const timestamp = new Date().toISOString();
    const email = session.user.email;
    const nome = session.user.name || '';

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:E`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[timestamp, email, nome, acao, detalhes || '']],
      },
    });

    return NextResponse.json(
      {
        message: 'Atividade registrada com sucesso',
        atividade: { timestamp, email, nome, acao, detalhes: detalhes || '' },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('POST /api/usuarios/atividades error:', error);
    return NextResponse.json(
      { error: 'Erro ao registrar atividade', details: error?.message },
      { status: 500 }
    );
  }
}
