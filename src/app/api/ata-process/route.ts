import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getEffectiveAccessToken } from '@/lib/admin-token';
import { appendHearing } from '@/lib/hearings-write';
import { appendAcordo } from '@/lib/acordo-sheet';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const accessToken = await getEffectiveAccessToken(
    session?.user?.email,
    (session as any)?.accessToken,
  );

  if (!accessToken) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const body = await req.json();
  const { action, data } = body;
  // action: 'audiencia' | 'acordo'

  const results: any = {};

  if (action === 'audiencia' && data.audiencia) {
    results.audiencia = await appendHearing(accessToken, data.audiencia);
  }

  if (action === 'acordo' && data.acordo) {
    results.acordo = await appendAcordo(accessToken, data.acordo);
  }

  return NextResponse.json({ success: true, results });
}
