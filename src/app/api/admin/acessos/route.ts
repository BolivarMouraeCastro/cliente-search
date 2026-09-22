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

    // 1. Read 'Avaliacoes' tab
    let avaliacoesData: any[] = [];
    try {
      const avRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Avaliacoes!A2:F',
      });
      avaliacoesData = avRes.data.values || [];
    } catch (e) {}

    const avaliacoes = {
      total: avaliacoesData.length,
      media: avaliacoesData.length > 0 ? (avaliacoesData.reduce((acc, row) => acc + Number(row[2] || 0), 0) / avaliacoesData.length) : 0,
      recent: avaliacoesData.map(row => ({
        nome: row[0],
        cpf: row[1],
        nota: Number(row[2]),
        comentario: row[3],
        data: row[4],
        hora: row[5]
      })).reverse().slice(0, 20),
    };

    // 2. Read 'Indicacoes' tab
    let indicacoesData: any[] = [];
    try {
      const indRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Indicacoes!A2:E',
      });
      indicacoesData = indRes.data.values || [];
    } catch (e) {}

    const indicacoes = {
      total: indicacoesData.length,
      recent: indicacoesData.map(row => ({
        indicadoPor: row[0],
        nomeIndicado: row[1],
        telefone: row[2],
        data: row[3],
        hora: row[4]
      })).reverse().slice(0, 20),
    };

    // 3. Read 'Contatos' tab
    let contatosData: any[] = [];
    try {
      const contRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Contatos!A2:C',
      });
      contatosData = contRes.data.values || [];
    } catch (e) {}

    const allContacts = contatosData.map(row => {
      let cpf = (row[1] || '').replace(/\D/g, '');
      if (cpf.length !== 11) cpf = (row[2] || '').replace(/\D/g, '');
      return { nome: row[0] || '', cpf };
    }).filter(c => c.cpf);

    const accessMap = new Map(); // cpf -> count
    data.forEach(d => {
      const cleanCpf = (d.cpf || '').replace(/\D/g, '');
      if (cleanCpf) {
        accessMap.set(cleanCpf, (accessMap.get(cleanCpf) || 0) + 1);
      }
    });

    const neverAccessed = allContacts.filter(c => !accessMap.has(c.cpf));

    const accessorsArr = Array.from(accessMap.entries()).map(([cpf, count]) => {
      const contact = allContacts.find(c => c.cpf === cpf);
      const nome = contact ? contact.nome : (data.find(d => d.cpf.replace(/\D/g, '') === cpf)?.nome || 'Desconhecido');
      return { nome, cpf, count };
    });
    accessorsArr.sort((a, b) => (b.count as number) - (a.count as number));
    const topAccessors = accessorsArr.slice(0, 10);

    const monthlyAccessMap = new Map();
    const todayDate = new Date();
    for(let i = 5; i >= 0; i--) {
      const d = new Date(todayDate.getFullYear(), todayDate.getMonth() - i, 1);
      const monthStr = d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
      monthlyAccessMap.set(monthStr, 0);
    }

    data.forEach(d => {
      if (d.data) {
        const parts = d.data.split('/');
        if (parts.length === 3) {
          const dateObj = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
          const monthStr = dateObj.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
          if (monthlyAccessMap.has(monthStr)) {
            monthlyAccessMap.set(monthStr, monthlyAccessMap.get(monthStr) + 1);
          }
        }
      }
    });
    const monthlyAccess = Array.from(monthlyAccessMap.entries()).map(([month, count]) => ({ month, count }));

    const engajamento = { neverAccessed, topAccessors, monthlyAccess };

    return NextResponse.json({
      stats: { accessToday, uniqueClients, totalAccess },
      last7,
      recentAccess: data.slice(0, 50), // last 50
      avaliacoes,
      indicacoes,
      engajamento
    });
  } catch (e: any) {
    console.error('Admin acessos error:', e?.message);
    return NextResponse.json({ error: 'Erro ao buscar acessos', details: e?.message }, { status: 500 });
  }
}
