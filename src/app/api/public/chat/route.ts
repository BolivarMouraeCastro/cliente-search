import { NextRequest, NextResponse } from 'next/server';
import { getAdminAccessToken } from '@/lib/admin-token';
import { getSheetsService, getDriveService } from '@/lib/google-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const SPREADSHEET_ID = '11ni1pXu0QbPQ_QmMGxdqdT4PsDNz6Z0ITBUW-E1ogMM';
const PROTOCOLOS_FOLDER_ID = process.env.DRIVE_PROTOCOLOS_FOLDER_ID || '1waNdg9ME46yj2USnNNk4uTpqPOo8qgS8';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// Prefixos de documentos → tipo de peça processual
const DOC_PREFIXES: Record<string, string> = {
  'PI': 'Petição Inicial (ação trabalhista ajuizada)',
  'RO': 'Recurso Ordinário (recurso contra a sentença)',
  'RR': 'Recurso de Revista (recurso ao TST)',
  'AI': 'Agravo de Instrumento',
  'AP': 'Agravo de Petição',
  'ED': 'Embargos de Declaração',
  'MS': 'Mandado de Segurança',
  'EXEC': 'Execução (fase de cobrança/pagamento)',
  'CALC': 'Cálculos de Liquidação',
  'IMPUG': 'Impugnação',
  'CONT': 'Contrarrazões (resposta ao recurso da empresa)',
  'MANIF': 'Manifestação',
  'PET': 'Petição',
  'SUBS': 'Substabelecimento',
  'PROC': 'Procuração',
  'ATA': 'Ata de Audiência',
  'SENT': 'Sentença',
  'ACORDO': 'Acordo (processo encerrado por acordo)',
};

function normalize(str: string): string {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

// Extrair tipo de documento do nome do arquivo
function parseDocName(filename: string): { tipo: string; tipoDescricao: string; clienteNoDoc: string } {
  // Remove extensão
  const name = filename.replace(/\.(pdf|docx?|xlsx?|odt|txt)$/i, '').trim();
  
  // Tenta extrair prefixo (antes do _ ou -)
  const separatorIdx = name.search(/[_\-]/);
  if (separatorIdx > 0) {
    const prefix = name.substring(0, separatorIdx).trim().toUpperCase();
    const clienteNoDoc = name.substring(separatorIdx + 1).trim();
    const descricao = DOC_PREFIXES[prefix] || prefix;
    return { tipo: prefix, tipoDescricao: descricao, clienteNoDoc };
  }
  
  return { tipo: 'DOC', tipoDescricao: 'Documento', clienteNoDoc: name };
}

// Buscar documentos do cliente no Drive recursivamente
async function findClientDocs(token: string, clientName: string): Promise<Array<{
  nome: string; tipo: string; tipoDescricao: string; data: string; pastaOrigem: string;
}>> {
  const drive = getDriveService(token);
  
  const normalizedClient = normalize(clientName);
  // Pegar sobrenomes para busca (mais confiável)
  const nameParts = normalizedClient.split(' ');
  const lastName = nameParts[nameParts.length - 1];
  const firstName = nameParts[0];
  
  const results: Array<{ nome: string; tipo: string; tipoDescricao: string; data: string; pastaOrigem: string }> = [];
  
  try {
    // Buscar arquivos no Drive que contenham o sobrenome do cliente
    const searchQuery = `name contains '${lastName.toUpperCase()}' and trashed = false and mimeType != 'application/vnd.google-apps.folder'`;
    
    const response = await drive.files.list({
      q: searchQuery,
      fields: 'files(id, name, parents, mimeType, createdTime)',
      pageSize: 100,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    
    const files = response.data.files || [];
    
    // Para cada arquivo encontrado, verificar se é do cliente correto
    for (const file of files) {
      const normalizedFileName = normalize(file.name || '');
      
      // Verificar se o nome do arquivo contém pelo menos sobrenome E primeiro nome
      if (!normalizedFileName.includes(lastName) || !normalizedFileName.includes(firstName)) {
        continue;
      }
      
      const parsed = parseDocName(file.name || '');
      
      // Tentar extrair data da pasta pai
      let dataPasta = '';
      if (file.parents && file.parents[0]) {
        try {
          const parent = await drive.files.get({ fileId: file.parents[0], fields: 'name, parents' });
          const parentName = parent.data.name || '';
          // Verificar se é pasta PROTOCOLO OK, se sim pegar data do avô
          if (parentName.includes('PROTOCOLO') || parentName.includes('PROCOLO')) {
            if (parent.data.parents && parent.data.parents[0]) {
              const grandparent = await drive.files.get({ fileId: parent.data.parents[0], fields: 'name' });
              dataPasta = grandparent.data.name || '';
            }
          } else {
            dataPasta = parentName;
          }
        } catch { /* ignore */ }
      }
      
      results.push({
        nome: file.name || '',
        tipo: parsed.tipo,
        tipoDescricao: parsed.tipoDescricao,
        data: dataPasta,
        pastaOrigem: dataPasta,
      });
    }
    
    // Ordenar por data (mais recente primeiro)
    results.sort((a, b) => {
      const parseDate = (d: string) => {
        const parts = d.split('.');
        if (parts.length === 3) return new Date(+parts[2], +parts[1] - 1, +parts[0]).getTime();
        return 0;
      };
      return parseDate(b.data) - parseDate(a.data);
    });
    
  } catch (e: any) {
    console.error('Drive search error:', e?.message);
  }
  
  return results;
}

// Chamar Gemini API
async function askGemini(systemPrompt: string, question: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        { role: 'user', parts: [{ text: `${systemPrompt}\n\n---\n\nPergunta do cliente: ${question}` }] },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
        topP: 0.95,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    }),
  });
  
  if (!response.ok) {
    const err = await response.text();
    console.error('Gemini API error:', err);
    throw new Error('Erro ao consultar IA');
  }
  
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Desculpe, não consegui gerar uma resposta.';
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  }
  
  const { nome, cpf, pergunta } = body;
  if (!nome || !cpf || !pergunta) {
    return NextResponse.json({ error: 'Nome, CPF e pergunta são obrigatórios.' }, { status: 400 });
  }
  if (pergunta.length > 500) {
    return NextResponse.json({ error: 'Pergunta muito longa (máx 500 caracteres).' }, { status: 400 });
  }
  
  // Validar CPF e nome (mesmo padrão do consulta)
  const cpfDigits = cpf.replace(/\D/g, '');
  let token: string;
  let clientName = '';
  
  try {
    token = await getAdminAccessToken();
    const sheets = getSheetsService(token);
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID, range: 'Contatos!A:C',
    });
    for (const row of (res.data.values || []).slice(1)) {
      const rowCpf = (row[1] || '').replace(/\D/g, '');
      if (rowCpf === cpfDigits) { clientName = (row[0] || '').trim(); break; }
    }
  } catch (e: any) {
    return NextResponse.json({ error: 'Erro de autenticação.' }, { status: 500 });
  }
  
  if (!clientName) {
    return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 });
  }
  
  // Validar nome
  const normInformado = normalize(nome);
  const normCadastrado = normalize(clientName);
  if (!normCadastrado.includes(normInformado) && !normInformado.includes(normCadastrado)) {
    return NextResponse.json({ error: 'Nome e CPF não conferem.' }, { status: 403 });
  }
  
  // Buscar documentos do cliente no Drive
  const docs = await findClientDocs(token, clientName);
  
  // Buscar dados do processo na planilha principal
  let processInfo = '';
  try {
    const sheets = getSheetsService(token);
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID || '',
      range: 'A:Z',
    });
    const rows = res.data.values || [];
    const header = rows[0] || [];
    for (const row of rows.slice(1)) {
      const nomeRow = normalize(row[header.indexOf('NOME_CLIENTE')] || row[header.indexOf('NOME')] || '');
      if (nomeRow && (nomeRow.includes(normCadastrado) || normCadastrado.includes(nomeRow))) {
        const processo = row[header.indexOf('NUMERO_PROCESSO')] || row[header.indexOf('NUM_PROCESSO')] || '';
        const empresa = row[header.indexOf('EMPRESA')] || row[header.indexOf('RECLAMADA')] || '';
        const status = row[header.indexOf('STATUS')] || '';
        const materia = row[header.indexOf('MATERIA')] || '';
        processInfo += `\n- Processo: ${processo}, Empresa: ${empresa}, Status: ${status}, Matéria: ${materia}`;
      }
    }
  } catch { /* ignore */ }
  
  // Montar contexto para a IA
  let context = `Você é o assistente virtual do escritório BM&C Advogados. Está conversando com o cliente ${clientName}.

REGRAS IMPORTANTES:
- Responda SEMPRE em português do Brasil, de forma clara e SEM juridiquês
- NUNCA invente informações que não estejam nos dados abaixo
- NUNCA mencione valores financeiros, honorários ou estratégias jurídicas
- NUNCA dê conselhos jurídicos específicos (diga "consulte seu advogado")
- Se não souber, diga "Não tenho essa informação. Recomendo entrar em contato com o escritório pelo WhatsApp."
- Seja empático, acolhedor e tranquilizador
- Use linguagem simples que qualquer pessoa entenda
- Ao final, sempre sugira entrar em contato pelo WhatsApp para mais detalhes

DADOS DO PROCESSO DO CLIENTE:
${processInfo || 'Dados da planilha não disponíveis no momento.'}

DOCUMENTOS PROTOCOLADOS (encontrados no Drive):`;

  if (docs.length > 0) {
    for (const doc of docs) {
      context += `\n- [${doc.data || 'sem data'}] ${doc.tipoDescricao} — Arquivo: "${doc.nome}"`;
    }
    
    context += `\n\nCom base nos documentos acima, é possível inferir a fase processual:`;
    
    // Inferir fase com base no documento mais recente
    const lastDoc = docs[0];
    if (lastDoc) {
      if (['RO', 'RR', 'AI', 'AP'].includes(lastDoc.tipo)) {
        context += `\n- O processo está em FASE RECURSAL. O documento "${lastDoc.nome}" foi protocolado em ${lastDoc.data}, indicando que houve sentença e o escritório está recorrendo.`;
      } else if (lastDoc.tipo === 'PI') {
        context += `\n- O processo está na FASE INICIAL. A petição inicial foi protocolada em ${lastDoc.data}.`;
      } else if (lastDoc.tipo === 'EXEC' || lastDoc.tipo === 'CALC') {
        context += `\n- O processo está em FASE DE EXECUÇÃO. Já houve decisão favorável e estamos cobrando os valores.`;
      } else if (lastDoc.tipo === 'CONT') {
        context += `\n- O processo está em fase recursal. O escritório apresentou contrarrazões ao recurso da empresa em ${lastDoc.data}.`;
      } else if (lastDoc.tipo === 'ACORDO') {
        context += `\n- O processo foi ENCERRADO POR ACORDO.`;
      }
    }
  } else {
    context += '\nNenhum documento específico encontrado no Drive para este cliente no momento.';
  }
  
  try {
    const resposta = await askGemini(context, pergunta);
    return NextResponse.json({ resposta, docsEncontrados: docs.length });
  } catch (e: any) {
    console.error('Chat error:', e?.message);
    return NextResponse.json({ error: 'Erro ao processar sua pergunta. Tente novamente.' }, { status: 500 });
  }
}
