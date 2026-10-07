import { useSyncExternalStore } from 'react';
import { clipboard } from '../ink/clipboard';
import { history } from '../ink/history';
import { activeEditor } from '../text/active';
import { convertInMathInput, convertToFraction } from '../text/fraction';
import { toast } from '../ui/toast';
import { Icon, type IconName } from '../ui/Icon';
import { ERASER_SIZES, HL_COLORS, HL_WIDTHS, PEN_COLORS, PEN_WIDTHS, type Tool, type ToolSettings } from './tools';

interface Props {
  settings: ToolSettings;
  update: (patch: Partial<ToolSettings>) => void;
  onPaste: () => void;
  onImage: (capture: boolean) => void;
  onPdf: () => void;
  onDiagram: (kind: 'plot' | 'circuit') => void;
}

const TOOLS: { tool: Tool; icon: IconName; label: string; key: string }[] = [
  { tool: 'pen', icon: 'pen', label: 'Pióro', key: 'P' },
  { tool: 'highlighter', icon: 'highlighter', label: 'Zakreślacz', key: 'H' },
  { tool: 'eraser', icon: 'eraser', label: 'Gumka', key: 'E' },
  { tool: 'lasso', icon: 'lasso', label: 'Lasso – zaznacz, przesuń, skaluj', key: 'L' },
  { tool: 'text', icon: 'text', label: 'Tekst', key: 'T' },
];

/** Przyciski formatowania – `onPointerDown` z preventDefault, żeby nie zabierać fokusu edytorowi. */
function TextControls() {
  useSyncExternalStore((f) => activeEditor.subscribe(f), () => activeEditor.version());
  const ed = activeEditor.get();
  const btn = (icon: IconName, title: string, isActive: boolean, run: () => void) => (
    <button
      key={title}
      className={`icon-btn ${isActive ? 'active' : ''}`}
      title={title}
      disabled={!ed}
      onPointerDown={(e) => { e.preventDefault(); if (ed) run(); }}
    >
      <Icon name={icon} />
    </button>
  );
  const headingLevel = ed ? ([1, 2, 3] as const).find((l) => ed.isActive('heading', { level: l })) : undefined;
  return (
    <>
      {btn('bold', 'Pogrubienie (Ctrl+B)', !!ed?.isActive('bold'), () => ed!.chain().focus().toggleBold().run())}
      {btn('italic', 'Kursywa (Ctrl+I)', !!ed?.isActive('italic'), () => ed!.chain().focus().toggleItalic().run())}
      {btn('heading', headingLevel ? `Nagłówek ${headingLevel}` : 'Nagłówek', !!headingLevel, () => {
        const next = headingLevel === 1 ? 2 : headingLevel === 2 ? null : 1;
        if (next) ed!.chain().focus().setHeading({ level: next }).run();
        else ed!.chain().focus().setParagraph().run();
      })}
      {btn('list', 'Lista', !!ed?.isActive('bulletList'), () => ed!.chain().focus().toggleBulletList().run())}
      {btn('math', 'Wzór w tekście ($…$)', false, () => ed!.chain().focus().insertContent({ type: 'mathInline', attrs: { latex: '' } }).run())}
      {btn('fraction', 'Ułamek z ukośnika: zaznacz np. (a+b)/2 albo kliknij za słowem 1/2 (Ctrl+/)', false, () => {
        // kursor w polu kodu wzoru (po kliknięciu wzoru) – zamieniamy tam
        const el = document.activeElement;
        if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.classList.contains('math-input')) {
          if (!convertInMathInput(el)) toast('W kodzie wzoru nie ma ukośnika do zamiany', 'error');
          return;
        }
        if (!convertToFraction(ed!)) toast('Zaznacz tekst z ukośnikiem, np. 1/2 albo (a+b)/(c-d)', 'error');
      })}
      {btn('mathBlock', 'Wzór w osobnej linii ($$…$$)', false, () => ed!.chain().focus().insertContent({ type: 'mathBlock', attrs: { latex: '' } }).run())}
      {!ed && <span className="hint">Kliknij na kartce, aby pisać</span>}
    </>
  );
}

export function Toolbar({ settings: s, update, onPaste, onImage, onPdf, onDiagram }: Props) {
  const clip = useSyncExternalStore((f) => clipboard.subscribe(f), () => clipboard.get());
  const canUndo = useSyncExternalStore((f) => history.subscribe(f), () => history.canUndo);
  const canRedo = useSyncExternalStore((f) => history.subscribe(f), () => history.canRedo);

  const colors = s.tool === 'highlighter' ? HL_COLORS : PEN_COLORS;
  const color = s.tool === 'highlighter' ? s.hlColor : s.penColor;
  const widths = s.tool === 'highlighter' ? HL_WIDTHS : s.tool === 'eraser' ? ERASER_SIZES : PEN_WIDTHS;
  const width = s.tool === 'highlighter' ? s.hlWidth : s.tool === 'eraser' ? s.eraserSize : s.penWidth;
  const setWidth = (w: number) =>
    update(s.tool === 'highlighter' ? { hlWidth: w } : s.tool === 'eraser' ? { eraserSize: w } : { penWidth: w });

  return (
    <div className="toolbar" role="toolbar" aria-label="Narzędzia">
      {TOOLS.map((t) => (
        <button
          key={t.tool}
          className={`icon-btn ${s.tool === t.tool ? 'active' : ''}`}
          title={`${t.label} (${t.key})`}
          aria-pressed={s.tool === t.tool}
          onClick={() => update({ tool: t.tool })}
        >
          <Icon name={t.icon} />
        </button>
      ))}
      <div className="divider" />
      {s.tool === 'lasso' ? (
        <span className="hint">Obrysuj pismo, aby je zaznaczyć · boczny przycisk rysika też działa jak lasso</span>
      ) : s.tool === 'text' ? (
        <TextControls />
      ) : (
        <>
          {s.tool === 'eraser' ? (
            <div className="seg" role="radiogroup" aria-label="Tryb gumki">
              <button className={s.eraserMode === 'partial' ? 'on' : ''} onClick={() => update({ eraserMode: 'partial' })}>Fragment</button>
              <button className={s.eraserMode === 'stroke' ? 'on' : ''} onClick={() => update({ eraserMode: 'stroke' })}>Całe kreski</button>
            </div>
          ) : (
            <div className="swatches" role="radiogroup" aria-label="Kolor">
              {colors.map((c) => (
                <button
                  key={c}
                  className={`swatch ${c === color ? 'selected' : ''}`}
                  style={{ background: c }}
                  aria-label={`Kolor ${c}`}
                  aria-checked={c === color}
                  role="radio"
                  onClick={() => update(s.tool === 'highlighter' ? { hlColor: c } : { penColor: c })}
                />
              ))}
            </div>
          )}
          {s.tool === 'pen' && (
            <button
              className={`toggle-chip ${s.pressure ? 'on' : ''}`}
              title={s.pressure ? 'Nacisk włączony: grubość zależy od docisku rysika. Kliknij, aby pisać stałą grubością' : 'Nacisk wyłączony: stała grubość linii. Kliknij, aby włączyć'}
              aria-pressed={s.pressure}
              onClick={() => update({ pressure: !s.pressure })}
            >
              <Icon name="pressure" size={18} />
              <span>Nacisk {s.pressure ? 'wł.' : 'wył.'}</span>
            </button>
          )}
          {s.tool !== 'eraser' && (
            <button
              className={`icon-btn ${s.ruler ? 'active' : ''}`}
              title={s.ruler ? 'Linijka włączona: proste linie' : 'Linijka (proste linie). Wskazówka: przytrzymaj rysik na końcu kreski, a kształt się wyprostuje'}
              aria-pressed={s.ruler}
              onClick={() => update({ ruler: !s.ruler })}
            >
              <Icon name="ruler" />
            </button>
          )}
          <div className="divider" />
          <div className="widths" role="radiogroup" aria-label="Grubość">
            {widths.map((w, i) => (
              <button key={w} className={`width-btn ${w === width ? 'selected' : ''}`} onClick={() => setWidth(w)} aria-label={`Grubość ${w} mm`} role="radio" aria-checked={w === width}>
                <i style={{ width: 4 + i * 4, height: 4 + i * 4 }} />
              </button>
            ))}
          </div>
        </>
      )}
      <div className="divider" />
      <button className="icon-btn" title="Wstaw zdjęcie (albo wklej Ctrl+V / przeciągnij plik)" onClick={() => onImage(false)}>
        <Icon name="image" />
      </button>
      <button className="icon-btn only-mobile" title="Zdjęcie tablicy aparatem" onClick={() => onImage(true)}>
        <Icon name="camera" />
      </button>
      <button className="icon-btn" title="Importuj PDF / slajdy (każda strona PDF = nowa kartka)" onClick={onPdf}>
        <Icon name="import" />
      </button>
      <button className="icon-btn" title="Układ współrzędnych / wykres z danych" onClick={() => onDiagram('plot')}>
        <Icon name="axes" />
      </button>
      <button className="icon-btn" title="Schemat: obwód RLC albo układ cyfrowy (bramki)" onClick={() => onDiagram('circuit')}>
        <Icon name="circuit" />
      </button>
      <div className="divider" />
      <button
        className={`icon-btn ${s.fingerDraw ? 'active' : ''}`}
        title={s.fingerDraw ? 'Palec rysuje (dwa palce przewijają)' : 'Palec przewija, rysuje tylko rysik'}
        aria-pressed={s.fingerDraw}
        onClick={() => update({ fingerDraw: !s.fingerDraw })}
      >
        <Icon name="hand" />
      </button>
      {clip.length > 0 && (
        <button className="icon-btn" title="Wklej (Ctrl+V)" onClick={onPaste}>
          <Icon name="copy" />
        </button>
      )}
      <button className="icon-btn" title="Cofnij (Ctrl+Z)" disabled={!canUndo} onClick={() => history.undo()}>
        <Icon name="undo" />
      </button>
      <button className="icon-btn" title="Ponów (Ctrl+Y)" disabled={!canRedo} onClick={() => history.redo()}>
        <Icon name="redo" />
      </button>
    </div>
  );
}
