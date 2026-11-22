// Environments. Each one looks different and brings its own hazard (handled in hazards.js).
export const BIOMES = {
  courtyard: {
    id: 'courtyard', name: 'Castle Courtyard', icon: '\u{1F3F0}', unlock: 1,
    sky: ['#3f5f9a', '#8fa7c9', '#f0c590', '#f6d3a2'], fog: 0xf0c590, fogNear: 38, fogFar: 112,
    ground: '#4f7d34', stone: [128, 118, 102], wall: 0x9c927f, hemi: [0xcfe0ff, 0x6b5a3c, 1.0], sun: [0xffe0b0, 2.0],
    props: 'pines', ambient: null, hazard: 'ballista', hazardName: 'Ballista volleys sweep a lane',
  },
  volcano: {
    id: 'volcano', name: 'Volcanic Fortress', icon: '\u{1F30B}', unlock: 4,
    sky: ['#2a0c0c', '#6b1d10', '#d2531b', '#ff9a3c'], fog: 0x6b2410, fogNear: 30, fogFar: 96,
    ground: '#2a1a14', stone: [92, 70, 62], wall: 0x4a332b, hemi: [0xffb08a, 0x3a1008, 0.9], sun: [0xff9a5a, 2.1],
    props: 'rocks', ambient: 'embers', hazard: 'geyser', hazardName: 'Lava geysers erupt under your feet (and burn barrels)',
  },
  frozen: {
    id: 'frozen', name: 'Frozen Battlefield', icon: '❄', unlock: 7,
    sky: ['#5c7ea8', '#a9c3dd', '#e3eef7', '#ffffff'], fog: 0xdfeaf4, fogNear: 30, fogFar: 100,
    ground: '#dfe9f2', stone: [170, 186, 200], wall: 0xb7c8d8, hemi: [0xe0f0ff, 0x8aa0b8, 1.15], sun: [0xffffff, 1.6],
    props: 'ice', ambient: 'snow', hazard: 'ice', hazardName: 'Slippery ice and falling icicles',
  },
  desert: {
    id: 'desert', name: 'Desert Siege Camp', icon: '\u{1F3DC}', unlock: 10,
    sky: ['#3a77b8', '#86b5de', '#f3d8a0', '#f7c873'], fog: 0xf0cf8f, fogNear: 34, fogFar: 106,
    ground: '#d9b26a', stone: [196, 160, 110], wall: 0xc79f63, hemi: [0xfff0d0, 0x9a7440, 1.05], sun: [0xfff0c0, 2.2],
    props: 'cactus', ambient: 'sand', hazard: 'gust', hazardName: 'Sandstorm gusts push everything sideways',
  },
  dungeon: {
    id: 'dungeon', name: 'Crystal Caverns', icon: '\u{1F48E}', unlock: 13,
    sky: ['#3b5a8a', '#6f94c4', '#a8d4e8', '#d8f2f4'], fog: 0xb4dbe6, fogNear: 30, fogFar: 100,
    ground: '#6a7a8c', stone: [150, 160, 176], wall: 0x8a96a8, hemi: [0xe4f4ff, 0x5a6a7e, 1.15], sun: [0xfff4e0, 1.9],
    props: 'pillars', ambient: 'dust', hazard: 'traps', hazardName: 'Spike traps snap up from the floor',
  },
  ruins: {
    id: 'ruins', name: 'Abandoned Fortress', icon: '\u{1F3DA}', unlock: 16,
    sky: ['#4a4a58', '#7a7a88', '#b0a898', '#c8bca4'], fog: 0x9e978a, fogNear: 30, fogFar: 98,
    ground: '#5a5a44', stone: [110, 106, 98], wall: 0x6e6a62, hemi: [0xd0d0e0, 0x4a4a3a, 0.95], sun: [0xe8e0d0, 1.6],
    props: 'ruins', ambient: 'dust', hazard: 'rubble', hazardName: 'Crumbling walls block your shots',
  },
  forest: {
    id: 'forest', name: 'Haunted Forest', icon: '\u{1F47B}', unlock: 19,
    sky: ['#4a6a8a', '#7ea0b8', '#b8d4c8', '#dcecd8'], fog: 0xb8d0c0, fogNear: 30, fogFar: 96,
    ground: '#4a6a3a', stone: [120, 134, 112], wall: 0x6e7e64, hemi: [0xe0fff0, 0x3a4a30, 1.1], sun: [0xf0fff0, 1.8],
    props: 'deadtrees', ambient: 'wisps', hazard: 'haunt', hazardName: 'Ghost barrels fade in and out',
  },
  factory: {
    id: 'factory', name: 'War Factory', icon: '\u{1F3ED}', unlock: 22,
    sky: ['#4a5a78', '#8a8a96', '#d0a878', '#f0c890'], fog: 0xc8a888, fogNear: 30, fogFar: 98,
    ground: '#5e5850', stone: [128, 122, 116], wall: 0x7a7066, hemi: [0xfff0d8, 0x4a3e30, 1.05], sun: [0xffd8a0, 2.0],
    props: 'gears', ambient: 'sparks', hazard: 'saw', hazardName: 'Sawblades sweep across the road',
  },
};

export const BIOME_IDS = Object.keys(BIOMES);

export function unlockedBiomes(stage) {
  return BIOME_IDS.filter((id) => BIOMES[id].unlock <= stage);
}
