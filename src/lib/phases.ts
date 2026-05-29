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
    id: 'acordo',
    name: 'Acordo Homologado',
    simple: 'As partes fizeram um acordo e o juiz homologou — processo encerrado',
    sheetStatus: 'ARQUIVADO',
    keywords: ['acordo homologado', 'homologação de acordo', 'homologacao de acordo', 'homologar o acordo', 'sentença homologatória', 'sentenca homologatoria', 'homologo o acordo', 'homologo para que produza', 'termo de conciliação', 'termo de conciliacao', 'acordo judicial'],
    order: 11,
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
    keywords: [
      'execução', 'execuç', 'penhora', 'alvará',
      'cálculo de liquidação', 'liquidação', 'mandado de penhora',
      'hasta pública', 'bloqueio',
      // Cálculos e impugnações
      'planilha de cálculo', 'planilha de calculo',
      'impugnação de cálculo', 'impugnacao de calculo',
      'impugnação aos cálculos', 'impugnacao aos calculos',
      'cálculos de liquidação', 'calculos de liquidacao',
      'homologação de cálculo', 'homologacao de calculo',
      'conta de liquidação', 'conta de liquidacao',
      'manifestação sobre cálculos', 'manifestacao sobre calculos',
    ],
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
  acordo: '',
};

/**
 * Check if a new status is more advanced than the current one.
 */
export function isStatusAdvanced(currentStatus: string, newStatus: string): boolean {
  const currentOrder = STATUS_ORDER[currentStatus.toUpperCase()] ?? 0;
  const newOrder = STATUS_ORDER[newStatus.toUpperCase()] ?? 0;
  return newOrder > currentOrder;
}

// ---------------------------------------------------------------------------
// Detailed phase explanations — what happens NOW and what to expect
// ---------------------------------------------------------------------------
export const PHASE_EXPLANATIONS: Record<string, { titulo: string; oQueAconteceu: string; oQueEsperar: string; prazo: string; acaoNecessaria: string }> = {
  distribuicao: {
    titulo: 'Processo Distribuído',
    oQueAconteceu: 'O processo foi registrado no sistema do tribunal e atribuído a uma Vara do Trabalho. A partir de agora, um juiz está responsável pelo caso.',
    oQueEsperar: 'O próximo passo é a Citação — o tribunal vai notificar a empresa (reclamada) sobre a existência do processo, informando que ela precisa se defender.',
    prazo: 'A citação costuma sair entre 15 e 60 dias após a distribuição, dependendo da pauta do tribunal.',
    acaoNecessaria: 'Nenhuma ação necessária no momento. Aguardar a citação da empresa.',
  },
  citacao: {
    titulo: 'Empresa Citada',
    oQueAconteceu: 'A empresa foi oficialmente notificada sobre o processo trabalhista. Ela agora sabe que precisa comparecer e se defender.',
    oQueEsperar: 'O juiz vai marcar uma Audiência Inicial (ou Audiência de Conciliação) para tentar um acordo entre as partes antes de seguir com o processo.',
    prazo: 'A audiência inicial costuma ser marcada entre 30 e 90 dias após a citação.',
    acaoNecessaria: 'Preparar documentos e informações para a audiência. O advogado vai orientar sobre o que levar.',
  },
  audiencia_inicial: {
    titulo: 'Audiência Inicial Marcada',
    oQueAconteceu: 'Foi marcada a primeira audiência do processo, chamada de Audiência de Conciliação. O objetivo principal é tentar um acordo.',
    oQueEsperar: 'Na audiência, o juiz vai propor um acordo. Se não houver acordo, o processo segue para a fase de instrução (produção de provas, oitiva de testemunhas).',
    prazo: 'Comparecer na data marcada. Se não houver acordo, a audiência de instrução é marcada geralmente entre 30 e 120 dias depois.',
    acaoNecessaria: '⚠️ IMPORTANTE: O cliente DEVE comparecer à audiência. A ausência pode resultar em arquivamento do processo.',
  },
  audiencia_una: {
    titulo: 'Audiência Una Marcada',
    oQueAconteceu: 'Foi marcada uma Audiência Una — uma audiência única que concentra conciliação, instrução (provas/testemunhas) e julgamento no mesmo ato.',
    oQueEsperar: 'Nesta audiência, tudo acontece de uma vez: tentativa de acordo, oitiva de testemunhas, e possivelmente já sai a sentença do juiz.',
    prazo: 'Comparecer na data marcada com todas as testemunhas previamente combinadas com o advogado.',
    acaoNecessaria: '⚠️ IMPORTANTE: O cliente DEVE comparecer com testemunhas. A audiência una é decisiva.',
  },
  audiencia_instrucao: {
    titulo: 'Audiência de Instrução Marcada',
    oQueAconteceu: 'Não houve acordo na audiência anterior. Agora será realizada a Audiência de Instrução, onde serão ouvidas testemunhas e apresentadas provas.',
    oQueEsperar: 'Após a instrução, o juiz terá elementos para proferir a sentença. A sentença pode sair na própria audiência ou em até 30 dias depois.',
    prazo: 'Comparecer na data marcada com as testemunhas indicadas pelo advogado.',
    acaoNecessaria: '⚠️ IMPORTANTE: Levar testemunhas! Sem elas, pode haver prejuízo na produção de provas.',
  },
  pericia: {
    titulo: 'Perícia Designada',
    oQueAconteceu: 'O juiz determinou a realização de uma perícia técnica (insalubridade, periculosidade ou outra). Um perito especializado vai avaliar as condições de trabalho.',
    oQueEsperar: 'O perito vai elaborar um laudo que será usado pelo juiz para decidir sobre os pedidos relacionados. Após o laudo, as partes podem contestar.',
    prazo: 'A perícia costuma ser realizada em 30 a 60 dias. O laudo sai em até 30 dias após a perícia.',
    acaoNecessaria: 'Aguardar contato do perito para agendamento. Colaborar com informações solicitadas.',
  },
  sentenca: {
    titulo: 'Sentença Proferida',
    oQueAconteceu: 'O juiz analisou todas as provas e argumentos e proferiu a sentença — a decisão sobre o caso. O resultado pode ser procedente (ganhou), improcedente (perdeu) ou parcialmente procedente.',
    oQueEsperar: 'Qualquer uma das partes pode recorrer da decisão (Recurso Ordinário). Se ninguém recorrer no prazo, a sentença transita em julgado (vira definitiva).',
    prazo: 'O prazo para recurso é de 8 dias úteis após a publicação da sentença.',
    acaoNecessaria: 'Analisar com o advogado se vale a pena recorrer ou aceitar a decisão.',
  },
  recurso: {
    titulo: 'Recurso Interposto',
    oQueAconteceu: 'Uma das partes não concordou com a sentença e apresentou recurso. O caso agora será analisado por um tribunal superior (TRT — 2ª instância).',
    oQueEsperar: 'O tribunal (turma de desembargadores) vai reanalisar o caso e emitir um Acórdão — a decisão do recurso. Pode manter, reformar ou anular a sentença.',
    prazo: 'O julgamento do recurso costuma levar de 6 meses a 2 anos, dependendo do tribunal.',
    acaoNecessaria: 'Aguardar o julgamento. O advogado acompanha os prazos processuais.',
  },
  acordao: {
    titulo: 'Acórdão Publicado',
    oQueAconteceu: 'O tribunal julgou o recurso e publicou o Acórdão — a decisão colegiada. Os desembargadores decidiram se mantêm ou reformam a sentença original.',
    oQueEsperar: 'As partes podem interpor novos recursos (Embargos de Declaração, Recurso de Revista). Se não houver mais recursos, ocorre o trânsito em julgado.',
    prazo: 'O prazo para novos recursos é de 8 dias úteis após a publicação do acórdão.',
    acaoNecessaria: 'Analisar com o advogado se há possibilidade/necessidade de novo recurso.',
  },
  transito: {
    titulo: 'Trânsito em Julgado',
    oQueAconteceu: 'A decisão judicial se tornou DEFINITIVA. Não cabe mais nenhum recurso. O processo agora entra na fase de cumprimento/execução da decisão.',
    oQueEsperar: 'Se o resultado foi favorável, inicia-se a fase de Execução — cálculo e pagamento dos valores devidos. Se desfavorável, o processo é arquivado.',
    prazo: 'A liquidação (cálculo dos valores) costuma levar de 30 a 90 dias. O pagamento depende da empresa.',
    acaoNecessaria: 'O advogado vai iniciar os cálculos de liquidação para apurar os valores devidos.',
  },
  execucao: {
    titulo: 'Fase de Execução',
    oQueAconteceu: 'O processo está na fase final — a fase de pagamento. Os valores já foram calculados e a empresa foi intimada a pagar.',
    oQueEsperar: 'Se a empresa pagar voluntariamente, o processo é encerrado. Caso contrário, o juiz pode determinar penhora de bens, bloqueio de contas e outras medidas.',
    prazo: 'A execução pode durar de poucos meses a vários anos, dependendo da situação financeira da empresa.',
    acaoNecessaria: 'Acompanhar com o advogado as tentativas de recebimento. Manter dados bancários atualizados para recebimento.',
  },
  acordo: {
    titulo: 'Acordo Homologado',
    oQueAconteceu: 'As partes (reclamante e reclamada) chegaram a um acordo, e o juiz homologou a conciliação em audiência ou por petição. O processo foi encerrado com base nesse acordo.',
    oQueEsperar: 'A empresa deve cumprir os termos do acordo dentro do prazo estipulado. Se o pagamento for em parcelas, acompanhar o cumprimento de cada parcela.',
    prazo: 'O prazo de pagamento depende do que foi acordado. Geralmente entre 5 e 30 dias para pagamento à vista, ou conforme as parcelas combinadas.',
    acaoNecessaria: 'Verificar se o pagamento do acordo foi realizado no prazo. Se não for cumprido, o advogado pode solicitar a execução forçada do acordo.',
  },
};

