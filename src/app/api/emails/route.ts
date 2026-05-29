import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getClientEmails, getRecentUpdates, detectClosedProcess } from '@/lib/gmail';
import { getClientById, updateClientStatus, writeProcessNumber } from '@/lib/sheets';
import { detectCurrentPhase, isStatusAdvanced } from '@/lib/phases';

export const dynamic = 'force-dynamic';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID ?? '';

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
    const processNumber = searchParams.get('processNumber');

    // Se nenhum clientName fornecido, retornar atualizações recentes do tribunal
    if (!clientName || clientName.trim() === '') {
      const emails = await getRecentUpdates(session.accessToken);
      return NextResponse.json({ emails, total: emails.length });
    }

    // Buscar emails relacionados ao cliente específico
    // Usar número do processo para filtragem se disponível
    const emails = await getClientEmails(
      session.accessToken,
      clientName.trim(),
      processNumber || undefined
    );

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
          const currentStatus = client.status.toUpperCase().trim();
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
            const currentStatus = client.status.toUpperCase().trim();
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
