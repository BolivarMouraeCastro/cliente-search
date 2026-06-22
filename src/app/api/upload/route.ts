import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { findClientFolderId, uploadFileToDrive } from '@/lib/drive';

// Increase function execution time for large uploads
export const maxDuration = 60;

// Allowed MIME types
const ALLOWED_TYPES = [
  'application/pdf',
  'audio/mpeg', 'audio/mp4', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/avi',
  'image/jpeg', 'image/png', 'image/webp',
];

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

function formatDateBR(): string {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `${day}.${month}.${year}`;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const clientName = formData.get('clientName') as string | null;

    if (!file || !clientName) {
      return NextResponse.json(
        { error: 'Arquivo e nome do cliente são obrigatórios' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Tipo de arquivo não permitido: ${file.type}. Use PDF, áudio ou vídeo.` },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'Arquivo muito grande. Máximo: 100MB' },
        { status: 400 }
      );
    }

    // Find client folder
    const folderId = await findClientFolderId(session.accessToken, clientName);
    if (!folderId) {
      return NextResponse.json(
        { error: `Pasta do cliente "${clientName}" não encontrada no Google Drive` },
        { status: 404 }
      );
    }

    // Build new file name: NOME_CLIENTE_DD.MM.YYYY.ext
    const extension = file.name.split('.').pop() || 'pdf';
    const clientNameFormatted = clientName.toUpperCase().replace(/\s+/g, '_');
    const dateStr = formatDateBR();
    const newFileName = `${clientNameFormatted}_${dateStr}.${extension}`;

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Drive
    const uploadedFile = await uploadFileToDrive(
      session.accessToken,
      folderId,
      newFileName,
      buffer,
      file.type
    );

    return NextResponse.json({
      success: true,
      file: uploadedFile,
      message: `Arquivo "${newFileName}" enviado com sucesso!`,
    });

  } catch (err) {
    console.error('Upload error:', err);
    return NextResponse.json(
      { error: `Erro no upload: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
