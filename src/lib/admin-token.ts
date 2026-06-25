import getConfig from 'next/config';

function getRuntimeEnv(key: string): string | undefined {
  // Try process.env first (works in most cases)
  if (process.env[key]) return process.env[key];
  
  // Fallback: try Next.js serverRuntimeConfig
  try {
    const { serverRuntimeConfig } = getConfig() || {};
    if (serverRuntimeConfig?.[key]) return serverRuntimeConfig[key];
  } catch {
    // getConfig might not be available in all contexts
  }
  
  return undefined;
}

/**
 * Gets an admin access token using the stored refresh token.
 */
export async function getAdminAccessToken(): Promise<string> {
  const refreshToken = getRuntimeEnv('ADMIN_REFRESH_TOKEN');
  
  if (!refreshToken) {
    throw new Error("ADMIN_REFRESH_TOKEN não configurado nas variáveis de ambiente");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    console.error("Failed to refresh admin token:", data);
    throw new Error("Falha ao obter token de acesso do admin");
  }

  return data.access_token;
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

  // For collaborators, use the admin refresh token
  try {
    return await getAdminAccessToken();
  } catch (error) {
    // Fallback: if admin token fails and user has their own token, use it
    if (sessionAccessToken) return sessionAccessToken;
    throw error;
  }
}

/**
 * Gets an access token for the perícia Gmail account (periciajjs@gmail.com).
 */
export async function getPericiaAccessToken(): Promise<string> {
  const refreshToken = getRuntimeEnv('PERICIA_REFRESH_TOKEN');
  
  if (!refreshToken) {
    throw new Error("PERICIA_REFRESH_TOKEN não configurado");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    console.error("Failed to refresh pericia token:", data);
    throw new Error("Falha ao obter token da conta de perícia");
  }

  return data.access_token;
}
