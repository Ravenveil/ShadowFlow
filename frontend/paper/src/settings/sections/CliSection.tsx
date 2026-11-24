/** 本地 CLI：探测结果 + 重新检测。检测动作走数据源（真接口由后端扫 PATH）。 */
import { useState } from 'react';
import { SETTINGS_COPY } from '../../content/settings';
import type { CliProbe } from '../../data/types';
import { Row, Tag, Tile, useFlash } from '../primitives';

const C = SETTINGS_COPY.cli;

export function CliSection({
  clis,
  onRescan,
}: {
  clis: CliProbe[];
  onRescan: () => Promise<CliProbe[]>;
}) {
  const [scanning, setScanning] = useState(false);
  const [flash, setFlash] = useFlash();

  const scan = async () => {
    setScanning(true);
    try {
      const next = await onRescan();
      const ready = next.filter((c) => c.installed).length;
      setFlash(C.scanned(ready, next.length));
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="st-stack">
      <div className="st-list">
        {clis.map((c) => (
          <div className="st-card" key={c.id} data-off={c.installed ? undefined : 'true'}>
            <div className="st-card-head">
              <Tile tone={c.installed ? 'teal' : 'slate'}>{'$'}</Tile>
              <div className="st-card-text">
                <b>{c.name}</b>
                <span>
                  {C.binLabel} {c.bin}
                </span>
              </div>
              <Tag tone={c.installed ? 'ok' : 'mute'}>
                {c.installed ? C.installed : C.missing}
              </Tag>
            </div>
            <div className="st-card-body">
              <Row label={C.versionLabel}>
                <span className="st-value">{c.version}</span>
              </Row>
              <Row label={C.pathLabel}>
                <span className="st-value st-value--mono">{c.path}</span>
              </Row>
            </div>
          </div>
        ))}
      </div>

      <div className="st-actions">
        <button className="st-btn st-btn--solid" onClick={() => void scan()} disabled={scanning}>
          {scanning ? C.scanning : C.rescan}
        </button>
        {flash ? <span className="st-flash">{flash}</span> : null}
      </div>
      <p className="st-hint">{C.rescanNote}</p>
    </div>
  );
}
