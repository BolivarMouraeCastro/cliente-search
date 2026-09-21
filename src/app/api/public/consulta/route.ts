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
  // São Paulo Capital
  'barra funda': 'Av. Marquês de São Vicente, 235 – Barra Funda, São Paulo/SP',
  'ruy barbosa': 'Av. Marquês de São Vicente, 235 – Barra Funda, São Paulo/SP',
  'santo amaro': 'Av. Guido Caloi, 1000 – Santo Amaro, São Paulo/SP',
  'zona sul': 'Av. Guido Caloi, 1000 – Santo Amaro, São Paulo/SP',
  'guido caloi': 'Av. Guido Caloi, 1000 – Santo Amaro, São Paulo/SP',
  // Grande São Paulo
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
  // São Paulo Capital - Varas por número (1ª a 92ª VT ficam em fóruns específicos)
  // 1ª a 59ª VT → Barra Funda
  // 60ª a 70ª VT → Zona Sul (Santo Amaro)
};

function findAddress(orgaoJulgador: string): string {
  const lower = orgaoJulgador.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // Check direct matches
  for (const [key, address] of Object.entries(FORUM_ADDRESSES)) {
    const normalizedKey = key.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (lower.includes(normalizedKey)) return address;
  }
  
  // Try to detect by VT number for São Paulo
  const vtMatch = lower.match(/(\d+)[ªºa]\s*(vt|vara)/i);
  if (vtMatch) {
    const vtNum = parseInt(vtMatch[1]);
    if (vtNum >= 60 && vtNum <= 70) {
      return FORUM_ADDRESSES['santo amaro'];
    }
    if (vtNum >= 1 && vtNum <= 59) {
      return FORUM_ADDRESSES['barra funda'];
    }
  }
  
  return ''; // Endereço não encontrado
}

// Inferir fase processual baseado nos dados disponíveis
function inferPhase(status: string, hearings: any[]): { fase: string; proximoPasso: string } {
  const futureHearings = hearings.filter(h => h.isFuture);
  const pastHearings = hearings.filter(h => !h.isFuture);
  
  const statusUpper = (status || '').toUpperCase().trim();
  
  // Se tem audiência futura
  if (futureHearings.length > 0) {
    const next = futureHearings[0];
    const tipo = (next.tipoAudiencia || '').toUpperCase();
    if (tipo.includes('CONCILIA')) {
      return { fase: 'Audiência de Conciliação Agendada', proximoPasso: 'Sua audiência de conciliação está marcada. Compareça no dia e horário indicados.' };
    }
    if (tipo.includes('INSTRU')) {
      return { fase: 'Audiência de Instrução Agendada', proximoPasso: 'Sua audiência de instrução está marcada. Compareça com os documentos e testemunhas necessários.' };
    }
    if (tipo.includes('JULGA')) {
      return { fase: 'Audiência de Julgamento Agendada', proximoPasso: 'Sua audiência de julgamento está marcada.' };
    }
    return { fase: 'Audiência Agendada', proximoPasso: 'Você tem uma audiência agendada. Verifique os detalhes abaixo.' };
  }
  
  // Se tem audiências passadas mas nenhuma futura
  if (pastHearings.length > 0) {
    const lastHearing = pastHearings[pastHearings.length - 1];
    const tipo = (lastHearing.tipoAudiencia || '').toUpperCase();
    if (tipo.includes('CONCILIA')) {
      return { fase: 'Pós-Conciliação', proximoPasso: 'A audiência de conciliação já foi realizada. Aguardando designação de audiência de instrução ou sentença.' };
    }
    if (tipo.includes('INSTRU')) {
      return { fase: 'Aguardando Sentença', proximoPasso: 'A audiência de instrução já foi realizada. Seu processo está com o juiz para decisão. Prazo estimado: 30 a 90 dias.' };
    }
    if (tipo.includes('JULGA')) {
      return { fase: 'Pós-Julgamento', proximoPasso: 'O julgamento já foi realizado. Aguardando publicação da decisão.' };
    }
  }
  
  // Baseado no status
  if (statusUpper === 'DISTRIBUÍDO' || statusUpper === 'DISTRIBUIDO') {
    return { fase: 'Processo Distribuído', proximoPasso: 'Seu processo foi distribuído à vara trabalhista. Aguardando citação da empresa reclamada.' };
  }
  if (statusUpper === 'A FAZER' || statusUpper === 'FAZER INICIAL') {
    return { fase: 'Elaboração da Inicial', proximoPasso: 'Estamos preparando sua petição inicial para distribuição.' };
  }
  if (statusUpper === 'ARQUIVADO') {
    return { fase: 'Processo Encerrado', proximoPasso: 'Seu processo foi encerrado/arquivado.' };
  }
  
  return { fase: 'Em Andamento', proximoPasso: 'Seu processo está em andamento. Entre em contato com o escritório para mais detalhes.' };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const cpfRaw = searchParams.get('cpf') || '';
    const cpfDigits = cpfRaw.replace(/\D/g, '');
    
    if (cpfDigits.length !== 11) {
      return NextResponse.json({ error: 'CPF inválido. Informe os 11 dígitos.' }, { status: 400 });
    }
    
    const token = await getAdminAccessToken();
    const sheets = getSheetsService(token);
    
    // 1. Buscar nome pelo CPF na aba Contatos
    const contatosRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Contatos!A:D',
    });
    
    const contatoRows = contatosRes.data.values || [];
    let clientName = '';
    let clientPhone = '';
    
    for (const row of contatoRows.slice(1)) {
      const nome = (row[0] || '').trim();
      const cpf = (row[1] || '').replace(/\D/g, '');
      const tel = (row[2] || '').trim();
      if (cpf === cpfDigits && nome) {
        clientName = nome;
        clientPhone = tel;
        break;
      }
    }
    
    if (!clientName) {
      return NextResponse.json({ found: false, error: 'CPF não encontrado em nossos registros.' });
    }
    
    // 2. Buscar dados do cliente na planilha principal usando getClients
    const allClients = await getClients(token, CLIENT_SPREADSHEET_ID);
    
    const normalizedSearchName = clientName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    
    const matchedClient = allClients.find(c => {
      const normalizedNome = c.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      return normalizedNome === normalizedSearchName || 
             normalizedNome.includes(normalizedSearchName) || 
             normalizedSearchName.includes(normalizedNome);
    });
    
    let clientData: any = null;
    if (matchedClient) {
      clientData = {
        entrada: matchedClient.entrada,
        nome: matchedClient.nome,
        status: matchedClient.status,
        materia: matchedClient.materia,
        responsavel: matchedClient.responsavel,
        empresa: matchedClient.empresa,
        numeroProcesso: matchedClient.numeroProcesso,
      };
    }
    
    if (!clientData) {
      return NextResponse.json({
        found: true,
        nome: clientName,
        message: 'Encontramos seu cadastro, porém os dados do processo ainda não foram vinculados. Entre em contato com o escritório.',
      });
    }
    
    // 3. Buscar audiências
    const allHearings = await getAllHearings(token);
    const normalizedName = clientName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    
    const clientHearings = allHearings.filter(h => {
      const hName = h.reclamante.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      if (clientData.numeroProcesso && h.numeroProcesso) {
        return h.numeroProcesso.includes(clientData.numeroProcesso) || clientData.numeroProcesso.includes(h.numeroProcesso);
      }
      return hName === normalizedName || hName.includes(normalizedName) || normalizedName.includes(hName);
    });
    
    // Sort by date
    clientHearings.sort((a, b) => {
      const parseD = (d: string) => {
        const p = d.split('/');
        if (p.length !== 3) return 0;
        return new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0])).getTime();
      };
      return parseD(a.dataAudiencia) - parseD(b.dataAudiencia);
    });
    
    const futureHearings = clientHearings.filter(h => h.isFuture);
    
    // 4. Detect modalidade (online/presencial) from tipoAudiencia text
    // Blue color in spreadsheet = online, but we can also check text
    const nextHearing = futureHearings.length > 0 ? futureHearings[0] : null;
    
    let modalidade = 'Presencial';
    let endereco = '';
    
    if (nextHearing) {
      const tipo = (nextHearing.tipoAudiencia || '').toUpperCase();
      const orgao = (nextHearing.orgaoJulgador || '').toUpperCase();
      
      // Detect online/telepresencial
      if (tipo.includes('TELE') || tipo.includes('VIRTUAL') || tipo.includes('ONLINE') || 
          tipo.includes('REMOT') || tipo.includes('VIDEOCONF') ||
          orgao.includes('TELE') || orgao.includes('VIRTUAL')) {
        modalidade = 'Online (Telepresencial)';
      }
      
      endereco = findAddress(nextHearing.orgaoJulgador);
    }
    
    // 5. Infer phase
    const { fase, proximoPasso } = inferPhase(clientData.status, clientHearings);
    
    // 6. Build response
    return NextResponse.json({
      found: true,
      nome: clientData.nome,
      cpf: cpfDigits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'),
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
      whatsappEscritorio: '5511999999999', // Número do escritório
    });
    
  } catch (error) {
    console.error('Erro na consulta pública:', error);
    return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 });
  }
}
