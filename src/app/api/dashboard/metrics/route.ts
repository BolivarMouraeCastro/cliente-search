import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getClients } from '@/lib/sheets';
import { getAllHearings } from '@/lib/hearings';

export const dynamic = 'force-dynamic';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? '';

interface ProcessoItem {
  id: string;
  name: string;
  createdTime: string;
}

interface YearDistribution {
  year: string;
  count: number;
  processos: ProcessoItem[];
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const now = new Date();
    const currentYearStr = now.getFullYear().toString();
    const currentMonthStr = String(now.getMonth() + 1).padStart(2, '0');

    // =====================================================================
    // Buscar dados em paralelo: Planilha de Clientes + Planilha de Audiências
    // =====================================================================
    const [allClients, allHearings] = await Promise.all([
      getClients(session.accessToken, SPREADSHEET_ID),
      getAllHearings(session.accessToken),
    ]);

    // =====================================================================
    // DISTRIBUIÇÃO POR ANO: Agrupa processos únicos (CNJ) por ano
    // O ano da distribuição é extraído do NÚMERO DO PROCESSO (CNJ).
    // Formato CNJ: NNNNNNN-DD.YYYY.J.TT.OOOO
    // Exemplo: 1001669-81.2025.5.02.0465 → ano = 2025
    // =====================================================================

    // Regex para extrair o ano do número CNJ
    const cnjYearRegex = /\d{7}-\d{2}\.(\d{4})\.\d\.\d{2}\.\d{4}/;

    // Map: year -> Map of unique processo -> info
    const yearMap = new Map<string, Map<string, { name: string; date: string }>>();

    for (const h of allHearings) {
      const num = h.numeroProcesso.trim();
      if (!num) continue;

      // Extrair o ano do número do processo (CNJ)
      const match = num.match(cnjYearRegex);
      if (!match) continue;

      const year = match[1]; // Ex: "2025"

      if (!yearMap.has(year)) {
        yearMap.set(year, new Map());
      }

      const processMap = yearMap.get(year)!;
      if (!processMap.has(num)) {
        processMap.set(num, { name: h.reclamante, date: h.dataAudiencia });
      }
    }

    // Convert to ProcessoItem helper
    const toProcessoItem = (processo: string, info: { name: string; date: string }): ProcessoItem => {
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
    };

    // Build distribuicaoPorAno array, sorted by year descending
    const distribuicaoPorAno: YearDistribution[] = Array.from(yearMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([year, processMap]) => ({
        year,
        count: processMap.size,
        processos: Array.from(processMap.entries()).map(([proc, info]) => toProcessoItem(proc, info)),
      }));

    // Total unique processes across ALL years
    const allUniqueProcessos = new Set<string>();
    for (const [, processMap] of yearMap) {
      for (const proc of processMap.keys()) {
        allUniqueProcessos.add(proc);
      }
    }
    const totalDistribuidos = allUniqueProcessos.size;

    // =====================================================================
    // NOVOS CLIENTES: Conta pela planilha de entrada (como antes)
    // =====================================================================
    const formatClientToItem = (c: { id?: string; nome?: string; empresa?: string; entrada: string }): ProcessoItem => {
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
      distribuicaoPorAno,
      totalDistribuidos,
    });

  } catch (error: unknown) {
    console.error('Metrics error:', error);
    const message = error instanceof Error ? error.message : 'Erro interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
