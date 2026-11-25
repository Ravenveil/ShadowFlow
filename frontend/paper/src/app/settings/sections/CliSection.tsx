/**
 * 本地 CLI——搬 legacy LocalCLISection（Variant E）的卡片墙形态：
 *   全 22 个已知 CLI 首帧即出（品牌卡同步铺满，网络扫描只翻转安装态），
 *   已安装区实卡 + 未检测区虚线小卡，分类筛选 + 搜索 + 强制重扫。
 * 数据走 paper 自己的数据源（settings.clis + onRescanCli），不直接 fetch。
 */
import { useMemo, useState } from 'react';
import { CLI_LABEL, CLI_META, SETTINGS_COPY } from '@/shared/content/settings';
import type { CliProbe } from '@/shared/data/types';
import { IconSearch } from '@/shared/ui/icons';
import { useFlash } from '@/app/settings/primitives';

const C = SETTINGS_COPY.cli;

/** 后端 KNOWN_CLIS 的全量 id（首帧占位用，扫描回来后合并真值）。 */
const KNOWN_IDS = Object.keys(CLI_LABEL);

type FilterKey = 'all' | 'installed' | 'missing' | 'anthropic' | 'openai' | 'google' | 'cn';

/** 品牌色调：legacy 用 hex 硬色，这里收敛到主题 tone（三套主题各自成组）。 */
const VENDOR_TONE: Record<string, string> = {
  anthropic: 'var(--tone-amber)',
  openai: 'var(--tone-green)',
  google: 'var(--tone-blue)',
  cn: 'var(--tone-teal)',
  other: 'var(--tone-slate)',
};

const vendorOf = (id: string) => CLI_META[id]?.vendor ?? 'other';
const tintOf = (id: string) => VENDOR_TONE[vendorOf(id)];
const monogramOf = (id: string) => id.slice(0, 2).toUpperCase();

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="st-cli-chip" data-active={active ? 'true' : undefined} onClick={onClick}>
      {label}
      <span>{count}</span>
    </button>
  );
}

function Divider({ label, count }: { label: string; count: number }) {
  return (
    <div className="st-cli-divider">
      <span>
        {label} · {count}
      </span>
      <i />
    </div>
  );
}

export function CliSection({
  clis,
  onRescan,
}: {
  clis: CliProbe[];
  onRescan: () => Promise<CliProbe[]>;
}) {
  // 首帧 = 全目录占位（未检测态）；真值合并后只翻转 installed/version/path。
  const [probes, setProbes] = useState<CliProbe[]>(() => {
    const known = new Map(clis.map((c) => [c.id, c]));
    return KNOWN_IDS.map(
      (id) => known.get(id) ?? { id, name: CLI_LABEL[id] ?? id, bin: id, version: '', path: '', installed: false },
    );
  });
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [flash, setFlash] = useFlash();

  const scan = async (rescan: () => Promise<CliProbe[]>) => {
    setScanning(true);
    setError(false);
    try {
      const next = await rescan();
      const byId = new Map(next.map((c) => [c.id, c]));
      setProbes(
        KNOWN_IDS.map((id) => {
          const hit = byId.get(id);
          if (hit) return hit;
          // API 里没有的 id（后端未收录）按未检测占位，不丢卡片
          const stale = probes.find((p) => p.id === id);
          return stale ?? { id, name: CLI_LABEL[id] ?? id, bin: id, version: '', path: '', installed: false };
        }),
      );
      const ready = next.filter((c) => c.installed).length;
      setFlash(C.scanned(ready, next.length));
    } catch {
      setError(true);
    } finally {
      setScanning(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return probes.filter((p) => {
      const meta = CLI_META[p.id];
      if (q && !`${p.name} ${p.id} ${meta?.short ?? ''}`.toLowerCase().includes(q)) return false;
      if (filter === 'installed') return p.installed;
      if (filter === 'missing') return !p.installed;
      if (filter === 'all') return true;
      return vendorOf(p.id) === filter;
    });
  }, [probes, filter, search]);

  const installed = filtered.filter((p) => p.installed);
  const missing = filtered.filter((p) => !p.installed);

  const counts = useMemo(() => {
    const by = (pred: (p: CliProbe) => boolean) => probes.filter(pred).length;
    return {
      all: probes.length,
      installed: by((p) => p.installed),
      missing: by((p) => !p.installed),
      anthropic: by((p) => vendorOf(p.id) === 'anthropic'),
      openai: by((p) => vendorOf(p.id) === 'openai'),
      google: by((p) => vendorOf(p.id) === 'google'),
      cn: by((p) => vendorOf(p.id) === 'cn'),
    } satisfies Record<FilterKey, number>;
  }, [probes]);

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all', label: C.filterAll },
    { key: 'installed', label: C.filterInstalled },
    { key: 'missing', label: C.filterMissing },
    { key: 'anthropic', label: C.filterAnthropic },
    { key: 'openai', label: C.filterOpenai },
    { key: 'google', label: C.filterGoogle },
    { key: 'cn', label: C.filterCn },
  ];

  return (
    <div className="st-stack st-cli">
      {/* 工具条：筛选 chips + 搜索 + 重扫 */}
      <div className="st-cli-toolbar">
        <span className="st-cli-toolbar-label">{C.filterAll}</span>
        {FILTERS.map((f) => (
          <FilterChip key={f.key} label={f.label} count={counts[f.key]} active={filter === f.key} onClick={() => setFilter(f.key)} />
        ))}
        <div className="st-cli-search">
          <IconSearch size={13} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={C.searchPlaceholder}
            aria-label={C.searchPlaceholder}
          />
          {!search && <kbd>{C.searchKey}</kbd>}
        </div>
        <button type="button" className="st-cli-rescan" onClick={() => void scan(onRescan)} disabled={scanning}>
          {scanning ? C.scanning : C.rescan}
        </button>
      </div>

      {error ? (
        <div className="st-cli-error">{C.loadFailed}</div>
      ) : (
        <>
          {installed.length > 0 && (
            <>
              <Divider label={C.dividerInstalled} count={installed.length} />
              <div className="st-cli-grid">
                {installed.map((p) => (
                  <article className="st-cli-card" key={p.id} data-installed="true">
                    <header>
                      <span className="st-cli-logo" style={{ color: tintOf(p.id) }}>
                        {monogramOf(p.id)}
                      </span>
                      <span className="st-cli-tag" data-tone="ok">
                        {C.installed}
                      </span>
                    </header>
                    <div className="st-cli-name">
                      <b>{p.name}</b>
                      <small>{CLI_META[p.id]?.short ?? p.id}</small>
                    </div>
                    <dl>
                      {p.version ? (
                        <div>
                          <dt>{C.versionLabel}</dt>
                          <dd>{p.version}</dd>
                        </div>
                      ) : null}
                      {p.path ? (
                        <div>
                          <dt>{C.pathLabel}</dt>
                          <dd title={p.path}>{p.path}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </article>
                ))}
              </div>
            </>
          )}

          {missing.length > 0 && (
            <>
              <Divider label={C.dividerMissing} count={missing.length} />
              <div className="st-cli-grid st-cli-grid--missing">
                {missing.map((p) => (
                  <div className="st-cli-mini" key={p.id}>
                    <span className="st-cli-logo" data-mini="true" style={{ color: tintOf(p.id) }}>
                      {monogramOf(p.id)}
                    </span>
                    <div className="st-cli-mini-text">
                      <b>{p.name}</b>
                      <small>{CLI_META[p.id]?.short ?? ''}</small>
                    </div>
                    <span className="st-cli-tag" data-tone="mute">
                      {C.missing}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {installed.length === 0 && missing.length === 0 && <div className="st-cli-empty">{C.noMatch}</div>}

          <p className="st-hint">{C.rescanNote}</p>
          {flash ? <span className="st-flash">{flash}</span> : null}
        </>
      )}
    </div>
  );
}
