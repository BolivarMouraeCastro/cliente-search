import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getAdminAccessToken } from '@/lib/admin-token';
import { getSheetsService } from '@/lib/google-auth';

const SPREADSHEET_ID = '11ni1pXu0QbPQ_QmMGxdqdT4PsDNz6Z0ITBUW-E1ogMM';

/** GET — busca contato por nome exato */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ found: false }, { status: 401 });

  const nome = new URL(request.url).searchParams.get('nome')?.trim().toUpperCase();
  if (!nome) return NextResponse.json({ found: false });

  const token = await getAdminAccessToken();
  const sheets = getSheetsService(token);

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Contatos!A:D',
    });

    const rows = (res.data.values || []) as string[][];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowNome = (row[0] || '').trim().toUpperCase();
      if (rowNome === nome) {
        return NextResponse.json({
          found: true,
          nome: row[0] || '',
          cpf: row[1] || '',
          telefone: row[2] || '',
        });
      }
    }
  } catch {}

  return NextResponse.json({ found: false });
}
