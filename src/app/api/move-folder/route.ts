import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

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

    // Step 1: Find Alessandra's Folder
    const alessandraId = await findFolder(session.accessToken, 'ALESSANDRA', INICIAIS_ROOT_FOLDER_ID);
    if (!alessandraId) return NextResponse.json({ error: 'Pasta ALESSANDRA não encontrada' }, { status: 404 });

    // Step 2: Find "1.INICIAIS PARA FAZER" inside Alessandra
    const iniciaisFazerId = await findFolder(session.accessToken, 'INICIAIS PARA FAZER', alessandraId);
    if (!iniciaisFazerId) return NextResponse.json({ error: 'Pasta INICIAIS PARA FAZER não encontrada' }, { status: 404 });

    // Step 3: Find "CLIENTES URGENTES" inside Iniciais Para Fazer
    const urgentesId = await findFolder(session.accessToken, 'URGENTES', iniciaisFazerId);
    if (!urgentesId) return NextResponse.json({ error: 'Pasta CLIENTES URGENTES não encontrada' }, { status: 404 });

    // Step 4: Move the folder by changing its parents
    const updateUrl = `https://www.googleapis.com/drive/v3/files/${folderId}?addParents=${urgentesId}&removeParents=${BOLIVAR_FOLDER_ID}&supportsAllDrives=true`;
    
    const moveRes = await fetch(updateUrl, {
      method: 'PATCH',
      headers: { 
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!moveRes.ok) {
      const err = await moveRes.text();
      console.error('Error moving folder:', err);
      return NextResponse.json({ error: `Erro Google Drive: ${err}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, newParentId: urgentesId });

  } catch (error: any) {
    console.error('Move error:', error);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}
