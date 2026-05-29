import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const DATAJUD_API_KEY = process.env.DATAJUD_API_KEY ?? '';
const DATAJUD_BASE_URL = 'https://api-publica.datajud.cnj.jus.br';

// TRT endpoints mapping
const TRT_ENDPOINTS: Record<string, string> = {
  'trt1': 'api_publica_trt1',
  'trt2': 'api_publica_trt2',
  'trt3': 'api_publica_trt3',
  'trt4': 'api_publica_trt4',
  'trt5': 'api_publica_trt5',
  'trt6': 'api_publica_trt6',
  'trt7': 'api_publica_trt7',
  'trt8': 'api_publica_trt8',
  'trt9': 'api_publica_trt9',
  'trt10': 'api_publica_trt10',
  'trt11': 'api_publica_trt11',
  'trt12': 'api_publica_trt12',
  'trt13': 'api_publica_trt13',
  'trt14': 'api_publica_trt14',
  'trt15': 'api_publica_trt15',
  'trt16': 'api_publica_trt16',
  'trt17': 'api_publica_trt17',
  'trt18': 'api_publica_trt18',
  'trt19': 'api_publica_trt19',
  'trt20': 'api_publica_trt20',
  'trt21': 'api_publica_trt21',
  'trt22': 'api_publica_trt22',
  'trt23': 'api_publica_trt23',
  'trt24': 'api_publica_trt24',
};

/**
 * Detect which TRT to query based on the process number.
 * Format: NNNNNNN-NN.YYYY.N.NN.NNNN
 * The "N" after YYYY is the justice branch (5 = trabalho)
 * The "NN" after that is the TRT number (02 = TRT2 SP)
 */
function detectTRT(processNumber: string): string {
  const match = processNumber.match(/\.\d{4}\.\d\.(\d{2})\./);
  if (match) {
    const trtNum = parseInt(match[1], 10);
    return `trt${trtNum}`;
  }
  return 'trt2'; // Default TRT2 SP
}

/**
 * Normalize process number for DataJud query (remove formatting).
 * Input:  1001514-44.2026.5.02.0271
 * Output: 10015144420265020271
 */
function normalizeProcessNumber(processNumber: string): string {
  return processNumber.replace(/[.\-]/g, '');
}

// Matéria classification
export interface MovementClassification {
  category: string;
  icon: string;
  color: string;
}

const MATERIA_KEYWORDS: { keywords: string[]; category: string; icon: string; color: string }[] = [
  { keywords: ['recurso ordinário', 'recurso ordinario', 'interpôs recurso'], category: 'Recurso Ordinário', icon: '📄', color: '#ef4444' },
  { keywords: ['contrarrazões', 'contrarrazoes', 'contra-razões'], category: 'Contrarrazões', icon: '📝', color: '#f97316' },
  { keywords: ['agravo', 'agravo de instrumento', 'agravo de petição'], category: 'Agravo', icon: '⚡', color: '#dc2626' },
  { keywords: ['embargo', 'embargos de declaração', 'embargos à execução'], category: 'Embargos', icon: '🔒', color: '#9333ea' },
  { keywords: ['sentença proferida', 'sentença', 'decisão proferida', 'julgados os pedidos'], category: 'Sentença', icon: '⚖️', color: '#10b981' },
  { keywords: ['acórdão', 'acordão', 'acordao'], category: 'Acórdão', icon: '📋', color: '#059669' },
  { keywords: ['audiência designada', 'audiência', 'pauta de audiência', 'redesignada audiência'], category: 'Audiência', icon: '🗓️', color: '#f59e0b' },
  { keywords: ['perícia', 'laudo pericial', 'perito', 'perícia designada'], category: 'Perícia', icon: '🔬', color: '#6366f1' },
  { keywords: ['liquidação', 'planilha de cálculo', 'cálculo de liquidação', 'homologada a liquidação'], category: 'Liquidação', icon: '📊', color: '#8b5cf6' },
  { keywords: ['execução', 'cumprimento de sentença', 'mandado de execução'], category: 'Execução', icon: '🔨', color: '#f97316' },
  { keywords: ['penhora', 'bloqueio', 'constrição'], category: 'Penhora', icon: '🏦', color: '#dc2626' },
  { keywords: ['citação', 'mandado de citação', 'carta de citação'], category: 'Citação', icon: '📨', color: '#3b82f6' },
  { keywords: ['intimação', 'intimado'], category: 'Intimação', icon: '🔔', color: '#eab308' },
  { keywords: ['acordo', 'conciliação', 'homologação de acordo'], category: 'Acordo', icon: '🤝', color: '#22c55e' },
  { keywords: ['distribuído', 'distribuição', 'distribuido'], category: 'Distribuição', icon: '📌', color: '#64748b' },
  { keywords: ['trânsito em julgado', 'transito em julgado'], category: 'Trânsito em Julgado', icon: '✅', color: '#059669' },
  { keywords: ['arquivado', 'arquivamento'], category: 'Arquivamento', icon: '📁', color: '#94a3b8' },
  { keywords: ['juntada', 'juntada de'], category: 'Juntada', icon: '📎', color: '#78716c' },
  { keywords: ['concluso', 'conclusão'], category: 'Conclusão', icon: '📥', color: '#a78bfa' },
  { keywords: ['despacho', 'despacho proferido'], category: 'Despacho', icon: '📃', color: '#0ea5e9' },
  { keywords: ['petição', 'petição inicial', 'petição juntada'], category: 'Petição', icon: '📄', color: '#14b8a6' },
  { keywords: ['alvará', 'alvará de levantamento'], category: 'Alvará', icon: '💰', color: '#22c55e' },
];

function classifyMovement(description: string): MovementClassification {
  const lower = description.toLowerCase();
  for (const m of MATERIA_KEYWORDS) {
    if (m.keywords.some((kw) => lower.includes(kw))) {
      return { category: m.category, icon: m.icon, color: m.color };
    }
  }
  return { category: 'Outras Movimentações', icon: '📋', color: '#94a3b8' };
}

export interface Movement {
  date: string;
  description: string;
  complement: string;
  classification: MovementClassification;
}

export interface DataJudResponse {
  processNumber: string;
  tribunal: string;
  classe: string;
  assunto: string;
  orgaoJulgador: string;
  movements: Movement[];
  totalMovements: number;
  materiasSummary: { category: string; icon: string; color: string; count: number }[];
}

// Cache
const cache = new Map<string, { data: DataJudResponse; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const processNumber = searchParams.get('processNumber');

    if (!processNumber || processNumber.trim() === '') {
      return NextResponse.json(
        { error: 'processNumber é obrigatório' },
        { status: 400 }
      );
    }

    if (!DATAJUD_API_KEY) {
      return NextResponse.json(
        { error: 'DATAJUD_API_KEY não configurada. Obtenha em https://datajud-wiki.cnj.jus.br/api-publica/acesso' },
        { status: 500 }
      );
    }

    // Check cache
    const cacheKey = processNumber.trim();
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json(cached.data);
    }

    // Detect TRT
    const trt = detectTRT(processNumber);
    const endpoint = TRT_ENDPOINTS[trt] || 'api_publica_trt2';
    const normalized = normalizeProcessNumber(processNumber);

    // Query DataJud
    const url = `${DATAJUD_BASE_URL}/${endpoint}/_search`;
    const body = {
      query: {
        match: {
          numeroProcesso: normalized,
        },
      },
      size: 1,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `APIKey ${DATAJUD_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`DataJud API error (${response.status}):`, errorText);
      return NextResponse.json(
        { error: `Erro na API DataJud: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const hits = data?.hits?.hits || [];

    if (hits.length === 0) {
      return NextResponse.json({
        processNumber: processNumber.trim(),
        tribunal: trt.toUpperCase(),
        classe: '',
        assunto: '',
        orgaoJulgador: '',
        movements: [],
        totalMovements: 0,
        materiasSummary: [],
      });
    }

    const source = hits[0]._source;

    // Extract movements
    const rawMovements = source.movimentos || source.movimentacoes || [];
    const movements: Movement[] = rawMovements.map((mov: Record<string, unknown>) => {
      const desc = (mov.nome as string) || (mov.descricao as string) || '';
      const complementos = (mov.complementosTabelados as Array<{ descricao?: string; nome?: string }>) || [];
      const complementText = complementos
        .map((c) => c.descricao || c.nome || '')
        .filter(Boolean)
        .join('; ');

      return {
        date: (mov.dataHora as string) || '',
        description: desc,
        complement: complementText,
        classification: classifyMovement(`${desc} ${complementText}`),
      };
    });

    // Sort by date descending (most recent first)
    movements.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });

    // Build matérias summary
    const materiasMap = new Map<string, { icon: string; color: string; count: number }>();
    for (const mov of movements) {
      const cat = mov.classification.category;
      const existing = materiasMap.get(cat);
      if (existing) {
        existing.count++;
      } else {
        materiasMap.set(cat, {
          icon: mov.classification.icon,
          color: mov.classification.color,
          count: 1,
        });
      }
    }
    const materiasSummary = Array.from(materiasMap.entries())
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.count - a.count);

    // Extract process info
    const assuntos = source.assuntos || [];
    const assuntoText = assuntos.map((a: { descricao?: string }) => a.descricao || '').filter(Boolean).join(', ');

    const result: DataJudResponse = {
      processNumber: processNumber.trim(),
      tribunal: trt.toUpperCase(),
      classe: source.classe?.nome || source.classe?.descricao || '',
      assunto: assuntoText,
      orgaoJulgador: source.orgaoJulgador?.nome || '',
      movements,
      totalMovements: movements.length,
      materiasSummary,
    };

    // Save to cache
    cache.set(cacheKey, { data: result, timestamp: Date.now() });

    return NextResponse.json(result);
  } catch (error) {
    console.error('API /api/movements error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
