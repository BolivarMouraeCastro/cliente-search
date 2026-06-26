'use client';

import { useState, useEffect, useCallback } from 'react';

// ── Interfaces ────────────────────────────────────────────────────────
interface AtaItem {
  id: string;
  reclamante: string;
  reclamada: string;
  processo: string;
  vara: string;
  descricaoCompleta: string;
  classificacoes: string[];
  // Extracted data
  proximaAudiencia?: { data: string; horario: string; modalidade: 'online' | 'presencial' | 'julgamento'; tipo: string };
  prazoReplica?: { prazo: string; descricao: string };
  prazoPericia?: { prazo: string; perito?: string; tipo?: string };
  acordo?: { textoAcordo: string; dataPagamento?: string; parcelas?: string };
  julgamento?: { descricao: string };
  // Source
  pdfName: string;
  pdfId: string;
  processado: boolean;
}

interface AcordoForm {
  valorAcordo: string;
  parcelas: string;
  dataUltimaParcela: string;
  fgtsLiberado: boolean;
  seguroDesemprego: boolean;
}

// ── ATA Classification by Keywords ───────────────────────────────────
function classificarAta(texto: string): string[] {
  const t = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const original = texto; // keep original for case-sensitive checks
  const classes: string[] = [];

  // ACORDO — STRICT detection
  // Must have "CONCILIAÇÃO:" as a section header with "pagará" in nearby text,
  // OR "acordo homologado" / "homologo o acordo" / "transação homologada"
  const isRealAcordo = (() => {
    // Pattern 1: "CONCILIAÇÃO:" (uppercase section header) + "pagará" nearby
    const concIdx = original.search(/CONCILIA[CÇ][AÃ]O\s*:/i);
    if (concIdx >= 0) {
      // Check for "pagará" within 500 chars after CONCILIAÇÃO:
      const afterConc = original.substring(concIdx, concIdx + 500).toLowerCase();
      if (afterConc.includes('pagar') && /r\$/.test(afterConc)) return true;
    }
    // Pattern 2: "homologo o acordo" / "acordo homologado" / "transação homologada"
    if (/homologo\s+o\s+acordo|acordo\s+homologado|transa[cç][aã]o\s+homologada/i.test(t)) return true;
    // Pattern 3: "as partes transacionam" / "celebram acordo"
    if (/partes\s+transacion|celebra[mr]\s+acordo/i.test(t)) return true;
    return false;
  })();

  // If "instrução processual encerrada" or "razões finais" is present,
  // it means there was a hearing, NOT an acordo — override
  const hasInstrucao = t.includes('instrucao processual') || t.includes('encerrada a instrucao') || t.includes('fica encerrada a instrucao');
  const hasRazoes = t.includes('razoes finais');

  if (isRealAcordo && !hasInstrucao && !hasRazoes) {
    classes.push('ACORDO');
  }

  // RÉPLICA / RAZÕES — NEVER when ACORDO (acordo = process ends, no reply needed)
  if (!classes.includes('ACORDO')) {
    if (t.includes('prazo para replica') || t.includes('prazo de replica') ||
        t.includes('razoes finais') || t.includes('contrarrazoes') ||
        t.includes('prazo para manifestacao') || t.includes('manifeste-se') ||
        t.includes('prazo para razoes') || t.includes('impugnacao') ||
        t.includes('prazo para se manifestar')) {
      classes.push('RÉPLICA');
    }
  }

  // PERÍCIA
  if (t.includes('pericia') || t.includes('perito') || t.includes('pericial') ||
      t.includes('insalubridade') || t.includes('periculosidade') ||
      t.includes('laudo') || t.includes('exame')) {
    classes.push('PERÍCIA');
  }

  // JULGAMENTO ANTECIPADO
  if (t.includes('julgamento antecipado') || t.includes('sumula 197') ||
      t.includes('dispensada instrucao') || t.includes('dispensada a instrucao') ||
      t.includes('dispensada a oitiva') || t.includes('dispensado o depoimento') ||
      t.includes('julgo antecipadamente') || t.includes('sentenca')) {
    classes.push('JULGAMENTO');
  }

  // PRÓXIMA AUDIÊNCIA — only if NOT acordo (acordo = process over)
  if (!classes.includes('ACORDO')) {
    if (t.includes('designo audiencia') || t.includes('fica designada') ||
        t.includes('nova audiencia') || t.includes('redesignada') || t.includes('remarcada') ||
        t.includes('audiencia de instrucao') || t.includes('audiencia inicial') ||
        t.includes('audiencia de prosseguimento') || t.includes('audiencia una') ||
        t.includes('proxima audiencia')) {
      classes.push('AUDIÊNCIA');
    }
  }

  if (classes.length === 0) classes.push('OUTROS');
  return classes;
}

// ── Extract structured data from ATA text ────────────────────────────
function extrairDadosAta(texto: string, classificacoes: string[]): Partial<AtaItem> {
  const result: Partial<AtaItem> = {};
  const isAcordo = classificacoes.includes('ACORDO');

  // Extract próxima audiência date/time — ONLY if NOT acordo
  if (!isAcordo) {
    const datePatterns = [
      /(?:designo|fica designada|redesigno|remarcada)[^.]*?(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})[^.]*?(?:às|as)\s+(\d{1,2}[h:]\d{2})/i,
      /audiência[^.]*?(?:dia|data)\s+(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})[^.]*?(?:às|as)\s+(\d{1,2}[h:]\d{2})/i,
      /(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})[^.]*?(?:às|as)\s+(\d{1,2}[h:]\d{2})[^.]*?audiência/i,
    ];

    for (const pat of datePatterns) {
      const m = texto.match(pat);
      if (m) {
        // Parse the date and check if it's in the future
        const dateStr = m[1].replace(/\./g, '/');
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          const day = parseInt(parts[0]);
          const month = parseInt(parts[1]) - 1;
          let year = parseInt(parts[2]);
          if (year < 100) year += 2000;
          const dateObj = new Date(year, month, day, 23, 59, 59);
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          // Only show FUTURE audiências
          if (dateObj > today) {
            const modalidade = /(?:telepresencial|videoconfer|plataforma|virtual|online|teams|zoom|google\s*meet)/i.test(texto)
              ? 'online'
              : /(?:julgamento antecipado|súmula 197|sumula 197)/i.test(texto)
                ? 'julgamento'
                : 'presencial';

            // Extract tipo from the SPECIFIC sentence near the date match, not the full text
            // Get context: 200 chars before and after the match
            const matchIdx = texto.search(pat);
            const context = texto.substring(Math.max(0, matchIdx - 200), matchIdx + 300).toLowerCase();
            
            let tipo = 'Audiência';
            // Check specific phrases in order of specificity (most specific first)
            if (/audiência\s+una|audiencia\s+una|tipo\s+una/i.test(context)) tipo = 'Una';
            else if (/instrução|instrucao/i.test(context)) tipo = 'Instrução';
            else if (/prosseguimento/i.test(context)) tipo = 'Prosseguimento';
            else if (/conciliação|conciliacao/i.test(context)) tipo = 'Conciliação';
            else if (/inicial/i.test(context)) tipo = 'Inicial';
            else if (/julgamento/i.test(context)) tipo = 'Julgamento';

            result.proximaAudiencia = {
              data: dateStr,
              horario: m[2].replace('h', ':'),
              modalidade,
              tipo,
            };
          }
        }
        break;
      }
    }
  }

  // Extract réplica prazo — ONLY if NOT acordo
  if (!isAcordo) {
    // Pattern 1: "prazo de X dias para réplica/razões"
    const replicaMatch = texto.match(/prazo\s+(?:de\s+)?(\d+)\s*(?:dias?)?\s*(?:para|para\s+(?:réplica|replica|razões|razoes|manifestação))/i);
    // Pattern 2: "razões finais no prazo de X dias"
    const razoesMatch = texto.match(/raz[õo]es\s+finais\s+(?:no\s+)?prazo\s+(?:de\s+)?(\d+)\s*dias?/i);
    // Pattern 3: "prazo de X dias" right after "instrução encerrada" (implied razões finais)
    const prazoMatch = texto.match(/(?:encerrada\s+a\s+instrução|instrução\s+processual)[^.]*?prazo\s+(?:de\s+)?(\d+)\s*dias?/i);
    
    const days = replicaMatch?.[1] || razoesMatch?.[1] || prazoMatch?.[1];
    if (days) {
      result.prazoReplica = { prazo: `${days} dias`, descricao: 'Prazo para réplica/razões finais' };
    }
  }

  // Extract perícia info
  const periciaMatch = texto.match(/(?:designo|nomeio|indico)\s+(?:como\s+)?perito[^.]*?([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç\s]+)/i);
  if (periciaMatch) {
    result.prazoPericia = {
      prazo: '',
      perito: periciaMatch[1].trim(),
      tipo: /insalubridade/i.test(texto) ? 'Insalubridade' : /periculosidade/i.test(texto) ? 'Periculosidade' : 'Técnica',
    };
  }

  // Extract acordo value — from the CONCILIAÇÃO: section specifically
  if (isAcordo) {
    // Find the CONCILIAÇÃO: section and extract from there
    const concMatch = texto.match(/CONCILIA[CÇ][AÃ]O\s*:([\s\S]*?)(?:documento assinado|faculta-se|cumprido o acordo|DISCRIMINA[CÇ][AÃ]O|$)/i);
    const concSection = concMatch ? concMatch[1] : texto;
    
    // Extract R$ value from conciliação section
    const valorMatch = concSection.match(/R\$\s*([\d.,]+)/i);
    if (valorMatch) {
      const cleanValue = valorMatch[1].replace(/[.,\s]+$/, '');
      result.acordo = { textoAcordo: `R$ ${cleanValue}` };
      
      // Extract payment date from conciliação section
      // Patterns: "no dia 25/07/2026", "dia 22/07/2026", "até 25/07/2026", "em 25/07/2026"
      const dateMatch = concSection.match(/(?:no\s+dia|dia|em|até\s+o?\s*dia|até)\s+(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/i);
      if (dateMatch) {
        result.acordo.dataPagamento = dateMatch[1].replace(/\./g, '/');
      }
      
      // Extract parcelas count
      // Patterns: "4 parcelas de R$750", "em 4 parcelas", "04 parcelas", "dividido em 4"
      const parcelasMatch = concSection.match(/(\d+)\s*parcela/i)
        || concSection.match(/dividid[oa]\s+em\s+(\d+)/i)
        || texto.match(/(\d+)\s*parcelas?\s+de\s+R\$/i);
      if (parcelasMatch) {
        result.acordo.parcelas = parcelasMatch[1];
      }
    }
  }

  return result;
}

// ── Extract reclamante, reclamada, processo from ATA ─────────────────
function extrairPartesAta(texto: string): { reclamante: string; reclamada: string; processo: string; vara: string } {
  let reclamante = '', reclamada = '', processo = '', vara = '';

  const procMatch = texto.match(/(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/);
  if (procMatch) processo = procMatch[1];

  // Reclamante extraction — many patterns
  const rectePatterns = [
    // "Reclamante: NOME" or "Reclamante NOME"
    /reclamante[:\s]+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç\s.]+?)(?:\s*(?:,|reclamad|advers|r[ée]u|versus|x\s|v\.?\s|vs\.?\s|\.|\n))/i,
    // "Autor(a): NOME"
    /autor(?:a)?[:\s]+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç\s.]+?)(?:\s*(?:,|reclamad|advers|r[ée]u|\.|\n))/i,
    // "NOME, reclamante" or "NOME (reclamante)"
    /([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ\s.]{5,40})(?:,?\s*(?:reclamante|autor|periciand))/i,
    // "o(a) reclamante NOME"
    /[oa]\s+reclamante\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç\s.]+?)(?:\s*(?:,|\.|concorda|dará|receberá|pagará))/i,
    // "à reclamante ... quantia" — for acordo text like "pagará à reclamante"
    /[àa]\s+reclamante\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç\s.]+?)(?:\s*(?:a\s+quantia|o\s+valor|,))/i,
    // Between process number and "Vara" or "reclamada"
    /\d{4}\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ\s.]{5,40})(?:\s*(?:x\s|v\.?\s|vs\.?\s))/i,
    // Periciando(a)
    /periciand[oa][:\s]+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç\s.]+?)(?:\s*(?:,|reclamad|advers|r[ée]u))/i,
  ];
  for (const p of rectePatterns) {
    const m = texto.match(p);
    if (m && m[1].trim().length > 3 && m[1].trim().split(/\s+/).length >= 2) {
      reclamante = m[1].trim().replace(/\s+/g, ' ');
      break;
    }
  }

  // Reclamada extraction
  const recdaPatterns = [
    /reclamad[ao][:\s]+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ\s.&]+?)(?:\s*(?:\.|Processo|autos|vara|CNPJ|,\s*inscrit|pagará|\n))/i,
    /r[ée]u?[:\s]+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ\s.&]+?)(?:\s*(?:\.|Processo|CNPJ|\n))/i,
    // "EMPRESA LTDA" or "EMPRESA S/A" or "EMPRESA S.A" patterns
    /(?:x|vs?\.?)\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ\s.&\/]+?(?:LTDA|S\.?A\.?|EIRELI|ME|EPP|LTDA\.))/i,
  ];
  for (const p of recdaPatterns) {
    const m = texto.match(p);
    if (m && m[1].trim().length > 3) { reclamada = m[1].trim().replace(/\s+/g, ' '); break; }
  }

  const varaMatch = texto.match(/(\d+[ªa]\s*Vara\s+(?:do\s+)?Trabalho[^,\n]*)/i);
  if (varaMatch) vara = varaMatch[1].trim();

  return { reclamante, reclamada, processo, vara };
}

// ── Color utilities ──────────────────────────────────────────────────
function getClassBadge(c: string): { bg: string; color: string; emoji: string } {
  switch (c) {
    case 'RÉPLICA': return { bg: 'rgba(139,92,246,0.15)', color: '#8b5cf6', emoji: '📝' };
    case 'PERÍCIA': return { bg: 'rgba(6,182,212,0.15)', color: '#06b6d4', emoji: '🔬' };
    case 'JULGAMENTO': return { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', emoji: '⚖️' };
    case 'ACORDO': return { bg: 'rgba(16,185,129,0.15)', color: '#10b981', emoji: '🤝' };
    case 'AUDIÊNCIA': return { bg: 'rgba(99,102,241,0.15)', color: '#6366f1', emoji: '📅' };
    default: return { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8', emoji: '📄' };
  }
}

function getModalidadeLabel(m: string): { text: string; color: string } {
  if (m === 'online') return { text: '🔵 Online', color: '#00b0f0' };
  if (m === 'julgamento') return { text: '🟡 Julgamento', color: '#eab308' };
  return { text: '⬜ Presencial', color: '#94a3b8' };
}

// ── PDF extraction (client-side) ─────────────────────────────────────
async function extractTextFromPDF(arrayBuffer: ArrayBuffer): Promise<string> {
  const pdfjsUrl = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js';
  if (!(window as any).pdfjsLib) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = pdfjsUrl;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Falha ao carregar PDF.js'));
      document.head.appendChild(script);
    });
    (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = '';
  }
  const pdfjsLib = (window as any).pdfjsLib;
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer), disableWorker: true }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item: any) => item.str || '').join(' '));
  }
  return pages.join('\n');
}

// ── localStorage persistence ─────────────────────────────────────────
function getProcessados(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem('ata_processados') || '{}'); } catch { return {}; }
}
function saveProcessado(id: string) {
  const m = getProcessados(); m[id] = true;
  localStorage.setItem('ata_processados', JSON.stringify(m));
}

// ── Component ─────────────────────────────────────────────────────────
export default function AtaAudienciaPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [atas, setAtas] = useState<AtaItem[]>([]);
  const [expandedAta, setExpandedAta] = useState<string | null>(null);
  const [filterClass, setFilterClass] = useState<string>('TODOS');
  const [acordoForms, setAcordoForms] = useState<Record<string, AcordoForm>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  const loadAtas = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/publicacoes');
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erro'); return; }
      if (!data.pdfs || data.pdfs.length === 0) { setError('Nenhum PDF de ATA encontrado na pasta do Drive.'); return; }

      const processados = getProcessados();
      const allAtas: AtaItem[] = [];
      const acordoFormsInit: Record<string, AcordoForm> = {};

      for (const pdf of data.pdfs) {
        const binary = atob(pdf.base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const text = await extractTextFromPDF(bytes.buffer);
        if (text.trim().length < 30) continue;

        // 1 PDF = 1 ATA (no splitting — each document is a single ATA)
        const classificacoes = classificarAta(text);
        const partes = extrairPartesAta(text);
        const dados = extrairDadosAta(text, classificacoes);
        const ataId = pdf.id;

        allAtas.push({
          id: ataId,
          reclamante: partes.reclamante,
          reclamada: partes.reclamada,
          processo: partes.processo,
          vara: partes.vara,
          descricaoCompleta: text.substring(0, 2000),
          classificacoes,
          proximaAudiencia: dados.proximaAudiencia,
          prazoReplica: dados.prazoReplica,
          prazoPericia: dados.prazoPericia,
          acordo: dados.acordo,
          julgamento: dados.julgamento,
          pdfName: pdf.name || 'ATA',
          pdfId: pdf.id,
          processado: processados[ataId] === true,
        });

        // Pre-fill acordo form with extracted value, date, and parcelas
        if (dados.acordo?.textoAcordo) {
          const valMatch = dados.acordo.textoAcordo.match(/R\$\s*([\d.,]+)/);
          if (valMatch) {
            acordoFormsInit[ataId] = {
              valorAcordo: valMatch[1],
              parcelas: dados.acordo.parcelas || '1',
              dataUltimaParcela: dados.acordo.dataPagamento || '',
              fgtsLiberado: false,
              seguroDesemprego: false,
            };
          }
        }
      }

      if (allAtas.length === 0) setError('PDFs encontrados, mas nenhuma ATA de audiência reconhecida.');
      setAtas(allAtas);
      if (Object.keys(acordoFormsInit).length > 0) setAcordoForms(acordoFormsInit);
    } catch (err) { setError(`Erro: ${err instanceof Error ? err.message : String(err)}`); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAtas(); }, [loadAtas]);

  // ── Actions ────────────────────────────────────────────────────────
  const handleSalvarAudiencia = async (ata: AtaItem) => {
    if (!ata.proximaAudiencia) return;
    setProcessingId(ata.id);
    try {
      const res = await fetch('/api/ata-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'audiencia',
          data: {
            audiencia: {
              data: ata.proximaAudiencia.data,
              horario: ata.proximaAudiencia.horario,
              reclamante: ata.reclamante,
              reclamada: ata.reclamada,
              processo: ata.processo,
              vara: ata.vara,
              tipo: ata.proximaAudiencia.tipo,
              advogado: '',
              modalidade: ata.proximaAudiencia.modalidade,
            },
          },
        }),
      });
      if (res.ok) {
        saveProcessado(ata.id);
        setAtas(prev => prev.map(a => a.id === ata.id ? { ...a, processado: true } : a));
        setSuccessMsg(`✅ Audiência salva na planilha com cor ${ata.proximaAudiencia.modalidade === 'online' ? 'azul' : ata.proximaAudiencia.modalidade === 'julgamento' ? 'amarela' : 'sem cor'}!`);
        setTimeout(() => setSuccessMsg(''), 4000);
      }
    } catch (err) { console.error(err); }
    finally { setProcessingId(null); }
  };

  const handleSalvarAcordo = async (ata: AtaItem) => {
    const form = acordoForms[ata.id];
    if (!form || !form.valorAcordo) return;
    setProcessingId(ata.id);
    try {
      const valor = parseFloat(form.valorAcordo.replace(/\./g, '').replace(',', '.'));
      const res = await fetch('/api/ata-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'acordo',
          data: {
            acordo: {
              reclamante: ata.reclamante,
              reclamada: ata.reclamada,
              processo: ata.processo,
              vara: ata.vara,
              valorAcordo: valor,
              parcelas: parseInt(form.parcelas || '1'),
              dataUltimaParcela: form.dataUltimaParcela,
              fgtsLiberado: form.fgtsLiberado,
              seguroDesemprego: form.seguroDesemprego,
              advogado: '',
              dataAcordo: new Date().toLocaleDateString('pt-BR'),
            },
          },
        }),
      });
      if (res.ok) {
        saveProcessado(ata.id);
        setAtas(prev => prev.map(a => a.id === ata.id ? { ...a, processado: true } : a));
        const bruto = (valor * 0.70).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const liquido = (valor * 0.30).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        setSuccessMsg(`✅ Acordo salvo! Bruto: ${bruto} | Líquido: ${liquido}`);
        setTimeout(() => setSuccessMsg(''), 5000);
      }
    } catch (err) { console.error(err); }
    finally { setProcessingId(null); }
  };

  const updateAcordoForm = (ataId: string, field: keyof AcordoForm, value: any) => {
    setAcordoForms(prev => ({
      ...prev,
      [ataId]: { ...(prev[ataId] || { valorAcordo: '', parcelas: '1', dataUltimaParcela: '', fgtsLiberado: false, seguroDesemprego: false }), [field]: value },
    }));
  };

  // ── Filtered ATAs ──────────────────────────────────────────────────
  const filteredAtas = filterClass === 'TODOS'
    ? atas
    : atas.filter(a => a.classificacoes.includes(filterClass));

  const classCount = (c: string) => atas.filter(a => a.classificacoes.includes(c)).length;

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="main-content" style={{ padding: '1.5rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        📋 ATA de Audiência
      </h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        Processamento automático de ATAs do Google Drive
      </p>

      {/* Success Toast */}
      {successMsg && (
        <div style={{ position: 'fixed', top: '1rem', right: '1rem', background: 'rgba(16,185,129,0.95)', color: '#fff', padding: '0.75rem 1.25rem', borderRadius: '0.75rem', fontSize: '0.85rem', fontWeight: 600, zIndex: 9999, boxShadow: '0 4px 24px rgba(0,0,0,0.3)', animation: 'fadeIn 0.3s ease' }}>
          {successMsg}
        </div>
      )}

      {/* Filter Bar */}
      {!loading && atas.length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          {[
            { key: 'TODOS', label: 'Todos', count: atas.length },
            { key: 'RÉPLICA', label: '📝 Réplica', count: classCount('RÉPLICA') },
            { key: 'PERÍCIA', label: '🔬 Perícia', count: classCount('PERÍCIA') },
            { key: 'JULGAMENTO', label: '⚖️ Julgamento', count: classCount('JULGAMENTO') },
            { key: 'ACORDO', label: '🤝 Acordo', count: classCount('ACORDO') },
            { key: 'AUDIÊNCIA', label: '📅 Audiência', count: classCount('AUDIÊNCIA') },
          ].filter(f => f.count > 0 || f.key === 'TODOS').map(f => (
            <button
              key={f.key}
              onClick={() => setFilterClass(f.key)}
              style={{
                padding: '0.4rem 0.8rem',
                borderRadius: '1rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                border: '1px solid',
                borderColor: filterClass === f.key ? 'var(--accent-blue)' : 'var(--border-color)',
                background: filterClass === f.key ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: filterClass === f.key ? 'var(--accent-blue)' : 'var(--text-muted)',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '60vh', gap: '1rem',
          position: 'relative', zIndex: 2,
        }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '50%',
            border: '2px solid rgba(212,175,55,0.3)',
            borderTopColor: '#d4af37',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'bmcSpin 1.2s linear infinite',
          }}>
            <span style={{
              fontSize: '0.65rem', fontWeight: 800, color: '#d4af37',
              letterSpacing: '-0.5px', animation: 'bmcSpin 1.2s linear infinite reverse',
            }}>BM&amp;C</span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Processando PDFs das ATAs...</p>
          <style>{`@keyframes bmcSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ padding: '1rem', background: 'rgba(239,68,68,0.1)', borderRadius: '0.75rem', color: '#ef4444', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {/* ATA Cards */}
      {!loading && filteredAtas.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filteredAtas.map(ata => {
            const isExpanded = expandedAta === ata.id;
            const form = acordoForms[ata.id] || { valorAcordo: '', parcelas: '1', dataUltimaParcela: '', fgtsLiberado: false, seguroDesemprego: false };
            const valorNum = parseFloat((form.valorAcordo || '0').replace(/\./g, '').replace(',', '.'));
            const valorBruto = valorNum * 0.70;
            const valorLiquido = valorNum * 0.30;

            return (
              <div
                key={ata.id}
                style={{
                  background: 'var(--card-bg)',
                  borderRadius: '1rem',
                  border: '1px solid var(--border-color)',
                  overflow: 'hidden',
                  transition: 'all 0.2s',
                  opacity: ata.processado ? 0.6 : 1,
                }}
              >
                {/* Header */}
                <div
                  onClick={() => setExpandedAta(isExpanded ? null : ata.id)}
                  style={{ padding: '1rem 1.25rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                        {ata.reclamante || 'Reclamante não identificado'}
                      </div>
                      {ata.reclamada && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                          vs {ata.reclamada}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {ata.classificacoes.map(c => {
                        const b = getClassBadge(c);
                        return (
                          <span key={c} style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: '1rem', background: b.bg, color: b.color, fontWeight: 600 }}>
                            {b.emoji} {c}
                          </span>
                        );
                      })}
                      {ata.processado && (
                        <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: '1rem', background: 'rgba(16,185,129,0.15)', color: '#10b981', fontWeight: 600 }}>
                          ✅ Processado
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {ata.processo && <span style={{ fontFamily: 'monospace' }}>📋 {ata.processo}</span>}
                    {ata.vara && <span>🏛️ {ata.vara}</span>}
                    <span>📄 {ata.pdfName}</span>
                  </div>
                  {/* Quick preview of detected actions */}
                  {ata.proximaAudiencia && (
                    <div style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', background: 'rgba(99,102,241,0.08)', borderRadius: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', width: 'fit-content' }}>
                      📅 Próx. audiência: <strong>{ata.proximaAudiencia.data}</strong> às <strong>{ata.proximaAudiencia.horario}</strong>
                      <span style={{ color: getModalidadeLabel(ata.proximaAudiencia.modalidade).color, fontWeight: 700 }}>
                        {getModalidadeLabel(ata.proximaAudiencia.modalidade).text}
                      </span>
                    </div>
                  )}
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border-color)', padding: '1.25rem' }}>
                    {/* Extracted Data Summary */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>

                      {/* Audiência Card */}
                      {ata.proximaAudiencia && (
                        <div style={{ padding: '1rem', borderRadius: '0.75rem', border: '1px solid rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.05)' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#6366f1', marginBottom: '0.5rem' }}>📅 Próxima Audiência</div>
                          <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            <span>Data: <strong>{ata.proximaAudiencia.data}</strong></span>
                            <span>Horário: <strong>{ata.proximaAudiencia.horario}</strong></span>
                            <span>Tipo: <strong>{ata.proximaAudiencia.tipo}</strong></span>
                            <span style={{ color: getModalidadeLabel(ata.proximaAudiencia.modalidade).color, fontWeight: 700 }}>
                              {getModalidadeLabel(ata.proximaAudiencia.modalidade).text}
                            </span>
                          </div>
                          <button
                            onClick={() => handleSalvarAudiencia(ata)}
                            disabled={!!processingId || ata.processado}
                            style={{
                              marginTop: '0.75rem',
                              width: '100%',
                              padding: '0.5rem',
                              borderRadius: '0.5rem',
                              border: 'none',
                              background: ata.processado ? '#64748b' : '#6366f1',
                              color: '#fff',
                              fontWeight: 700,
                              fontSize: '0.8rem',
                              cursor: ata.processado ? 'not-allowed' : 'pointer',
                              opacity: processingId === ata.id ? 0.5 : 1,
                            }}
                          >
                            {processingId === ata.id ? '⏳ Salvando...' : ata.processado ? '✅ Já salvo' : '💾 Salvar na Planilha'}
                          </button>
                        </div>
                      )}

                      {/* Réplica Card */}
                      {ata.prazoReplica && (
                        <div style={{ padding: '1rem', borderRadius: '0.75rem', border: '1px solid rgba(139,92,246,0.2)', background: 'rgba(139,92,246,0.05)' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#8b5cf6', marginBottom: '0.5rem' }}>📝 Prazo para Réplica</div>
                          <div style={{ fontSize: '0.8rem' }}>
                            <span>Prazo: <strong>{ata.prazoReplica.prazo}</strong></span>
                            <div style={{ marginTop: '0.25rem', color: 'var(--text-muted)' }}>{ata.prazoReplica.descricao}</div>
                          </div>
                        </div>
                      )}

                      {/* Perícia Card */}
                      {ata.prazoPericia && (
                        <div style={{ padding: '1rem', borderRadius: '0.75rem', border: '1px solid rgba(6,182,212,0.2)', background: 'rgba(6,182,212,0.05)' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#06b6d4', marginBottom: '0.5rem' }}>🔬 Perícia</div>
                          <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            {ata.prazoPericia.tipo && <span>Tipo: <strong>{ata.prazoPericia.tipo}</strong></span>}
                            {ata.prazoPericia.perito && <span>Perito: <strong>{ata.prazoPericia.perito}</strong></span>}
                          </div>
                        </div>
                      )}

                      {/* Julgamento Card */}
                      {ata.classificacoes.includes('JULGAMENTO') && (
                        <div style={{ padding: '1rem', borderRadius: '0.75rem', border: '1px solid rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.05)' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#f59e0b', marginBottom: '0.5rem' }}>⚖️ Julgamento Antecipado</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Súmula 197 — Dispensada instrução processual</div>
                        </div>
                      )}
                    </div>

                    {/* Acordo Form */}
                    {ata.classificacoes.includes('ACORDO') && (
                      <div style={{ padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.05)', marginBottom: '1rem' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#10b981', marginBottom: '1rem' }}>🤝 Registrar Acordo</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
                          <div>
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>VALOR DO ACORDO (R$)</label>
                            <input
                              type="text"
                              value={form.valorAcordo}
                              onChange={e => updateAcordoForm(ata.id, 'valorAcordo', e.target.value)}
                              placeholder="10.000,00"
                              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>PARCELAS</label>
                            <input
                              type="number"
                              value={form.parcelas}
                              onChange={e => updateAcordoForm(ata.id, 'parcelas', e.target.value)}
                              min="1"
                              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>DATA ÚLTIMA PARCELA</label>
                            <input
                              type="date"
                              value={form.dataUltimaParcela}
                              onChange={e => updateAcordoForm(ata.id, 'dataUltimaParcela', e.target.value)}
                              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                            />
                          </div>
                        </div>

                        {/* Cálculo automático */}
                        {valorNum > 0 && (
                          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                            <div style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', background: 'rgba(239,68,68,0.1)', fontSize: '0.8rem' }}>
                              💰 Bruto (70%): <strong style={{ color: '#ef4444' }}>{valorBruto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                            </div>
                            <div style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', background: 'rgba(16,185,129,0.1)', fontSize: '0.8rem' }}>
                              💸 Líquido (30%): <strong style={{ color: '#10b981' }}>{valorLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                            </div>
                          </div>
                        )}

                        {/* Checkboxes */}
                        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={form.fgtsLiberado}
                              onChange={e => updateAcordoForm(ata.id, 'fgtsLiberado', e.target.checked)}
                              style={{ width: '16px', height: '16px', accentColor: '#10b981' }}
                            />
                            FGTS Liberado
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={form.seguroDesemprego}
                              onChange={e => updateAcordoForm(ata.id, 'seguroDesemprego', e.target.checked)}
                              style={{ width: '16px', height: '16px', accentColor: '#10b981' }}
                            />
                            Seguro Desemprego
                          </label>
                        </div>

                        <button
                          onClick={() => handleSalvarAcordo(ata)}
                          disabled={!!processingId || !form.valorAcordo}
                          style={{
                            marginTop: '1rem',
                            padding: '0.6rem 1.5rem',
                            borderRadius: '0.5rem',
                            border: 'none',
                            background: '#10b981',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            cursor: form.valorAcordo ? 'pointer' : 'not-allowed',
                            opacity: processingId === ata.id ? 0.5 : form.valorAcordo ? 1 : 0.5,
                          }}
                        >
                          {processingId === ata.id ? '⏳ Salvando...' : '💾 Salvar Acordo na Planilha'}
                        </button>
                      </div>
                    )}

                    {/* Raw text preview */}
                    <details style={{ marginTop: '0.5rem' }}>
                      <summary style={{ fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer' }}>📄 Ver texto completo da ATA</summary>
                      <pre style={{ fontSize: '0.7rem', marginTop: '0.5rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '0.5rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '300px', overflow: 'auto', color: 'var(--text-muted)' }}>
                        {ata.descricaoCompleta}
                      </pre>
                    </details>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filteredAtas.length === 0 && atas.length > 0 && (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
          Nenhuma ATA com a classificação &quot;{filterClass}&quot;
        </div>
      )}
    </div>
  );
}
