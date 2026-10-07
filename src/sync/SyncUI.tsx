import { useEffect, useState, useSyncExternalStore } from 'react';
import { Dialog } from '../ui/Dialog';
import { Icon } from '../ui/Icon';
import { toast } from '../ui/toast';
import { connect, disconnect, getClientId, isConnected, setClientId } from './auth';
import { syncNow, syncStatus, type SyncStatus } from './runner';

const time = (t?: number) => (t ? new Date(t).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : '—');

function label(s: SyncStatus): { icon: 'synced' | 'offline'; text: string; tone?: 'ok' | 'warn' } {
  switch (s.state) {
    case 'off': return { icon: 'offline', text: 'Tylko na tym urządzeniu' };
    case 'login': return { icon: 'offline', text: 'Kliknij, aby zalogować do Drive', tone: 'warn' };
    case 'syncing': return { icon: 'synced', text: 'Synchronizuję…' };
    case 'offline': return { icon: 'offline', text: s.pending ? `Offline – ${s.pending} zmian czeka` : 'Offline – zapisano lokalnie' };
    case 'error': return { icon: 'offline', text: 'Błąd synchronizacji', tone: 'warn' };
    case 'ok': return { icon: 'synced', text: s.pending ? `${s.pending} zmian czeka…` : `Zsynchronizowano ${time(s.lastSync)}`, tone: 'ok' };
  }
}

export const useSyncStatus = () => useSyncExternalStore(syncStatus.subscribe, syncStatus.get);

/** Wskaźnik w górnym pasku. Kliknięcie: logowanie (gdy token wygasł) albo ustawienia. */
export function SyncPill({ onOpenSettings }: { onOpenSettings: () => void }) {
  const s = useSyncStatus();
  const l = label(s);
  const onClick = async () => {
    if (s.state === 'login') {
      try { await connect(); await syncNow(); } catch (e) { toast((e as Error).message, 'error'); }
    } else onOpenSettings();
  };
  return (
    <button className={`pill ${l.tone ?? ''} ${s.state === 'syncing' ? 'spinning' : ''}`} title={s.error ?? l.text} onClick={onClick}>
      <Icon name={l.icon} size={16} />
      <span className="hide-mobile">{l.text}</span>
    </button>
  );
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const s = useSyncStatus();
  const [clientId, setId] = useState(getClientId());
  const [saved, setSaved] = useState(!!getClientId());
  const [storage, setStorage] = useState<{ persisted: boolean; usage: number; quota: number } | null>(null);

  useEffect(() => {
    (async () => {
      const est = await navigator.storage?.estimate?.();
      setStorage({ persisted: (await navigator.storage?.persisted?.()) ?? false, usage: est?.usage ?? 0, quota: est?.quota ?? 0 });
    })();
  }, []);

  const doConnect = async () => {
    try {
      await connect();
      toast('Połączono z Google Drive – trwa pierwsza synchronizacja');
      await syncNow();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

  return (
    <Dialog title="Ustawienia" onClose={onClose} wide>
      <div className="form">
        <fieldset>
          <legend>Synchronizacja z Google Drive</legend>
          {!saved ? (
            <>
              <p className="muted small" style={{ margin: 0 }}>
                Tablica zapisuje notatki w Twoim Google Drive (folder „Tablica”). Widzi wyłącznie pliki, które sama utworzyła.
                Najpierw potrzebny jest jednorazowo <b>Client ID</b> z Google Cloud – instrukcja poniżej.
              </p>
              <label>
                Client ID:
                <input className="text-input" value={clientId} onChange={(e) => setId(e.target.value)} placeholder="1234…-abc.apps.googleusercontent.com" />
              </label>
              <button className="btn" disabled={!/\.apps\.googleusercontent\.com$/.test(clientId.trim())} onClick={() => { setClientId(clientId); setSaved(true); }}>
                Zapisz Client ID
              </button>
            </>
          ) : !isConnected() ? (
            <>
              <p className="muted small" style={{ margin: 0 }}>Client ID zapisany. Teraz połącz konto Google (studenckie albo prywatne).</p>
              <div className="row">
                <button className="btn" onClick={doConnect}><Icon name="synced" size={18} /> Połącz z Google Drive</button>
                <button className="btn ghost" onClick={() => { setClientId(''); setId(''); setSaved(false); }}>Zmień Client ID</button>
              </div>
            </>
          ) : (
            <>
              <p style={{ margin: 0 }}>
                Stan: <b>{label(s).text}</b><br />
                <span className="muted small">Ostatnia synchronizacja: {time(s.lastSync)} · oczekujące zmiany: {s.pending}</span>
                {s.error && <><br /><span className="small" style={{ color: 'var(--danger)' }}>{s.error}</span></>}
              </p>
              <div className="row">
                <button className="btn" onClick={() => (s.state === 'login' ? doConnect() : syncNow())}>
                  <Icon name="synced" size={18} /> {s.state === 'login' ? 'Zaloguj ponownie' : 'Synchronizuj teraz'}
                </button>
                <button className="btn ghost" onClick={async () => { await disconnect(); await syncNow(); toast('Odłączono Google Drive (notatki zostają na urządzeniu)'); }}>
                  Odłącz
                </button>
              </div>
            </>
          )}
          <details>
            <summary>Jak uzyskać Client ID (jednorazowo, ok. 5 minut)</summary>
            <ol className="steps">
              <li>Wejdź na <b>console.cloud.google.com</b> i utwórz projekt, np. „Tablica”.</li>
              <li><b>APIs &amp; Services → Library</b>: wyszukaj „Google Drive API” i kliknij <b>Enable</b>.</li>
              <li><b>OAuth consent screen</b>: typ <b>External</b>, nazwa „Tablica”, Twój e-mail. W „Test users” dodaj swoje konto Google.</li>
              <li><b>Credentials → Create credentials → OAuth client ID</b>, typ <b>Web application</b>.</li>
              <li>W „Authorized JavaScript origins” dodaj: <code>{location.origin}</code>
                {location.hostname === 'localhost' ? ' (i później adres z GitHub Pages)' : ''}.
                W „Authorized redirect URIs” dodaj: <code>{location.origin + location.pathname}</code> (logowanie na iPhonie).</li>
              <li>Skopiuj <b>Client ID</b> (kończy się na <code>.apps.googleusercontent.com</code>) i wklej powyżej.</li>
            </ol>
            <p className="muted small">Konta uczelniane bywają zablokowane dla „niezweryfikowanych aplikacji” przez administratora – wtedy użyj prywatnego konta Gmail.</p>
          </details>
        </fieldset>

        <fieldset>
          <legend>Pamięć urządzenia</legend>
          {storage ? (
            <p style={{ margin: 0 }}>
              Zajęte: <b>{mb(storage.usage)}</b> z dostępnych {mb(storage.quota)}.<br />
              <span className="muted small">
                {storage.persisted
                  ? 'Trwałe przechowywanie włączone – przeglądarka nie usunie notatek przy braku miejsca.'
                  : 'Przeglądarka może usunąć dane przy braku miejsca. Zainstaluj aplikację (Dodaj do ekranu głównego / Zainstaluj) i włącz synchronizację.'}
              </span>
            </p>
          ) : <p className="muted">…</p>}
        </fieldset>

        <fieldset>
          <legend>Skróty klawiszowe</legend>
          <p className="muted small" style={{ margin: 0, lineHeight: 1.8 }}>
            <b>P</b> pióro · <b>H</b> zakreślacz · <b>E</b> gumka · <b>L</b> lasso · <b>T</b> tekst ·
            <b> Ctrl+Z / Ctrl+Y</b> cofnij/ponów · <b>Ctrl+C / X / V / D</b> kopiuj/wytnij/wklej/duplikuj zaznaczenie ·
            <b> Delete</b> usuń zaznaczenie · <b>Ctrl+F</b> szukaj · <b>Ctrl+kółko</b> zoom ·
            <b> $wzór$</b> wzór w tekście · <b>$$wzór$$</b> wzór w osobnej linii ·
            przytrzymaj rysik na końcu kreski → prosty kształt · boczny przycisk rysika → lasso · gumka rysika → gumka
          </p>
        </fieldset>
      </div>
    </Dialog>
  );
}
