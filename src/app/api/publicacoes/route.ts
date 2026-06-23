import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getDriveService } from '@/lib/google-auth';

const PUBLICACOES_FOLDER_ID = '1qWdLkoxe_g2iTkp1b2O6OFfkcwGP11NW';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const accessToken = (session as any)?.accessToken;

    if (!accessToken) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const drive = getDriveService(accessToken);

    // List all PDF files in the publications folder
    const response = await drive.files.list({
      q: `'${PUBLICACOES_FOLDER_ID}' in parents and mimeType = 'application/pdf' and trashed = false`,
      fields: 'files(id, name, modifiedTime)',
      pageSize: 50,
      orderBy: 'modifiedTime desc',
    });

    const files = response.data.files || [];

    // Download and return the content of each PDF as base64
    const pdfs: { id: string; name: string; date: string; base64: string }[] = [];

    for (const file of files) {
      if (!file.id) continue;
      try {
        const fileResponse = await drive.files.get(
          { fileId: file.id, alt: 'media' },
          { responseType: 'arraybuffer' }
        );
        const buffer = Buffer.from(fileResponse.data as ArrayBuffer);
        pdfs.push({
          id: file.id,
          name: file.name || '',
          date: file.modifiedTime || '',
          base64: buffer.toString('base64'),
        });
      } catch (err) {
        console.error(`Error downloading PDF ${file.name}:`, err);
      }
    }

    return NextResponse.json({ pdfs, total: pdfs.length });
  } catch (err) {
    console.error('Publicacoes API error:', err);
    return NextResponse.json(
      { error: `Erro ao acessar pasta do Drive: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
