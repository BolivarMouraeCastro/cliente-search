import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

export interface Publicacao {
  cliente: string;
  adverso: string;
  advogado: string;
  numeroProcesso: string;
  data: string;
  pagina: string;
  vara: string;
  orgao: string;
  jornal: string;
  descricao: string;
}

/**
 * Extract text from PDF buffer.
 * Uses pdf-parse/lib/pdf-parse to avoid the test file issue in serverless.
 */
async function extractPDFText(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse/lib/pdf-parse');
  const data = await pdfParse(buffer, {});
  return data.text || '';
}

/**
 * Parse the extracted PDF text into individual publications.
 */
function parsePublicacoes(text: string): Publicacao[] {
  // Split by "Publicação Jurídica Impressa" header
  const blocks = text.split(/Publica[çc][ãa]o\s+Jur[ií]dica\s+Impressa/i);
  
  const publicacoes: Publicacao[] = [];

  for (const block of blocks) {
    if (block.trim().length < 50) continue;

    const pub: Publicacao = {
      cliente: '',
      adverso: '',
      advogado: '',
      numeroProcesso: '',
      data: '',
      pagina: '',
      vara: '',
      orgao: '',
      jornal: '',
      descricao: '',
    };

    // Cliente
    const clienteMatch = block.match(/Cliente[\s:]*([A-Z\u00C0-\u00FF][A-Z\u00C0-\u00FF\s]+?)(?:\s*N[uú]mero|\s*Adverso)/i);
    if (clienteMatch) pub.cliente = clienteMatch[1].trim();

    // Número do processo
    const processoMatch = block.match(/N[uú]mero do processo[\s:]*(\d[\d.\-\/]+)/i);
    if (processoMatch) pub.numeroProcesso = processoMatch[1].trim();

    // Adverso
    const adversoMatch = block.match(/Adverso[\s:]*([\s\S]+?)(?:\s*Pasta|\s*Respons[aá]vel)/i);
    if (adversoMatch) pub.adverso = adversoMatch[1].trim();

    // Advogado / Responsável
    const advMatch = block.match(/(?:Respons[aá]vel|Advogado)[\s:]*([A-Z\u00C0-\u00FF][A-Z\u00C0-\u00FF\s]+?)(?:\s*Data|\s*Jornal|\s*\d{2}\/)/i);
    if (advMatch) pub.advogado = advMatch[1].trim();

    // Data da Disponibilização
    const dataMatch = block.match(/Data da Disponibiliza[cç][aã]o[\s:]*(\d{2}\/\d{2}\/\d{4})/i);
    if (dataMatch) pub.data = dataMatch[1].trim();

    // Jornal
    const jornalMatch = block.match(/Jornal[\s:]*([\s\S]+?)(?:\s*P[aá]gina)/i);
    if (jornalMatch) pub.jornal = jornalMatch[1].trim();

    // Página
    const paginaMatch = block.match(/P[aá]gina[\s:]*(\d+)/i);
    if (paginaMatch) pub.pagina = paginaMatch[1].trim();

    // Vara
    const varaMatch = block.match(/Vara[\s:]*([^\n]+?)(?:\s*[OÓ]rg[aã]o|\s*Descri)/i);
    if (varaMatch) pub.vara = varaMatch[1].trim();

    // Órgão
    const orgaoMatch = block.match(/[OÓ]rg[aã]o[\s:]*([^\n]+?)(?:\s*Vara|\s*Descri)/i);
    if (orgaoMatch) pub.orgao = orgaoMatch[1].trim();

    // Descrição
    const descMatch = block.match(/Descri[cç][aã]o[\s:]*([\s\S]+)/i);
    if (descMatch) pub.descricao = descMatch[1].trim();

    if (pub.cliente || pub.numeroProcesso) {
      publicacoes.push(pub);
    }
  }

  return publicacoes;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Arquivo PDF é obrigatório' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Apenas arquivos PDF são aceitos' }, { status: 400 });
    }

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract text from PDF
    const text = await extractPDFText(buffer);

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: 'PDF vazio ou não foi possível extrair texto' }, { status: 400 });
    }

    // Parse publications
    const publicacoes = parsePublicacoes(text);

    if (publicacoes.length === 0) {
      return NextResponse.json({
        error: 'Nenhuma publicação encontrada. Verifique se é um relatório do PROMAD.',
        rawTextPreview: text.substring(0, 500),
      }, { status: 400 });
    }

    // Group by advogado
    const byAdvogado: Record<string, Publicacao[]> = {};
    for (const pub of publicacoes) {
      const key = pub.advogado || 'SEM ADVOGADO';
      if (!byAdvogado[key]) byAdvogado[key] = [];
      byAdvogado[key].push(pub);
    }

    return NextResponse.json({
      total: publicacoes.length,
      advogados: Object.keys(byAdvogado).sort(),
      byAdvogado,
      publicacoes,
    });

  } catch (err) {
    console.error('PDF parse error:', err);
    return NextResponse.json(
      { error: `Erro ao processar PDF: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
