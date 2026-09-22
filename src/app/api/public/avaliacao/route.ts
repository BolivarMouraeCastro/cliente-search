import { NextRequest, NextResponse } from 'next/server';
import { getSheetsService } from '@/lib/google-auth';
import { getAdminAccessToken } from '@/lib/admin-token';

const SPREADSHEET_ID = '11ni1pXu0QbPQ_QmMGxdqdT4PsDNz6Z0ITBUW-E1ogMM';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nome, cpf, nota, comentario } = body;

    if (!nome || typeof nome !== 'string') {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
    }
    const cleanCpf = cpf?.replace(/\D/g, '');
    if (!cleanCpf || cleanCpf.length !== 11) {
      return NextResponse.json({ error: 'CPF inválido (deve conter 11 dígitos)' }, { status: 400 });
    }
    const numNota = Number(nota);
    if (isNaN(numNota) || numNota < 1 || numNota > 5) {
      return NextResponse.json({ error: 'Nota inválida (deve ser de 1 a 5)' }, { status: 400 });
    }

    const token = await getAdminAccessToken();
    const sheets = getSheetsService(token);

    // Ensure tab exists
    try {
      await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Avaliacoes!A1',
      });
    } catch (e: any) {
      if (e?.response?.status === 400 && e?.message?.includes('Unable to parse range')) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: {
            requests: [{
              addSheet: { properties: { title: 'Avaliacoes' } }
            }]
          }
        });
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: 'Avaliacoes!A1:F1',
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [['NOME', 'CPF', 'NOTA', 'COMENTARIO', 'DATA', 'HORA']]
          }
        });
      } else {
        throw e;
      }
    }

    const now = new Date();
    const dataStr = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const horaStr = now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Avaliacoes!A:F',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[nome, cleanCpf, numNota, comentario || '', dataStr, horaStr]],
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Erro na avaliação:', error);
    return NextResponse.json({ error: 'Erro interno ao salvar avaliação' }, { status: 500 });
  }
}
