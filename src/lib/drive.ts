import { getDriveService } from "@/lib/google-auth";
import { DriveFile } from "@/types";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search Google Drive for a folder containing the client's name,
 * then list all files inside that folder.
 * Folder naming convention: "CLIENT NAME, PRESCRIPTION DATE, COMPANY"
 */
export async function getClientFiles(
  accessToken: string,
  clientName: string
): Promise<DriveFile[]> {
  try {
    const drive = getDriveService(accessToken);

    // Step 1: Find folders whose name contains the client's name
    const folderQuery = `name contains '${escapeDriveQuery(clientName)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

    const folderResponse = await drive.files.list({
      q: folderQuery,
      fields: "files(id, name)",
      pageSize: 10,
      orderBy: "modifiedTime desc",
    });

    const folders = folderResponse.data.files;
    if (!folders || folders.length === 0) {
      return [];
    }

    // Step 2: List all files inside the found folders
    const allFiles: DriveFile[] = [];

    for (const folder of folders) {
      if (!folder.id) continue;

      try {
        const filesQuery = `'${folder.id}' in parents and trashed = false`;

        const filesResponse = await drive.files.list({
          q: filesQuery,
          fields:
            "files(id, name, mimeType, modifiedTime, webViewLink, size, iconLink)",
          pageSize: 100,
          orderBy: "modifiedTime desc",
        });

        const files = filesResponse.data.files;
        if (files && files.length > 0) {
          for (const file of files) {
            allFiles.push({
              id: file.id ?? "",
              name: file.name ?? "",
              mimeType: file.mimeType ?? "",
              modifiedTime: file.modifiedTime ?? "",
              webViewLink: file.webViewLink ?? "",
              size: file.size ?? "0",
              iconLink: file.iconLink ?? undefined,
            });
          }
        }
      } catch (err) {
        console.error(`Error listing files in folder ${folder.name}:`, err);
        // Continue with other folders
      }
    }

    // Sort by modifiedTime descending
    allFiles.sort(
      (a, b) =>
        new Date(b.modifiedTime).getTime() -
        new Date(a.modifiedTime).getTime()
    );

    return allFiles;
  } catch (error) {
    console.error("Error fetching client files from Drive:", error);
    throw new Error("Failed to fetch files from Google Drive");
  }
}

/**
 * Generate a web view / download link for a specific file.
 */
export async function getFileDownloadLink(
  accessToken: string,
  fileId: string
): Promise<{ webViewLink: string; webContentLink?: string }> {
  try {
    const drive = getDriveService(accessToken);

    const response = await drive.files.get({
      fileId,
      fields: "webViewLink, webContentLink",
    });

    return {
      webViewLink: response.data.webViewLink ?? "",
      webContentLink: response.data.webContentLink ?? undefined,
    };
  } catch (error) {
    console.error("Error generating file link:", error);
    throw new Error("Failed to generate file download link");
  }
}

/**
 * Find the first Google Drive folder that matches the client name.
 * Returns the folder ID or null if not found.
 */
export async function findClientFolderId(
  accessToken: string,
  clientName: string
): Promise<string | null> {
  try {
    const drive = getDriveService(accessToken);
    const folderQuery = `name contains '${escapeDriveQuery(clientName)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const response = await drive.files.list({
      q: folderQuery,
      fields: 'files(id, name)',
      pageSize: 5,
      orderBy: 'modifiedTime desc',
    });
    const folders = response.data.files;
    if (!folders || folders.length === 0) return null;
    return folders[0].id || null;
  } catch (error) {
    console.error('Error finding client folder:', error);
    return null;
  }
}

/**
 * Upload a file to a specific Google Drive folder.
 * Uses multipart upload via the googleapis library.
 */
export async function uploadFileToDrive(
  accessToken: string,
  folderId: string,
  fileName: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<DriveFile> {
  try {
    const drive = getDriveService(accessToken);
    const { Readable } = await import('stream');
    const stream = new Readable();
    stream.push(fileBuffer);
    stream.push(null);

    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType,
        body: stream,
      },
      fields: 'id, name, mimeType, modifiedTime, webViewLink, size, iconLink',
    });

    const file = response.data;
    return {
      id: file.id ?? '',
      name: file.name ?? '',
      mimeType: file.mimeType ?? '',
      modifiedTime: file.modifiedTime ?? '',
      webViewLink: file.webViewLink ?? '',
      size: file.size ?? '0',
      iconLink: file.iconLink ?? undefined,
    };
  } catch (error) {
    console.error('Error uploading file to Drive:', error);
    throw new Error('Failed to upload file to Google Drive');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Escape single quotes in a Drive API query string to prevent injection.
 */
function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
