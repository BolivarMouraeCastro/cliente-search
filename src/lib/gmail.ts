import { getGmailService } from "@/lib/google-auth";
import { Email } from "@/types";
import { gmail_v1 } from "googleapis";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Decode a base64url-encoded string (as used by the Gmail API).
 */
function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

/**
 * Extract the plain-text body from a Gmail message payload.
 * Handles both simple and multipart messages.
 */
function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return "";

  // Simple message with body data directly on the payload
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Multipart message – walk through parts looking for text/plain or text/html
  if (payload.parts && payload.parts.length > 0) {
    // Prefer text/plain
    const plainPart = findPartByMimeType(payload.parts, "text/plain");
    if (plainPart?.body?.data) {
      return decodeBase64Url(plainPart.body.data);
    }

    // Fallback to text/html (strip tags for readability)
    const htmlPart = findPartByMimeType(payload.parts, "text/html");
    if (htmlPart?.body?.data) {
      const html = decodeBase64Url(htmlPart.body.data);
      return stripHtmlTags(html);
    }

    // Recursively search nested multipart parts
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
  }

  return "";
}

/**
 * Strip HTML tags and decode entities for cleaner email body display.
 */
function stripHtmlTags(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findPartByMimeType(
  parts: gmail_v1.Schema$MessagePart[],
  mimeType: string
): gmail_v1.Schema$MessagePart | undefined {
  return parts.find((p) => p.mimeType === mimeType);
}

/**
 * Extract a specific header value from a Gmail message.
 */
function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string {
  if (!headers) return "";
  const header = headers.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase()
  );
  return header?.value ?? "";
}

/**
 * Extract process number from email subject or body.
 * Brazilian labor court process numbers follow patterns like:
 * 0001234-56.2023.5.02.0001 or ATOrd 0001234-56.2023.5.02.0001
 */
function extractProcessNumber(subject: string, body: string): string {
  // Pattern for Brazilian court process numbers: NNNNNNN-NN.NNNN.N.NN.NNNN
  const processPattern = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/;

  // Try subject first
  const subjectMatch = subject.match(processPattern);
  if (subjectMatch) return subjectMatch[0];

  // Try body (first 2000 chars for performance)
  const bodySnippet = body.substring(0, 2000);
  const bodyMatch = bodySnippet.match(processPattern);
  if (bodyMatch) return bodyMatch[0];

  return "";
}

/**
 * Detect the type/phase of the court notification based on keywords.
 * Scans subject + first 5000 chars of body to catch TRT event lists.
 */
function detectPhase(subject: string, body: string): string {
  const text = `${subject} ${body.substring(0, 5000)}`.toLowerCase();

  // Order matters — check more specific/advanced phases first
  if (text.includes('trânsito em julgado') || text.includes('transito em julgado')) return 'Trânsito em Julgado';
  if (text.includes('acórdão') || text.includes('acordão') || text.includes('acordao')) return 'Acórdão';
  if (text.includes('recurso ordinário') || text.includes('recurso ordinario')) return 'Recurso';
  if (text.includes('homologada a liquidação') || text.includes('homologada a liquidacao')) return 'Execução';
  if (text.includes('cálculo de liquidação') || text.includes('calculo de liquidacao')) return 'Execução';
  if (text.includes('planilha de cálculo') || text.includes('planilha de calculo')) return 'Execução';
  if (text.includes('impugnação') || text.includes('impugnacao')) return 'Execução';
  if (text.includes('cumprimento de sentença') || text.includes('cumprimento de sentenca')) return 'Execução';
  if (text.includes('execução') || text.includes('execuç')) return 'Execução';
  if (text.includes('penhora') || text.includes('bloqueio')) return 'Execução';
  if (text.includes('alvará')) return 'Execução';
  if (text.includes('sentença') || text.includes('sentenç')) return 'Sentença';
  if (text.includes('decisão - decisão') || text.includes('decisao - decisao')) return 'Sentença';
  if (text.includes('decisão') || text.includes('decisao')) return 'Sentença';
  if (text.includes('julgamento')) return 'Sentença';
  if (text.includes('perícia') || text.includes('perici')) return 'Perícia';
  if (text.includes('audiência') || text.includes('audienc')) return 'Audiência';
  if (text.includes('pauta')) return 'Audiência';
  if (text.includes('acordo homologado') || text.includes('homologação de acordo')) return 'Acordo';
  if (text.includes('acordo')) return 'Acordo';
  if (text.includes('recurso')) return 'Recurso';
  if (text.includes('embargo')) return 'Embargos';
  if (text.includes('contestação') || text.includes('contestaç')) return 'Contestação';
  if (text.includes('citação') || text.includes('citaç')) return 'Citação';
  if (text.includes('intimação') || text.includes('intimaç')) return 'Intimação';
  if (text.includes('notificação') || text.includes('notificaç')) return 'Notificação';
  if (text.includes('despacho')) return 'Despacho';
  if (text.includes('distribuí') || text.includes('distribui')) return 'Distribuição';
  if (text.includes('mandado')) return 'Mandado';
  if (text.includes('petição') || text.includes('petiç')) return 'Petição';
  if (text.includes('ato ordinatório') || text.includes('ato ordinatorio')) return 'Ato Ordinatório';
  if (text.includes('concluso')) return 'Movimentação';

  return 'Movimentação';
}

/**
 * Extract hearing (audiência) details: date, time, and court from email text.
 * TRT hearing notifications typically contain patterns like:
 * - "audiência designada para 15/03/2024 às 14:00"
 * - "audiência para o dia 15.03.2024, às 14h00"
 * - "Vara do Trabalho de São Paulo"
 */
function extractHearingDetails(subject: string, body: string): {
  audienciaData?: string;
  audienciaHora?: string;
  audienciaOrgao?: string;
} {
  const text = `${subject} ${body.substring(0, 3000)}`;
  const lower = text.toLowerCase();

  // Only extract if it's about an audiência
  const isHearing = lower.includes('audiência') || lower.includes('audiencia') ||
    lower.includes('pauta de audiência') || lower.includes('pauta de audiencia');
  if (!isHearing) return {};

  let audienciaData: string | undefined;
  let audienciaHora: string | undefined;
  let audienciaOrgao: string | undefined;

  // --- Extract DATE ---
  // Patterns: DD/MM/YYYY, DD.MM.YYYY, DD-MM-YYYY
  const datePatterns = [
    // "para o dia DD/MM/YYYY" or "para DD/MM/YYYY" or "dia DD/MM/YYYY"
    /(?:para\s+(?:o\s+)?dia|dia|data|em|para)\s+(\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4})/i,
    // "DD/MM/YYYY às" or "DD.MM.YYYY,"
    /(\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4})\s*(?:,?\s*(?:às|as|a partir))/i,
    // Any date near audiência context
    /audiên\w*[^.]{0,60}?(\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4})/i,
    /(\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4})[^.]{0,60}?audiên/i,
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      audienciaData = match[1].replace(/\./g, '/');
      break;
    }
  }

  // --- Extract TIME ---
  // Patterns: HH:MM, HHhMM, HH:MMh, às HH:MM
  const timePatterns = [
    /(?:às|as|horário|hora)\s*:?\s*(\d{1,2})\s*(?::|h|H)\s*(\d{2})/i,
    /(\d{1,2})\s*(?::|h|H)\s*(\d{2})\s*(?:h|hs|hrs|horas|min|minutos)?/i,
  ];

  for (const pattern of timePatterns) {
    const match = text.match(pattern);
    if (match?.[1] && match?.[2]) {
      const hour = parseInt(match[1], 10);
      // Validate it's a reasonable hour for a hearing (7-20)
      if (hour >= 7 && hour <= 20) {
        audienciaHora = `${String(hour).padStart(2, '0')}:${match[2]}`;
        break;
      }
    }
  }

  // --- Extract COURT (Órgão Julgador) ---
  const courtPatterns = [
    // "Nª Vara do Trabalho de CIDADE"
    /(\d{1,3}[ªºa]?\s*Vara\s+do\s+Trabalho[^,.;\n]{0,60})/i,
    // "Tribunal Regional do Trabalho"
    /(Tribunal\s+Regional\s+do\s+Trabalho[^,.;\n]{0,60})/i,
    // "TRT da Nª Região"
    /(TRT\s+da?\s+\d{1,2}[ªºa]?\s+Regi[ãa]o)/i,
    // "Juízo da Nª Vara" or "perante a Nª Vara"
    /(?:juízo|juizo|perante)\s+(?:da?\s+)?(\d{1,3}[ªºa]?\s*Vara[^,.;\n]{0,60})/i,
    // "Órgão: ..."
    /[óo]rg[ãa]o\s*(?:julgador)?\s*:?\s*([^\n,.;]{5,80})/i,
  ];

  for (const pattern of courtPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      audienciaOrgao = match[1].trim();
      break;
    }
  }

  return { audienciaData, audienciaHora, audienciaOrgao };
}

/**
 * Convert a Gmail message to our Email interface with enriched data.
 */
function messageToEmail(message: gmail_v1.Schema$Message): Email {
  const headers = message.payload?.headers;
  const date = getHeader(headers, "Date");
  const subject = getHeader(headers, "Subject");
  const from = getHeader(headers, "From");
  const body = extractBody(message.payload ?? undefined);
  const processNumber = extractProcessNumber(subject, body);
  const phase = detectPhase(subject, body);
  const hearing = extractHearingDetails(subject, body);

  return {
    id: message.id ?? "",
    date,
    subject,
    snippet: message.snippet ?? "",
    body,
    from,
    processNumber,
    phase,
    ...hearing,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search Gmail for emails related to a specific client by name.
 * Focuses on TRT/tribunal notifications.
 * Returns up to 30 most recent matching emails sorted chronologically.
 */
export async function getClientEmails(
  accessToken: string,
  clientName: string,
  processNumber?: string
): Promise<Email[]> {
  try {
    const gmail = getGmailService(accessToken);

    // Buscar com AMBAS as estratégias quando temos número do processo
    // para não perder nenhum e-mail importante
    let query: string;
    if (processNumber && processNumber.trim() !== '') {
      // Busca por número do processo OU nome do cliente
      query = `"${processNumber}" OR "${clientName}"`;
    } else {
      query = `"${clientName}" OR subject:"${clientName}"`;
    }

    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 50,
    });

    const messageIds = listResponse.data.messages;
    if (!messageIds || messageIds.length === 0) {
      return [];
    }

    // Buscar detalhes completos de cada mensagem
    const emails: Email[] = [];

    for (const msg of messageIds) {
      if (!msg.id) continue;

      try {
        const fullMessage = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full',
        });

        emails.push(messageToEmail(fullMessage.data));
      } catch (err) {
        console.error(`Error fetching email ${msg.id}:`, err);
      }
    }

    // Ordenar por data ASCENDENTE (ordem cronológica - mais antigo primeiro)
    emails.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    return emails;
  } catch (error) {
    console.error('Error fetching client emails:', error);
    throw new Error('Failed to fetch emails from Gmail');
  }
}

/**
 * Get recent tribunal/court update emails from the last 7 days.
 */
export async function getRecentUpdates(
  accessToken: string
): Promise<Email[]> {
  try {
    const gmail = getGmailService(accessToken);

    const query = `newer_than:7d (TRT OR tribunal OR vara OR processo OR intimação OR citação OR despacho OR sentença)`;

    const listResponse = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 20,
    });

    const messageIds = listResponse.data.messages;
    if (!messageIds || messageIds.length === 0) {
      return [];
    }

    const emails: Email[] = [];

    for (const msg of messageIds) {
      if (!msg.id) continue;

      try {
        const fullMessage = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "full",
        });

        emails.push(messageToEmail(fullMessage.data));
      } catch (err) {
        console.error(`Error fetching email ${msg.id}:`, err);
      }
    }

    emails.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return emails;
  } catch (error) {
    console.error("Error fetching recent updates:", error);
    throw new Error("Failed to fetch recent email updates from Gmail");
  }
}

/**
 * Palavras-chave que indicam que um processo foi encerrado/arquivado.
 * Usado para auto-detecção e marcação de processos como ARQUIVADO.
 */
const CLOSED_PROCESS_KEYWORDS = [
  // Arquivamento real (fim do processo)
  'arquivado definitivamente',
  'arquivamento definitivo',
  'certidão de arquivamento',
  'certidao de arquivamento',
  'processo arquivado',
  'baixa definitiva',
  'baixa dos autos',
  'encerramento do processo',
  // Extinção do processo
  'extinção do processo',
  'extincao do processo',
  'processo extinto',
  'declaro extinto o processo',
  'julgo extinto',
  'extingo o processo',
  // Acordo homologado (encerra o processo)
  'acordo homologado',
  'homologação de acordo',
  'homologacao de acordo',
  'homologar o acordo',
  'sentença homologatória',
  'sentenca homologatoria',
  'homologo o acordo',
  'homologo para que produza',
  'cumprimento de acordo',
  'acordo judicial',
  'termo de conciliação',
  'termo de conciliacao',
  // NOTA: "trânsito em julgado" NÃO está aqui porque
  // no processo trabalhista ele abre a fase de EXECUÇÃO,
  // não significa que o processo acabou.
];

/**
 * Verificar se algum email indica que o processo foi encerrado.
 * Retorna true se palavras-chave de encerramento forem encontradas.
 */
export function detectClosedProcess(emails: Email[]): boolean {
  for (const email of emails) {
    const text = `${email.subject} ${email.body.substring(0, 2000)}`.toLowerCase();
    for (const keyword of CLOSED_PROCESS_KEYWORDS) {
      if (text.includes(keyword)) {
        console.log(`Detected closed process keyword: "${keyword}" in email: ${email.subject}`);
        return true;
      }
    }
  }
  return false;
}
