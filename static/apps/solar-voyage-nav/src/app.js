import { createSolarScene, hasSurfaceLandscape } from "./webgl-scene.js?v=20260713-8";
import { AU_KM, createAstrodynamicsEngine } from "./astrodynamics.js?v=20260713-8";

const TAU = Math.PI * 2;
const LAUNCH_SEQUENCE_SECONDS = 5.4;
const LANDING_SEQUENCE_SECONDS = 6.2;
const ORBITAL_DEPARTURE_SECONDS = 2.8;
const ORBITAL_CAPTURE_SECONDS = 4.2;
const LANDING_SEQUENCE_START = 0.82;
const BASE_DATE = new Date(Date.UTC(2042, 0, 1));

const BODIES = [
  {
    id: "sun",
    name: "太阳",
    family: "恒星",
    radius: 10,
    color: "#ffd36c",
    accent: "#fff2a8",
    orbitRadius: 0,
    orbitDays: 0,
    parent: null,
    priority: 10,
    tags: ["日冕观光", "太阳帆加速带"],
    gravity: "27.9 g",
    atmosphere: "等离子体",
    port: "日冕观测环",
  },
  {
    id: "mercury",
    name: "水星",
    family: "行星",
    radius: 1.5,
    color: "#b8aba2",
    accent: "#e2d4c7",
    orbitRadius: 30,
    orbitDays: 88,
    phase: 0.2,
    inclination: 1.6,
    parent: "sun",
    priority: 2,
    tags: ["晨昏线穿越", "近日电梯"],
    gravity: "0.38 g",
    atmosphere: "极稀薄",
    port: "赫尔墨斯站",
  },
  {
    id: "venus",
    name: "金星",
    family: "行星",
    radius: 2.6,
    color: "#d8a652",
    accent: "#f3dca0",
    orbitRadius: 48,
    orbitDays: 225,
    phase: 1.3,
    inclination: 1.2,
    parent: "sun",
    priority: 4,
    tags: ["云海航线", "引力弹弓"],
    gravity: "0.9 g",
    atmosphere: "厚云层",
    port: "阿佛洛狄忒云港",
  },
  {
    id: "earth",
    name: "地球",
    family: "行星",
    radius: 2.75,
    color: "#3d9dff",
    accent: "#85f0cb",
    orbitRadius: 70,
    orbitDays: 365,
    phase: 2.1,
    inclination: 0.8,
    parent: "sun",
    priority: 8,
    tags: ["蓝色母港", "低轨枢纽"],
    gravity: "1 g",
    atmosphere: "氮氧大气",
    port: "近地轨道港",
  },
  {
    id: "moon",
    name: "月球",
    family: "卫星",
    radius: 0.9,
    color: "#c8c9c7",
    accent: "#ffffff",
    orbitRadius: 8,
    orbitDays: 27.3,
    phase: 1.8,
    inclination: 0.4,
    parent: "earth",
    priority: 5,
    tags: ["静海站", "短途换乘"],
    gravity: "0.16 g",
    atmosphere: "无",
    port: "静海港",
  },
  {
    id: "mars",
    name: "火星",
    family: "行星",
    radius: 2.1,
    color: "#c95f42",
    accent: "#ffd0a2",
    orbitRadius: 98,
    orbitDays: 687,
    phase: 3.6,
    inclination: 1.4,
    parent: "sun",
    priority: 7,
    tags: ["峡谷航拍", "火卫补给"],
    gravity: "0.38 g",
    atmosphere: "二氧化碳",
    port: "阿瑞斯轨道港",
  },
  {
    id: "phobos",
    name: "火卫一",
    family: "卫星",
    radius: 0.45,
    color: "#9b8175",
    accent: "#e4c8aa",
    orbitRadius: 5.2,
    orbitDays: 0.32,
    phase: 0.7,
    inclination: 0.2,
    parent: "mars",
    priority: 2,
    tags: ["低空掠行", "火星换乘"],
    gravity: "微重力",
    atmosphere: "无",
    port: "福波斯泊位",
  },
  {
    id: "deimos",
    name: "火卫二",
    family: "卫星",
    radius: 0.34,
    color: "#a08d82",
    accent: "#d9c9bb",
    orbitRadius: 7.8,
    orbitDays: 1.26,
    phase: 2.5,
    inclination: 0.3,
    parent: "mars",
    priority: 2,
    tags: ["外侧哨站", "火星全景"],
    gravity: "微重力",
    atmosphere: "无",
    port: "得摩斯观测站",
  },
  {
    id: "ceres",
    name: "谷神星",
    family: "矮行星",
    radius: 1.0,
    color: "#a6998d",
    accent: "#ddd2c4",
    orbitRadius: 132,
    orbitDays: 1680,
    phase: 2.8,
    inclination: 2.4,
    parent: "sun",
    priority: 3,
    tags: ["小行星带驿站", "深空补给"],
    gravity: "0.03 g",
    atmosphere: "无",
    port: "谷神星中继港",
  },
  {
    id: "jupiter",
    name: "木星",
    family: "行星",
    radius: 6.8,
    color: "#d7b48a",
    accent: "#f4d6b2",
    orbitRadius: 170,
    orbitDays: 4333,
    phase: 5.1,
    inclination: 0.7,
    parent: "sun",
    priority: 8,
    tags: ["大红斑", "强磁层"],
    gravity: "2.53 g",
    atmosphere: "氢氦云带",
    port: "伽利略环港",
    striped: true,
  },
  {
    id: "io",
    name: "木卫一",
    family: "卫星",
    radius: 1.0,
    color: "#d7b64d",
    accent: "#fff1a8",
    orbitRadius: 9,
    orbitDays: 1.77,
    phase: 0.9,
    inclination: 0.35,
    parent: "jupiter",
    priority: 4,
    tags: ["火山喷流", "硫黄平原"],
    gravity: "0.18 g",
    atmosphere: "极稀薄",
    port: "伊奥熔火站",
  },
  {
    id: "europa",
    name: "木卫二",
    family: "卫星",
    radius: 0.95,
    color: "#d9d7c8",
    accent: "#9ee9ff",
    orbitRadius: 12,
    orbitDays: 3.55,
    phase: 2.4,
    inclination: 0.6,
    parent: "jupiter",
    priority: 5,
    tags: ["冰壳巡游", "地下海传说"],
    gravity: "0.13 g",
    atmosphere: "稀薄氧",
    port: "欧罗巴冰港",
  },
  {
    id: "ganymede",
    name: "木卫三",
    family: "卫星",
    radius: 1.25,
    color: "#a99b89",
    accent: "#d9c9b4",
    orbitRadius: 17,
    orbitDays: 7.15,
    phase: 4.2,
    inclination: 0.6,
    parent: "jupiter",
    priority: 3,
    tags: ["巨卫观测", "木星门户"],
    gravity: "0.15 g",
    atmosphere: "极稀薄",
    port: "盖尼米德港",
  },
  {
    id: "callisto",
    name: "木卫四",
    family: "卫星",
    radius: 1.15,
    color: "#7f746a",
    accent: "#c8b8a8",
    orbitRadius: 23,
    orbitDays: 16.69,
    phase: 5.3,
    inclination: 0.8,
    parent: "jupiter",
    priority: 4,
    tags: ["多环陨石坑", "木星外港"],
    gravity: "0.13 g",
    atmosphere: "极稀薄",
    port: "卡利斯托边港",
  },
  {
    id: "saturn",
    name: "土星",
    family: "行星",
    radius: 6.1,
    color: "#e3c57e",
    accent: "#fff0b9",
    orbitRadius: 225,
    orbitDays: 10759,
    phase: 0.4,
    inclination: 1.1,
    parent: "sun",
    priority: 8,
    tags: ["土星环", "远日航线"],
    gravity: "1.06 g",
    atmosphere: "氢氦云带",
    port: "卡西尼环港",
    ringed: true,
  },
  {
    id: "enceladus",
    name: "土卫二",
    family: "卫星",
    radius: 0.55,
    color: "#e8f1ee",
    accent: "#b9f4ff",
    orbitRadius: 9,
    orbitDays: 1.37,
    phase: 4.4,
    inclination: 0.35,
    parent: "saturn",
    priority: 4,
    tags: ["冰羽喷流", "地下海"],
    gravity: "0.01 g",
    atmosphere: "水汽喷流",
    port: "恩克拉多斯冰站",
  },
  {
    id: "rhea",
    name: "土卫五",
    family: "卫星",
    radius: 0.75,
    color: "#c6c4bc",
    accent: "#f0eee7",
    orbitRadius: 12,
    orbitDays: 4.52,
    phase: 2.7,
    inclination: 0.45,
    parent: "saturn",
    priority: 3,
    tags: ["冰原陨坑", "环外观景"],
    gravity: "0.03 g",
    atmosphere: "极稀薄",
    port: "瑞亚中继站",
  },
  {
    id: "titan",
    name: "泰坦",
    family: "卫星",
    radius: 1.3,
    color: "#d69a52",
    accent: "#ffe0a4",
    orbitRadius: 14,
    orbitDays: 15.9,
    phase: 1.1,
    inclination: 0.8,
    parent: "saturn",
    priority: 5,
    tags: ["橙色天空", "甲烷湖"],
    gravity: "0.14 g",
    atmosphere: "浓厚氮气",
    port: "惠更斯浮港",
  },
  {
    id: "iapetus",
    name: "土卫八",
    family: "卫星",
    radius: 0.7,
    color: "#81786b",
    accent: "#e7e1d4",
    orbitRadius: 22,
    orbitDays: 79.3,
    phase: 5.5,
    inclination: 1.4,
    parent: "saturn",
    priority: 3,
    tags: ["双色地貌", "赤道山脊"],
    gravity: "0.02 g",
    atmosphere: "无",
    port: "伊阿珀托斯远站",
  },
  {
    id: "uranus",
    name: "天王星",
    family: "行星",
    radius: 4.55,
    color: "#83ced3",
    accent: "#c8fbff",
    orbitRadius: 258,
    orbitDays: 30687,
    phase: 4.6,
    inclination: 1.5,
    axialTilt: 1.71,
    parent: "sun",
    priority: 7,
    tags: ["侧躺自转", "暗色窄环"],
    gravity: "0.89 g",
    atmosphere: "氢氦甲烷",
    port: "赫歇尔极轨港",
    ringed: true,
    ringInner: 1.55,
    ringOuter: 1.96,
  },
  {
    id: "miranda",
    name: "天卫五",
    family: "卫星",
    radius: 0.45,
    color: "#aca9a0",
    accent: "#e6e3da",
    orbitRadius: 6,
    orbitDays: 1.41,
    phase: 0.6,
    inclination: 0.45,
    parent: "uranus",
    priority: 3,
    tags: ["断崖峡谷", "拼接地貌"],
    gravity: "0.01 g",
    atmosphere: "无",
    port: "米兰达峡谷站",
  },
  {
    id: "ariel",
    name: "天卫一",
    family: "卫星",
    radius: 0.65,
    color: "#c7c5bc",
    accent: "#f0eee8",
    orbitRadius: 8,
    orbitDays: 2.52,
    phase: 1.8,
    inclination: 0.5,
    parent: "uranus",
    priority: 3,
    tags: ["冰谷", "明亮表面"],
    gravity: "0.03 g",
    atmosphere: "无",
    port: "艾瑞尔冰港",
  },
  {
    id: "titania",
    name: "天卫三",
    family: "卫星",
    radius: 0.9,
    color: "#aaa69e",
    accent: "#dedbd2",
    orbitRadius: 12,
    orbitDays: 8.71,
    phase: 3.2,
    inclination: 0.6,
    parent: "uranus",
    priority: 4,
    tags: ["巨型断层", "天王星门户"],
    gravity: "0.04 g",
    atmosphere: "极稀薄",
    port: "泰坦妮亚主港",
  },
  {
    id: "oberon",
    name: "天卫四",
    family: "卫星",
    radius: 0.85,
    color: "#8e857b",
    accent: "#cfc6bb",
    orbitRadius: 16,
    orbitDays: 13.46,
    phase: 4.9,
    inclination: 0.7,
    parent: "uranus",
    priority: 3,
    tags: ["暗色冰岩", "外轨观景"],
    gravity: "0.04 g",
    atmosphere: "无",
    port: "奥伯龙外港",
  },
  {
    id: "neptune",
    name: "海王星",
    family: "行星",
    radius: 4.2,
    color: "#4975ff",
    accent: "#89f5ff",
    orbitRadius: 288,
    orbitDays: 60190,
    phase: 2.2,
    inclination: 1.8,
    parent: "sun",
    priority: 5,
    tags: ["深蓝风暴", "远航终点"],
    gravity: "1.14 g",
    atmosphere: "氢氦甲烷",
    port: "特里同前哨",
  },
  {
    id: "triton",
    name: "海卫一",
    family: "卫星",
    radius: 1.05,
    color: "#c5b9af",
    accent: "#ffd4d2",
    orbitRadius: 13,
    orbitDays: 5.88,
    phase: 3.7,
    inclination: 1.1,
    parent: "neptune",
    priority: 5,
    retrograde: true,
    tags: ["逆行轨道", "氮冰喷泉"],
    gravity: "0.08 g",
    atmosphere: "稀薄氮气",
    port: "特里同低温站",
  },
  {
    id: "oort",
    name: "奥尔特云环",
    family: "深空区域",
    radius: 1.3,
    color: "#a9d9e8",
    accent: "#e3fbff",
    orbitRadius: 390,
    orbitDays: 3650000,
    phase: 5.4,
    inclination: 18,
    parent: "sun",
    priority: 7,
    region: true,
    tags: ["冰质彗核群", "太阳系潮汐边界"],
    gravity: "微重力",
    atmosphere: "星际介质",
    port: "奥尔特观景前哨",
  },
];

const BODY_VISUALS = {
  sun: {
    kind: "star",
    palette: ["#fff3a0", "#ffc44f", "#f57b2c", "#6b240d"],
    glow: "#ffd36c",
    activity: 9,
  },
  mercury: {
    kind: "cratered",
    palette: ["#d0c3b7", "#9d9189", "#6f6762", "#efe4d5"],
    craters: 18,
    roughness: 0.72,
  },
  venus: {
    kind: "clouded",
    palette: ["#f2d28a", "#d79b42", "#b7772f", "#fff0bb"],
    bands: 7,
    haze: "#ffd898",
  },
  earth: {
    kind: "earth",
    palette: ["#1d68b4", "#2d9cff", "#3a9b6f", "#e7d6a8", "#ffffff"],
    clouds: 10,
    texture: {
      src: "./assets/textures/nasa/earth.jpg",
      source: "NASA 3D Resources / Earth (A)",
      projection: "equirectangular",
      spin: 0.004,
      window: 0.52,
      offset: 0.58,
      contrast: 1.12,
      liveSpin: 0.018,
    },
  },
  moon: {
    kind: "cratered",
    palette: ["#d9d9d4", "#a9aaa5", "#757a7a", "#f1f0e9"],
    craters: 22,
    roughness: 0.9,
    texture: {
      src: "./assets/textures/nasa/moon.jpg",
      source: "NASA 3D Resources / Moon",
      projection: "square",
      spin: 0.0015,
      offset: 0.12,
      contrast: 1.1,
      liveSpin: 0.004,
    },
  },
  mars: {
    kind: "mars",
    palette: ["#c46a3d", "#8e3c28", "#e2a15c", "#f4ead7"],
    craters: 9,
    dust: "#e7a260",
    texture: {
      src: "./assets/textures/nasa/mars.jpg",
      source: "NASA 3D Resources / Mars",
      projection: "equirectangular",
      spin: 0.0035,
      window: 0.5,
      offset: 0.22,
      contrast: 1.16,
      liveSpin: 0.014,
    },
  },
  phobos: {
    kind: "irregular",
    palette: ["#9a806f", "#6e5e55", "#c4a995", "#3c3330"],
    craters: 10,
  },
  deimos: {
    kind: "irregular",
    palette: ["#ad998d", "#6f625b", "#d8c8b9", "#413936"],
    craters: 8,
  },
  ceres: {
    kind: "cratered",
    palette: ["#b5aa9d", "#81796f", "#d8cfc2", "#5b554f"],
    craters: 13,
    roughness: 0.68,
  },
  jupiter: {
    kind: "gas",
    palette: ["#f2d2ad", "#d39b69", "#8f5c42", "#fff2cf", "#c56d43"],
    bands: 10,
    spot: true,
    texture: {
      src: "./assets/textures/nasa/jupiter.jpg",
      source: "NASA 3D Resources / Jupiter",
      projection: "equirectangular",
      spin: 0.008,
      window: 0.5,
      offset: 0.08,
      contrast: 1.12,
      liveSpin: 0.032,
    },
  },
  io: {
    kind: "volcanic",
    palette: ["#e6c759", "#9e6e2f", "#fff1a1", "#6c4724"],
    craters: 5,
  },
  europa: {
    kind: "ice",
    palette: ["#f1eee2", "#b9c2bf", "#8fd8ee", "#8d6954"],
    cracks: 16,
  },
  ganymede: {
    kind: "iceRock",
    palette: ["#b0a08b", "#766e66", "#d6c6ad", "#8bb6c4"],
    craters: 12,
  },
  callisto: {
    kind: "cratered",
    palette: ["#897d70", "#4e4944", "#c4b5a4", "#302c29"],
    craters: 20,
  },
  saturn: {
    kind: "gas",
    palette: ["#f6df9f", "#d2aa66", "#a77745", "#fff1c5", "#c99153"],
    bands: 8,
    ringColor: "#f3d99a",
    texture: {
      src: "./assets/textures/nasa/saturn.jpg",
      source: "NASA 3D Resources / Saturn",
      projection: "equirectangular",
      spin: 0.006,
      window: 0.5,
      offset: 0.18,
      contrast: 1.08,
      liveSpin: 0.024,
    },
  },
  enceladus: {
    kind: "ice",
    palette: ["#edf5f3", "#b9d8dc", "#91c9d6", "#ffffff"],
    cracks: 18,
  },
  rhea: {
    kind: "cratered",
    palette: ["#ceccc4", "#8d8b85", "#eeece5", "#686660"],
    craters: 14,
  },
  titan: {
    kind: "haze",
    palette: ["#d48a39", "#9c5f28", "#f3c16d", "#f7dda8"],
    haze: "#e79b42",
  },
  iapetus: {
    kind: "twoTone",
    palette: ["#d9d2c5", "#655d54", "#f1eadf", "#302c29"],
    craters: 11,
  },
  uranus: {
    kind: "iceGiant",
    palette: ["#a6e1e3", "#65b8c3", "#d9ffff", "#3e8898"],
    bands: 9,
    ringColor: "#9ebbc4",
  },
  miranda: {
    kind: "iceRock",
    palette: ["#bcb9b0", "#77746e", "#e4e0d6", "#55514c"],
    craters: 13,
  },
  ariel: {
    kind: "ice",
    palette: ["#d4d2ca", "#9caaa9", "#f2f1eb", "#727d7d"],
    cracks: 12,
  },
  titania: {
    kind: "iceRock",
    palette: ["#b9b5ac", "#77736d", "#e3dfd6", "#55514d"],
    craters: 12,
  },
  oberon: {
    kind: "cratered",
    palette: ["#968c81", "#5c554f", "#c8beb2", "#3d3834"],
    craters: 15,
  },
  neptune: {
    kind: "iceGiant",
    palette: ["#315cff", "#1f3ca9", "#73e8ff", "#d2fbff"],
    storms: 4,
  },
  triton: {
    kind: "ice",
    palette: ["#d3cbc5", "#9e8f90", "#f1e6df", "#b87c7d"],
    cracks: 11,
  },
  oort: {
    kind: "beacon",
    palette: ["#dff8ff", "#77bccc", "#ffffff", "#386e7a"],
    glow: "#bfefff",
  },
};

const VEHICLES = [
  {
    id: "tourer",
    name: "观光飞船",
    icon: "◆",
    speed: 2.2,
    range: 220,
    comfort: 96,
    landing: "轨道接驳",
    accent: "#ffd36c",
    summary: "风景路线加成，适合第一次太阳系旅行。",
  },
  {
    id: "sail",
    name: "太阳帆",
    icon: "◁",
    speed: 1.65,
    range: 260,
    comfort: 72,
    landing: "需港口停靠",
    accent: "#72e1a8",
    summary: "靠近太阳更省能量，长途更像慢旅行。",
  },
  {
    id: "courier",
    name: "急行艇",
    icon: "▲",
    speed: 3.8,
    range: 160,
    comfort: 68,
    landing: "短程登陆",
    accent: "#5ed8ff",
    summary: "速度优先，适合地月火之间的快速通勤。",
  },
  {
    id: "clipper",
    name: "跃迁艇",
    icon: "✦",
    speed: 5.2,
    range: 320,
    comfort: 82,
    landing: "港口限定",
    accent: "#b99cff",
    summary: "依赖中继港，远行效率最高。",
  },
];

const ROUTE_MODES = [
  {
    id: "balanced",
    name: "推荐",
    hint: "时间与风景均衡",
    speedMod: 1,
    riskMod: 0,
    scenicMod: 8,
  },
  {
    id: "fast",
    name: "最快",
    hint: "直达高能轨迹",
    speedMod: 0.74,
    riskMod: 12,
    scenicMod: -4,
  },
  {
    id: "scenic",
    name: "风景",
    hint: "经过观景天体",
    speedMod: 1.32,
    riskMod: 3,
    scenicMod: 24,
  },
  {
    id: "economy",
    name: "省能",
    hint: "中继补给优先",
    speedMod: 1.16,
    riskMod: -8,
    scenicMod: 10,
  },
];

const ENERGY_TYPES = {
  helios: {
    id: "helios",
    name: "日珀晶",
    color: "#ffd36c",
    rangeAu: 0.24,
    description: "吸收太阳风的内行星晶体",
  },
  ferrite: {
    id: "ferrite",
    name: "赤铁核",
    color: "#ef8668",
    rangeAu: 0.48,
    description: "岩质天体中的高密度推进介质",
  },
  cryolite: {
    id: "cryolite",
    name: "冰脉晶",
    color: "#8ee8f1",
    rangeAu: 0.92,
    description: "外行星卫星冰层中的低温燃料",
  },
  storm: {
    id: "storm",
    name: "雷暴氢晶",
    color: "#9fb4ff",
    rangeAu: 1.8,
    description: "气态巨行星磁层凝聚能源",
  },
  warp: {
    id: "warp",
    name: "曲率晶核",
    color: "#d5a8ff",
    rangeAu: 6,
    description: "假想的负压曲率场核心",
  },
};

const state = {
  day: 260,
  experienceMode: "fantasy",
  travelMode: "cruise",
  realFlightDays: 260,
  astroStatus: "idle",
  astroError: "",
  throttle: 62,
  playing: false,
  timeScale: 1,
  origin: "earth",
  destination: "mars",
  selectedBody: "earth",
  vehicle: "tourer",
  mode: "balanced",
  viewMode: "overview",
  missionActive: false,
  routeProgress: 0,
  launchSequenceElapsed: 0,
  launchSequenceProgress: 0,
  launchSequenceComplete: false,
  landingSequenceElapsed: 0,
  landingSequenceProgress: 0,
  landingSequenceActive: false,
  missionFuelCommitted: false,
  missionDepartureDay: null,
  missionRoute: null,
  missionRoutePoints: null,
  inventory: {
    helios: 6,
    ferrite: 4,
    cryolite: 2.5,
    storm: 1.4,
    warp: 0.6,
  },
  deposits: Object.fromEntries(BODIES.filter((body) => body.id !== "sun").map((body) => [body.id, resolveDeposit(body).reserve])),
  camera: {
    yaw: -0.82,
    pitch: 0.72,
    zoom: 0.78,
  },
  cameraGoal: {
    yaw: -0.82,
    pitch: 0.72,
    zoom: 0.78,
  },
  layers: {
    orbits: true,
    labels: true,
    stations: true,
  },
};

const bodyById = new Map(BODIES.map((body) => [body.id, body]));
const vehicleById = new Map(VEHICLES.map((vehicle) => [vehicle.id, vehicle]));
const modeById = new Map(ROUTE_MODES.map((mode) => [mode.id, mode]));
const astrodynamics = createAstrodynamicsEngine();
const textureCache = new Map();
const texturePixelCache = new Map();
const textureSphereCache = new Map();

const canvas = document.getElementById("spaceMap");
const ctx = null;
const elements = {
  appShell: document.querySelector(".app-shell"),
  experienceButtons: [...document.querySelectorAll(".experience-button")],
  dataStatus: document.getElementById("dataStatus"),
  originSelect: document.getElementById("originSelect"),
  destinationSelect: document.getElementById("destinationSelect"),
  swapRoute: document.getElementById("swapRoute"),
  routeTitle: document.getElementById("routeTitle"),
  routeModel: document.getElementById("routeModel"),
  routeMetrics: document.getElementById("routeMetrics"),
  realSolver: document.getElementById("realSolver"),
  solverStatus: document.getElementById("solverStatus"),
  solverReadout: document.getElementById("solverReadout"),
  flightDays: document.getElementById("flightDays"),
  flightDaysValue: document.getElementById("flightDaysValue"),
  energyPlanner: document.getElementById("energyPlanner"),
  energyPlanStatus: document.getElementById("energyPlanStatus"),
  energyPlanGrid: document.getElementById("energyPlanGrid"),
  travelModeButtons: [...document.querySelectorAll(".travel-mode-button")],
  modeGroup: document.getElementById("modeGroup"),
  routeSteps: document.getElementById("routeSteps"),
  glanceMode: document.getElementById("glanceMode"),
  glanceTitle: document.getElementById("glanceTitle"),
  glanceDuration: document.getElementById("glanceDuration"),
  glanceDistance: document.getElementById("glanceDistance"),
  glanceWindow: document.getElementById("glanceWindow"),
  glanceOrigin: document.getElementById("glanceOrigin"),
  glanceDestination: document.getElementById("glanceDestination"),
  planetPreview: document.getElementById("planetPreview"),
  planetPreviewTitle: document.getElementById("planetPreviewTitle"),
  planetPreviewSource: document.getElementById("planetPreviewSource"),
  vehicleList: document.getElementById("vehicleList"),
  timingBoard: document.getElementById("timingBoard"),
  placeTitle: document.getElementById("placeTitle"),
  placeDetail: document.getElementById("placeDetail"),
  energyInventory: document.getElementById("energyInventory"),
  miningSite: document.getElementById("miningSite"),
  collectEnergy: document.getElementById("collectEnergy"),
  tabs: [...document.querySelectorAll(".tab")],
  panelViews: [...document.querySelectorAll("[data-panel-view]")],
  viewButtons: [...document.querySelectorAll(".view-button")],
  zoomIn: document.getElementById("zoomIn"),
  zoomOut: document.getElementById("zoomOut"),
  resetView: document.getElementById("resetView"),
  orbitsLayer: document.getElementById("orbitsLayer"),
  labelsLayer: document.getElementById("labelsLayer"),
  stationsLayer: document.getElementById("stationsLayer"),
  playTime: document.getElementById("playTime"),
  dateChip: document.getElementById("dateChip"),
  timeSlider: document.getElementById("timeSlider"),
  timeScale: document.getElementById("timeScale"),
  launchButton: document.getElementById("launchButton"),
  cockpitTitle: document.getElementById("cockpitTitle"),
  cockpitPhase: document.getElementById("cockpitPhase"),
  cockpitRemaining: document.getElementById("cockpitRemaining"),
  cockpitRemainingLabel: document.getElementById("cockpitRemainingLabel"),
  cockpitDuration: document.getElementById("cockpitDuration"),
  cockpitDistance: document.getElementById("cockpitDistance"),
  cockpitProgress: document.getElementById("cockpitProgress"),
  throttle: document.getElementById("throttle"),
  throttleValue: document.getElementById("throttleValue"),
  attitudeValue: document.getElementById("attitudeValue"),
  engineMode: document.getElementById("engineMode"),
  reactorValue: document.getElementById("reactorValue"),
  cockpitFuel: document.getElementById("cockpitFuel"),
  warpControl: document.getElementById("warpControl"),
};

let width = 0;
let height = 0;
let dpr = 1;
let lastFrame = performance.now();
let lastPanelSyncDay = state.day;
let frameCameraTarget = { x: 0, y: 0, z: 0 };
let sceneTime = 0;
let webglScene = null;
let pointer = {
  dragging: false,
  moved: false,
  x: 0,
  y: 0,
};
let screenBodies = [];
let astroRequestToken = 0;

const stars = Array.from({ length: 520 }, (_, index) => {
  const seed = Math.sin(index * 997.13) * 10000;
  const seedB = Math.sin(index * 311.71 + 4.2) * 10000;
  return {
    x: seed - Math.floor(seed),
    y: seedB - Math.floor(seedB),
    size: 0.45 + ((index * 13) % 9) / 10,
    alpha: 0.28 + ((index * 17) % 10) / 20,
  };
});

const guideLanes = Array.from({ length: 18 }, (_, index) => ({
  radius: 42 + index * 17,
  offset: (index * 0.37) % TAU,
  alpha: 0.035 + (index % 4) * 0.012,
}));

function setup() {
  webglScene = createSolarScene({
    canvas,
    bodies: BODIES,
    visuals: BODY_VISUALS,
    getBodyPosition,
  });
  resizeCanvas();
  preloadTextures();
  window.addEventListener("resize", resizeCanvas);
  populateRouteSelects();
  renderModeButtons();
  renderVehicleList();
  bindEvents();
  syncExperienceChrome();
  applyViewMode(state.viewMode);
  syncPanels();
  requestAnimationFrame(tick);
}

function resizeCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = Math.floor(window.innerWidth);
  height = Math.floor(window.innerHeight);
  webglScene?.resize(width, height, dpr);
  resizePlanetPreview();
}

function resizePlanetPreview() {
  const preview = elements.planetPreview;
  if (!preview) return;
  const cssWidth = Math.max(1, preview.clientWidth || 164);
  const cssHeight = Math.max(1, preview.clientHeight || cssWidth);
  preview.width = Math.floor(cssWidth * dpr);
  preview.height = Math.floor(cssHeight * dpr);
  preview.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
}

function populateRouteSelects() {
  const routeBodies = BODIES.filter(
    (body) => body.id !== "sun" && (state.experienceMode !== "real" || !body.region),
  );
  for (const select of [elements.originSelect, elements.destinationSelect]) {
    select.innerHTML = "";
    for (const body of routeBodies) {
      const option = document.createElement("option");
      option.value = body.id;
      option.textContent = `${body.name} · ${body.family}`;
      select.appendChild(option);
    }
  }
  elements.originSelect.value = state.origin;
  elements.destinationSelect.value = state.destination;
}

function renderModeButtons() {
  elements.modeGroup.innerHTML = "";
  for (const mode of ROUTE_MODES) {
    const button = document.createElement("button");
    button.className = "mode-button";
    button.type = "button";
    button.dataset.mode = mode.id;
    button.innerHTML = `<strong>${mode.name}</strong><span>${mode.hint}</span>`;
    button.addEventListener("click", () => {
      resetMissionNavigation();
      state.mode = mode.id;
      syncPanels();
    });
    elements.modeGroup.appendChild(button);
  }
}

function renderVehicleList() {
  elements.vehicleList.innerHTML = "";
  for (const vehicle of VEHICLES) {
    const button = document.createElement("button");
    button.className = "vehicle-row";
    button.type = "button";
    button.dataset.vehicle = vehicle.id;
    button.innerHTML = `
      <span class="vehicle-icon" style="color:${vehicle.accent}">${vehicle.icon}</span>
      <span>
        <strong>${vehicle.name}</strong>
        <span>${vehicle.summary}</span>
      </span>
      <span class="vehicle-speed">${vehicle.speed.toFixed(1)} u/d</span>
    `;
    button.addEventListener("click", () => {
      resetMissionNavigation();
      state.vehicle = vehicle.id;
      syncPanels();
    });
    elements.vehicleList.appendChild(button);
  }
}

function bindEvents() {
  elements.experienceButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const nextMode = button.dataset.experience;
      if (nextMode === state.experienceMode) return;
      state.experienceMode = nextMode;
      resetMissionNavigation();
      if (nextMode !== "real" && state.viewMode === "follow") {
        state.viewMode = "overview";
        applyViewMode("overview");
      }
      if (nextMode === "real" && (bodyById.get(state.origin)?.region || bodyById.get(state.destination)?.region)) {
        state.origin = "earth";
        state.destination = "mars";
      }
      populateRouteSelects();
      syncExperienceChrome();
      elements.tabs.find((tab) => tab.dataset.panel === "route")?.click();
      syncPanels();
      if (nextMode === "real") ensureAstrodynamicsData();
    });
  });
  elements.originSelect.addEventListener("change", () => {
    state.origin = elements.originSelect.value;
    state.selectedBody = state.origin;
    resetMissionNavigation();
    syncPanels();
    ensureAstrodynamicsData();
  });
  elements.destinationSelect.addEventListener("change", () => {
    state.destination = elements.destinationSelect.value;
    state.selectedBody = state.destination;
    resetMissionNavigation();
    syncPanels();
    ensureAstrodynamicsData();
  });
  elements.swapRoute.addEventListener("click", () => {
    [state.origin, state.destination] = [state.destination, state.origin];
    state.selectedBody = state.destination;
    resetMissionNavigation();
    populateRouteSelects();
    syncPanels();
    ensureAstrodynamicsData();
  });
  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      elements.tabs.forEach((item) => item.classList.toggle("is-active", item === tab));
      const panel = tab.dataset.panel;
      elements.panelViews.forEach((view) => {
        view.classList.toggle("is-hidden", view.dataset.panelView !== panel);
      });
    });
  });
  elements.zoomIn.addEventListener("click", () => {
    state.cameraGoal.zoom = clamp(state.cameraGoal.zoom * 1.18, 0.5, 3.2);
  });
  elements.zoomOut.addEventListener("click", () => {
    state.cameraGoal.zoom = clamp(state.cameraGoal.zoom / 1.18, 0.5, 3.2);
  });
  elements.resetView.addEventListener("click", () => {
    applyViewMode(state.viewMode);
  });
  elements.viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.viewMode = button.dataset.view;
      applyViewMode(state.viewMode);
    });
  });
  elements.orbitsLayer.addEventListener("change", () => {
    state.layers.orbits = elements.orbitsLayer.checked;
  });
  elements.labelsLayer.addEventListener("change", () => {
    state.layers.labels = elements.labelsLayer.checked;
  });
  elements.stationsLayer.addEventListener("change", () => {
    state.layers.stations = elements.stationsLayer.checked;
  });
  elements.playTime.addEventListener("click", () => {
    if (state.missionRoute && state.routeProgress < 1) return;
    state.playing = !state.playing;
    elements.playTime.textContent = state.playing ? "Ⅱ" : "▶";
    elements.playTime.title = state.playing ? "暂停时间" : "播放时间";
  });
  elements.timeSlider.addEventListener("input", () => {
    resetMissionNavigation();
    state.day = Number(elements.timeSlider.value);
    syncPanels();
  });
  elements.flightDays.addEventListener("input", () => {
    resetMissionNavigation();
    state.realFlightDays = Number(elements.flightDays.value);
    syncPanels();
  });
  elements.travelModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      resetMissionNavigation();
      state.travelMode = button.dataset.travelMode;
      syncPanels();
    });
  });
  elements.throttle.addEventListener("input", () => {
    state.throttle = Number(elements.throttle.value);
    updateCockpitConsole(getDisplayedRoute());
  });
  elements.collectEnergy.addEventListener("click", collectCurrentEnergy);
  elements.warpControl.addEventListener("click", () => {
    if (state.experienceMode === "real") return;
    state.travelMode = "warp";
    syncPanels();
    if (!state.missionActive) startMission();
  });
  elements.timeScale.addEventListener("change", () => {
    state.timeScale = Number(elements.timeScale.value);
  });
  elements.launchButton.addEventListener("click", startMission);
  canvas.addEventListener("pointerdown", (event) => {
    pointer.dragging = true;
    pointer.moved = false;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!pointer.dragging) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 1) pointer.moved = true;
    state.cameraGoal.yaw += dx * 0.006;
    state.cameraGoal.pitch = clamp(state.cameraGoal.pitch + dy * 0.004, -1.05, 1.05);
  });
  canvas.addEventListener("pointerup", (event) => {
    pointer.dragging = false;
    if (!pointer.moved) {
      pickBody(event.clientX, event.clientY);
    }
  });
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const delta = event.deltaY > 0 ? 0.9 : 1.1;
      state.cameraGoal.zoom = clamp(state.cameraGoal.zoom * delta, 0.5, 3.2);
    },
    { passive: false },
  );
}

function syncPanels() {
  const route = getDisplayedRoute();
  const origin = bodyById.get(state.origin);
  const destination = bodyById.get(state.destination);
  const vehicle = vehicleById.get(state.vehicle);

  elements.originSelect.value = state.origin;
  elements.destinationSelect.value = state.destination;
  elements.routeTitle.textContent = `${origin.name}到${destination.name}`;
  const realMode = state.experienceMode === "real";
  elements.routeModel.textContent = realMode
    ? `${route.transferLabel} · 日心黄道 J2000`
    : `${route.transferLabel} · 能源与跃迁模拟`;
  elements.routeMetrics.innerHTML = realMode
    ? [
        metric("转移时间", formatDuration(route.durationDays)),
        metric("总 Δv", route.realSolution ? `${route.realSolution.totalDeltaV.toFixed(2)} km/s` : "等待解算"),
        metric("端点距离", `${route.distanceAu.toFixed(2)} au`),
        metric("C3", route.realSolution ? `${route.realSolution.c3.toFixed(1)} km²/s²` : "—"),
      ].join("")
    : [
        metric("预计耗时", formatDuration(route.durationDays)),
        metric("航程", `${route.distanceAu.toFixed(2)} au`),
        metric("能源消耗", `${route.energyPlan.required.toFixed(2)} u`),
        metric("风险", route.riskLabel),
      ].join("");
  elements.glanceMode.textContent = realMode
    ? `真实航天 · ${route.transferLabel}`
    : `${state.travelMode === "warp" ? "空间跃迁" : modeById.get(state.mode).name} · ${vehicle.name}`;
  elements.glanceTitle.textContent = `${origin.name} → ${destination.name}`;
  elements.glanceDuration.textContent = formatDuration(route.durationDays);
  elements.glanceDistance.textContent = `${route.distanceAu.toFixed(2)} au`;
  elements.glanceWindow.textContent = realMode
    ? route.realSolution
      ? `${route.realSolution.totalDeltaV.toFixed(1)} Δv`
      : "星历加载"
    : `${route.energyPlan.required.toFixed(1)} u`;
  elements.glanceOrigin.textContent = origin.name;
  elements.glanceDestination.textContent = destination.name;
  updatePlanetPreviewMeta(destination);
  renderSolver(route);
  renderEnergyPlanner(route);
  renderEnergyInventory();

  elements.routeSteps.innerHTML = route.waypoints
    .map((id, index) => {
      const body = bodyById.get(id);
      const role = index === 0 ? "出发" : index === route.waypoints.length - 1 ? "抵达" : "中继";
      return `
        <div class="route-step">
          <span class="step-dot"></span>
          <span><strong>${role} · ${body.name}</strong><span>${body.port} · ${body.tags[0]}</span></span>
        </div>
      `;
    })
    .join("");

  elements.modeGroup.querySelectorAll(".mode-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === state.mode);
  });
  elements.vehicleList.querySelectorAll(".vehicle-row").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.vehicle === state.vehicle);
  });

  renderTiming(route, vehicle);
  renderPlaceDetail();
  updateCockpitConsole(route);
  lastPanelSyncDay = state.day;
}

function metric(label, value) {
  return `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`;
}

function syncExperienceChrome() {
  const realMode = state.experienceMode === "real";
  elements.appShell.classList.toggle("is-real", realMode);
  elements.experienceButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.experience === state.experienceMode);
  });
  elements.realSolver.hidden = !realMode;
  elements.energyPlanner.hidden = realMode;
  elements.dataStatus.textContent = realMode
    ? state.astroStatus === "ready"
      ? "JPL DE441 · 星历已锁定"
      : state.astroStatus === "error"
        ? "星历数据不可用"
        : "正在同步 JPL 星历"
    : "曲率能源模拟";
}

async function ensureAstrodynamicsData() {
  if (state.experienceMode !== "real") return;
  const token = ++astroRequestToken;
  state.astroStatus = "loading";
  state.astroError = "";
  syncExperienceChrome();
  const routeBodies = new Set([state.origin, state.destination]);
  for (const id of [...routeBodies]) {
    const parent = bodyById.get(id)?.parent;
    if (parent && parent !== "sun") routeBodies.add(parent);
  }
  try {
    await astrodynamics.loadBodies([...routeBodies]);
    if (token !== astroRequestToken) return;
    state.astroStatus = "ready";
  } catch (error) {
    if (token !== astroRequestToken) return;
    state.astroStatus = "error";
    state.astroError = error.message;
  }
  syncExperienceChrome();
  syncPanels();
}

function renderSolver(route) {
  if (state.experienceMode !== "real") return;
  const maxFlightDays = Math.max(30, Math.min(1600, 2400 - Math.ceil(state.day)));
  elements.flightDays.max = maxFlightDays;
  elements.flightDays.value = route.durationDays;
  elements.flightDaysValue.textContent = `${route.durationDays} 天`;
  if (state.astroStatus === "loading") {
    elements.solverStatus.textContent = "载入 JPL 星历";
    elements.solverReadout.innerHTML = solverItem("数据源", "NASA/JPL Horizons") + solverItem("状态", "同步中");
    return;
  }
  if (!route.realSolution) {
    elements.solverStatus.textContent = state.astroStatus === "error" ? "星历错误" : "等待解算";
    elements.solverReadout.innerHTML =
      solverItem("数据源", state.astroError || "NASA/JPL Horizons") + solverItem("建议", "调整转移时间");
    return;
  }
  const solution = route.realSolution;
  elements.solverStatus.textContent = "Lambert 已收敛";
  elements.solverReadout.innerHTML = [
    solverItem("出发 Δv", `${solution.departureDeltaV.toFixed(2)} km/s`),
    solverItem("到达 Δv", `${solution.arrivalDeltaV.toFixed(2)} km/s`),
    solverItem("星历采样", `${solution.sampleStepDays} 天`),
    solverItem("数据源", solution.source.replace("NASA/JPL Horizons · ", "")),
  ].join("");
}

function solverItem(label, value) {
  return `<span><small>${label}</small><b>${value}</b></span>`;
}

function renderEnergyPlanner(route) {
  if (state.experienceMode === "real") return;
  const plan = route.energyPlan;
  const energy = ENERGY_TYPES[plan.energyId];
  const available = state.inventory[plan.energyId] || 0;
  elements.energyPlanStatus.textContent = plan.canAfford ? "储量充足" : "需要采集";
  elements.energyPlanGrid.innerHTML = [
    solverItem("推进能源", energy.name),
    solverItem("单位航程", `${energy.rangeAu.toFixed(2)} au`),
    solverItem("本次需要", `${plan.required.toFixed(2)} u`),
    solverItem("库存", `${available.toFixed(2)} u`),
  ].join("");
  elements.travelModeButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.travelMode === state.travelMode);
  });
}

function renderEnergyInventory() {
  const miningBody = getMiningBody();
  const deposit = resolveDeposit(miningBody);
  elements.energyInventory.innerHTML = Object.values(ENERGY_TYPES)
    .map(
      (energy) => `
        <span class="energy-item" style="--energy-color:${energy.color}">
          <i></i><small>${energy.name}</small><b>${(state.inventory[energy.id] || 0).toFixed(2)} u</b>
        </span>
      `,
    )
    .join("");
  const reserve = state.deposits[miningBody.id] || 0;
  elements.miningSite.innerHTML = `
    <small>当前采集点 · ${miningBody.name}</small>
    <b>${ENERGY_TYPES[deposit.energyId].name}</b>
    <small>剩余 ${reserve.toFixed(1)} u · 单次采集 ${deposit.yield.toFixed(1)} u · 每单位可飞 ${ENERGY_TYPES[deposit.energyId].rangeAu} au</small>
  `;
  elements.collectEnergy.disabled = reserve <= 0 || state.experienceMode === "real";
}

function collectCurrentEnergy() {
  if (state.experienceMode === "real") return;
  const body = getMiningBody();
  const deposit = resolveDeposit(body);
  const reserve = state.deposits[body.id] || 0;
  const amount = Math.min(reserve, deposit.yield);
  if (amount <= 0) return;
  state.deposits[body.id] = reserve - amount;
  state.inventory[deposit.energyId] = (state.inventory[deposit.energyId] || 0) + amount;
  elements.dataStatus.textContent = `${body.name} · 已采集 ${amount.toFixed(1)} u ${ENERGY_TYPES[deposit.energyId].name}`;
  syncPanels();
}

function getMiningBody() {
  return state.routeProgress >= 1 ? bodyById.get(state.destination) : bodyById.get(state.origin);
}

function getDisplayedRoute() {
  return state.missionRoute || buildRoute();
}

function hasSurfaceScene(bodyId) {
  return hasSurfaceLandscape(bodyId);
}

function getLaunchSequenceDuration() {
  return hasSurfaceScene(state.origin) ? LAUNCH_SEQUENCE_SECONDS : ORBITAL_DEPARTURE_SECONDS;
}

function getArrivalSequenceDuration() {
  return hasSurfaceScene(state.destination) ? LANDING_SEQUENCE_SECONDS : ORBITAL_CAPTURE_SECONDS;
}

function getArrivalActionLabel() {
  return hasSurfaceScene(state.destination) ? "自动降落" : "轨道捕获";
}

function resetMissionNavigation() {
  state.missionActive = false;
  state.routeProgress = 0;
  state.launchSequenceElapsed = 0;
  state.launchSequenceProgress = 0;
  state.launchSequenceComplete = false;
  state.landingSequenceElapsed = 0;
  state.landingSequenceProgress = 0;
  state.landingSequenceActive = false;
  state.missionFuelCommitted = false;
  state.missionDepartureDay = null;
  state.missionRoute = null;
  state.missionRoutePoints = null;
  elements.playTime.disabled = false;
  elements.launchButton.textContent = "启航";
}

function startMission() {
  if (state.missionActive) {
    state.missionActive = false;
    elements.launchButton.textContent = "继续航行";
    return;
  }
  if (state.routeProgress >= 1) resetMissionNavigation();
  const route = getDisplayedRoute();
  if (state.experienceMode === "real" && !route.realSolution) {
    elements.dataStatus.textContent = "Lambert 尚未收敛，不能启航";
    return;
  }
  if (state.experienceMode === "fantasy" && !state.missionFuelCommitted) {
    const plan = route.energyPlan;
    if (!plan.canAfford) {
      elements.dataStatus.textContent = `缺少 ${ENERGY_TYPES[plan.energyId].name}，请先采集`;
      const energyTab = elements.tabs.find((tab) => tab.dataset.panel === "energy");
      energyTab?.click();
      return;
    }
    state.inventory[plan.energyId] -= plan.required;
    state.missionFuelCommitted = true;
  }
  if (!state.missionRoute) {
    state.missionDepartureDay = state.day;
    state.missionRoute = route;
    state.missionRoutePoints = getRouteCurvePoints(route);
  }
  state.playing = false;
  elements.playTime.textContent = "▶";
  elements.playTime.title = "航行中时间由导航控制";
  elements.playTime.disabled = true;
  state.missionActive = true;
  state.viewMode = "cockpit";
  applyViewMode("cockpit");
  const activeFlightLabel =
    state.travelMode === "warp" && state.experienceMode === "fantasy" ? "跃迁中" : "巡航中";
  elements.launchButton.textContent = !state.launchSequenceComplete
    ? hasSurfaceScene(state.origin)
      ? "垂直起飞"
      : "离港锁定"
    : state.landingSequenceActive
      ? getArrivalActionLabel()
      : activeFlightLabel;
  syncPanels();
}

function updateCockpitConsole(route) {
  const progress = clamp(state.routeProgress, 0, 1);
  const launching = Boolean(state.missionRoute) && !state.launchSequenceComplete;
  const landing = Boolean(state.missionRoute) && state.landingSequenceActive && progress < 1;
  const landed = Boolean(state.missionRoute) && progress >= 1;
  const surfaceLaunch = launching && hasSurfaceScene(state.origin);
  const surfaceLanding = landing && hasSurfaceScene(state.destination);
  const surfaceLanded = landed && hasSurfaceScene(state.destination);
  const reactor = clamp(Math.round(96 - progress * 42 - (state.travelMode === "warp" ? 12 : 0)), 24, 99);
  const angle = Math.sin(sceneTime * 0.32) * (state.missionActive ? 1.4 : 0.35);
  elements.throttle.value = state.throttle;
  elements.throttleValue.textContent = `${state.throttle}%`;
  elements.attitudeValue.textContent = `${angle >= 0 ? "+" : ""}${angle.toFixed(1)}°`;
  elements.engineMode.textContent = launching
    ? surfaceLaunch
      ? "地表垂直起飞"
      : "离港姿态建立"
    : landing
      ? surfaceLanding
        ? "自动下降制导"
        : "轨道捕获制导"
      : landed
        ? surfaceLanded
          ? "地表待机"
          : "伴飞轨道保持"
        : state.experienceMode === "real"
          ? "Lambert 惯性航行"
          : state.travelMode === "warp"
            ? "曲率场推进"
            : "聚变巡航";
  elements.reactorValue.textContent = `${reactor}%`;
  const plan = route.energyPlan || { energyId: "helios" };
  elements.cockpitFuel.textContent = state.experienceMode === "real" ? `${route.realSolution?.totalDeltaV.toFixed(1) || "—"} km/s` : `${(state.inventory[plan.energyId] || 0).toFixed(2)} u`;
  elements.warpControl.classList.toggle("is-ready", state.experienceMode === "fantasy" && state.travelMode === "warp" && route.energyPlan.canAfford);
  elements.warpControl.textContent = launching
    ? surfaceLaunch
      ? "上升通道锁定"
      : "离港航向锁定"
    : landing
      ? surfaceLanding
        ? "着陆点锁定"
        : "目标轨道锁定"
      : landed
        ? surfaceLanded
          ? "地表作业就绪"
          : "伴飞锁定"
        : state.travelMode === "warp"
          ? state.missionActive
            ? "跃迁锁定"
            : "启动跃迁"
          : "充能跃迁";
  const surfaceAutomation = launching || landing;
  elements.throttle.disabled = surfaceAutomation;
  elements.warpControl.disabled = surfaceAutomation;
}

function renderTiming(route, vehicle) {
  if (state.experienceMode === "real") {
    const candidates = [-60, -20, 0, 30, 75]
      .map((offset) => {
        const day = clamp(Math.round(state.day + offset), 0, 2400 - route.durationDays);
        const solution = astrodynamics.solveRoute(state.origin, state.destination, day, route.durationDays);
        return { day, solution };
      })
      .filter((item) => item.solution)
      .sort((a, b) => a.solution.totalDeltaV - b.solution.totalDeltaV)
      .slice(0, 4);
    elements.timingBoard.innerHTML = candidates.length
      ? candidates
          .map(
            (item) => `
              <div class="timing-item">
                <span><strong>${formatDate(item.day)}</strong><span>Lambert · ${item.solution.totalDeltaV.toFixed(2)} km/s</span></span>
                <span class="timing-score">Δv</span>
              </div>
            `,
          )
          .join("")
      : `<div class="timing-item"><span><strong>等待星历</strong><span>加载后计算最低 Δv 窗口</span></span></div>`;
    return;
  }
  const candidates = [-90, -30, 0, 45, 120].map((offset) => {
    const day = clamp(Math.round(state.day + offset), 0, 2400);
    const score = calculateWindowScore(state.origin, state.destination, day, state.mode);
    return { day, score };
  });
  candidates.sort((a, b) => b.score - a.score);
  elements.timingBoard.innerHTML = candidates
    .slice(0, 4)
    .map(
      (item) => `
        <div class="timing-item">
          <span><strong>${formatDate(item.day)}</strong><span>${vehicle.name} · ${formatDuration(route.durationDays * (100 / Math.max(item.score, 40)))}</span></span>
          <span class="timing-score">${item.score}</span>
        </div>
      `,
    )
    .join("");
}

function renderPlaceDetail() {
  const body = bodyById.get(state.selectedBody) || bodyById.get(state.destination);
  const deposit = resolveDeposit(body);
  const energy = ENERGY_TYPES[deposit.energyId];
  elements.placeTitle.textContent = body.name;
  const rows = [
    ["类型", body.family],
    ["重力", body.gravity],
    ["大气", body.atmosphere],
    ["港口", body.port],
    ["看点", body.tags.join(" · ")],
    ["能源矿脉", `${energy.name} · ${energy.rangeAu} au/u`],
  ];
  elements.placeDetail.innerHTML = rows
    .map(
      ([label, value]) => `
        <div class="place-row">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `,
    )
    .join("");
}

function updatePlanetPreviewMeta(body) {
  if (!elements.planetPreviewTitle || !elements.planetPreviewSource) return;
  const visual = BODY_VISUALS[body.id];
  const texture = visual?.texture;
  const entry = texture?.src ? textureCache.get(texture.src) : null;
  elements.planetPreviewTitle.textContent = body.name;
  elements.planetPreviewSource.textContent = entry?.status === "loaded" ? "NASA 贴图" : "程序纹理";
}

function tick(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.08);
  lastFrame = now;
  sceneTime += dt;
  updateCamera(dt);
  if (state.playing) {
    state.day = (state.day + dt * 12 * state.timeScale) % 2400;
    elements.timeSlider.value = Math.round(state.day);
    if (Math.abs(state.day - lastPanelSyncDay) >= 4) {
      syncPanels();
    }
  }
  const route = getDisplayedRoute();
  if (state.missionActive) {
    if (!state.launchSequenceComplete) {
      state.launchSequenceElapsed += dt;
      state.launchSequenceProgress = clamp(state.launchSequenceElapsed / getLaunchSequenceDuration(), 0, 1);
      if (state.launchSequenceProgress >= 1) {
        state.launchSequenceComplete = true;
        elements.launchButton.textContent =
          state.travelMode === "warp" && state.experienceMode === "fantasy" ? "跃迁中" : "巡航中";
      }
    } else if (state.landingSequenceActive) {
      state.landingSequenceElapsed += dt;
      state.landingSequenceProgress = clamp(state.landingSequenceElapsed / getArrivalSequenceDuration(), 0, 1);
      const landingEase = smoothstep(state.landingSequenceProgress);
      state.routeProgress = mix(LANDING_SEQUENCE_START, 1, landingEase);
    } else {
      const throttleFactor = state.throttle / 62;
      const playbackSeconds =
        state.experienceMode === "real"
          ? clamp(route.durationDays / 26, 8, 18)
          : state.travelMode === "warp"
            ? 3.2
            : clamp(route.durationDays / 5, 6, 14);
      state.routeProgress = Math.min(
        LANDING_SEQUENCE_START,
        state.routeProgress + (dt * throttleFactor) / playbackSeconds,
      );
      if (state.routeProgress >= LANDING_SEQUENCE_START) {
        state.landingSequenceActive = true;
        state.landingSequenceElapsed = 0;
        state.landingSequenceProgress = 0;
        elements.launchButton.textContent = getArrivalActionLabel();
      }
    }
    if (state.routeProgress >= 1) {
      state.routeProgress = 1;
      state.missionActive = false;
      state.landingSequenceActive = false;
      state.landingSequenceProgress = 1;
      state.missionFuelCommitted = false;
      state.day = Math.min(2400, state.missionDepartureDay + route.durationDays);
      elements.timeSlider.value = Math.round(state.day);
      elements.playTime.disabled = false;
      elements.playTime.title = "播放时间";
      elements.launchButton.textContent = "再次启航";
      elements.dataStatus.textContent =
        state.experienceMode === "real"
          ? `导航完成 · 已抵达 ${bodyById.get(state.destination).port}`
          : `已抵达 ${bodyById.get(state.destination).name} · 可开始采集`;
      renderEnergyInventory();
    }
  }
  elements.dateChip.textContent = formatDate(state.day);
  const routePoints = state.missionRoutePoints || getRouteCurvePoints(route);
  const ephemerisDay =
    state.missionRoute && state.missionDepartureDay !== null
      ? state.missionDepartureDay + route.durationDays * state.routeProgress
      : state.day;
  updateCockpitHud(route);
  updateCockpitConsole(route);
  webglScene?.render({
    state,
    route,
    routePoints,
    vehicle: vehicleById.get(state.vehicle),
    sceneTime,
    dt,
    ephemerisDay,
  });
  renderPlanetPreview();
  requestAnimationFrame(tick);
}

function updateCockpitHud(route) {
  const origin = bodyById.get(state.origin);
  const destination = bodyById.get(state.destination);
  const progress = clamp(state.routeProgress, 0, 1);
  const surfaceOrigin = hasSurfaceScene(state.origin);
  const surfaceDestination = hasSurfaceScene(state.destination);
  const phase =
    progress >= 1
      ? surfaceDestination
        ? "landed"
        : "arrived"
      : state.landingSequenceActive
        ? surfaceDestination
          ? "surface-landing"
          : "capture"
        : !state.launchSequenceComplete && state.missionRoute
          ? surfaceOrigin
            ? "surface-launch"
            : "departure"
          : progress >= 0.68
            ? "approach"
            : progress >= 0.08
              ? "cruise"
              : "departure";
  const phaseLabels = {
    "surface-launch": "SURFACE ASCENT / 地表起飞",
    departure: "DEPARTURE / 姿态建立",
    cruise: "CRUISE / 深空巡航",
    approach: "APPROACH / 进近制导",
    capture: "ORBIT CAPTURE / 轨道捕获",
    "surface-landing": "DESCENT / 自动着陆",
    landed: "TOUCHDOWN / 地表抵达",
    arrived: "ARRIVAL / 伴飞锁定",
  };
  const phaseTitles = {
    "surface-launch": `起飞 · ${origin.port}`,
    departure: `离港 · ${origin.port}`,
    cruise: `巡航 · 前往${destination.name}`,
    approach: `进近 · ${destination.name}`,
    capture: `捕获 · ${destination.name}轨道`,
    "surface-landing": `下降 · ${destination.port}`,
    landed: `已着陆 · ${destination.name}`,
    arrived: `已抵达 · ${destination.name}`,
  };
  elements.appShell.dataset.flightPhase = phase;
  elements.cockpitPhase.textContent = phaseLabels[phase];
  elements.cockpitTitle.textContent = phaseTitles[phase];
  if (phase === "surface-launch") {
    elements.cockpitRemainingLabel.textContent = "高度";
    elements.cockpitRemaining.textContent = `${Math.round(1 + smoothstep(state.launchSequenceProgress) * 99)} km`;
  } else if (phase === "surface-landing") {
    elements.cockpitRemainingLabel.textContent = "离地";
    elements.cockpitRemaining.textContent = `${Math.max(0.2, (1 - smoothstep(state.landingSequenceProgress)) * 62).toFixed(1)} km`;
  } else if (phase === "landed") {
    elements.cockpitRemainingLabel.textContent = "状态";
    elements.cockpitRemaining.textContent = "已着陆";
  } else if (phase === "arrived") {
    elements.cockpitRemainingLabel.textContent = "状态";
    elements.cockpitRemaining.textContent = "已锁定";
  } else {
    elements.cockpitRemainingLabel.textContent = "剩余";
    elements.cockpitRemaining.textContent = formatDuration(route.durationDays * (1 - progress));
  }
  elements.cockpitDuration.textContent = formatDuration(route.durationDays);
  elements.cockpitDistance.textContent = `${route.distanceAu.toFixed(2)} au`;
  elements.cockpitProgress.style.width = `${Math.max(4, progress * 100)}%`;
}

function renderScene() {
  ctx.clearRect(0, 0, width, height);
  const route = buildRoute();
  const routePoints = getRouteCurvePoints(route);
  const cameraTarget = resolveCameraTarget(route, routePoints);
  const targetBlend = state.viewMode === "destination" ? 0.1 : 0.075;
  frameCameraTarget = {
    x: mix(frameCameraTarget.x, cameraTarget.x, targetBlend),
    y: mix(frameCameraTarget.y, cameraTarget.y, targetBlend),
    z: mix(frameCameraTarget.z, cameraTarget.z, targetBlend),
  };
  if (state.viewMode === "cockpit") {
    drawCockpitScene(route, routePoints);
    return;
  }
  drawSpace();
  if (state.layers.orbits) drawOrbits();
  drawRoute(routePoints, route);
  drawBodies(route.waypoints);
  drawRoutePins(route);
  drawShip(routePoints);
}

function updateCamera(dt) {
  const response = pointer.dragging ? 18 : 8;
  const amount = 1 - Math.exp(-dt * response);
  state.camera.yaw = mix(state.camera.yaw, state.cameraGoal.yaw, amount);
  state.camera.pitch = mix(state.camera.pitch, state.cameraGoal.pitch, amount);
  state.camera.zoom = mix(state.camera.zoom, state.cameraGoal.zoom, amount);
}

function drawCockpitScene(route, routePoints) {
  const vehicle = vehicleById.get(state.vehicle);
  const destination = bodyById.get(state.destination);
  const progress = resolveCockpitProgress(routePoints);
  const centerX = width / 2;
  const horizonY = height * 0.43;
  const destinationX = centerX + width * 0.18;
  const destinationY = horizonY - height * 0.055;

  drawCockpitSpace(centerX, horizonY, progress, vehicle);
  drawCockpitRouteGates(centerX, horizonY, destinationX, destinationY, progress, vehicle);
  drawCockpitDestination(destination, destinationX, destinationY, progress);
  drawCockpitHud(route, destination, vehicle, progress);
  drawCockpitCanopy(vehicle);
}

function resolveCockpitProgress(routePoints) {
  if (state.missionActive) return clamp(state.routeProgress, 0, 1);
  if (state.routeProgress > 0) return clamp(state.routeProgress, 0, 1);
  const routeSeed = hashText(`${state.origin}-${state.destination}-${state.vehicle}`);
  return 0.22 + randomUnit(routeSeed) * 0.16 + Math.sin(sceneTime * 0.18) * 0.025;
}

function drawCockpitSpace(centerX, horizonY, progress, vehicle) {
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#03050b");
  bg.addColorStop(0.42, "#07101c");
  bg.addColorStop(1, "#020308");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  drawCockpitDustLane(progress, vehicle);

  const speed = (state.missionActive ? 1.35 : 0.7) + vehicle.speed * 0.12;
  const drift = sceneTime * 0.08 * speed + progress * 1.8;
  ctx.save();
  ctx.lineCap = "round";
  for (let i = 0; i < stars.length; i += 1) {
    const star = stars[i];
    const seed = randomUnit(i * 41 + 7);
    const z = wrap(seed + drift * (0.15 + star.size * 0.04));
    const depth = 0.12 + z * 1.38;
    const spread = 1 / depth;
    const sx = centerX + (star.x - 0.5) * width * spread * 0.92;
    const sy = horizonY + (star.y - 0.5) * height * spread * 0.76;
    if (!isVisible({ x: sx, y: sy }, 40)) continue;

    const dx = sx - centerX;
    const dy = sy - horizonY;
    const length = (1.4 + (1 - z) * 10) * speed;
    const angle = Math.atan2(dy, dx);
    const tailX = sx - Math.cos(angle) * length;
    const tailY = sy - Math.sin(angle) * length;
    ctx.globalAlpha = clamp(0.14 + (1 - z) * 0.52, 0.12, 0.72);
    ctx.strokeStyle = star.size > 1.1 ? "#f7fbff" : "#8fb8de";
    ctx.lineWidth = clamp(star.size * (1.2 - z * 0.35), 0.6, 2.3);
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(sx, sy);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawCockpitDustLane(progress, vehicle) {
  ctx.save();
  ctx.translate(width * 0.52, height * 0.42);
  ctx.rotate(-0.2 + Math.sin(sceneTime * 0.08) * 0.02);
  const lane = ctx.createLinearGradient(-width * 0.45, 0, width * 0.45, 0);
  lane.addColorStop(0, "rgba(94,216,255,0)");
  lane.addColorStop(0.34, "rgba(94,216,255,0.12)");
  lane.addColorStop(0.58, "rgba(255,211,108,0.1)");
  lane.addColorStop(1, "rgba(255,127,110,0)");
  ctx.fillStyle = lane;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.moveTo(-width * 0.6, -height * 0.06);
  ctx.bezierCurveTo(-width * 0.12, -height * 0.18, width * 0.12, height * 0.12, width * 0.6, height * 0.02);
  ctx.lineTo(width * 0.6, height * 0.18);
  ctx.bezierCurveTo(width * 0.1, height * 0.28, -width * 0.2, height * 0.02, -width * 0.6, height * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.18 + vehicle.speed * 0.02;
  ctx.strokeStyle = "rgba(94,216,255,0.48)";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 4; i += 1) {
    const y = -height * 0.04 + i * height * 0.05 + Math.sin(progress * TAU + i) * 6;
    ctx.beginPath();
    ctx.moveTo(-width * 0.5, y);
    ctx.bezierCurveTo(-width * 0.16, y - 20, width * 0.12, y + 28, width * 0.52, y - 8);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawCockpitRouteGates(centerX, horizonY, destinationX, destinationY, progress, vehicle) {
  ctx.save();
  ctx.lineCap = "round";
  const tone = vehicle.accent;
  for (let i = 8; i >= 0; i -= 1) {
    const t = wrap(i / 9 + progress * 1.6 + sceneTime * 0.045);
    const ease = t * t;
    const x = mix(centerX, destinationX, t * 0.55);
    const y = mix(horizonY, destinationY, t * 0.38);
    const rx = mix(24, width * 0.42, ease);
    const ry = rx * mix(0.18, 0.36, t);
    const alpha = clamp((1 - t) * 0.34 + 0.05, 0.04, 0.32);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = tone;
    ctx.lineWidth = mix(1, 2.4, 1 - t);
    ctx.setLineDash(i % 2 === 0 ? [14, 16] : [4, 12]);
    ctx.lineDashOffset = -sceneTime * 30 - i * 8;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, -0.08, 0, TAU);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  const beam = ctx.createLinearGradient(centerX, horizonY, destinationX, destinationY);
  beam.addColorStop(0, "rgba(94,216,255,0.02)");
  beam.addColorStop(0.56, "rgba(94,216,255,0.24)");
  beam.addColorStop(1, "rgba(255,211,108,0.38)");
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = beam;
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(centerX, horizonY + 4);
  ctx.quadraticCurveTo(width * 0.55, horizonY - height * 0.08, destinationX, destinationY);
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawCockpitDestination(body, x, y, progress) {
  const visual = BODY_VISUALS[body.id] || {
    kind: "cratered",
    palette: [body.accent, body.color, "#161a22", "#ffffff"],
  };
  const texture = visual.texture;
  const entry = texture?.src ? textureCache.get(texture.src) : null;
  const image = entry?.status === "loaded" ? entry.image : null;
  const radius = clamp(width * (0.035 + progress * 0.045), 34, 92);

  ctx.save();
  if (body.ringed) {
    ctx.strokeStyle = visual.ringColor || "#f3d99a";
    ctx.globalAlpha = 0.58;
    ctx.lineWidth = Math.max(2, radius * 0.1);
    ctx.beginPath();
    ctx.ellipse(x, y, radius * 1.95, radius * 0.42, -0.16, 0, TAU);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.18;
  ctx.fillStyle = visual.glow || visual.haze || body.accent;
  ctx.beginPath();
  ctx.arc(x, y, radius * 1.34, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.clip();
  const sphere = image ? getTexturedSphere(image, texture, body, radius, dpr) : null;
  if (sphere) {
    ctx.drawImage(sphere, x - radius, y - radius, radius * 2, radius * 2);
  } else {
    drawPreviewFallback(ctx, x, y, radius, body, visual);
  }
  drawPreviewTerminator(ctx, x, y, radius, Boolean(sphere), visual);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = body.accent;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x, y, radius + 4, -2.7, -0.3);
  ctx.stroke();
  ctx.globalAlpha = 0.34;
  ctx.setLineDash([5, 9]);
  ctx.beginPath();
  ctx.arc(x, y, radius + 14, 0, TAU);
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawCockpitHud(route, destination, vehicle, progress) {
  const duration = formatDuration(route.durationDays);
  const distance = `${Math.round(route.displayDistance)} 万公里`;
  const eta = formatDuration(route.durationDays * (1 - progress));
  const hudLeft = width <= 760 ? 14 : 30;
  const hudTop = width <= 760 ? 138 : 112;
  const hudWidth = width <= 760 ? Math.min(width - 28, 330) : 292;

  ctx.save();
  ctx.font = "700 12px Inter, system-ui, sans-serif";
  roundRect(ctx, hudLeft, hudTop, hudWidth, 116, 8);
  ctx.fillStyle = "rgba(5,8,13,0.48)";
  ctx.fill();
  ctx.strokeStyle = "rgba(94,216,255,0.28)";
  ctx.stroke();
  ctx.fillStyle = "#5ed8ff";
  ctx.fillText("FIRST PERSON", hudLeft + 14, hudTop + 24);
  ctx.fillStyle = "#f5f7fb";
  ctx.font = "800 22px Inter, system-ui, sans-serif";
  ctx.fillText(`前往${destination.name}`, hudLeft + 14, hudTop + 52);

  ctx.font = "700 12px Inter, system-ui, sans-serif";
  drawHudMetric(hudLeft + 14, hudTop + 78, "剩余", eta);
  drawHudMetric(hudLeft + 104, hudTop + 78, "全程", duration);
  drawHudMetric(hudLeft + 194, hudTop + 78, "航程", distance);

  const progressWidth = hudWidth - 28;
  const progressY = hudTop + 102;
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(hudLeft + 14, progressY);
  ctx.lineTo(hudLeft + 14 + progressWidth, progressY);
  ctx.stroke();
  const bar = ctx.createLinearGradient(hudLeft + 14, progressY, hudLeft + 14 + progressWidth, progressY);
  bar.addColorStop(0, vehicle.accent);
  bar.addColorStop(1, "#ffd36c");
  ctx.strokeStyle = bar;
  ctx.beginPath();
  ctx.moveTo(hudLeft + 14, progressY);
  ctx.lineTo(hudLeft + 14 + progressWidth * progress, progressY);
  ctx.stroke();
  ctx.restore();
}

function drawHudMetric(x, y, label, value) {
  ctx.fillStyle = "#aab1c2";
  ctx.fillText(label, x, y);
  ctx.fillStyle = "#f5f7fb";
  ctx.fillText(value, x, y + 18);
}

function drawCockpitCanopy(vehicle) {
  const bottom = height - (width <= 760 ? 86 : 96);
  ctx.save();
  const panel = ctx.createLinearGradient(0, bottom - 60, 0, height);
  panel.addColorStop(0, "rgba(4,6,10,0)");
  panel.addColorStop(0.56, "rgba(4,7,12,0.72)");
  panel.addColorStop(1, "rgba(2,3,7,0.94)");
  ctx.fillStyle = panel;
  ctx.fillRect(0, bottom - 80, width, height - bottom + 90);

  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(width * 0.18, height);
  ctx.quadraticCurveTo(width * 0.34, height * 0.56, width * 0.5, height * 0.42);
  ctx.quadraticCurveTo(width * 0.66, height * 0.56, width * 0.82, height);
  ctx.stroke();

  ctx.strokeStyle = vehicle.accent;
  ctx.globalAlpha = 0.38;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(width * 0.5 - 18, height * 0.48);
  ctx.lineTo(width * 0.5 + 18, height * 0.48);
  ctx.moveTo(width * 0.5, height * 0.48 - 18);
  ctx.lineTo(width * 0.5, height * 0.48 + 18);
  ctx.stroke();

  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = "rgba(255,211,108,0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(width * 0.5, height * 0.48, 34, 0, TAU);
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
}

function renderPlanetPreview() {
  const preview = elements.planetPreview;
  if (state.viewMode === "cockpit") return;
  if (!preview || preview.offsetParent === null) return;
  const previewCtx = preview.getContext("2d");
  const cssWidth = preview.clientWidth || 164;
  const cssHeight = preview.clientHeight || cssWidth;
  const body = bodyById.get(state.destination);
  const visual = BODY_VISUALS[body.id] || {
    kind: "cratered",
    palette: [body.accent, body.color, "#161a22", "#ffffff"],
  };
  const texture = visual.texture;
  const textureEntry = texture?.src ? textureCache.get(texture.src) : null;
  const image = textureEntry?.status === "loaded" ? textureEntry.image : null;
  const radius = Math.min(cssWidth, cssHeight) * (body.ringed ? 0.28 : 0.34);
  const centerX = cssWidth / 2;
  const centerY = cssHeight / 2 - 4;

  updatePlanetPreviewMeta(body);
  previewCtx.clearRect(0, 0, cssWidth, cssHeight);
  const bg = previewCtx.createRadialGradient(centerX * 0.76, centerY * 0.52, 2, centerX, centerY, cssWidth * 0.72);
  bg.addColorStop(0, "rgba(94,216,255,0.18)");
  bg.addColorStop(0.46, "rgba(255,255,255,0.045)");
  bg.addColorStop(1, "rgba(0,0,0,0.26)");
  previewCtx.fillStyle = bg;
  previewCtx.fillRect(0, 0, cssWidth, cssHeight);

  previewCtx.save();
  previewCtx.translate(centerX, centerY);
  previewCtx.strokeStyle = "rgba(255,255,255,0.15)";
  previewCtx.lineWidth = 1;
  previewCtx.beginPath();
  previewCtx.ellipse(0, radius * 0.06, radius * 1.64, radius * 0.44, -0.2, 0, TAU);
  previewCtx.stroke();
  if (body.ringed) {
    previewCtx.strokeStyle = "rgba(243,217,154,0.62)";
    previewCtx.lineWidth = Math.max(2, radius * 0.11);
    previewCtx.beginPath();
    previewCtx.ellipse(0, 0, radius * 1.94, radius * 0.42, -0.2, 0, TAU);
    previewCtx.stroke();
  }
  previewCtx.restore();

  previewCtx.save();
  previewCtx.beginPath();
  previewCtx.arc(centerX, centerY, radius, 0, TAU);
  previewCtx.clip();
  const sphere = image ? getTexturedSphere(image, texture, body, radius, dpr) : null;
  if (sphere) {
    previewCtx.drawImage(sphere, centerX - radius, centerY - radius, radius * 2, radius * 2);
  } else {
    drawPreviewFallback(previewCtx, centerX, centerY, radius, body, visual);
  }
  drawPreviewTerminator(previewCtx, centerX, centerY, radius, Boolean(sphere), visual);
  previewCtx.restore();

  previewCtx.save();
  previewCtx.strokeStyle = visual.glow || visual.haze || body.accent;
  previewCtx.globalAlpha = 0.64;
  previewCtx.lineWidth = 1.5;
  previewCtx.beginPath();
  previewCtx.arc(centerX, centerY, radius + 2, -2.6, -0.38);
  previewCtx.stroke();
  previewCtx.globalAlpha = 0.22;
  previewCtx.beginPath();
  previewCtx.arc(centerX, centerY, radius + 7, 0, TAU);
  previewCtx.stroke();
  previewCtx.restore();
}

function drawPreviewFallback(previewCtx, centerX, centerY, radius, body, visual) {
  const palette = visual.palette || [body.color, body.accent, "#151923", "#ffffff"];
  const gradient = previewCtx.createRadialGradient(
    centerX - radius * 0.42,
    centerY - radius * 0.5,
    radius * 0.08,
    centerX + radius * 0.18,
    centerY + radius * 0.16,
    radius * 1.18,
  );
  gradient.addColorStop(0, palette[3] || palette[0]);
  gradient.addColorStop(0.38, palette[0]);
  gradient.addColorStop(0.78, palette[1] || palette[0]);
  gradient.addColorStop(1, palette[2] || "#10131b");
  previewCtx.fillStyle = gradient;
  previewCtx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);

  if (visual.kind === "gas" || visual.kind === "clouded" || visual.kind === "haze") {
    for (let i = 0; i < 9; i += 1) {
      const y = centerY - radius * 0.72 + i * radius * 0.18;
      previewCtx.globalAlpha = 0.2 + (i % 3) * 0.08;
      previewCtx.fillStyle = palette[i % palette.length];
      previewCtx.fillRect(centerX - radius, y, radius * 2, radius * 0.08);
    }
    previewCtx.globalAlpha = 1;
    return;
  }

  for (let i = 0; i < 14; i += 1) {
    const angle = randomUnit(hashText(body.id) + i * 31) * TAU;
    const distance = radius * 0.76 * Math.sqrt(randomUnit(hashText(body.id) + i * 47));
    previewCtx.globalAlpha = 0.16 + (i % 4) * 0.04;
    previewCtx.fillStyle = palette[i % Math.max(1, palette.length - 1)];
    previewCtx.beginPath();
    previewCtx.ellipse(
      centerX + Math.cos(angle) * distance,
      centerY + Math.sin(angle) * distance,
      radius * (0.08 + (i % 3) * 0.035),
      radius * 0.04,
      angle,
      0,
      TAU,
    );
    previewCtx.fill();
  }
  previewCtx.globalAlpha = 1;
}

function drawPreviewTerminator(previewCtx, centerX, centerY, radius, textured, visual) {
  if (visual.kind === "star") return;
  const shade = previewCtx.createRadialGradient(
    centerX - radius * 0.58,
    centerY - radius * 0.58,
    radius * 0.06,
    centerX + radius * 0.42,
    centerY + radius * 0.3,
    radius * 1.22,
  );
  shade.addColorStop(0, textured ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.16)");
  shade.addColorStop(0.48, "rgba(0,0,0,0)");
  shade.addColorStop(1, textured ? "rgba(0,0,0,0.28)" : "rgba(0,0,0,0.58)");
  previewCtx.fillStyle = shade;
  previewCtx.beginPath();
  previewCtx.arc(centerX, centerY, radius, 0, TAU);
  previewCtx.fill();
}

function drawSpace() {
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#050708");
  bg.addColorStop(0.46, "#020405");
  bg.addColorStop(1, "#010203");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  drawSolarHaze();
  drawMapBands();
  const yawShift = (state.camera.yaw % TAU) / TAU;
  const pitchShift = state.camera.pitch / 8;
  for (const star of stars) {
    const x = wrap(star.x + yawShift * 0.08) * width;
    const y = wrap(star.y + pitchShift) * height;
    ctx.globalAlpha = star.alpha;
    ctx.fillStyle = star.size > 1.1 ? "#f5f2e9" : "#9aa9ad";
    ctx.beginPath();
    ctx.arc(x, y, star.size * 0.72, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  drawGrid();
}

function drawSolarHaze() {
  const sun = project({ x: 0, y: 0, z: 0 });
  const radius = clamp(Math.min(width, height) * 0.28, 180, 420);
  const haze = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, radius);
  haze.addColorStop(0, "rgba(241,183,92,0.16)");
  haze.addColorStop(0.22, "rgba(202,119,44,0.07)");
  haze.addColorStop(0.62, "rgba(106,70,33,0.025)");
  haze.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, width, height);
}

function drawMapBands() {
  ctx.save();
  ctx.globalAlpha = 0.12;
  const dust = ctx.createLinearGradient(width * 0.08, height, width * 0.88, 0);
  dust.addColorStop(0, "rgba(241,183,92,0)");
  dust.addColorStop(0.46, "rgba(241,183,92,0.12)");
  dust.addColorStop(0.68, "rgba(145,200,209,0.07)");
  dust.addColorStop(1, "rgba(145,200,209,0)");
  ctx.fillStyle = dust;
  ctx.beginPath();
  ctx.moveTo(0, height * 0.82);
  ctx.lineTo(0, height * 0.66);
  ctx.lineTo(width, height * 0.18);
  ctx.lineTo(width, height * 0.33);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawGrid() {
  ctx.save();
  ctx.lineWidth = 1;
  for (let laneIndex = 0; laneIndex < guideLanes.length; laneIndex += 3) {
    const lane = guideLanes[laneIndex];
    ctx.strokeStyle = `rgba(187, 198, 202, ${lane.alpha * 0.72})`;
    const points = [];
    for (let i = 0; i <= 96; i += 1) {
      const angle = lane.offset + (i / 96) * TAU;
      const ripple = Math.sin(angle * 3 + lane.radius * 0.04) * 3;
      points.push(project({ x: Math.cos(angle) * (lane.radius + ripple), y: -10, z: Math.sin(angle) * lane.radius }));
    }
    strokeProjectedPath(points);
  }
  ctx.strokeStyle = "rgba(145,200,209,0.045)";
  for (let angle = 0; angle < TAU; angle += TAU / 8) {
    const start = project({ x: Math.cos(angle) * 18, y: -10, z: Math.sin(angle) * 18 });
    const end = project({ x: Math.cos(angle) * 315, y: -10, z: Math.sin(angle) * 315 });
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawOrbits() {
  ctx.save();
  ctx.lineWidth = 1;
  for (const body of BODIES) {
    if (!body.orbitRadius) continue;
    const parentPosition = body.parent ? getBodyPosition(body.parent, state.day) : { x: 0, y: 0, z: 0 };
    const samples = body.parent === "sun" ? 160 : 80;
    const points = [];
    for (let i = 0; i <= samples; i += 1) {
      const angle = (i / samples) * TAU;
      const local = orbitPointAtAngle(body, angle);
      points.push(project(add(parentPosition, local)));
    }
    const active = body.id === state.origin || body.id === state.destination;
    ctx.strokeStyle = active ? "rgba(241,183,92,0.42)" : "rgba(209,220,224,0.14)";
    ctx.globalAlpha = body.parent === "sun" ? (active ? 0.86 : 0.72) : 0.3;
    strokeProjectedPath(points);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawBodies(routeWaypoints) {
  const routeSet = new Set(routeWaypoints);
  screenBodies = BODIES.map((body) => {
    const position = getBodyPosition(body.id, state.day);
    const projected = project(position);
    const radius = getScreenRadius(body, projected);
    return { body, position, projected, radius };
  }).sort((a, b) => b.projected.depth - a.projected.depth);

  for (const item of screenBodies) {
    drawBody(item, routeSet);
  }
  if (state.layers.labels) {
    drawLabels([...screenBodies].sort((a, b) => b.body.priority - a.body.priority), routeSet);
  }
}

function drawBody(item, routeSet) {
  const { body, projected, radius } = item;
  if (!isVisible(projected, radius + 40)) return;
  const selected = body.id === state.selectedBody || body.id === state.destination || routeSet.has(body.id);
  const visual = BODY_VISUALS[body.id] || {
    kind: "cratered",
    palette: [body.accent, body.color, "#161a22", "#ffffff"],
  };

  if (body.ringed) drawRing(projected, radius, visual);
  drawAtmosphere(projected, radius, body, visual, selected);

  ctx.save();
  ctx.beginPath();
  ctx.arc(projected.x, projected.y, radius, 0, TAU);
  ctx.fillStyle = createBodyGradient(projected, radius, visual);
  ctx.fill();
  ctx.clip();

  const textured = drawTextureSurface(projected, radius, body, visual);
  if (!textured) {
    drawBodyTexture(projected, radius, body, visual);
  }
  drawTerminator(projected, radius, visual);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(projected.x, projected.y, radius, 0, TAU);
  ctx.lineWidth = selected ? 2 : 1;
  ctx.strokeStyle = selected ? body.accent : "rgba(255,255,255,0.22)";
  ctx.stroke();
  drawRimLight(projected, radius, visual, selected);
  ctx.restore();

  if (state.layers.stations && body.port && body.id !== "sun") {
    drawPortGlyph(projected, radius, selected);
  }
}

function preloadTextures() {
  for (const visual of Object.values(BODY_VISUALS)) {
    const src = visual.texture?.src;
    if (!src || textureCache.has(src)) continue;
    const image = new Image();
    textureCache.set(src, { image, status: "loading" });
    image.onload = () => {
      textureCache.set(src, { image, status: "loaded" });
    };
    image.onerror = () => {
      textureCache.set(src, { image: null, status: "error" });
    };
    image.src = src;
  }
}

function createBodyGradient(projected, radius, visual) {
  const palette = visual.palette || ["#d8d8d8", "#808080", "#111111", "#ffffff"];
  const gradient = ctx.createRadialGradient(
    projected.x - radius * 0.42,
    projected.y - radius * 0.46,
    Math.max(1, radius * 0.06),
    projected.x + radius * 0.18,
    projected.y + radius * 0.12,
    radius * 1.22,
  );
  gradient.addColorStop(0, palette[3] || palette[0]);
  gradient.addColorStop(0.33, palette[0]);
  gradient.addColorStop(0.7, palette[1] || palette[0]);
  gradient.addColorStop(1, palette[2] || "#10131b");
  return gradient;
}

function drawBodyTexture(projected, radius, body, visual) {
  if (visual.kind === "star") {
    drawSolarTexture(projected, radius, visual, body.id);
    return;
  }
  if (visual.kind === "earth") {
    drawEarthTexture(projected, radius, visual, body.id);
    return;
  }
  if (visual.kind === "gas") {
    drawGasGiantTexture(projected, radius, visual, body.id);
    return;
  }
  if (visual.kind === "mars") {
    drawMarsTexture(projected, radius, visual, body.id);
    return;
  }
  if (visual.kind === "clouded" || visual.kind === "haze") {
    drawCloudedTexture(projected, radius, visual, body.id);
    return;
  }
  if (visual.kind === "ice" || visual.kind === "iceRock") {
    drawIcyTexture(projected, radius, visual, body.id);
    return;
  }
  if (visual.kind === "iceGiant") {
    drawIceGiantTexture(projected, radius, visual, body.id);
    return;
  }
  drawRockyTexture(projected, radius, visual, body.id);
}

function drawTextureSurface(projected, radius, body, visual) {
  const texture = visual.texture;
  if (!texture?.src) return false;
  const entry = textureCache.get(texture.src);
  const image = entry?.status === "loaded" ? entry.image : null;
  if (!image) return false;

  const dx = projected.x - radius;
  const dy = projected.y - radius;
  const size = radius * 2;
  const sphere = getTexturedSphere(image, texture, body, radius, dpr);
  ctx.save();
  ctx.globalAlpha = texture.opacity ?? 0.98;

  if (sphere) {
    ctx.drawImage(sphere, dx, dy, size, size);
    ctx.restore();
    ctx.globalAlpha = 1;
    return true;
  }

  if (texture.projection === "square") {
    const sourceSize = Math.min(image.width, image.height);
    const sx = (image.width - sourceSize) / 2;
    const sy = (image.height - sourceSize) / 2;
    const rotation = resolveTextureSpin(body, texture) * TAU;
    ctx.translate(projected.x, projected.y);
    ctx.rotate(rotation * 0.06);
    ctx.drawImage(image, sx, sy, sourceSize, sourceSize, -radius, -radius, size, size);
    ctx.restore();
    ctx.globalAlpha = 1;
    return true;
  }

  const sourceWidth = image.width * (texture.window || 0.5);
  const spin = resolveTextureSpin(body, texture);
  const sourceX = spin * image.width;
  drawWrappedTextureImage(image, sourceX, sourceWidth, dx, dy, size, size);
  ctx.restore();
  ctx.globalAlpha = 1;
  return true;
}

function getTexturedSphere(image, texture, body, radius, pixelRatio = 1) {
  const source = getTexturePixelSource(image, texture);
  if (!source) return null;
  const diameter = Math.max(24, Math.min(360, Math.round(radius * 2 * Math.min(pixelRatio || 1, 2))));
  const spinSteps = 240;
  const spinBucket = ((Math.round(resolveTextureSpin(body, texture) * spinSteps) % spinSteps) + spinSteps) % spinSteps;
  const key = `${texture.src}|${diameter}|${spinBucket}|${texture.contrast || 1}|${texture.brightness || 1}`;
  const cached = textureSphereCache.get(key);
  if (cached) return cached;

  const sphereCanvas = document.createElement("canvas");
  sphereCanvas.width = diameter;
  sphereCanvas.height = diameter;
  const sphereCtx = sphereCanvas.getContext("2d");
  const sphereData = sphereCtx.createImageData(diameter, diameter);
  const output = sphereData.data;
  const center = (diameter - 1) / 2;
  const radiusPx = diameter / 2 - 0.75;
  const spin = spinBucket / spinSteps;
  const contrast = texture.contrast ?? 1.08;
  const brightness = texture.brightness ?? 1.04;
  const lightX = -0.36;
  const lightY = -0.42;
  const lightZ = 0.83;

  for (let y = 0; y < diameter; y += 1) {
    const ny = (y - center) / radiusPx;
    for (let x = 0; x < diameter; x += 1) {
      const nx = (x - center) / radiusPx;
      const distanceSquared = nx * nx + ny * ny;
      const outIndex = (y * diameter + x) * 4;
      if (distanceSquared > 1) {
        output[outIndex + 3] = 0;
        continue;
      }

      const nz = Math.sqrt(1 - distanceSquared);
      const u = wrap(spin + Math.atan2(nx, nz) / TAU);
      const v = clamp((Math.asin(ny) + Math.PI / 2) / Math.PI, 0, 1);
      const sourceX = Math.floor(u * (source.width - 1));
      const sourceY = Math.floor(v * (source.height - 1));
      const sourceIndex = (sourceY * source.width + sourceX) * 4;
      const diffuse = Math.max(0, nx * lightX + ny * lightY + nz * lightZ);
      const edge = 0.7 + nz * 0.3;
      const light = (0.5 + diffuse * 0.55 + nz * 0.15) * edge * brightness;
      const alpha = Math.min(1, (1 - Math.sqrt(distanceSquared)) / 0.018);

      output[outIndex] = clamp((128 + (source.data[sourceIndex] - 128) * contrast) * light, 0, 255);
      output[outIndex + 1] = clamp((128 + (source.data[sourceIndex + 1] - 128) * contrast) * light, 0, 255);
      output[outIndex + 2] = clamp((128 + (source.data[sourceIndex + 2] - 128) * contrast) * light, 0, 255);
      output[outIndex + 3] = clamp((source.data[sourceIndex + 3] ?? 255) * alpha, 0, 255);
    }
  }

  sphereCtx.putImageData(sphereData, 0, 0);
  textureSphereCache.set(key, sphereCanvas);
  trimTextureSphereCache();
  return sphereCanvas;
}

function getTexturePixelSource(image, texture) {
  if (texturePixelCache.has(texture.src)) return texturePixelCache.get(texture.src);
  try {
    const sourceCanvas = document.createElement("canvas");
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    sourceCanvas.width = sourceWidth;
    sourceCanvas.height = sourceHeight;
    const sourceCtx = sourceCanvas.getContext("2d");
    sourceCtx.drawImage(image, 0, 0, sourceWidth, sourceHeight);
    const imageData = sourceCtx.getImageData(0, 0, sourceWidth, sourceHeight);
    const source = { width: sourceWidth, height: sourceHeight, data: imageData.data };
    texturePixelCache.set(texture.src, source);
    return source;
  } catch (error) {
    texturePixelCache.set(texture.src, null);
    return null;
  }
}

function resolveTextureSpin(body, texture) {
  return wrap((texture.offset || 0) + state.day * (texture.spin || 0) + sceneTime * (texture.liveSpin || 0) + (body.phase || 0) / TAU);
}

function trimTextureSphereCache() {
  if (textureSphereCache.size <= 120) return;
  const removable = textureSphereCache.size - 84;
  let removed = 0;
  for (const key of textureSphereCache.keys()) {
    textureSphereCache.delete(key);
    removed += 1;
    if (removed >= removable) break;
  }
}

function drawWrappedTextureImage(image, sourceX, sourceWidth, dx, dy, dw, dh) {
  const sx = sourceX % image.width;
  if (sx + sourceWidth <= image.width) {
    ctx.drawImage(image, sx, 0, sourceWidth, image.height, dx, dy, dw, dh);
    return;
  }
  const firstWidth = image.width - sx;
  const secondWidth = sourceWidth - firstWidth;
  const firstDestWidth = dw * (firstWidth / sourceWidth);
  ctx.drawImage(image, sx, 0, firstWidth, image.height, dx, dy, firstDestWidth, dh);
  ctx.drawImage(image, 0, 0, secondWidth, image.height, dx + firstDestWidth, dy, dw - firstDestWidth, dh);
}

function drawSolarTexture(projected, radius, visual, seedText) {
  const palette = visual.palette;
  drawWavyBands(projected, radius, [
    { y: -0.55, h: 0.16, color: palette[1], alpha: 0.28, wave: 0.8 },
    { y: -0.25, h: 0.18, color: palette[2], alpha: 0.22, wave: 1.1 },
    { y: 0.06, h: 0.2, color: palette[1], alpha: 0.24, wave: 0.7 },
    { y: 0.4, h: 0.15, color: palette[2], alpha: 0.18, wave: 1.3 },
  ]);
  for (let i = 0; i < visual.activity; i += 1) {
    const spot = featurePoint(seedText, i, radius * 0.86);
    ctx.globalAlpha = 0.2 + randomUnit(hashText(seedText) + i * 13) * 0.18;
    ctx.fillStyle = i % 3 === 0 ? palette[2] : "#fff7b4";
    ctx.beginPath();
    ctx.ellipse(projected.x + spot.x, projected.y + spot.y, radius * (0.08 + spot.u * 0.08), radius * 0.035, spot.a, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawEarthTexture(projected, radius, visual, seedText) {
  const palette = visual.palette;
  const landForms = [
    { x: -0.32, y: -0.08, sx: 0.26, sy: 0.2, rot: -0.45, color: palette[2] },
    { x: 0.22, y: 0.18, sx: 0.22, sy: 0.15, rot: 0.42, color: palette[2] },
    { x: 0.1, y: -0.26, sx: 0.18, sy: 0.12, rot: -0.1, color: "#8db46a" },
    { x: -0.06, y: 0.34, sx: 0.2, sy: 0.09, rot: 0.18, color: palette[3] },
  ];
  for (const form of landForms) {
    drawBlob(projected.x + radius * form.x, projected.y + radius * form.y, radius * form.sx, radius * form.sy, form.rot, form.color, 0.84, 9, hashText(seedText) + form.x * 100);
  }
  ctx.globalAlpha = 0.42;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(0.8, radius * 0.055);
  for (let i = 0; i < visual.clouds; i += 1) {
    const y = projected.y + radius * (-0.62 + i * 0.14);
    ctx.beginPath();
    for (let step = 0; step <= 24; step += 1) {
      const t = step / 24;
      const x = projected.x - radius * 0.82 + t * radius * 1.64;
      const wave = Math.sin(t * TAU * 1.6 + i * 1.9) * radius * 0.045;
      if (step === 0) ctx.moveTo(x, y + wave);
      else ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawMarsTexture(projected, radius, visual, seedText) {
  drawRockyTexture(projected, radius, visual, seedText);
  drawWavyBands(projected, radius, [
    { y: -0.16, h: 0.18, color: visual.dust, alpha: 0.22, wave: 0.9 },
    { y: 0.26, h: 0.14, color: "#74321f", alpha: 0.2, wave: 1.4 },
  ]);
  ctx.globalAlpha = 0.78;
  ctx.fillStyle = visual.palette[3];
  ctx.beginPath();
  ctx.ellipse(projected.x - radius * 0.18, projected.y - radius * 0.78, radius * 0.26, radius * 0.09, -0.15, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawGasGiantTexture(projected, radius, visual, seedText) {
  const palette = visual.palette;
  const bands = [];
  for (let i = 0; i < visual.bands; i += 1) {
    bands.push({
      y: -0.82 + i * (1.64 / Math.max(1, visual.bands - 1)),
      h: 0.12 + (i % 3) * 0.035,
      color: palette[i % (palette.length - 1)],
      alpha: 0.28 + (i % 4) * 0.08,
      wave: 0.7 + (i % 5) * 0.18,
    });
  }
  drawWavyBands(projected, radius, bands);
  if (visual.spot) {
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#b85b37";
    ctx.beginPath();
    ctx.ellipse(projected.x + radius * 0.34, projected.y + radius * 0.18, radius * 0.23, radius * 0.12, -0.18, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = "#fff0ca";
    ctx.lineWidth = Math.max(1, radius * 0.025);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawCloudedTexture(projected, radius, visual, seedText) {
  const palette = visual.palette;
  drawWavyBands(projected, radius, [
    { y: -0.62, h: 0.2, color: palette[3], alpha: 0.22, wave: 1.1 },
    { y: -0.26, h: 0.22, color: palette[1], alpha: 0.28, wave: 0.8 },
    { y: 0.08, h: 0.2, color: palette[3], alpha: 0.2, wave: 1.5 },
    { y: 0.44, h: 0.18, color: palette[2], alpha: 0.24, wave: 1.0 },
  ]);
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = visual.haze || palette[0];
  ctx.beginPath();
  ctx.arc(projected.x, projected.y, radius * 0.96, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawIcyTexture(projected, radius, visual, seedText) {
  if (visual.kind === "iceRock") {
    drawRockyTexture(projected, radius, visual, seedText);
  }
  ctx.globalAlpha = 0.64;
  ctx.strokeStyle = visual.palette[2] || "#9ee9ff";
  ctx.lineWidth = Math.max(0.6, radius * 0.028);
  const count = visual.cracks || 9;
  for (let i = 0; i < count; i += 1) {
    const y = projected.y + radius * (-0.74 + i * (1.48 / count));
    ctx.beginPath();
    for (let step = 0; step <= 9; step += 1) {
      const t = step / 9;
      const x = projected.x - radius * 0.8 + t * radius * 1.6;
      const wave = Math.sin(t * TAU * 1.8 + i * 2.1) * radius * 0.07;
      if (step === 0) ctx.moveTo(x, y + wave);
      else ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawIceGiantTexture(projected, radius, visual, seedText) {
  drawWavyBands(projected, radius, [
    { y: -0.42, h: 0.18, color: visual.palette[2], alpha: 0.16, wave: 1.2 },
    { y: 0.18, h: 0.16, color: "#102a80", alpha: 0.18, wave: 1.5 },
  ]);
  for (let i = 0; i < visual.storms; i += 1) {
    const spot = featurePoint(seedText, i + 20, radius * 0.6);
    ctx.globalAlpha = 0.18 + spot.u * 0.18;
    ctx.fillStyle = i % 2 === 0 ? "#d2fbff" : "#0c1d64";
    ctx.beginPath();
    ctx.ellipse(projected.x + spot.x, projected.y + spot.y, radius * 0.12, radius * 0.045, spot.a, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawRockyTexture(projected, radius, visual, seedText) {
  const palette = visual.palette;
  const baseSeed = hashText(seedText);
  for (let i = 0; i < 12; i += 1) {
    const point = featurePoint(seedText, i + 50, radius * 0.76);
    drawBlob(
      projected.x + point.x,
      projected.y + point.y,
      radius * (0.12 + point.u * 0.12),
      radius * (0.05 + randomUnit(baseSeed + i * 37) * 0.08),
      point.a,
      palette[i % 2 === 0 ? 1 : 2],
      0.16 + point.u * 0.15,
      7,
      baseSeed + i * 19,
    );
  }
  const craterCount = visual.craters || 10;
  for (let i = 0; i < craterCount; i += 1) {
    const point = featurePoint(seedText, i, radius * 0.82);
    const craterRadius = radius * (0.035 + point.u * 0.085);
    ctx.globalAlpha = 0.28 + point.u * 0.2;
    ctx.fillStyle = palette[2] || "#444";
    ctx.beginPath();
    ctx.ellipse(projected.x + point.x, projected.y + point.y, craterRadius * 1.15, craterRadius * 0.76, point.a, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.26;
    ctx.strokeStyle = palette[3] || "#ddd";
    ctx.lineWidth = Math.max(0.5, craterRadius * 0.2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawWavyBands(projected, radius, bands) {
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    const y = projected.y + band.y * radius;
    const h = Math.max(1, band.h * radius);
    ctx.globalAlpha = band.alpha;
    ctx.fillStyle = band.color;
    ctx.beginPath();
    for (let step = 0; step <= 32; step += 1) {
      const t = step / 32;
      const x = projected.x - radius + t * radius * 2;
      const wave = Math.sin(t * TAU * band.wave + index * 1.7) * radius * 0.045;
      if (step === 0) ctx.moveTo(x, y - h / 2 + wave);
      else ctx.lineTo(x, y - h / 2 + wave);
    }
    for (let step = 32; step >= 0; step -= 1) {
      const t = step / 32;
      const x = projected.x - radius + t * radius * 2;
      const wave = Math.sin(t * TAU * band.wave + index * 1.7) * radius * 0.045;
      ctx.lineTo(x, y + h / 2 + wave);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBlob(cx, cy, rx, ry, rotation, color, alpha, points, seed) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i <= points; i += 1) {
    const angle = (i / points) * TAU;
    const wobble = 0.78 + randomUnit(seed + i * 11) * 0.42;
    const x = Math.cos(angle) * rx * wobble;
    const y = Math.sin(angle) * ry * wobble;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawTerminator(projected, radius, visual) {
  if (visual.kind === "star") return;
  const textured = Boolean(visual.texture);
  const shade = ctx.createRadialGradient(
    projected.x - radius * 0.62,
    projected.y - radius * 0.56,
    radius * 0.08,
    projected.x + radius * 0.38,
    projected.y + radius * 0.28,
    radius * 1.18,
  );
  shade.addColorStop(0, textured ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.16)");
  shade.addColorStop(0.45, "rgba(0,0,0,0)");
  shade.addColorStop(1, textured ? "rgba(0,0,0,0.36)" : "rgba(0,0,0,0.72)");
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.arc(projected.x, projected.y, radius, 0, TAU);
  ctx.fill();
}

function drawRimLight(projected, radius, visual, selected) {
  ctx.globalAlpha = selected ? 0.55 : 0.28;
  ctx.strokeStyle = visual.glow || visual.palette?.[3] || "#ffffff";
  ctx.lineWidth = selected ? 1.4 : 0.8;
  ctx.beginPath();
  ctx.arc(projected.x, projected.y, radius + (selected ? 3 : 1.5), -2.7, -0.35);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawAtmosphere(projected, radius, body, visual, selected) {
  const glow = visual.glow || visual.haze || body.accent;
  ctx.save();
  ctx.globalAlpha = visual.kind === "star" ? 0.3 : selected ? 0.2 : 0.11;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(projected.x, projected.y, radius * (visual.kind === "star" ? 1.65 : 1.26), 0, TAU);
  ctx.fill();
  if (visual.kind === "star") {
    ctx.globalAlpha = 0.16;
    ctx.beginPath();
    ctx.arc(projected.x, projected.y, radius * 2.2, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawRing(projected, radius, visual) {
  ctx.save();
  ctx.translate(projected.x, projected.y);
  ctx.rotate(-0.22 + state.camera.yaw * 0.08);
  ctx.strokeStyle = visual.ringColor || "#f3d99a";
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = Math.max(1, radius * 0.16);
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 1.9, radius * 0.48, 0, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 0.2;
  ctx.lineWidth = Math.max(1, radius * 0.36);
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 2.25, radius * 0.58, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawPortGlyph(projected, radius, selected) {
  const x = projected.x + radius + 6;
  const y = projected.y - radius - 6;
  if (!isVisible({ x, y }, 16)) return;
  ctx.save();
  ctx.strokeStyle = selected ? "#ffd36c" : "rgba(94,216,255,0.68)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.rect(x - 5, y - 5, 10, 10);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 8, y);
  ctx.lineTo(x + 8, y);
  ctx.moveTo(x, y - 8);
  ctx.lineTo(x, y + 8);
  ctx.stroke();
  ctx.restore();
}

function drawLabels(items, routeSet) {
  const occupied = [];
  for (const item of items) {
    const { body, projected, radius } = item;
    if (state.viewMode === "destination" && body.id === state.destination) continue;
    if (routeSet.has(body.id)) continue;
    const required = body.priority >= 5 || routeSet.has(body.id) || body.id === state.selectedBody;
    if (!required || !isVisible(projected, radius + 50)) continue;
    const label = body.name;
    ctx.font = `${body.priority >= 8 ? 12 : 11}px Inter, system-ui, sans-serif`;
    const textWidth = ctx.measureText(label).width;
    const rect = {
      x: projected.x + radius + 25,
      y: projected.y - 8,
      w: textWidth + 7,
      h: 18,
    };
    if (occupied.some((box) => intersects(rect, box))) continue;
    occupied.push(rect);

    ctx.save();
    const active = routeSet.has(body.id) || body.id === state.selectedBody;
    ctx.strokeStyle = active ? "rgba(241,183,92,0.62)" : "rgba(222,232,235,0.24)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(projected.x + radius + 4, projected.y);
    ctx.lineTo(rect.x - 7, rect.y + 8);
    ctx.lineTo(rect.x - 2, rect.y + 8);
    ctx.stroke();
    ctx.shadowColor = "rgba(0,0,0,0.92)";
    ctx.shadowBlur = 6;
    ctx.fillStyle = active ? "#f1e5cf" : "#c8d0d3";
    ctx.fillText(label, rect.x, rect.y + 12);
    ctx.restore();
  }
}

function drawRoute(points, route) {
  if (points.length < 2) return;
  const mode = modeById.get(state.mode);
  const vehicle = vehicleById.get(state.vehicle);
  const projected = points.map(project);
  const first = projected[0];
  const last = projected[projected.length - 1];
  const routeTone = ctx.createLinearGradient(first.x, first.y, last.x, last.y);
  routeTone.addColorStop(0, "#91c8d1");
  routeTone.addColorStop(0.58, vehicle.accent);
  routeTone.addColorStop(1, "#f1b75c");
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.strokeStyle = "rgba(0,0,0,0.62)";
  ctx.lineWidth = 10;
  strokeProjectedPath(projected);

  ctx.strokeStyle = routeTone;
  ctx.globalAlpha = 0.16;
  ctx.lineWidth = 8;
  ctx.shadowColor = "#f1b75c";
  ctx.shadowBlur = 18;
  strokeProjectedPath(projected);

  ctx.globalAlpha = 0.92;
  ctx.strokeStyle = routeTone;
  ctx.lineWidth = 3.4;
  ctx.shadowBlur = 10;
  strokeProjectedPath(projected);

  ctx.setLineDash([10, 18]);
  ctx.lineDashOffset = -sceneTime * 58;
  ctx.strokeStyle = mode.id === "fast" ? "#df755d" : "#f7f4eb";
  ctx.globalAlpha = 0.74;
  ctx.lineWidth = 1;
  strokeProjectedPath(projected);
  ctx.restore();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  drawRouteFlow(projected, vehicle);
  drawRouteCallout(projected, route);
}

function drawRouteFlow(projected, vehicle) {
  if (projected.length < 2) return;
  const count = 7;
  ctx.save();
  ctx.shadowColor = "#f1b75c";
  ctx.shadowBlur = 12;
  for (let i = 0; i < count; i += 1) {
    const t = wrap(sceneTime * 0.11 + i / count);
    const point = pointOnProjectedPath(projected, t);
    if (!point || !isVisible(point, 36)) continue;
    const pulse = 0.55 + Math.sin((sceneTime * 3.4 + i) * TAU) * 0.18;
    const radius = 1.8 + point.speed * 1.15;
    ctx.globalAlpha = clamp(pulse, 0.24, 0.82);
    ctx.fillStyle = i % 3 === 0 ? "#f1b75c" : vehicle.accent;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, TAU);
    ctx.fill();
    ctx.globalAlpha *= 0.22;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius * 3.2, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function pointOnProjectedPath(points, progress) {
  let total = 0;
  const lengths = [];
  for (let i = 1; i < points.length; i += 1) {
    const length = distance2(points[i - 1], points[i]);
    lengths.push(length);
    total += length;
  }
  if (!total) return null;
  let target = progress * total;
  for (let i = 1; i < points.length; i += 1) {
    const length = lengths[i - 1];
    if (target > length) {
      target -= length;
      continue;
    }
    const amount = length ? target / length : 0;
    return {
      x: mix(points[i - 1].x, points[i].x, amount),
      y: mix(points[i - 1].y, points[i].y, amount),
      speed: clamp(length / 18, 0.2, 1),
    };
  }
  const last = points[points.length - 1];
  return { x: last.x, y: last.y, speed: 0.2 };
}

function drawRouteCallout(projected, route) {
  if (state.viewMode !== "route" || width <= 760) return;
  const point = projected[Math.floor(projected.length * 0.52)];
  if (!point || !isVisible(point, 90)) return;
  const duration = formatDuration(route.durationDays);
  const distance = `${Math.round(route.displayDistance)} 万公里`;
  const text = `预计 ${duration} · ${distance}`;
  ctx.save();
  ctx.font = "500 11px Inter, system-ui, sans-serif";
  const textWidth = ctx.measureText(text).width;
  const x = clamp(point.x + 18, 14, width - textWidth - 38);
  const y = clamp(point.y - 42, 92, height - 118);
  roundRect(ctx, x, y, textWidth + 22, 30, 3);
  ctx.fillStyle = "rgba(3,5,7,0.88)";
  ctx.fill();
  ctx.strokeStyle = "rgba(241,183,92,0.54)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#dfe5e7";
  ctx.fillText(text, x + 11, y + 19);
  ctx.restore();
}

function drawRoutePins(route) {
  route.waypoints.forEach((id, index) => {
    if (state.viewMode === "destination" && id === state.destination) return;
    const body = bodyById.get(id);
    const projected = project(getBodyPosition(id, state.day));
    const role = index === 0 ? "出发" : index === route.waypoints.length - 1 ? "抵达" : "中继";
    const tone = index === 0 ? "#91c8d1" : index === route.waypoints.length - 1 ? "#f1b75c" : "#a9c6b8";
    drawMapPin(projected, `${role} · ${body.name}`, tone, index === route.waypoints.length - 1);
  });
}

function drawMapPin(projected, label, tone, prominent) {
  if (!isVisible(projected, 70)) return;
  const size = prominent ? 10 : 8;
  ctx.save();
  ctx.shadowColor = tone;
  ctx.shadowBlur = prominent ? 18 : 10;
  ctx.fillStyle = tone;
  ctx.beginPath();
  ctx.arc(projected.x + size * 0.55, projected.y - size * 2.25, size, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(projected.x, projected.y - size * 0.18);
  ctx.lineTo(projected.x + size * 0.08, projected.y - size * 1.55);
  ctx.lineTo(projected.x + size * 1.02, projected.y - size * 1.55);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#080705";
  ctx.beginPath();
  ctx.arc(projected.x + size * 0.55, projected.y - size * 2.25, size * 0.38, 0, TAU);
  ctx.fill();

  ctx.font = "550 11px Inter, system-ui, sans-serif";
  const w = ctx.measureText(label).width + 18;
  const x = clamp(projected.x + size * 1.75, 10, width - w - 10);
  const y = clamp(projected.y - size * 3.5, 84, height - 82);
  roundRect(ctx, x, y, w, 24, 3);
  ctx.fillStyle = "rgba(3,5,7,0.86)";
  ctx.fill();
  ctx.strokeStyle = tone;
  ctx.globalAlpha = 0.78;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#e0e6e8";
  ctx.fillText(label, x + 9, y + 16);
  ctx.restore();
}

function drawShip(routePoints) {
  if (!state.missionActive && state.routeProgress <= 0) return;
  if (routePoints.length < 2) return;
  const index = Math.min(routePoints.length - 1, Math.floor(state.routeProgress * (routePoints.length - 1)));
  const current = routePoints[index];
  const next = routePoints[Math.min(routePoints.length - 1, index + 1)];
  const p = project(current);
  if (!isVisible(p, 24)) return;
  const n = project(next);
  const angle = Math.atan2(n.y - p.y, n.x - p.x);
  const vehicle = vehicleById.get(state.vehicle);

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(angle);
  ctx.fillStyle = vehicle.accent;
  ctx.shadowColor = vehicle.accent;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(-8, -6);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-8, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function buildRoute(day = state.day) {
  const vehicle = vehicleById.get(state.vehicle);
  const mode = modeById.get(state.mode);
  if (state.experienceMode === "real") {
    const waypoints = [state.origin, state.destination];
    const flightDays = Math.min(state.realFlightDays, Math.max(30, 2400 - Math.ceil(day)));
    const realSolution = astrodynamics.solveRoute(state.origin, state.destination, day, flightDays);
    const positions = waypoints.map((id) => getBodyPosition(id, day));
    const sceneDistanceAu = distance3(positions[0], positions[1]) / 70;
    const distanceAu = realSolution?.spanAu || sceneDistanceAu;
    const totalDeltaV = realSolution?.totalDeltaV || 0;
    const riskValue = realSolution ? clamp(Math.round(totalDeltaV * 3.2), 8, 96) : 75;
    return {
      waypoints,
      directDistance: distanceAu * 70,
      distance: distanceAu * 70,
      distanceAu,
      displayDistance: (distanceAu * AU_KM) / 10000,
      durationDays: flightDays,
      windowScore: realSolution ? clamp(Math.round(100 - totalDeltaV * 2.2), 1, 100) : 0,
      scenicScore: 50,
      riskValue,
      riskLabel: riskValue > 68 ? "高" : riskValue > 38 ? "中" : "低",
      transferLabel: "JPL 星历 · Lambert 解算",
      realSolution,
      energyPlan: null,
    };
  }
  const waypoints = resolveWaypoints(state.origin, state.destination, state.mode, vehicle.id);
  const positions = waypoints.map((id) => getBodyPosition(id, day));
  const directDistance = positions.reduce((sum, point, index) => {
    if (index === 0) return sum;
    return sum + distance3(point, positions[index - 1]);
  }, 0);
  const windowScore = calculateWindowScore(state.origin, state.destination, day, state.mode);
  const distance = estimateTransferDistance(waypoints, positions, windowScore);
  const displayDistance = distance * 2.2;
  const rangePenalty = distance > vehicle.range ? (distance - vehicle.range) * 0.12 : 0;
  const durationDays = Math.max(2, (distance / vehicle.speed) * mode.speedMod * (1.15 - windowScore / 500));
  const riskValue = clamp(
    Math.round(24 + distance / 9 + mode.riskMod + rangePenalty - vehicle.comfort / 8),
    5,
    92,
  );
  const route = {
    waypoints,
    directDistance,
    distance,
    displayDistance,
    durationDays,
    windowScore,
    scenicScore: clamp(Math.round(52 + waypoints.length * 9 + mode.scenicMod), 20, 99),
    riskValue,
    riskLabel: riskValue > 68 ? "高" : riskValue > 38 ? "中" : "低",
    transferLabel: resolveTransferLabel(waypoints),
  };
  route.distanceAu = route.distance / 70;
  route.energyPlan = calculateEnergyPlan(route, vehicle);
  if (state.travelMode === "warp") {
    route.durationDays = Math.max(0.5, route.distanceAu * 0.36 + 0.4);
    route.transferLabel = "曲率晶核跃迁";
    route.riskValue = clamp(route.riskValue + 18, 5, 96);
    route.riskLabel = route.riskValue > 68 ? "高" : route.riskValue > 38 ? "中" : "低";
  }
  return route;
}

function calculateEnergyPlan(route, vehicle) {
  const energyId = state.travelMode === "warp" ? "warp" : resolveDeposit(bodyById.get(state.origin)).energyId;
  const energy = ENERGY_TYPES[energyId];
  const vehicleEfficiency = 0.82 + vehicle.comfort / 260;
  const ignition = state.travelMode === "warp" ? 0.35 : 0.08;
  const required = route.distanceAu / (energy.rangeAu * vehicleEfficiency) + ignition;
  return {
    energyId,
    required,
    canAfford: (state.inventory[energyId] || 0) >= required,
  };
}

function resolveDeposit(body) {
  let primary = body;
  while (primary?.parent && primary.parent !== "sun") {
    primary = BODIES.find((candidate) => candidate.id === primary.parent);
  }
  let energyId = "ferrite";
  if (body?.region || primary?.region) {
    energyId = "warp";
  } else if (["mercury", "venus"].includes(primary?.id)) {
    energyId = "helios";
  } else if (["jupiter", "saturn", "uranus", "neptune"].includes(body?.id)) {
    energyId = "storm";
  } else if (body?.family === "卫星" && (primary?.orbitRadius || 0) >= 180) {
    energyId = "cryolite";
  } else if ((primary?.orbitRadius || 0) >= 500) {
    energyId = "warp";
  }
  const seed = [...(body?.id || "sun")].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const reserve = Number((8 + (body?.priority || 1) * 1.7 + (seed % 11) * 0.65).toFixed(1));
  const yieldAmount = Number((0.8 + (seed % 6) * 0.18).toFixed(1));
  return { energyId, reserve, yield: yieldAmount };
}

function estimateTransferDistance(waypoints, positions, windowScore) {
  const phasePenalty = (100 - windowScore) / 100;
  return positions.reduce((sum, point, index) => {
    if (index === 0) return sum;
    const fromBody = bodyById.get(waypoints[index - 1]);
    const toBody = bodyById.get(waypoints[index]);
    const localTransfer = resolvePrimaryBody(fromBody).id === resolvePrimaryBody(toBody).id;
    const curveFactor = localTransfer ? 1.04 : 1.1 + phasePenalty * 0.18;
    return sum + distance3(point, positions[index - 1]) * curveFactor;
  }, 0);
}

function resolveTransferLabel(waypoints) {
  if (waypoints.some((id) => bodyById.get(id)?.region)) return "深空多段转移";
  if (waypoints.length > 2) {
    const assistBodies = new Set(["venus", "earth", "jupiter", "saturn", "uranus", "neptune"]);
    const hasGravityAssist = waypoints.slice(1, -1).some((id) => assistBodies.has(id));
    return hasGravityAssist ? "多段引力辅助" : "多段中继转移";
  }
  const origin = bodyById.get(waypoints[0]);
  const destination = bodyById.get(waypoints[waypoints.length - 1]);
  if (resolvePrimaryBody(origin).id === resolvePrimaryBody(destination).id) return "局部轨道转移";
  return "简化霍曼转移";
}

function resolveWaypoints(origin, destination, mode, vehicleId) {
  const points = [origin];
  const addIfUseful = (id) => {
    if (id !== origin && id !== destination && !points.includes(id)) points.push(id);
  };
  const outerTarget = orbitScale(destination) > 125 || orbitScale(origin) > 125;

  if (mode === "scenic") {
    if (!["earth", "moon"].includes(origin) && destination !== "earth") addIfUseful("earth");
    if (orbitScale(destination) > 150) addIfUseful("jupiter");
    else if (destination !== "venus") addIfUseful("venus");
    if (orbitScale(destination) > 320) {
      addIfUseful("uranus");
      addIfUseful("neptune");
    }
  }

  if (mode === "economy" || vehicleId === "clipper") {
    if (origin === "earth" || destination === "earth") addIfUseful("moon");
    if (outerTarget) addIfUseful("ceres");
    if (orbitScale(destination) > 200) addIfUseful("jupiter");
    if (orbitScale(destination) > 320) addIfUseful("uranus");
  }

  if (mode === "balanced" && outerTarget) {
    addIfUseful("ceres");
    if (orbitScale(destination) > 320) addIfUseful("uranus");
  }
  points.push(destination);
  return points.filter((id, index, arr) => arr.indexOf(id) === index);
}

function getRouteCurvePoints(route) {
  if (state.experienceMode === "real" && route.realSolution) {
    return astrodynamics.sampleTransfer(route.realSolution, 72).map(ephemerisPositionToScene);
  }
  const points = [];
  route.waypoints.forEach((id, index) => {
    if (index === 0) return;
    const from = getBodyPosition(route.waypoints[index - 1], state.day);
    const to = getBodyPosition(id, state.day);
    const segmentPoints = curveBetween(from, to, index, route.waypoints.length);
    if (points.length) segmentPoints.shift();
    points.push(...segmentPoints);
  });
  return points;
}

function curveBetween(from, to, segmentIndex, totalSegments) {
  const mid = scale(add(from, to), 0.5);
  const liftBase = 14 + distance3(from, to) * 0.18;
  const radial = normalize({ x: mid.x || 1, y: 8 + segmentIndex * 3, z: mid.z || 1 });
  const side = segmentIndex % 2 === 0 ? -1 : 1;
  const control = add(mid, {
    x: radial.x * liftBase,
    y: liftBase * 0.22 + totalSegments * 2,
    z: radial.z * liftBase * side,
  });
  const samples = 54;
  const result = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    result.push(quadraticBezier(from, control, to, t));
  }
  return result;
}

function calculateWindowScore(originId, destinationId, day, modeId) {
  const originBody = bodyById.get(originId);
  const destinationBody = bodyById.get(destinationId);
  const originPrimary = resolvePrimaryBody(originBody);
  const destinationPrimary = resolvePrimaryBody(destinationBody);
  const modeBonus = modeId === "fast" ? 6 : modeId === "economy" ? 10 : modeId === "scenic" ? 3 : 8;
  if (originPrimary.id === destinationPrimary.id) {
    const localA = getBodyPosition(originId, day);
    const localB = getBodyPosition(destinationId, day);
    const localDistance = distance3(localA, localB);
    return clamp(Math.round(92 - Math.min(localDistance, 32) * 0.45 + modeBonus * 0.45), 55, 100);
  }

  const radiusA = Math.max(1, originPrimary.orbitRadius);
  const radiusB = Math.max(1, destinationPrimary.orbitRadius);
  const transferDays = estimateHohmannDays(radiusA, radiusB);
  const originAngle = getOrbitalAngle(originPrimary, day);
  const destinationAngle = getOrbitalAngle(destinationPrimary, day);
  const targetPhase = Math.PI - (TAU / Math.max(destinationPrimary.orbitDays, 1)) * transferDays;
  const actualPhase = normalizeSignedAngle(destinationAngle - originAngle);
  const phaseError = Math.abs(normalizeSignedAngle(actualPhase - targetPhase));
  const phaseScore = 98 - (phaseError / Math.PI) * 88;
  return clamp(Math.round(phaseScore + modeBonus), 4, 100);
}

function resolvePrimaryBody(body) {
  if (!body) return bodyById.get("sun");
  if (!body.parent || body.parent === "sun") return body;
  return resolvePrimaryBody(bodyById.get(body.parent));
}

function estimateHohmannDays(radiusA, radiusB) {
  const transferAxisAu = (radiusA + radiusB) / (2 * 70);
  return 182.625 * Math.pow(Math.max(transferAxisAu, 0.08), 1.5);
}

function getOrbitalAngle(body, day) {
  const direction = body.retrograde ? -1 : 1;
  return direction * (day / Math.max(body.orbitDays, 1)) * TAU + (body.phase || 0);
}

function normalizeSignedAngle(angle) {
  return ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

function getBodyPosition(id, day) {
  const body = bodyById.get(id);
  if (!body || body.id === "sun") return { x: 0, y: 0, z: 0 };
  if (state.experienceMode === "real") {
    const ephemerisPosition = getEphemerisBodyPosition(body, day);
    if (ephemerisPosition) return ephemerisPosition;
  }
  const parent = getBodyPosition(body.parent, day);
  const angle = getOrbitalAngle(body, day);
  return add(parent, orbitPointAtAngle(body, angle));
}

function getEphemerisBodyPosition(body, day) {
  const bodyState = astrodynamics.getState(body.id, day);
  if (!bodyState) return null;
  if (body.parent === "sun") return ephemerisPositionToScene(bodyState.positionKm);
  const parentState = astrodynamics.getState(body.parent, day);
  if (!parentState) return ephemerisPositionToScene(bodyState.positionKm);
  const parentPosition = ephemerisPositionToScene(parentState.positionKm);
  const relative = ephemerisPositionToScene(
    bodyState.positionKm.map((value, index) => value - parentState.positionKm[index]),
  );
  const direction = normalize(relative);
  return add(parentPosition, scale(direction, body.orbitRadius || 3));
}

function ephemerisPositionToScene(positionKm) {
  return {
    x: (positionKm[0] / AU_KM) * 70,
    y: (positionKm[2] / AU_KM) * 70,
    z: (positionKm[1] / AU_KM) * 70,
  };
}

function orbitPointAtAngle(body, angle) {
  const r = body.orbitRadius || 0;
  return {
    x: Math.cos(angle) * r,
    y: Math.sin(angle * 1.7 + (body.phase || 0)) * (body.inclination || 0),
    z: Math.sin(angle) * r,
  };
}

function project(point) {
  const center = getProjectionCenter();
  const local = {
    x: point.x - frameCameraTarget.x,
    y: point.y - frameCameraTarget.y,
    z: point.z - frameCameraTarget.z,
  };
  const yaw = state.camera.yaw;
  const pitch = state.camera.pitch;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const x1 = local.x * cosY - local.z * sinY;
  const z1 = local.x * sinY + local.z * cosY;
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  const y1 = local.y * cosP - z1 * sinP;
  const z2 = local.y * sinP + z1 * cosP;
  const depth = z2 + 360;
  const scaleFactor = (420 / Math.max(depth, 80)) * state.camera.zoom;
  return {
    x: center.x + x1 * scaleFactor,
    y: center.y - y1 * scaleFactor,
    depth,
    scale: scaleFactor,
  };
}

function getProjectionCenter() {
  if (width <= 760) {
    return { x: width / 2, y: height * 0.48 };
  }
  if (state.viewMode !== "destination") {
    return { x: width / 2, y: height / 2 };
  }
  const leftPanelRight = 18 + Math.min(390, width - 36);
  const rightPanelLeft = width - 224;
  const mapLeft = leftPanelRight + 36;
  const mapRight = Math.max(mapLeft + 120, rightPanelLeft - 18);
  return {
    x: (mapLeft + mapRight) / 2,
    y: height * 0.48,
  };
}

function resolveCameraTarget(route, routePoints) {
  if (state.viewMode === "destination") {
    return getBodyPosition(state.destination, state.day);
  }
  if (state.viewMode === "route" && routePoints.length) {
    const total = routePoints.reduce((sum, point) => add(sum, point), { x: 0, y: 0, z: 0 });
    return scale(total, 1 / routePoints.length);
  }
  if (state.viewMode === "overview" && route.waypoints.length > 2) {
    const positions = route.waypoints.map((id) => getBodyPosition(id, state.day));
    const total = positions.reduce((sum, point) => add(sum, point), { x: 0, y: 0, z: 0 });
    return scale(total, 1 / positions.length / 3);
  }
  return { x: 0, y: 0, z: 0 };
}

function applyViewMode(mode) {
  syncViewChrome(mode);
  if (mode === "route") {
    setCameraGoal(-0.74, 0.58, 1.22);
    return;
  }
  if (mode === "destination") {
    setCameraGoal(-0.58, 0.46, 3.05);
    return;
  }
  if (mode === "follow") {
    setCameraGoal(-0.22, 0.18, 2.7);
    return;
  }
  if (mode === "cockpit") {
    setCameraGoal(-0.62, 0.18, 1.7);
    return;
  }
  setCameraGoal(-0.82, 0.72, 0.78);
}

function setCameraGoal(yaw, pitch, zoom) {
  state.cameraGoal.yaw = yaw;
  state.cameraGoal.pitch = pitch;
  state.cameraGoal.zoom = zoom;
}

function syncViewChrome(mode) {
  elements.appShell?.classList.toggle("is-cockpit", mode === "cockpit");
  elements.appShell?.classList.toggle("is-follow", mode === "follow");
  elements.viewButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === mode);
  });
}

function getScreenRadius(body, projected) {
  const base =
    body.id === "sun"
      ? 2.45
      : state.viewMode === "destination" && body.id === state.destination
        ? 7.4
        : state.viewMode === "overview"
          ? 2.7
          : 3.55;
  const min = body.family === "卫星" ? 2.7 : 4;
  const max =
    body.id === "sun"
      ? 58
      : state.viewMode === "destination" && body.id === state.destination
        ? width < 980
          ? 112
          : 132
        : state.viewMode === "route" && (body.id === state.origin || body.id === state.destination)
          ? 66
        : body.priority >= 8
          ? 54
          : 38;
  return clamp(body.radius * projected.scale * base, min, max);
}

function pickBody(x, y) {
  const pickedId = webglScene?.pick(x, y);
  let winner = pickedId ? bodyById.get(pickedId) : null;
  if (!winner) {
    let best = Infinity;
    for (const item of screenBodies) {
      const d = Math.hypot(item.projected.x - x, item.projected.y - y);
      if (d < item.radius + 18 && d < best) {
        winner = item.body;
        best = d;
      }
    }
  }
  if (!winner || winner.id === "sun") return;
  state.selectedBody = winner.id;
  state.destination = winner.id === state.origin ? state.destination : winner.id;
  resetMissionNavigation();
  elements.destinationSelect.value = state.destination;
  const placeTab = elements.tabs.find((tab) => tab.dataset.panel === "place");
  placeTab.click();
  syncPanels();
  ensureAstrodynamicsData();
}

function strokeProjectedPath(points) {
  let started = false;
  ctx.beginPath();
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    if (!started) {
      ctx.moveTo(point.x, point.y);
      started = true;
    } else {
      ctx.lineTo(point.x, point.y);
    }
  }
  if (started) ctx.stroke();
}

function isVisible(point, padding = 0) {
  return point.x > -padding && point.x < width + padding && point.y > -padding && point.y < height + padding;
}

function formatDate(day) {
  const date = new Date(BASE_DATE.getTime() + Math.round(day) * 86400000);
  return date.toISOString().slice(0, 10);
}

function formatDuration(days) {
  if (days < 45) return `${Math.round(days)} 天`;
  if (days < 730) return `${(days / 30).toFixed(1)} 月`;
  return `${(days / 365).toFixed(1)} 年`;
}

function featurePoint(seedText, index, maxRadius) {
  const seed = hashText(seedText) + index * 101.37;
  const angle = randomUnit(seed + 1) * TAU;
  const distance = Math.sqrt(randomUnit(seed + 2)) * maxRadius;
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    a: angle + randomUnit(seed + 3) * 0.8,
    u: randomUnit(seed + 4),
  };
}

function hashText(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function randomUnit(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function orbitScale(id) {
  const body = bodyById.get(id);
  if (!body) return 0;
  if (body.parent && body.parent !== "sun") return orbitScale(body.parent);
  return body.orbitRadius;
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(point, factor) {
  return { x: point.x * factor, y: point.y * factor, z: point.z * factor };
}

function normalize(point) {
  const length = Math.hypot(point.x, point.y, point.z) || 1;
  return { x: point.x / length, y: point.y / length, z: point.z / length };
}

function distance3(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function distance2(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function quadraticBezier(a, b, c, t) {
  const inv = 1 - t;
  return {
    x: inv * inv * a.x + 2 * inv * t * b.x + t * t * c.x,
    y: inv * inv * a.y + 2 * inv * t * b.y + t * t * c.y,
    z: inv * inv * a.z + 2 * inv * t * b.z + t * t * c.z,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mix(from, to, amount) {
  return from + (to - from) * amount;
}

function smoothstep(value) {
  const amount = clamp(value, 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function wrap(value) {
  return ((value % 1) + 1) % 1;
}

function intersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function roundRect(context, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + w, y, x + w, y + h, radius);
  context.arcTo(x + w, y + h, x, y + h, radius);
  context.arcTo(x, y + h, x, y, radius);
  context.arcTo(x, y, x + w, y, radius);
  context.closePath();
}

setup();
