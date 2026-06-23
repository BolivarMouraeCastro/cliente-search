import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getToken } from 'next-auth/jwt';
import { headers } from 'next/headers';

// This endpoint shows the admin's refresh token so it can be saved in Vercel env vars.
// Should only be called ONCE by the admin.
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    // Get the JWT token which contains the refresh token
    const headersList = headers();
    const token = await getToken({ 
      req: {
        headers: Object.fromEntries(headersList.entries()),
        cookies: Object.fromEntries(
          (headersList.get('cookie') || '').split(';').map(c => {
            const [key, ...val] = c.trim().split('=');
            return [key, val.join('=')];
          })
        ),
      } as any,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token?.refreshToken) {
      return NextResponse.json({ 
        error: 'Refresh token não encontrado. Faça logout e login novamente.',
        email: session.user.email,
      }, { status: 404 });
    }

    return NextResponse.json({
      email: session.user.email,
      refreshToken: token.refreshToken,
      message: 'Copie o refreshToken e adicione no Vercel como ADMIN_REFRESH_TOKEN',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
