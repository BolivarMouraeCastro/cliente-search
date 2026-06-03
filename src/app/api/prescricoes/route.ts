import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getClients } from '@/lib/sheets';

const BOLIVAR_FOLDER_ID = '10qkRpTzO4hwiR_QIFt_KlCT1Rw7KRKJh';
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? '';

const EXCLUDED_FOLDERS = ['nao jogar', 'não jogar', 'nao mexer', 'não mexer', 'nova pasta', 'new folder', 'protocolo ok'];

interface DriveFolder {
  id: string;
  name: string;
}

// Parse DD/MM/YYYY string to Date
function parseBRDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;
  // Clean the string
  const cleaned = dateStr.trim();
  const parts = cleaned.split('/');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000) return null;
  return new Date(year, month - 1, day);
}

function formatDateBR(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function normalize(name: string): string {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function namesMatch(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  const partsA = na.split(' ');
  const partsB = nb.split(' ');
  if (partsA.length >= 2 && partsB.length >= 2) {
    if (partsA[0] === partsB[0] && partsA[partsA.length - 1] === partsB[partsB.length - 1]) {
      return true;
    }
  }
  return false;
}

const MONTH_NAMES: Record<string, string> = {
  '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
  '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
  '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro',
};

async function listBolivarFolders(token: string): Promise<DriveFolder[]> {
  const all: DriveFolder[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${BOLIVAR_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and not name contains '[MOVIDO]' and trashed = false`,
      fields: 'nextPageToken, files(id, name)',
      pageSize: '1000',
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

    const now = new Date();

    // Buscar planilha e pastas do Drive em paralelo
    const [driveFolders, allClients] = await Promise.all([
      listBolivarFolders(session.accessToken),
      getClients(session.accessToken, SPREADSHEET_ID)
    ]);

    // Filtrar pastas excluídas
    const validFolders = driveFolders.filter(f => {
      const lowerName = f.name.toLowerCase();
      return !EXCLUDED_FOLDERS.some(ex => lowerName.includes(ex));
    });

    // =================================================================
    // FONTE ÚNICA: Planilha ENTRADA DE PROCESSO
    // Lógica: demissão + 2 anos = prescrição bienal
    // O Drive NÃO é usado para calcular datas.
    // O Drive só é usado para encontrar o ID da pasta (botão de mover).
    // =================================================================

    const prescricaoList: {
      nome: string;
      empresa: string;
      demissao: string;
      prescricaoDate: Date;
      driveFolderId: string | null;
    }[] = [];

    for (const client of allClients) {
      // Somente clientes com status "BOLIVAR"
      const status = normalize(client.status);
      if (status !== 'bolivar') continue;

      // Pegar data de demissão da planilha
      const demissaoDate = parseBRDate(client.demissao);
      if (!demissaoDate) continue;

      // Prescrição bienal = demissão + 2 anos
      const prescDate = new Date(demissaoDate.getFullYear() + 2, demissaoDate.getMonth(), demissaoDate.getDate());
      
      // Só mostrar se ainda não prescreveu
      if (prescDate <= now) continue;

      // Encontrar pasta correspondente no Drive (apenas para o botão de mover)
      let matchingFolderId: string | null = null;
      for (const folder of validFolders) {
        if (namesMatch(client.nome, folder.name)) {
          matchingFolderId = folder.id;
          break;
        }
      }

      prescricaoList.push({
        nome: client.nome,
        empresa: client.empresa || '',
        demissao: client.demissao,
        prescricaoDate: prescDate,
        driveFolderId: matchingFolderId,
      });
    }

    // Agrupar por mês
    const monthsMap = new Map<string, typeof prescricaoList>();
    for (const entry of prescricaoList) {
      const m = String(entry.prescricaoDate.getMonth() + 1).padStart(2, '0');
      const y = entry.prescricaoDate.getFullYear();
      const monthKey = `${m}/${y}`;
      if (!monthsMap.has(monthKey)) monthsMap.set(monthKey, []);
      monthsMap.get(monthKey)!.push(entry);
    }

    // Ordenar meses cronologicamente
    const sortedMonths = Array.from(monthsMap.entries())
      .sort(([a], [b]) => {
        const [mA, yA] = a.split('/').map(Number);
        const [mB, yB] = b.split('/').map(Number);
        return yA !== yB ? yA - yB : mA - mB;
      })
      .map(([monthKey, clients]) => {
        const [m, y] = monthKey.split('/');
        return {
          month: monthKey,
          label: `${MONTH_NAMES[m] || m} ${y}`,
          clients: clients
            .sort((a, b) => a.prescricaoDate.getTime() - b.prescricaoDate.getTime())
            .map(c => ({
              nome: c.nome,
              empresa: c.empresa,
              demissao: c.demissao,
              prescricaoDate: formatDateBR(c.prescricaoDate),
              driveFolderId: c.driveFolderId,
              diasRestantes: Math.ceil((c.prescricaoDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
            })),
        };
      });

    return NextResponse.json({
      months: sortedMonths,
      totalPrescricoes: prescricaoList.length,
    });

  } catch (err) {
    console.error('Prescricoes error:', err);
    return NextResponse.json(
      { error: `Erro: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
