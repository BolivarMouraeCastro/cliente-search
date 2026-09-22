import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getSheetsService } from '@/lib/google-auth';
import { getEffectiveAccessToken } from '@/lib/admin-token';

const SPREADSHEET_ID = '11ni1pXu0QbPQ_QmMGxdqdT4PsDNz6Z0ITBUW-E1ogMM';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const token = await getEffectiveAccessToken(session.user.email, (session as any)?.accessToken);
    const sheets = getSheetsService(token);

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Acessos!A:E',
    });

    const rows = res.data.values || [];
    const header = rows[0] || [];
    const data = rows.slice(1).map(row => ({
      nome: row[0] || '',
      cpf: row[1] || '',
      data: row[2] || '',
      hora: row[3] || '',
      dataHora: row[4] || '',
    }));

    // Reverse so most recent first
    data.reverse();

    // Stats
    const today = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const accessToday = data.filter(d => d.data === today).length;
    const uniqueClients = new Set(data.map(d => d.cpf)).size;
    const totalAccess = data.length;

    // Last 7 days chart data
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      return {
        date: dateStr,
        count: data.filter(a => a.data === dateStr).length,
      };
    }).reverse();

    return NextResponse.json({
      stats: { accessToday, uniqueClients, totalAccess },
      last7,
      recentAccess: data.slice(0, 50), // last 50
    });
  } catch (e: any) {
    console.error('Admin acessos error:', e?.message);
    return NextResponse.json({ error: 'Erro ao buscar acessos', details: e?.message }, { status: 500 });
  }
}
