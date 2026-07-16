import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getClients } from '@/lib/sheets';

export const dynamic = 'force-dynamic';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? '';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const now = new Date();
    const currentYearStr = now.getFullYear().toString();
    const currentMonthStr = String(now.getMonth() + 1).padStart(2, '0');

    // Monday as start of week
    const currentDay = now.getDay();
    const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1;
    const startOfWeekDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - distanceToMonday);
    startOfWeekDate.setHours(0, 0, 0, 0);

    // =====================================================================
    // FONTE DE VERDADE: A PLANILHA
    // Em vez de depender da estrutura de pastas do Drive (que ignora subpastas),
    // usamos a planilha diretamente. Todo processo com data de entrada no ano
    // é contado, independente de status, matéria ou pasta do Drive.
    // =====================================================================
    const allClients = await getClients(session.accessToken, SPREADSHEET_ID);

    // Helper: converte "DD/MM/YYYY" para Date
    const parseEntrada = (entrada: string): Date | null => {
      if (!entrada) return null;
      const parts = entrada.split('/');
      if (parts.length !== 3) return null;
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
      return new Date(year, month, day);
    };

    const formatClientToItem = (c: any) => {
      const parts = c.entrada.split('/');
      let isoDate = new Date().toISOString();
      if (parts.length === 3) {
        isoDate = `${parts[2]}-${parts[1]}-${parts[0]}T12:00:00.000Z`;
      }
      return {
        id: c.id || Math.random().toString(),
        name: c.nome || c.empresa || 'Cliente S/N',
        createdTime: isoDate
      };
    };

    // ── Distribuídos: TODOS os processos com entrada no ano corrente ──
    // Não filtra por status, pasta ou matéria. Se tem data de entrada no ano, conta.
    const distribuidosAnoClients = allClients.filter(c => c.entrada.endsWith(`/${currentYearStr}`));

    const distribuidosMesClients = distribuidosAnoClients.filter(c =>
      c.entrada.includes(`/${currentMonthStr}/${currentYearStr}`)
    );

    const distribuidosSemanaClients = distribuidosAnoClients.filter(c => {
      const date = parseEntrada(c.entrada);
      return date && date >= startOfWeekDate;
    });

    // ── Novos Clientes (mesma lógica de antes) ──
    const novosClientesAnoItems = allClients.filter(c => c.entrada.endsWith(`/${currentYearStr}`));
    const novosClientesMesItems = novosClientesAnoItems.filter(c => c.entrada.includes(`/${currentMonthStr}/`));

    const validNovosClientes = novosClientesAnoItems.map(formatClientToItem);
    const novosClientesMes = novosClientesMesItems.map(formatClientToItem);

    return NextResponse.json({
      novosClientesMes: { count: novosClientesMes.length, items: novosClientesMes },
      novosClientesAno: { count: validNovosClientes.length, items: validNovosClientes },
      distribuidosAno: { count: distribuidosAnoClients.length, items: distribuidosAnoClients.map(formatClientToItem) },
      distribuidosMes: { count: distribuidosMesClients.length, items: distribuidosMesClients.map(formatClientToItem) },
      distribuidosSemana: { count: distribuidosSemanaClients.length, items: distribuidosSemanaClients.map(formatClientToItem) }
    });

  } catch (error: unknown) {
    console.error('Metrics error:', error);
    const message = error instanceof Error ? error.message : 'Erro interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
