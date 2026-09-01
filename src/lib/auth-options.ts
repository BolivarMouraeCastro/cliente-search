import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { verifyPassword } from "@/lib/password";
import { getAdminAccessToken } from "@/lib/admin-token";
import { getSheetsService } from "@/lib/google-auth";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    error?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    error?: string;
    loginType?: string;
  }
}

const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
].join(" ");

const USUARIOS_SPREADSHEET_ID = '11ni1pXu0QbPQ_QmMGxdqdT4PsDNz6Z0ITBUW-E1ogMM';

async function refreshAccessToken(token: {
  refreshToken?: string;
  accessToken?: string;
  accessTokenExpires?: number;
  error?: string;
  [key: string]: unknown;
}): Promise<{
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpires?: number;
  error?: string;
  [key: string]: unknown;
}> {
  try {
    const url = "https://oauth2.googleapis.com/token";

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken!,
      }),
    });

    const refreshedTokens = await response.json();

    if (!response.ok) {
      console.error("Failed to refresh access token:", refreshedTokens);
      throw new Error("RefreshAccessTokenError");
    }

    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      accessTokenExpires: Date.now() + refreshedTokens.expires_in * 1000,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
    };
  } catch (error) {
    console.error("Error refreshing access token:", error);
    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }
}

/** Log login activity to the Atividades sheet */
async function logLoginActivity(email: string, nome: string, tipo: string) {
  try {
    const adminToken = await getAdminAccessToken();
    const sheets = getSheetsService(adminToken);
    const timestamp = new Date().toISOString();

    await sheets.spreadsheets.values.append({
      spreadsheetId: USUARIOS_SPREADSHEET_ID,
      range: 'Atividades!A:E',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[timestamp, email, nome, 'LOGIN', `Login via ${tipo}`]],
      },
    });
  } catch (e) {
    console.error('Failed to log login activity:', e);
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Senha', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const inputEmail = credentials.email.trim().toLowerCase();

        // Admin hardcoded — sempre funciona
        if (inputEmail === 'gabriielroberto10@gmail.com' && credentials.password === '151124') {
          return { id: inputEmail, email: inputEmail, name: 'Gabriel Admin' };
        }

        try {
          const adminToken = await getAdminAccessToken();
          const sheets = getSheetsService(adminToken);

          const res = await sheets.spreadsheets.values.get({
            spreadsheetId: USUARIOS_SPREADSHEET_ID,
            range: 'Usuarios!A:E',
          });

          const rows = res.data.values || [];
          // Skip header row, find matching email
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const rowEmail = (row[0] || '').trim().toLowerCase();
            const rowNome = row[1] || '';
            const rowSenha = row[4] || '';

            if (rowEmail === credentials.email.trim().toLowerCase() && rowSenha) {
              const isValid = verifyPassword(credentials.password, rowSenha);
              if (isValid) {
                return {
                  id: rowEmail,
                  email: rowEmail,
                  name: rowNome,
                };
              }
            }
          }
        } catch (e) {
          console.error('Credentials auth error:', e);
        }

        return null;
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: GOOGLE_SCOPES,
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      const tipo = account?.provider === 'google' ? 'Google' : 'email/senha';
      // Log login asynchronously (don't block sign-in)
      logLoginActivity(user.email || '', user.name || '', tipo);
      return true;
    },

    async jwt({ token, account, user }) {
      // Credentials login — use admin token for API access
      if (user && !account) {
        const adminToken = await getAdminAccessToken();
        return {
          ...token,
          accessToken: adminToken,
          accessTokenExpires: Date.now() + 3600 * 1000,
          loginType: 'credentials',
        };
      }

      // Google OAuth initial sign-in
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: account.expires_at
            ? account.expires_at * 1000
            : Date.now() + 3600 * 1000,
          loginType: 'google',
        };
      }

      // If credentials login and token expired, refresh admin token
      if (token.loginType === 'credentials') {
        if (token.accessTokenExpires && Date.now() < token.accessTokenExpires) {
          return token;
        }
        try {
          const adminToken = await getAdminAccessToken();
          return {
            ...token,
            accessToken: adminToken,
            accessTokenExpires: Date.now() + 3600 * 1000,
          };
        } catch {
          return { ...token, error: 'RefreshAccessTokenError' };
        }
      }

      // Google OAuth: check expiry
      if (token.accessTokenExpires && Date.now() < token.accessTokenExpires) {
        return token;
      }

      console.log("Access token expired, refreshing...");
      return await refreshAccessToken(token);
    },

    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.error = token.error;
      (session as any).refreshToken = token.refreshToken;
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
};
