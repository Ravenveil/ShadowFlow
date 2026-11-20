/**
 * 外观：三套风格 + 界面密度 + 动效。
 *
 * 风格与动效是纯客户端偏好（ThemeProvider / UiPrefs），不进 AppSettings；
 * 所以这个分区拿的是两个 context，而不是 onPatch。
 */
import { SETTINGS_COPY } from '../../content/settings';
import { THEME_META, THEME_ORDER } from '../../content/theme';
import { useTheme } from '../../theme/ThemeProvider';
import { useUiPrefs, type Density } from '../../ui/prefs';
import { Group, Row, Seg, Switch, Tick } from '../primitives';
import { ThemePreview } from '../ThemePreview';

const C = SETTINGS_COPY.appearance;

export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const { density, setDensity, motion, setMotion } = useUiPrefs();

  return (
    <div className="st-stack">
      <Group title={C.themeTitle}>
        <div className="theme-grid">
          {THEME_ORDER.map((t) => (
            <button
              key={t}
              type="button"
              className="theme-card"
              data-active={theme === t ? 'true' : undefined}
              onClick={() => setTheme(t)}
            >
              <ThemePreview t={t} />
              <span className="theme-card-body">
                <span className="theme-card-name">
                  {THEME_META[t].label}
                  {theme === t ? <Tick /> : null}
                </span>
                <span className="theme-card-blurb">{THEME_META[t].blurb}</span>
              </span>
            </button>
          ))}
        </div>
      </Group>

      <Group title={C.densityTitle}>
        <Row label={C.densityTitle} note={C.densityNote}>
          <Seg<Density>
            label={C.densityTitle}
            value={density}
            options={C.densityOptions}
            onChange={setDensity}
          />
        </Row>
        <Row label={C.motionLabel} note={C.motionNote}>
          <Switch label={C.motionLabel} on={motion} onChange={setMotion} />
        </Row>
      </Group>
    </div>
  );
}
