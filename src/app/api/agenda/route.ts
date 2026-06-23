import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getAllHearings } from '@/lib/hearings';
import { getEffectiveAccessToken } from '@/lib/admin-token';

/**
 * GET /api/agenda — Returns ALL hearings (READ-ONLY).
 * Optional query param: advogado (filter by lawyer name)
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const accessToken = await getEffectiveAccessToken(session?.user?.email, (session as any)?.accessToken);
    if (!accessToken) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const advogadoFilter = searchParams.get('advogado')?.trim().toUpperCase() || '';

    let hearings = await getAllHearings(accessToken);

    // Filter by lawyer if specified
    if (advogadoFilter) {
      hearings = hearings.filter(
        (h) => h.advogado.toUpperCase().includes(advogadoFilter)
      );
    }

    // Sort by date ascending (chronological)
    hearings.sort((a, b) => {
      const dateA = parseDateForSort(a.dataAudiencia);
      const dateB = parseDateForSort(b.dataAudiencia);
      if (dateA !== dateB) return dateA - dateB;
      return (a.horario || '').localeCompare(b.horario || '');
    });

    // Extract unique lawyer names for filter dropdown
    const allHearings = await getAllHearings(accessToken);
    const advogados = [...new Set(allHearings.map((h) => h.advogado).filter(Boolean))].sort();

    return NextResponse.json({
      hearings,
      advogados,
      total: hearings.length,
    });
  } catch (err) {
    console.error('Agenda error:', err);
    return NextResponse.json(
      { error: `Erro: ${err instanceof Error ? err.message : String(err)}` },
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
