import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getClients } from '@/lib/sheets';
import { getAllHearings } from '@/lib/hearings';

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
    // Buscar dados em paralelo: Planilha de Clientes + Planilha de Audiências
    // =====================================================================
    const [allClients, allHearings] = await Promise.all([
      getClients(session.accessToken, SPREADSHEET_ID),
      getAllHearings(session.accessToken),
    ]);

    // =====================================================================
    // DISTRIBUÍDOS: Conta processos ÚNICOS da planilha de audiências
    // Cada número de processo (CNJ) diferente que tenha data em 2026 = 1 processo
    // =====================================================================
    const parseDateBR = (dateStr: string): Date | null => {
      if (!dateStr) return null;
      const parts = dateStr.split('/');
      if (parts.length !== 3) return null;
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
      return new Date(year, month, day);
    };

    // Filtrar audiências do ano corrente
    const hearingsThisYear = allHearings.filter(h => {
      return h.dataAudiencia.endsWith(`/${currentYearStr}`);
    });

    // Extrair números de processo ÚNICOS (cada processo conta 1x, mesmo com várias audiências)
    const uniqueProcessosAno = new Map<string, { name: string; date: string }>();
    for (const h of hearingsThisYear) {
      const num = h.numeroProcesso.trim();
      if (num && !uniqueProcessosAno.has(num)) {
        uniqueProcessosAno.set(num, { name: h.reclamante, date: h.dataAudiencia });
      }
    }

    // Processos do mês corrente
    const uniqueProcessosMes = new Map<string, { name: string; date: string }>();
    for (const h of hearingsThisYear) {
      const num = h.numeroProcesso.trim();
      if (num && h.dataAudiencia.includes(`/${currentMonthStr}/${currentYearStr}`)) {
        if (!uniqueProcessosMes.has(num)) {
          uniqueProcessosMes.set(num, { name: h.reclamante, date: h.dataAudiencia });
        }
      }
    }

    // Processos da semana corrente
    const uniqueProcessosSemana = new Map<string, { name: string; date: string }>();
    for (const h of hearingsThisYear) {
      const num = h.numeroProcesso.trim();
      if (num) {
        const date = parseDateBR(h.dataAudiencia);
        if (date && date >= startOfWeekDate) {
          if (!uniqueProcessosSemana.has(num)) {
            uniqueProcessosSemana.set(num, { name: h.reclamante, date: h.dataAudiencia });
          }
        }
      }
    }

    // Converter Maps para arrays de items (para o frontend exibir)
    const mapToItems = (map: Map<string, { name: string; date: string }>) => {
      return Array.from(map.entries()).map(([processo, info]) => {
        const parts = info.date.split('/');
        let isoDate = new Date().toISOString();
        if (parts.length === 3) {
          isoDate = `${parts[2]}-${parts[1]}-${parts[0]}T12:00:00.000Z`;
        }
        return {
          id: processo,
          name: info.name || 'Cliente S/N',
          createdTime: isoDate,
        };
      });
    };

    // =====================================================================
    // NOVOS CLIENTES: Conta pela planilha de entrada (como antes)
    // =====================================================================
    const formatClientToItem = (c: any) => {
      const parts = c.entrada.split('/');
      let isoDate = new Date().toISOString();
      if (parts.length === 3) {
        isoDate = `${parts[2]}-${parts[1]}-${parts[0]}T12:00:00.000Z`;
      }
      return {
        id: c.id || Math.random().toString(),
        name: c.nome || c.empresa || 'Cliente S/N',
        createdTime: isoDate,
      };
    };

    const novosClientesAnoItems = allClients.filter(c => c.entrada.endsWith(`/${currentYearStr}`));
    const novosClientesMesItems = novosClientesAnoItems.filter(c => c.entrada.includes(`/${currentMonthStr}/`));

    return NextResponse.json({
      novosClientesMes: { count: novosClientesMesItems.length, items: novosClientesMesItems.map(formatClientToItem) },
      novosClientesAno: { count: novosClientesAnoItems.length, items: novosClientesAnoItems.map(formatClientToItem) },
      distribuidosAno: { count: uniqueProcessosAno.size, items: mapToItems(uniqueProcessosAno) },
      distribuidosMes: { count: uniqueProcessosMes.size, items: mapToItems(uniqueProcessosMes) },
      distribuidosSemana: { count: uniqueProcessosSemana.size, items: mapToItems(uniqueProcessosSemana) },
    });

  } catch (error: unknown) {
    console.error('Metrics error:', error);
    const message = error instanceof Error ? error.message : 'Erro interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
