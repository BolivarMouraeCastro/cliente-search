import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic'; // Força a rota a ser sempre dinâmica e não usar cache

// Initialize the Google Generative AI with the API key from environment
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: Request) {
  try {
    console.log("Verificando a chave no servidor:", process.env.GEMINI_API_KEY ? "Existe (tamanho: " + process.env.GEMINI_API_KEY.length + ")" : "Nao existe");
    
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'A chave do Gemini (GEMINI_API_KEY) não está configurada no servidor.' },
        { status: 500 }
      );
    }

    const { clientName, emails, files } = await req.json();

    if (!clientName || !emails) {
      return NextResponse.json({ error: 'Faltam dados do cliente ou e-mails.' }, { status: 400 });
    }

    // Get the Gemini 1.5 Flash model
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Prepare the prompt
    const prompt = `
      Você é um advogado da "BM&C Advogados", um escritório de advocacia de alto padrão.
      Sua tarefa é escrever um "Relatório de Andamento Processual" para o seu cliente chamado: ${clientName}.
      
      DADOS DO PROCESSO DO CLIENTE:
      1. E-mails do Tribunal (Intimações/Movimentações):
      ${JSON.stringify(emails)}
      
      2. Documentos produzidos pelo escritório salvos no Google Drive do cliente:
      ${JSON.stringify(files)}

      INSTRUÇÕES IMPORTANTES PARA A REDAÇÃO:
      - Cruze as datas das intimações (e-mails) com as datas dos documentos (Drive). Se houver uma intimação e logo depois um documento criado com nome sugestivo (ex: Manifestação, Recurso, Petição), explique que o escritório já tomou as providências.
      - A linguagem deve ser clara, acolhedora, humanizada e extremamente profissional, sem jargões jurídicos complexos que o cliente não entenda.
      - NÃO DÊ INFORMAÇÕES CONCRETAS OU GARANTIAS (ex: "ganhamos", "vai sair o dinheiro em 10 dias", "já está resolvido"). O direito é dinâmico e o juiz pode mudar de ideia. Use termos como "o andamento esperado", "nossa equipe tomou as medidas cabíveis", "estamos aguardando a análise do juiz".
      - Considere os prazos do direito processual do trabalho (CLT) para dar uma noção genérica de tempo (ex: "geralmente, após a sentença, há prazo de 8 dias para recurso"), mas sempre frisando que na prática o judiciário tem seu próprio tempo.
      - O relatório deve ter um tom tranquilizador.
      - Use formatação Markdown (negrito, listas pontuadas) para deixar o texto bonito.
      - Comece com uma saudação educada para o cliente.
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
