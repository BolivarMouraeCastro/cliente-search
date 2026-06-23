import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getSheetsService } from '@/lib/google-auth';

const SPREADSHEET_ID = '11ni1pXu0QbPQ_QmMGxdqdT4PsDNz6Z0ITBUW-E1ogMM';
const SHEET_NAME = 'Usuarios';
const ADMIN_EMAIL = 'advogadosbmc@gmail.com';
const HEADERS = ['EMAIL', 'NOME', 'ROLE', 'DATA_CADASTRO'];

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
        range: `${SHEET_NAME}!A1:D1`,
        valueInputOption: 'RAW',
        requestBody: { values: [HEADERS] },
      });
    }
  } catch (error) {
    console.error('Error ensuring sheet exists:', error);
    throw error;
  }
}

async function ensureHeaders(sheets: ReturnType<typeof getSheetsService>) {
  const headerRow = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A1:D1`,
  });

  const currentHeaders = headerRow.data.values?.[0];
  if (!currentHeaders || currentHeaders.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:D1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS] },
    });
  }
}

function getUserRole(email: string, sheetEmails: string[]): string {
  if (email === ADMIN_EMAIL) return 'admin';
  if (sheetEmails.includes(email.toLowerCase())) return 'colaborador';
  return 'unauthorized';
}

// GET — List registered users and return current user's role
export async function GET() {
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
      range: `${SHEET_NAME}!A2:D`,
    });

    const rows = response.data.values || [];

    const users = rows.map((row) => ({
      email: row[0] || '',
      nome: row[1] || '',
      role: row[2] || 'colaborador',
      dataCadastro: row[3] || '',
    }));

    const sheetEmails = users.map((u) => u.email.toLowerCase());
    const role = getUserRole(session.user.email, sheetEmails);

    return NextResponse.json({ role, users });
  } catch (error: any) {
    console.error('GET /api/usuarios error:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar usuários', details: error?.message },
      { status: 500 }
    );
  }
}

// POST — Add a new collaborator (admin only)
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
    const { email, nome } = body;

    if (!email || !nome) {
      return NextResponse.json(
        { error: 'Email e nome são obrigatórios' },
        { status: 400 }
      );
    }

    const sheets = getSheetsService(accessToken);
    await ensureSheetExists(sheets);
    await ensureHeaders(sheets);

    // Check if user already exists
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A2:A`,
    });

    const existingEmails = (existing.data.values || []).map((r) =>
      r[0]?.toLowerCase()
    );

    if (existingEmails.includes(email.toLowerCase())) {
      return NextResponse.json(
        { error: 'Usuário já cadastrado' },
        { status: 409 }
      );
    }

    const dataCadastro = new Date().toISOString();

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:D`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[email, nome, 'colaborador', dataCadastro]],
      },
    });

    return NextResponse.json(
      { message: 'Usuário adicionado com sucesso', user: { email, nome, role: 'colaborador', dataCadastro } },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('POST /api/usuarios error:', error);
    return NextResponse.json(
      { error: 'Erro ao adicionar usuário', details: error?.message },
      { status: 500 }
    );
  }
}

// DELETE — Remove a collaborator (admin only)
export async function DELETE(request: NextRequest) {
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
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { error: 'Email é obrigatório' },
        { status: 400 }
      );
    }

    const sheets = getSheetsService(accessToken);
    await ensureSheetExists(sheets);

    // Find the row to delete
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A2:D`,
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(
      (row) => row[0]?.toLowerCase() === email.toLowerCase()
    );

    if (rowIndex === -1) {
      return NextResponse.json(
        { error: 'Usuário não encontrado' },
        { status: 404 }
      );
    }

    // Get the sheet ID for batchUpdate
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });

    const sheet = spreadsheet.data.sheets?.find(
      (s) => s.properties?.title === SHEET_NAME
    );
    const sheetId = sheet?.properties?.sheetId;

    if (sheetId === undefined) {
      return NextResponse.json(
        { error: 'Aba não encontrada' },
        { status: 500 }
      );
    }

    // rowIndex is 0-based from row 2, so actual sheet row = rowIndex + 1 (header) + 1 (0-based to 1-based) - 1 (deleteDimension is 0-based) = rowIndex + 1
    const actualRowIndex = rowIndex + 1; // +1 for header row, 0-based for deleteDimension

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: actualRowIndex,
                endIndex: actualRowIndex + 1,
              },
            },
          },
        ],
      },
    });

    return NextResponse.json({ message: 'Usuário removido com sucesso' });
  } catch (error: any) {
    console.error('DELETE /api/usuarios error:', error);
    return NextResponse.json(
      { error: 'Erro ao remover usuário', details: error?.message },
      { status: 500 }
    );
  }
}
