import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic'; // Força a rota a ser sempre dinâmica e não usar cache

// Initialize the Google Generative AI with the API key from environment
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: Request) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'A chave do Gemini (GEMINI_API_KEY) não está configurada no servidor.' },
        { status: 500 }
      );
    }

    const { clientName, emails, files, hearings, movements, processNumber, empresa } = await req.json();

    if (!clientName) {
      return NextResponse.json({ error: 'Faltam dados do cliente.' }, { status: 400 });
    }

    // Get the Gemini model
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Prepare the prompt with ALL data sources
    const prompt = `
      Você é um advogado da "BM&C Advogados", um escritório de advocacia de alto padrão.
      Sua tarefa é escrever um "Relatório de Andamento Processual" para o seu cliente chamado: ${clientName}.
      ${processNumber ? `Número do processo: ${processNumber}` : ''}
      ${empresa ? `Empresa reclamada: ${empresa}` : ''}
      
      DADOS DO PROCESSO DO CLIENTE (use TODAS as fontes abaixo para cruzar informações):

      1. AUDIÊNCIAS (planilha de controle do escritório):
      ${hearings && hearings.length > 0 ? JSON.stringify(hearings) : 'Nenhuma audiência registrada.'}
      
      2. MOVIMENTAÇÕES DO TRIBUNAL (fonte oficial: DataJud/CNJ):
      ${movements && movements.length > 0 ? JSON.stringify(movements) : 'Nenhuma movimentação encontrada no DataJud.'}

      3. E-MAILS DO TRIBUNAL (intimações e comunicações):
      ${emails && emails.length > 0 ? JSON.stringify(emails) : 'Nenhum e-mail de intimação.'}
      
      4. DOCUMENTOS PRODUZIDOS PELO ESCRITÓRIO (Google Drive):
      ${files && files.length > 0 ? JSON.stringify(files) : 'Nenhum documento encontrado.'}

      INSTRUÇÕES IMPORTANTES PARA A REDAÇÃO:
      - PRIORIZE as movimentações do DataJud/CNJ pois são a fonte mais confiável e oficial.
      - Cruze as datas das intimações (e-mails) com as datas dos documentos (Drive). Se houver uma intimação e logo depois um documento criado com nome sugestivo (ex: Manifestação, Recurso, Petição), explique que o escritório já tomou as providências.
      - Se houver audiência marcada (isFuture: true), DESTAQUE isso no relatório com data, horário e tipo.
      - Se houver audiência realizada (isFuture: false), mencione que já foi realizada e o que se espera a seguir.
      - A linguagem deve ser clara, acolhedora, humanizada e extremamente profissional, sem jargões jurídicos complexos que o cliente não entenda.
      - NÃO DÊ INFORMAÇÕES CONCRETAS OU GARANTIAS (ex: "ganhamos", "vai sair o dinheiro em 10 dias", "já está resolvido"). Use termos como "o andamento esperado", "nossa equipe tomou as medidas cabíveis", "estamos aguardando a análise do juiz".
      - Considere os prazos do direito processual do trabalho (CLT) para dar uma noção genérica de tempo, mas sempre frisando que na prática o judiciário tem seu próprio tempo.
      - O relatório deve ter um tom tranquilizador e profissional.
      - Use formatação Markdown (negrito, listas) para deixar o texto bonito e organizado.
      - Comece com uma saudação educada para o cliente.
      - Termine com uma assinatura: "Atenciosamente, Equipe BM&C Advogados".
      - MANTENHA O RELATÓRIO CONCISO (máximo 500 palavras).
    `;

    // Call the Gemini API
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ report: text });
  } catch (error: any) {
    console.error('Erro ao gerar relatório com IA:', error);
    return NextResponse.json(
      { error: error.message || 'Ocorreu um erro ao gerar o relatório.' },
      { status: 500 }
    );
  }
}
