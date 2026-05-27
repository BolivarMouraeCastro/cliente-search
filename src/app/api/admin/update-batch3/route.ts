import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getClients, updateClientFields } from "@/lib/sheets";

export const dynamic = "force-dynamic";

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? "";

const UPDATES: Array<{ nome: string; funcao?: string; empresa?: string }> = [
  // --- FUNÇÃO ---
  { nome: "ALINE APARECIDA ALEIXO DE CARVALHO FREITAS", funcao: "AJUDANTE GERAL" },
  { nome: "ANDRÉ DE SOUZA PEREIRA", funcao: "OPERADOR DE ESTACIONAMENTO" },
  { nome: "BRUNO ALVES DOS SANTOS", funcao: "PEDREIRO" },
  { nome: "CARLOS ALEXANDRE SANTOS SILVA", funcao: "PINTOR DE OBRA" },
  { nome: "CLEBERSON BATISTA SANTOS", funcao: "CARGA E DECARGA" },
  { nome: "DANIELA DE OLIVEIRA RAMALHO", funcao: "ENCARREGADO DE LIMPEZA" },
  { nome: "ELAINE APARECIDA OLIVEIRA DA SILVA", funcao: "AUXILIAR DE SERVICOS GERAIS" },
  { nome: "ELAINE PINHEIRO SOARES DA SILVA", funcao: "AUX DE LIMPEZA" },
  { nome: "FABIO JUNIOR CAMARGO", funcao: "PROMOTOR DE VENDAS" },
  { nome: "FABIO TORRISI DA SILVA", funcao: "SOLDADOR MONTADOR" },
  { nome: "JESSICA APARECIDA PEREIRA DA SILVA", funcao: "OPERATIONS EXECUTION" },
  { nome: "JOÃO GUSTAVO PEREIRA DE PAULA", funcao: "CONTROLADOR DE ACESSO" },
  { nome: "JORGE HENRIQUE SANTOS DE SOUSA", funcao: "AJUDANTE GERAL" },
  { nome: "JOSÉ ALVES SOBRINHO", funcao: "AGENTE DE ATENDIMENTO" },
  { nome: "KAIQUE MACHADO ALVES BEZERRA", funcao: "PEDREIRO" },
  { nome: "LUCAS RODRIGO DA SILVA", funcao: "AJUDANTE DE MECÂNICO DE AR CONDICIONADO" },
  { nome: "MÁRCIO DE PAULA DIAS", funcao: "OPERADOR DE ESTACIONAMENTO" },
  { nome: "MARCOS ANTONIO CORREIA DA SILVA", funcao: "CONTROLADOR ACESSO" },
  { nome: "MAXWEL CONCEICAO DE SOUZA", funcao: "AUX DE LINHA DE PRODUCAO" },
  { nome: "PAULO FELIPE DUARTE JUNIOR", funcao: "AJUDANTE DE PIZZAIOLO" },
  { nome: "PRISCILA APARECIDA", funcao: "ENCARREGADO DE LIMPEZA" },
  { nome: "RAFAEL FREITAS CUTOLO", funcao: "FORNEIRO" },
  { nome: "RODRIGO RIBEIRO LEITE", funcao: "OPERADOR DE DOBRADEIRA JR" },
  { nome: "SARA GOES DE CARVALHO", funcao: "OPERADOR DE LOJA" },
  { nome: "STEFFANY SANTOS MARQUES", funcao: "APLICADORA DE LASER" },
  { nome: "THAIS DA SILVA SANTOS", funcao: "AUXILIAR DE LIMPEZA" },

  // --- EMPRESA ---
  { nome: "ADRIANO MATEUS ZUCCONI", empresa: "GOCIL SERVICOS DE VIGILANCIA E SEGURANCA LTDA - EM RECUPERACAO JUDICIAL" },
  { nome: "ADRIELLE FERNANDA DA SILVA MATIAS", empresa: "C.M- COMERCIO VAREJISTA DE HORTIFRUTIGRANJEIROS LTDA" },
  { nome: "AMANDA CRISTINA ARAUJO", empresa: "INSTITUTO CULTURAL E CIDADANIA SANTA RITA" },
  { nome: "ANA PAULA ALVES DE SOUZA", empresa: "CP FONTES RESTAURANTE E CHOPERIA LTDA" },
  { nome: "ANDREA CRISTINA LEAL DE SOUZA", empresa: "RIO BRANCO PROMOÇÃO DE VENDAS LTDA" },
  { nome: "BIANCA FALCAO CORDEIRO", empresa: "PLURIS MIDIA LTDA" },
  { nome: "CAMILA SANTOS DA CUNHA", empresa: "GOCIL SERVICOS GERAIS LTDA EM RECUPERACAO JUDICIAL" },
  { nome: "CARLOS ROBERTO DOS SANTOS", empresa: "SABESP-MAUA" },
  { nome: "CRISTIANE RIBEIRO CLAUDINO", empresa: "ASSERVO MULTISSERVICOS LTDA" },
  { nome: "DANIELE ALVES CONSERVA", empresa: "CABANA BURGER S.A" },
  { nome: "DAYANE CRISTINA DOS SANTOS", empresa: "CLEAR SERVICOS E PROMOCOES LTDA" },
  { nome: "EDNEI ALVES BESSA", empresa: "ASSOC UNIAO BENEF DAS IRMAS DE S VICENTE PAULO GYSEGEM" },
  { nome: "ELZA SOTARELI", empresa: "FUNDACAO DO ABC" },
  { nome: "ERIK ALEXANDRE SILVA", empresa: "GARAGE 88 LAVA AUTOS" },
  { nome: "GABRIEL DE SOUZA NERES", empresa: "R & F CHICAO REPRESENTACAO COMERCIAL LTDA" },
  { nome: "GEOVANA CRISTINA BEZERRA DE AZEVEDO", empresa: "SENDAS DISTRIBUIDORA SA" },
  { nome: "GUSTAVO SANTOS DA PAIXAO", empresa: "HL COMERCIO DE AGUA MINERAL" },
  { nome: "JAILSON SOARES DA SILVA", empresa: "MOBILEGAL LOGISTICA LTDA" },
  { nome: "JANE KELLY DA SILVA FREITAS", empresa: "RITECH SOLUCOES EM RECURSOS HUMANOS LTDA" },
  { nome: "JOSE CICERO DOS SANTOS", empresa: "JOTA ELE CONSTRUÇÕES CIVIS SA" },
  { nome: "JOSE DE OLIVEIRA", empresa: "MOBILEGAL LOGISTICA LTDA" },
  { nome: "KEMILY CAROLINE GOMES MANCILLA", empresa: "PCA POSTO DE COLETA AVANCADO LTDA" },
  { nome: "LEMOS DIONISIO DE SOUZA ALVES", empresa: "ENGEDESTE PARK ESTACIONAMENTO LTDA" },
  { nome: "LEONARDO AGUIAR DOS SANTOS", empresa: "CABANA BURGER S.A" },
  { nome: "LIGIA DE SOUZA FREIRE", empresa: "SETMAN ENGENHARIA LTDA" },
  { nome: "LUANDA MARIA TAVARES RODRIGUES", empresa: "BIANCA DE PAULA" },
  { nome: "LUIZ FERNANDO DA SILVA CHAVES", empresa: "JOTAEME - FITAFER INDUSTRIA METALURGICA LTDA" },
  { nome: "MAGALI GREGORIO DE OLIVEIRA CORREIA", empresa: "VENTECH MOTORES DO BRASIL LTDA" },
  { nome: "MARCOS VINICIUS DA SILVA MENDES", empresa: "GPM INDUSTRIA E COMERCIO DE EQUIPAMENTOS CONTRA INCENDIO LTDA" },
  { nome: "MARGARETE CELEDONIO DE LIMA", empresa: "ANDREENSE MOTOS COMERCIAL LTDA" },
  { nome: "MARIA EDUARDA LOPES DE OLIVEIRA", empresa: "DROGARIA POUPAITAIMSIL TRES LTDA - ME" },
  { nome: "MARIA JULIA DE ALMEIDA GUIMARAES", empresa: "LOJA DO BENEFICIO E VARIEDADES MAUA LTDA" },
  { nome: "MARIA LUCIENE DOS SANTOS", empresa: "FUNDACAO DE SAUDE DO ALTO VALE DO ITAJAI" },
  { nome: "MARIA VIVIANE DA SILVA", empresa: "ASSERVO MULTISSERVICOS LTDA" },
  { nome: "MARILENE CLEUSA VIEIRA", empresa: "SOUZA LIMA TERCEIRIZACOES LTDA" },
  { nome: "MILTON PAIVA DO AMARAL", empresa: "ACCOMPLI CONSTRUTORA LTDA" },
  { nome: "PAULO HENRIQUE BASTOS FERREIRA", empresa: "CENTURY A PARK ESTACIONAMENTO LTDA" },
  { nome: "PAULO HENRIQUE DA CONCEIÇÃO SILVA", empresa: "DUTRA PLASTICOS LTDA" },
  { nome: "RAFAEL DA SILVA SOARES", empresa: "ALIBABA ESTETICA AUTOMOTIVA LTDA" },
  { nome: "ROBERTO CARLOS GOMES ALVES", empresa: "DEMARES GESTAO LTDA" },
  { nome: "RONNIDELBERTH SANTOS COSTA", empresa: "ALIBABA ESTETICA AUTOMOTIVA LTDA" },
  { nome: "ROSANGELA CRISTINA OLIVEIRA COSTA", empresa: "PARTNER FACILITIES SERVICOS E ADMINISTRACAO LTDA" },
  { nome: "SIRLENE DO NASCIMENTO GAVIOLI", empresa: "FUNDACAO DO ABC" },
  { nome: "TALITA DA SILVA VARSOLERI", empresa: "BRASANITAS HOSPITALAR - HIGIENIZACAO E CONSERVACAO DE AMBIENTES DE SAUDE LTDA" },
  { nome: "THAINA BARAO MOTA", empresa: "FB - FABRICA DE KITS ELETRICOS E HIDRAULICOS LTDA" },
  { nome: "THEREZINHA ROBERTA BERTOCHI", empresa: "TOP SERVICE SERVICOS E SISTEMAS SA" },
  { nome: "THIAGO ALAN DA SILVA", empresa: "VIBRANIUM TELAS DO BRASIL LTDA" },
  { nome: "WESLEY SANTOS MENDES", empresa: "PAULISTA OBRAS E PAVIMENTACAO LTDA" },
  { nome: "YARA RODRIGUES MENDES DA SILVA", empresa: "YZG MODAS LTDA" },
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
