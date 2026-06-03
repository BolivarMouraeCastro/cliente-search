import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

const PRAZOS_FOLDER_ID = '1waNdg9ME46yj2USnNNk4uTpqPOo8qgS8';

// Data de início: só contar a partir desta pasta
const DATA_INICIO = new Date(2026, 5, 8); // 08/06/2026 (mês é 0-indexed)

// Advogados fixos
const ADVOGADOS_FIXOS = ['ROBSON', 'ALESSANDRA', 'DENIS', 'JESSÉ', 'NYCOLLE', 'ANA', 'ERICA'];

interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
}

const isFolder = (item: DriveItem) => item.mimeType === 'application/vnd.google-apps.folder';

const TIPO_MAP: Record<string, string> = {
  'AIRR': 'Agravo de Instrumento em Recurso de Revista',
  'AI': 'Agravo de Instrumento',
  'RO': 'Recurso Ordinário',
  'RR': 'Recurso de Revista',
  'AP': 'Agravo de Petição',
  'ED': 'Embargos de Declaração',
  'CRRO': 'Contrarrazões de Recurso Ordinário',
  'CRRAP': 'Contrarrazões de Agravo de Petição',
  'CRRR': 'Contrarrazões de Recurso de Revista',
  'CR': 'Contrarrazões',
  'PI': 'Petição Inicial',
  'MS': 'Manifestação Simples',
  'MANIF': 'Manifestação Simples',
  'MANIFESTAÇÃO': 'Manifestação Simples',
  'MANIFESTACAO': 'Manifestação Simples',
  'IMP': 'Impugnação',
  'IMPUGNAÇÃO': 'Impugnação',
  'IMPUGNACAO': 'Impugnação',
  'REP': 'Réplica',
  'REPLICA': 'Réplica',
  'RÉPLICA': 'Réplica',
  'EXE': 'Execução / Cálculos',
  'CALC': 'Cálculos',
  'CONTESTAÇÃO': 'Contestação',
  'CONTESTACAO': 'Contestação',
  'CONTESTAÇÃO ED': 'Contestação de Embargos',
  'CONTESTACAO ED': 'Contestação de Embargos',
  'ADITAMENTO': 'Aditamento',
  'ACORDO': 'Acordo',
  'HABILITAÇÃO': 'Habilitação',
  'HABILITACAO': 'Habilitação',
};

const TIPO_KEYS = Object.keys(TIPO_MAP).sort((a, b) => b.length - a.length);

function parseFolderDate(folderName: string): Date | null {
  // Parse DD.MM.YYYY folder name
  const match = folderName.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(year, month - 1, day);
}

function parseFileName(fileName: string): { advogado: string | null; tipo: string; tipoAbrev: string; cliente: string } {
  let name = fileName.replace(/\.(docx?|pdf|odt|rtf)$/i, '').trim();

  // Check for lawyer name: "LAWYER corrigir TYPE_CLIENT" or "LAWYER_TYPE_CLIENT"
  let advogado: string | null = null;
  
  // Pattern 1: "NOME corrigir ..."
  const corrigirIdx = name.toLowerCase().indexOf(' corrigir ');
  if (corrigirIdx > 0) {
    const possibleName = name.substring(0, corrigirIdx).trim().toUpperCase();
    if (ADVOGADOS_FIXOS.includes(possibleName)) {
      advogado = possibleName;
      name = name.substring(corrigirIdx + ' corrigir '.length).trim();
    }
  }
  
  // Pattern 2: starts with "NOME_..." or "NOME ..."  
  if (!advogado) {
    for (const adv of ADVOGADOS_FIXOS) {
      if (name.toUpperCase().startsWith(adv + '_') || name.toUpperCase().startsWith(adv + ' ')) {
        advogado = adv;
        name = name.substring(adv.length).replace(/^[_ ]+/, '').trim();
        // Skip "corrigir" if present after name
        if (name.toLowerCase().startsWith('corrigir ')) {
          name = name.substring('corrigir '.length).trim();
        }
        break;
      }
    }
  }

  // Match filing type
  const nameUpper = name.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let tipoAbrev = '';
  let tipoFull = '';
  let clientePart = name;

  for (const key of TIPO_KEYS) {
    const keyNorm = key.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (nameUpper.startsWith(keyNorm + '_') || nameUpper.startsWith(keyNorm + ' ')) {
      tipoAbrev = key;
      tipoFull = TIPO_MAP[key];
      clientePart = name.substring(key.length).replace(/^[_ ]+/, '').trim();
      break;
    }
  }

  if (!tipoAbrev && name.includes('_')) {
    const firstUnderscore = name.indexOf('_');
    tipoAbrev = name.substring(0, firstUnderscore).trim();
    tipoFull = tipoAbrev;
    clientePart = name.substring(firstUnderscore + 1).trim();
  }

  if (!tipoAbrev) {
    tipoAbrev = 'OUTRO';
    tipoFull = 'Outros';
    clientePart = name;
  }

  return { advogado, tipo: tipoFull, tipoAbrev, cliente: clientePart.replace(/\s+/g, ' ').trim() };
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

    const token = session.accessToken;

    // List date folders
    const rootItems = await listChildren(token, PRAZOS_FOLDER_ID);
    const dateFolders = rootItems
      .filter(isFolder)
      .filter(f => {
        const d = parseFolderDate(f.name);
        return d && d >= DATA_INICIO; // Só a partir de 08/06/2026
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const allFilings: {
      advogado: string;
      tipo: string;
      tipoAbrev: string;
      cliente: string;
      data: string;
    }[] = [];

    // Process date folders in parallel batches
    const BATCH = 10;
    for (let i = 0; i < dateFolders.length; i += BATCH) {
      const batch = dateFolders.slice(i, i + BATCH);
      await Promise.all(batch.map(async (dateFolder) => {
        const children = await listChildren(token, dateFolder.id);
        const protocoloOk = children.find(c => isFolder(c) && c.name.toUpperCase().includes('PROTOCOLO OK'));
        if (!protocoloOk) return;

        const protocoloChildren = await listChildren(token, protocoloOk.id);
        const files = protocoloChildren.filter(c => !isFolder(c));

        const seen = new Set<string>();
        for (const file of files) {
          const baseName = file.name.replace(/\.(docx?|pdf|odt|rtf)$/i, '').trim().toUpperCase();
          if (seen.has(baseName)) continue;
          seen.add(baseName);

          const parsed = parseFileName(file.name);
          allFilings.push({
            advogado: parsed.advogado || 'Não identificado',
            tipo: parsed.tipo,
            tipoAbrev: parsed.tipoAbrev,
            cliente: parsed.cliente,
            data: dateFolder.name,
          });
        }
      }));
    }

    // Build response for each fixed lawyer
    const advogados = ADVOGADOS_FIXOS.map(nome => {
      const filings = allFilings.filter(f => f.advogado === nome);
      const tipoMap = new Map<string, { abrev: string; count: number; clientes: string[] }>();
      for (const f of filings) {
        if (!tipoMap.has(f.tipo)) tipoMap.set(f.tipo, { abrev: f.tipoAbrev, count: 0, clientes: [] });
        const t = tipoMap.get(f.tipo)!;
        t.count++;
        if (t.clientes.length < 50) t.clientes.push(`${f.cliente} (${f.data})`);
      }
      return {
        nome,
        total: filings.length,
        tipos: Array.from(tipoMap.entries())
          .sort((a, b) => b[1].count - a[1].count)
          .map(([tipoNome, data]) => ({ nome: tipoNome, abrev: data.abrev, count: data.count, clientes: data.clientes })),
      };
    });

    // Also include "Não identificado" if any unmatched files
    const naoId = allFilings.filter(f => f.advogado === 'Não identificado');
    if (naoId.length > 0) {
      const tipoMap = new Map<string, { abrev: string; count: number; clientes: string[] }>();
      for (const f of naoId) {
        if (!tipoMap.has(f.tipo)) tipoMap.set(f.tipo, { abrev: f.tipoAbrev, count: 0, clientes: [] });
        const t = tipoMap.get(f.tipo)!;
        t.count++;
        if (t.clientes.length < 50) t.clientes.push(`${f.cliente} (${f.data})`);
      }
      advogados.push({
        nome: 'Não identificado',
        total: naoId.length,
        tipos: Array.from(tipoMap.entries())
          .sort((a, b) => b[1].count - a[1].count)
          .map(([tipoNome, data]) => ({ nome: tipoNome, abrev: data.abrev, count: data.count, clientes: data.clientes })),
      });
    }

    return NextResponse.json({
      advogados,
      totalFilings: allFilings.length,
      totalDays: dateFolders.length,
      dataInicio: '08/06/2026',
    });

  } catch (err) {
    console.error('Comissoes error:', err);
    return NextResponse.json(
      { error: `Erro: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
