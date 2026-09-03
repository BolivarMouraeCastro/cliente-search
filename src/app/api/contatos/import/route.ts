import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getAdminAccessToken } from '@/lib/admin-token';
import { getSheetsService } from '@/lib/google-auth';
import * as XLSX from 'xlsx';

const SPREADSHEET_ID = '11ni1pXu0QbPQ_QmMGxdqdT4PsDNz6Z0ITBUW-E1ogMM';
const TAB = 'Contatos';
const BATCH_SIZE = 500;

const NOME_KEYS = ['nome', 'razão social', 'razao social', 'nome completo', 'nome_completo', 'cliente', 'reclamante', 'name'];
const CPF_KEYS = ['cpf', 'cpf/cnpj', 'documento', 'doc', 'cpf_cnpj'];
const TEL_KEYS = ['telefone', 'celular', 'whatsapp', 'fone', 'tel', 'phone', 'numero', 'contato', 'whats'];

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
        range: `${TAB}!A1:D1`,
        valueInputOption: 'RAW',
        requestBody: { values: [['NOME_COMPLETO', 'CPF', 'TELEFONE', 'DATA_CADASTRO']] },
      });
    } catch {}
  }
}

/** Finds the header row (searches first 5 rows) */
function findHeaderRow(rawData: (string | number)[][]): { headerIdx: number; nomeIdx: number; cpfIdx: number; telIdx: number } {
  for (let r = 0; r < Math.min(5, rawData.length); r++) {
    const row = rawData[r].map(c => String(c || ''));
    const nomeIdx = findColumn(row, NOME_KEYS);
    const cpfIdx = findColumn(row, CPF_KEYS);
    // Accept row as header if at least nome OR cpf is found
    if (nomeIdx >= 0 || cpfIdx >= 0) {
      const telIdx = findColumn(row, TEL_KEYS);
      return { headerIdx: r, nomeIdx, cpfIdx, telIdx };
    }
  }
  return { headerIdx: -1, nomeIdx: -1, cpfIdx: -1, telIdx: -1 };
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

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: '' }) as (string | number)[][];

    if (rawData.length < 2) {
      return NextResponse.json({ error: 'Arquivo vazio ou sem dados' }, { status: 400 });
    }

    // Find header row (could be row 1 or row 2)
    const { headerIdx, nomeIdx, cpfIdx, telIdx } = findHeaderRow(rawData);

    if (headerIdx < 0 || nomeIdx < 0) {
      const allHeaders = rawData.slice(0, 3).map(r => r.map(c => String(c || '')).filter(Boolean).join(', '));
      return NextResponse.json({
        error: `Coluna de NOME não encontrada. Primeiras linhas: ${allHeaders.join(' | ')}`,
      }, { status: 400 });
    }

    const headers = rawData[headerIdx].map(c => String(c || ''));

    // Process data rows (everything after the header row)
    const now = new Date().toISOString();
    const rows: string[][] = [];
    let skipped = 0;
    const seen = new Set<string>();

    for (let i = headerIdx + 1; i < rawData.length; i++) {
      const row = rawData[i];
      const nome = String(row[nomeIdx] ?? '').trim().toUpperCase();
      if (!nome) { skipped++; continue; }

      const cpfRaw = cpfIdx >= 0 ? cleanDigits(row[cpfIdx]) : '';
      let telRaw = telIdx >= 0 ? cleanDigits(row[telIdx]) : '';

      // Format phone: ensure starts with 55
      if (telRaw && !telRaw.startsWith('55')) telRaw = '55' + telRaw;

      // Deduplicate by CPF (keep first occurrence)
      if (cpfRaw && seen.has(cpfRaw)) { skipped++; continue; }
      if (cpfRaw) seen.add(cpfRaw);

      rows.push([nome, cpfRaw, telRaw, now]);
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Nenhum contato válido encontrado' }, { status: 400 });
    }

    // Upload in batches
    const token = await getAdminAccessToken();
    const sheets = getSheetsService(token);
    await ensureTab(sheets);

    let uploaded = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${TAB}!A:D`,
        valueInputOption: 'RAW',
        requestBody: { values: batch },
      });
      uploaded += batch.length;
    }

    return NextResponse.json({
      success: true,
      total: rawData.length - headerIdx - 1,
      imported: uploaded,
      skipped,
      duplicates: rawData.length - headerIdx - 1 - uploaded - skipped,
      columns: {
        nome: headers[nomeIdx] || '?',
        cpf: cpfIdx >= 0 ? headers[cpfIdx] || '?' : 'NÃO ENCONTRADA',
        telefone: telIdx >= 0 ? headers[telIdx] || '?' : 'NÃO ENCONTRADA',
      },
    });
  } catch (error: any) {
    console.error('Import error:', error);
    return NextResponse.json({ error: 'Erro ao importar', details: error?.message }, { status: 500 });
  }
}
