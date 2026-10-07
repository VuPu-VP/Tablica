import type { TablicaDB } from '../db/db';
import type { RemoteFile, RemoteStore } from './store';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export class AuthError extends Error {}

/**
 * Google Drive przez REST API v3. Wszystkie pliki leżą w jednym folderze „Tablica”
 * oznaczonym appProperties (dzięki temu znajdziemy go z każdego urządzenia).
 */
export class DriveStore implements RemoteStore {
  private folderId: string | null = null;

  constructor(private token: () => string | null, private db: TablicaDB) {}

  private async req(url: string, init: RequestInit = {}): Promise<Response> {
    const t = this.token();
    if (!t) throw new AuthError('Brak zalogowania do Google');
    const res = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${t}` } });
    if (res.status === 401) throw new AuthError('Sesja Google wygasła');
    if (!res.ok) throw new Error(`Google Drive ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res;
  }

  private async folder(): Promise<string> {
    if (this.folderId) return this.folderId;
    const cached = (await this.db.meta.get('sync.folderId'))?.value as string | undefined;
    const q = `mimeType='${FOLDER_MIME}' and trashed=false and appProperties has { key='tablica' and value='root' }`;
    const found = await (await this.req(`${API}/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`)).json();
    let id: string | undefined = found.files?.find((f: { id: string }) => f.id === cached)?.id ?? found.files?.[0]?.id;
    if (!id) {
      const res = await this.req(`${API}/files?fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Tablica', mimeType: FOLDER_MIME, appProperties: { tablica: 'root' } }),
      });
      id = (await res.json()).id as string;
    }
    await this.db.meta.put({ key: 'sync.folderId', value: id });
    this.folderId = id;
    return id;
  }

  async list(): Promise<RemoteFile[]> {
    const folder = await this.folder();
    const out: RemoteFile[] = [];
    let pageToken = '';
    do {
      const q = encodeURIComponent(`'${folder}' in parents and trashed=false`);
      const res = await (await this.req(`${API}/files?q=${q}&fields=nextPageToken,files(id,name,version)&pageSize=1000&spaces=drive${pageToken ? `&pageToken=${pageToken}` : ''}`)).json();
      out.push(...res.files);
      pageToken = res.nextPageToken ?? '';
    } while (pageToken);
    return out;
  }

  async readText(id: string) { return (await this.req(`${API}/files/${id}?alt=media`)).text(); }
  async readBlob(id: string) { return (await this.req(`${API}/files/${id}?alt=media`)).blob(); }

  async create(name: string, data: Blob): Promise<RemoteFile> {
    const folder = await this.folder();
    const boundary = 'tablica' + Math.random().toString(36).slice(2);
    const meta = { name, parents: [folder], appProperties: { tablica: 'file' } };
    // „multipart/related”: metadane (JSON) i treść pliku w jednym zapytaniu
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${boundary}\r\nContent-Type: ${data.type || 'application/octet-stream'}\r\n\r\n`,
      data,
      `\r\n--${boundary}--`,
    ]);
    const res = await this.req(`${UPLOAD}/files?uploadType=multipart&fields=id,name,version`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    return res.json();
  }

  async update(id: string, _name: string, data: Blob): Promise<RemoteFile> {
    const res = await this.req(`${UPLOAD}/files/${id}?uploadType=media&fields=id,name,version`, {
      method: 'PATCH',
      headers: { 'Content-Type': data.type || 'application/octet-stream' },
      body: data,
    });
    return res.json();
  }
}
