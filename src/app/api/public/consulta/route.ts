import { NextRequest, NextResponse } from 'next/server';
import { getAdminAccessToken } from '@/lib/admin-token';
import { getSheetsService } from '@/lib/google-auth';
import { getAllHearings } from '@/lib/hearings';
import { getClients } from '@/lib/sheets';

export const dynamic = 'force-dynamic';

const SPREADSHEET_ID = '11ni1pXu0QbPQ_QmMGxdqdT4PsDNz6Z0ITBUW-E1ogMM';
const CLIENT_SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? '';

// Mapeamento de Varas/Fóruns → Endereços (TRT-2 e região) - Fonte oficial: ww2.trt2.jus.br
const FORUM_ADDRESSES: Record<string, string> = {
  // São Paulo Capital
  'barra funda': 'Av. Marquês de São Vicente, 235 – Barra Funda, São Paulo/SP',
  'ruy barbosa': 'Av. Marquês de São Vicente, 235 – Barra Funda, São Paulo/SP',
  'santo amaro': 'Av. Guido Caloi, 1000 – Santo Amaro, São Paulo/SP',
  'zona sul': 'Av. Guido Caloi, 1000 – Santo Amaro, São Paulo/SP',
  'guido caloi': 'Av. Guido Caloi, 1000 – Santo Amaro, São Paulo/SP',
  // ABC
  'santo andre': 'Rua Monte Casseros, 259 – Centro, Santo André/SP',
  'santo andré': 'Rua Monte Casseros, 259 – Centro, Santo André/SP',
  'sao bernardo': 'Av. Getúlio Vargas, 57 – Centro, São Bernardo do Campo/SP',
  'são bernardo': 'Av. Getúlio Vargas, 57 – Centro, São Bernardo do Campo/SP',
  'sao caetano': 'Rua Baraldi, 795 – Centro, São Caetano do Sul/SP',
  'são caetano': 'Rua Baraldi, 795 – Centro, São Caetano do Sul/SP',
  'diadema': 'Av. Sete de Setembro, 919 – Centro, Diadema/SP – CEP 09912-010 (Fórum Juiz Ugo Recchimuzzi)',
  'maua': 'Rua Manoel Pedro Júnior, 298 – Vila Bocaina, Mauá/SP',
  'mauá': 'Rua Manoel Pedro Júnior, 298 – Vila Bocaina, Mauá/SP',
  'ribeirao pires': 'Rua Monte Casseros, 259 – Centro, Santo André/SP',
  'ribeirão pires': 'Rua Monte Casseros, 259 – Centro, Santo André/SP',
  'rio grande da serra': 'Rua Monte Casseros, 259 – Centro, Santo André/SP',
  // Grande SP
  'guarulhos': 'Av. Tiradentes, 1125 – Centro, Guarulhos/SP',
  'osasco': 'Av. Dionysia Alves Barreto, 59 – Centro, Osasco/SP',
  'barueri': 'Alameda Araguaia, 2096 – Alphaville Industrial, Barueri/SP',
  'mogi': 'Av. Ver. Narciso Yague Guimarães, 149 – Centro, Mogi das Cruzes/SP',
  'suzano': 'Rua Paraná, 69 – Jardim Paulista, Suzano/SP',
  'taboao': 'Estrada São Francisco, 1061 – Centro, Taboão da Serra/SP',
  'taboão': 'Estrada São Francisco, 1061 – Centro, Taboão da Serra/SP',
  'cotia': 'Av. Rotary, 175 – Centro, Cotia/SP',
  'itapecerica': 'Rua Recife, 15 – Parque Paraíso, Itapecerica da Serra/SP',
  'carapicuiba': 'Av. Mirian, 55 – Carapicuíba/SP',
  'carapicuíba': 'Av. Mirian, 55 – Carapicuíba/SP',
  'franco da rocha': 'Rua 15 de Novembro, 100 – Centro, Franco da Rocha/SP',
  'aruja': 'Rua José Basílio, 205 – Centro, Arujá/SP',
  'arujá': 'Rua José Basílio, 205 – Centro, Arujá/SP',
  // Baixada Santista
  'santos': 'Rua Amador Bueno, 333, 10º andar – Centro, Santos/SP',
  'guaruja': 'Rua Amador Bueno, 333, 10º andar – Centro, Santos/SP',
  'guarujá': 'Rua Amador Bueno, 333, 10º andar – Centro, Santos/SP',
  'cubatao': 'Rua Amador Bueno, 333, 10º andar – Centro, Santos/SP',
  'cubatão': 'Rua Amador Bueno, 333, 10º andar – Centro, Santos/SP',
  'praia grande': 'Rua Amador Bueno, 333, 10º andar – Centro, Santos/SP',
  'sao vicente': 'Rua Amador Bueno, 333, 10º andar – Centro, Santos/SP',
  'são vicente': 'Rua Amador Bueno, 333, 10º andar – Centro, Santos/SP',
};

function findAddress(orgaoJulgador: string): string {
  const lower = orgaoJulgador.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // FIRST: check city/forum names (most specific match)
  for (const [key, address] of Object.entries(FORUM_ADDRESSES)) {
    const normalizedKey = key.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (lower.includes(normalizedKey)) return address;
  }
  // THEN: fallback by VT number for São Paulo Capital ONLY (not cities)
  const vtMatch = lower.match(/(\d+)[ªºa]\s*(vt|vara)/i);
  if (vtMatch && !lower.match(/santo|bernardo|caetano|diadema|maua|guarulhos|osasco|barueri|mogi|suzano|santos|taboao|cotia|aruja|franco/)) {
    const vtNum = parseInt(vtMatch[1]);
    if (vtNum >= 60 && vtNum <= 70) return FORUM_ADDRESSES['santo amaro'];
    if (vtNum >= 1 && vtNum <= 59) return FORUM_ADDRESSES['barra funda'];
  }
  return '';
}

function inferPhase(status: string, hearings: any[], numeroProcesso?: string): { fase: string; proximoPasso: string } {
  const futureHearings = hearings.filter(h => h.isFuture);
  const pastHearings = hearings.filter(h => !h.isFuture);
  const statusUpper = (status || '').toUpperCase().trim();
  const hasProcesso = !!(numeroProcesso && numeroProcesso.trim());

  // Prioridade 1: Audiência futura
  if (futureHearings.length > 0) {
    const tipo = (futureHearings[0].tipoAudiencia || '').toUpperCase();
    if (tipo.includes('CONCILIA')) return { fase: 'Audiência de Conciliação Agendada', proximoPasso: 'Sua audiência de conciliação está marcada. Compareça no dia e horário indicados.' };
    if (tipo.includes('INSTRU')) return { fase: 'Audiência de Instrução Agendada', proximoPasso: 'Sua audiência de instrução está marcada. Compareça com os documentos e testemunhas necessários.' };
    if (tipo.includes('JULGA')) return { fase: 'Audiência de Julgamento Agendada', proximoPasso: 'Sua audiência de julgamento está marcada.' };
    return { fase: 'Audiência Agendada', proximoPasso: 'Você tem uma audiência agendada. Verifique os detalhes abaixo.' };
  }

  // Prioridade 2: Audiência passada
  if (pastHearings.length > 0) {
    const tipo = (pastHearings[pastHearings.length - 1].tipoAudiencia || '').toUpperCase();
    if (tipo.includes('CONCILIA')) return { fase: 'Pós-Conciliação', proximoPasso: 'A audiência de conciliação já foi realizada. Aguardando designação de audiência de instrução ou sentença.' };
    if (tipo.includes('INSTRU') || tipo.includes('UNA')) return { fase: 'Aguardando Sentença', proximoPasso: 'A audiência já foi realizada. Seu processo está com o juiz para decisão. Prazo estimado: 30 a 90 dias.' };
    if (tipo.includes('JULGA')) return { fase: 'Pós-Julgamento', proximoPasso: 'O julgamento já foi realizado. Aguardando publicação da decisão.' };
    return { fase: 'Audiência Realizada', proximoPasso: 'A audiência já foi realizada. Aguardando próximos andamentos do processo.' };
  }

  // Prioridade 3: Status da planilha, MAS com correção automática
  if (statusUpper.includes('DISTRIBU')) return { fase: 'Processo Distribuído', proximoPasso: 'Seu processo foi distribuído à vara trabalhista. Aguardando citação da empresa reclamada.' };
  if (statusUpper === 'ARQUIVADO') return { fase: 'Processo Encerrado', proximoPasso: 'Seu processo foi encerrado/arquivado.' };

  // Se tem número de processo mas status diz "FAZER INICIAL" → já foi distribuído
  if (hasProcesso && (statusUpper === 'A FAZER' || statusUpper.includes('FAZER INICIAL') || statusUpper.includes('INICIAL'))) {
    return { fase: 'Processo Distribuído', proximoPasso: 'Seu processo foi distribuído à vara trabalhista. Aguardando citação da empresa reclamada.' };
  }

  // Se tem número de processo e status está vazio ou genérico → distribuído
  if (hasProcesso) {
    return { fase: 'Processo Distribuído', proximoPasso: 'Seu processo foi distribuído à vara trabalhista. Aguardando andamento processual.' };
  }

  // Sem número de processo
  if (statusUpper === 'A FAZER' || statusUpper.includes('FAZER INICIAL')) {
    return { fase: 'Elaboração da Inicial', proximoPasso: 'Estamos preparando sua petição inicial para distribuição.' };
  }

  return { fase: 'Em Andamento', proximoPasso: 'Seu processo está em andamento. Entre em contato com o escritório para mais detalhes.' };
}

function normalize(str: string): string {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ found: false, error: 'Dados inválidos.' }, { status: 400 });
  }

  const cpfDigits = (body.cpf || '').replace(/\D/g, '');

  if (cpfDigits.length !== 11) {
    return NextResponse.json({ found: false, error: 'CPF inválido. Informe os 11 dígitos.' }, { status: 400 });
  }

  // Step 1: Token
  let token: string;
  try {
    token = await getAdminAccessToken();
  } catch (e: any) {
    console.error('Consulta Step1 token:', e?.message);
    return NextResponse.json({ found: false, error: 'Erro de autenticação do servidor.' }, { status: 500 });
  }

  // Step 2: Buscar CPF na PlanilhaClientes — coletar TODAS as linhas (uma por processo)
  let clientName = '';
  let contatoProcessos: string[] = []; // números de processo extraídos das colunas
  let sheets;
  try {
    sheets = getSheetsService(token);
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'PlanilhaClientes!A:C',
    });
    for (const row of (res.data.values || []).slice(1)) {
      const nome = (row[0] || '').trim();
      const cpf = (row[1] || '').replace(/\D/g, '');
      if (cpf === cpfDigits && nome) {
        if (!clientName) clientName = nome;
        const processo = (row[2] || '').trim();
        if (processo && !contatoProcessos.includes(processo)) {
          contatoProcessos.push(processo);
        }
      }
    }
  } catch (e: any) {
    console.error('Consulta Step2 planilhaclientes:', e?.message);
  }

  // Fallback para buscar nome no Contatos se não estiver na Planilha de Clientes
  if (!clientName) {
    try {
      if (!sheets) sheets = getSheetsService(token);
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Contatos!A:B',
      });
      for (const row of (res.data.values || []).slice(1)) {
        const nome = (row[0] || '').trim();
        const cpf = (row[1] || '').replace(/\D/g, '');
        if (cpf === cpfDigits && nome) {
          clientName = nome;
          break;
        }
      }
    } catch (e: any) {
      console.error('Consulta Step2 contatos fallback:', e?.message);
    }
  }

  if (!clientName) {
    return NextResponse.json({ found: false, error: 'CPF não encontrado em nossos registros.' });
  }

  // Log de acesso (async, não bloqueia a resposta)
  logAccess(token, clientName, cpfDigits).catch(e => console.error('Log acesso erro:', e?.message));

  const cpfFormatted = cpfDigits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');

  // Step 3: Buscar TODOS os processos do cliente
  let allMatchedClients: any[] = [];
  try {
    const sid = CLIENT_SPREADSHEET_ID || process.env.GOOGLE_SPREADSHEET_ID || '';
    if (sid) {
      const allClients = await getClients(token, sid);
      const searchN = normalize(clientName);
      
      if (contatoProcessos.length > 0) {
        // Match PRIORITÁRIO: usar números do processo dos Contatos
        for (const procNum of contatoProcessos) {
          // Primeiro tenta achar pelo número do processo na planilha de clientes
          const byProcess = allClients.find(c => {
            if (!c.numeroProcesso) return false;
            return c.numeroProcesso.replace(/\D/g, '').includes(procNum.replace(/\D/g, '')) ||
                   procNum.replace(/\D/g, '').includes(c.numeroProcesso.replace(/\D/g, ''));
          });
          if (byProcess) {
            allMatchedClients.push(byProcess);
          } else {
            // Se não encontrou na planilha, criar entrada com dados do Contatos
            allMatchedClients.push({
              nome: clientName,
              entrada: '',
              status: 'DISTRIBUÍDO',
              empresa: '',
              materia: '',
              responsavel: '',
              funcao: '',
              numeroProcesso: procNum,
            });
          }
        }
      }
      
      // Fallback: se não achou pelo processo, buscar por nome
      if (allMatchedClients.length === 0) {
        allMatchedClients = allClients.filter(c => {
          const n = normalize(c.nome);
          return n === searchN || n.includes(searchN) || searchN.includes(n);
        });
      }
    }
  } catch (e: any) {
    console.error('Consulta Step3 clients:', e?.message);
  }

  // Step 3.5: Se não achou na planilha, buscar pasta do cliente no Drive (processos distribuídos)
  if (allMatchedClients.length === 0) {
    const DRIVE_DISTRIBUIDOS_2026 = process.env.DRIVE_DISTRIBUIDOS_2026_FOLDER_ID || '1UZboUcb7IoZKcEWKYKMwy9o_v6JWNMFj';
    // Futuramente: DRIVE_DISTRIBUIDOS_2025 = process.env.DRIVE_DISTRIBUIDOS_2025_FOLDER_ID || '';
    const folderIds = [DRIVE_DISTRIBUIDOS_2026]; // adicionar 2025 aqui quando tiver

    try {
      const { getDriveService } = await import('@/lib/google-auth');
      const drive = getDriveService(token);
      const searchN = normalize(clientName);
      const nameParts = searchN.split(' ');
      const lastName = nameParts[nameParts.length - 1];

      for (const parentFolderId of folderIds) {
        if (!parentFolderId) continue;

        // Buscar subpastas que contenham o sobrenome do cliente
        const res = await drive.files.list({
          q: `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name contains '${lastName.toUpperCase()}' and trashed = false`,
          fields: 'files(id, name, createdTime)',
          pageSize: 50,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });

        const folders = res.data.files || [];
        for (const folder of folders) {
          const folderNameNorm = normalize(folder.name || '');
          // Verificar se é realmente do cliente — TODOS os nomes devem estar na pasta
          const allPartsMatch = nameParts.length >= 2 && nameParts.every(part => part.length > 2 ? folderNameNorm.includes(part) : true);
          if (allPartsMatch) {
            // Extrair número do processo do nome da pasta se possível
            // Padrão CNJ: 0001234-56.2026.5.02.0001
            const cnjMatch = (folder.name || '').match(/(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/);
            const numeroProcesso = cnjMatch ? cnjMatch[1] : '';

            // Buscar arquivos dentro da pasta para entender mais
            let empresa = '';
            let docs: string[] = [];
            try {
              const filesRes = await drive.files.list({
                q: `'${folder.id}' in parents and trashed = false`,
                fields: 'files(name, mimeType)',
                pageSize: 50,
                supportsAllDrives: true,
                includeItemsFromAllDrives: true,
              });
              docs = (filesRes.data.files || []).map(f => f.name || '');

              // Tentar extrair empresa do nome da pasta
              const pastaName = folder.name || '';
              const vsMatch = pastaName.match(/\s+(?:x|vs?\.?|contra)\s+(.+)/i);
              if (vsMatch) {
                empresa = vsMatch[1].replace(/\s*-\s*\d{7}.*$/, '').trim();
              }
            } catch { /* ignore */ }

            // Inferir fase pelos documentos encontrados
            let faseFromDocs = 'Processo Distribuído';
            let proximoPasso = 'Seu processo foi distribuído à vara trabalhista. Aguardando citação da empresa reclamada.';
            const docsUpper = docs.map(d => d.toUpperCase());

            if (docsUpper.some(d => d.includes('ACORDO'))) {
              faseFromDocs = 'Acordo Realizado';
              proximoPasso = 'O processo foi encerrado por acordo.';
            } else if (docsUpper.some(d => d.startsWith('RO') || d.includes('RECURSO ORDINARIO') || d.includes('RECURSO ORDINÁRIO'))) {
              faseFromDocs = 'Fase Recursal';
              proximoPasso = 'Houve sentença e estamos recorrendo para buscar um resultado melhor.';
            } else if (docsUpper.some(d => d.includes('SENTENCA') || d.includes('SENTENÇA'))) {
              faseFromDocs = 'Sentença Proferida';
              proximoPasso = 'A sentença foi proferida pelo juiz. Seu advogado está analisando os próximos passos.';
            } else if (docsUpper.some(d => d.includes('ATA') && d.includes('INSTRUCAO'))) {
              faseFromDocs = 'Audiência de Instrução Realizada';
              proximoPasso = 'A audiência de instrução foi realizada. Aguardando sentença do juiz.';
            } else if (docsUpper.some(d => d.includes('ATA') && d.includes('CONCILIA'))) {
              faseFromDocs = 'Audiência de Conciliação Realizada';
              proximoPasso = 'A audiência de conciliação foi realizada. Aguardando próximos andamentos.';
            }

            allMatchedClients.push({
              nome: clientName,
              entrada: folder.createdTime ? new Date(folder.createdTime).toLocaleDateString('pt-BR') : '',
              status: 'DISTRIBUÍDO',
              empresa: empresa || '',
              materia: '',
              responsavel: '',
              funcao: '',
              numeroProcesso,
              _faseFromDocs: faseFromDocs,
              _proximoPassoFromDocs: proximoPasso,
              _docsEncontrados: docs,
            });
          }
        }
      }
    } catch (e: any) {
      console.error('Consulta Step3.5 Drive search:', e?.message);
    }
  }

  if (allMatchedClients.length === 0) {
    return NextResponse.json({
      found: true, nome: clientName, cpf: cpfFormatted, processos: [],
      message: 'Encontramos seu cadastro, porém os dados do processo ainda não foram vinculados. Entre em contato com o escritório.',
    });
  }

  // Deduplicate by processo number — keep entry with most data
  const deduped = new Map<string, any>();
  for (const c of allMatchedClients) {
    const key = (c.numeroProcesso || '').trim() || `_no_proc_${Math.random()}`;
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, c);
    } else {
      // Keep the one with more data filled (empresa, materia)
      const score = (x: any) => (x.empresa ? 1 : 0) + (x.materia ? 1 : 0) + (x.responsavel ? 1 : 0) + (x.entrada ? 1 : 0);
      if (score(c) > score(existing)) deduped.set(key, c);
    }
  }
  allMatchedClients = Array.from(deduped.values());

  // Step 4: Audiências (buscar todas de uma vez)
  let allHearings: any[] = [];
  try {
    allHearings = await getAllHearings(token);
  } catch (e: any) {
    console.error('Consulta Step4 hearings:', e?.message);
  }

  // Step 5: Montar dados para cada processo
  const processos = allMatchedClients.map(client => {
    const searchN = normalize(clientName);
    // Buscar audiências deste processo específico
    const processHearings = allHearings.filter(h => {
      // 1. Match por número do processo (mais confiável)
      if (client.numeroProcesso && h.numeroProcesso) {
        return h.numeroProcesso.includes(client.numeroProcesso) || client.numeroProcesso.includes(h.numeroProcesso);
      }
      
      // 2. Match pelo Reclamante
      const hN = normalize(h.reclamante);
      const isSameClient = hN === searchN || hN.includes(searchN) || searchN.includes(hN);
      if (!isSameClient) return false;

      // 3. Como não tem número de processo, verificar se a Empresa (Reclamada) bate
      // Isso evita que um cliente com 2 processos contra empresas diferentes puxe a mesma audiência
      if (client.empresa && h.reclamada) {
        const cleanEmp = normalize(client.empresa).replace(/[^a-z0-9 ]/g, '');
        const cleanRec = normalize(h.reclamada).replace(/[^a-z0-9 ]/g, '');
        const empWords = cleanEmp.split(' ').filter(w => w.length > 2);
        const recWords = cleanRec.split(' ').filter(w => w.length > 2);
        
        if (empWords.length > 0 && recWords.length > 0) {
           // Se a primeira palavra principal for diferente E uma não estiver contida na outra
           if (empWords[0] !== recWords[0] && !cleanRec.includes(empWords[0]) && !cleanEmp.includes(recWords[0])) {
             return false; // Empresa não bate, então essa audiência não é desse processo
           }
        }
      }

      return true; // Passou em todas as validações
    });
    processHearings.sort((a: any, b: any) => {
      const p = (d: string) => { const s = d.split('/'); return s.length === 3 ? new Date(+s[2], +s[1]-1, +s[0]).getTime() : 0; };
      return p(a.dataAudiencia) - p(b.dataAudiencia);
    });

    const nextHearing = processHearings.filter((h: any) => h.isFuture)[0] || null;
    let modalidade = 'Presencial';
    let endereco = '';

    if (nextHearing) {
      const tipo = (nextHearing.tipoAudiencia || '').toUpperCase();
      const orgao = (nextHearing.orgaoJulgador || '').toUpperCase();
      if (tipo.includes('TELE') || tipo.includes('VIRTUAL') || tipo.includes('ONLINE') || tipo.includes('REMOT') || orgao.includes('TELE') || orgao.includes('VIRTUAL')) {
        modalidade = 'Online (Telepresencial)';
      }
      endereco = findAddress(nextHearing.orgaoJulgador);
    }

    // Usar fase do Drive se disponível (Step 3.5), senão inferir da planilha
    let fase: string;
    let proximoPasso: string;
    if (client._faseFromDocs) {
      fase = client._faseFromDocs;
      proximoPasso = client._proximoPassoFromDocs || '';
    } else {
      const inferred = inferPhase(client.status, processHearings, client.numeroProcesso);
      fase = inferred.fase;
      proximoPasso = inferred.proximoPasso;
    }

    // Audiências passadas (já ocorridas)
    const pastHearings = processHearings.filter((h: any) => !h.isFuture).map((h: any) => ({
      data: h.dataAudiencia,
      horario: h.horario,
      tipo: h.tipoAudiencia,
      orgaoJulgador: h.orgaoJulgador,
      advogado: h.advogado,
      status: 'Realizada',
    }));

    return {
      numeroProcesso: client.numeroProcesso || null,
      empresa: client.empresa || null,
      entrada: client.entrada || null,
      materia: client.materia || null,
      advogado: client.responsavel || null,
      fase,
      proximoPasso,
      audiencia: nextHearing ? {
        data: nextHearing.dataAudiencia,
        horario: nextHearing.horario,
        tipo: nextHearing.tipoAudiencia,
        orgaoJulgador: nextHearing.orgaoJulgador,
        modalidade,
        endereco,
        advogado: nextHearing.advogado,
        reclamada: nextHearing.reclamada || '',
      } : null,
      audienciasPassadas: pastHearings,
    };
  });

  return NextResponse.json({
    found: true,
    nome: allMatchedClients[0].nome,
    cpf: cpfFormatted,
    processos,
  });
}

async function logAccess(token: string, nome: string, cpf: string) {
  try {
    const sheets = getSheetsService(token);
    const now = new Date();
    const dataHora = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const data = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const hora = now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const cpfFormatted = cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');

    // Ensure Acessos tab exists
    try {
      await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: 'Acessos!A1' });
    } catch {
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
      const sheetExists = spreadsheet.data.sheets?.some(s => s.properties?.title === 'Acessos');
      if (!sheetExists) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: { requests: [{ addSheet: { properties: { title: 'Acessos' } } }] },
        });
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: 'Acessos!A1:E1',
          valueInputOption: 'RAW',
          requestBody: { values: [['NOME', 'CPF', 'DATA', 'HORA', 'DATA_HORA']] },
        });
      }
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Acessos!A:E',
      valueInputOption: 'RAW',
      requestBody: { values: [[nome, cpfFormatted, data, hora, dataHora]] },
    });
  } catch (e: any) {
    console.error('logAccess error:', e?.message);
  }
}
