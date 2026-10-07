// Wspólny stan gestów dotykowych między kontenerem edytora a stronami.
// Kontener (Editor) śledzi wszystkie palce w fazie „capture”; jeśli pojawi się drugi palec,
// przerywa ewentualną kreskę rysowaną palcem i przechodzi w przewijanie/zoom.
export const touchState = {
  count: 0,
  /** Ustawiane przez stronę, gdy palec zaczyna rysować; Editor wywołuje to przy drugim palcu. */
  cancelInk: null as null | (() => void),
};
