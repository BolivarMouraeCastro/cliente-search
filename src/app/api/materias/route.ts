import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { ALL_PHASES, PhaseConfig } from '@/lib/phases';
import { getSheetsService } from '@/lib/google-auth';

export const dynamic = 'force-dynamic';

const DATAJUD_API_KEY = process.env.DATAJUD_API_KEY || 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
const DATAJUD_BASE_URL = 'https://api-publica.datajud.cnj.jus.br';
const HEARINGS_SPREADSHEET_ID = process.env.HEARINGS_SPREADSHEET_ID ?? '1eXJz8UCQImJIqaEHe8V8cwuuJ0YkABviUzz7wOQdFVA';

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

// Data structure for a process entry from the hearings spreadsheet
interface HearingProcess {
  reclamante: string;
  reclamada: string;
  numeroProcesso: string;
  advogado: string;
}

export interface PhaseGroup {
  phase: PhaseConfig;
  processes: {
    reclamante: string;
    reclamada: string;
    numeroProcesso: string;
    advogado: string;
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

    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
    }

    // 1. READ process numbers from HEARINGS SPREADSHEET (READ-ONLY, no changes)
    const sheets = getSheetsService(session.accessToken);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: HEARINGS_SPREADSHEET_ID,
      range: 'A:H',
      valueRenderOption: 'FORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });

    const rows = response.data.values;
    if (!rows || rows.length <= 1) {
      return NextResponse.json({
        totalProcessos: 0, encontrados: 0, naoEncontrados: 0, fases: [],
      });
    }

    // 2. Extract UNIQUE process numbers from hearings (Column E = index 4)
    //    Also keep reclamante (C=2), reclamada (D=3), advogado (H=7) for display
    const processMap = new Map<string, HearingProcess>();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const processNumber = (row[4] ?? '').trim();
      if (!processNumber) continue;

      // Deduplicate by process number (keep first occurrence)
      if (!processMap.has(processNumber)) {
        processMap.set(processNumber, {
          reclamante: (row[2] ?? '').trim(),
          reclamada: (row[3] ?? '').trim(),
          numeroProcesso: processNumber,
          advogado: (row[7] ?? '').trim(),
        });
      }
    }

    const uniqueProcesses = Array.from(processMap.values());

    // 3. Group by TRT
    const trtGroups: Record<string, HearingProcess[]> = {};
    for (const proc of uniqueProcesses) {
      const trt = detectTRT(proc.numeroProcesso);
      if (!trtGroups[trt]) trtGroups[trt] = [];
      trtGroups[trt].push(proc);
    }

    // 4. Query DataJud in PARALLEL batches per TRT (to avoid Vercel timeout)
    const aggregatedResults: Record<string, any> = {};

    // Build all fetch promises first
    const fetchPromises: Promise<void>[] = [];

    for (const [trt, trtProcesses] of Object.entries(trtGroups)) {
      const endpoint = TRT_ENDPOINTS[trt] || 'api_publica_trt2';

      const normalizedMap = new Map(
        trtProcesses.map(p => [normalizeProcessNumber(p.numeroProcesso), p])
      );
      const normalizedNumbers = Array.from(normalizedMap.keys());

      // Chunks of 50
      const chunkSize = 50;
      for (let i = 0; i < normalizedNumbers.length; i += chunkSize) {
        const chunk = normalizedNumbers.slice(i, i + chunkSize);

        const url = `${DATAJUD_BASE_URL}/${endpoint}/_search`;
        const body = {
          query: { terms: { numeroProcesso: chunk } },
          size: chunk.length,
        };

        const promise = fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `APIKey ${DATAJUD_API_KEY}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(8000), // 8s timeout per request
        })
          .then(async (res) => {
            if (!res.ok) return;
            const data = await res.json();
            const hits = data?.hits?.hits || [];

            for (const hit of hits) {
              const source = hit._source;
              const procNum = source.numeroProcesso;
              const proc = normalizedMap.get(procNum);
              if (!proc) continue;

              const rawMovements = source.movimentos || source.movimentacoes || [];

              const movements = rawMovements.map((mov: any) => {
                const desc = (mov.nome as string) || (mov.descricao as string) || '';
                const complementos = (mov.complementosTabelados as Array<{ descricao?: string; nome?: string }>) || [];
                const complementText = complementos.map((c: any) => c.descricao || c.nome || '').filter(Boolean).join('; ');
                return { date: (mov.dataHora as string) || '', description: desc, complement: complementText };
              });

              movements.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

              // Detect phase
              let currentPhase = null;
              const lastMov = movements[0] || { date: '', description: 'Processo distribuído', complement: '' };

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
                currentPhase = ALL_PHASES.find(p => p.id === 'distribuicao');
              }

              if (currentPhase) {
                aggregatedResults[procNum] = {
                  proc,
                  phase: currentPhase,
                  lastMovementDate: lastMov.date,
                  lastMovementDesc: lastMov.description,
                };
              }
            }
          })
          .catch((fetchErr) => {
            console.error(`DataJud fetch error for ${trt}:`, fetchErr);
          });

        fetchPromises.push(promise);
      }
    }

    // Run all fetches in parallel
    await Promise.allSettled(fetchPromises);

    // 5. Group by Phase
    const phaseMap = new Map<string, PhaseGroup>();
    for (const phase of ALL_PHASES) {
      phaseMap.set(phase.id, { phase, processes: [] });
    }

    let unindexedCount = 0;

    for (const proc of uniqueProcesses) {
      const norm = normalizeProcessNumber(proc.numeroProcesso);
      const result = aggregatedResults[norm];
      if (result) {
        const group = phaseMap.get(result.phase.id);
        if (group) {
          group.processes.push({
            reclamante: result.proc.reclamante,
            reclamada: result.proc.reclamada,
            numeroProcesso: result.proc.numeroProcesso,
            advogado: result.proc.advogado,
            lastMovementDate: result.lastMovementDate,
            lastMovementDesc: result.lastMovementDesc,
          });
        }
      } else {
        unindexedCount++;
      }
    }

    const sortedPhases = Array.from(phaseMap.values())
      .filter(p => p.processes.length > 0)
      .sort((a, b) => b.phase.order - a.phase.order);

    const finalData = {
      totalProcessos: uniqueProcesses.length,
      encontrados: Object.keys(aggregatedResults).length,
      naoEncontrados: unindexedCount,
      fases: sortedPhases,
    };

    cacheData = finalData;
    cacheTime = Date.now();

    return NextResponse.json(finalData);

  } catch (error) {
    console.error('API /api/materias error:', error);
    const message = error instanceof Error ? error.message : 'Erro interno do servidor';
    return NextResponse.json({ error: `Erro ao consolidar matérias: ${message}` }, { status: 500 });
  }
}

