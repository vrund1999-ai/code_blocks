import { STYLE_FIELDS, type PropField } from '../model/elements';
import { useProjectStore } from '../model/projectStore';
import { CORNER_OPTIONS, fullTheme, readable, THEME_PRESETS, type Theme } from '../model/theme';

const FONT_OPTIONS = STYLE_FIELDS.find((f) => f.key === 'font')!.options!.filter((o) => o.value !== '');

const same = (a: Required<Theme>, b: Required<Theme>) => (Object.keys(a) as (keyof Theme)[]).every((k) => a[k] === b[k]);

/** The app's colours, font and corners, for every screen: shown while nothing is selected. */
export function ThemeSection() {
  const theme = useProjectStore((s) => s.project.theme);
  const setTheme = useProjectStore((s) => s.setTheme);
  const t = fullTheme(theme);
  const preset = THEME_PRESETS.find((p) => same(p.theme, t));

  const color = (key: 'accent' | 'background' | 'text', label: string, help?: string) => (
    <div className="prop-row">
      <div className="prop-label">
        <span>{label}</span>
      </div>
      <input type="color" className="color-input" aria-label={label} value={t[key]} onChange={(e) => setTheme({ [key]: e.target.value })} />
      {help && <div className="hint">{help}</div>}
    </div>
  );

  return (
    <section className="style-section theme-section" aria-label="App theme">
      <h3>App theme</h3>
      <div className="hint">The colours and font of every screen.</div>
      <div className="theme-presets" role="group" aria-label="Ready-made themes">
        {THEME_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`theme-preset ${preset?.id === p.id ? 'active' : ''}`}
            aria-pressed={preset?.id === p.id}
            // Classic is the usual look, so it takes the theme out of the project.
            onClick={() => setTheme(p.id === 'classic' ? null : { ...p.theme })}
          >
            <span className="theme-swatch" style={{ background: p.theme.background, color: p.theme.text, borderColor: p.theme.accent }}>
              <span style={{ background: p.theme.accent }} />
              Aa
            </span>
            {p.name}
          </button>
        ))}
      </div>
      {color('accent', 'Main colour', 'Buttons, links and sliders.')}
      {color('background', 'Background')}
      {color('text', 'Text colour')}
      {!readable(theme) && (
        <div className="hint warn" role="status">
          ⚠ The text is hard to read on this background. Try a darker text colour, or a lighter background (or the other way round).
        </div>
      )}
      <div className="prop-row">
        <div className="prop-label">
          <span>Font</span>
        </div>
        <select className="field-input" aria-label="Font" value={t.font} onChange={(e) => setTheme({ font: e.target.value })}>
          {FONT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="prop-row">
        <div className="prop-label">
          <span>Corners</span>
        </div>
        <select className="field-input" aria-label="Corners" value={t.corners} onChange={(e) => setTheme({ corners: e.target.value as Theme['corners'] })}>
          {CORNER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}

/**
 * A colour setting. One that can be left empty shows what empty means (the
 * theme's text colour, or no colour) and has a button to go back to it.
 */
export function ColorField({ field, value, onChange }: { field: PropField; value: string; onChange(v: string): void }) {
  const themeText = useProjectStore((s) => fullTheme(s.project.theme).text);
  const empty = value === '';
  if (!field.emptyColor) {
    return <input type="color" className="color-input" aria-label={field.label} value={value || '#ffffff'} onChange={(e) => onChange(e.target.value)} />;
  }
  const fallback = field.emptyColor === 'theme-text' ? themeText : '#ffffff';
  const emptyLabel = field.emptyColor === 'theme-text' ? 'Theme colour' : 'No colour';
  return (
    <div className="color-field">
      <input type="color" className="color-input" aria-label={field.label} value={empty ? fallback : value} onChange={(e) => onChange(e.target.value)} />
      {empty ? (
        <span className="hint">{emptyLabel}</span>
      ) : (
        <button type="button" className="chip" onClick={() => onChange('')}>
          {field.emptyColor === 'theme-text' ? '↺ Use theme colour' : '✕ No colour'}
        </button>
      )}
    </div>
  );
}
