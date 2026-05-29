// API route for Google Drive Iniciais pipeline

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

// ID da Pasta Mãe de Iniciais no Drive
const INICIAIS_FOLDER_ID = '1AFf7qFK2cYNPDmOJuAqVFfiqK2pmMBuZ';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime?: string;
}

interface DriveListResponse {
  files: DriveFile[];
  nextPageToken?: string;
}

/**
 * List all items (files & folders) inside a given Drive folder.
 */
async function listFolder(accessToken: string, folderId: string): Promise<DriveFile[]> {
  const all: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, createdTime)',
      pageSize: '1000',
      orderBy: 'name',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Drive API error for folder ${folderId}:`, errText);
      return all;
    }

    const data: DriveListResponse = await res.json();
    all.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return all;
}

const isFolder = (f: DriveFile) => f.mimeType === 'application/vnd.google-apps.folder';

// Status categories we recognize in each lawyer's folder
const STATUS_MAP: Record<string, string> = {
  'iniciais': 'para_fazer',
  'para fazer': 'para_fazer',
  'correção': 'correcao',
  'correcao': 'correcao',
  'correçao': 'correcao',
  'refazer': 'refazer',
};

function classifyStatus(folderName: string): string | null {
  const lower = folderName.toLowerCase();
  for (const [keyword, status] of Object.entries(STATUS_MAP)) {
    if (lower.includes(keyword)) return status;
  }
  return null;
}

export interface StatusGroup {
  statusId: string;
  statusLabel: string;
  items: { name: string; id: string; createdTime?: string }[];
}

export interface LawyerData {
  name: string;
  folderId: string;
  statuses: StatusGroup[];
  totalItems: number;
}

const STATUS_LABELS: Record<string, string> = {
  para_fazer: '📥 Para Fazer',
  correcao: '🛠️ Correção',
  refazer: '♻️ Refazer',
};

export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const accessToken = session.accessToken;

    // Level 1: list lawyer folders
    const lawyerFolders = await listFolder(accessToken, INICIAIS_FOLDER_ID);

    // Debug: if no folders found, return diagnostic info
    if (lawyerFolders.length === 0) {
      return NextResponse.json({
        lawyers: [],
        totalGeral: 0,
        updatedAt: new Date().toISOString(),
        debug: `Nenhum item encontrado na pasta ${INICIAIS_FOLDER_ID}. Verifique se a conta logada tem acesso a essa pasta do Drive.`,
      });
    }

    const lawyers = lawyerFolders.filter(isFolder);

    // Process each lawyer in parallel
    const lawyerResults: LawyerData[] = await Promise.all(
      lawyers.map(async (lawyer) => {
        // Level 2: list status folders (1.INICIAIS, 2.CORREÇÃO, 3.REFAZER)
        const statusFolders = await listFolder(accessToken, lawyer.id);
        const statuses: StatusGroup[] = [];
        let totalItems = 0;

        for (const sf of statusFolders.filter(isFolder)) {
          const statusId = classifyStatus(sf.name);
          if (!statusId) continue; // skip unrecognized folders

          // Level 3: list items inside status folder (clients or sub-categories)
          const contents = await listFolder(accessToken, sf.id);
          
          // If sub-folders exist, go one level deeper and count their contents
          const items: { name: string; id: string; createdTime?: string }[] = [];
          
          for (const item of contents) {
            if (isFolder(item)) {
              // This is a sub-category (e.g., "1.1 R.I", "1.2 Prescrições")
              const subItems = await listFolder(accessToken, item.id);
              // Each item inside the sub-category is a client
              for (const sub of subItems) {
                items.push({
                  name: sub.name,
                  id: sub.id,
                  createdTime: sub.createdTime,
                });
              }
            } else {
              // Direct client file/folder at status level
              items.push({
                name: item.name,
                id: item.id,
                createdTime: item.createdTime,
              });
            }
          }

          totalItems += items.length;

          statuses.push({
            statusId,
            statusLabel: STATUS_LABELS[statusId] || sf.name,
            items,
          });
        }

        // Sort statuses: para_fazer first, then correcao, then refazer
        const ORDER = ['para_fazer', 'correcao', 'refazer'];
        statuses.sort((a, b) => ORDER.indexOf(a.statusId) - ORDER.indexOf(b.statusId));

        return {
          name: lawyer.name,
          folderId: lawyer.id,
          statuses,
          totalItems,
        };
      })
    );

    // Sort lawyers alphabetically
    lawyerResults.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      lawyers: lawyerResults,
      totalGeral: lawyerResults.reduce((sum, l) => sum + l.totalItems, 0),
      updatedAt: new Date().toISOString(),
      debug: `Encontrados ${lawyerFolders.length} itens na pasta raiz, ${lawyers.length} advogados.`,
    });
  } catch (err) {
    console.error('Iniciais API error:', err);
    return NextResponse.json(
      { error: `Erro ao ler pasta do Drive: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
