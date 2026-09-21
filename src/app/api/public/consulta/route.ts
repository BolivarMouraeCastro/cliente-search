import { NextRequest, NextResponse } from 'next/server';
import { getAdminAccessToken } from '@/lib/admin-token';
import { getSheetsService } from '@/lib/google-auth';
import { getAllHearings } from '@/lib/hearings';
import { getClients } from '@/lib/sheets';

export const dynamic = 'force-dynamic';

const SPREADSHEET_ID = '11ni1pXu0QbPQ_QmMGxdqdT4PsDNz6Z0ITBUW-E1ogMM';
const CLIENT_SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? '';

// Mapeamento de Varas/Fóruns → Endereços (TRT-2 e região)
const FORUM_ADDRESSES: Record<string, string> = {
  'barra funda': 'Av. Marquês de São Vicente, 235 – Barra Funda, São Paulo/SP',
  'ruy barbosa': 'Av. Marquês de São Vicente, 235 – Barra Funda, São Paulo/SP',
  'santo amaro': 'Av. Guido Caloi, 1000 – Santo Amaro, São Paulo/SP',
  'zona sul': 'Av. Guido Caloi, 1000 – Santo Amaro, São Paulo/SP',
  'guido caloi': 'Av. Guido Caloi, 1000 – Santo Amaro, São Paulo/SP',
  'guarulhos': 'Av. Tiradentes, 1125 – Guarulhos/SP',
  'osasco': 'Av. Dionysia Alves Barreto, 59 – Centro, Osasco/SP',
  'barueri': 'Alameda Araguaia, 2096 – Alphaville Industrial, Barueri/SP',
  'diadema': 'Av. Alda, 411 – Centro, Diadema/SP',
  'maua': 'Rua Manoel Pedro Júnior, 298 – Vila Bocaina, Mauá/SP',
  'mauá': 'Rua Manoel Pedro Júnior, 298 – Vila Bocaina, Mauá/SP',
  'mogi': 'Av. Ver. Narciso Yague Guimarães, 149 – Centro, Mogi das Cruzes/SP',
  'santos': 'Rua Amador Bueno, 333, 10º andar – Centro, Santos/SP',
  'são bernardo': 'Av. Getúlio Vargas, 57 – Centro, São Bernardo do Campo/SP',
  'sao bernardo': 'Av. Getúlio Vargas, 57 – Centro, São Bernardo do Campo/SP',
  'são caetano': 'Rua Baraldi, 795 – Centro, São Caetano do Sul/SP',
  'sao caetano': 'Rua Baraldi, 795 – Centro, São Caetano do Sul/SP',
  'suzano': 'Rua Paraná, 69 – Jardim Paulista, Suzano/SP',
  'taboão': 'Estrada São Francisco, 1061 – Centro, Taboão da Serra/SP',
  'taboao': 'Estrada São Francisco, 1061 – Centro, Taboão da Serra/SP',
};

function findAddress(orgaoJulgador: string): string {
  const lower = orgaoJulgador.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [key, address] of Object.entries(FORUM_ADDRESSES)) {
    const normalizedKey = key.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (lower.includes(normalizedKey)) return address;
  }
  const vtMatch = lower.match(/(\d+)[ªºa]\s*(vt|vara)/i);
  if (vtMatch) {
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

  // Step 3: Buscar dados do processo
  let clientData: any = null;
  try {
    const sid = CLIENT_SPREADSHEET_ID || process.env.GOOGLE_SPREADSHEET_ID || '';
    if (sid) {
      const allClients = await getClients(token, sid);
      const searchN = normalize(clientName);
      const match = allClients.find(c => {
        const n = normalize(c.nome);
        return n === searchN || n.includes(searchN) || searchN.includes(n);
      });
      if (match) {
        clientData = {
          entrada: match.entrada, nome: match.nome, status: match.status,
          materia: match.materia, responsavel: match.responsavel,
          empresa: match.empresa, numeroProcesso: match.numeroProcesso,
        };
      }
    }
  } catch (e: any) {
    console.error('Consulta Step3 clients:', e?.message);
  }

  if (!clientData) {
    return NextResponse.json({
      found: true, nome: clientName, cpf: cpfFormatted,
      message: 'Encontramos seu cadastro, porém os dados do processo ainda não foram vinculados. Entre em contato com o escritório.',
    });
  }

  // Step 4: Audiências
  let clientHearings: any[] = [];
  try {
    const all = await getAllHearings(token);
    const searchN = normalize(clientName);
    clientHearings = all.filter(h => {
      if (clientData.numeroProcesso && h.numeroProcesso) {
        return h.numeroProcesso.includes(clientData.numeroProcesso) || clientData.numeroProcesso.includes(h.numeroProcesso);
      }
      const hN = normalize(h.reclamante);
      return hN === searchN || hN.includes(searchN) || searchN.includes(hN);
    });
    clientHearings.sort((a, b) => {
      const p = (d: string) => { const s = d.split('/'); return s.length === 3 ? new Date(+s[2], +s[1]-1, +s[0]).getTime() : 0; };
      return p(a.dataAudiencia) - p(b.dataAudiencia);
    });
  } catch (e: any) {
    console.error('Consulta Step4 hearings:', e?.message);
  }

  const nextHearing = clientHearings.filter(h => h.isFuture)[0] || null;
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

  const { fase, proximoPasso } = inferPhase(clientData.status, clientHearings);

  return NextResponse.json({
    found: true,
    nome: clientData.nome,
    cpf: cpfFormatted,
    numeroProcesso: clientData.numeroProcesso || null,
    status: clientData.status || null,
    empresa: clientData.empresa || null,
    entrada: clientData.entrada || null,
    materia: clientData.materia || null,
    advogado: clientData.responsavel || null,
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
  });
}
