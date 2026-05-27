import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { gmail_v1, sheets_v4, drive_v3 } from "googleapis";

/**
 * Creates an authenticated OAuth2 client from an access token.
 */
export function createOAuth2Client(accessToken: string): OAuth2Client {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
  });

  return oauth2Client;
}

/**
 * Returns an authenticated Gmail service instance.
 */
export function getGmailService(accessToken: string): gmail_v1.Gmail {
  const auth = createOAuth2Client(accessToken);
  return google.gmail({ version: "v1", auth });
}

/**
 * Returns an authenticated Google Sheets service instance.
 */
export function getSheetsService(accessToken: string): sheets_v4.Sheets {
  const auth = createOAuth2Client(accessToken);
  return google.sheets({ version: "v4", auth });
}

/**
 * Returns an authenticated Google Drive service instance.
 */
export function getDriveService(accessToken: string): drive_v3.Drive {
  const auth = createOAuth2Client(accessToken);
  return google.drive({ version: "v3", auth });
}
