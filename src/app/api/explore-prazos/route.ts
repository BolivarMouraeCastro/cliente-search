import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

const PRAZOS_FOLDER_ID = '1waNdg9ME46yj2USnNNk4uTpqPOo8qgS8';

interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
}

async function listChildren(token: string, folderId: string): Promise<DriveItem[]> {
  const all: DriveItem[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType)',
      pageSize: '500',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) break;
    const data = await res.json();
    all.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return all;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    // List root folders (date folders)
    const rootItems = await listChildren(session.accessToken, PRAZOS_FOLDER_ID);
    const folders = rootItems.filter(i => i.mimeType === 'application/vnd.google-apps.folder');
    
    // Take the 5 most recent folders and list their contents
    const sampleFolders = folders.slice(0, 5);
    const samples: { folder: string; files: string[] }[] = [];

    for (const folder of sampleFolders) {
      const children = await listChildren(session.accessToken, folder.id);
      samples.push({
        folder: folder.name,
        files: children.map(c => `${c.name} (${c.mimeType.includes('folder') ? 'PASTA' : 'ARQUIVO'})`),
      });
    }

    return NextResponse.json({
      totalFolders: folders.length,
      allFolderNames: folders.map(f => f.name).sort(),
      samples,
    });

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
