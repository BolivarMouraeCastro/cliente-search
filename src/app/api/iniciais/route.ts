// API route for Google Drive Iniciais pipeline — Optimized single-query approach

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

// ID da Pasta Mãe de Iniciais no Drive
const INICIAIS_FOLDER_ID = '1AFf7qFK2cYNPDmOJuAqVFfiqK2pmMBuZ';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  createdTime?: string;
}

/**
 * Single optimized query: fetch ALL files/folders that are descendants
 * of the root folder. Uses a broad query instead of recursive calls.
 */
async function listAllInFolder(accessToken: string, rootId: string): Promise<DriveFile[]> {
  // First, get direct children of the root
  const allFiles: DriveFile[] = [];
  const folderIds = [rootId];
  const processedIds = new Set<string>();

  // BFS: process max 3 levels deep (root → lawyers → statuses → clients)
  for (let depth = 0; depth < 4 && folderIds.length > 0; depth++) {
    const batchIds = folderIds.splice(0, folderIds.length);
    
    // Process folders in batches of 5 to stay fast
    const batchPromises = batchIds
      .filter(id => !processedIds.has(id))
      .map(async (folderId) => {
        processedIds.add(folderId);
        
        const params = new URLSearchParams({
          q: `'${folderId}' in parents and trashed = false`,
          fields: 'files(id, name, mimeType, parents, createdTime)',
          pageSize: '500',
        });

        try {
          const res = await fetch(
            `https://www.googleapis.com/drive/v3/files?${params}`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
              signal: AbortSignal.timeout(8000),
            }
          );

          if (!res.ok) return [];
          const data = await res.json();
          return (data.files || []) as DriveFile[];
        } catch {
          return [];
        }
      });

    const results = await Promise.all(batchPromises);
    for (const files of results) {
      for (const f of files) {
        allFiles.push(f);
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          folderIds.push(f.id);
        }
      }
    }
  }

  return allFiles;
}

const isFolder = (f: DriveFile) => f.mimeType === 'application/vnd.google-apps.folder';

// Status keywords
function classifyStatus(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.includes('iniciais') || lower.includes('para fazer')) return 'para_fazer';
  if (lower.includes('correção') || lower.includes('correcao') || lower.includes('correçao')) return 'correcao';
  if (lower.includes('refazer')) return 'refazer';
  return null;
}

interface StatusGroup {
  statusId: string;
  statusLabel: string;
  items: { name: string; id: string }[];
}

interface LawyerData {
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

    // Fetch everything in one BFS pass
    const allFiles = await listAllInFolder(session.accessToken, INICIAIS_FOLDER_ID);

    // Build parent→children map
    const childrenOf = new Map<string, DriveFile[]>();
    for (const f of allFiles) {
      const parentId = f.parents?.[0];
      if (!parentId) continue;
      if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
      childrenOf.get(parentId)!.push(f);
    }

    // Level 1: Lawyer folders (direct children of root)
    const lawyerFolders = (childrenOf.get(INICIAIS_FOLDER_ID) || []).filter(isFolder);

    if (lawyerFolders.length === 0) {
      return NextResponse.json({
        lawyers: [],
        totalGeral: 0,
        updatedAt: new Date().toISOString(),
        debug: `Pasta acessada com sucesso mas sem subpastas de advogados. Total de ${allFiles.length} itens encontrados.`,
      });
    }

    // Process each lawyer
    const lawyerResults: LawyerData[] = lawyerFolders.map((lawyer) => {
      const statusFolders = (childrenOf.get(lawyer.id) || []).filter(isFolder);
      const statuses: StatusGroup[] = [];
      let totalItems = 0;

      for (const sf of statusFolders) {
        const statusId = classifyStatus(sf.name);
        if (!statusId) continue;

        // Collect all items: direct children + sub-category children
        const items: { name: string; id: string }[] = [];
        const directChildren = childrenOf.get(sf.id) || [];

        for (const child of directChildren) {
          if (isFolder(child)) {
            // Sub-category folder (e.g., "1.1 R.I") — get its contents
            const subItems = childrenOf.get(child.id) || [];
            for (const sub of subItems) {
              items.push({ name: sub.name, id: sub.id });
            }
          } else {
            items.push({ name: child.name, id: child.id });
          }
        }

        totalItems += items.length;
        statuses.push({
          statusId,
          statusLabel: STATUS_LABELS[statusId] || sf.name,
          items,
        });
      }

      const ORDER = ['para_fazer', 'correcao', 'refazer'];
      statuses.sort((a, b) => ORDER.indexOf(a.statusId) - ORDER.indexOf(b.statusId));

      return { name: lawyer.name, folderId: lawyer.id, statuses, totalItems };
    });

    lawyerResults.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      lawyers: lawyerResults,
      totalGeral: lawyerResults.reduce((sum, l) => sum + l.totalItems, 0),
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Iniciais API error:', err);
    return NextResponse.json(
      { error: `Erro ao ler pasta do Drive: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
