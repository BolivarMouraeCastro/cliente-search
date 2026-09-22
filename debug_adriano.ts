import { google } from 'googleapis';
import * as fs from 'fs';

const envFile = fs.readFileSync('.env.test', 'utf8');
const env: Record<string, string> = {};
envFile.split('\n').forEach(line => {
  if (line && line.includes('=')) {
    const [k, ...v] = line.split('=');
    env[k.trim()] = v.join('=').trim().replace(/^"|"$/g, '');
  }
});

async function getAdminAccessToken() {
  const params = new URLSearchParams();
  params.append('client_id', env.GOOGLE_CLIENT_ID!);
  params.append('client_secret', env.GOOGLE_CLIENT_SECRET!);
  params.append('refresh_token', env.ADMIN_REFRESH_TOKEN!);
  params.append('grant_type', 'refresh_token');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  const data = await response.json();
  return data.access_token;
}

async function run() {
  try {
    const token = await getAdminAccessToken();
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: token });
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    
    const spreadsheetId = env.GOOGLE_SPREADSHEET_ID;
    console.log('Main Spreadsheet ID:', spreadsheetId);
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'A:K',
    });
    
    const rows = response.data.values || [];
    console.log(`Total rows in main sheet: ${rows.length}`);
    
    const adrianoRows = rows.filter(r => (r[0] || '').toUpperCase().includes('ADRIANO PERIGO') || (r[1] || '').toUpperCase().includes('ADRIANO PERIGO'));
    console.log('Found rows for ADRIANO PERIGO:', JSON.stringify(adrianoRows, null, 2));
    
  } catch(e) {
    console.error(e);
  }
}

run();
