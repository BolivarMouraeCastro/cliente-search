import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getSheetsService } from '@/lib/google-auth';
import { getEffectiveAccessToken } from '@/lib/admin-token';

const SPREADSHEET_ID = '11ni1pXu0QbPQ_QmMGxdqdT4PsDNz6Z0ITBUW-E1ogMM';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || session.user.email !== 'gabriielroberto10@gmail.com') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const token = await getEffectiveAccessToken(session.user.email, (session as any).accessToken);
    if (!token) {
      return NextResponse.json({ error: 'Token not available' }, { status: 500 });
    }

    const sheets = getSheetsService(token);

    const [usersResponse, activitiesResponse] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Usuarios!A:E',
      }).catch(() => ({ data: { values: [] } })),
      sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Atividades!A:Z',
      }).catch(() => ({ data: { values: [] } })),
    ]);

    const users = usersResponse.data.values || [];
    const activities = activitiesResponse.data.values || [];

    return NextResponse.json({ users, activities }, { status: 200 });
  } catch (error: any) {
    console.error('Admin API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
