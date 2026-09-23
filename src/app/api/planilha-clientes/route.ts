import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getAdminAccessToken } from '@/lib/admin-token';
import { getSheetsService } from '@/lib/google-auth';

const SPREADSHEET_ID = '11ni1pXu0QbPQ_QmMGxdqdT4PsDNz6Z0ITBUW-E1ogMM';
const TAB = 'PlanilhaClientes';

async function ensureTab(sheets: any) {
  try {
    await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${TAB}!A1`,
    });
    console.log(`[PlanilhaClientes] Tab "${TAB}" exists.`);
  } catch (e: any) {
    console.log(`[PlanilhaClientes] Tab "${TAB}" not found, creating...`, e?.message);
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: TAB } } }],
        },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${TAB}!A1:C1`,
        valueInputOption: 'RAW',
        requestBody: { values: [['NOME_COMPLETO', 'CPF', 'NUMERO_PROCESSO']] },
      });
      console.log(`[PlanilhaClientes] Tab "${TAB}" created successfully.`);
    } catch (e2: any) {
      console.error(`[PlanilhaClientes] Failed to create tab:`, e2?.message);
    }
  }
}

function cleanDigits(s: string): string {
  return s.replace(/\D/g, '');
}

/** GET — lista clientes */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  try {
    const token = await getAdminAccessToken();
    const sheets = getSheetsService(token);
    await ensureTab(sheets);

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${TAB}!A:C`,
    });

    const rows = (res.data.values || []) as string[][];
    const clientes = rows
      .slice(1)
      .map((row, i) => ({
        nome: row[0] || '',
        cpf: row[1] || '',
        numeroProcesso: row[2] || '',
        rowIndex: i + 2,
      }))
      .filter(c => c.nome);

    return NextResponse.json(clientes);
  } catch (e: any) {
    console.error('[PlanilhaClientes] GET error:', e?.message);
    return NextResponse.json({ error: 'Erro ao buscar clientes: ' + (e?.message || 'desconhecido') }, { status: 500 });
  }
}

/** POST — adicionar cliente */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { nome, cpf, numeroProcesso } = await request.json();

  if (!nome || !cpf) {
    return NextResponse.json({ error: 'Nome e CPF são obrigatórios' }, { status: 400 });
  }

  const cpfClean = cleanDigits(cpf);
  if (cpfClean.length !== 11) {
    return NextResponse.json({ error: 'CPF deve ter 11 dígitos' }, { status: 400 });
  }

  const token = await getAdminAccessToken();
  const sheets = getSheetsService(token);
  await ensureTab(sheets);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TAB}!A:C`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[nome.toUpperCase().trim(), cpfClean, (numeroProcesso || '').trim()]],
    },
  });

  return NextResponse.json({ success: true });
}

/** PUT — editar cliente */
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { rowIndex, nome, cpf, numeroProcesso } = await request.json();
  if (!rowIndex || !nome || !cpf) {
    return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });
  }

  const cpfClean = cleanDigits(cpf);

  const token = await getAdminAccessToken();
  const sheets = getSheetsService(token);

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TAB}!A${rowIndex}:C${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[nome.toUpperCase().trim(), cpfClean, (numeroProcesso || '').trim()]],
    },
  });

  return NextResponse.json({ success: true });
}

/** DELETE — remover cliente */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const body = await request.json();
  const token = await getAdminAccessToken();
  const sheets = getSheetsService(token);

  if (body.deleteAll === true) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${TAB}!A:C`,
    });
    const totalRows = (res.data.values || []).length;
    if (totalRows > 1) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${TAB}!A2:C${totalRows}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: Array.from({ length: totalRows - 1 }, () => ['', '', '']),
        },
      });
    }
    return NextResponse.json({ success: true, deleted: totalRows - 1 });
  }

  const { rowIndex } = body;
  if (!rowIndex) return NextResponse.json({ error: 'rowIndex obrigatório' }, { status: 400 });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TAB}!A${rowIndex}:C${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [['', '', '']] },
  });

  return NextResponse.json({ success: true });
}
