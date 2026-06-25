import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export const dynamic = 'force-dynamic';

// Simple endpoint to show the user's refresh token
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    // The refresh token is stored in the session via our callback
    const refreshToken = (session as any)?.refreshToken;

    if (!refreshToken) {
      return NextResponse.json({ 
        error: 'Refresh token não encontrado. Faça logout e login novamente.',
        email: session.user.email,
      }, { status: 404 });
    }

    return NextResponse.json({
      email: session.user.email,
      refreshToken,
      message: 'Copie o refreshToken e adicione no Vercel como variável de ambiente',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
