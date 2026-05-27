import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getClients, updateClientFields } from "@/lib/sheets";

export const dynamic = "force-dynamic";

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? "";

const UPDATES: Array<{ nome: string; funcao?: string; empresa?: string }> = [
  // --- FUNÇÃO ---
  { nome: "ADAUTO PEREIRA", funcao: "AGENTE DE HIGIENIZAÇÃO" },
  { nome: "ADRIANE CRISTINA DE OLIVEIRA", funcao: "AUXILIAR DE LOGISTICA" },
  { nome: "ALBERTO SOARES DE JESUS", funcao: "SERVENTE COMUM" },
  { nome: "ALEF RAMOS SANTANA", funcao: "AJUDANTE DE PEDREIRO" },
  { nome: "ALEX ALMEIDA ALENCAR", funcao: "OPERATION EXECUTION OU" },
  { nome: "AMANDA SIGOLI", funcao: "CUIDADORA" },
  { nome: "ANA CAROLINE SOUSA VIEIRA", funcao: "AUX. SERV GERAIS" },
  { nome: "ANA LUCIA DA SILVA CRUZ", funcao: "RECEPCIONISTA" },
  { nome: "ANA PAULA DAS NEVES SILVA", funcao: "OPERADOR DE COBRANÇA" },
  { nome: "ANA PAULA LIMA LOPES", funcao: "ATENDENTE DE MERCADO" },
  { nome: "ANDRE LUIZ SIQUEIRA DA CONCEICAO", funcao: "OPERADOR DE MAQUINA" },
  { nome: "BIANCA GABRIEL TAVARES", funcao: "ASSISTENTE ADMINISTRATIVO" },
  { nome: "BRENO LIMA DA SILVA", funcao: "AJUDANTE GERAL" },
  { nome: "BRUNO SOUZA DO NASCIMENTO", funcao: "AJUDANTE GERAL" },
  { nome: "CAMILA ALVES DE MIRANDA", funcao: "AUX LOGISTICO" },
  { nome: "CAMILA DE ASSIS FELIX", funcao: "OP DE MAQUINA" },
  { nome: "CARLOS ALEXANDRE MENEZES DA SILVA", funcao: "AJUDE DE GALVANOPLASTIA" },
  { nome: "CHRISTIANE RIBEIRO GOMES DE MELO", funcao: "AUXILIAR FINANCEIRO" },
  { nome: "CICERA MATOS DE OLIVEIRA AGUIAR", funcao: "AUXILIAR DE PRODUÇÃO" },
  { nome: "CIRO HENRIQUE ALVES PINHEIRO", funcao: "EXPERT EM INTERACAO II" },
  { nome: "CLAUDINEI JOSE GOMES", funcao: "MOTORISTA CARRETO" },
  { nome: "CLAYTON SOARES", funcao: "AJUDANTE DE PEDREIRO" },
  { nome: "CRISTIAN ERIC RENAN DOMINGOS", funcao: "ATENDENTE" },
  { nome: "CRISTIANE SANTOS DE MOURA FRANCISCO", funcao: "AUXILIAR DE LIMPEZA" },
  { nome: "CRISTIANO HENRIQUE SILVA DOMINGUES", funcao: "AJUDANTE DE PAVIMENTAÇÃO" },
  { nome: "DALVA MARIA DOS SANTOS", funcao: "AUXILIAR DE LIMPEZA" },
  { nome: "DANIELA DOS SANTOS SILVA", funcao: "AUXILIAR DE LOGISTICA" },
  { nome: "DANIELA SILVA SOARES", funcao: "RECEPCIONISTA" },
  { nome: "DANIELE CRISTINA SANTOS RIBEIRO", funcao: "COSTUREIRA JR" },
  { nome: "DANIELLI DA SILVA SANTANA", funcao: "ATENDENTE DE RESTAURANTE" },
  { nome: "DANIELLE CRISTINA COSTA", funcao: "OPERADOR DE PADARIA" },
  { nome: "DENER NARAZO SILVA", funcao: "COZINHEIRO A" },
  { nome: "DENILVOSN DE JESUS MENDES", funcao: "CONFERENTE" },
  { nome: "DENIS AUGUSTO SILVA", funcao: "AUXILIAR LOGISTICO" },
  { nome: "DIULA RAMOS DO ROSÁRIO", funcao: "AUXILIAR DE PRODUÇÃO" },
  { nome: "DOUGLAS MARQUES AUGUSTO DOS SANTOS", funcao: "AUXILIAR DE MECANICO" },
  { nome: "EDMILSON DE PAULA SANTOS", funcao: "MEIO OFICIAL DE AR CONDICIONADO" },
  { nome: "EDUARDA APARECIDA DOS SANTOS AZEVEDO", funcao: "ESPECIALISTA EM VENDAS" },
  { nome: "ELIANE SANTOS SOUZA", funcao: "CONTROLADOR DE ACESSO" },
  { nome: "EMERSON PEREIRA DE MENEZES", funcao: "CUMIM" },
  { nome: "EZEQUIEL SANTOS DE ALMEIDA", funcao: "PINTOR" },
  { nome: "FERNANDA DA SILVA LOPES", funcao: "AUXILIAR SERVIÇOS GERAIS" },
  { nome: "FERNANDA GUEDES DUARTE", funcao: "ASSISTENTE DE COBRANÇA" },
  { nome: "FRANCISCA NEILHA COSTA SILVA", funcao: "COORDENADORA DE TURNO" },
  { nome: "GABRIELLY EDUARDA ALVES", funcao: "RECEPCIONSTA" },
  { nome: "GABRIELLY STEFFANY LIMA BEZERRA", funcao: "AUXILIAR LOGISTICO" },
  { nome: "GESSIQUELE CRISTINA DA SILVA PEREIRA", funcao: "ATENDENTE" },
  { nome: "GUSTAVO CESAR LIMA PIMENTEL SILVA", funcao: "AUXILIAR DE LOGISTICA" },
  { nome: "GUSTAVO MONTEIRO DA CRUZ", funcao: "AUXILIAR DE SERVIÇOS DE INTERNET" },
  { nome: "HELIO TORRES RAMOS", funcao: "AUXILIAR DE LIMPEZA" },
  { nome: "HENRIQUE DINI NASCIMENTO", funcao: "AJUDANTE GERAL" },
  { nome: "IGOR LIONEL RESENDE", funcao: "AUXILIAR DE PRODUÇÃO JR" },
  { nome: "INGRID ROSA DA SILVA", funcao: "AUXILIAR DE SERVIÇOS GERAIS" },
  { nome: "INGRID ROSA DA SILVA SANTANA", funcao: "AUXILIAR DE PRODUÇÃO" },
  { nome: "JANAINA SOUZA ARRUDA", funcao: "ATENDENTE DE TELEMARKETING" },
  { nome: "JANAINA SOUZA SANTOS ARRUDA", funcao: "ATENDENTE" },
  { nome: "JAQUELINE DOS SANTOS LIMA", funcao: "AUXILIAR DE EXPEDIÇÃO" },
  { nome: "JAQUELINE KENNED XAVIER MARINHO", funcao: "AUXILIAR LOGISTICO" },
  { nome: "JESSICA SILVA COSTA", funcao: "TECNICO DE SEGURANÇA NO TRABALHO" },
  { nome: "JOANA D'ARCK PEREIRA DE NOVAES", funcao: "AUXILIAR DE SERVIÇOS GERAIS" },
  { nome: "JONNATHAN SOARES SENA", funcao: "AUXILIAR DE ABATE B" },
  { nome: "JORGE OLIVEIRA DA SILVA", funcao: "VIGILANTE" },
  { nome: "JOSE VANDECLEI COSTA", funcao: "AÇOUGUEIRO" },
  { nome: "JOSUE DE SÁ BATISTA", funcao: "ATEND DE RESTURANTE" },
  { nome: "JULIANA CRISTINA ASSUNÇÃO", funcao: "AGENTE DE NEGOCIO" },
  { nome: "JULIANA TEODORO MOREIRA", funcao: "AUXILIAR DE LIMPEZA" },
  { nome: "KAMILA ABRANTES MAXIMIANO", funcao: "OPERADORA DE CAIXA" },
  { nome: "KETHELYN DOS PRAZERES SANTOS", funcao: "EMBALADORA" },
  { nome: "KEVIN DELFINO", funcao: "OPERADOR" },
  { nome: "KLEBER DE CAMARGO FERRÃO", funcao: "CHEFE DE COZINHA" },
  { nome: "LAURY CKYMM HOLANDA DE LIMA", funcao: "PROMOTOR DE VENDAS" },
  { nome: "LIDIANA DOS SANTOS", funcao: "MERENDEIRA" },
  { nome: "LINCOLN XAVIER ALVES", funcao: "AUXILIAR DE DEPOSITO" },
  { nome: "LUCAS GUSTAVO SANTOS BEZERRA", funcao: "OP DE LOJA" },
  { nome: "LUCAS HENRIQUE DE SOUSA", funcao: "ANALISTA PLENO" },
  { nome: "LUCIVANIA BENEDITA DA SILVA", funcao: "AUXILIAR" },
  { nome: "LUIZ CLAUDIO DE ABREU", funcao: "CAPINEIRO" },
  { nome: "LUIZ FERNANDO CYPRIANO", funcao: "AUX DE LOJA" },
  { nome: "LUIZ PAULO MOREIRA DA SILVA", funcao: "OPERADOR DE CD" },
  { nome: "MARCELO CRISTIANO DA SILVA", funcao: "OPERADOR" },
  { nome: "MARCO VINICIUS HAKERMANN COSTA", funcao: "AUXILIAR LOGISTICO" },
  { nome: "MARCOS VINICIUS MOREIRA CAETANO VALI SERAFIM", funcao: "AUXILIAR DE LOGISTICA" },
  { nome: "MARIA ALDENIZE COSMA DA SILVA", funcao: "AGENTE DE HIGIENIZAÇÃO" },
  { nome: "MARIA ALDENIZE COSME DA SILVA", funcao: "LIDER DE LIMPEZA" },
  { nome: "MARIA DE FATIMA", funcao: "AJUDANTE DE COZINHA" },
  { nome: "MARIA DEISE SILVA", funcao: "AGENTE DE ATENDIMENTO" },
  { nome: "MARIA ELISANGELA", funcao: "CONSULTORA DE VENDAS" },
  { nome: "MARLEI GILSON DE OLIVEIRA", funcao: "AUXILIAR LOGISTICA" },
  { nome: "MATHEUS AUGUSTO SILVA", funcao: "AUX DE LOGISTICA" },
  { nome: "MATHEUS DE LUKA BARROS SOUZA", funcao: "SERVENTE" },
  { nome: "MATHEUS NUNES DE GODOY", funcao: "REPRESENTANTE DE ENVIOS" },
  { nome: "MAYARA SILVA", funcao: "OPERADOR DE CAIXA" },
  { nome: "MAYRA ALEN ALVES PINNHEIRO", funcao: "AUX DE VENDAS" },
  { nome: "MONIQUE PEREIRA BEZERRA", funcao: "CONSULTOR TECNICO DE FUNILARIA" },
  { nome: "NATALIA CUSTODIO DE MELO", funcao: "CONTROLADOR DE ACESSO" },
  { nome: "NATANAEL FERREIRA LIMA DOS SANTOS", funcao: "PORTEIRO" },
  { nome: "NELSON SOARES DA FONSECA JUNIOR", funcao: "AUXILIAR DE SERVIÇOS GERAIS" },
  { nome: "PATRICIA DE MORAES DUARTE", funcao: "AUXILIAR DE SERVIÇOS GERAIS" },
  { nome: "PAULO ROQUE BEZERRA DA SILVA", funcao: "OPERADOR DE LOGISTICO" },
  { nome: "PEDRO RODRIGUES DE LIMA FELIX", funcao: "PEDREIRO" },
  { nome: "PRISCILA BARBOSA DE OLIVEIRA", funcao: "AUXILIAR" },
  { nome: "RAFAEL DE CARVALHO FERREIRA", funcao: "CONTROLADOR DE ACESSO" },
  { nome: "RAFAEL LOMBARDI", funcao: "AUXILIAR DE PRODUÇÃO" },
  { nome: "RAFAEL MACHADO LEITE", funcao: "PROMOTOR DE VENDAS" },
  { nome: "RAFAELA RODRIGUES BENTO DE OLIVEIRA", funcao: "RECEPCIONISTA" },
  { nome: "RENATA CAETANO DE MORAES", funcao: "AUXILIAR DE SERVIÇOS GERAIS" },
  { nome: "RICHARD GALVÃO MARQUES", funcao: "ATENDENTE FECHADOR" },
  { nome: "RICHARD MARQUES DE SOUZA", funcao: "CONTROLADOR DE ACESSO" },
  { nome: "ROBERTA FRANCISTA DA SILVA ALMEIDA", funcao: "AUXILIAR DE EMBALAGEM" },
  { nome: "ROBERTO SILVA BARRETO DOS SANTOS", funcao: "OPERADOR DE LOJA" },
  { nome: "ROSILENE ROSEMEIRE PEREIRA DOS SANTOS", funcao: "RECEPCIONISTA" },
  { nome: "RUBENS DE OLIVEIRA SANTOS", funcao: "OPERATIONS EXECUTION" },
  { nome: "SABRINA FERRAZ DE MORAIS", funcao: "ANALISTA DE FINANCIMENTO" },
  { nome: "SARA ANACLETO", funcao: "OPERADOR DE LOGISTICA" },
  { nome: "SELMA DOS SANTOS SILVA GRAMATICO", funcao: "VENDEDORA" },
  { nome: "SHARON JANAINA VAZ CARLOS", funcao: "AJUDANTE DE LIMPEZA" },
  { nome: "SUELI LUIZ DE SOUZA REIS", funcao: "MEI OFICIAL" },
  { nome: "TELMA ROSA DOS SANTOS DA CRUZ", funcao: "EMPREGADO DOMESTICO" },
  { nome: "THAIS GABRIELE MIGUEL VIEIRA", funcao: "COSTUREIRA JR" },
  { nome: "THAIS PANTAS DA SILVA", funcao: "AJUDANTE DE PADEIRO" },
  { nome: "THALITA MARTINS DA SILVA LANA", funcao: "OPERADOR DE TELEMARKETING" },
  { nome: "THAMIRYS MOCILLO RIBEIRO DOS SANTOS", funcao: "ATENDENTE" },
  { nome: "THOMAS CORDEIRO DE SOUSA", funcao: "CONTROLADOR DE ACESSO" },
  { nome: "VASSIL DIAS JUNIOR", funcao: "AUXILIAR DE SERVIÇOS GERAIS" },
  { nome: "VINICIUS CESAR CORDEIRO", funcao: "AJUDANTE FRENTISTA" },
  { nome: "VIRGINIA SOARES FERREIRA", funcao: "AGENTE DE ASSEIO E CONSERVACAO" },
  { nome: "VIVIANE CRISTINA FRANCO LINS", funcao: "ATENDENTE" },
  { nome: "VLADIMIR GARCEZ MENDES DE ASSIS", funcao: "OPERADOR DE MAQUINA" },
  { nome: "WASHINGTON OLIVEIRA DE SANTANA", funcao: "AUXILIAR DE ESTOQUE" },
  { nome: "WERCULES SOARES RIBEIRO DO NASCIMENTO", funcao: "AJUDANTE" },
  { nome: "WESLEY COSTA DOS SANTOS", funcao: "CUMIN" },
  { nome: "ALAN JOSE FERNANDES DA SILVA", funcao: "OPERADOR DE ESTACIONAMENTO" },
  { nome: "ANA PAULA ALVES FEITOSA", funcao: "AUX DE LOGISTICA" },
  { nome: "ANA PAULA SANTOS SILVA", funcao: "CUIDADORA" },
  { nome: "BEATRIZ SOARES CARVALHO DOS SANTOS", funcao: "PORTEIRO" },
  { nome: "CAMILA LOPES FARIAS", funcao: "AUX LOGISTICO" },
  { nome: "CARLOS EDUARDO CURA", funcao: "GERENTE" },
  { nome: "CAROLINE DE SOUSA VIVEIROS", funcao: "AUXILIAR DE LIMPEZA" },
  { nome: "CICERA PATRICIA CHAVES DE MOURA", funcao: "OPERADORA DE CAIXA" },
  { nome: "CLEBER SILVA DE SOUZA", funcao: "SEGURANÇA" },
  { nome: "CRISTIANE RIBEIRO CLAUDINO", funcao: "AGENTE ASSEIO" },
  { nome: "DANIELA RESCH DA SILVA", funcao: "PROFESSORA" },
  { nome: "DAYANE SOUSA DE JESUS", funcao: "ASSISTENTE LOGISTICA" },
  { nome: "DILSON GOMES FEITOZA DE MACEDO", funcao: "AUX DE PRODUÇÃO" },
  { nome: "EDSON ROSA DE NOVAIS JUNIOR", funcao: "SEGURANÇA" },
  { nome: "GUILHERME DIAS PEDRO", funcao: "OPERADOR DE LOJA" },
  { nome: "HENRIQUE ENEZIER GOMES PIRES", funcao: "CONTROLADOR DE ACESSO" },
  { nome: "IVAN ALVES RODRIGUES SANTOS", funcao: "VIGILANTE" },
  { nome: "JEFERSON CLEISON DE SOUZA LIMA", funcao: "OPERADOR LOGISTICO" },
  { nome: "JESSICA CAROLINA DE OLIVEIRA GARCIA", funcao: "AUX DE ENFERMAGEM" },
  { nome: "JESSICA SAMARA DA SILVA FONSECA", funcao: "AJUDANTE DE PATIO SUCATA" },
  { nome: "JOAQUIM CARLOS CORREA SIQUEIRA DE CARVALHO", funcao: "PROFESSOR" },
  { nome: "KAREN ALESSANDRA PEREIRA DA SILVA", funcao: "BALCONISTA" },
  { nome: "KATIA TIEME CINTRA KANASHIRO", funcao: "AUX DE LIMPEZA" },
  { nome: "LARISSA SANTOS DA SILVA", funcao: "OPERADOR DE LOJA" },
  { nome: "LEANDRO DANILO MAIA DOS SANTOS", funcao: "AJUDANTE GERAL" },
  { nome: "LEANDRO LUCAS DE LIMA", funcao: "PORTEIRO" },
  { nome: "LINDOMAR VIEIRA DOS SANTOS", funcao: "OPERADOR DE MAQUINA" },
  { nome: "LUIZ FABYANO PACHECO", funcao: "PORTEIRO" },
  { nome: "MARCELA CAMPOS DA SILVA", funcao: "ANALISTA RECURSO HUMANOS" },
  { nome: "MARIA SIMONE TAVARES AVELINO", funcao: "OPERADOR DE LOJA" },
  { nome: "MARIANA OLYMPIO", funcao: "ANALISTA DE ATENDIMENTO" },
  { nome: "NATHALIA CRISTINA GENUINO COELHO", funcao: "BANHISTA" },
  { nome: "PRISCILLA ALVES FAGUNDES", funcao: "ATENDENTE" },
  { nome: "RAFAEL UELTON DE JESUS", funcao: "AUX LOGISTICO" },
  { nome: "STEFANIE PEDRO PACHECO", funcao: "COZINHEIRA" },
  { nome: "TAINARA SILVA ALMEIDA", funcao: "CONTROLADOR DE ACESSO" },
  { nome: "VALQUIRIA TERTO DALLACQUA", funcao: "ATENDENTE POSTAL" },
  { nome: "VIVIANE PEDRO", funcao: "COZINHEIRA ESCOLAR" },
  { nome: "WAGNER RODRIGUES PINTO", funcao: "AJUDANTE DE OBRA" },

  // --- EMPRESA ---
  { nome: "ABIGAIL CRISTHINE MOURA DOS SANTOS", empresa: "FORTHIA SOLUCOES EM SAUDE LTDA" },
  { nome: "ADILMA CABRAL DA SILVA", empresa: "EGITO SERVICES LTDA" },
  { nome: "ADRIANO DOS SANTOS", empresa: "AUTO POSTO GOLD STAR LTDA" },
  { nome: "ALENI CABRAL DA SILVA", empresa: "VALOR FACILITIES E TERCEIRIZACAO LTDA" },
  { nome: "ALESSANDRA DA SILVA ALMEIDA", empresa: "CSI SERVICOS TERCEIRIZADOS LTDA" },
  { nome: "ANDRÉ TEIXEIRA AGUILLAR DA SILVA", empresa: "TRADE E TALENTOS SOLUÇÕES EM TRADE E PESSOA SA" },
  { nome: "ANDREIA ELISABETE ESTEVAM OLIVEIRA", empresa: "SANDUICHES E SUCOS MEIO NATURAL LTDA - ME" },
  { nome: "ANDREIA ELOISA BARBOSA", empresa: "CB SANTO ANDRE COMERCIO DE ALIMENTOS LTDA" },
  { nome: "BARBARA GABRIELE SOUZA MARTINS", empresa: "C M RAMOS MERDINHO E CIA LTDA" },
  { nome: "BRENDA ALVES SILVA", empresa: "MAIS VISÃO INDUSTRIA OPTICA LTDA" },
  { nome: "BRENO YAGO DOS SANTOS GOMES", empresa: "A.A.AFONSO & CIA LTDA" },
  { nome: "BRUNA REGINA SOUZA CARVALHO", empresa: "MAIS VISÃO INDUSTRIA OPTICA LTDA" },
  { nome: "BRUNA WEBER DE SOUZA", empresa: "TELEPERFORMANCE CRM S.A" },
  { nome: "CANDIDA GISELE DA SILVA BATISTA", empresa: "BRASANITAS HOSPITALAR" },
  { nome: "CRISTIANE TEIXEIRA DE OLIVEIRA", empresa: "MK BR S.A" },
  { nome: "DEREK KAUA RODRIGUES NEVES", empresa: "MAIS VISÃO INDUSTRIA OPTICA LTDA" },
  { nome: "EDGARD FERREIRA DA SILVA", empresa: "NEIDE APARECIDA COIMBRA CENTRO AUTOMOTIVO" },
  { nome: "EDGELSON LIMA DOS SANTOS JUNIOR", empresa: "VENKI DO BRASIL INDUSTRIA E COMERCIO DE MANGUEIRAS E ARTEFATOS DE BORRACHA LTDA" },
  { nome: "EDSON DE OLIVEIRA SILVA", empresa: "JOTA ELE CONSTRUCOES CIVIS SA" },
  { nome: "EDUARDA MIGUEL DE ASSIS", empresa: "PLURIS MIDIA LTDA" },
  { nome: "ESTHER LUIZE DA CRUZ SANTOS", empresa: "M & B PINHEIRAO HORTIFRUTI LTDA" },
  { nome: "EVERTON BUENO DA SILVA", empresa: "VIVA SERVICOS LTDA" },
  { nome: "FELIPE NOGUEIRA OLIMPIO", empresa: "CONECTA EMPREENDIMENTOS LTDA" },
  { nome: "FELIPE VICENTE ALVES", empresa: "SUNRISE PRESTACAO DE SERVICOS LTDA" },
  { nome: "FERNANDA MARA FERREIRA", empresa: "COMERCIAL REDE PLUS 3 LTDA" },
  { nome: "GABRIELA LEITE DA SILVA", empresa: "VERZANI & SANDRINI S.A" },
  { nome: "GABRIELY LIBANO DOS SANTOS", empresa: "AYACHE EXPRESS COMERCIO LTDA" },
  { nome: "GABRIELY VICTORIA MACARIO DE SOUSA", empresa: "M & B PINHEIRAO HORTIFRUTI LTDA" },
  { nome: "GABRYEL LEVI DA SILVA", empresa: "TROLL - LOCACAO E COMERCIO DE MATERIAIS PARA CONSTRUCAO LTDA" },
  { nome: "GILVANETE DE LIMA MASCARENHAS", empresa: "E. L. CORREA LTDA" },
  { nome: "HUGO HENRIQUE DE ARAUJO LIMA", empresa: "PLASTFER GERENCIAMENTO AMBIENTAL LTDA" },
  { nome: "IVAN JUNIOR SANTOS ALMEIDA", empresa: "FLAMEX - COMERCIO, IMPORTACAO E EXPORTACAO LTDA" },
  { nome: "JENIFER MAYARA DOS SANTOS DE LIMA", empresa: "ASSOCIACAO EDUCACIONAL DA JUVENTUDE - ASSEJ" },
  { nome: "JOÃO BATISTA ROCHA DA CONCEIÇÃO", empresa: "RM SOLUÇÕES EM CONSTRUÇÃO" },
  { nome: "JOSEMAR ARIMATEA DE SOUSA BRITO", empresa: "PRATIC POLPAS & CONGELADOS LTDA" },
  { nome: "JOSIVALDO FERREIRA DA SILVA", empresa: "THADEU GABRIEL SOARES SALES" },
  { nome: "KAROLINA PEREIRA DA SILVA", empresa: "WHEATON PINTURA E BENEFICIAMENTO DE VIDROS LTDA" },
  { nome: "KATIA MARIA DA SILVA SOUZA", empresa: "RIO BRANCO PROMOCAO DE VENDAS LTDA" },
  { nome: "LEANDRO ROBERDA DA SILVA", empresa: "ARC MEDICINA E SEGURANCA DO TRABALHO LTDA" },
  { nome: "LUCAS LEON DA SILVA GOMES", empresa: "CONECTA EMPREENDIMENTOS LTDA" },
  { nome: "LUZIA TRINDADE DOS SANTOS", empresa: "MAIS VISÃO INDUSTRIA OPTICA LTDA" },
  { nome: "MAICON FLAVIO DA SILVA SANTOS", empresa: "LIDERANCA EXPRESS TRANSPORTES LTDA" },
  { nome: "MAIKON DA SILVA", empresa: "AT & SANTOS CONSULTORIA E SERVICOS LTDA" },
  { nome: "MARIA LAURA DOS SANTOS DA VEIGA", empresa: "PLS APOIO ADMINISTRATIVO LTDA" },
  { nome: "MARIANA DA SILVA SOUSA", empresa: "PLURIS MIDIA LTDA" },
  { nome: "MATHEUS SILVA SOUZA", empresa: "PLURIS MIDIA LTDA" },
  { nome: "MAYARA SABRINA VIEIRA DA SILVA DE JESUS", empresa: "PLS APOIO ADMINISTRATIVO LTDA" },
  { nome: "MELANY PEREIRA CIRIA", empresa: "NADIA PACHE PECHTOLL" },
  { nome: "MICHELLE FRANCISCO DE ALMEIDA PIRES", empresa: "MERCADO BOM DIA LTDA" },
  { nome: "NAGILA SABRINA DA SILVA CHIARELLI", empresa: "DANILO ACAI E DISTRIBUIDORA LTDA" },
  { nome: "NICOLAS DAVISSON DA SILVA", empresa: "GX EMPREITEIRA LTDA" },
  { nome: "PAMELA MONIQUE GARCIA", empresa: "CORBAM COMERCIO DE ARTIGOS DE CERAMICAS LTDA" },
  { nome: "PAULO RODRIGO MEDEIROS MARQUES", empresa: "FM2C SERVICOS VOLANTES LTDA" },
  { nome: "PRISCILA ALVES GONSALEZ", empresa: "WMS SUPERMERCADOS DO BRASIL" },
  { nome: "RAFAEL MOURA MENDES DOS SANTOS", empresa: "FM2C SERVICOS VOLANTES LTDA" },
  { nome: "RAFAEL NEIVA SANTOS", empresa: "L&L SANTOS CONSTRUCOES LTDA" },
  { nome: "RAFAELA DO NASCIMENTO RODRIGUES DOS SANTOS", empresa: "RCA PRODUTOS E SERVICOS LTDA" },
  { nome: "REGIANE DOS SANTOS MELO", empresa: "P.R.M. SERVICOS E MAO DE OBRA ESPECIALIZADA LTDA" },
  { nome: "RIVALDO SOUSA DA SILVA", empresa: "GENESIS REFRIGERAÇÃO LTDA" },
  { nome: "ROSANGELA NEUZA CAVALCANTE", empresa: "MAIS VISÃO INDUSTRIA OPTICA LTDA" },
  { nome: "ROSILENE BARROS LIMA", empresa: "ASSOCIAICAO EDUCACIONAL DA JUVENTUDE - ASSEJ" },
  { nome: "RUAN ISAAC ALVES PEREIRA", empresa: "CHELSEA PANIFICADORA LTDA" },
  { nome: "TAINÁ SILVA PAIVA BORGES", empresa: "APETECE SISTEMAS DE ALIMENTAÇÃO S.A" },
  { nome: "THAINA LIMA VIVEIROS", empresa: "TRIANA EDUCACAO LTDA" },
  { nome: "VAGNA DA SILVA MACIEL", empresa: "COOP- COOPERATIVA DE CONSUMO" },
  { nome: "VANESSA ALVES NEVES", empresa: "MAIS VISAO INDUSTRIA OPTICA LTDA" },
  { nome: "VITOR CANDIDO CORREA", empresa: "AJL SERVICOS E FACILITIES LTDA" },
  { nome: "WALACE FONSECA COSTA", empresa: "TMKT SERVICOS DE MARKETING LTDA" },
  { nome: "WALLAS SANTOS GONCALVES", empresa: "CLIMA RECURSOS HUMANOS LTDA" },
  { nome: "WANDERLEY TOMAZ DA SILVA COSTA", empresa: "SEGURPRO TECNOLOGIA EM SISTEMAS DE SEGURANCA ELETRONICA E INCENDIOS LTDA" },
  { nome: "WILLIAM PEREIRA LEAL", empresa: "EJMALVES GESSO" },
  { nome: "YASMIM MARIA OLIVEIRA REIS VIANA", empresa: "LIGIA BERNARDO DO SANTOS CONFCCOES" },
];

function normalize(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessToken = session.accessToken;
    const allClients = await getClients(accessToken, SPREADSHEET_ID);

    const log: string[] = [];
    let updated = 0, notFound = 0, skipped = 0;

    for (const update of UPDATES) {
      const normalizedName = normalize(update.nome);

      const client = allClients.find((c) => {
        const n = normalize(c.nome);
        return n === normalizedName || n.includes(normalizedName) || normalizedName.includes(n);
      });

      if (!client) {
        log.push(`❌ NÃO ENCONTRADO: ${update.nome}`);
        notFound++;
        continue;
      }

      const fields: { empresa?: string; funcao?: string } = {};
      let needsUpdate = false;

      if (update.funcao && (!client.funcao || client.funcao.trim() === "")) {
        fields.funcao = update.funcao;
        needsUpdate = true;
      }

      if (update.empresa && (!client.empresa || client.empresa.trim() === "")) {
        fields.empresa = update.empresa;
        needsUpdate = true;
      }

      if (!needsUpdate) {
        log.push(`⏭ ${client.nome}: já possui função="${client.funcao}" empresa="${client.empresa}"`);
        skipped++;
        continue;
      }

      const success = await updateClientFields(accessToken, SPREADSHEET_ID, client.id, fields);

      if (success) {
        updated++;
        const parts = [];
        if (fields.funcao) parts.push(`função="${fields.funcao}"`);
        if (fields.empresa) parts.push(`empresa="${fields.empresa}"`);
        log.push(`✅ ${client.nome} (row ${client.id}): ${parts.join(", ")}`);
      } else {
        log.push(`❌ ERRO ao atualizar: ${client.nome}`);
      }

      await new Promise((r) => setTimeout(r, 200));
    }

    return NextResponse.json({ updated, notFound, skipped, total: UPDATES.length, log });
  } catch (error) {
    console.error("Batch update error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal error" }, { status: 500 });
  }
}
