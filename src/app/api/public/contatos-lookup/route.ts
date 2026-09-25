import { NextRequest, NextResponse } from 'next/server';
import { getAdminAccessToken } from '@/lib/admin-token';
import { getSheetsService } from '@/lib/google-auth';

export const dynamic = 'force-dynamic';

const SPREADSHEET_ID = '11ni1pXu0QbPQ_QmMGxdqdT4PsDNz6Z0ITBUW-E1ogMM';

/** GET — busca contato por nome (público, sem auth) */
export async function GET(request: NextRequest) {
  const nome = new URL(request.url).searchParams.get('nome')?.trim().toUpperCase();
  if (!nome) return NextResponse.json({ found: false });

  try {
    const token = await getAdminAccessToken();
    const sheets = getSheetsService(token);

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Contatos!A:D',
    });

    const rows = (res.data.values || []) as string[][];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowNome = (row[0] || '').trim().toUpperCase();
      if (rowNome === nome || rowNome.includes(nome) || nome.includes(rowNome)) {
        return NextResponse.json({
          found: true,
          nome: row[0] || '',
          telefone: row[2] || '',
        });
      }
    }
  } catch (err) {
    console.error('Public contatos lookup error:', err);
  }

  return NextResponse.json({ found: false });
}
