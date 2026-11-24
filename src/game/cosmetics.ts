export type RunnerSkinId =
  | 'cyber_pulse'
  | 'solar_flare'
  | 'phantom_violet'
  | 'emerald_surge'
  | 'prism_nova';

export type TrailStyleId =
  | 'neon_ghost'
  | 'plasma_sparks'
  | 'solar_ribbon'
  | 'prism_overdrive';

export interface RunnerSkinSpec {
  id: RunnerSkinId;
  name: string;
  description: string;
  price: number;
  suitTop: string;
  suitBottom: string;
  limbDark: string;
  trimHex: string;
  coreHex: string;
  bootHex: string;
  auraRgba: string;
  trimNum: number;
  coreNum: number;
}

export interface TrailStyleSpec {
  id: TrailStyleId;
  name: string;
  description: string;
  price: number;
  primaryHex: string;
  secondaryHex: string;
  primaryNum: number;
  secondaryNum: number;
}

export const RUNNER_SKINS: RunnerSkinSpec[] = [
  {
    id: 'cyber_pulse',
    name: 'Cyber Pulse',
    description: 'Standard issue midnight armor with cyan rails and magenta thrusters.',
    price: 0,
    suitTop: '#232a5c',
    suitBottom: '#10142e',
    limbDark: '#151936',
    trimHex: '#00f0ff',
    coreHex: '#ff2a85',
    bootHex: '#ff2a85',
    auraRgba: 'rgba(0, 240, 255, 0.24)',
    trimNum: 0x00f0ff,
    coreNum: 0xff2a85,
  },
  {
    id: 'solar_flare',
    name: 'Solar Flare',
    description: 'Carbon-plated Exo-suit with molten gold piping and plasma orange jets.',
    price: 75,
    suitTop: '#3d1f14',
    suitBottom: '#1c0c08',
    limbDark: '#26110a',
    trimHex: '#ffd166',
    coreHex: '#ff5400',
    bootHex: '#ffbe0b',
    auraRgba: 'rgba(255, 209, 102, 0.28)',
    trimNum: 0xffd166,
    coreNum: 0xff5400,
  },
  {
    id: 'phantom_violet',
    name: 'Phantom Violet',
    description: 'Stealth indigo chassis laced with ultraviolet veins and neon rose cores.',
    price: 150,
    suitTop: '#2c1654',
    suitBottom: '#110826',
    limbDark: '#1b0d38',
    trimHex: '#c77dff',
    coreHex: '#ff2a85',
    bootHex: '#e0aaff',
    auraRgba: 'rgba(199, 125, 255, 0.28)',
    trimNum: 0xc77dff,
    coreNum: 0xff2a85,
  },
  {
    id: 'emerald_surge',
    name: 'Emerald Surge',
    description: 'High-voltage overdrive shell built with hyper-mint conduits and lime soles.',
    price: 250,
    suitTop: '#0d3b3e',
    suitBottom: '#061a1d',
    limbDark: '#09282b',
    trimHex: '#38f9d7',
    coreHex: '#00ff87',
    bootHex: '#38f9d7',
    auraRgba: 'rgba(56, 249, 215, 0.28)',
    trimNum: 0x38f9d7,
    coreNum: 0x00ff87,
  },
  {
    id: 'prism_nova',
    name: 'Prism Nova',
    description: 'Elite titanium-white runner frame pulsing with pure cyan and gold light.',
    price: 400,
    suitTop: '#dce6ff',
    suitBottom: '#5a6b9e',
    limbDark: '#7a8cc2',
    trimHex: '#00f0ff',
    coreHex: '#ffd166',
    bootHex: '#ff2a85',
    auraRgba: 'rgba(255, 255, 255, 0.32)',
    trimNum: 0x00f0ff,
    coreNum: 0xffd166,
  },
];

export const TRAIL_STYLES: TrailStyleSpec[] = [
  {
    id: 'neon_ghost',
    name: 'Neon Ghost',
    description: 'Crisp electric cyan holographic afterimages on lane dashes.',
    price: 0,
    primaryHex: '#00f0ff',
    secondaryHex: '#9d4edd',
    primaryNum: 0x00f0ff,
    secondaryNum: 0x9d4edd,
  },
  {
    id: 'plasma_sparks',
    name: 'Plasma Sparks',
    description: 'Continuous stream of magenta and electric blue diamond sparks.',
    price: 60,
    primaryHex: '#ff2a85',
    secondaryHex: '#00f0ff',
    primaryNum: 0xff2a85,
    secondaryNum: 0x00f0ff,
  },
  {
    id: 'solar_ribbon',
    name: 'Solar Ribbon',
    description: 'Twin glowing golden-amber laser ribbons weaving behind your boots.',
    price: 120,
    primaryHex: '#ffd166',
    secondaryHex: '#ff5400',
    primaryNum: 0xffd166,
    secondaryNum: 0xff5400,
  },
  {
    id: 'prism_overdrive',
    name: 'Prism Overdrive',
    description: 'Shifting full-spectrum neon plasma ribbon and iridescent afterimages.',
    price: 220,
    primaryHex: '#38f9d7',
    secondaryHex: '#ff2a85',
    primaryNum: 0x38f9d7,
    secondaryNum: 0xff2a85,
  },
];

export function getSkinSpec(id: string): RunnerSkinSpec {
  return RUNNER_SKINS.find((s) => s.id === id) ?? RUNNER_SKINS[0];
}

export function getTrailSpec(id: string): TrailStyleSpec {
  return TRAIL_STYLES.find((t) => t.id === id) ?? TRAIL_STYLES[0];
}
