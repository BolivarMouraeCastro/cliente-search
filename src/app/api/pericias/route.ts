import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getPericiaAccessToken } from '@/lib/admin-token';

export const dynamic = 'force-dynamic';

interface Pericia {
  data: string; // DD/MM/YYYY
  horario: string;
  reclamante: string;
  reclamada: string;
  processo: string;
  tipo: string;
  perito: string;
  local: string;
  emailSubject: string;
  emailDate: string;
}

// Month name to number mapping
const MONTHS: Record<string, number> = {
  'janeiro': 1, 'fevereiro': 2, 'março': 3, 'marco': 3, 'abril': 4,
  'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8,
  'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12,
};

// Extract date - supports both DD/MM/YYYY and "8 de julho de 2026"
function extractDate(text: string): string | null {
  // Try text format first: "8 de julho de 2026", "22 de Junho de 2026", "07 de Julho 2026"
  const textDateRegex = /(\d{1,2})\s*(?:de\s+)?(\w+)\s*(?:de\s+)?(\d{4})/gi;
  let match;
  while ((match = textDateRegex.exec(text)) !== null) {
    const day = parseInt(match[1]);
    const monthName = match[2].toLowerCase();
    const year = parseInt(match[3]);
    if (MONTHS[monthName] && day >= 1 && day <= 31 && year >= 2024) {
      return `${String(day).padStart(2, '0')}/${String(MONTHS[monthName]).padStart(2, '0')}/${year}`;
    }
  }

  // Try numeric format: DD/MM/YYYY, DD.MM.YYYY, DD-MM-YYYY
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

// Extract time - supports "15h30", "13h", "10:40 horas", "08:00 horas", "11:00h", "às 13h"
function extractTime(text: string): string | null {
  // Pattern: 15h30, 10h40
  let match = text.match(/(\d{1,2})\s*h\s*(\d{2})/i);
  if (match) {
    const h = parseInt(match[1]), m = parseInt(match[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59)
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // Pattern: 10:40 horas, 08:00 horas, 11:00h
  match = text.match(/(\d{1,2})[:\.](\d{2})\s*(?:h|hora|horas)?/i);
  if (match) {
    const h = parseInt(match[1]), m = parseInt(match[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59)
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // Pattern: às 13h, 11h (whole hour)
  match = text.match(/(?:às?\s+)?(\d{1,2})\s*h(?:oras?)?\b/i);
  if (match) {
    const h = parseInt(match[1]);
    if (h >= 0 && h <= 23)
      return `${String(h).padStart(2, '0')}:00`;
  }

  return null;
}

// Extract process number: 1000471-34.2026.5.02.0025
function extractProcesso(text: string): string | null {
  const match = text.match(/(?:process?o\s*(?:n[ºo°]?\s*)?)?(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/i);
  return match ? match[1] : null;
}

// Extract reclamante - ALL CAPS or mixed case after "Reclamante:"
function extractReclamante(text: string): string | null {
  const patterns = [
    /reclamante[:\s]+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç\s]+?)(?:\n|$|reclamad|processo|local|data|hor[áa]rio)/i,
    /periciand[oa][:\s]+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç\s]+?)(?:\n|$)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const name = match[1].trim();
      if (name.length > 3) return name.substring(0, 80);
    }
  }
  return null;
}

// Extract reclamada
function extractReclamada(text: string): string | null {
  const patterns = [
    /reclamad[oa]\(?s?\)?[:\s]+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç\s&.,]+?)(?:\n|$|prezad|reclamante|local|data|hor[áa]rio)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const name = match[1].trim();
      if (name.length > 3) return name.substring(0, 100);
    }
  }
  return null;
}

// Extract perito name
function extractPerito(text: string): string | null {
  const patterns = [
    /perito\s*(?:judicial)?[:\s,]+(?:dr\.?\s*|dra\.?\s*|eng\.?\s*|engenheiro\s*)?([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç\s]+)/i,
    /([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç\s]+?)[,\s]+(?:perito|engenheiro|perita)/i,
    /(?:eng\.?\s+)([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç\s]+?)\s*[–\-]\s*perito/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const name = match[1].trim();
      if (name.length > 3 && name.split(' ').length <= 6) return name.substring(0, 60);
    }
  }
  return null;
}

// Extract local/address
function extractLocal(text: string): string | null {
  const patterns = [
    /local[:\s]+([^\n]+)/i,
    /endere[çc]o[:\s]+([^\n]+)/i,
    /(?:na|no)\s+(rua|av(?:enida)?|rod(?:ovia)?|alameda|travessa)\s+([^\n,]{5,})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const local = (match[0].startsWith('na ') || match[0].startsWith('no ')) 
        ? match[0].substring(3).trim() 
        : match[1].trim();
      if (local.length > 5) return local.substring(0, 120);
    }
  }
  return null;
}

// Detect type of perícia
function extractTipo(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('insalubridade') && lower.includes('periculosidade')) return 'Insalubridade/Periculosidade';
  if (lower.includes('insalubridade')) return 'Insalubridade';
  if (lower.includes('periculosidade')) return 'Periculosidade';
  if (lower.includes('médica') || lower.includes('medica')) return 'Perícia Médica';
  if (lower.includes('ortopédica') || lower.includes('ortopedica')) return 'Perícia Ortopédica';
  if (lower.includes('psiquiátrica') || lower.includes('psiquiatrica')) return 'Perícia Psiquiátrica';
  if (lower.includes('contábil') || lower.includes('contabil')) return 'Perícia Contábil';
  if (lower.includes('ergonômica') || lower.includes('ergonomica')) return 'Perícia Ergonômica';
  if (lower.includes('técnica') || lower.includes('tecnica')) return 'Perícia Técnica';
  if (lower.includes('diligência pericial') || lower.includes('diligencia pericial')) return 'Diligência Pericial';
  return 'Perícia';
}

function decodeBase64Url(data: string): string {
  try {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

function getHeaderValue(headers: any[], name: string): string {
  const h = headers?.find((h: any) => h.name?.toLowerCase() === name.toLowerCase());
  return h?.value || '';
}

function getEmailBody(payload: any): string {
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) return decodeBase64Url(part.body.data);
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return decodeBase64Url(part.body.data).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      }
    }
    for (const part of payload.parts) {
      if (part.parts) {
        const body = getEmailBody(part);
        if (body) return body;
      }
    }
  }
  return '';
}

async function gmailFetch(accessToken: string, endpoint: string) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${endpoint}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail API error: ${res.status} - ${err}`);
  }
  return res.json();
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    }

    let accessToken: string;
    try {
      accessToken = await getPericiaAccessToken();
    } catch (error: any) {
      console.error('Pericia token error:', error);
      return NextResponse.json({ pericias: [], error: 'Token de perícia não configurado' });
    }

    // Search keywords - broad to catch all formats
    const keywords = [
      'perícia', 'pericia', 'perito', 'pericial',
      'diligência pericial', 'diligencia pericial',
      'agendamento de perícia', 'agendamento de pericia',
      'agendar a perícia', 'agendar a pericia',
    ];
    const query = keywords.map(k => `"${k}"`).join(' OR ');
    
    // Search last 120 days, include spam and trash
    const afterDate = new Date();
    afterDate.setDate(afterDate.getDate() - 120);
    const afterStr = `${afterDate.getFullYear()}/${String(afterDate.getMonth() + 1).padStart(2, '0')}/${String(afterDate.getDate()).padStart(2, '0')}`;

    // Use in:anywhere to search in SPAM too
    const searchQuery = encodeURIComponent(`(${query}) after:${afterStr} in:anywhere`);
    
    let messageIds: any[] = [];
    try {
      const listData = await gmailFetch(accessToken, `messages?q=${searchQuery}&maxResults=100&includeSpamTrash=true`);
      messageIds = listData.messages || [];
    } catch (err) {
      console.error('Gmail search error:', err);
      return NextResponse.json({ pericias: [], error: 'Erro ao buscar emails' });
    }

    const pericias: Pericia[] = [];

    for (const msg of messageIds) {
      if (!msg.id) continue;
      try {
        const fullMessage = await gmailFetch(accessToken, `messages/${msg.id}?format=full`);
        const headers = fullMessage.payload?.headers || [];
        const subject = getHeaderValue(headers, 'subject');
        const date = getHeaderValue(headers, 'date');
        const body = getEmailBody(fullMessage.payload);
        const fullText = `${subject}\n${body}`;

        // Must contain perícia-related keyword
        const hasKeyword = /per[íi]cia|perito|pericial/i.test(fullText);
        if (!hasKeyword) continue;

        const periciaDate = extractDate(fullText);
        if (!periciaDate) continue;

        // Validate the date is not in the past (more than 7 days ago) - keep upcoming ones
        const [d, m, y] = periciaDate.split('/').map(Number);
        const pDate = new Date(y, m - 1, d);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const pericia: Pericia = {
          data: periciaDate,
          horario: extractTime(fullText) || '',
          reclamante: extractReclamante(fullText) || '',
          reclamada: extractReclamada(fullText) || '',
          processo: extractProcesso(fullText) || '',
          tipo: extractTipo(fullText),
          perito: extractPerito(fullText) || '',
          local: extractLocal(fullText) || '',
          emailSubject: subject.substring(0, 100),
          emailDate: date,
        };

        // Use subject as fallback for reclamante
        if (!pericia.reclamante) {
          pericia.reclamante = subject.substring(0, 60);
        }

        // Deduplicate by process number or by date+reclamante
        const isDuplicate = pericias.some(p => {
          if (pericia.processo && p.processo === pericia.processo) return true;
          return p.data === pericia.data && p.reclamante === pericia.reclamante;
        });
        if (!isDuplicate) pericias.push(pericia);
      } catch (err) {
        console.error(`Error processing pericia email ${msg.id}:`, err);
      }
    }

    // Sort by date ascending
    pericias.sort((a, b) => {
      const [dA, mA, yA] = a.data.split('/').map(Number);
      const [dB, mB, yB] = b.data.split('/').map(Number);
      return new Date(yA, mA - 1, dA).getTime() - new Date(yB, mB - 1, dB).getTime();
    });

    return NextResponse.json({ pericias, total: pericias.length });
  } catch (error: any) {
    console.error('Pericias API error:', error);
    return NextResponse.json({ error: error.message, pericias: [] }, { status: 500 });
  }
}
