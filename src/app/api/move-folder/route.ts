import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { addToLixeira } from '@/lib/lixeira';

const INICIAIS_ROOT_FOLDER_ID = '1AFf7qFK2cYNPDmOJuAqVFfiqK2pmMBuZ';
const BOLIVAR_FOLDER_ID = '10qkRpTzO4hwiR_QIFt_KlCT1Rw7KRKJh';

async function findFolder(accessToken: string, nameContains: string, parentId: string): Promise<string | null> {
  const safeName = nameContains.replace(/'/g, "\\'");
  const driveQuery = `'${parentId}' in parents and name contains '${safeName}' and trashed = false and mimeType = 'application/vnd.google-apps.folder'`;
  
  const params = new URLSearchParams({
    q: driveQuery,
    fields: 'files(id, name)',
    pageSize: '1',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true'
  });

  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) return null;
  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
}

async function getFolderInfo(accessToken: string, folderId: string) {
  const params = new URLSearchParams({
    fields: 'id, name',
    supportsAllDrives: 'true'
  });
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) return null;
  return await res.json();
}

async function createFolder(accessToken: string, name: string, parentId: string) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?supportsAllDrives=true`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name,
      parents: [parentId],
      mimeType: 'application/vnd.google-apps.folder'
    })
  });
  if (!res.ok) throw new Error('Failed to create folder: ' + await res.text());
  const data = await res.json();
  return data.id as string;
}

async function listItems(accessToken: string, folderId: string) {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType)',
    pageSize: '1000',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true'
  });
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error('Failed to list files: ' + await res.text());
  const data = await res.json();
  return data.files || [];
}

async function copyItem(accessToken: string, fileId: string, newParentId: string) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/copy?supportsAllDrives=true`, {
    method: 'POST',
    headers: { 
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      parents: [newParentId]
    })
  });
  if (!res.ok) throw new Error('Failed to copy item: ' + await res.text());
}

async function renameFolder(accessToken: string, folderId: string, oldName: string) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?supportsAllDrives=true`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: `[MOVIDO] ${oldName}` })
  });
  if (!res.ok) throw new Error('Failed to rename folder: ' + await res.text());
}

async function migrateRecursively(accessToken: string, sourceFolderId: string, targetParentId: string, sourceFolderName: string) {
  // 1. Create a new folder in the destination
  const newFolderId = await createFolder(accessToken, sourceFolderName, targetParentId);
  
  // 2. List items in the source folder
  const items = await listItems(accessToken, sourceFolderId);

  // 3. Loop and copy
  for (const item of items) {
    if (item.mimeType === 'application/vnd.google-apps.folder') {
      // Recurse subfolders
      await migrateRecursively(accessToken, item.id, newFolderId, item.name);
    } else {
      // Copy file
      await copyItem(accessToken, item.id, newFolderId);
    }
  }

  // 4. Mark as transferred in the Virtual Trash
  try {
    await addToLixeira(accessToken, sourceFolderId, sourceFolderName);
    // Optional: Still try to rename, but ignore if it fails
    await renameFolder(accessToken, sourceFolderId, sourceFolderName);
  } catch (err) {
    console.warn('Could not rename folder due to permissions:', err);
    // Continue even if rename fails, since copies and lixeira were successful.
  }
  return newFolderId;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { folderId } = await req.json();
    if (!folderId) {
      return NextResponse.json({ error: 'Falta o ID da pasta' }, { status: 400 });
    }

    // Step 1: Find destination folder paths
    const alessandraId = await findFolder(session.accessToken, 'ALESSANDRA', INICIAIS_ROOT_FOLDER_ID);
    if (!alessandraId) return NextResponse.json({ error: 'Pasta ALESSANDRA não encontrada' }, { status: 404 });

    const iniciaisFazerId = await findFolder(session.accessToken, 'INICIAIS PARA FAZER', alessandraId);
    if (!iniciaisFazerId) return NextResponse.json({ error: 'Pasta INICIAIS PARA FAZER não encontrada' }, { status: 404 });

    const urgentesId = await findFolder(session.accessToken, 'URGENTES', iniciaisFazerId);
    if (!urgentesId) return NextResponse.json({ error: 'Pasta CLIENTES URGENTES não encontrada' }, { status: 404 });

    // Step 2: Get the old folder's name
    const folderInfo = await getFolderInfo(session.accessToken, folderId);
    if (!folderInfo) return NextResponse.json({ error: 'Pasta original não encontrada' }, { status: 404 });
    const folderName = folderInfo.name;

    // Step 3: Start safe migration!
    const newParentId = await migrateRecursively(session.accessToken, folderId, urgentesId, folderName);

    return NextResponse.json({ success: true, newParentId });

  } catch (error: any) {
    console.error('Migration error:', error);
    return NextResponse.json({ error: `Erro Google Drive: ${error.message}` }, { status: 500 });
  }
}
