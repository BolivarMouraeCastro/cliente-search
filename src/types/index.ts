export interface Client {
  id: string;
  entrada: string;
  nome: string;
  admissao: string;
  demissao: string;
  status: string;
  materia: string;
  origem: string;
  responsavel: string;
  empresa: string;
  funcao: string;
  numeroProcesso: string;
}

export interface Email {
  id: string;
  date: string;
  subject: string;
  snippet: string;
  body: string;
  from: string;
  processNumber?: string;
  phase?: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink: string;
  size: string;
  iconLink?: string;
}
