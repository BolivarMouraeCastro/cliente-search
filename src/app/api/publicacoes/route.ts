import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getDriveService } from '@/lib/google-auth';

const PUBLICACOES_FOLDER_ID = '14elDXNKAWZKHVEbMPREa9hVkAYgovCKB';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const accessToken = (session as any)?.accessToken;

    if (!accessToken) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const drive = getDriveService(accessToken);

    // Step 1: List subfolders (date folders like "25.06.2026") inside the parent folder
    const foldersResponse = await drive.files.list({
      q: `'${PUBLICACOES_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
      pageSize: 100,
      orderBy: 'name desc',
    });

    const dateFolders = foldersResponse.data.files || [];

    // Step 2: Also list PDFs directly in the parent folder (legacy/ungrouped)
    const directPdfsResponse = await drive.files.list({
      q: `'${PUBLICACOES_FOLDER_ID}' in parents and mimeType = 'application/pdf' and trashed = false`,
      fields: 'files(id, name, modifiedTime)',
      pageSize: 50,
      orderBy: 'modifiedTime desc',
    });

    const directPdfs = directPdfsResponse.data.files || [];

    // Step 3: For each date folder, list its PDFs
    const folders: {
      folderName: string;
      folderId: string;
      pdfs: { id: string; name: string; date: string; base64: string }[];
    }[] = [];

    for (const folder of dateFolders) {
      if (!folder.id || !folder.name) continue;

      const pdfResponse = await drive.files.list({
        q: `'${folder.id}' in parents and mimeType = 'application/pdf' and trashed = false`,
        fields: 'files(id, name, modifiedTime)',
        pageSize: 50,
        orderBy: 'name asc',
      });

      const pdfFiles = pdfResponse.data.files || [];
      const pdfs: { id: string; name: string; date: string; base64: string }[] = [];

      for (const file of pdfFiles) {
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

      if (pdfs.length > 0) {
        folders.push({
          folderName: folder.name,
          folderId: folder.id,
          pdfs,
        });
      }
    }

    // Step 4: If there are direct PDFs (not in date folders), add them as "Sem Pasta"
    if (directPdfs.length > 0) {
      const pdfs: { id: string; name: string; date: string; base64: string }[] = [];
      for (const file of directPdfs) {
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
      if (pdfs.length > 0) {
        folders.push({
          folderName: 'Sem Pasta',
          folderId: 'direct',
          pdfs,
        });
      }
    }

    // Sort folders by date (newest first) — parse folder name as dd.mm.yyyy
    folders.sort((a, b) => {
      if (a.folderName === 'Sem Pasta') return 1;
      if (b.folderName === 'Sem Pasta') return -1;
      const partsA = a.folderName.split('.');
      const partsB = b.folderName.split('.');
      if (partsA.length === 3 && partsB.length === 3) {
        const dateA = new Date(+partsA[2], +partsA[1] - 1, +partsA[0]);
        const dateB = new Date(+partsB[2], +partsB[1] - 1, +partsB[0]);
        return dateB.getTime() - dateA.getTime();
      }
      return b.folderName.localeCompare(a.folderName);
    });

    const totalPdfs = folders.reduce((sum, f) => sum + f.pdfs.length, 0);
    return NextResponse.json({ folders, total: totalPdfs });
  } catch (err) {
    console.error('Publicacoes API error:', err);
    return NextResponse.json(
      { error: `Erro ao acessar pasta do Drive: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
