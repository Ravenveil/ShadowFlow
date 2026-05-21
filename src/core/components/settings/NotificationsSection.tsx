/**
 * NotificationsSection — Settings: Notification Preferences
 *
 * Manages sound and desktop notification preferences.
 * State is persisted to localStorage key `sf.notifications`.
 *
 * Desktop notifications use the browser Notification API:
 *   - Requests permission when the user enables desktop notifications
 *   - Fires a test notification on demand
 *
 * Sound notifications use the Web Audio API (oscillator synthesis).
 * Sound selections are persisted alongside the enabled flag.
 */
import React, { useState, useEffect } from 'react';
import { useI18n } from '../../../common/i18n';

// ---- Sound types & options --------------------------------------------------

type SuccessSoundId = 'ding' | 'chime' | 'two-tone-up' | 'pluck';
type FailureSoundId = 'buzz' | 'two-tone-down' | 'thud';

const SUCCESS_SOUNDS: Array<{ id: SuccessSoundId; label: string }> = [
  { id: 'ding',        label: '叮' },
  { id: 'chime',       label: '铃声' },
  { id: 'two-tone-up', label: '上升双音' },
  { id: 'pluck',       label: '拨弦' },
];

const FAILURE_SOUNDS: Array<{ id: FailureSoundId; label: string }> = [
  { id: 'buzz',          label: '嗡嗡' },
  { id: 'two-tone-down', label: '下降双音' },
  { id: 'thud',          label: '低鸣' },
];

// ---- Types & persistence helpers --------------------------------------------

interface NotificationsConfig {
  soundEnabled: boolean;
  desktopEnabled: boolean;
  successSoundId: SuccessSoundId;
  failureSoundId: FailureSoundId;
}

const DEFAULT_CONFIG: NotificationsConfig = {
  soundEnabled: false,
  desktopEnabled: false,
  successSoundId: 'ding',
  failureSoundId: 'buzz',
};

function loadConfig(): NotificationsConfig {
  try {
    const stored = localStorage.getItem('sf.notifications');
    if (!stored) return DEFAULT_CONFIG;
    const parsed = JSON.parse(stored);
    return {
      soundEnabled:    typeof parsed.soundEnabled    === 'boolean' ? parsed.soundEnabled    : false,
      desktopEnabled:  typeof parsed.desktopEnabled  === 'boolean' ? parsed.desktopEnabled  : false,
      successSoundId:  (SUCCESS_SOUNDS.some((s) => s.id === parsed.successSoundId)
                         ? parsed.successSoundId
                         : DEFAULT_CONFIG.successSoundId) as SuccessSoundId,
      failureSoundId:  (FAILURE_SOUNDS.some((s) => s.id === parsed.failureSoundId)
                         ? parsed.failureSoundId
                         : DEFAULT_CONFIG.failureSoundId) as FailureSoundId,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function saveConfig(cfg: NotificationsConfig) {
  try {
    localStorage.setItem('sf.notifications', JSON.stringify(cfg));
  } catch {
    // ignore quota errors
  }
}

// ---- Web Audio synthesis ----------------------------------------------------

interface ToneSpec {
  freq: number;
  type: OscillatorType;
  start: number;
  duration: number;
  gain: number;
  lowpass?: number;
}

function playTones(ctx: AudioContext, tones: ToneSpec[]) {
  const now = ctx.currentTime;
  for (const t of tones) {
    const osc      = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type              = t.type;
    osc.frequency.value   = t.freq;
    gainNode.gain.setValueAtTime(0, now + t.start);
    gainNode.gain.linearRampToValueAtTime(t.gain, now + t.start + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + t.start + t.duration);
    if (t.lowpass) {
      const filter          = ctx.createBiquadFilter();
      filter.type           = 'lowpass';
      filter.frequency.value = t.lowpass;
      osc.connect(filter);
      filter.connect(gainNode);
    } else {
      osc.connect(gainNode);
    }
    gainNode.connect(ctx.destination);
    osc.start(now + t.start);
    osc.stop(now + t.start + t.duration + 0.05);
  }
}

const SOUND_SPECS: Record<SuccessSoundId | FailureSoundId, ToneSpec[]> = {
  'ding': [
    { freq: 880, type: 'sine',     start: 0,    duration: 0.25, gain: 0.22 },
  ],
  'chime': [
    { freq: 880,  type: 'triangle', start: 0, duration: 0.4, gain: 0.18 },
    { freq: 1320, type: 'triangle', start: 0, duration: 0.4, gain: 0.12 },
  ],
  'two-tone-up': [
    { freq: 660, type: 'square', start: 0,    duration: 0.08, gain: 0.16 },
    { freq: 990, type: 'square', start: 0.09, duration: 0.08, gain: 0.16 },
  ],
  'pluck': [
    { freq: 220, type: 'sawtooth', start: 0, duration: 0.15, gain: 0.22, lowpass: 1200 },
  ],
  'buzz': [
    { freq: 165, type: 'square', start: 0,   duration: 0.06, gain: 0.2 },
    { freq: 165, type: 'square', start: 0.1, duration: 0.06, gain: 0.2 },
    { freq: 165, type: 'square', start: 0.2, duration: 0.06, gain: 0.2 },
  ],
  'two-tone-down': [
    { freq: 880, type: 'sine', start: 0,    duration: 0.12, gain: 0.2 },
    { freq: 440, type: 'sine', start: 0.13, duration: 0.12, gain: 0.2 },
  ],
  'thud': [
    { freq: 80, type: 'sine', start: 0, duration: 0.12, gain: 0.32 },
  ],
};

function playSound(id: SuccessSoundId | FailureSoundId) {
  try {
    const ctx   = new AudioContext();
    const tones = SOUND_SPECS[id];
    if (tones) playTones(ctx, tones);
  } catch {
    // AudioContext may be unavailable in some environments — silently ignore
  }
}

// ---- Desktop notification helpers -------------------------------------------

async function requestDesktopPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

function fireTestNotification() {
  if (Notification.permission === 'granted') {
    new Notification('ShadowFlow', {
      body: '通知测试成功 ✓',
      icon: '/favicon.ico',
    });
  }
}

// ---- Toggle component -------------------------------------------------------

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
        checked ? 'bg-sf-accent' : 'bg-sf-elev3',
      ].join(' ')}
    >
      <span
        className={[
          'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200',
          checked ? 'translate-x-4' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  );
}

// ---- Sound selector row -----------------------------------------------------

interface SoundSelectRowProps<T extends string> {
  label: string;
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (v: T) => void;
}

function SoundSelectRow<T extends string>({ label, value, options, onChange }: SoundSelectRowProps<T>) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-[12px] text-sf-fg3">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="flex-1 rounded-[7px] border border-sf-border bg-sf-elev1 px-3 py-2 text-[12px] text-sf-fg1 focus:border-sf-accent focus:outline-none"
      >
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => playSound(value as unknown as SuccessSoundId | FailureSoundId)}
        className="shrink-0 rounded-[7px] border border-sf-border bg-transparent px-3 py-2 text-[12px] text-sf-fg3 hover:border-sf-fg5 hover:text-sf-fg1 transition-colors"
        title={t('settings.notifications.preview')}
      >
        {t('settings.notifications.previewPlaying')}
      </button>
    </div>
  );
}

// ---- Main section -----------------------------------------------------------

export function NotificationsSection() {
  const { t } = useI18n();
  const [config, setConfig] = useState<NotificationsConfig>(loadConfig);
  const [permDeniedWarning, setPermDeniedWarning] = useState(false);

  // Sync to localStorage whenever config changes
  useEffect(() => {
    saveConfig(config);
  }, [config]);

  // If the page loads with desktopEnabled=true but browser has since denied
  // permission, reflect the real state
  useEffect(() => {
    if (config.desktopEnabled && 'Notification' in window && Notification.permission === 'denied') {
      setConfig((prev) => ({ ...prev, desktopEnabled: false }));
    }
  }, []);

  function handleSoundToggle(v: boolean) {
    setConfig((prev) => ({ ...prev, soundEnabled: v }));
    if (v) {
      // Play a preview of the currently selected success sound when enabling
      playSound(config.successSoundId);
    }
  }

  async function handleDesktopToggle(v: boolean) {
    if (!v) {
      setConfig((prev) => ({ ...prev, desktopEnabled: false }));
      setPermDeniedWarning(false);
      return;
    }
    const granted = await requestDesktopPermission();
    if (granted) {
      setConfig((prev) => ({ ...prev, desktopEnabled: true }));
      setPermDeniedWarning(false);
    } else {
      // Keep toggle off, show warning
      setConfig((prev) => ({ ...prev, desktopEnabled: false }));
      setPermDeniedWarning(true);
    }
  }

  function handleTestNotification() {
    fireTestNotification();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Section header */}
      <div>
        <h2 className="text-[18px] font-bold text-sf-fg1">{t('settings.notifications.heading')}</h2>
        <p className="mt-1 text-[12px] text-sf-fg4">{t('settings.notifications.subhead')}</p>
      </div>

      {/* Settings card */}
      <div className="rounded-[10px] border border-sf-border bg-sf-elev2 p-4 flex flex-col gap-5">

        {/* Sound notifications */}
        <div className="flex flex-col gap-3">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-sf-fg4">
            {t('settings.notifications.soundTitle')}
          </p>
          <div className="flex items-center gap-3">
            <Toggle checked={config.soundEnabled} onChange={handleSoundToggle} />
            <span className="text-[12px] text-sf-fg2">{t('settings.notifications.soundHint')}</span>
          </div>

          {/* Sound selectors — only shown when sound is enabled */}
          {config.soundEnabled && (
            <div className="mt-1 flex flex-col gap-2 rounded-[8px] border border-sf-border bg-sf-elev1 px-3 py-3">
              <SoundSelectRow
                label="成功音"
                value={config.successSoundId}
                options={SUCCESS_SOUNDS}
                onChange={(v) => setConfig((prev) => ({ ...prev, successSoundId: v }))}
              />
              <SoundSelectRow
                label="失败音"
                value={config.failureSoundId}
                options={FAILURE_SOUNDS}
                onChange={(v) => setConfig((prev) => ({ ...prev, failureSoundId: v }))}
              />
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="h-px bg-sf-border" />

        {/* Desktop notifications */}
        <div className="flex flex-col gap-3">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-sf-fg4">
            {t('settings.notifications.desktopTitle')}
          </p>
          <div className="flex items-center gap-3">
            <Toggle checked={config.desktopEnabled} onChange={handleDesktopToggle} />
            <span className="text-[12px] text-sf-fg2">{t('settings.notifications.desktopHint')}</span>
          </div>

          {/* Permission denied warning */}
          {permDeniedWarning && (
            <p className="rounded-[7px] border border-sf-reject/30 bg-sf-reject/10 px-3 py-2 text-[11px] text-sf-reject">
              {t('settings.notifications.desktopDenied')}
            </p>
          )}

          {/* Test notification button — only shown when desktop is enabled */}
          {config.desktopEnabled && (
            <button
              type="button"
              onClick={handleTestNotification}
              className="self-start rounded-[7px] border border-sf-border bg-transparent px-3 py-1.5 text-[12px] text-sf-fg3 hover:border-sf-fg5 hover:text-sf-fg1 transition-colors"
            >
              {t('settings.notifications.testButton')}
            </button>
          )}
        </div>
      </div>

      {/* Info note */}
      <p className="text-[11px] text-sf-fg5">
        {t('settings.notifications.footnote')}
      </p>
    </div>
  );
}
