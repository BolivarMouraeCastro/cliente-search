import { NextResponse } from 'next/server';
import { getClients } from '@/lib/sheets';
import { ALL_PHASES, PhaseConfig } from '@/lib/phases';
import { Client } from '@/types';

export const dynamic = 'force-dynamic';

const DATAJUD_API_KEY = process.env.DATAJUD_API_KEY || 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
const DATAJUD_BASE_URL = 'https://api-publica.datajud.cnj.jus.br';

const TRT_ENDPOINTS: Record<string, string> = {
  'trt1': 'api_publica_trt1', 'trt2': 'api_publica_trt2', 'trt3': 'api_publica_trt3',
  'trt4': 'api_publica_trt4', 'trt5': 'api_publica_trt5', 'trt6': 'api_publica_trt6',
  'trt7': 'api_publica_trt7', 'trt8': 'api_publica_trt8', 'trt9': 'api_publica_trt9',
  'trt10': 'api_publica_trt10', 'trt11': 'api_publica_trt11', 'trt12': 'api_publica_trt12',
  'trt13': 'api_publica_trt13', 'trt14': 'api_publica_trt14', 'trt15': 'api_publica_trt15',
  'trt16': 'api_publica_trt16', 'trt17': 'api_publica_trt17', 'trt18': 'api_publica_trt18',
  'trt19': 'api_publica_trt19', 'trt20': 'api_publica_trt20', 'trt21': 'api_publica_trt21',
  'trt22': 'api_publica_trt22', 'trt23': 'api_publica_trt23', 'trt24': 'api_publica_trt24',
};

function detectTRT(processNumber: string): string {
  const match = processNumber.match(/\.\d{4}\.\d\.(\d{2})\./);
  if (match) {
    const trtNum = parseInt(match[1], 10);
    return `trt${trtNum}`;
  }
  return 'trt2';
}

function normalizeProcessNumber(processNumber: string): string {
  return processNumber.replace(/[.\-]/g, '');
}

export interface PhaseGroup {
  phase: PhaseConfig;
  clients: {
    client: Client;
    lastMovementDate: string;
    lastMovementDesc: string;
  }[];
}

// Memory Cache to prevent spamming DataJud
let cacheData: any = null;
let cacheTime = 0;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

export async function GET() {
  try {
    if (cacheData && Date.now() - cacheTime < CACHE_TTL) {
      return NextResponse.json(cacheData);
    }

    // 1. Fetch all clients from Google Sheets
    const clients = await getClients();
    
    // 2. Filter clients with process numbers and group by TRT
    const clientsWithProcess = clients.filter(c => c.numeroProcesso && c.numeroProcesso.trim() !== '');
    
    const trtGroups: Record<string, Client[]> = {};
    for (const c of clientsWithProcess) {
      const trt = detectTRT(c.numeroProcesso);
      if (!trtGroups[trt]) trtGroups[trt] = [];
      trtGroups[trt].push(c);
    }

    // 3. Process batches
    const aggregatedResults: Record<string, any> = {};

    for (const [trt, trtClients] of Object.entries(trtGroups)) {
      const endpoint = TRT_ENDPOINTS[trt] || 'api_publica_trt2';
      
      // DataJud allows batch queries via terms
      // Create a map for easy lookup
      const processMap = new Map(trtClients.map(c => [normalizeProcessNumber(c.numeroProcesso), c]));
      const normalizedNumbers = Array.from(processMap.keys());

      // Query in chunks of 50 to avoid request too large errors
      const chunkSize = 50;
      for (let i = 0; i < normalizedNumbers.length; i += chunkSize) {
        const chunk = normalizedNumbers.slice(i, i + chunkSize);
        
        const url = `${DATAJUD_BASE_URL}/${endpoint}/_search`;
        const body = {
          query: {
            terms: {
              numeroProcesso: chunk,
            },
          },
          size: chunk.length,
        };

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `APIKey ${DATAJUD_API_KEY}`,
          },
          body: JSON.stringify(body),
        });

        if (response.ok) {
          const data = await response.json();
          const hits = data?.hits?.hits || [];

          for (const hit of hits) {
            const source = hit._source;
            const procNum = source.numeroProcesso;
            const client = processMap.get(procNum);
            if (!client) continue;

            const rawMovements = source.movimentos || source.movimentacoes || [];
            
            // Extract movements
            const movements = rawMovements.map((mov: any) => {
              const desc = (mov.nome as string) || (mov.descricao as string) || '';
              const complementos = (mov.complementosTabelados as Array<{ descricao?: string; nome?: string }>) || [];
              const complementText = complementos.map(c => c.descricao || c.nome || '').filter(Boolean).join('; ');
              return {
                date: (mov.dataHora as string) || '',
                description: desc,
                complement: complementText,
              };
            });

            // Sort newest first
            movements.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

            // Detect phase
            let currentPhase = null;
            let lastMov = movements[0] || { date: '', description: 'Processo distribuído', complement: '' };

            for (const mov of movements) {
              const text = `${mov.description} ${mov.complement}`.toLowerCase();
              let bestPhase = null;
              let bestOrder = -1;
              
              for (const phase of ALL_PHASES) {
                if (phase.keywords.some((kw) => text.includes(kw)) && phase.order > bestOrder) {
                  bestPhase = phase;
                  bestOrder = phase.order;
                }
              }
              
              if (bestPhase) {
                currentPhase = bestPhase;
                break;
              }
            }

            if (!currentPhase) {
               // Fallback if no specific keyword matched
               currentPhase = ALL_PHASES.find(p => p.id === 'distribuicao');
            }

            if (currentPhase) {
               aggregatedResults[procNum] = {
                 client,
                 phase: currentPhase,
                 lastMovementDate: lastMov.date,
                 lastMovementDesc: lastMov.description,
               };
            }
          }
        }
      }
    }

    // 4. Group by Phase
    const phaseMap = new Map<string, PhaseGroup>();
    for (const phase of ALL_PHASES) {
      phaseMap.set(phase.id, { phase, clients: [] });
    }

    let unindexedClients = 0;

    for (const c of clientsWithProcess) {
       const norm = normalizeProcessNumber(c.numeroProcesso);
       const result = aggregatedResults[norm];
       if (result) {
          const group = phaseMap.get(result.phase.id);
          if (group) {
             group.clients.push({
               client: result.client,
               lastMovementDate: result.lastMovementDate,
               lastMovementDesc: result.lastMovementDesc,
             });
          }
       } else {
          unindexedClients++;
       }
    }

    // Convert map to sorted array
    const sortedPhases = Array.from(phaseMap.values())
      .filter(p => p.clients.length > 0)
      .sort((a, b) => b.phase.order - a.phase.order); // Highest order first

    const finalData = {
       totalProcessos: clientsWithProcess.length,
       encontrados: Object.keys(aggregatedResults).length,
       naoEncontrados: unindexedClients,
       fases: sortedPhases,
    };

    cacheData = finalData;
    cacheTime = Date.now();

    return NextResponse.json(finalData);

  } catch (error) {
    console.error('API /api/materias error:', error);
    return NextResponse.json({ error: 'Erro ao consolidar matérias' }, { status: 500 });
  }
}
