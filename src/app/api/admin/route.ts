import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getSheetsService } from '@/lib/google-auth';
import { getAdminAccessToken } from '@/lib/admin-token';

const SPREADSHEET_ID = '11ni1pXu0QbPQ_QmMGxdqdT4PsDNz6Z0ITBUW-E1ogMM';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || session.user.email !== 'gabriielroberto10@gmail.com') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const token = await getAdminAccessToken();
    const sheets = getSheetsService(token);

    const [usersResponse, activitiesResponse] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Usuarios!A:E',
      }).catch(() => ({ data: { values: [] as string[][] } })),
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Atividades!A:E',
      }).catch(() => ({ data: { values: [] as string[][] } })),
    ]);

    const usersRows = (usersResponse.data.values || []) as string[][];
    const activitiesRows = (activitiesResponse.data.values || []) as string[][];

    // Skip header row, map to objects
    const users = usersRows.slice(1).map(row => ({
      email: row[0] || '',
      nome: row[1] || '',
      role: row[2] || '',
      dataCadastro: row[3] || '',
    }));

    const activities = activitiesRows.slice(1).map(row => ({
      timestamp: row[0] || '',
      email: row[1] || '',
      nome: row[2] || '',
      acao: row[3] || '',
      detalhes: row[4] || '',
    }));

    return NextResponse.json({ users, activities }, { status: 200 });
  } catch (error: any) {
    console.error('Admin API error:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error?.message }, { status: 500 });
  }
}
