import { NextResponse } from 'next/server';
import { getEffectiveAccessToken } from '@/lib/admin-token';
import { getAllHearings } from '@/lib/hearings';

export const dynamic = 'force-dynamic';

/**
 * GET /api/public/agenda — Public endpoint for hearings (no auth required).
 * Returns hearings + advogados list for filtering.
 * Optional query: ?advogado=NOME
 */
export async function GET(req: Request) {
  try {
    // Use getEffectiveAccessToken (same as internal /api/agenda)
    const token = await getEffectiveAccessToken(null, null);

    const { searchParams } = new URL(req.url);
    const advogadoFilter = searchParams.get('advogado')?.trim().toUpperCase() || '';

    let hearings = await getAllHearings(token);

    // Get full advogados list before filtering
    const advogados = [...new Set(hearings.map((h) => h.advogado).filter(Boolean))].sort();

    if (advogadoFilter) {
      hearings = hearings.filter(
        (h) => h.advogado.toUpperCase().includes(advogadoFilter)
      );
    }

    hearings.sort((a, b) => {
      const dateA = parseDateForSort(a.dataAudiencia);
      const dateB = parseDateForSort(b.dataAudiencia);
      if (dateA !== dateB) return dateA - dateB;
      return (a.horario || '').localeCompare(b.horario || '');
    });

    return NextResponse.json({
      hearings,
      advogados,
      total: hearings.length,
    });
  } catch (err) {
    console.error('Public agenda error:', err);
    return NextResponse.json(
      { error: `Erro: ${err instanceof Error ? err.message : String(err)}`, hearings: [], advogados: [], total: 0 },
      { status: 500 }
    );
  }
}

function parseDateForSort(dateStr: string): number {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return 0;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  return year * 10000 + month * 100 + day;
}
