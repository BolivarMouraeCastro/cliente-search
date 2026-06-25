import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getAllHearings } from '@/lib/hearings';
import { getEffectiveAccessToken, getPericiaAccessToken } from '@/lib/admin-token';
import { getAllPericiasFromSheet } from '@/lib/pericias-sheet';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agenda — Returns ALL hearings + pericias.
 * Perícias come primarily from the PERICIA spreadsheet tab.
 * Email data is used as secondary enrichment.
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

    // ===== PERÍCIAS: Primary from spreadsheet, enriched with email =====
    let pericias: any[] = [];
    let periciaDebug: any = {};
    try {
      // 1. Load from spreadsheet (primary source - reliable data)
      const sheetResult = await getAllPericiasFromSheet(accessToken);
      
      // Filter to only recent + future perícias (last 3 months + all future)
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      threeMonthsAgo.setHours(0, 0, 0, 0);
      
      const relevantPericias = sheetResult.pericias.filter(p => {
        if (!p.data) return false;
        const parts = p.data.split('/');
        if (parts.length !== 3) return false;
        const d = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        return d >= threeMonthsAgo;
      });

      const sheetPericias = relevantPericias.map(p => ({
        data: p.data,
        horario: p.horario,
        reclamante: p.reclamante,
        reclamada: p.reclamada,
        processo: p.processo,
        tipo: p.tipo || 'Perícia',
        perito: p.perito,
        local: p.local,
        advogado: p.advogado,
        observacao: p.observacao,
        source: 'planilha' as const,
      }));

      // 2. Load from BOTH email accounts for enrichment
      let emailPericias: any[] = [];
      let emailDebug: any = {};
      
      // 2a. Search advogadosjjs@gmail.com (admin token)
      try {
        const adminResult = await fetchPericias(accessToken);
        emailPericias.push(...adminResult.pericias);
        emailDebug.advogados = { searched: adminResult.emailsSearched, found: adminResult.total };
      } catch (err) {
        emailDebug.advogadosError = err instanceof Error ? err.message : String(err);
      }

      // 2b. Search periciajjs@gmail.com (pericia token)
      try {
        const periciaToken = await getPericiaAccessToken();
        const periciaResult = await fetchPericias(periciaToken);
        // Add only emails not already found via admin account
        for (const ep of periciaResult.pericias) {
          const isDup = emailPericias.some(existing =>
            (ep.processo && existing.processo && ep.processo === existing.processo) ||
            (ep.data === existing.data && ep.reclamante === existing.reclamante)
          );
          if (!isDup) emailPericias.push(ep);
        }
        emailDebug.pericia = { searched: periciaResult.emailsSearched, found: periciaResult.total };
      } catch (err) {
        emailDebug.periciaError = err instanceof Error ? err.message : String(err);
      }

      periciaDebug.emailsTotal = emailPericias.length;
      periciaDebug.emailDebug = emailDebug;

      // 3. Merge: mark entries found in both sources as 'ambas'
      // First, check which sheet entries also exist in email
      pericias = sheetPericias.map(sp => {
        const inEmail = emailPericias.some(ep => 
          (sp.processo && ep.processo && sp.processo === ep.processo) ||
          (sp.data === ep.data && sp.reclamante && ep.reclamante && 
           sp.reclamante.toLowerCase().includes(ep.reclamante.substring(0, 10).toLowerCase()))
        );
        return { ...sp, source: inEmail ? 'ambas' as const : 'planilha' as const };
      });
      
      // Add email-only entries that don't exist in sheet
      const sheetProcessos = new Set(sheetPericias.map(p => p.processo).filter(Boolean));
      for (const ep of emailPericias) {
        const matchesSheet = (ep.processo && sheetProcessos.has(ep.processo)) ||
          pericias.some(p => p.data === ep.data && p.reclamante === ep.reclamante);
        
        if (!matchesSheet) {
          pericias.push({ ...ep, source: 'email' });
        }
      }

      // Sort by date
      pericias.sort((a, b) => {
        const [dA, mA, yA] = (a.data || '').split('/').map(Number);
        const [dB, mB, yB] = (b.data || '').split('/').map(Number);
        const timeA = new Date(yA || 0, (mA || 1) - 1, dA || 1).getTime();
        const timeB = new Date(yB || 0, (mB || 1) - 1, dB || 1).getTime();
        if (timeA !== timeB) return timeA - timeB;
        return (a.horario || '').localeCompare(b.horario || '');
      });

      periciaDebug.sheetTotal = sheetPericias.length;
      periciaDebug.mergedTotal = pericias.length;
      periciaDebug.columns = sheetResult.columnMap;
      periciaDebug.headers = sheetResult.headers;
      periciaDebug.sheetDebug = sheetResult.debug;

    } catch (err) {
      console.error('Pericia fetch error in agenda:', err);
      periciaDebug = { error: err instanceof Error ? err.message : String(err) };
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
  // Only extract time from labeled fields, NOT random times in the text
  const patterns = [
    // "Horário: 15h30" or "Horário: 08:00 horas"
    /hor[áa]rio[:\s]+(\d{1,2})\s*h\s*(\d{2})/i,
    /hor[áa]rio[:\s]+(\d{1,2})[:\.](\d{2})\s*(?:h(?:oras?)?)?/i,
    /hor[áa]rio[:\s]+(\d{1,2})\s*h(?:oras?)?\b/i,
    // "às 13h", "às 10:40 horas" (with context)
    /[àa]s\s+(\d{1,2})\s*h\s*(\d{2})/i,
    /[àa]s\s+(\d{1,2})[:\.](\d{2})\s*(?:h(?:oras?)?)?/i,
    /[àa]s\s+(\d{1,2})\s*h(?:oras?)?\b/i,
    // "ter início às 10:40"
    /in[íi]cio\s+[àa]s?\s+(\d{1,2})[:\.](\d{2})/i,
    /in[íi]cio\s+[àa]s?\s+(\d{1,2})\s*h\s*(\d{2})/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const h = parseInt(match[1]);
      const m = match[2] ? parseInt(match[2]) : 0;
      if (h >= 6 && h <= 20) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
    }
  }
  return null;
}

function isValidPersonName(text: string): boolean {
  // Must have 2+ words, no verbs/common junk words, mostly capitalized words
  const words = text.trim().split(/\s+/);
  if (words.length < 2 || words.length > 8) return false;
  if (text.length < 5 || text.length > 80) return false;
  // Reject if contains common non-name words
  const junkWords = /\b(usar|vestimenta|adequad|comunique|informar|confirma|prezad|agendamento|designa[çc]|processo|per[íi]cia|reclamad|favor|solicito|encaminh|dever[áa]|autos|assist[êe]nte|t[ée]cnic|segue|import|lembrete|documenta|recebimento|acompanhamento|franquear|acesso|local|poderemos|participar)\b/i;
  if (junkWords.test(text)) return false;
  // Most words should start with uppercase
  const capitalWords = words.filter(w => /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(w));
  if (capitalWords.length < words.length * 0.5) return false;
  return true;
}

function extractReclamante(text: string): string | null {
  const patterns = [
    // "RECLAMANTE: NOME COMPLETO" or "Reclamante: Nome" (labeled, any case)
    /reclamante[:\s]+([^\n\r,;]{5,80})/i,
    // "Periciando(a): NOME"
    /periciand[oa][:\s]+([^\n\r,;]{5,80})/i,
    // "Autor(a): NOME"
    /autor(?:a)?[:\s]+([^\n\r,;]{5,80})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let name = match[1].trim();
      // Remove trailing junk after the name
      name = name.replace(/\s*(reclamad|processo|local|data|hor[áa]rio|prezad|vs\b|n[ºo°]|CPF|RG|CTPS|peri[ct]).*/i, '').trim();
      name = name.replace(/\.+$/, '').trim();
      if (isValidPersonName(name)) return name.substring(0, 80);
    }
  }
  return null;
}

function extractReclamada(text: string): string | null {
  const patterns = [
    /reclamad[oa]\(?s?\)?[:\s]+([^\n\r]{5,})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let name = match[1].trim();
      // Cut at common stop words
      name = name.replace(/\s*(prezad|reclamante|local|data|hor[áa]rio|venho|comunic|conforme|processo|solicito|per[íi]cia|perit|favor|confirmar|informo|segue|dever|encaminh|CONFIRMAR).*/i, '').trim();
      name = name.replace(/^[-\s*]+/, '').replace(/[.\s]+$/, '').trim();
      if (name.length > 3 && name.length < 200) return name.substring(0, 120);
    }
  }
  return null;
}

function extractPerito(text: string): string | null {
  const patterns = [
    // "Eng. Ricardo Grimaldi Barbosa – Perito Judicial"  
    /(?:eng[ºo]?\.?\s+)([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+(?:\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+){1,4})\s*[–\-,]\s*perito/i,
    // "Perito Judicial: Dr. NOME" or "Perito: NOME" — name must look like a real name
    /perito\s*(?:judicial|nomeado)?[:\s,]+(?:dr\.?\s*|dra\.?\s*|eng[ºo]?\.?\s*)?([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+(?:\s+(?:d[aeo]s?\s+)?[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+){1,5})/i,
    // "NOME, perito nomeado"
    /([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+(?:\s+(?:d[aeo]s?\s+)?[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+){1,4})\s*,\s*(?:engenheiro|perit[oa])/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let name = match[1].trim().replace(/\s+/g, ' ');
      // Validate looks like a real person name
      if (name.length > 5 && name.split(' ').length >= 2 && name.split(' ').length <= 6) {
        if (!/CREA|OAB|ser[áa]|por[ée]m|favor|exatamente|condi[çc][õo]es|n[ãa]o|reconhecer|Judicial|Assistente/i.test(name)) {
          return name.substring(0, 60);
        }
      }
    }
  }
  return null;
}

function extractLocal(text: string): string | null {
  const patterns = [
    // "Local da perícia: ..." or "Local: Rua..."
    /local\s+(?:da\s+)?per[íi]cia[:\s]+([^\n\r]{10,})/i,
    /local[:\s]+([^\n\r]{10,})/i,
    // "Endereço: ..."
    /endere[çc]o[:\s]+([^\n\r]{10,})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let local = match[1].trim();
      // Must look like an address
      if (/rua|av[.e]|avenida|rod|alameda|pra[çc]a|km|n[ºo°]|bairro|cep|centro|\d{3,}|são|santo|bernardo/i.test(local)) {
        local = local.replace(/\s*(solicito|dever[áa]|cabe|esclarec|qualquer|favor|por\s+gentileza|prezad).*/i, '').trim();
        if (local.length > 10) return local.substring(0, 150);
      }
    }
  }
  return null;
}

function extractFromSubject(subject: string): { reclamante: string, processo: string } {
  let reclamante = '';
  let processo = '';
  
  const procMatch = subject.match(/(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/);
  if (procMatch) processo = procMatch[1];
  
  // Try to extract reclamante from subject patterns
  const subPatterns = [
    // "RECLAMANTE: NOME" in subject
    /reclamante[:\s]+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ\s.]+?)(?:\s*[-–]|\s*$)/i,
    // "PERÍCIA ... / NOME - processo" 
    /per[íi]cia[^/\n]*\/\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]+?)(?:\s*[-–]\s*\d|\s*$)/i,
    // "RECLAMANTE: NOME" anywhere after process number
    /\d{4}\s+RECLAMANTE[:\s]+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ\s.]+?)(?:\s*[-–,]|\s*RECLAMAD|\s*$)/i,
    // "Processo... RECLAMANTE: NOME"
    /RECLAMANTE[:\s]+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]+?)(?:\s*RECLAMAD|\s*$)/i,
  ];
  for (const p of subPatterns) {
    const m = subject.match(p);
    if (m && m[1].trim().length > 3) {
      const candidate = m[1].trim().replace(/\s+DOS\s*$|\.+$/i, '').trim();
      if (candidate.split(/\s+/).length >= 2) {
        reclamante = candidate;
        break;
      }
    }
  }
  
  return { reclamante, processo };
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

async function fetchPericias(adminToken: string): Promise<{ pericias: any[], emailsSearched: number, total: number }> {
  // Use admin token (advogadosjjs@gmail.com) to search for perícia emails
  const token = adminToken;

  // Single broad query to get ALL perícia-related emails with pagination
  const query = 'subject:(perícia OR pericia OR perito OR pericial OR "diligência pericial" OR agendamento)';
  const allIds = new Map<string, boolean>();
  
  // Paginate through results to get ALL matching emails
  let pageToken = '';
  for (let page = 0; page < 10; page++) {
    try {
      const url = `messages?q=${encodeURIComponent(query)}&maxResults=100&includeSpamTrash=true${pageToken ? `&pageToken=${pageToken}` : ''}`;
      const data = await gmailGet(token, url);
      for (const msg of (data.messages || [])) allIds.set(msg.id, true);
      
      if (data.nextPageToken) {
        pageToken = data.nextPageToken;
      } else {
        break; // No more pages
      }
    } catch (e) { 
      console.error(`Gmail search page ${page}:`, e); 
      break;
    }
  }

  // Also search body content for emails that might not have perícia in subject
  const bodyQuery = 'agendamento perícia';
  try {
    const data = await gmailGet(token, `messages?q=${encodeURIComponent(bodyQuery)}&maxResults=100&includeSpamTrash=true`);
    for (const msg of (data.messages || [])) allIds.set(msg.id, true);
  } catch (e) { console.error('Gmail body search:', e); }

  const pericias: any[] = [];
  const ids = [...allIds.keys()];

  // Process ALL found emails (batch in parallel for speed)
  const batchSize = 10;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (id) => {
        const msg = await gmailGet(token, `messages/${id}?format=full`);
        const headers = msg.payload?.headers || [];
        const subject = getHeaderVal(headers, 'subject');
        const emailDate = getHeaderVal(headers, 'date');
        const body = getBody(msg.payload);
        const fullText = `${subject}\n${body}`;

        if (!/per[íi]cia|perito|pericial|agendamento/i.test(fullText)) return null;

        const data = extractPericiaDate(body) || extractPericiaDate(subject);
        if (!data) return null;

        const subjectInfo = extractFromSubject(subject);

        const pericia = {
          data,
          horario: extractPericiaTime(body) || '',
          reclamante: extractReclamante(body) || extractReclamante(subject) || subjectInfo.reclamante || '',
          reclamada: extractReclamada(body) || '',
          processo: fullText.match(/(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/)?.[1] || subjectInfo.processo || '',
          tipo: extractTipo(fullText),
          perito: extractPerito(body) || '',
          local: extractLocal(body) || '',
          emailSubject: subject.substring(0, 100),
          emailDate,
        };

        // If no reclamante found, try to get a clean name from subject
        if (!pericia.reclamante) {
          let cleanSubject = subject.replace(/^(Re:|Fwd:|Fw:|RE:|FW:|RES:)\s*/gi, '').trim();
          cleanSubject = cleanSubject.replace(/agendamento\s+de\s+(?:per[íi]cia|dilig[êe]ncia)\s*(?:t[ée]cnica|pericial|judicial)?/gi, '').trim();
          cleanSubject = cleanSubject.replace(/designa[çc][ãa]o\s+de\s+per[íi]cia\s*(?:t[ée]cnica|pericial|judicial)?/gi, '').trim();
          cleanSubject = cleanSubject.replace(/notifica[çc][ãa]o\s+de\s+agendamento[^-–]*/gi, '').trim();
          cleanSubject = cleanSubject.replace(/\(?IMPORT[AÂ]NTE\)?\s*/gi, '').trim();
          cleanSubject = cleanSubject.replace(/^[\s\-–|/:.]+|[\s\-–|/:.]+$/g, '').trim();
          // Remove process number from what remains
          cleanSubject = cleanSubject.replace(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g, '').trim();
          cleanSubject = cleanSubject.replace(/(?:PROCESSO|Proc\.?|Processo)\s*[_:\s]?\s*\d+/gi, '').trim();
          cleanSubject = cleanSubject.replace(/^[\s\-–|/:.]+|[\s\-–|/:.]+$/g, '').trim();
          
          // Only use if it looks like a valid name
          if (cleanSubject && isValidPersonName(cleanSubject)) {
            pericia.reclamante = cleanSubject.substring(0, 60);
          } else if (pericia.processo) {
            pericia.reclamante = `Proc. ${pericia.processo}`;
          } else {
            pericia.reclamante = subject.substring(0, 50).replace(/^(Re:|RE:|RES:)\s*/gi, '').trim();
          }
        }

        return pericia;
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        const pericia = result.value;
        const isDup = pericias.some(p => 
          (pericia.processo && p.processo === pericia.processo) || 
          (p.data === pericia.data && p.reclamante === pericia.reclamante)
        );
        if (!isDup) pericias.push(pericia);
      }
    }
  }

  pericias.sort((a, b) => {
    const [dA, mA, yA] = a.data.split('/').map(Number);
    const [dB, mB, yB] = b.data.split('/').map(Number);
    return new Date(yA, mA - 1, dA).getTime() - new Date(yB, mB - 1, dB).getTime();
  });

  return { pericias, emailsSearched: ids.length, total: pericias.length };
}
