import { NextRequest, NextResponse } from 'next/server';
import { getAdminAccessToken } from '@/lib/admin-token';
import { getSheetsService } from '@/lib/google-auth';
import { hashPassword } from '@/lib/password';

const SPREADSHEET_ID = '11ni1pXu0QbPQ_QmMGxdqdT4PsDNz6Z0ITBUW-E1ogMM';
const TAB_NAME = 'Usuarios';

export async function POST(request: NextRequest) {
  try {
    const { email, senha, nome } = await request.json();

    if (!email || !senha || !nome) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const token = await getAdminAccessToken();
    if (!token) {
      return NextResponse.json({ error: 'Admin token not available' }, { status: 500 });
    }

    const sheets = getSheetsService(token);

    // Ensure the sheet exists, or get existing data
    let response;
    try {
      response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${TAB_NAME}!A:E`,
      });
    } catch (error: any) {
      if (error.message?.includes('Unable to parse range')) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: TAB_NAME,
                  },
                },
              },
            ],
          },
        });
        
        // Add headers
        await sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: `${TAB_NAME}!A1:E1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [['EMAIL', 'NOME', 'ROLE', 'DATA_CADASTRO', 'SENHA']],
          },
        });
        
        response = { data: { values: [['EMAIL', 'NOME', 'ROLE', 'DATA_CADASTRO', 'SENHA']] } };
      } else {
        throw error;
      }
    }

    const rows = response.data.values || [];
    
    // Check if email already exists
    const emailExists = rows.some((row: any[]) => row[0] === email);
    if (emailExists) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
    }

    // Append new user
    const hashedPassword = hashPassword(senha);
    const dateCadastro = new Date().toISOString();

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${TAB_NAME}!A:E`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[email, nome, 'usuario', dateCadastro, hashedPassword]],
      },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: any) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
