import { NextRequest, NextResponse } from 'next/server';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');

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
 * Parse the extracted PDF text into individual publications.
 * The PROMAD PDF has a consistent structure with labeled fields.
 */
function parsePublicacoes(text: string): Publicacao[] {
  // Split by "Publicação Jurídica Impressa" header — each occurrence is one publication
  const blocks = text.split(/Publica[çc][ãa]o\s+Jur[ií]dica\s+Impressa/i);
  
  const publicacoes: Publicacao[] = [];

  for (const block of blocks) {
    if (block.trim().length < 50) continue; // skip empty/header blocks

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

    // Extract fields using regex patterns based on PROMAD structure
    // The PDF text typically has "Label\nValue" or "Label  Value" patterns

    // Cliente
    const clienteMatch = block.match(/Cliente\s*\n?\s*(.+?)(?:\s*N[úu]mero do processo)/is);
    if (clienteMatch) pub.cliente = clienteMatch[1].trim();

    // Número do processo
    const processoMatch = block.match(/N[úu]mero do processo\s*\n?\s*(\d[\d.\-\/]+)/i);
    if (processoMatch) pub.numeroProcesso = processoMatch[1].trim();

    // Adverso
    const adversoMatch = block.match(/Adverso\s*\n?\s*(.+?)(?:\s*Pasta|\s*Respons[áa]vel)/is);
    if (adversoMatch) pub.adverso = adversoMatch[1].trim();

    // Advogado (can be under "Responsável" or "Advogado")
    const advMatch = block.match(/(?:Respons[áa]vel|Advogado)\s*\n?\s*(.+?)(?:\s*Data da Disponibiliza|Jornal|\n)/is);
    if (advMatch) pub.advogado = advMatch[1].trim();

    // If advogado not found, try second pattern
    if (!pub.advogado) {
      const advMatch2 = block.match(/Advogado\s*\n?\s*(.+?)(?:\s*\n)/i);
      if (advMatch2) pub.advogado = advMatch2[1].trim();
    }

    // Data da Disponibilização
    const dataMatch = block.match(/Data da Disponibiliza[çc][ãa]o\s*\n?\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (dataMatch) pub.data = dataMatch[1].trim();

    // Jornal
    const jornalMatch = block.match(/Jornal\s*\n?\s*(.+?)(?:\s*P[áa]gina)/is);
    if (jornalMatch) pub.jornal = jornalMatch[1].trim();

    // Página
    const paginaMatch = block.match(/P[áa]gina\s*\n?\s*(\d+)/i);
    if (paginaMatch) pub.pagina = paginaMatch[1].trim();

    // Vara
    const varaMatch = block.match(/Vara\s*\n?\s*(.+?)(?:\s*[ÓO]rg[ãa]o|\s*Descri)/is);
    if (varaMatch) pub.vara = varaMatch[1].trim();

    // Órgão
    const orgaoMatch = block.match(/[ÓO]rg[ãa]o\s*\n?\s*(.+?)(?:\s*Vara|\s*Descri)/is);
    if (orgaoMatch) pub.orgao = orgaoMatch[1].trim();

    // Descrição — everything after "Descrição" label
    const descMatch = block.match(/Descri[çc][ãa]o\s*\n?\s*([\s\S]+)/i);
    if (descMatch) pub.descricao = descMatch[1].trim();

    // Only add if we found at least cliente or processo
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

    // Parse PDF
    const pdfData = await pdfParse(buffer);
    const text: string = pdfData.text;

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: 'PDF vazio ou não foi possível extrair texto' }, { status: 400 });
    }

    // Parse publications
    const publicacoes = parsePublicacoes(text);

    if (publicacoes.length === 0) {
      return NextResponse.json({
        error: 'Nenhuma publicação encontrada no PDF. Verifique se é um relatório do PROMAD.',
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
