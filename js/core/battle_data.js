/* Battle constants: item effects, Z-Moves, Max Moves, special move lists. */
(function (G) {
  'use strict';
  const PW = G.PW = G.PW || {};

  // Type-boosting held items (x1.2): item key -> type name.
  const TYPE_ITEMS = {
    'silk-scarf': 'normal', 'black-belt': 'fighting', 'sharp-beak': 'flying', 'poison-barb': 'poison',
    'soft-sand': 'ground', 'hard-stone': 'rock', 'silver-powder': 'bug', 'spell-tag': 'ghost', 'metal-coat': 'steel',
    'charcoal': 'fire', 'mystic-water': 'water', 'miracle-seed': 'grass', 'magnet': 'electric', 'twisted-spoon': 'psychic',
    'never-melt-ice': 'ice', 'dragon-fang': 'dragon', 'black-glasses': 'dark', 'fairy-feather': 'fairy',
    'sea-incense': 'water', 'wave-incense': 'water', 'odd-incense': 'psychic', 'rock-incense': 'rock', 'rose-incense': 'grass',
    'flame-plate': 'fire', 'splash-plate': 'water', 'zap-plate': 'electric', 'meadow-plate': 'grass', 'icicle-plate': 'ice',
    'fist-plate': 'fighting', 'toxic-plate': 'poison', 'earth-plate': 'ground', 'sky-plate': 'flying', 'mind-plate': 'psychic',
    'insect-plate': 'bug', 'stone-plate': 'rock', 'spooky-plate': 'ghost', 'draco-plate': 'dragon', 'dread-plate': 'dark',
    'iron-plate': 'steel', 'pixie-plate': 'fairy',
  };
  // Damage-halving berries for a super-effective hit of the given type.
  const RESIST_BERRIES = {
    'occa-berry': 'fire', 'passho-berry': 'water', 'wacan-berry': 'electric', 'rindo-berry': 'grass', 'yache-berry': 'ice',
    'chople-berry': 'fighting', 'kebia-berry': 'poison', 'shuca-berry': 'ground', 'coba-berry': 'flying', 'payapa-berry': 'psychic',
    'tanga-berry': 'bug', 'charti-berry': 'rock', 'kasib-berry': 'ghost', 'haban-berry': 'dragon', 'colbur-berry': 'dark',
    'babiri-berry': 'steel', 'roseli-berry': 'fairy', 'chilan-berry': 'normal',
  };
  // Status-curing berries: key -> statuses cured ('conf' = confusion).
  const CURE_BERRIES = {
    'cheri-berry': ['par'], 'chesto-berry': ['slp'], 'pecha-berry': ['psn', 'tox'], 'rawst-berry': ['brn'],
    'aspear-berry': ['frz'], 'persim-berry': ['conf'], 'lum-berry': ['par', 'slp', 'psn', 'tox', 'brn', 'frz', 'conf'],
  };
  // Pinch berries raising a stat at 1/4 HP (stage index).
  const PINCH_BERRIES = { 'liechi-berry': 1, 'ganlon-berry': 2, 'petaya-berry': 3, 'apicot-berry': 4, 'salac-berry': 5 };
  // Confusion-flavour berries healing 1/3 HP at 1/4 HP.
  const FLAVOR_BERRIES = ['figy-berry', 'wiki-berry', 'mago-berry', 'aguav-berry', 'iapapa-berry'];

  const Z_MOVES = {
    normal: 'Breakneck Blitz', fighting: 'All-Out Pummeling', flying: 'Supersonic Skystrike', poison: 'Acid Downpour',
    ground: 'Tectonic Rage', rock: 'Continental Crush', bug: 'Savage Spin-Out', ghost: 'Never-Ending Nightmare',
    steel: 'Corkscrew Crash', fire: 'Inferno Overdrive', water: 'Hydro Vortex', grass: 'Bloom Doom',
    electric: 'Gigavolt Havoc', psychic: 'Shattered Psyche', ice: 'Subzero Slammer', dragon: 'Devastating Drake',
    dark: 'Black Hole Eclipse', fairy: 'Twinkle Tackle',
  };
  const Z_CRYSTALS = {
    'normalium-z': 'normal', 'fightinium-z': 'fighting', 'flyinium-z': 'flying', 'poisonium-z': 'poison',
    'groundium-z': 'ground', 'rockium-z': 'rock', 'buginium-z': 'bug', 'ghostium-z': 'ghost', 'steelium-z': 'steel',
    'firium-z': 'fire', 'waterium-z': 'water', 'grassium-z': 'grass', 'electrium-z': 'electric', 'psychium-z': 'psychic',
    'icium-z': 'ice', 'dragonium-z': 'dragon', 'darkinium-z': 'dark', 'fairium-z': 'fairy',
  };
  function zPower(p) {
    if (p <= 55) return 100; if (p <= 65) return 120; if (p <= 75) return 140; if (p <= 85) return 160;
    if (p <= 95) return 175; if (p <= 100) return 180; if (p <= 110) return 185; if (p <= 125) return 190;
    if (p <= 130) return 195; return 200;
  }

  // Max Moves: type -> [name, effect]. effect: ['self', stage, n] | ['foe', stage, n] | ['weather', w] | ['terrain', t]
  const MAX_MOVES = {
    normal: ['Max Strike', ['foe', 5, -1]], fighting: ['Max Knuckle', ['self', 1, 1]], flying: ['Max Airstream', ['self', 5, 1]],
    poison: ['Max Ooze', ['self', 3, 1]], ground: ['Max Quake', ['self', 4, 1]], rock: ['Max Rockfall', ['weather', 'sand']],
    bug: ['Max Flutterby', ['foe', 3, -1]], ghost: ['Max Phantasm', ['foe', 2, -1]], steel: ['Max Steelspirit', ['self', 2, 1]],
    fire: ['Max Flare', ['weather', 'sun']], water: ['Max Geyser', ['weather', 'rain']], grass: ['Max Overgrowth', ['terrain', 'grassy']],
    electric: ['Max Lightning', ['terrain', 'electric']], psychic: ['Max Mindstorm', ['terrain', 'psychic']],
    ice: ['Max Hailstorm', ['weather', 'snow']], dragon: ['Max Wyrmwind', ['foe', 1, -1]], dark: ['Max Darkness', ['foe', 4, -1]],
    fairy: ['Max Starfall', ['terrain', 'misty']],
  };
  function maxPower(p, type) {
    const weak = type === 'fighting' || type === 'poison';
    if (p <= 40) return weak ? 70 : 90; if (p <= 50) return weak ? 75 : 100; if (p <= 60) return weak ? 80 : 110;
    if (p <= 70) return weak ? 85 : 120; if (p <= 100) return weak ? 90 : 130; if (p <= 140) return weak ? 95 : 140;
    return weak ? 100 : 150;
  }

  const SETS = {
    alwaysCrit: ['frost-breath', 'storm-throw', 'wicked-blow', 'surging-strikes', 'flower-trick', 'zippy-zap'],
    sound: null, // from move flags
    // two-turn moves: key -> {invuln: 'fly'|'dig'|'dive'|'phantom', sun: skip charge in sun, msg}
    charge: {
      'solar-beam': { sun: true, msg: '%s pochłania światło!' }, 'solar-blade': { sun: true, msg: '%s pochłania światło!' },
      'fly': { invuln: 'fly', msg: '%s wzlatuje wysoko!' }, 'bounce': { invuln: 'fly', msg: '%s wyskakuje w górę!' },
      'dig': { invuln: 'dig', msg: '%s zakopuje się w ziemi!' }, 'dive': { invuln: 'dive', msg: '%s nurkuje pod wodę!' },
      'phantom-force': { invuln: 'phantom', msg: '%s znika!' }, 'shadow-force': { invuln: 'phantom', msg: '%s znika!' },
      'sky-attack': { msg: '%s otacza się blaskiem!' }, 'skull-bash': { msg: '%s chowa głowę!', boost: [2, 1] },
      'razor-wind': { msg: '%s wywołuje wichurę!' }, 'meteor-beam': { msg: '%s gromadzi kosmiczną moc!', boost: [3, 1] },
      'electro-shot': { msg: '%s gromadzi elektryczność!', boost: [3, 1], rain: true }, 'freeze-shock': { msg: '%s otacza się lodowatym powietrzem!' },
      'ice-burn': { msg: '%s otacza się mroźnym powietrzem!' }, 'geomancy': { msg: '%s pochłania moc!' },
    },
    recharge: ['hyper-beam', 'giga-impact', 'blast-burn', 'hydro-cannon', 'frenzy-plant', 'rock-wrecker', 'roar-of-time',
      'prismatic-laser', 'eternabeam', 'meteor-assault'],
    rampage: ['outrage', 'thrash', 'petal-dance', 'raging-fury'],
    selfKO: ['explosion', 'self-destruct', 'misty-explosion', 'memento', 'final-gambit', 'healing-wish', 'lunar-dance'],
    protect: ['protect', 'detect', 'kings-shield', 'spiky-shield', 'baneful-bunker', 'obstruct', 'silk-trap', 'burning-bulwark', 'max-guard'],
    weatherMoves: { 'rain-dance': 'rain', 'sunny-day': 'sun', 'sandstorm': 'sand', 'hail': 'snow', 'snowscape': 'snow', 'chilly-reception': 'snow' },
    terrainMoves: { 'electric-terrain': 'electric', 'grassy-terrain': 'grassy', 'misty-terrain': 'misty', 'psychic-terrain': 'psychic' },
    weatherRocks: { sun: 'heat-rock', rain: 'damp-rock', sand: 'smooth-rock', snow: 'icy-rock' },
    groundedImmune: ['levitate'],
    powder: null,
  };

  // Abilities whose effect the engine implements (others are shown but inert).
  const IMPLEMENTED_ABILITIES = new Set(('intimidate drizzle drought sand-stream snow-warning electric-surge psychic-surge grassy-surge ' +
    'misty-surge pressure levitate water-absorb volt-absorb storm-drain lightning-rod motor-drive sap-sipper flash-fire ' +
    'wonder-guard earth-eater well-baked-body soundproof bulletproof dry-skin thick-fat multiscale shadow-shield filter solid-rock ' +
    'prism-armor fur-coat ice-scales heatproof fluffy marvel-scale sturdy battle-armor shell-armor clear-body white-smoke ' +
    'full-metal-body hyper-cutter keen-eye inner-focus own-tempo oblivious limber insomnia vital-spirit sweet-veil immunity ' +
    'water-veil water-bubble magma-armor leaf-guard static flame-body poison-point effect-spore rough-skin iron-barbs ' +
    'synchronize natural-cure regenerator shed-skin speed-boost poison-heal rain-dish ice-body swift-swim chlorophyll ' +
    'sand-rush slush-rush quick-feet compound-eyes no-guard serene-grace skill-link rock-head reckless super-luck sniper ' +
    'moxie beast-boost contrary simple unaware defiant competitive justified rattled steadfast weak-armor stamina magic-guard ' +
    'overcoat sand-force analytic tinted-lens scrappy mold-breaker truant slow-start defeatist pixilate aerilate refrigerate ' +
    'galvanize normalize protean libero prankster gale-wings triage disguise shield-dust huge-power pure-power hustle guts ' +
    'overgrow blaze torrent swarm technician adaptability sheer-force iron-fist strong-jaw mega-launcher tough-claws ' +
    'solar-power steelworker transistor dragons-maw rocky-payload punk-rock purifying-salt gorilla-tactics air-lock cloud-nine ' +
    'run-away shadow-tag arena-trap magnet-pull sharpness intrepid-sword dauntless-shield download water-compaction ' +
    'cotton-down anger-point big-pecks flower-veil swift-swim stench poison-touch toxic-boost flare-boost queenly-majesty ' +
    'dazzling armor-tail mirror-armor good-as-gold thermal-exchange orichalcum-pulse hadron-engine sword-of-ruin tablets-of-ruin ' +
    'vessel-of-ruin beads-of-ruin supreme-overlord unseen-fist infiltrator corrosion comatose costar zen-mode').split(/\s+/));

  PW.BD = {
    TYPE_ITEMS, RESIST_BERRIES, CURE_BERRIES, PINCH_BERRIES, FLAVOR_BERRIES, Z_MOVES, Z_CRYSTALS, zPower,
    MAX_MOVES, maxPower, SETS, IMPLEMENTED_ABILITIES,
    STATUS_PL: { brn: 'BRN', par: 'PAR', slp: 'SLP', psn: 'PSN', tox: 'TOX', frz: 'FRZ' },
    STATUS_NAME: { brn: 'poparzenie', par: 'paraliż', slp: 'sen', psn: 'zatrucie', tox: 'ciężkie zatrucie', frz: 'zamrożenie' },
    WEATHER_PL: { sun: 'Słońce', rain: 'Deszcz', sand: 'Burza piaskowa', snow: 'Śnieg', fog: 'Mgła' },
    TERRAIN_PL: { electric: 'Pole Elektryczne', grassy: 'Pole Trawiaste', misty: 'Pole Mgliste', psychic: 'Pole Psychiczne' },
  };
})(typeof window !== 'undefined' ? window : globalThis);
