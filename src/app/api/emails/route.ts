import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getClientEmails, getRecentUpdates, detectClosedProcess } from '@/lib/gmail';
import { getClientById, updateClientStatus, writeProcessNumber } from '@/lib/sheets';
import { detectCurrentPhase, isStatusAdvanced } from '@/lib/phases';

export const dynamic = 'force-dynamic';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? '';

/**
 * Parse a date string in DD/MM/YYYY format to a Date object.
 */
function parseEntradaDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;
  const parts = dateStr.trim().split('/');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  let year = parseInt(parts[2], 10);
  if (year < 100) year += 2000;
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  return new Date(year, month, day);
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.accessToken) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const clientName = searchParams.get('clientName');
    const clientId = searchParams.get('clientId');
    let processNumber = searchParams.get('processNumber');
    const entrada = searchParams.get('entrada'); // Data de entrada do cliente (DD/MM/YYYY)

    // Se nenhum clientName fornecido, retornar atualizações recentes do tribunal
    if (!clientName || clientName.trim() === '') {
      const emails = await getRecentUpdates(session.accessToken);
      return NextResponse.json({ emails, total: emails.length });
    }

    // ═══════════════════════════════════════════════════════════════
    // VALIDAÇÃO DO NÚMERO DO PROCESSO: Verifica se o ano do processo
    // é compatível com a data de entrada. Ex: processo de 2019 com
    // entrada em 2026 = número errado (processo antigo do mesmo cliente).
    // Formato do processo: NNNNNNN-NN.YYYY.N.NN.NNNN
    // ═══════════════════════════════════════════════════════════════
    let processNumberIsStale = false;
    if (processNumber && processNumber.trim() !== '' && entrada) {
      const processYearMatch = processNumber.match(/\.(\d{4})\./);
      const parsedEntrada = parseEntradaDate(entrada);
      if (processYearMatch && parsedEntrada) {
        const processYear = parseInt(processYearMatch[1], 10);
        const entradaYear = parsedEntrada.getFullYear();
        // Se diferença > 2 anos, o processo é antigo
        if (Math.abs(entradaYear - processYear) > 2) {
          console.log(`⚠️ Process number ${processNumber} (year ${processYear}) doesn't match entry date ${entrada} (year ${entradaYear}) for ${clientName}. Ignoring stale process number.`);
          processNumberIsStale = true;
          // Limpar o número do processo errado da planilha
          if (clientId && SPREADSHEET_ID) {
            writeProcessNumber(session.accessToken, SPREADSHEET_ID, clientId, '').catch(() => {});
            console.log(`Cleared stale process number for ${clientName} (row ${clientId})`);
          }
          processNumber = null; // Ignorar número antigo
        }
      }
    }

    // Buscar emails relacionados ao cliente específico
    let emails = await getClientEmails(
      session.accessToken,
      clientName.trim(),
      processNumber || undefined
    );

    // ═══════════════════════════════════════════════════════════════
    // FILTRO POR DATA DE ENTRADA: Se o cliente tem data de entrada,
    // filtrar emails para só mostrar os relevantes ao processo atual.
    // SEMPRE filtra quando não tem processo number ou quando o
    // processo é antigo (stale).
    // ═══════════════════════════════════════════════════════════════
    if (entrada && (!processNumber || processNumber.trim() === '' || processNumberIsStale)) {
      const parsedEntrada = parseEntradaDate(entrada);
      if (parsedEntrada) {
        // 60 dias antes da entrada como margem
        const cutoffDate = new Date(parsedEntrada.getTime() - 60 * 24 * 60 * 60 * 1000);
        const beforeCount = emails.length;
        emails = emails.filter((email) => {
          const emailDate = new Date(email.date);
          return emailDate >= cutoffDate;
        });
        if (emails.length < beforeCount) {
          console.log(`Filtered ${beforeCount - emails.length} old emails for ${clientName} (entrada: ${entrada})`);
        }
      }
    }

    // Auto-atualizar status e número do processo
    let statusUpdated = false;
    let newStatus: string | null = null;
    let processNumberSaved = false;
    let isArchived = false;

    if (clientId && SPREADSHEET_ID && emails.length > 0) {
      const client = await getClientById(
        session.accessToken,
        SPREADSHEET_ID,
        clientId
      );

      if (client) {
        const currentStatus = client.status.toUpperCase().trim();
        const isBolivar = currentStatus === 'BOLIVAR';

        // ═══════════════════════════════════════════════════════════════
        // PROTEÇÃO BOLIVAR: Clientes com status BOLIVAR são NOVOS e
        // ainda não foram distribuídos na justiça. Os e-mails encontrados
        // no Gmail pertencem a processos ANTIGOS do mesmo cliente.
        // NÃO salvar número de processo NEM atualizar status.
        // ═══════════════════════════════════════════════════════════════
        if (!isBolivar) {
          // --- Auto-salvar número do processo se ainda não armazenado ---
          if (!client.numeroProcesso || client.numeroProcesso.trim() === '') {
            const emailWithProcess = emails.find((e) => e.processNumber && e.processNumber.trim() !== '');
            if (emailWithProcess?.processNumber) {
              const saved = await writeProcessNumber(
                session.accessToken,
                SPREADSHEET_ID,
                clientId,
                emailWithProcess.processNumber
              );
              if (saved) {
                processNumberSaved = true;
                console.log(`Auto-saved process number ${emailWithProcess.processNumber} for client: ${clientName} (row ${clientId})`);
              }
            }
          }

          // --- Detectar processo encerrado/arquivado ---
          const isClosed = detectClosedProcess(emails);
          if (isClosed) {
            isArchived = true;
            if (currentStatus !== 'ARQUIVADO') {
              const updated = await updateClientStatus(
                session.accessToken,
                SPREADSHEET_ID,
                clientId,
                'ARQUIVADO'
              );
              if (updated) {
                statusUpdated = true;
                newStatus = 'ARQUIVADO';
                console.log(`Auto-archived process for client: ${clientName} (row ${clientId})`);
              }
            }
          } else {
            // --- Atualização normal baseada em fase (somente se NÃO arquivado) ---
            const detectedStatus = detectCurrentPhase(emails);
            if (detectedStatus) {
              if (currentStatus !== 'ARQUIVADO' && (isStatusAdvanced(currentStatus, detectedStatus) || !currentStatus)) {
                const updated = await updateClientStatus(
                  session.accessToken,
                  SPREADSHEET_ID,
                  clientId,
                  detectedStatus
                );
                if (updated) {
                  statusUpdated = true;
                  newStatus = detectedStatus;
                  console.log(`Auto-updated status to "${detectedStatus}" for client: ${clientName} (row ${clientId})`);
                }
              }
            }
          }
        } else {
          console.log(`Skipping auto-detection for BOLIVAR client: ${clientName} (row ${clientId}) — new process, emails may belong to older cases`);
        }
      }
    }

    return NextResponse.json({
      emails,
      total: emails.length,
      statusUpdated,
      newStatus,
      processNumberSaved,
      isArchived,
    });
  } catch (error) {
    console.error('API /api/emails error:', error);
    const message =
      error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
