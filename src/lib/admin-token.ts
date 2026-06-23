import { google } from "googleapis";

/**
 * Gets an admin access token using the stored refresh token.
 * This allows collaborators to access Drive/Sheets/Gmail
 * using the admin's permissions.
 */
export async function getAdminAccessToken(): Promise<string> {
  const refreshToken = process.env.ADMIN_REFRESH_TOKEN;
  
  if (!refreshToken) {
    throw new Error("ADMIN_REFRESH_TOKEN não configurado nas variáveis de ambiente");
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });

  const { credentials } = await oauth2Client.refreshAccessToken();
  
  if (!credentials.access_token) {
    throw new Error("Falha ao obter token de acesso do admin");
  }

  return credentials.access_token;
}

/**
 * Gets the best access token available:
 * - If the user IS the admin, use their session token (fresher)
 * - If the user is a collaborator, use the admin's stored token
 */
export async function getEffectiveAccessToken(
  sessionEmail: string | null | undefined,
  sessionAccessToken: string | null | undefined
): Promise<string> {
  const adminEmail = 'advogadosbmc@gmail.com';
  
  // If the user is the admin and has a valid token, use it directly
  if (sessionEmail?.toLowerCase().trim() === adminEmail && sessionAccessToken) {
    return sessionAccessToken;
  }

  // For collaborators (or if admin token is missing), use the admin refresh token
  return await getAdminAccessToken();
}
