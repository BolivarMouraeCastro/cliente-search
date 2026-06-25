import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getPericiaAccessToken } from '@/lib/admin-token';

export const dynamic = 'force-dynamic';

interface Pericia {
  data: string;
  horario: string;
  reclamante: string;
  tipo: string;
  perito: string;
  emailSubject: string;
  emailDate: string;
}

// Extract date in DD/MM/YYYY format
function extractDate(text: string): string | null {
  const regex = /(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})/g;
  const matches = [...text.matchAll(regex)];
  for (const match of matches) {
    const day = parseInt(match[1]);
    const month = parseInt(match[2]);
    let year = parseInt(match[3]);
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2024) {
      return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
    }
  }
  return null;
}

// Extract time in HH:MM format
function extractTime(text: string): string | null {
  const match = text.match(/(\d{1,2})[:\.](\d{2})\s*(?:h|hora|hrs)?/i);
  if (match) {
    const hour = parseInt(match[1]);
    const min = parseInt(match[2]);
    if (hour >= 0 && hour <= 23 && min >= 0 && min <= 59) {
      return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }
  }
  return null;
}

// Extract reclamante name
function extractReclamante(text: string): string | null {
  const patterns = [
    /reclamante[:\s]+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç\s]+)/i,
    /autor[:\s]+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç\s]+)/i,
    /periciando[:\s]+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç\s]+)/i,
    /nome[:\s]+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç\s]+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim().substring(0, 60);
  }
  return null;
}

// Extract perito name
function extractPerito(text: string): string | null {
  const match = text.match(/perito[:\s]+(?:dr\.?\s*|dra\.?\s*)?([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç\s]+)/i);
  return match ? match[1].trim().substring(0, 60) : null;
}

// Detect type of perícia
function extractTipo(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('médica') || lower.includes('medica')) return 'Perícia Médica';
  if (lower.includes('ortopédica') || lower.includes('ortopedica')) return 'Perícia Ortopédica';
  if (lower.includes('psiquiátrica') || lower.includes('psiquiatrica')) return 'Perícia Psiquiátrica';
  if (lower.includes('contábil') || lower.includes('contabil')) return 'Perícia Contábil';
  if (lower.includes('técnica') || lower.includes('tecnica')) return 'Perícia Técnica';
  if (lower.includes('insalubridade')) return 'Perícia Insalubridade';
  if (lower.includes('periculosidade')) return 'Perícia Periculosidade';
  if (lower.includes('ergonômica') || lower.includes('ergonomica')) return 'Perícia Ergonômica';
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
        return decodeBase64Url(part.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
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

    // Search for perícia-related emails from last 90 days
    const keywords = ['perícia', 'pericia', 'perito', 'pericial', 'laudo pericial'];
    const query = keywords.map(k => `"${k}"`).join(' OR ');
    const afterDate = new Date();
    afterDate.setDate(afterDate.getDate() - 90);
    const afterStr = `${afterDate.getFullYear()}/${String(afterDate.getMonth() + 1).padStart(2, '0')}/${String(afterDate.getDate()).padStart(2, '0')}`;

    const searchQuery = encodeURIComponent(`(${query}) after:${afterStr}`);
    const listData = await gmailFetch(accessToken, `messages?q=${searchQuery}&maxResults=50`);
    const messageIds = listData.messages || [];

    const pericias: Pericia[] = [];

    for (const msg of messageIds) {
      if (!msg.id) continue;
      try {
        const fullMessage = await gmailFetch(accessToken, `messages/${msg.id}?format=full`);
        const headers = fullMessage.payload?.headers || [];
        const subject = getHeaderValue(headers, 'subject');
        const date = getHeaderValue(headers, 'date');
        const body = getEmailBody(fullMessage.payload);
        const fullText = `${subject} ${body}`;

        const periciaDate = extractDate(fullText);
        if (!periciaDate) continue;

        const pericia: Pericia = {
          data: periciaDate,
          horario: extractTime(fullText) || '',
          reclamante: extractReclamante(fullText) || subject.substring(0, 60),
          tipo: extractTipo(fullText),
          perito: extractPerito(fullText) || '',
          emailSubject: subject,
          emailDate: date,
        };

        const isDuplicate = pericias.some(p => p.data === pericia.data && p.reclamante === pericia.reclamante);
        if (!isDuplicate) pericias.push(pericia);
      } catch (err) {
        console.error(`Error processing pericia email ${msg.id}:`, err);
      }
    }

    // Sort by date
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
