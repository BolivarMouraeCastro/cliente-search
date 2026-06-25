import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getAllHearings } from '@/lib/hearings';
import { getEffectiveAccessToken, getPericiaAccessToken } from '@/lib/admin-token';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agenda — Returns ALL hearings + pericias.
 * Optional query param: advogado (filter by lawyer name)
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const accessToken = await getEffectiveAccessToken(session?.user?.email, (session as any)?.accessToken);
    if (!accessToken) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const advogadoFilter = searchParams.get('advogado')?.trim().toUpperCase() || '';

    let hearings = await getAllHearings(accessToken);

    if (advogadoFilter) {
      hearings = hearings.filter(
        (h) => h.advogado.toUpperCase().includes(advogadoFilter)
      );
    }

    hearings.sort((a, b) => {
      const dateA = parseDateForSort(a.dataAudiencia);
      const dateB = parseDateForSort(b.dataAudiencia);
      if (dateA !== dateB) return dateA - dateB;
      return (a.horario || '').localeCompare(b.horario || '');
    });

    const allHearings = await getAllHearings(accessToken);
    const advogados = [...new Set(allHearings.map((h) => h.advogado).filter(Boolean))].sort();

    // ===== PERÍCIAS: Fetch from periciajjs Gmail =====
    let pericias: any[] = [];
    let periciaDebug: any = {};
    try {
      const periciaResult = await fetchPericias();
      pericias = periciaResult.pericias;
      periciaDebug = { emailsSearched: periciaResult.emailsSearched, total: periciaResult.total };
    } catch (err) {
      console.error('Pericia fetch error in agenda:', err);
      // Diagnostic: check which env vars exist
      const envCheck = {
        PERICIA_REFRESH_TOKEN: !!process.env.PERICIA_REFRESH_TOKEN,
        PERICIA_REFRESH_TOKEN_length: process.env.PERICIA_REFRESH_TOKEN?.length || 0,
        PERICIA_REFRESH_TOKEN_start: process.env.PERICIA_REFRESH_TOKEN?.substring(0, 8) || 'MISSING',
        ADMIN_REFRESH_TOKEN: !!process.env.ADMIN_REFRESH_TOKEN,
        GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
        allEnvKeys: Object.keys(process.env).filter(k => k.includes('PERICIA') || k.includes('ADMIN') || k.includes('GOOGLE')).sort(),
      };
      periciaDebug = { error: err instanceof Error ? err.message : String(err), envCheck };
    }

    return NextResponse.json({
      hearings,
      advogados,
      total: hearings.length,
      pericias,
      periciaDebug,
    });
  } catch (err) {
    console.error('Agenda error:', err);
    return NextResponse.json(
      { error: `Erro: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}

function parseDateForSort(dateStr: string): number {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return 0;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  return year * 10000 + month * 100 + day;
}

// ===== PERÍCIA LOGIC =====

const MONTHS: Record<string, number> = {
  'janeiro': 1, 'fevereiro': 2, 'março': 3, 'marco': 3, 'abril': 4,
  'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8,
  'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12,
};

function extractPericiaDate(text: string): string | null {
  const textDateRegex = /(\d{1,2})\s+de\s+(\w+)\s+(?:de\s+)?(\d{4})/gi;
  let match;
  while ((match = textDateRegex.exec(text)) !== null) {
    const day = parseInt(match[1]);
    const monthName = match[2].toLowerCase();
    const year = parseInt(match[3]);
    if (MONTHS[monthName] && day >= 1 && day <= 31 && year >= 2024) {
      return `${String(day).padStart(2, '0')}/${String(MONTHS[monthName]).padStart(2, '0')}/${year}`;
    }
  }
  const numericRegex = /(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})/g;
  while ((match = numericRegex.exec(text)) !== null) {
    const day = parseInt(match[1]);
    const month = parseInt(match[2]);
    const year = parseInt(match[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2024) {
      return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
    }
  }
  return null;
}

function extractPericiaTime(text: string): string | null {
  let match = text.match(/(\d{1,2})\s*h\s*(\d{2})/i);
  if (match) { const h = parseInt(match[1]); if (h <= 23) return `${String(h).padStart(2, '0')}:${match[2]}`; }
  match = text.match(/(\d{1,2})[:\.](\d{2})\s*(?:h(?:oras?)?)?/i);
  if (match) { const h = parseInt(match[1]); if (h <= 23) return `${String(h).padStart(2, '0')}:${match[2]}`; }
  match = text.match(/(\d{1,2})\s*h(?:oras?)?\b/i);
  if (match) { const h = parseInt(match[1]); if (h >= 6 && h <= 23) return `${String(h).padStart(2, '0')}:00`; }
  return null;
}

function extractField(text: string, ...patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]?.trim().length > 3) return match[1].trim().substring(0, 100);
  }
  return null;
}

function extractTipo(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('insalubridade') && lower.includes('periculosidade')) return 'Insalubridade/Periculosidade';
  if (lower.includes('insalubridade')) return 'Insalubridade';
  if (lower.includes('periculosidade')) return 'Periculosidade';
  if (lower.includes('médica') || lower.includes('medica')) return 'Perícia Médica';
  if (lower.includes('técnica') || lower.includes('tecnica')) return 'Perícia Técnica';
  if (lower.includes('diligência pericial')) return 'Diligência Pericial';
  return 'Perícia';
}

function decodeBase64Url(data: string): string {
  try { return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8'); }
  catch { return ''; }
}

function getHeaderVal(headers: any[], name: string): string {
  return headers?.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
}

function getBody(payload: any): string {
  if (!payload) return '';
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  if (payload.parts) {
    for (const p of payload.parts) if (p.mimeType === 'text/plain' && p.body?.data) return decodeBase64Url(p.body.data);
    for (const p of payload.parts) if (p.mimeType === 'text/html' && p.body?.data) return decodeBase64Url(p.body.data).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
    for (const p of payload.parts) if (p.parts) { const b = getBody(p); if (b) return b; }
  }
  return '';
}

async function gmailGet(token: string, endpoint: string) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchPericias(): Promise<{ pericias: any[], emailsSearched: number, total: number }> {
  const token = await getPericiaAccessToken();

  const keywords = ['perícia', 'pericia', 'perito', 'pericial', 'diligência pericial'];
  const allIds = new Map<string, boolean>();
  
  for (const kw of keywords) {
    try {
      const data = await gmailGet(token, `messages?q=${encodeURIComponent(kw)}&maxResults=30&includeSpamTrash=true`);
      for (const msg of (data.messages || [])) allIds.set(msg.id, true);
    } catch (e) { console.error(`Gmail search "${kw}":`, e); }
  }

  const pericias: any[] = [];
  const ids = [...allIds.keys()];

  for (const id of ids.slice(0, 60)) {
    try {
      const msg = await gmailGet(token, `messages/${id}?format=full`);
      const headers = msg.payload?.headers || [];
      const subject = getHeaderVal(headers, 'subject');
      const emailDate = getHeaderVal(headers, 'date');
      const body = getBody(msg.payload);
      const fullText = `${subject}\n${body}`;

      if (!/per[íi]cia|perito|pericial/i.test(fullText)) continue;

      const data = extractPericiaDate(body) || extractPericiaDate(subject);
      if (!data) continue;

      const pericia = {
        data,
        horario: extractPericiaTime(body) || extractPericiaTime(subject) || '',
        reclamante: extractField(fullText, /reclamante[:\s]+([^\n\r]+)/i, /periciand[oa][:\s]+([^\n\r]+)/i) || subject.substring(0, 60),
        reclamada: extractField(fullText, /reclamad[oa]\(?s?\)?[:\s]+([^\n\r]+)/i) || '',
        processo: fullText.match(/(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/)?.[1] || '',
        tipo: extractTipo(fullText),
        perito: extractField(fullText,
          /(?:eng\.?\s+)([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõçA-Z\s]+?)\s*[–\-]\s*perito/i,
          /perito\s*(?:judicial)?[:\s,]+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõçA-Z\s]+)/i,
        ) || '',
        local: extractField(fullText, /local[:\s]+(?:INDIRETA\.?\s*)?([^\n\r]+)/i, /endere[çc]o[:\s]+([^\n\r]+)/i) || '',
        emailSubject: subject.substring(0, 100),
        emailDate,
      };

      // Clean reclamante (remove trailing keywords)
      pericia.reclamante = pericia.reclamante.replace(/\s*(reclamad|processo|local|data|hor[áa]rio|prezad).*/i, '').trim();
      if (pericia.reclamada) pericia.reclamada = pericia.reclamada.replace(/\s*(prezad|reclamante|local|data|hor[áa]rio).*/i, '').trim();

      const isDup = pericias.some(p => (pericia.processo && p.processo === pericia.processo) || (p.data === pericia.data && p.reclamante === pericia.reclamante));
      if (!isDup) pericias.push(pericia);
    } catch (e) { console.error(`Pericia email ${id}:`, e); }
  }

  pericias.sort((a, b) => {
    const [dA, mA, yA] = a.data.split('/').map(Number);
    const [dB, mB, yB] = b.data.split('/').map(Number);
    return new Date(yA, mA - 1, dA).getTime() - new Date(yB, mB - 1, dB).getTime();
  });

  return { pericias, emailsSearched: ids.length, total: pericias.length };
}
