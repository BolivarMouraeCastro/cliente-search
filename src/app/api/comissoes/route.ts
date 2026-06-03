import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

const PRAZOS_FOLDER_ID = '1waNdg9ME46yj2USnNNk4uTpqPOo8qgS8';

interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
}

const isFolder = (item: DriveItem) => item.mimeType === 'application/vnd.google-apps.folder';

// Known filing type abbreviations in Brazilian labor law (claimant side)
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

// Sort keys by length (longest first) for greedy matching
const TIPO_KEYS = Object.keys(TIPO_MAP).sort((a, b) => b.length - a.length);

function parseFileName(fileName: string): { advogado: string | null; tipo: string; tipoAbrev: string; cliente: string } {
  // Remove file extension
  let name = fileName.replace(/\.(docx?|pdf|odt|rtf)$/i, '').trim();

  // Check if lawyer name is present: "LAWYER corrigir TYPE_CLIENT"
  let advogado: string | null = null;
  const corrigirIdx = name.toLowerCase().indexOf(' corrigir ');
  if (corrigirIdx > 0) {
    advogado = name.substring(0, corrigirIdx).trim();
    name = name.substring(corrigirIdx + ' corrigir '.length).trim();
  }

  // Try to match known type from the beginning of the name
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

  // If no known type matched, try splitting on first underscore
  if (!tipoAbrev && name.includes('_')) {
    const firstUnderscore = name.indexOf('_');
    tipoAbrev = name.substring(0, firstUnderscore).trim();
    tipoFull = tipoAbrev; // Use as-is
    clientePart = name.substring(firstUnderscore + 1).trim();
  }

  if (!tipoAbrev) {
    tipoAbrev = 'OUTRO';
    tipoFull = 'Outros';
    clientePart = name;
  }

  // Clean client name: remove " X EMPRESA" pattern for display
  const cliente = clientePart.replace(/\s+/g, ' ').trim();

  return { advogado, tipo: tipoFull, tipoAbrev, cliente };
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

    // Step 1: List date folders
    const rootItems = await listChildren(token, PRAZOS_FOLDER_ID);
    const dateFolders = rootItems.filter(isFolder).sort((a, b) => a.name.localeCompare(b.name));

    // Step 2: For each date folder, find PROTOCOLO OK, then list files
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
        
        // Get files directly in PROTOCOLO OK (not folders)
        const files = protocoloChildren.filter(c => !isFolder(c));
        
        // Deduplicate: keep unique by base name (ignore extension)
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

    // Step 3: Aggregate by advogado
    const advogadoMap = new Map<string, { total: number; tipos: Map<string, { abrev: string; count: number; clientes: string[] }> }>();

    for (const filing of allFilings) {
      if (!advogadoMap.has(filing.advogado)) {
        advogadoMap.set(filing.advogado, { total: 0, tipos: new Map() });
      }
      const adv = advogadoMap.get(filing.advogado)!;
      adv.total++;

      if (!adv.tipos.has(filing.tipo)) {
        adv.tipos.set(filing.tipo, { abrev: filing.tipoAbrev, count: 0, clientes: [] });
      }
      const tipo = adv.tipos.get(filing.tipo)!;
      tipo.count++;
      if (tipo.clientes.length < 50) {
        tipo.clientes.push(`${filing.cliente} (${filing.data})`);
      }
    }

    // Step 4: Format response
    const advogados = Array.from(advogadoMap.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .map(([nome, data]) => ({
        nome,
        total: data.total,
        tipos: Array.from(data.tipos.entries())
          .sort((a, b) => b[1].count - a[1].count)
          .map(([tipoNome, tipoData]) => ({
            nome: tipoNome,
            abrev: tipoData.abrev,
            count: tipoData.count,
            clientes: tipoData.clientes,
          })),
      }));

    // Step 5: Aggregate by tipo (global)
    const tipoGlobal = new Map<string, number>();
    for (const filing of allFilings) {
      tipoGlobal.set(filing.tipo, (tipoGlobal.get(filing.tipo) || 0) + 1);
    }

    return NextResponse.json({
      advogados,
      totalFilings: allFilings.length,
      totalDays: dateFolders.length,
      tiposGlobal: Array.from(tipoGlobal.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([nome, count]) => ({ nome, count })),
    });

  } catch (err) {
    console.error('Comissoes error:', err);
    return NextResponse.json(
      { error: `Erro: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
