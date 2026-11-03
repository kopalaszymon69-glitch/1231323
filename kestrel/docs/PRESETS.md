# Kestrel VA factory programs

The factory bank has 268 programs. In the plug-in's program menu they are grouped into the
sections below (one submenu each). Numbers are the program numbers shown in the menu and in the
host's program list. Every program is a plain-text `.kvp` file in `presets/`; the order and the
sections come from `presets/bank-order.txt`.

Programs 1-23 are the original showcase (angelcore basses, witch house / darkwave, deep house).
Programs 24-268 are the dark / sad / melancholic collection. Every one was set by hand and then
rendered and measured (level, tuning, envelope, brightness, velocity response); see
`docs/STATUS.md`. DWGS names refer to Kestrel's own approximations, not KORG data.


## Init

| # | Program | Description |
|---|---|---|
| 1 | Init Program | Single saw, open filter (all other parameters at their defaults). |

## Angelcore Bass

| # | Program | Description |
|---|---|---|
| 2 | Halo Sub | Clean gliding sine sub with a quiet octave triangle; sits under airy pads. Mono, legato glide. |
| 3 | Seraph Glide | Saturated 808-style sine with long glide and a pitch punch from the filter EG; cross-mod adds grit. |
| 4 | Fallen Reese | Dark detuned unison reese for the 'fallen angel' side; slow LFO2 on cutoff and a light phaser. |
| 5 | Choir Pluck Bass | Bouncy melodic pulse bass with a resonant filter pluck; velocity opens the filter. Retriggering mono. |
| 6 | Nimbus Fold | Airy folded-triangle mid bass; LFO1 moves the fold, the MOD wheel brightens it. Chorus on top. |
| 7 | Gate Halo | Stuttered sub: DWGS SynBass3 approximation with a square sub, gated by tempo-synced LFO2 Square(+) on AMP. |

## Witch House / Darkwave

| # | Program | Description |
|---|---|---|
| 8 | Crypt Choir | Slow VOX-wave choir pad through a band-pass, ensemble and a long cross delay. LFO1 breathes the waveform. |
| 9 | Witch Drone | Heavy unison saw drone, dark low-pass with sample&hold flutter and cross delay; play low and hold. |
| 10 | Hex Bells | Ring-modulated square bells (OSC2 two octaves up, detuned) - the manual's bell recipe, darkened, with ping-pong delay. |
| 11 | Grave Arp | Arpeggiated PWM pluck (Up, 2 octaves, 1/16) with a synced 3/16 delay; hold a minor chord. |
| 12 | Velvet Coffin | Hard-sync lead: the filter EG sweeps OSC2 tune (virtual patch), MOD wheel adds vibrato, short glide. |
| 13 | Black Lace Keys | DWGS E.Piano2 approximation through a dark 12 dB low-pass; velocity opens the filter, LFO2 tremolo, ensemble. |
| 14 | Phantom Organ | Detuned DWGS Organ5 layer: timbre 2 is a pitched-down sine for weight. Phaser, MOD wheel vibrato. (Layer: 2 notes in compatibility mode.) |
| 15 | Ghost Sermon | Vocoder: saw carrier with a little noise, formant shift -1, slow follower; speak/sing into AUDIO IN 1 (left input) and play chords. |

## Deep House

| # | Program | Description |
|---|---|---|
| 16 | Velvet Chord Stab | Classic deep-house chord stab: saw + square through a low-pass pluck, chorus and a synced 1/8 echo. |
| 17 | Late Night EP | DWGS E.Piano1 approximation with velocity on level and tone, gentle LFO2 auto-pan and ensemble. |
| 18 | Warehouse Organ Bass | Short organ-type bass (DWGS Organ4 approximation + sine sub one octave down) with a quick filter blip. |
| 19 | Dub Pluck | Folded-triangle pluck into a band-pass with a long synced cross delay - dub chords. |
| 20 | Deep Sub Pulse | Round 12 dB low-pass saw bass with a soft envelope pluck and key tracking; velocity adds bite. |
| 21 | Sunday Pad | Slow PWM pad: LFO1 modulates the pulse width, OSC2 saw detuned, ensemble. Warm and wide. |
| 22 | Soul Vocoder | Vocoder chords with a VOX-wave carrier, consonant HPF only while keys are held, ensemble. Sing into AUDIO IN 1. |
| 23 | Garage Swing Arp | Swung (+30%) Alt1 arpeggio of a short organ stab with a 5-step pattern (step 4 muted). Hold a 7th chord. |

## Dark Pad

| # | Program | Description |
|---|---|---|
| 24 | Grey Morning | Muted PWM pad: slow LFO1 pulse-width motion, square sub an octave down, soft 12 dB low-pass, slow chorus. |
| 25 | Hollow Cathedral | DWGS Organ7 approximation with a soft triangle octave, slow swell, slow phaser and long L/R echoes. |
| 26 | Lost Signal | Resonant key-tracked OSC1 noise (a ghostly tone) over a low saw; sample & hold flutter on the cutoff. |
| 27 | Winter Breath | Folded triangle with slow fold motion, a second triangle 8 cents sharp and a breath of noise; soft low-pass, long stereo delay. |
| 28 | Minor Haze | Every key is a minor dyad: OSC2 a minor third above (+3 st) and slightly sharp. Dark 24 dB filter, ensemble. |
| 29 | Dead Radio | Saw pad with a ring-modulated OSC2 a fifth up (products on the series an octave below) whose tuning wanders a few cents at random (LFO2 sample & hold); band-pass and phaser, like a station drifting. |
| 30 | Fog Bank | Cross-modulated sine (OSC2 a ninth above) through a soft low-pass; slow swell and a long, deep echo. |
| 31 | Bereavement | Warm, slow saw pad. The filter EG rises over two seconds and settles low; LFO1 slowly shimmers the two-phase saw. Ensemble and a quarter-note cross delay. |
| 32 | Tidal Grief | PWM pad that ebbs: LFO1 moves the pulse width, LFO2 (about 6 s per cycle) pulls the 12 dB low-pass up and down like a tide. Square sub an octave below. |
| 33 | Vigil | Hollow open-fifth pad (triangle plus a triangle a fifth above) with a breath of noise, a slow phaser and half-note echoes. No third, so it stays bleak and medieval. |
| 34 | Ashen Sky | Soft cross-modulated sine pad: OSC2 an octave up adds a faint metallic edge that LFO1 slowly brings in and out. Dark 24 dB filter, wide ensemble. |
| 35 | Underworld Hymn | Layer: a closed saw pad on the left (timbre 1) and a hollow square pad an octave down on the right (timbre 2). 2 + 2 voices in Compatibility mode; set Extended for full chords. |
| 36 | Night Shift | Coldwave pad: two saws 13 cents apart with a little noise. The filter blooms over a second, then settles darker. Lush chorus and dotted L/R echoes. |
| 37 | Lantern Fade | Very soft folded-triangle pad: LFO1 slowly folds the wave so the overtones flicker like a flame; faint triangle an octave up; long release. |
| 38 | Rust Halo | Ring-modulated pad: saw against a square an octave below, which adds a hollow subharmonic and a hard metallic edge while staying in tune. Slow phaser. |
| 39 | Velvet Mourning | Thick, closed pad: a two-phase saw (CONTROL 1 at 64 adds octave weight) over a saw an octave down. Resonant 24 dB low-pass, half key tracking, deep ensemble. |
| 40 | Sleet | Pitched, resonant noise two octaves above the key over a quiet saw body; LFO2 slowly moves the noise filter (patch to OSC1 Control 1) like wind-driven sleet. |
| 41 | Signal Decay | Slow hard-sync pad: LFO1 (about 8 s per cycle) drags the synced OSC2 between roughly a fourth and a minor seventh above, so the overtones creak. Chorus and long echoes. |
| 42 | Gloam | Hollow square pad with a quiet saw a minor seventh above on every key: an unresolved, dusky colour. Keep the voicings sparse. |
| 43 | Autumn Tape | Worn-cassette pad: a slow wow (LFO2 to pitch, a few cents) and a faster flutter (LFO1) on two detuned saws, rolled-off highs, chorus and a dotted echo. |
| 44 | Sunless | Nasal, haunted pad: saw and square sub through a resonant 12 dB band-pass that LFO2 sweeps slowly over half an octave either way. |
| 45 | Widow's Veil | Breathy veil: a sine with slight cross-modulation from OSC2 an octave and a fifth up, plus soft filtered noise that follows the keyboard. Very slow attack and release. |
| 46 | Penumbra | Digital fifth-wave pad (DWGS 5thWave1 approximation) behind a closed 24 dB filter with a slow upward bloom; phaser. |
| 47 | Grey Static | Hissing analog pad: saw with plenty of noise through a resonant low-pass; slow sample & hold nudges the cutoff a few semitones now and then. |
| 48 | Snowblind | Thin, icy pad: two saws an octave apart through a resonant 12 dB high-pass, so only a cold glassy band remains. Wide ensemble, long cross delay. |
| 49 | Deep Water | Sub-heavy, very dark pad: triangle plus a sine-like triangle an octave down under a 24 dB low-pass at full key tracking; LFO2 slowly swells the level like a heavy swell. |
| 50 | Last Light | The light goes out: the filter opens at note-on and slowly closes over about five seconds while LFO1 shimmers the two-phase saw. A quiet fifth (OSC2 +7) shades the top. |
| 51 | Harbor Fog | Layer: timbre 1 is pitched noise breathing through a slow LFO; timbre 2 is a soft saw pad an octave down. Like a foghorn heard through mist. 2 + 2 voices in Compatibility mode. |
| 52 | Cinder | Gritty, smouldering pad: detuned saws into the distortion stage after a dark resonant 24 dB low-pass. Slow attack, phaser. |
| 53 | Oblivion | Huge, slow-evolving pad: shimmering two-phase saw, square sub and a little noise. The filter takes about three seconds to open, LFO2 drifts the pan, and long half-note cross echoes trail it. |
| 54 | Quiet Ruin | Faded vocal pad from the DWGS Voice3 approximation with a saw a fifth below for weight; slow MOD-wheel vibrato; ensemble and a half-note echo. |

## Dark Strings & Choir

| # | Program | Description |
|---|---|---|
| 55 | Funeral Strings | Slow funeral strings: two saws 8 cents apart (one with a two-phase shimmer) under a dark 24 dB low-pass with a slow filter swell and a gentle LFO2 sway. Ensemble and a quarter-note cross delay. |
| 56 | Ash Choir | VOX-wave choir through a resonant band-pass; LFO1 slowly reshapes the waveform. Wide ensemble, half-note cross delay. |
| 57 | Requiem Layer | Layer: VOX choir (timbre 1, left) with a DWGS Voice2 approximation an octave down (timbre 2, right). 2+2 voices in compatibility mode. |
| 58 | Elegy Strings | String-machine ensemble: two saws 8 cents apart through a soft 12 dB low-pass and a full-depth ensemble. Moderate attack; MOD wheel adds vibrato. |
| 59 | Cello Lament | Low, bowed string: saw plus a saw an octave down, tracking 24 dB low-pass, velocity opens the filter. MOD wheel vibrato. Best below middle C. |
| 60 | Requiem Choir | Vox-wave choir whose vowel slowly morphs (LFO1 on CONTROL 1 through CONTROL 2); faint triangle an octave up; full ensemble and a half-note echo. |
| 61 | Monastery | Low male choir an octave down: a darker Vox frame, a slight constant vibrato (LFO2 to pitch, about 5 Hz) and a resonant 24 dB low-pass. Ensemble. |
| 62 | Frozen Violins | High, thin strings: saw plus a slightly flat saw an octave up through a 12 dB high-pass that strips the body. Slow attack, ensemble, long cross delay. Play above middle C. |
| 63 | Dirge Ensemble | Hollow, reedy string machine: a narrow pulse with gentle PWM from LFO1, a 24 dB low-pass and full ensemble. Darker and thinner than Elegy Strings. |
| 64 | Voices from Below | Deep vocal drone from the DWGS Voice1 approximation, an octave down, with a slow swell and a slowly sweeping phaser. |
| 65 | Chapel of Bones | Layer choir: a Vox choir (timbre 1, left) and a quiet DWGS Voice4 approximation an octave up (timbre 2, right) that enters later. 2 + 2 voices in Compatibility mode. |
| 66 | Mourners | An "aah" choir built from a saw through a resonant band-pass that acts as a single formant, with a gentle constant vibrato. Ensemble and a long stereo echo. |
| 67 | Broken Quartet | Strings played by tired hands: each voice gets its own slow random pitch drift of a few cents (LFO1 sample & hold, key-synced per voice), so chords never quite settle. |
| 68 | Swell Strings | Slow crescendo strings: the filter EG takes about two seconds to open and holds, so long notes swell from dark to full. Ensemble, quarter-note echo. |
| 69 | Ghost Choir | Whispered choir: Vox wave mixed with plenty of noise through a band-pass, so the vowels sound breathy and far away. Long cross delay. |
| 70 | Tremolo Dread | Tense horror-film tremolo strings: LFO2 at about 7 Hz chops the level (patch to Amp) on a dark saw ensemble. Best in the low register. |
| 71 | Pale Chorale | Soft vocal chorale from the DWGS Voice2 approximation with a low saw an octave down for body; MOD wheel vibrato; ensemble. |
| 72 | Hymn for the Drowned | Submerged choir: Vox wave over a square two octaves down, under a dark 24 dB low-pass; a slow phaser makes it sway like water. Half-note cross delay. |
| 73 | Black Choir Stack | Monophonic unison choir: all four voices stacked on one Vox note with 30 cents of spread and a little glide. For slow melodies and held drones. |

## Melancholic Keys

| # | Program | Description |
|---|---|---|
| 74 | Rain on Rhodes | Dark DWGS E.Piano3 approximation: velocity on tone, slow tremolo, gentle phaser and a dotted echo. |
| 75 | Old Piano Ghost | DWGS E.Piano4 approximation with a faint saw octave below, darkened; ensemble and a short echo. |
| 76 | Cold Organ | DWGS Organ3 approximation, slightly closed; MOD wheel vibrato and a slow phaser. |
| 77 | Distant Clav | DWGS Clav2 approximation through a narrow band-pass (far-away radio); dotted cross delay. |
| 78 | Midnight Rhodes | Dark electric piano (DWGS E.Piano1 approximation) with a slow stereo auto-pan from LFO2, velocity on level and tone, light chorus. |
| 79 | Faded Wurli | Reedy electric piano (DWGS E.Piano2 approximation) with a gentle amplitude tremolo at about 5 Hz, velocity-sensitive and darkened. |
| 80 | Dusty Upright | Muted hammered-string keys: a saw with a quiet triangle an octave up, a fast filter EG for the hammer and a long natural decay. Velocity shapes the brightness. |
| 81 | Funeral Organ | Church-style organ: DWGS Organ1 approximation plus a 16-foot square an octave down, with a moderate rotating-speaker style chorus. |
| 82 | Chapel Harmonium | Reedy pump organ: a 25 % pulse with a quiet saw an octave below, a short swell-in and a slight constant vibrato. |
| 83 | Toy Piano Requiem | Little metal tines: a sine cross-modulated by OSC2 two octaves up, a quick decay and a long tail. Velocity sets the level. Sounds lonely in the upper octaves. |
| 84 | Harpsichord of Ash | Plucked harpsichord: a narrow pulse plus a saw an octave up, a fast filter decay and no sustain. For slow baroque minor progressions. |
| 85 | Velvet Clav | Soft clavinet (DWGS Clav1 approximation) through a resonant 24 dB low-pass that velocity opens, giving a slow, sulky auto-wah. Phaser. |
| 86 | Lonely Keys | Soft sine electric piano: light cross-modulation from OSC2 an octave up gives a tine edge on hard hits (velocity opens the filter). Chorus and quarter echo. |
| 87 | Cassette Piano | Lo-fi electric piano (DWGS E.Piano3 approximation) with tape wow (LFO2 on pitch at about 0.4 Hz), cut highs and a dotted echo. |
| 88 | Empty Hall Organ | Organ heard from the back of an empty hall: DWGS Organ5 approximation through a band-pass, with long, soft L/R echoes. |
| 89 | Melancholy EP | Rounder electric piano (DWGS E.Piano2 approximation) with a slightly flat triangle octave for shimmer, gentle tremolo and velocity response. |
| 90 | Glass Harmonica | Rubbed-glass tone: a pure sine with a faint triangle an octave up, a soft 50 ms attack and a gentle 3 Hz vibrato from LFO2. Long release. |
| 91 | Cold Keys | Coldwave poly keys: a hollow square with a quiet saw an octave up, a resonant 24 dB low-pass that snaps shut, velocity on tone. Chorus. |
| 92 | Tear-Stained EP | FM-style electric piano: velocity drives the cross-modulation depth (patch to OSC1 Control 1), so soft notes are pure and hard notes ring metallic. Long decay. |
| 93 | Old Reed Organ | Wheezy reed organ: narrow pulse plus a square an octave up, a breath of noise, slight vibrato and a soft swell. Sounds like a village church at dusk. |
| 94 | Night Bus Wurli | Gritty electric piano (DWGS E.Piano4 approximation) pushed gently into the distortion stage after a dark low-pass; slow phaser. Velocity adds bite. |
| 95 | Requiem Piano | Hollow piano-like keys: a gently folded triangle over a quiet saw an octave down, a struck filter envelope and a long decay. Velocity on level and tone. |
| 96 | Sombre Clavinet | Muted clavinet (DWGS Clav2 approximation) with a slightly resonant low-pass, velocity on tone and an eighth-note echo. For slow, sulky funk-noir lines. |
| 97 | Dim Lounge Organ | Smoky drawbar-style organ (DWGS Organ2 approximation) through a rotary-like chorus at about 1.3 Hz. Instant attack, short release. |
| 98 | Felt Piano 3 AM | Felted, intimate piano: a triangle and a quiet saw an octave down, a very short bright filter "hammer" that falls to dark, long decay. Velocity on level and tone. |
| 99 | Last Waltz Organ | Fairground organ past its prime: DWGS Organ6 approximation with a saw an octave up tuned a few cents flat, ensemble and a short echo. |

## Dark Bells

| # | Program | Description |
|---|---|---|
| 100 | Broken Music Box | Worn music box: DWGS Bell1 approximation with a triangle octave 13 cents flat and a slight pitch warble; quarter-note echo. |
| 101 | Glass Tears | FM-like glassy bell: sine cross-modulated by OSC2 a ninth-plus-octave above; long decay, L/R echoes. |
| 102 | Funeral Bell | Large low bell: an FM sine whose partials (OSC2 an octave up, about 8 cents sharp, so they beat slowly) die away faster than the body, because the amp EG also drives the cross-modulation. Very long decay. |
| 103 | Dead Chime | Dull, muted chime (DWGS Bell2 approximation) behind a low-pass, with a long decay and dotted-quarter cross echoes. |
| 104 | Tower at Dusk | Church-tower bell: a brighter FM strike (OSC2 three times the pitch, plus a few cents) that mellows as it decays. Half-note echoes like the square below. |
| 105 | Glass Coffin | Cold, high glass bell: a sine with a light, slightly inharmonic FM partial about four times the pitch, medium decay and long stereo echoes. |
| 106 | Rusted Gamelan | Clangy metallophone: a triangle ring-modulated by a square a fifth up. The sum and difference tones sit on the series an octave below the key, so it stays in key but sounds hollow and gong-like. Band-pass, medium decay. |
| 107 | Snow Globe | Small, sad music box: a triangle with a faint triangle two octaves up, a quick plucked decay, a soft high cut and ping-pong eighths. |
| 108 | Hollow Vibes | Vibraphone after hours: a sine with a quiet triangle an octave up, motor tremolo at about 5 Hz (LFO2 to Amp), long decay, velocity. |
| 109 | Mourning Marimba | Soft, dark wooden mallet: a triangle with a hint of fold, a fast-closing 24 dB filter and a short decay. Velocity on level and tone. |
| 110 | Iron Bell Tolls | Heavy iron bell an octave down (DWGS Bell3 approximation): a dark strike, a decay of several seconds and half-note echoes. |
| 111 | Celesta of Sorrow | Celesta-like bell keys: DWGS Bell4 approximation with a quiet triangle an octave up, medium decay, chorus and a quarter-note echo. |
| 112 | Moonlit Kalimba | Thumb-piano pluck: a sine with a short burst of cross-modulation (amp EG to CONTROL 1) from OSC2 an octave and a fifth up, short decay, dotted echoes. |
| 113 | Ghost Carillon | Layered bells: an FM bell (timbre 1, left) over a quiet DWGS Bell1 approximation an octave down (timbre 2, right). 2 + 2 voices in Compatibility mode. |
| 114 | Cracked Bell | Cracked bell: a triangle ring-modulated by a square an octave up but about 25 cents sharp. One ring partial sits just above the root and beats against it a few times a second, the rough wobble of a cracked casting. Long decay. |
| 115 | Ice Tines | Brittle tines: a sine with a strong but quickly fading FM partial just over four times the pitch, wide ensemble and long cross echoes. |

## Sad Pluck

| # | Program | Description |
|---|---|---|
| 116 | Wilted Pluck | Saw + square sub pluck that closes quickly in a resonant 24 dB filter; dotted-sixteenth echoes. |
| 117 | Shiver Pluck | Folded triangle into a resonant band-pass; fast sample & hold shivers on the cutoff. |
| 118 | Cracked Harp | DWGS Guitar2 approximation with a faint ring-modulated octave (slightly sour); ensemble, quarter echo. |
| 119 | Bitter Drops | Narrow pulse through a ringing 12 dB low-pass: water-drop plucks bouncing in an L/R delay. |
| 120 | Silent Koto | DWGS Guitar1 approximation, plucked and dark, with a long dotted-quarter cross delay. |
| 121 | Teardrop | A falling drop: a triangle pluck whose pitch slides down about half a semitone in the first 30 ms (filter EG to pitch), with dotted-sixteenth cross echoes. |
| 122 | Paper Lanterns | Classic soft saw pluck: two detuned saws through a resonant 12 dB low-pass with a quick EG; chorus and dotted echoes. Velocity opens the filter. |
| 123 | Faded Polaroid | Lo-fi pluck: a pulse with a little noise, a fast 24 dB filter decay, slow tape wow on pitch and rolled-off highs. Dotted echo. |
| 124 | Rain on Glass | Tiny high plucks: an FM sine whose brightness follows the short amp envelope, bouncing left and right in eighth-note echoes. Play in the upper octaves. |
| 125 | Bitter Harp | Plucked harp (DWGS Guitar3 approximation) with a long natural decay, light ensemble and a quarter-note echo. Velocity on level. |
| 126 | Sorrow Mandolin | Tremolo-picked mandolin: two saws a few cents apart, a plucky filter and LFO2 at about 9 Hz chopping the level while the note fades. |
| 127 | Hollow Bones | Woody, knocking pluck: the triangle wavefold follows the amp envelope (patch to CONTROL 1), so each note starts folded and bright and decays to a pure tone. |
| 128 | Cold Fingers | Nylon-string-like pluck: a narrow pulse through a softly resonant 24 dB low-pass with a quick EG and a natural decay. Velocity on tone and level. |
| 129 | Hush Pluck | Very soft, close pluck: a triangle with a little breath noise, a 12 dB low-pass and a long, quiet cross-delay tail. For sparse late-night melodies. |
| 130 | Ghost Pizzicato | Plucked strings for creeping horror cues: two slightly detuned saws, a very short filter snap and decay, ensemble. |
| 131 | Dark Dulcimer | Hammered double course: two saws 8 cents apart that beat like paired strings, a struck 12 dB filter and a long decay. |
| 132 | Static Pluck | A burst of noise rides on each pluck (amp EG to noise level), over a triangle body: like a scratchy old record. Short, dry and a little broken. |
| 133 | Minor Shard | Every key plucks a minor third: OSC2 is a saw three semitones above OSC1. Resonant 24 dB filter snap, dotted echoes. One finger plays a sad melody in thirds. |
| 134 | Fifth Shadow | Dark power pluck: a square with a square a fourth below (a fifth an octave down) for a heavy, hollow shadow; closing 24 dB filter. |
| 135 | Cave Drips | Ringing band-pass drips with very wet ping-pong echoes: a pulse excites a resonant 12 dB band-pass that tracks the keyboard. |
| 136 | Ember Pluck | Gritty, burnt pluck: a saw with a square sub through a fast 24 dB filter into the distortion stage. Short echo. |
| 137 | Velvet Pluck | Rounded, slightly sustaining pluck: square plus sub, a gently resonant 24 dB filter and a small sustain, so held notes linger quietly. Chorus. |
| 138 | Wilted Rose | The two-phase saw's octave content follows the amp envelope (patch to CONTROL 1), so each note blooms an octave-bright edge that wilts as it fades. |

## Dark Lead

| # | Program | Description |
|---|---|---|
| 139 | Lament Lead | Mono crying saw lead: slight detune, glide, MOD wheel vibrato at about 5 Hz, quarter echo and light chorus. |
| 140 | Ghost Whistle | Self-oscillating filter played as a whistle: resonance 127, cutoff 52 tracks the keyboard 1:1 (KEY TRACK +48) and sits in tune; a breath of noise excites it. Mono with glide. |
| 141 | Sorrow Sync | Hard-sync lead whose overtones sweep slowly with LFO1 (patch to OSC2 Tune); mono with glide, eighth echo. |
| 142 | Dirge Flute | Breathy triangle flute: noise breath, soft low-pass, delayed vibrato on the MOD wheel, glide. |
| 143 | Bleeding Vox | Narrow VOX-wave lead in a resonant band-pass that sways on LFO2; mono glide, dotted cross delay. |
| 144 | Weeping Saw | Mono saw lead with glide, a faint constant vibrato and more vibrato on the MOD wheel. Gently resonant 24 dB filter; dotted cross echoes and light chorus. |
| 145 | Siren of Grief | Pulse lead with very long glide (about half a second), so every interval wails. Bend range is an octave. Soft 12 dB filter and half-note echoes. |
| 146 | Violin Ghost | Bowed solo string: a saw with a 60 ms bow attack, a constant 5.5 Hz vibrato, a resonant 24 dB filter and velocity on brightness. Light glide between legato notes. |
| 147 | Theremin Requiem | Eerie sine lead: long glide, a soft attack and a wide constant vibrato (about 19 cents at 5.5 Hz). Long stereo echo. |
| 148 | Cold Sync Lead | Hard-sync lead whose overtone peak sweeps down at every note (filter EG to OSC2 Tune), behind a dark 24 dB filter. Mono with short glide. |
| 149 | Black Velvet Lead | Thick legato lead: two saws 13 cents apart, a resonant 24 dB filter, single trigger with glide so slurred notes stay smooth. Chorus and quarter echo. |
| 150 | Lonely Square | Hollow square-wave lead (50 % pulse, odd harmonics only) through a soft 12 dB filter. MOD wheel vibrato; quarter-note cross echoes. |
| 151 | Rust Lead | Corroded lead: a saw and a square sub through a resonant 24 dB filter into the distortion stage. Glide, eighth-note echo. |
| 152 | Phantom Oboe | Reedy double-reed lead: a narrow pulse through a resonant band-pass, a 30 ms attack and a small constant vibrato. Mournful in the middle register. |
| 153 | Dying Star | Unison saw lead (all voices on one note, 20 cents spread) whose filter slowly closes over about five seconds while held. Slow vibrato on the MOD wheel. |
| 154 | Hollow Whistle | Breathy whistle from OSC1 Noise: its resonant filter is set to the key pitch (CONTROL 1 = 24) with high resonance, so the noise sings the note. Glide and echo. |
| 155 | Funeral Trumpet | Muted brass lead: a saw whose filter EG swells in over 60 ms and settles, like a soft trumpet attack; velocity on brightness; MOD wheel vibrato. |
| 156 | Sad Robot | Robotic lead: a saw ring-modulated by a square an octave up (in tune, but hollow and metallic) through a 24 dB filter. Glide; MOD wheel vibrato. |
| 157 | Wraith | Vocal lead: Vox wave whose vowel drifts slowly (LFO1 on CONTROL 1), long glide, constant vibrato. A ghostly voice singing wordlessly. |
| 158 | Needle in the Dark | Thin, piercing lead: a narrow pulse through a resonant 12 dB high-pass, so only a cold needle of sound remains. Ping-pong echoes. |
| 159 | Lament Fifths | Medieval doubled lead: every note sounds with a square a fourth below it (G under C), like parallel organum. Saw and square, soft filter, glide. |
| 160 | Pan Pipe Dusk | Breathy pipe: a triangle with a chiff of noise at each attack (amp EG to noise level) and a quieter steady breath, slow vibrato and a soft low-pass. |
| 161 | Grave Solo | Baritone lead for low melodies: a saw plus a square an octave down, a resonant 24 dB filter with a short bloom and a little glide. |
| 162 | Mirror Lead | Slowly evolving FM lead: LFO1 (about 4 s per cycle) moves the cross-modulation depth of a sine by OSC2 an octave up, so the tone glints and dulls as you hold it. |
| 163 | Unison Lament | Wide, heavy unison saw lead (40 cents spread over all voices) with glide and a dark 24 dB filter. For slow, crushing melodies. |

## Dark Bass

| # | Program | Description |
|---|---|---|
| 164 | Undertow Bass | Deep sine + triangle sub with gentle distortion and glide; for slow, heavy lines. |
| 165 | Black Velvet Bass | Round saw bass, low cutoff with a soft envelope bloom; mono retrigger. |
| 166 | Mourning Reese | Wide unison reese with a square sub; LFO2 slowly breathes the cutoff, light phaser. |
| 167 | Grave Dweller | DWGS SynBass5 approximation with a square sub and a resonant 12 dB low-pass blip; mono retrigger. |
| 168 | Pulse of Regret | Slowly breathing PWM bass (LFO1 on pulse width) in a low 24 dB filter. |
| 169 | Abyss Sub | Pure, clean sine sub bass: mono, short glide, instant attack and a short release. Sits under anything. |
| 170 | Sorrow 808 | Sad-trap 808: a sine that drops about a semitone in its first 60 ms (filter EG to pitch), a long decaying tail and light saturation. Legato glide for slides. |
| 171 | Doom Reese | Slow, heavy reese: unison saws (30 cents spread) plus a second saw about 19 cents sharp (the whole patch is tuned down 12 cents so it centres on the note), under a low 24 dB filter; a slow phaser makes it churn. |
| 172 | Coldwave Bass | Post-punk picked bass: saw plus square sub, a resonant 24 dB filter with a quick pick transient, retriggered on every note. Velocity on tone. |
| 173 | Crypt Pulse | Pulse-width-modulated bass: LFO1 slowly widens and narrows the pulse, so long notes breathe. Dark 24 dB filter, mono. |
| 174 | Funeral Organ Bass | Pedal-organ bass: the DWGS Organ4 approximation an octave down, steady sustain and a short release. For slow chord roots. |
| 175 | Acid Mourning | Dark acid line: a saw through a very resonant 24 dB filter with a snappy EG, legato glide between overlapping notes and velocity accents on the cutoff. |
| 176 | Tar Pit | Thick, distorted square sub: a hollow square with an octave-down square, a low 24 dB filter, then the distortion stage. Heavy and sticky. |
| 177 | Wobble of Regret | Slow, tempo-synced wobble: LFO1 (triangle, one cycle per half note) sweeps the 24 dB filter an octave either way on a saw and square bass. Restarts on every note. |
| 178 | Hollow Fifth Bass | Power-fifth bass: saw plus a saw a fifth above under a low 24 dB filter, so each note is a dark, open "power chord" root. |
| 179 | Midnight Fingers | Fingered electric bass: a lightly folded triangle with a quiet saw, a soft pluck in the filter and a steady sustain. Velocity on level and tone. |
| 180 | Sub Drone Bass | Poly drone bass: a sine with a triangle an octave down, a slow swell and a long release, for held low notes and ballad roots. |
| 181 | Ghost Slap | Muted slap bass (DWGS Bass2 approximation): a snappy, velocity-sensitive low-pass and a short decay into a quiet sustain. |
| 182 | Velvet Rope | Round, warm bass from the DWGS Bass4 approximation with a triangle sub an octave down; soft 24 dB filter, slight glide. |
| 183 | Black Mass Bass | Growling bass: a triangle ring-modulated by a square an octave down adds a hollow subharmonic snarl; resonant low 24 dB filter and distortion. |
| 184 | Dread Sync Bass | Snarling sync bass: the filter EG sweeps the synced OSC2 down at every note, under a resonant 24 dB low-pass. Retriggers per note. |
| 185 | Grief Glide | Sliding sub bass: a sine and a quiet triangle an octave up with a long glide (about 0.15 s), for slow, mournful bass slides. Play legato. |
| 186 | Darkwave Sequencer Bass | Tight, punchy saw bass for eighth-note sequences: quick filter EG with resonance, short decay, every note retriggered. |
| 187 | Low Choir Bass | Ghostly sung bass: Vox wave an octave down under a 24 dB low-pass, mono with a little glide and a slow swell. |
| 188 | Rubber Sorrow | Rubbery bass: a square with a tiny pitch blip at the attack (filter EG to pitch, about 20 cents) and a resonant filter pluck. |
| 189 | Muffled Heart | Heartbeat bass: a sine with a fast downward pitch thump (about 5 semitones over 30 ms) and a short body. Play two notes close together for a heartbeat. |
| 190 | Iron Lung | Breathing machine bass: a saw and square sub whose level and cutoff rise and fall together on a slow LFO2 (about 2.5 s per breath). For held notes. |
| 191 | Deep Reed Bass | Reedy contrabassoon-like bass: a narrow pulse with a square an octave below through a gently resonant 24 dB filter. Mono. |
| 192 | Undertaker | Solid synth bass from the DWGS SynBass1 approximation with a square sub, a dark 24 dB filter and gentle distortion. |
| 193 | Fog Bass | Soft, polyphonic triangle bass with a gentle 30 ms attack and a medium release, for ballads and slow chord roots. Light ensemble. |
| 194 | Collapse | Unison saw bass (16 cents spread) that starts open and collapses into a dark sub over about two seconds of held note. |

## Dark Drone

| # | Program | Description |
|---|---|---|
| 195 | Static Elegy | Broad unison saw drone (40 cents spread) with noise; the resonant low-pass is nudged a few semitones at random by sample & hold. Long cross delay and a slow phaser. Hold one low note. |
| 196 | Abandoned Station | Hollow ring-modulated drone: a triangle against a square an octave below (in key, with a subharmonic), whose tuning LFO2 slowly pulls a few tens of cents sharp and back, so it beats uneasily. Band-pass and long echoes. |
| 197 | Night Tide | Filtered OSC1 noise like distant surf: LFO2 sweeps the noise cutoff (patch to OSC1 Control 1). Hold any note. |
| 198 | Rust Drone | Unison hard-sync drone: LFO1 slowly drags the synced overtones, light distortion, low-pass. |
| 199 | Endless Descent | Shepard tone that seems to fall forever: the DWGS Endless approximation with a falling LFO1 saw on pitch spanning about one octave; the octave-spaced spectrum hides the wrap. The fall is slower mid-cycle (pitch-mod curve). |
| 200 | Catacomb Hum | Low resonant hum: unison saws with a little noise into a 24 dB low-pass with high resonance, so a single filter tone rings above the drone. Very slow phaser. Hold a low note. |
| 201 | Wind Through Ruins | Howling wind from noise only: a resonant 12 dB low-pass swept slowly by LFO2 over about an octave and a half each way, while LFO1 drifts the wind across the stereo field. Any key. |
| 202 | Distant Engine | Rumbling machine drone: a square two octaves down and a saw an octave down, with a fast tremble (LFO2 to Amp at about 7 Hz) under a low filter. |
| 203 | Cathedral Ghost Tone | A sine and a soft triangle a fifth above that take about eight seconds to fade in and as long to fade out, with deep cross echoes. Play one note and wait. |
| 204 | Shortwave Ghosts | Untuned radio: a hard-synced OSC2 whose tuning jumps randomly (LFO1 sample & hold) through a band-pass, with noise. Squeals and murmurs over a held note. |
| 205 | Black Ice | Cold whistling drone: saws through a resonant 12 dB high-pass that LFO2 sweeps slowly, leaving a thin, icy ring. Wide ensemble. |
| 206 | Subterranean | Crushing low drone: unison squares spread 50 cents, a very low 24 dB filter and distortion. The beating of the unison voices makes it shudder. |
| 207 | Hollow Earth | Evolving FM drone: LFO1 (about 10 s per cycle) moves a deep cross-modulation of a sine by OSC2 an octave up, so the tone slowly hardens and softens. |
| 208 | Choir of Machines | Metallic choir drone: a Vox wave ring-modulated by a square a fifth up (the products sit on the series an octave below), with a slow vowel drift and phaser. |
| 209 | Tidewater Drone | Layer: surf-like filtered noise that swells and recedes (timbre 1) over a sine-and-triangle sub drone (timbre 2). 2 + 2 voices in Compatibility mode. |
| 210 | Haunted Frequency | Numbers-station drone: a self-oscillating filter excited by faint noise, its pitch stepping at random (LFO1 sample & hold, about once a second) up to an octave either way. Atonal on purpose. |
| 211 | Dread Pulse | Pulsing drone in tempo: LFO2 (unipolar square, one cycle per quarter note) gates the level of a dark saw drone, like a slow, ominous heartbeat machine. |
| 212 | Grief Engine | Grinding sync drone: LFO1 very slowly drags the synced OSC2 (patch to OSC2 Tune) through a resonant 24 dB filter, while a slow phaser turns it. |
| 213 | Ether Bed | Soft background bed: a triangle with a little noise, a 12 dB low-pass, full-depth ensemble and a long cross delay; about three seconds to fade in. |
| 214 | Pale Horizon | A very slow dawn that never quite arrives: the filter EG takes about eight seconds to open a sine and a quiet saw an octave and a fifth up. |
| 215 | Moth Wings | Fluttering texture: LFO2 at about 12 Hz flutters the level of a folded triangle, while LFO1 slowly changes the fold. Soft and nervous. |
| 216 | Rotting Organ | Decayed organ drone: DWGS Organ7 approximation with slow random pitch drift of a few cents (LFO1 sample & hold), light distortion and a slow phaser. |
| 217 | Void Tone | Almost nothing: a deep sine with a slow, wide tremolo (about 4 s per cycle) and a long echo. A minimal bed for the emptiest moments. |

## Dark Arp

| # | Program | Description |
|---|---|---|
| 218 | Rain Arp | Falling arpeggio (Down, 2 octaves, 1/16) of a dark bell pluck with dotted cross echoes. Hold a minor chord. |
| 219 | Memory Arp | Triplet Alt2 arpeggio of a dark electric piano; slow and wistful. |
| 220 | Requiem Steps | Up arpeggio with a broken 7-step pattern (steps 3 and 6 muted) of a folded-triangle pluck; heavy dotted echo. |
| 221 | Lullaby for None | Random-order arpeggio of a music-box bell with a slightly flat octave at 1/8 with a long L/R echo; never quite repeats. |
| 222 | Midnight Carousel | Slowly turning carousel: an Up arpeggio over two octaves in sixteenths of a dull bell (DWGS Bell2 approximation), with dotted cross echoes. Hold a minor chord. |
| 223 | Falling Ash | Triplet Down arpeggio over three octaves: soft triangle plucks drifting downward like ash, with a long stereo echo. |
| 224 | Clockwork Grief | Mechanical Alt1 arpeggio in swung sixteenths: a hollow square pluck with a snappy filter. Ticks along like a sad automaton. |
| 225 | Rain Sequence | Random-order sixteenths over two octaves: short FM droplets (amp EG drives the cross-modulation) scattered left and right by an L/R delay. |
| 226 | Coldwave Pulse | Driving eighth-note Up arpeggio of a tight saw pluck; steps 4 and 8 are muted, so the pattern stumbles. Classic cold-wave sequence. |
| 227 | Spiral Down | Four-octave Down arpeggio in sixteenths of a resonant saw; LFO1 slowly opens and closes the filter over about four bars, so the spiral brightens and sinks. |
| 228 | Haunted Lullaby Arp | Slow Alt2 arpeggio in eighths of a small music box (triangle plus faint double octave). Gentle at 72 BPM, eerie in a horror cue. |
| 229 | Chord Rain | Trigger-mode arpeggio: the whole held chord is struck again on every eighth note, as a short dark pluck. Hold a minor chord for pulsing rain. |
| 230 | Black Lace Sequence | Up arpeggio over two octaves with a six-step loop (Last Step 6), so the pattern shifts against the bar. Resonant pulse pluck, dotted echoes. |
| 231 | Ghost Train | Fast, hypnotic sextuplets (1/24) of a short square tick through a slow phaser. One octave, Up; hold two or three notes and let it run. |
| 232 | Requiem Arp Pad | Arpeggiated pad: slow quarter-note Up arpeggio over two octaves where each note has a slow attack and a long release, so the notes overlap into a moving chord. |
| 233 | Pulse of the Damned | Trigger-mode sixteenths: the held chord strikes as a hollow ring-modulated bell (square a fifth up, products an octave below), relentlessly. Phaser and echo. |
| 234 | Shadow Steps | Alt1 arpeggio over two octaves with steps 2, 5 and 7 muted: a limping, low pluck pattern for the bass and tenor range. |
| 235 | Fading Memories | Random eighth-note arpeggio with a lazy swing, played on a dark electric piano (DWGS E.Piano3 approximation) with tremolo and a long echo. |
| 236 | Glass Rain Arp | Fast Up arpeggio in sextuplets over three octaves of tiny, brittle FM tines, scattered by an eighth-note L/R delay. |
| 237 | Funeral March Arp | Slow Down arpeggio in eighths at 70 BPM on a church organ (DWGS Organ1 approximation plus 16-foot square), long gate. A procession. |

## Dark Stab

| # | Program | Description |
|---|---|---|
| 238 | Coldwave Brass | Dark synth brass: two detuned saws with a filter EG that blooms and settles, quick attack and medium release. Velocity on brightness. Big minor chords. |
| 239 | Minor Third Stab | One-finger sad stab: every key sounds a minor third (OSC2 +3 semitones). Short, punchy filter EG and an eighth-note echo. |
| 240 | Doom Chord | Distorted power-fifth stab: saw plus a saw a fifth up into the distortion stage, a dark 24 dB filter and a short decay. One key, one doom chord. |
| 241 | Velvet Horn Section | Soft, muted horns: a slow filter swell (about 0.2 s), a gentle constant vibrato and full ensemble. For sombre chord swells. |
| 242 | Industrial Hit | Clanging metal stab: a saw ring-modulated by a square a tritone up plus a short noise burst (amp EG to noise level), band-passed. Atonal and harsh on purpose. |
| 243 | Shadow Organ Stab | Percussive organ chord (DWGS Organ3 approximation): a short decay into a low sustain and a filter click, with a long stereo echo behind it. |
| 244 | Synthwave Night Stab | Dark synthwave chord stab: a saw with a pulse-width-modulated square an octave down, a quick filter decay, lush chorus and dotted-eighth echoes. |
| 245 | Gothic Poly | All-round dark poly synth: saw plus square sub, a resonant 24 dB filter with a moderate envelope, full sustain. A starting point for chords and riffs. |
| 246 | Grief Swell Stab | Reverse-feeling swell: the level and filter rise over about half a second, then stop dead when you release. Play on the beat before the chord change. |
| 247 | Hollow Chord Stab | Nasal, hollow chord stab: two squares an octave apart through a resonant band-pass, short decay, ping-pong echoes. |
| 248 | Black Sun Brass | Heavy, slightly overdriven brass: detuned saws with a sub, a brassy filter envelope and the distortion stage. For dramatic minor fanfares. |
| 249 | Pressure Stab | Tense sync stab: the filter EG sweeps a hard-synced OSC2 down from high overtones at every hit, behind a dark 24 dB filter. Short and aggressive. |

## Dark Vocoder

| # | Program | Description |
|---|---|---|
| 250 | Hollow Choir Vocoder | Vocoder with a VOX carrier, formants shifted down two steps (darker, larger), resonant bands, ensemble. Sing into AUDIO IN 1. |
| 251 | Cold Machine Voice | Robotic vocoder: saw carrier with noise, formants shifted down one step, consonant HPF, the vocoder distortion and a phaser. |
| 252 | Whisper Chant | Whispered vocoder: a noise-heavy carrier with only a little saw, slow follower and long echo. |
| 253 | Choir of the Lost | Vocoder choir: a Vox-wave carrier with resonant bands, full ensemble and half-note cross echoes. Sing or speak into AUDIO IN 1 and play slow minor chords. |
| 254 | Demon Voice | Huge, low vocoder voice: the carrier is two saws an octave down, formants shifted down two steps, plus noise and the vocoder distortion. Play single low notes or fifths. |
| 255 | Android Lament | Mono robot singer: a square-wave carrier with glide and highly resonant, ringing bands. Sing into AUDIO IN 1 and play a melody one note at a time. |
| 256 | Whispering Walls | Pure whisper: the carrier is noise only, so any voice becomes an unpitched, breathy whisper (any key, held). The vocoder distortion is on to lift the quiet noise bands; long cross delay, ensemble. |
| 257 | Frozen Voice | Smeared, slow vocoder: a very slow envelope follower (E.F. SENSE 110) blurs the vowels into one another, over a shimmering two-phase saw carrier. Ensemble. |
| 258 | Cathedral Vocoder | Darker, larger choir: Vox carrier with a two-phase saw edge, formants shifted down one step, resonant bands, long release and deep cross echoes. |
| 259 | Broken Transmission | Glitching radio voice: LFO1 sample & hold makes the formant bands jump up and down (FC MOD), over a saw-and-noise carrier with a phaser. |
| 260 | Hollow Prayer | Soft, hollow vocoder: a folded triangle carrier with a little noise, gentle bands and a slow attack. Intimate and fragile; speak quietly. |

## Dark FX

| # | Program | Description |
|---|---|---|
| 261 | Falling into Night | Long downward sweep: each note starts two octaves high and falls to the played pitch over about three seconds (filter EG to pitch) while the filter closes. Saw plus noise. |
| 262 | Ghost Riser | Slow tension riser: over about four and a half seconds the filter opens and the pitch climbs two semitones, on noise and a saw. Hold one note into the drop. |
| 263 | Air Raid Memory | Distant siren: LFO1 (about 4 s per cycle) sweeps the pitch up and down about eight semitones on a square, band-passed and drenched in long echoes. |
| 264 | Thunder Far Away | Low, rolling rumble: noise through a low resonant 24 dB filter that sample & hold shakes, saturated by the distortion stage, with a slow swell and a long decay. Any key; lower keys are deeper. |
| 265 | Heartbeat Monitor | Hospital-monitor beep: a pure sine two octaves up, struck once per beat by the arpeggiator (Trigger, quarter notes, short gate). Hold one key; release it for silence. |
| 266 | Reverse Ghost | Backwards-sounding swell: a Vox wave with breath noise rises over about a second and cuts off on release, feeding a deep cross delay so the ghost repeats. |
| 267 | Static Storm | Crackling interference: LFO1 sample & hold at about 13 Hz throws the noise level around in random bursts, band-passed and bounced left and right. |
| 268 | Rising from the Grave | Wind-up effect: each note starts two octaves below and rises to the played pitch over about one and a half seconds (filter EG with negative intensity to pitch). Saw plus noise, resonant filter. |
