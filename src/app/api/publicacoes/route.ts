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
 * Extract text from PDF using pdfjs-dist (works in serverless).
 */
async function extractTextFromPDF(buffer: ArrayBuffer): Promise<string> {
  // Dynamic import to avoid SSR issues
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: any) => ('str' in item ? item.str : ''))
      .join(' ');
    pages.push(text);
  }
  
  return pages.join('\n');
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
    const clienteMatch = block.match(/Cliente[\s:]*([A-ZÁÀÃÂÉÊÍÓÔÕÚÇ][A-ZÁÀÃÂÉÊÍÓÔÕÚÇ\s]+?)(?:\s*N[úu]mero|\s*Adverso)/i);
    if (clienteMatch) pub.cliente = clienteMatch[1].trim();

    // Número do processo
    const processoMatch = block.match(/N[úu]mero do processo[\s:]*(\d[\d.\-\/]+)/i);
    if (processoMatch) pub.numeroProcesso = processoMatch[1].trim();

    // Adverso
    const adversoMatch = block.match(/Adverso[\s:]*([A-ZÁÀÃÂÉÊÍÓÔÕÚÇa-záàãâéêíóôõúç][\s\S]+?)(?:\s*Pasta|\s*Respons[áa]vel)/i);
    if (adversoMatch) pub.adverso = adversoMatch[1].trim();

    // Advogado / Responsável
    const advMatch = block.match(/(?:Respons[áa]vel|Advogado)[\s:]*([A-ZÁÀÃÂÉÊÍÓÔÕÚÇ][A-ZÁÀÃÂÉÊÍÓÔÕÚÇ\s]+?)(?:\s*Data|\s*Jornal|\s*\d{2}\/)/i);
    if (advMatch) pub.advogado = advMatch[1].trim();

    // Data da Disponibilização
    const dataMatch = block.match(/Data da Disponibiliza[çc][ãa]o[\s:]*(\d{2}\/\d{2}\/\d{4})/i);
    if (dataMatch) pub.data = dataMatch[1].trim();

    // Jornal
    const jornalMatch = block.match(/Jornal[\s:]*([A-ZÁÀÃÂa-záàãâ][\s\S]+?)(?:\s*P[áa]gina)/i);
    if (jornalMatch) pub.jornal = jornalMatch[1].trim();

    // Página
    const paginaMatch = block.match(/P[áa]gina[\s:]*(\d+)/i);
    if (paginaMatch) pub.pagina = paginaMatch[1].trim();

    // Vara
    const varaMatch = block.match(/Vara[\s:]*([^\n]+?)(?:\s*[ÓO]rg[ãa]o|\s*Descri)/i);
    if (varaMatch) pub.vara = varaMatch[1].trim();

    // Órgão
    const orgaoMatch = block.match(/[ÓO]rg[ãa]o[\s:]*([^\n]+?)(?:\s*Vara|\s*Descri)/i);
    if (orgaoMatch) pub.orgao = orgaoMatch[1].trim();

    // Descrição
    const descMatch = block.match(/Descri[çc][ãa]o[\s:]*([\s\S]+)/i);
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

    // Read file
    const arrayBuffer = await file.arrayBuffer();

    // Extract text from PDF
    const text = await extractTextFromPDF(arrayBuffer);

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
