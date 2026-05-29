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
 */
function detectPhase(subject: string, body: string): string {
  const text = `${subject} ${body.substring(0, 1000)}`.toLowerCase();

  if (text.includes("distribuí") || text.includes("distribui")) return "Distribuição";
  if (text.includes("citação") || text.includes("citaç")) return "Citação";
  if (text.includes("intimação") || text.includes("intimaç")) return "Intimação";
  if (text.includes("notificação") || text.includes("notificaç")) return "Notificação";
  if (text.includes("audiência") || text.includes("audienc")) return "Audiência";
  if (text.includes("despacho")) return "Despacho";
  if (text.includes("sentença") || text.includes("sentenç")) return "Sentença";
  if (text.includes("acórdão") || text.includes("acordão") || text.includes("acordao")) return "Acórdão";
  if (text.includes("recurso")) return "Recurso";
  if (text.includes("embargo")) return "Embargos";
  if (text.includes("execução") || text.includes("execuç")) return "Execução";
  if (text.includes("penhora")) return "Penhora";
  if (text.includes("perícia") || text.includes("perici")) return "Perícia";
  if (text.includes("alvará")) return "Alvará";
  if (text.includes("trânsito em julgado") || text.includes("transito em julgado")) return "Trânsito em Julgado";
  if (text.includes("acordo")) return "Acordo";
  if (text.includes("julgamento")) return "Julgamento";
  if (text.includes("pauta")) return "Pauta de Julgamento";
  if (text.includes("mandado")) return "Mandado";
  if (text.includes("contestação") || text.includes("contestaç")) return "Contestação";
  if (text.includes("petição") || text.includes("petiç")) return "Petição";
  if (text.includes("ato ordinatório") || text.includes("ato ordinatorio")) return "Ato Ordinatório";

  return "Movimentação";
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

  return {
    id: message.id ?? "",
    date,
    subject,
    snippet: message.snippet ?? "",
    body,
    from,
    processNumber,
    phase,
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

    // Se temos um número de processo, buscar por ele para resultados precisos
    // Caso contrário, busca por nome
    let query: string;
    if (processNumber && processNumber.trim() !== '') {
      query = `"${processNumber}"`;
    } else {
      query = `"${clientName}" OR subject:"${clientName}"`;
    }

    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 30,
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
  'certidão de arquivamento',
  'certidao de arquivamento',
  'trânsito em julgado',
  'transito em julgado',
  'extinção do processo',
  'extincao do processo',
  'processo extinto',
  'arquivamento definitivo',
  'baixa definitiva',
  'baixa dos autos',
  'encerramento do processo',
  'processo arquivado',
  // Acordo homologado (encerra o processo)
  'acordo homologado',
  'homologação de acordo',
  'homologacao de acordo',
  'homologar o acordo',
  'sentença homologatória',
  'sentenca homologatoria',
  'homologo o acordo',
  'homologo para que produza',
  'declaro extinto o processo',
  'julgo extinto',
  'extingo o processo',
  'cumprimento de acordo',
  'acordo judicial',
  'termo de conciliação',
  'termo de conciliacao',
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
