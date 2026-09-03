import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getAdminAccessToken } from '@/lib/admin-token';
import { getSheetsService } from '@/lib/google-auth';

const SPREADSHEET_ID = '11ni1pXu0QbPQ_QmMGxdqdT4PsDNz6Z0ITBUW-E1ogMM';
const ADMIN_EMAIL = 'gabriielroberto10@gmail.com';

// In-memory revoked set (persists within a single serverless invocation)
// Also stored in Google Sheet for persistence across invocations
const revokedEmails = new Set<string>();

/** GET — Check if an email is revoked */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email')?.toLowerCase();

  if (!email) {
    return NextResponse.json({ revoked: false });
  }

  // Check in-memory first
  if (revokedEmails.has(email)) {
    return NextResponse.json({ revoked: true });
  }

  // Check in sheet
  try {
    const token = await getAdminAccessToken();
    const sheets = getSheetsService(token);

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Revogados!A:B',
    }).catch(() => ({ data: { values: [] as string[][] } }));

    const rows = (res.data.values || []) as string[][];
    for (const row of rows) {
      if ((row[0] || '').toLowerCase() === email) {
        revokedEmails.add(email); // cache
        return NextResponse.json({ revoked: true });
      }
    }
  } catch {}

  return NextResponse.json({ revoked: false });
}

/** POST — Revoke a user (admin only) */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || session.user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: 'Email obrigatório' }, { status: 400 });
    }

    const targetEmail = email.toLowerCase();
    revokedEmails.add(targetEmail);

    // Persist to sheet
    const token = await getAdminAccessToken();
    const sheets = getSheetsService(token);

    // Ensure Revogados sheet exists
    try {
      await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: 'Revogados!A1',
      });
    } catch {
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: {
            requests: [{
              addSheet: { properties: { title: 'Revogados' } },
            }],
          },
        });
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: 'Revogados!A1:B1',
          valueInputOption: 'RAW',
          requestBody: { values: [['EMAIL', 'DATA_REVOGACAO']] },
        });
      } catch {}
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Revogados!A:B',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[targetEmail, new Date().toISOString()]],
      },
    });

    // Log activity
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Atividades!A:E',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[new Date().toISOString(), ADMIN_EMAIL, 'Admin', 'KICK', `Forçou saída de ${targetEmail}`]],
      },
    });

    return NextResponse.json({ success: true, message: `${targetEmail} revogado` });
  } catch (error: any) {
    console.error('Revoke error:', error);
    return NextResponse.json({ error: 'Erro ao revogar', details: error?.message }, { status: 500 });
  }
}

/** DELETE — Remove revocation (admin only) */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email || session.user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: 'Email obrigatório' }, { status: 400 });
    }

    const targetEmail = email.toLowerCase();
    revokedEmails.delete(targetEmail);

    // Remove from sheet
    const token = await getAdminAccessToken();
    const sheets = getSheetsService(token);

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Revogados!A:B',
    }).catch(() => ({ data: { values: [] as string[][] } }));

    const rows = (res.data.values || []) as string[][];
    for (let i = 1; i < rows.length; i++) {
      if ((rows[i][0] || '').toLowerCase() === targetEmail) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `Revogados!A${i + 1}:B${i + 1}`,
          valueInputOption: 'RAW',
          requestBody: { values: [['', '']] },
        });
        break;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: 'Erro', details: error?.message }, { status: 500 });
  }
}
