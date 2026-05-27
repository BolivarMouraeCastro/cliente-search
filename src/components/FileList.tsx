'use client';

import { DriveFile } from '@/types';

interface FileListProps {
  files: DriveFile[];
}

function getFileTypeInfo(mimeType: string, name: string): { label: string; className: string } {
  const mime = mimeType.toLowerCase();
  const ext = name.split('.').pop()?.toLowerCase() || '';

  if (mime.includes('pdf') || ext === 'pdf')
    return { label: 'PDF', className: 'pdf' };
  if (mime.includes('word') || mime.includes('document') || ext === 'doc' || ext === 'docx')
    return { label: 'DOC', className: 'doc' };
  if (mime.includes('sheet') || mime.includes('excel') || ext === 'xls' || ext === 'xlsx' || ext === 'csv')
    return { label: 'XLS', className: 'xls' };
  if (mime.includes('image') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext))
    return { label: 'IMG', className: 'img' };
  if (mime.includes('folder'))
    return { label: '📁', className: 'folder' };
  return { label: ext.toUpperCase().slice(0, 3) || 'ARQ', className: 'other' };
}

function formatFileSize(sizeStr: string): string {
  const bytes = parseInt(sizeStr, 10);
  if (isNaN(bytes) || bytes === 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let idx = 0;
  let size = bytes;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx++;
  }
  return `${size.toFixed(idx > 0 ? 1 : 0)} ${units[idx]}`;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default function FileList({ files }: FileListProps) {
  if (!files || files.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <div className="empty-state-title">Nenhum documento encontrado</div>
        <div className="empty-state-desc">
          Os documentos do Google Drive relacionados a este cliente aparecerão aqui.
        </div>
      </div>
    );
  }

  return (
    <div className="files-grid">
      {files.map((file) => {
        const typeInfo = getFileTypeInfo(file.mimeType, file.name);
        const formattedSize = formatFileSize(file.size);
        const formattedDate = formatDate(file.modifiedTime);

        return (
          <a
            key={file.id}
            href={file.webViewLink}
            target="_blank"
            rel="noopener noreferrer"
            className="file-card"
          >
            <div className={`file-icon ${typeInfo.className}`}>
              {typeInfo.label}
            </div>
            <div className="file-info">
              <div className="file-name" title={file.name}>
                {file.name}
              </div>
              <div className="file-meta">
                {formattedDate && <span>{formattedDate}</span>}
                {formattedSize && <span>• {formattedSize}</span>}
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}
