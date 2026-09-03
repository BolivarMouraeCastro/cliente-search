import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getAdminAccessToken } from '@/lib/admin-token';
import { getSheetsService } from '@/lib/google-auth';

const SPREADSHEET_ID = '11ni1pXu0QbPQ_QmMGxdqdT4PsDNz6Z0ITBUW-E1ogMM';
const TAB = 'Contatos';

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
        requestBody: { values: [['NOME_COMPLETO', 'CPF', 'TELEFONE', 'DATA_CADASTRO']] },
      });
    } catch {}
  }
}

function cleanDigits(s: string): string {
  return s.replace(/\D/g, '');
}

/** GET — lista contatos */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const search = new URL(request.url).searchParams.get('search')?.toLowerCase() || '';

  const token = await getAdminAccessToken();
  const sheets = getSheetsService(token);
  await ensureTab(sheets);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TAB}!A:D`,
  });

  const rows = (res.data.values || []) as string[][];
  const contatos = rows
    .slice(1)
    .map((row, i) => ({
      nome: row[0] || '',
      cpf: row[1] || '',
      telefone: row[2] || '',
      dataCadastro: row[3] || '',
      rowIndex: i + 2, // 1-indexed + header
    }))
    .filter(c => c.nome) // skip empty rows
    .filter(c => !search || c.nome.toLowerCase().includes(search));

  return NextResponse.json(contatos);
}

/** POST — adicionar contato */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { nome, cpf, telefone } = await request.json();

  if (!nome || !cpf || !telefone) {
    return NextResponse.json({ error: 'Nome, CPF e Telefone são obrigatórios' }, { status: 400 });
  }

  const cpfClean = cleanDigits(cpf);
  if (cpfClean.length !== 11) {
    return NextResponse.json({ error: 'CPF deve ter 11 dígitos' }, { status: 400 });
  }

  let phoneClean = cleanDigits(telefone);
  if (!phoneClean.startsWith('55')) phoneClean = '55' + phoneClean;
  if (phoneClean.length < 12) {
    return NextResponse.json({ error: 'Telefone inválido' }, { status: 400 });
  }

  const token = await getAdminAccessToken();
  const sheets = getSheetsService(token);
  await ensureTab(sheets);

  // Check duplicate CPF
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TAB}!A:D`,
  });
  const rows = (existing.data.values || []) as string[][];
  const dup = rows.slice(1).find(r => cleanDigits(r[1] || '') === cpfClean);
  if (dup) {
    return NextResponse.json({ error: 'Contato com este CPF já existe' }, { status: 409 });
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TAB}!A:D`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[nome.toUpperCase().trim(), cpfClean, phoneClean, new Date().toISOString()]],
    },
  });

  return NextResponse.json({ success: true });
}

/** PUT — editar contato */
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { rowIndex, nome, cpf, telefone } = await request.json();
  if (!rowIndex || !nome || !cpf || !telefone) {
    return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });
  }

  const cpfClean = cleanDigits(cpf);
  let phoneClean = cleanDigits(telefone);
  if (!phoneClean.startsWith('55')) phoneClean = '55' + phoneClean;

  const token = await getAdminAccessToken();
  const sheets = getSheetsService(token);

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TAB}!A${rowIndex}:D${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[nome.toUpperCase().trim(), cpfClean, phoneClean, new Date().toISOString()]],
    },
  });

  return NextResponse.json({ success: true });
}

/** DELETE — remover contato */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { rowIndex } = await request.json();
  if (!rowIndex) return NextResponse.json({ error: 'rowIndex obrigatório' }, { status: 400 });

  const token = await getAdminAccessToken();
  const sheets = getSheetsService(token);

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${TAB}!A${rowIndex}:D${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: { values: [['', '', '', '']] },
  });

  return NextResponse.json({ success: true });
}
