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
  'diadema': 'Av. Alda, 411 – Centro, Diadema/SP',
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

function inferPhase(status: string, hearings: any[]): { fase: string; proximoPasso: string } {
  const futureHearings = hearings.filter(h => h.isFuture);
  const pastHearings = hearings.filter(h => !h.isFuture);
  const statusUpper = (status || '').toUpperCase().trim();

  if (futureHearings.length > 0) {
    const tipo = (futureHearings[0].tipoAudiencia || '').toUpperCase();
    if (tipo.includes('CONCILIA')) return { fase: 'Audiência de Conciliação Agendada', proximoPasso: 'Sua audiência de conciliação está marcada. Compareça no dia e horário indicados.' };
    if (tipo.includes('INSTRU')) return { fase: 'Audiência de Instrução Agendada', proximoPasso: 'Sua audiência de instrução está marcada. Compareça com os documentos e testemunhas necessários.' };
    if (tipo.includes('JULGA')) return { fase: 'Audiência de Julgamento Agendada', proximoPasso: 'Sua audiência de julgamento está marcada.' };
    return { fase: 'Audiência Agendada', proximoPasso: 'Você tem uma audiência agendada. Verifique os detalhes abaixo.' };
  }

  if (pastHearings.length > 0) {
    const tipo = (pastHearings[pastHearings.length - 1].tipoAudiencia || '').toUpperCase();
    if (tipo.includes('CONCILIA')) return { fase: 'Pós-Conciliação', proximoPasso: 'A audiência de conciliação já foi realizada. Aguardando designação de audiência de instrução ou sentença.' };
    if (tipo.includes('INSTRU')) return { fase: 'Aguardando Sentença', proximoPasso: 'A audiência de instrução já foi realizada. Seu processo está com o juiz para decisão. Prazo estimado: 30 a 90 dias.' };
    if (tipo.includes('JULGA')) return { fase: 'Pós-Julgamento', proximoPasso: 'O julgamento já foi realizado. Aguardando publicação da decisão.' };
  }

  if (statusUpper.includes('DISTRIBU')) return { fase: 'Processo Distribuído', proximoPasso: 'Seu processo foi distribuído à vara trabalhista. Aguardando citação da empresa reclamada.' };
  if (statusUpper === 'A FAZER' || statusUpper.includes('FAZER INICIAL')) return { fase: 'Elaboração da Inicial', proximoPasso: 'Estamos preparando sua petição inicial para distribuição.' };
  if (statusUpper === 'ARQUIVADO') return { fase: 'Processo Encerrado', proximoPasso: 'Seu processo foi encerrado/arquivado.' };

  return { fase: 'Em Andamento', proximoPasso: 'Seu processo está em andamento. Entre em contato com o escritório para mais detalhes.' };
}

function normalize(str: string): string {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cpfDigits = (searchParams.get('cpf') || '').replace(/\D/g, '');

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

  // Step 2: Buscar CPF nos Contatos
  let clientName = '';
  try {
    const sheets = getSheetsService(token);
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Contatos!A:C',
    });
    for (const row of (res.data.values || []).slice(1)) {
      const nome = (row[0] || '').trim();
      const cpf = (row[1] || '').replace(/\D/g, '');
      if (cpf === cpfDigits && nome) { clientName = nome; break; }
    }
  } catch (e: any) {
    console.error('Consulta Step2 contatos:', e?.message);
    return NextResponse.json({ found: false, error: 'Erro ao buscar contatos.' }, { status: 500 });
  }

  if (!clientName) {
    return NextResponse.json({ found: false, error: 'CPF não encontrado em nossos registros.' });
  }

  const cpfFormatted = cpfDigits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');

  // Step 3: Buscar TODOS os processos do cliente
  let allMatchedClients: any[] = [];
  try {
    const sid = CLIENT_SPREADSHEET_ID || process.env.GOOGLE_SPREADSHEET_ID || '';
    if (sid) {
      const allClients = await getClients(token, sid);
      const searchN = normalize(clientName);
      allMatchedClients = allClients.filter(c => {
        const n = normalize(c.nome);
        return n === searchN || n.includes(searchN) || searchN.includes(n);
      });
    }
  } catch (e: any) {
    console.error('Consulta Step3 clients:', e?.message);
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
      if (client.numeroProcesso && h.numeroProcesso) {
        return h.numeroProcesso.includes(client.numeroProcesso) || client.numeroProcesso.includes(h.numeroProcesso);
      }
      const hN = normalize(h.reclamante);
      return hN === searchN || hN.includes(searchN) || searchN.includes(hN);
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

    const { fase, proximoPasso } = inferPhase(client.status, processHearings);

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
      } : null,
    };
  });

  return NextResponse.json({
    found: true,
    nome: allMatchedClients[0].nome,
    cpf: cpfFormatted,
    processos,
  });
}
