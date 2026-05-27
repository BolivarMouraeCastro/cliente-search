import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { getClients, updateClientFields } from "@/lib/sheets";

export const dynamic = "force-dynamic";

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? "";

// Data provided by the user for clients with status "BOLIVAR"
const UPDATES: Array<{ nome: string; funcao?: string; empresa?: string }> = [
  // --- FUNÇÃO only ---
  { nome: "ALLAN BERNARDO SILVA SANTOS", funcao: "PINTOR" },
  { nome: "ANDERSON ARAUJO SOUZA", funcao: "LIMPEZA PÓS-OBRA" },
  { nome: "CAIO FELIPE BHERING BATISTA", funcao: "REPOSITOR DE MERCADORIA" },
  { nome: "CHRISTOPHER DOURADO DE TOLEDO", funcao: "AUXILIAR DE ESTOQUE" },
  { nome: "DAYANE SOUSA DE JESUS", funcao: "PROMOTORA DE VENDAS" },
  { nome: "FABIO MANUEL RIBEIRO PINHEIRO", funcao: "AUXILIAR DE PRODUÇÃO" },
  { nome: "FABRICIO COSTA DA SILVA", funcao: "COLETOR" },
  { nome: "FABRICIO DIAS", funcao: "INSTALADOR DE TELAS DE FACHADA" },
  { nome: "FERNANDO AUGUSTO TRINDADE", funcao: "CONTROLADOR DE ACESSO" },
  { nome: "GABRIELE MICAELE SANT ANA", funcao: "OPERADORA DE CAIXA" },
  { nome: "GISELLE STADLER GOULART", funcao: "RECEPCIONISTA I" },
  { nome: "HELOISE GABRIELY DE ANDRADE PAIVA", funcao: "RECEPCIONISTA JUNIOR" },
  { nome: "ISAUL DIAS GONÇALVES", funcao: "PINTOR" },
  { nome: "JAQUELINE SANTANA MONZANI", funcao: "LIMPADOR" },
  { nome: "JEFERSON LUAN SOUZA", funcao: "TECNICO ELETROTECNICO PL" },
  { nome: "LEANDRO JOSE DA CONCEIÇÃO", funcao: "OPERADOR DE PRODUÇÃO" },
  { nome: "LEANDRO WESLLEN FRANZ", funcao: "AUXILIAR DE PRODUÇÃO V" },
  { nome: "LEONARDO DE SOUZA OLIVEIRA RAMOS", funcao: "AJUDANTE GERAL" },
  { nome: "LILIANE SANTANA RIBEIRO", funcao: "AUXILIAR DE COZINHA" },
  { nome: "LUCAS BARBOSA", funcao: "AUXILIAR DE SERVIÇOS GERAIS" },
  { nome: "LUCAS EDUARDO", funcao: "AJUDANTE DE MONTAGEM" },
  { nome: "LUCIA MARIA DE JESUS", funcao: "DOMESTICA" },
  { nome: "LUCIANA CORREA DE CAMPOS", funcao: "AUXILIAR DE PRODUÇÃO" },
  { nome: "MARIA EDUARDA DA SILVA OLIVEIRA", funcao: "ATENDENTE" },
  { nome: "MAURO DE SOUSA OLIVEIRA", funcao: "OPERADOR DE ESTACIONAMENTO" },
  { nome: "MAURO LUSTOSA GONCALVES JUNIOR", funcao: "MOTORISTA PLENO" },
  { nome: "MICHERLANGE SAINT JUSTE", funcao: "COSTUREIRA" },
  { nome: "NATIELE PEREIRA DOS SANTOS", funcao: "VENDEDORA" },
  { nome: "PALOMA PEREIRA DA SILVA", funcao: "OPERADOR DE MAQUINA" },
  { nome: "PAULO HENRIQUE DA SILVA SOUZA", funcao: "CONFERENTE II" },
  { nome: "REINALDO DE CARVALHO MENINO", funcao: "MOTORISTA" },
  { nome: "RENATO OLIVEIRA DE APARECIDO", funcao: "SERVENTE" },
  { nome: "SANDRA RAMOS DE SOUZA", funcao: "APONTADOR DE PRODUÇÃO" },
  { nome: "SILMARA JAMILLY DOS SANTOS RODRIGUES", funcao: "ATENDENTE JR" },
  { nome: "SIMONE MATOS PEREIRA", funcao: "PORTEIRO" },
  { nome: "TALITA SILVEIRA CIRINO", funcao: "PROMOTORA" },
  { nome: "TIAGO ELIAS SALES FRANCO", funcao: "CONTROLADOR DE ACESSO" },
  { nome: "VALMIRENE SOUZA DOS SANTOS", funcao: "AUXILIAR DE COZINHA" },
  { nome: "VICTOR GUILHERME", funcao: "AJUDANTE GERAL" },
  { nome: "WELLINGTON SIMPLICIO DE LIMA", funcao: "SINALEIRO" },
  { nome: "WESLLEY PEREIRA BERNARDO", funcao: "EMPACOTADOR" },

  // --- EMPRESA only ---
  { nome: "ANA PAULA DOS SANTOS", empresa: "ASSOCIAÇÃO EDUCACIONAL DA JUVENTUDE" },
  { nome: "JOSÉ VALDO", empresa: "WORKS MCDONALDS" },
  { nome: "LUIZ FERNANDO", empresa: "MAX PÃO" },
  { nome: "MARIA JOSÉ DOS SANTOS CASTRO", empresa: "ASSOCIAÇÃO EDUCACIONAL DA JUVENTUDE" },
  { nome: "NICOLLY CAROLINE DA SILVA SANTOS", empresa: "MERCADINHO IRMÃOS DOMINGOS LTDA" },
  { nome: "RAFAEL FERNANDES DA SILVA", empresa: "NAÇÕES DISTRIBUIDORA DE ALIMENTOS LTDA" },
  { nome: "WALLAS SANTOS GONÇALVES", empresa: "EXTRA CONSULT CONSULTORIA E TRABALHO" },
  { nome: "WERMENSON TENÓRIO LIMA", empresa: "SS COMERCIO DE ALIMENTOS LTDA" },
  { nome: "CARLOS HENRIQUE RIBEIRO", empresa: "NEW HABIT PRE FABRICADOS DE CONCRETO LTDA" },

  // --- FUNÇÃO + EMPRESA ---
  { nome: "VANESSA APARECIDA VIEIRA REIS", funcao: "OPERADOR DE MONITORAMENTO", empresa: "G4S" },
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
    let updated = 0;
    let notFound = 0;
    let skipped = 0;

    for (const update of UPDATES) {
      const normalizedName = normalize(update.nome);

      // Find client by name (fuzzy match)
      const client = allClients.find((c) => {
        const n = normalize(c.nome);
        return n === normalizedName || n.includes(normalizedName) || normalizedName.includes(n);
      });

      if (!client) {
        log.push(`❌ NÃO ENCONTRADO: ${update.nome}`);
        notFound++;
        continue;
      }

      // Only update if the field is currently empty
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

      const success = await updateClientFields(
        accessToken,
        SPREADSHEET_ID,
        client.id,
        fields
      );

      if (success) {
        updated++;
        const parts = [];
        if (fields.funcao) parts.push(`função="${fields.funcao}"`);
        if (fields.empresa) parts.push(`empresa="${fields.empresa}"`);
        log.push(`✅ ${client.nome} (row ${client.id}): ${parts.join(", ")}`);
      } else {
        log.push(`❌ ERRO ao atualizar: ${client.nome}`);
      }

      // Small delay
      await new Promise((r) => setTimeout(r, 200));
    }

    return NextResponse.json({
      updated,
      notFound,
      skipped,
      total: UPDATES.length,
      log,
    });
  } catch (error) {
    console.error("Batch update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
