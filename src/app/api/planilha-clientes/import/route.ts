import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getAdminAccessToken } from '@/lib/admin-token';
import { getSheetsService } from '@/lib/google-auth';
import * as XLSX from 'xlsx';

const SPREADSHEET_ID = '11ni1pXu0QbPQ_QmMGxdqdT4PsDNz6Z0ITBUW-E1ogMM';
const TAB = 'PlanilhaClientes';
const BATCH_SIZE = 500;

const NOME_KEYS = ['nome', 'razão social', 'razao social', 'nome completo', 'nome_completo', 'reclamante', 'name'];
const CPF_KEYS = ['cpf', 'cpf/cnpj', 'documento', 'doc', 'cpf_cnpj'];
const PROC_KEYS = ['processo', 'numero processo', 'nº processo', 'numero_processo', 'num_processo', 'process'];

function findColumn(headers: string[], candidates: string[]): number {
  const normalized = headers.map(h => String(h || '').toLowerCase().trim());
  for (const candidate of candidates) {
    const idx = normalized.findIndex(h => h.includes(candidate));
    if (idx >= 0) return idx;
  }
  return -1;
}

function cleanDigits(s: string | number | undefined | null): string {
  return String(s ?? '').replace(/\D/g, '');
}

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
        range: `${TAB}!A1:C1`,
        valueInputOption: 'RAW',
        requestBody: { values: [['NOME_COMPLETO', 'CPF', 'NUMERO_PROCESSO']] },
      });
    } catch {}
  }
}

function findHeaderRow(rawData: (string | number)[][]): { headerIdx: number; nomeIdx: number; cpfIdx: number; procIdx: number } {
  for (let r = 0; r < Math.min(5, rawData.length); r++) {
    const row = rawData[r].map(c => String(c || ''));
    const nomeIdx = findColumn(row, NOME_KEYS);
    const cpfIdx = findColumn(row, CPF_KEYS);
    const procIdx = findColumn(row, PROC_KEYS);
    const matches = [nomeIdx, cpfIdx, procIdx].filter(i => i >= 0).length;
    if (matches >= 2) {
      return { headerIdx: r, nomeIdx, cpfIdx, procIdx };
    }
  }
  return { headerIdx: -1, nomeIdx: -1, cpfIdx: -1, procIdx: -1 };
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true }) as (string | number)[][];

    if (!rawData || rawData.length < 2) {
      return NextResponse.json({ error: 'Planilha vazia ou sem dados' }, { status: 400 });
    }

    const { headerIdx, nomeIdx, cpfIdx, procIdx } = findHeaderRow(rawData);
    if (headerIdx < 0 || nomeIdx < 0) {
      return NextResponse.json({ error: 'Não encontrei as colunas. A planilha precisa ter pelo menos "Nome" e "CPF".' }, { status: 400 });
    }

    const dataRows = rawData.slice(headerIdx + 1);
    const validRows: string[][] = [];

    for (const row of dataRows) {
      const nome = String(row[nomeIdx] ?? '').trim().toUpperCase();
      const cpf = cpfIdx >= 0 ? cleanDigits(row[cpfIdx]) : '';
      const processo = procIdx >= 0 ? String(row[procIdx] ?? '').trim() : '';

      if (!nome || nome.length < 2) continue;

      validRows.push([nome, cpf, processo]);
    }

    if (validRows.length === 0) {
      return NextResponse.json({ error: 'Nenhum registro válido encontrado' }, { status: 400 });
    }

    const token = await getAdminAccessToken();
    const sheets = getSheetsService(token);
    await ensureTab(sheets);

    // Import in batches
    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${TAB}!A:C`,
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
