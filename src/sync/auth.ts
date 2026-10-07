// Logowanie do Google (OAuth 2.0, tylko uprawnienie drive.file = pliki utworzone przez Tablicę).
// Bez własnego serwera dostajemy „token dostępu” ważny ok. 1 h. Po wygaśnięciu jedno kliknięcie
// odnawia go (okienko Google samo się zamyka, jeśli już raz wyraziłeś zgodę).
//
// Na komputerze: okienko (popup) z biblioteki Google Identity Services.
// Na iPhonie w aplikacji z ekranu głównego popupy działają źle, więc używamy przekierowania.

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const TOKEN_KEY = 'tablica.gtoken';
const CLIENT_KEY = 'tablica.googleClientId';
const CONNECTED_KEY = 'tablica.gconnected';
const STATE_KEY = 'tablica.gstate';

const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* brak dostępu */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* brak dostępu */ } },
};

/**
 * Adres powrotu po logowaniu Google – zawsze główny adres aplikacji (np. https://vupu-vp.github.io/Tablica/),
 * niezależnie od tego, czy w pasku jest /index.html albo inna wielkość liter. Musi być identyczny
 * z wpisem w Google Cloud → Authorized redirect URIs.
 */
export const redirectUri = () => new URL(import.meta.env.BASE_URL, location.origin).href;

export const getClientId = (): string => ls.get(CLIENT_KEY) || (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || '';
export const setClientId = (id: string) => (id ? ls.set(CLIENT_KEY, id.trim()) : ls.del(CLIENT_KEY));
export const isConnected = () => ls.get(CONNECTED_KEY) === '1';

export function getToken(): string | null {
  try {
    const t = JSON.parse(ls.get(TOKEN_KEY) ?? 'null') as { token: string; exp: number } | null;
    return t && t.exp - 60_000 > Date.now() ? t.token : null;
  } catch {
    return null;
  }
}

function saveToken(token: string, expiresInSec: number) {
  ls.set(TOKEN_KEY, JSON.stringify({ token, exp: Date.now() + expiresInSec * 1000 }));
  ls.set(CONNECTED_KEY, '1');
}

export const clearToken = () => ls.del(TOKEN_KEY);

const isIosStandalone = () => (navigator as Navigator & { standalone?: boolean }).standalone === true;

// ---------- Google Identity Services (popup) ----------
interface TokenResponse { access_token: string; expires_in: number; error?: string; error_description?: string }
interface GoogleOAuth {
  accounts: { oauth2: { initTokenClient(cfg: {
    client_id: string; scope: string; prompt?: string;
    callback: (r: TokenResponse) => void; error_callback?: (e: { type: string; message?: string }) => void;
  }): { requestAccessToken(): void } } };
}

let gisLoading: Promise<void> | null = null;
function loadGis(): Promise<void> {
  gisLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gisLoading = null; reject(new Error('Nie udało się załadować logowania Google (brak internetu?)')); };
    document.head.appendChild(s);
  });
  return gisLoading;
}

/** Logowanie / odnowienie tokenu. Musi być wywołane po kliknięciu (przeglądarka blokuje popupy bez gestu). */
export async function connect(): Promise<void> {
  const clientId = getClientId();
  if (!clientId) throw new Error('Najpierw wpisz Client ID w ustawieniach');
  if (isIosStandalone()) return redirectToGoogle(clientId);
  await loadGis();
  const google = (window as unknown as { google: GoogleOAuth }).google;
  await new Promise<void>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      prompt: isConnected() ? '' : 'consent',
      callback: (r) => {
        if (r.error) reject(new Error(r.error_description || r.error));
        else { saveToken(r.access_token, r.expires_in); resolve(); }
      },
      error_callback: (e) => reject(new Error(e.type === 'popup_closed' ? 'Zamknięto okno logowania' : e.message || e.type)),
    });
    client.requestAccessToken();
  });
}

// ---------- przekierowanie (iPhone) ----------
function redirectToGoogle(clientId: string): Promise<void> {
  const state = crypto.randomUUID();
  ls.set(STATE_KEY, state);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPE,
    include_granted_scopes: 'true',
    state,
  });
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  return new Promise(() => { /* strona zaraz przejdzie do Google */ });
}

/** Po powrocie z Google token jest w adresie (#access_token=…) – zapisujemy go i czyścimy adres. */
export function handleRedirectResult(): string | null {
  if (!location.hash.includes('access_token=') && !location.hash.includes('error=')) return null;
  const p = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname + location.search);
  if (p.get('state') !== ls.get(STATE_KEY)) return 'Nieprawidłowa odpowiedź logowania (state)';
  ls.del(STATE_KEY);
  if (p.get('error')) return 'Logowanie Google: ' + p.get('error');
  saveToken(p.get('access_token')!, Number(p.get('expires_in') ?? 3600));
  return null;
}

export async function disconnect() {
  const t = getToken();
  clearToken();
  ls.del(CONNECTED_KEY);
  if (t) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t)}`, { method: 'POST' }).catch(() => undefined);
}
