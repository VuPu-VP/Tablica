/** Zdalny magazyn plików – w aplikacji Google Drive, w testach zwykła mapa w pamięci. */
export interface RemoteFile {
  id: string;
  name: string;
  /** Rośnie przy każdej zmianie pliku – po tym poznajemy, że ktoś (inne urządzenie) go zmienił. */
  version: string;
}

export interface RemoteStore {
  list(): Promise<RemoteFile[]>;
  readText(id: string): Promise<string>;
  readBlob(id: string): Promise<Blob>;
  create(name: string, data: Blob): Promise<RemoteFile>;
  update(id: string, name: string, data: Blob): Promise<RemoteFile>;
}

/** Magazyn w pamięci (testy). */
export class MemoryStore implements RemoteStore {
  files = new Map<string, { name: string; data: Blob; version: number }>();
  private n = 0;
  async list() {
    return [...this.files].map(([id, f]) => ({ id, name: f.name, version: String(f.version) }));
  }
  async readText(id: string) { return this.files.get(id)!.data.text(); }
  async readBlob(id: string) { return this.files.get(id)!.data; }
  async create(name: string, data: Blob) {
    const id = 'f' + ++this.n;
    this.files.set(id, { name, data, version: 1 });
    return { id, name, version: '1' };
  }
  async update(id: string, name: string, data: Blob) {
    const f = this.files.get(id)!;
    f.data = data;
    f.version++;
    return { id, name, version: String(f.version) };
  }
}
