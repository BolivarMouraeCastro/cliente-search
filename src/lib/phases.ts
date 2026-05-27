/**
 * Shared phase classification logic for labor law processes.
 * Used by: EmailTimeline (frontend), Emails API (auto-update), Bulk Sync.
 */

// ---------------------------------------------------------------------------
// Phase definitions
// ---------------------------------------------------------------------------
export interface PhaseConfig {
  id: string;
  name: string;
  /** Simple description for law interns */
  simple: string;
  /** Status label to write to Google Sheets */
  sheetStatus: string;
  /** Keywords to match in email subject + snippet + body */
  keywords: string[];
  /** Order in the process flow (higher = later phase) */
  order: number;
}

export const ALL_PHASES: PhaseConfig[] = [
  {
    id: 'distribuicao',
    name: 'Distribuição',
    simple: 'Processo foi registrado no tribunal',
    sheetStatus: 'DISTRIBUÍDO',
    keywords: ['distribuí', 'distribui', 'distribuiç', 'distribuido', 'distribuída', 'petição inicial', 'petiç inicial', 'recebimento da inicial', 'autuação', 'autuado'],
    order: 1,
  },
  {
    id: 'citacao',
    name: 'Citação',
    simple: 'Empresa foi notificada sobre o processo',
    sheetStatus: 'CITAÇÃO',
    keywords: ['citação', 'citaç', 'citar', 'cite-se', 'notificação inicial', 'mandado de citação', 'carta de citação', 'notifique-se a reclamada', 'notifique-se a ré'],
    order: 2,
  },
  {
    id: 'audiencia_inicial',
    name: 'Audiência Inicial',
    simple: 'Primeira audiência para tentar acordo',
    sheetStatus: 'AUDIÊNCIA MARCADA',
    keywords: ['audiência inicial', 'audiencia inicial', 'audiência de concilia', 'audiencia de concilia', 'pauta de audiência', 'pauta de audiencia', 'designo audiência', 'designo audiencia', 'audiência designada', 'audiencia designada'],
    order: 3,
  },
  {
    id: 'audiencia_una',
    name: 'Audiência Una',
    simple: 'Audiência única — acordo, provas e julgamento no mesmo ato',
    sheetStatus: 'AUDIÊNCIA MARCADA',
    keywords: ['audiência una', 'audiencia una'],
    order: 3,
  },
  {
    id: 'audiencia_instrucao',
    name: 'Audiência de Instrução',
    simple: 'Audiência para ouvir testemunhas e produzir provas',
    sheetStatus: 'AUDIÊNCIA MARCADA',
    keywords: ['audiência de instrução', 'audiencia de instrucao', 'audiência de instruç', 'instrução e julgamento', 'oitiva de testemunha'],
    order: 4,
  },
  {
    id: 'pericia',
    name: 'Perícia',
    simple: 'Perito analisa as condições de trabalho',
    sheetStatus: 'AGUARDANDO SENTENÇA',
    keywords: ['perícia', 'pericia', 'perito', 'laudo pericial', 'quesitos', 'insalubridade', 'periculosidade'],
    order: 5,
  },
  {
    id: 'sentenca',
    name: 'Sentença',
    simple: 'Juiz decidiu o caso',
    sheetStatus: 'SENTENÇA PROFERIDA',
    keywords: ['sentença', 'sentenç', 'procedente', 'improcedente', 'parcialmente procedente', 'julgo', 'dispositivo'],
    order: 6,
  },
  {
    id: 'recurso',
    name: 'Recurso',
    simple: 'Uma das partes recorreu da decisão',
    sheetStatus: 'EM RECURSO',
    keywords: ['recurso', 'embargo', 'contrarrazões', 'contra-razões', 'razões recursais', 'recurso ordinário', 'recurso ordinario'],
    order: 7,
  },
  {
    id: 'acordao',
    name: 'Acórdão',
    simple: 'Tribunal julgou o recurso',
    sheetStatus: 'EM RECURSO',
    keywords: ['acórdão', 'acordão', 'acordao', 'turma julgadora', 'voto'],
    order: 8,
  },
  {
    id: 'transito',
    name: 'Trânsito em Julgado',
    simple: 'Decisão virou definitiva — não cabe mais recurso',
    sheetStatus: 'TRÂNSITO EM JULGADO',
    keywords: ['trânsito em julgado', 'transito em julgado', 'transitado', 'certidão de trânsito'],
    order: 9,
  },
  {
    id: 'execucao',
    name: 'Execução',
    simple: 'Fase de pagamento dos valores devidos',
    sheetStatus: 'EM EXECUÇÃO',
    keywords: ['execução', 'execuç', 'penhora', 'alvará', 'cálculo de liquidação', 'liquidação', 'mandado de penhora', 'hasta pública', 'bloqueio'],
    order: 10,
  },
];

// Phase map for quick lookup
export const PHASE_MAP = new Map(ALL_PHASES.map((p) => [p.id, p]));

// Unique statuses used in the spreadsheet (for Dashboard grouping)
export const SHEET_STATUSES = [
  'DISTRIBUÍDO',
  'CITAÇÃO',
  'AUDIÊNCIA MARCADA',
  'AGUARDANDO SENTENÇA',
  'SENTENÇA PROFERIDA',
  'EM RECURSO',
  'TRÂNSITO EM JULGADO',
  'EM EXECUÇÃO',
];

// Status order for comparisons (higher = more advanced)
export const STATUS_ORDER: Record<string, number> = {
  'DISTRIBUÍDO': 1,
  'CITAÇÃO': 2,
  'AUDIÊNCIA MARCADA': 3,
  'AGUARDANDO SENTENÇA': 4,
  'SENTENÇA PROFERIDA': 5,
  'EM RECURSO': 6,
  'TRÂNSITO EM JULGADO': 7,
  'EM EXECUÇÃO': 8,
};

// ---------------------------------------------------------------------------
// Classification helpers
// ---------------------------------------------------------------------------

function matchesPhase(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

export interface EmailLike {
  subject: string;
  snippet: string;
  body?: string;
  from?: string;
}

/**
 * Classify an email into a phase. Returns the phase config or null.
 */
export function classifyEmail(email: EmailLike): PhaseConfig | null {
  const bodyPreview = (email.body || '').substring(0, 1500);
  const text = `${email.subject} ${email.snippet} ${bodyPreview}`;

  for (const phase of ALL_PHASES) {
    if (matchesPhase(text, phase.keywords)) {
      return phase;
    }
  }

  return null;
}

/**
 * Check if an email is from the TRT (tribunal).
 */
export function isTRTEmail(email: EmailLike): boolean {
  const subject = email.subject.toLowerCase();
  const from = (email.from || '').toLowerCase();
  return subject.includes('trt') || from.includes('trt') || from.includes('tribunal');
}

/**
 * Given an array of emails, determine the most advanced phase reached.
 * Returns the sheetStatus string to write to Google Sheets.
 */
export function detectCurrentPhase(emails: EmailLike[]): string | null {
  let highestOrder = 0;
  let currentStatus: string | null = null;

  for (const email of emails) {
    const phase = classifyEmail(email);
    if (phase && phase.order > highestOrder) {
      highestOrder = phase.order;
      currentStatus = phase.sheetStatus;
    }
  }

  // Fallback: if no specific phase matched but there are TRT emails,
  // the case has at least been distributed
  if (!currentStatus && emails.some(isTRTEmail)) {
    currentStatus = 'DISTRIBUÍDO';
  }

  return currentStatus;
}

/**
 * Determine the "next expected" phase name given a current phase id.
 */
export const NEXT_PHASE: Record<string, string> = {
  distribuicao: 'citacao',
  citacao: 'audiencia_inicial',
  audiencia_inicial: 'audiencia_instrucao',
  audiencia_una: 'sentenca',
  audiencia_instrucao: 'sentenca',
  pericia: 'sentenca',
  sentenca: 'recurso',
  recurso: 'acordao',
  acordao: 'transito',
  transito: 'execucao',
};

/**
 * Check if a new status is more advanced than the current one.
 */
export function isStatusAdvanced(currentStatus: string, newStatus: string): boolean {
  const currentOrder = STATUS_ORDER[currentStatus.toUpperCase()] ?? 0;
  const newOrder = STATUS_ORDER[newStatus.toUpperCase()] ?? 0;
  return newOrder > currentOrder;
}
