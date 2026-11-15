import type { WeaponKey } from '../core/types.ts';

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' as const };

export function WeaponGlyph({ kind }: { kind: WeaponKey }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...stroke}>
      {kind === 'pulse' && <><path d="M12 4v11" /><circle cx="12" cy="19" r="1.4" /></>}
      {kind === 'twin' && <><path d="M9 4v11M15 4v11" /><circle cx="9" cy="19" r="1.2" /><circle cx="15" cy="19" r="1.2" /></>}
      {kind === 'fan' && <><path d="M12 19L12 4M12 19L5.5 6M12 19L18.5 6" /></>}
      {kind === 'seeker' && <><path d="M12 4v8" /><circle cx="12" cy="16" r="3.4" /><path d="M12 12.6v-1" /></>}
    </svg>
  );
}

export function PauseGlyph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...stroke}>
      <path d="M9 6v12M15 6v12" />
    </svg>
  );
}

export function HopGlyph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...stroke}>
      <path d="M12 18V6M7 11l5-5 5 5" />
    </svg>
  );
}

export function HullGlyph({ lit }: { lit: boolean }): React.JSX.Element {
  return (
    <svg viewBox="0 0 12 16" width="10" height="14" aria-hidden="true" fill={lit ? '#c9cfd2' : 'none'} stroke={lit ? '#c9cfd2' : '#565f64'} strokeWidth="1">
      <path d="M6 1l4 11-4-2-4 2z" />
    </svg>
  );
}
