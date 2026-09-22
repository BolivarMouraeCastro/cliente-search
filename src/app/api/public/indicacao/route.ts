import { NextRequest, NextResponse } from 'next/server';
import { getSheetsService } from '@/lib/google-auth';
import { getAdminAccessToken } from '@/lib/admin-token';

const SPREADSHEET_ID = '11ni1pXu0QbPQ_QmMGxdqdT4PsDNz6Z0ITBUW-E1ogMM';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nomeIndicador, nomeIndicado, telefone } = body;

    if (!nomeIndicador || !nomeIndicado || !telefone) {
      return NextResponse.json({ error: 'Todos os campos são obrigatórios' }, { status: 400 });
    }
    const cleanTelefone = telefone.replace(/\D/g, '');
    if (cleanTelefone.length < 10) {
      return NextResponse.json({ error: 'Telefone inválido (mínimo 10 dígitos)' }, { status: 400 });
    }

    const token = await getAdminAccessToken();
    const sheets = getSheetsService(token);

    // Ensure tab exists
    try {
      await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Indicacoes!A1',
      });
    } catch (e: any) {
      if (e?.response?.status === 400 && e?.message?.includes('Unable to parse range')) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: {
            requests: [{
              addSheet: { properties: { title: 'Indicacoes' } }
            }]
          }
        });
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: 'Indicacoes!A1:E1',
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [['INDICADO_POR', 'NOME_INDICADO', 'TELEFONE', 'DATA', 'HORA']]
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
      range: 'Indicacoes!A:E',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[nomeIndicador, nomeIndicado, cleanTelefone, dataStr, horaStr]],
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Erro na indicação:', error);
    return NextResponse.json({ error: 'Erro interno ao salvar indicação' }, { status: 500 });
  }
}
