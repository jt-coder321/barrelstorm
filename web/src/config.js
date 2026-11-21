// Playfield geometry (world units). The player sits at z = 0 and targets roll toward +z.
export const FIELD = {
  playerZ: 0,
  spawnZ: -46,
  leakZ: 1.4,
  colSpacing: 1.4,
  cols: 5,
  playerMaxX: 3.05,
};

export const colX = (c) => (c - (FIELD.cols - 1) / 2) * FIELD.colSpacing;

export const MAX_BOLTS = 9;

// Gate kinds (collected by driving through them, charged by shooting them).
export const GATE_KINDS = {
  bolts: { label: (v) => `+${v} BOLT${v > 1 ? 'S' : ''}`, color: 0x3d8bff, step: 14, inc: 1, max: 2 },
  dmg: { label: (v) => `DAMAGE +${v}%`, color: 0xe5483f, step: 3, inc: 2, max: 90 },
  rate: { label: (v) => `SPEED +${v}%`, color: 0x35b86a, step: 3, inc: 2, max: 70 },
  level: { label: (v) => `LEVEL +${v}`, color: 0xf2b134, step: 10, inc: 1, max: 7 },
  safe: { label: () => 'SAFE ROAD +1 HEART', color: 0x35b86a, step: 0 },
  risky: { label: () => 'RISKY ROAD  LOOT x2', color: 0xc0302a, step: 0 },
  vault: { label: () => '? SECRET ?', color: 0xa040ff, step: 0 },
};
