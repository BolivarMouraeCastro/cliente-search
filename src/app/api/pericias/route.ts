import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getPericiaAccessToken } from '@/lib/admin-token';

export const dynamic = 'force-dynamic';

interface Pericia {
  data: string;
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

const MONTHS: Record<string, number> = {
  'janeiro': 1, 'fevereiro': 2, 'março': 3, 'marco': 3, 'abril': 4,
  'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8,
  'setembro': 9, 'outubro': 10, 'novembro': 11, 'dezembro': 12,
};

function extractDate(text: string): string | null {
  // Text format: "8 de julho de 2026", "30/06/2026 (terça-feira)"
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

  // Numeric: DD/MM/YYYY
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

function extractTime(text: string): string | null {
  // "15h30", "10h40"
  let match = text.match(/(\d{1,2})\s*h\s*(\d{2})/i);
  if (match) {
    const h = parseInt(match[1]), m = parseInt(match[2]);
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  // "10:40 horas", "08:00 horas"
  match = text.match(/(\d{1,2})[:\.](\d{2})\s*(?:h(?:oras?)?)?/i);
  if (match) {
    const h = parseInt(match[1]), m = parseInt(match[2]);
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  // "às 13h", "11h"
  match = text.match(/(\d{1,2})\s*h(?:oras?)?\b/i);
  if (match) {
    const h = parseInt(match[1]);
    if (h >= 6 && h <= 23) return `${String(h).padStart(2, '0')}:00`;
  }
  return null;
}

function extractProcesso(text: string): string | null {
  const match = text.match(/(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/);
  return match ? match[1] : null;
}

function extractReclamante(text: string): string | null {
  const patterns = [
    /reclamante[:\s]+([^\n\r]+)/i,
    /periciand[oa][:\s]+([^\n\r]+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let name = match[1].trim();
      // Remove trailing keywords
      name = name.replace(/\s*(reclamad|processo|local|data|hor[áa]rio|prezad).*/i, '').trim();
      if (name.length > 3) return name.substring(0, 80);
    }
  }
  return null;
}

function extractReclamada(text: string): string | null {
  const patterns = [
    /reclamad[oa]\(?s?\)?[:\s]+([^\n\r]+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let name = match[1].trim();
      name = name.replace(/\s*(prezad|reclamante|local|data|hor[áa]rio).*/i, '').trim();
      if (name.length > 3) return name.substring(0, 100);
    }
  }
  return null;
}

function extractPerito(text: string): string | null {
  const patterns = [
    /perito\s*(?:judicial)?[:\s,]+(?:dr\.?\s*|dra\.?\s*|eng\.?\s*|engenheiro\s*(?:de\s+\w+\s+(?:do\s+\w+)?)?[,\s]+)?([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõçA-ZÁÉÍÓÚÂÊÔÃÕÇ\s]+)/i,
    /([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõçA-ZÁÉÍÓÚÂÊÔÃÕÇ\s]+?)\s*[,\s]+(?:perito|engenheiro)/i,
    /(?:eng\.?\s+)([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõçA-ZÁÉÍÓÚÂÊÔÃÕÇ\s]+?)\s*[–\-]\s*perito/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const name = match[1].trim().replace(/\s+/g, ' ');
      if (name.length > 3 && name.split(' ').length >= 2 && name.split(' ').length <= 6) return name.substring(0, 60);
    }
  }
  return null;
}

function extractLocal(text: string): string | null {
  const patterns = [
    /local[:\s]+(?:INDIRETA\.?\s*)?([^\n\r]+)/i,
    /endere[çc]o[:\s]+([^\n\r]+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const local = match[1].trim();
      if (local.length > 5) return local.substring(0, 150);
    }
  }
  return null;
}

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
  } catch { return ''; }
}

function getHeaderValue(headers: any[], name: string): string {
  const h = headers?.find((h: any) => h.name?.toLowerCase() === name.toLowerCase());
  return h?.value || '';
}

function getEmailBody(payload: any): string {
  if (!payload) return '';
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
    console.error(`Gmail API error for ${endpoint}:`, res.status, err);
    throw new Error(`Gmail API error: ${res.status}`);
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
      return NextResponse.json({ pericias: [], error: error.message, debug: 'token_error' });
    }

    // Simple broad search - just look for pericia/perito keywords
    const searchQueries = [
      'perícia',
      'pericia', 
      'perito',
      'pericial',
      'diligência pericial',
    ];

    let allMessageIds: any[] = [];
    
    // Search with includeSpamTrash to catch spam emails
    for (const keyword of searchQueries) {
      try {
        const q = encodeURIComponent(keyword);
        const data = await gmailFetch(accessToken, `messages?q=${q}&maxResults=30&includeSpamTrash=true`);
        if (data.messages) {
          for (const msg of data.messages) {
            if (!allMessageIds.some(m => m.id === msg.id)) {
              allMessageIds.push(msg);
            }
          }
        }
      } catch (err) {
        console.error(`Search error for "${keyword}":`, err);
      }
    }

    if (allMessageIds.length === 0) {
      return NextResponse.json({ 
        pericias: [], 
        total: 0, 
        debug: 'no_messages_found',
        searchedKeywords: searchQueries,
      });
    }

    const pericias: Pericia[] = [];

    for (const msg of allMessageIds.slice(0, 80)) {
      if (!msg.id) continue;
      try {
        const fullMessage = await gmailFetch(accessToken, `messages/${msg.id}?format=full`);
        const headers = fullMessage.payload?.headers || [];
        const subject = getHeaderValue(headers, 'subject');
        const date = getHeaderValue(headers, 'date');
        const body = getEmailBody(fullMessage.payload);
        const fullText = `${subject}\n${body}`;

        // Must contain perícia keyword
        if (!/per[íi]cia|perito|pericial/i.test(fullText)) continue;

        const periciaDate = extractDate(body) || extractDate(subject);
        if (!periciaDate) continue;

        const pericia: Pericia = {
          data: periciaDate,
          horario: extractTime(body) || extractTime(subject) || '',
          reclamante: extractReclamante(fullText) || '',
          reclamada: extractReclamada(fullText) || '',
          processo: extractProcesso(fullText) || '',
          tipo: extractTipo(fullText),
          perito: extractPerito(fullText) || '',
          local: extractLocal(fullText) || '',
          emailSubject: subject.substring(0, 100),
          emailDate: date,
        };

        if (!pericia.reclamante) {
          pericia.reclamante = subject.substring(0, 60);
        }

        // Deduplicate
        const isDuplicate = pericias.some(p => {
          if (pericia.processo && p.processo === pericia.processo) return true;
          return p.data === pericia.data && p.reclamante === pericia.reclamante;
        });
        if (!isDuplicate) pericias.push(pericia);
      } catch (err) {
        console.error(`Error processing email ${msg.id}:`, err);
      }
    }

    // Sort by date
    pericias.sort((a, b) => {
      const [dA, mA, yA] = a.data.split('/').map(Number);
      const [dB, mB, yB] = b.data.split('/').map(Number);
      return new Date(yA, mA - 1, dA).getTime() - new Date(yB, mB - 1, dB).getTime();
    });

    return NextResponse.json({ 
      pericias, 
      total: pericias.length,
      emailsSearched: allMessageIds.length,
    });
  } catch (error: any) {
    console.error('Pericias API error:', error);
    return NextResponse.json({ error: error.message, pericias: [], debug: 'api_error' }, { status: 500 });
  }
}
