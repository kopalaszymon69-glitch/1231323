# Kestrel VA — Architecture

Kestrel VA is an original, unofficial VST3 instrument and standalone application. Its sound
engine is a behavioural model of the **original 2002 Korg microKORG** (not the microKORG XL,
XL+, S or microKORG 2). Kestrel VA is not affiliated with, endorsed by or derived from Korg
Inc. The name "microKORG" is used only to identify the reference hardware. Kestrel contains
no Korg code, waveform data, firmware, graphics or logos.

This document covers signal flow, parameter ranges, modulation routing, voice allocation,
host integration and implementation priorities. It records what is known, where the
knowledge comes from, and what is still unknown.

---

## 1. Scope, sources and evidence levels

### 1.1 Sources

| Key | Document | Location |
|---|---|---|
| [OM] | KORG microKORG Owner's Manual, English, edition E2 (PDF created 2002-08-09, modified 2005-10-28), file `microKORG_OM_E2.pdf` | https://www.korg.com/us/support/download/manual/0/104/1616/ |
| [MI] | microKORG MIDI Implementation, Revision 1.4 (2002-06-27), file `microKORG_MIDIimp.TXT` | https://www.korg.com/us/support/download/manual/0/104/2700/ |
| [FL-W] | Image-Line, FL Studio manual: Plugin Wrapper (Settings / Processing tabs) | https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/plugins/wrapper.htm |
| [FL-M] | Image-Line, FL Studio manual: Mixer, "Internal Mixer Track Routing & Sidechaining" | https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/mixer.htm |
| [FL-IO] | Image-Line, FL Studio manual: Mixer Audio Input/Output Routing | https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/mixer_iorouting.htm |
| [FL-MO] | Image-Line, FL Studio manual: MIDI Out | https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/plugins/MIDI%20Out.htm |
| [FL-V] | Image-Line, FL Studio manual: Vocodex input setup | https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/plugins/Vocodex_inputs.htm |

Page numbers below are the printed page numbers of [OM]. [MI] references use the table and
note names of that file (for example `TABLE 2 +23`, `*3-8`, `*T-11`).

### 1.2 Evidence tags

Every behaviour, range and curve in this document and in the code carries one tag.

| Tag | Meaning |
|---|---|
| **[DOC]** | Established by official documentation ([OM] or [MI]); citation given. |
| **[FIG]** | Inferred from an official figure; the figure is cited. Figures are schematic, so shapes are trusted and exact proportions are not. |
| **[ENG]** | Engineering approximation chosen by Kestrel. It is a placeholder pending comparison with the hardware. |
| **[EXT]** | Optional extension beyond the hardware. Disabled in Compatibility mode. |
| **[HOST]** | Plugin-host integration that has no hardware counterpart and does not change the modelled sound (tempo source, sample rate, quality setting, sustain pedal). Allowed in Compatibility mode and individually switchable. |

No hardware and no reference recordings were available while this version was written, so
there are **no [MEAS] (measured) items yet**. Everything tagged [ENG] is a candidate for
measurement. The capture procedure is in `docs/REFERENCE_CAPTURE.md`. When a quantity is
measured, its tag becomes [MEAS] with a reference to the capture data, and the model is
replaced in one place (see §11, `params/Mapping.cpp` and the module interfaces).

### 1.3 Operating modes

- **Compatibility mode** (default for new instances): 4-voice limit and Layer voice split
  [DOC], parameters quantized to hardware resolution (integers 0..127, ±63 and so on) [DOC],
  all [EXT] features off. If measurements later show characteristic digital artefacts of the
  hardware (aliasing patterns, bandwidth limits, quantization), they will be modelled
  deliberately here, and only here.
- **Extended mode** [EXT]: higher polyphony (up to 16 voices per timbre), unquantized
  parameter values, and other clearly labelled additions.

Quality settings (internal oversampling) are [HOST]. They reduce artefacts that the
hardware is not known to have. They are not a historical-accuracy control.

---

## 2. Signal flow

### 2.1 Synth program (Single or Layer) — [OM] p.15 figure 0-1 [DOC][FIG]

```
                 AUDIO IN 1 ─┐ (Audio In wave: CTRL1 balance IN1/IN2)
                 AUDIO IN 2 ─┤
                             v
  TIMBRE n   ┌──────────┐  ┌───────┐     ┌──────────┐     ┌──────────────────────────┐
  (n = 1,2)  │  OSC 1   │─>│       │     │  FILTER  │     │ AMP                      │
             └──────────┘  │       │     │ 24LPF    │     │ VCA ──> DIST ──> LEVEL ──>│── PAN ──┐
                 ^  OSC MOD│ MIXER │────>│ 12LPF    │────>│ (EG2,    (on/   (LEVEL   │         │
             ┌───┴──────┐  │       │     │ 12BPF    │     │  vel,     off)   position│         │
             │  OSC 2   │─>│       │     │ 12HPF    │     │  kbd)            [ENG])  │         │
             └──────────┘  │       │     └──────────┘     └──────────────────────────┘         │
             ┌──────────┐  │       │        ^ EG1 INT, KBD TRACK, vel                           │
             │  NOISE   │─>│       │                                                            │
             └──────────┘  └───────┘                                                            │
   FILTER EG (EG1)  AMP EG (EG2)  LFO1  LFO2  ─>  VIRTUAL PATCH 1..4  <─ KBD, Vel, Mod, Bend   │
                                                                                               │
  ARPEGGIATOR ──> note events to Timbre 1 and/or 2 (TARGET TIMBRE)                             │
                                                                                               v
                               Timbre1 (L,R) + Timbre2 (L,R) ──> MOD FX ──> DELAY ──> EQ ──> L/R OUT
```

- The mixer output level is the filter input level, and the mixer levels set the distortion
  drive ([OM] p.23, p.27) [DOC].
- Figure 0-1 draws the AMP block as amplifier (AMP EG) → DIST → PAN [FIG]. Where LEVEL sits
  relative to DIST is not documented. Kestrel puts DIST after the EG-controlled VCA and
  applies LEVEL after DIST, so LEVEL does not change the drive. This matches "the degree of
  distortion is adjusted by the output level of each oscillator in the MIXER" [ENG].
- Both timbres are summed in stereo before MOD FX ([OM] p.15) [DOC].

### 2.2 Vocoder program — [OM] p.31 figure v0-1 [DOC][FIG]

```
 AUDIO IN 1 (modulator) ──┬──> GATE (THRESHOLD, GATE SENSE) ──> 16 ANALYSIS BPF ──> 16 ENVELOPE FOLLOWERS (E.F.SENSE / Hold)
                          │                                                              │ (gain per band)
                          ├──> DIRECT LEVEL ───────────────────────────────────┐         v
                          └──> HPF ──> HPF LEVEL ──(HPF GATE)───────────────────┤   16 SYNTHESIS BPF (RESONANCE,
                                                                               │   FORMANT SHIFT, CUTOFF, FC MOD)
 OSC1 ──> AMP (AMP EG, LEVEL) ──┐                                              │         │ pairs -> 8 channels
 NOISE ─> AMP (AMP EG, LEVEL) ──┼──> MIXER ──> DIST ──> carrier ───────────────┼──> ×env ──> CH LEVEL / CH PAN
 AUDIO IN 2 ("INST") ───────────┘                                              │         │
                                                                               v         v
                                                                         sum (L,R) ──> MOD FX ──> DELAY ──> EQ ──> L/R
 ARPEGGIATOR ──> carrier voices
```

- The carrier is OSC1 + NOISE (AMP EG applies to these) plus AUDIO IN 2 at INST LEVEL
  ([OM] p.31, p.34, p.37) [DOC]. In figure v0-1, AUDIO IN 2 enters the mixer after the AMP
  stage, so the AMP EG does not shape it [FIG].
- DISTORTION applies to OSC1, NOISE and AUDIO IN 2 ([OM] p.37) [DOC].
- There is no OSC2, no FILTER EG and no virtual patch in vocoder programs ([OM] p.37; [MI]
  TABLE 3 fixes EG1 at A0/D0/S127/R0) [DOC].

---

## 3. Parameter reference

Ranges are hardware display ranges. "Init" is Kestrel's initial value. The hardware INIT
PROGRAM values are not tabulated in [OM], so the init values are [ENG].
`engine/params/ParamTable` is authoritative and wins if it differs from this table.

### 3.1 VOICE ([OM] p.16, [MI] TABLE 1 byte 16, TABLE 2 +1/+2)

| Parameter | Range | Init | Tag | Notes / Kestrel mapping |
|---|---|---|---|---|
| SYNTH/VOCODER | Synth, Vocoder | Synth | [DOC] | Program type. |
| SINGLE/LAYER | Single, Layer | Single | [DOC] | Not available for vocoder. |
| VOICE ASSIGN | Mono, Poly, Unison | Poly | [DOC] | Per timbre. |
| TRIGGER MODE | Single, Multi | Multi | [DOC] | Editable only for Mono/Unison. Single = legato: EG and LFO are not retriggered while a key is held (fig 1-3). |
| UNISON DETUNE | 0..99 cents | 10 | [DOC] | Unison only. Distribution per fig 1-4, see §8.2 [FIG]. |
| Key priority | Last | Last | [DOC] | [MI] TABLE 2 +1 B0-1 "0=Last"; [OM] p.16 "last-pressed key will take priority". |

### 3.2 PITCH ([OM] p.17)

| Parameter | Range | Init | Tag | Notes |
|---|---|---|---|---|
| TRANSPOSE | −24..+24 semitones | 0 | [DOC] | Both oscillators. |
| TUNE | −50..+50 cents | 0 | [DOC] | |
| BEND RANGE | −12..+12 semitones | +2 | [DOC] | Amount at full wheel "away from you". Downward symmetry is [ENG] (assumed symmetric). Negative values invert. |
| VIBRATO INT | −63..+63 | 0 | [DOC] | LFO2 → pitch, scaled by MOD wheel (CC#1, [OM] p.53). Depth per step is [ENG]. |
| PORTAMENTO | 0..127 | 0 | [DOC] | 0 = off. Higher values give longer glides. In Mono/Unison with Trigger Single, the first note of a phrase does not glide (p.17). Time curve is [ENG]. |

### 3.3 OSC1 ([OM] p.18-21, [MI] TABLE 2 +7..+10, `*T-2`)

WAVE: Saw, Square (Pulse), Triangle, Sine (Cross), Vox, DWGS, Noise, Audio In [DOC].
CONTROL 1 and CONTROL 2 are 0..127. For DWGS, CONTROL 2 is 1..64 and CONTROL 1 has no
effect [DOC].

| Wave | CONTROL 1 [DOC meaning] | CONTROL 2 [DOC meaning] | Kestrel model (§4) |
|---|---|---|---|
| Saw | Modifies waveform; 0 = saw, 127 = saw one octave up (fig 3-1) | LFO1 depth on CTRL1 | Two half-amplitude saws with phase offset 0..180° [FIG] |
| Square | Pulse width 50% (0) .. 0% (127, silent) (fig 3-2) | LFO1 PWM depth | PolyBLEP pulse; width linear in CTRL1 [FIG/ENG] |
| Triangle | 0 = triangle, 127 = octave + fifth up (fig 3-3) | LFO1 depth on CTRL1 | Triangle wavefolder, gain 1..3 [FIG] |
| Sine | Synth: cross-mod depth from OSC2 (fig 3-4). Vocoder: "modifies the waveform" | Synth: LFO1 depth on x-mod. Vocoder: LFO1 depth on CTRL1 | Phase modulation by OSC2 [ENG]; vocoder variant [ENG] |
| Vox | Modifies waveform (fig 3-5) | LFO1 depth on CTRL1 | Original glottal-pulse-like approximation [FIG/ENG] |
| DWGS | No effect | Wave number 1..64 (table 3-1) | Original additive approximations + user import [ENG] |
| Noise | Cutoff of a dedicated noise LPF; tracks the keyboard; CTRL1 = 24 puts the resonance at the reference pitch (fig 3-6) | Resonance of that LPF | White noise → key-tracked resonant LPF [DOC/ENG] |
| Audio In | Balance: 127 = AUDIO IN 1 only, 0 = AUDIO IN 2 only | LFO1 depth on balance | Crossfade of input bus channels; PITCH has no effect [DOC] |

PWM via virtual patch (destination OSC1 Control 1) from LFO2, FILTER EG or AMP EG is
documented ([OM] p.18 note 3-1) [DOC]. Cross-modulation is not available in vocoder programs
(p.19) [DOC].

### 3.4 OSC2 ([OM] p.22, [MI] TABLE 2 +12..+14)

| Parameter | Range | Init | Tag | Notes |
|---|---|---|---|---|
| WAVE | Saw, Square, Triangle | Saw | [DOC] | Plain waveforms, no CONTROL parameters. Square is 50% [ENG; width not stated]. |
| OSC MOD | Off, Ring, Sync, RingSync | Off | [DOC] | Ring = "sum and difference" of OSC1 and OSC2. Sync = OSC2 phase forced to OSC1. With sync, SEMITONE/TUNE change the overtones, not the fundamental (p.22). |
| SEMITONE | −24..+24 | 0 | [DOC] | Relative to OSC1. |
| TUNE | −63..+63 | 0 | [DOC] | ±48 = ±1 octave, ±63 = ±2 octaves, fine resolution near 0. Kestrel uses a monotonic curve through these anchors [ENG]. |

### 3.5 MIXER — synth ([OM] p.23)

| Parameter | Range | Init | Tag | Notes |
|---|---|---|---|---|
| OSC 1 LEVEL | 0..127 | 127 | [DOC] | Filter input level and distortion drive. |
| OSC 2 LEVEL | 0..127 | 0 | [DOC] | |
| NOISE LEVEL | 0..127 | 0 | [DOC] | Separate white noise generator with no filter (not the OSC1 noise). |

Level curve (linear vs dB) and summing headroom are [ENG].

### 3.6 FILTER — synth ([OM] p.24-25, [MI] TABLE 2 +19..+24)

| Parameter | Range | Init | Tag | Notes |
|---|---|---|---|---|
| TYPE | −24dB LPF, −12dB LPF, −12dB BPF, −12dB HPF | −24 LPF | [DOC] | |
| CUTOFF | 0..127 | 127 | [DOC] | Hz curve [ENG], §5.3. |
| RESONANCE | 0..127 | 0 | [DOC] | Self-oscillates at high values; CUTOFF then sets the pitch (p.25). |
| FILTER EG INT | −63..+63 | 0 | [DOC] | EG1 → cutoff; negative inverts (fig 6-6/6-7). Scaling [ENG]. |
| FILTER KEY TRACK | −63..+63 | 0 | [DOC] | Pivot C4 (note 60); +48 = cutoff proportional to pitch (100%). Kestrel: factor = value/48. Follows pitch bend and transpose, not vibrato or virtual patch (p.25). |
| Velocity Sense | ±63 (stored 64 = 0) | 0 | [DOC existence]/[ENG range] | Hidden program byte [MI] TABLE 2 +23, not on the panel. [OM] p.24 says velocity can vary the cutoff. Range and scale are [ENG]. |

### 3.7 FILTER EG / AMP EG ([OM] p.26, p.28)

| Parameter | Range | Init (FEG / AEG) | Tag | Notes |
|---|---|---|---|---|
| ATTACK | 0..127 | 0 / 0 | [DOC] | Time to the attack level (maximum). |
| DECAY | 0..127 | 64 / 64 | [DOC] | Time to the sustain level. |
| SUSTAIN | 0..127 | 0 / 127 | [DOC] | Level. |
| RELEASE | 0..127 | 0 / 10 | [DOC] | Time to zero after note-off. |
| EG RESET | Off, On | Off | [DOC] | Off: a new note-on starts from the current EG level. On: it starts from 0. Available only for Poly, or Mono/Unison with Trigger Multi (p.26, p.28). |

Time curves and segment shapes are [ENG] (§12). [OM] p.28 gives example settings (piano:
A0, D100-127, S0, R5-25; organ: A0, S127, R0; strings: A40, D50, S75, R50). These help
plausibility checks but are not measurements.

### 3.8 AMP — synth ([OM] p.27, [MI] TABLE 2 +25..+29)

| Parameter | Range | Init | Tag | Notes |
|---|---|---|---|---|
| LEVEL | 0..127 | 100 | [DOC] | Timbre volume. In Layer it acts as the balance between timbres (p.27). |
| PANPOT | L63..Center..R63 | Center | [DOC] | [MI] stores 0..127 "L64~CNT~R63"; [OM] shows L63..R63. Kestrel follows [OM]. Pan law [ENG]. |
| DISTORTION | Off, On | Off | [DOC] | Drive set by mixer levels; curve [ENG] (§6). |
| KBD TRACK | −63..+63 | 0 | [DOC] | Volume vs key around C4; follows bend and transpose (p.27). Scale [ENG]. |
| Velocity Sense | ±63 (stored 64 = 0) | 0 | [DOC existence]/[ENG range] | Hidden byte [MI] TABLE 2 +28. Default 0 keeps velocity off the amp unless a patch routes it (p.30 example "Velocity → Amp"). |
| Amp SW | EG2 | EG2 | [DOC] | [MI] TABLE 2 +27 B6 "0=EG2" (fixed). |

### 3.9 LFO 1 / LFO 2 ([OM] p.29, p.65, [MI] TABLE 2 +38..+43, `*3-7`, `*3-8`, `*T-5`)

| Parameter | Range | Init | Tag | Notes |
|---|---|---|---|---|
| WAVE (LFO1) | Saw, Square1, Triangle, Sample&Hold | Triangle | [DOC] | Square1 is bipolar. |
| WAVE (LFO2) | Saw, Square2, Sine, Sample&Hold | Sine | [DOC] | Square2 is unipolar "Squ(+)" ([MI] `*3-8`). |
| KEY SYNC | Off, Timbre, Voice | Off (LFO1), Off (LFO2) | [DOC] | Off: phase never reset. Timbre: reset at the first note-on from no keys held, then shared. Voice: reset at every note-on, each voice has its own phase (fig 10-2..10-4). |
| TEMPO SYNC | Off, On | Off | [DOC] | Sync to ARPEG.A TEMPO or MIDI clock (Kestrel: host tempo per Clock setting). |
| FREQUENCY | 0..127 | 64 | [DOC] | Shown when TEMPO SYNC is Off. Hz curve [ENG]. |
| SYNC NOTE | 1/32, 1/24, 1/16, 1/12, 3/32, 1/8, 1/6, 3/16, 1/4, 1/3, 3/8, 1/2, 2/3, 3/4, 1/1 | 1/4 | [DOC] | One LFO cycle = the note value at the tempo (p.65). 1/4 = one cycle per beat. |

When LFO2 TEMPO SYNC is On, the patch destination LFO2 Frequency has no effect (p.29-30)
[DOC]. Dedicated LFO routes: LFO1 → OSC1 CONTROL 1 via CONTROL 2; LFO2 → pitch via
VIBRATO INT (p.29) [DOC].

### 3.10 VIRTUAL PATCH 1..4 ([OM] p.30, [MI] TABLE 2 +44..+51, `*T-3`, `*T-4`)

| Parameter | Values | Init (P1..P4) | Tag |
|---|---|---|---|
| SOURCE | FILTER EG, AMP EG, LFO1, LFO2, Velocity, KBD Track, Pitch Bend, MOD Wheel | LFO1, LFO2, F.EG, Mod | [DOC] |
| DEST | Pitch, OSC2 Tune, OSC1 Control 1, Noise Level, CutOff, Amp, Pan, LFO2 Freq | Pitch, Cutoff, Pitch, Cutoff | [DOC] |
| MOD INT | −63..+63 | 0 | [DOC] |

[MI] names the last two sources "P.Bend(MIDI1)" and "Mod(MIDI2)". Global bytes 14/15 fix
MIDI1 = pitch bend and MIDI2 = CC#01 [DOC]. Kestrel does not make them assignable
(hardware default).

### 3.11 Vocoder-specific parameters ([OM] p.32-38, [MI] TABLE 3)

| Section | Parameter | Range | Init | Tag | Notes |
|---|---|---|---|---|---|
| AUDIO IN 1 | GATE SENSE | 0..127 | 30 | [DOC] | Gate speed: low = fast close (shorter decay), high = gradual. No effect when THRESHOLD = 0. |
| | THRESHOLD | 0..127 | 10 | [DOC] | Level below which AUDIO IN 1 is silenced. |
| | HPF LEVEL | 0..127 | 30 | [DOC] | High-frequency part of AUDIO IN 1 mixed into the output (consonants). |
| | HPF GATE | Disable, Enable | Enable | [DOC] | Enable: the HPF signal passes only while a note is on. |
| MIXER | OSC 1 LEVEL | 0..127 | 127 | [DOC] | Carrier OSC1. |
| | INST LEVEL | 0..127 | 0 | [DOC] | AUDIO IN 2 as carrier. [MI] labels it "Ext1 Level"; Kestrel follows [OM]. |
| | NOISE LEVEL | 0..127 | 0 | [DOC] | |
| FILTER | FORMANT SHIFT | 0, +1, +2, −1, −2 | 0 | [DOC] | Whole filter-grid steps. |
| | CUTOFF | −63..+63 | 0 | [DOC] | Continuous shift over ±2 steps. |
| | RESONANCE | 0..127 | 0 | [DOC] | Synthesis-filter emphasis. |
| | E.F.SENSE | 0..126, Hold | 60 | [DOC] | Low = fast attack detection; high = smoother rise and longer release. Hold freezes the band levels and stores them in the program ([MI] TABLE 3 +78..141). |
| FC MOD | SOURCE | AMP EG, LFO1, LFO2, Velocity, KBD Track, Pitch Bend, MOD Wheel | LFO1 | [DOC] | Modulates synthesis-filter cutoff. |
| | INTENSITY | −63..+63 | 0 | [DOC] | |
| AMP | LEVEL | 0..127 | 100 | [DOC] | Internal carrier (OSC1, NOISE) level. |
| | DIRECT LEVEL | 0..127 | 0 | [DOC] | Dry AUDIO IN 1 to the output. |
| | DISTORTION | Off, On | Off | [DOC] | On the carrier (OSC1, NOISE, AUDIO IN 2). |
| | KBD TRACK | −63..+63 | 0 | [DOC] | |
| | Vel.Sense | ±63 (64 = 0) | 0 | [DOC existence]/[ENG] | Hidden byte, TABLE 3 +30. |
| CH LEVEL | CH 1..8 LEVEL | 0..127 | 127 | [DOC] | Each channel drives filters 2k−1 and 2k ([MI] "CH LEVEL [0]=[1]=BAND[1]"). |
| CH PAN | CH 1..8 PAN | L63..R63 | Center | [DOC] | Same pairing. |

VOICE, PITCH, OSC1, AMP EG and LFO1/2 parameters are shared with the synth program
(Single). Virtual patches are unavailable (p.32, p.37) [DOC].

**Filter grid ([OM] p.35, table 6-1) [DOC].** 24 frequencies (Hz):
`39, 50, 65, 80, 125, 185, 270, 350, 430, 530, 630, 780, 950, 1150, 1380, 1680, 2070, 2780,
3800, 5000, 6400, 8100, 10510, 12600`.
With grid index i = 0..23 and filter number f = 1..16:

- Analysis filters (modulator) always sit at shift 0: f → index f + 3 (125 Hz .. 5000 Hz)
  [DOC: "If both of these parameters are at 0, the character will match the cutoff
  frequencies of the modulator band pass filters"].
- Synthesis filters: f → index f + 3 + FORMANT SHIFT + CUTOFF·2/63. Table 6-1 confirms
  shift +2 → filter 1 = 270 Hz and shift −2 → filter 1 = 65 Hz. Combined range ±4 steps
  (39 Hz .. 12.6 kHz) [DOC]. Kestrel interpolates logarithmically between grid points for
  fractional positions [ENG].
- Channel k (1..8) = filters 2k−1 and 2k [DOC].

### 3.12 Effects ([OM] p.39-42, p.65, [MI] TABLE 1 bytes 19..29, `*T-1`, `*T-10`, `*T-11`)

| Section | Parameter | Range | Init | Tag | Notes |
|---|---|---|---|---|---|
| MOD FX | TYPE | Flanger/Chorus, Ensemble, Phaser | Cho/Flg | [DOC] | |
| | LFO SPEED | 0..127 | 20 | [DOC] | Hz curve [ENG]. |
| | EFFECT DEPTH | 0..127 | 0 | [DOC] | Raises both modulation depth and feedback; 0 = effect off (p.39-40). Higher Cho/Flg depth becomes flanging. |
| DELAY | TYPE | Stereo, Cross, L/R | Stereo | [DOC] | Cross: L/R feedback swapped. L/R: repeats alternate left and right (fig 17-1..3). |
| | TEMPO SYNC | Off, On | Off | [DOC] | |
| | DELAY TIME | 0..127 | 64 | [DOC] | Time curve and maximum [ENG]. |
| | SYNC NOTE | 1/32 .. 1/1 (15 values, `*T-1`) | 1/8 | [DOC] | Relative to ARPEG.A TEMPO (p.65). |
| | DELAY DEPTH | 0..127 | 0 | [DOC] | Raises both level and feedback; 0 = no delay. |
| EQ | LOW EQ FREQ | 40 Hz .. 1 kHz, 30 steps (`*T-11`) | 320 Hz | [DOC] | Table: 40,50,60,80,100..400 (step 20),420..500 (step 20),600,700,800,900,1000. |
| | LOW EQ GAIN | −12..+12 dB | 0 | [DOC] | |
| | HI EQ FREQ | 1.00 .. 18.0 kHz, 30 steps (`*T-10`) | 6.00 kHz | [DOC] | 1.00..5.75 (step 0.25), 6,7,8,9,10,11,12,14,16,18. |
| | HI EQ GAIN | −12..+12 dB | 0 | [DOC] | |

[OM] p.39: "To bypass any of the effects, set the FX depth (or EQ gain) value to zero."
[DOC].

### 3.13 Arpeggiator ([OM] p.43-45, [MI] TABLE 1 bytes 14-15, 30-36, NRPN 00/02..0A)

| Parameter | Range | Init | Tag | Notes |
|---|---|---|---|---|
| ON/OFF | Off, On | Off | [DOC] | |
| TEMPO | 20..300 BPM | 120 | [DOC] | Ignored when the clock is external (here: host). |
| RESOLUTION | 1/24, 1/16, 1/12, 1/8, 1/6, 1/4 | 1/16 | [DOC] | 1/24 = 16th triplets, 1/12 = 8th triplets, 1/6 = quarter triplets. |
| GATE | 0..100 % | 80 | [DOC] | 0 = extremely short; 100 = until the next step. |
| TYPE | Up, Down, Alt1, Alt2, Random, Trigger | Up | [DOC] | Alt1: top and bottom notes once; Alt2: twice. Trigger: all held notes together each step, RANGE ignored, lowest notes kept when more than the timbre polyphony. |
| RANGE | 1..4 octaves | 1 | [DOC] | |
| LATCH | Off, On | Off | [DOC] | |
| SWING | −100..+100 % | 0 | [DOC][FIG] | Even-numbered notes shifted by swing% of the step length (fig 20-1: −50 moves note 2 halfway back to note 1, +50 moves note 8 halfway to note 9). |
| KEY SYNC | Off, On | Off | [DOC] | On: the pattern restarts from its beginning when you play the keyboard. Kestrel restarts on the first key from all-released [ENG]. |
| LAST STEP | 1..8 | 8 | [DOC] | Plus an 8-step on/off pattern ([MI] TABLE 1 bytes 14-15). |
| TARGET TIMBRE | Both, Timbre 1, Timbre 2 | Both | [DOC] | Layer programs only. |

### 3.14 Global settings ([OM] p.46-47, p.51, [MI] TABLE 6)

| Parameter | Range | Tag | Kestrel |
|---|---|---|---|
| MASTER TUNE | A4 = 430.0..450.0 Hz, 0.1 Hz steps | [DOC] | Global, saved in plugin state, not in programs. |
| MASTER TRANSPOSE | −12..+12 | [DOC] | Applied to incoming notes (equivalent to POSITION = Pre TG). |
| VELOCITY CURVE | Curve, fixed 1..127 | [DOC] | Curve shape is unknown; Kestrel's "Curve" passes MIDI velocity through unchanged [ENG]. [MI] `*T-7` shows "Crv" stores curve index 2 of 8 internal curves, which are not documented. |
| POSITION | Post KBD, Pre TG | [DOC] | Not applicable to a plugin; Kestrel behaves as Pre TG [HOST]. |
| CLOCK | Internal, External, Auto | [DOC] | Kestrel: Internal (ARPEG.A TEMPO), Host, Auto (host tempo when available, else internal) [HOST]. |
| AUDIO IN THRU | Off, On | [DOC] | Not memorized; OFF at power-on (p.47). Kestrel resets it to OFF on load. |
| MIDI CH | 1..16 | [DOC] | Plugin default Omni [HOST]. |
| Scale | Equal temperament | [DOC] | [MI] TABLE 1 byte 17 "0=Equal Temp"; user scale "not use". |

---

## 4. Oscillator models

All shapes are generated per voice at the internal oversampled rate (§4.9).

### 4.1 Saw — two-phase saw [FIG fig 3-1]
Figure 3-1 at CONTROL 1 = 63 shows the single saw discontinuity split into two drops of
about equal height, and at 127 two equal teeth (saw one octave up). This is what you get by
summing two half-amplitude saws with a phase offset Δ:
`y = ½·saw(φ) + ½·saw(φ + Δ)`, with Δ = 0.5·CTRL1/127 cycles (linear [ENG]). At Δ = 0.5 the
fundamental cancels and the result is an octave-up saw [DOC p.18]. A crossfade between
saw(φ) and saw(2φ) would give unequal drops (1.5 : 0.5), which the figure does not show.
CONTROL 2 adds LFO1 · depth to CTRL1 before mapping [DOC]. Each discontinuity is corrected
with a polyBLEP residual.

### 4.2 Square / pulse [DOC p.18, FIG fig 3-2]
Pulse width = 50 % · (1 − CTRL1/127) (linear [ENG]). 127 gives 0 % and silence [DOC]. The
output is DC-free around the pulse mean [ENG; DC behaviour unknown]. Both edges get
polyBLEP corrections. PWM comes from CONTROL 2 (LFO1) or a patch to OSC1 Control 1 [DOC].

### 4.3 Triangle — folded triangle [FIG fig 3-3]
Figure 3-3 at 63 shows an "M" over the positive half and a "W" over the negative half, which
is exactly a triangle folded at ±1 with gain 2. At 127 it shows three peaks and troughs per
period (gain 3), which is the documented "octave and a fifth higher" (3rd harmonic) [DOC].
Kestrel: `y = fold(g · tri(φ))`, g = 1 + 2·CTRL1/127 [FIG/ENG]. All fold corners are known
analytically and receive polyBLAMP corrections.

### 4.4 Sine — cross modulation [DOC p.19, FIG fig 3-4]
Synth: OSC2's output, scaled by "X-mod Depth + X-mod Depth Mod" (CTRL1 + LFO1·CTRL2), is
summed into the OSC1 sine path (fig 3-4). Kestrel implements phase modulation,
`y = sin(2π(φ1 + k·osc2))` [ENG]. Whether the hardware uses PM, FM or through-zero FM, and
the depth at 127, are unknown. Vocoder: "modifies the waveform" [DOC] with no further
detail. Kestrel uses self-phase-modulation `sin(2π(φ + k·sin 2πφ))` [ENG], because OSC2
does not exist in a vocoder program.

### 4.5 Vox [FIG fig 3-5, ENG]
Figure 3-5 shows a smooth unipolar pulse (0), a narrower pulse with a small undershoot (63)
and a very narrow pulse followed by damped ringing (127). Kestrel's Vox is an **original
approximation**: a glottal-flow-derivative-like pulse whose open phase narrows with CTRL1,
plus a damped ringing component that grows towards 127. It is built as bandlimited
single-cycle tables morphed by CTRL1. [OM] says the frequency spectrum is maintained when
pitch changes, so shapes are pitch-independent tables. No Korg data is used.

### 4.6 DWGS [DOC table 3-1, ENG]
64 slots carrying the documented names (SynSine1..Voice4; no. 35 "Endless" simulates a
Shepard-like endless scale [DOC]). The original waveform data is not available. Kestrel
ships **original additive approximations**, labelled in the UI and in state as
"approximation — not Korg DWGS data". "Endless" is approximated with octave-spaced partials
under a fixed spectral envelope [ENG]. Import path: the user can load, per slot, either a
harmonic amplitude/phase text file or a single-cycle WAV (FFT → harmonics). Imported data is
converted to bandlimited mip-mapped tables off the audio thread, swapped in atomically, and
stored in the plugin state.

### 4.7 Noise (OSC1) and mixer noise [DOC p.20, p.23]
OSC1 Noise = white noise → dedicated resonant LPF. CTRL1 = cutoff, CTRL2 = resonance. The
cutoff tracks the played key, and CTRL1 = 24 places it at the reference pitch [DOC]. Kestrel
uses `fc = f_note · 2^((CTRL1 − 24)/12)`, clamped, with a 12 dB/oct TPT SVF low-pass [ENG].
The mixer NOISE is a separate, unfiltered white noise source [DOC]. Generator: xorshift
uniform noise, white at the internal rate [ENG].

### 4.8 Audio In and OSC2 modulation [DOC p.21-22]
Audio In reads the Kestrel input bus (left = AUDIO IN 1, right = AUDIO IN 2, §10.4). CTRL1
crossfades the two inputs (127 = IN1, 0 = IN2), CTRL2 lets LFO1 modulate the balance, and
PITCH parameters are ignored [DOC].
OSC2: Saw, Square or Triangle at the OSC1 pitch + SEMITONE + TUNE.
- **Sync** resets OSC2's phase at each OSC1 cycle start [DOC]. Kestrel computes the exact
  sub-sample reset time and applies a BLEP for the step and a BLAMP for the slope change.
- **Ring** outputs osc1 × osc2 on the OSC2 mixer channel [DOC "sum and difference";
  placement on OSC2 output from fig 4-1]. A product of bandlimited signals can still fold,
  and the internal oversampling handles it.
- **RingSync** applies both [DOC].

### 4.9 Bandlimiting and oversampling [ENG/HOST]
- Oscillators, mixer, filter, VCA and distortion run per voice at an internal rate of
  1×, 2× or 4× the host rate. The default is 2× below 88.2 kHz and 1× at or above.
- Hard edges and sync resets get polyBLEP corrections; slope breaks (triangle fold corners,
  sync on triangle) get polyBLAMP. Table-based waves (Vox, DWGS) use mip-mapped bandlimited
  tables.
- Decimation uses linear-phase FIR half-band stages designed for an integer base-rate
  latency. The total latency is reported to the host and updated when the quality setting
  changes.
- These are quality measures, not historical claims. If measurements show characteristic
  aliasing or bandwidth limits in the hardware, they will be modelled explicitly in
  Compatibility mode.

---

## 5. Filter model

### 5.1 Why this topology
The microKORG is documented as a DSP "analog modeling" instrument ([OM] p.1). No circuit, and
no evidence of any particular analog topology, is published. Kestrel therefore makes **no
ladder, OTA, WDF or component-level claim**. It uses Zavalishin's topology-preserving
transform (TPT) state-variable filter, chosen for one engineering reason: it stays stable and
artefact-free under audio-rate cutoff modulation (EG, LFO, key tracking, patch). The filter
sits behind a small interface (`filter/FilterModel`), so a measured model can replace it
without touching voices or parameters.

### 5.2 Structure [ENG]
- **−12 dB LPF / BPF / HPF**: one TPT SVF, using its LP, BP (gain-normalised to unity at
  the centre frequency with resonance 0) and HP outputs.
- **−24 dB LPF**: two cascaded TPT SVF low-pass sections. With resonance 0, stage 1 has
  Q = 0.541 and stage 2 Q = 1.307, which is a 4th-order Butterworth. RESONANCE raises the
  stage-2 Q towards self-oscillation.
- **Self-oscillation** ([OM] p.25 [DOC]): at the top of the RESONANCE range, the effective
  damping reaches zero. Oscillation amplitude is bounded by an amplitude-dependent damping
  term, a documented stability measure that keeps the loop finite and is **not** a circuit
  model. There is no tanh() or other "analog warmth" stage.
- Passband gain loss with rising resonance (common in hardware) is unknown and not
  modelled [ENG].

### 5.3 Mappings [ENG, in `params/Mapping.cpp`]
- CUTOFF: `f = 440 · 2^((v + 8 − 69)/12)` Hz, so 0 → about 13 Hz and 127 → about
  19.9 kHz, one semitone per step. Clamped below 0.45 × the internal rate.
- Modulation sums in the pitch domain (semitones): EG1·INT, key track, velocity sense,
  patch, FC MOD. The scale factors live in Mapping.cpp and are pending measurement.
- RESONANCE: 0..127 → damping. The curve and self-oscillation onset are [ENG].

---

## 6. Distortion [DOC on/off and drive source; ENG curve]

Documented: on/off per timbre, drive set by the mixer levels ([OM] p.27), and in the vocoder
it acts on the carrier ([OM] p.37). The transfer curve is not documented; the figure 0-1 icon
is only a symbol. Kestrel uses a static, odd-symmetric polynomial soft clipper with a hard
ceiling. It runs at the oversampled rate, with fixed make-up gain, and is labelled an [ENG]
approximation. It is not presented as a model of any circuit.

---

## 7. Modulation routing

### 7.1 Dedicated (hard-wired) routes [DOC]

| Route | Control | Source |
|---|---|---|
| EG1 → cutoff | FILTER EG INT | p.24 |
| Key → cutoff | FILTER KEY TRACK (+48 = 100 %) | p.25 |
| Velocity → cutoff | Filter Velocity Sense (hidden) | p.24, [MI] +23 |
| EG2 → VCA | fixed ("Amp SW = EG2") | p.27, [MI] +27 |
| Key → volume | AMP KBD TRACK | p.27 |
| Velocity → volume | Amp Velocity Sense (hidden) | [MI] +28 |
| LFO1 → OSC1 CTRL1 (PWM etc.) | OSC1 CONTROL 2 | p.18-21 |
| LFO2 → pitch | VIBRATO INT × MOD wheel | p.17, p.53 |
| Wheel → pitch | BEND RANGE | p.17 |
| (Vocoder) source → synthesis cutoff | FC MOD SOURCE / INTENSITY | p.36 |

### 7.2 Virtual patch sources [DOC list; ENG scaling]

| Source | Polarity | Notes |
|---|---|---|
| FILTER EG (EG1) | 0..1 | per voice |
| AMP EG (EG2) | 0..1 | per voice |
| LFO1 | −1..+1 | Saw, Square1, Triangle, S&H all bipolar [ENG for saw direction] |
| LFO2 | −1..+1; Square2 0..+1 | "Squ(+)" [MI `*3-8`] |
| Velocity | 0..1 (vel/127) | [ENG] |
| KBD Track | bipolar around C4 (60) | Follows bend and transpose, not vibrato or patch [DOC p.30]; scale [ENG] |
| Pitch Bend | −1..+1 | center 0 ([OM] p.52: centre = 0, range −127..+127) |
| MOD Wheel | 0..1 | CC#01 |

### 7.3 Destinations [DOC list; ENG scaling]
Pitch (whole timbre), OSC2 Tune, OSC1 Control 1, Noise Level (mixer noise), CutOff, Amp
(LEVEL), Pan, LFO2 Frequency (ignored when LFO2 is tempo-synced). Scaling at MOD INT = ±63
is undocumented. The current values are in `engine/params/Mapping.cpp` (one function per
destination, tagged [ENG]) and are pending measurement. Negative MOD INT inverts the source.
Several patches with the same destination add together. Modulators are evaluated per voice
and per sample and are never low-pass smoothed.

---

## 8. Voices, timbres and allocation

### 8.1 Compatibility allocation (4 voices) [DOC p.16]

| Program | Rule |
|---|---|
| Single Poly | 4 voices |
| Single Mono | 1 voice |
| Single Unison | all 4 voices on one note |
| Layer | the 4 voices are divided between timbres (table below) |
| Vocoder | 4 voices (p.32: VOICE as Single) |

Layer split (Timbre 1 + Timbre 2). Rule: Mono uses 1 voice, Unison uses 2 voices in a
Layer, and Poly gets the remainder of 4. Poly + Poly is 2 + 2.

| T1 \ T2 | Mono | Poly | Unison |
|---|---|---|---|
| **Mono** | 1 + 1 [ENG] | 1 + 3 [DOC] | 1 + 2 [ENG] |
| **Poly** | 3 + 1 [ENG] | 2 + 2 [DOC] | 2 + 2 [ENG] |
| **Unison** | 2 + 1 [DOC] | 2 + 2 [ENG] | 2 + 2 [ENG] |

When more keys are held than voices are available, the last-pressed key takes priority
([OM] p.16, [MI] key priority "Last") [DOC]. Kestrel steals the oldest sounding voice of that
timbre [ENG], with a 2-5 ms declick fade on the stolen voice's output [ENG]. With Mono or
Unison, releasing the newest key returns to the most recent key still held (last-note
priority) [ENG].

### 8.2 Unison detune [FIG fig 1-4]
Voices are spread symmetrically around the nominal pitch. The total span between the
outermost voices equals UNISON DETUNE in cents, and voices are evenly spaced (2 voices:
±d/2; 4 voices: ±d/2, ±d/6) [FIG/ENG]. Each unison voice keeps its own oscillator phase
[ENG].

### 8.3 Trigger, EG reset and LFO key sync
- **Trigger Single** (Mono/Unison): legato notes do not retrigger EGs or LFOs, and
  portamento only applies to legato notes [DOC p.16-17]. **Multi** retriggers on every
  note-on [DOC].
- **EG RESET** applies when a sounding voice is retriggered (Mono/Unison Multi, or a Poly
  voice reused or stolen before its release ends) [DOC p.26, ENG for the Poly steal case].
- **LFO KEY SYNC**: Off and Timbre use one LFO per timbre shared by all voices [FIG
  10-2/10-3]; Voice uses per-voice LFOs reset at note-on [FIG 10-4]. Notes generated by the
  arpeggiator do not count as "first note from no keys held" for Timbre sync (the hardware
  separates arpeggiated notes via the Sync Control message, [OM] p.53) [ENG].

### 8.4 Extended mode [EXT]
Up to 16 voices per timbre. The Layer split is removed (each timbre gets its own pool), and
Unison stacks a configurable 2..8 voices per note. Off in Compatibility mode.

### 8.5 MIDI note handling
- All Notes Off (CC#123) releases notes; All Sound Off (CC#120) silences immediately; Reset
  All Controllers (CC#121) resets wheel and bend; mode messages 124..127 act as All Notes
  Off ([MI] 2-1) [DOC].
- Sustain pedal (CC#64) is not in the hardware's documented function list ([MI] 2-1, [OM]
  p.56 default map). Kestrel implements it as a [HOST] convenience, default **on**,
  switchable off. Sustained voices still obey the voice limit and stealing rules.
- Host transport stop: Kestrel stops a host-clocked arpeggiator and releases its generated
  notes. FL Studio also sends All Notes Off on stop by default ([FL-W] "Send All Notes Off
  when playback stops").

---

## 9. Effects, arpeggiator and vocoder implementation notes

### 9.1 MOD FX [DOC types; ENG internals]
- **Chorus/Flanger**: one modulated, fractionally interpolated delay line per channel with
  feedback. DEPTH scales modulation depth and feedback together, so high depth turns the
  chorus into a flanger [DOC p.40].
- **Ensemble**: three modulated taps per channel, with LFO phases 120° apart and different
  L/R phases ("multiple chorus units", [DOC p.40]).
- **Phaser**: a cascade of first-order TPT allpass stages swept by an LFO, with feedback.
  Feedback is clamped below 1.
- DEPTH = 0 bypasses the effect [DOC p.39]. Delay times, LFO rate range, stage count and mix
  are [ENG].

### 9.2 DELAY [DOC types and sync; ENG times]
Stereo, Cross (feedback cross-coupled L↔R) and L/R (ping-pong output). Tempo sync uses the
note values of p.65 at the internal or host tempo. Free-running DELAY TIME 0..127 maps to
milliseconds with an [ENG] curve and maximum time. Feedback is clamped below 1, and the
repeats are not filtered [ENG; unknown].

### 9.3 EQ [DOC frequencies and gains; ENG type]
Low and high bands with the exact 30-step frequency tables (`*T-10`, `*T-11`) and ±12 dB.
The filter type is undocumented. Kestrel uses TPT low and high shelving filters with fixed
slope [ENG].

### 9.4 Arpeggiator
- Runs on sample-accurate timing at the internal TEMPO or the host tempo and position
  (Clock setting) [HOST]. In Host mode, steps align to the host PPQ grid.
- Patterns: Up, Down, Alt1, Alt2, Random and Trigger as in §3.13, with octave RANGE,
  LAST STEP and the step on/off mask. GATE is the step fraction; 100 % holds to the next step.
- Swing per figure 20-1 [FIG]. Arpeggiated notes use the velocity of the key that produced
  them [ENG]. Random uses a seeded PRNG [ENG].
- Target timbre Both, T1 or T2 for Layer programs [DOC]. Trigger type limits chords to the
  timbre polyphony, keeping the lowest notes [DOC].

### 9.5 Vocoder
- 16 analysis band-pass filters on the gated AUDIO IN 1, at grid indices 4..19 [DOC]. Each
  filter is a 4th-order TPT band-pass (two cascaded 2nd-order sections) with Q derived from
  the grid spacing [ENG].
- 16 envelope followers (rectifier plus asymmetric one-pole attack/release). E.F.SENSE maps
  to the time constants [ENG]. Hold freezes the 16 levels and stores them with the program
  [DOC].
- 16 synthesis band-pass filters on the carrier at shifted grid positions (§3.11). RESONANCE
  raises their Q [DOC/ENG]. FC MOD adds a continuous shift [DOC].
- Per-channel LEVEL and PAN on filter pairs [DOC]. The output adds DIRECT LEVEL
  (AUDIO IN 1 dry) and HPF LEVEL (AUDIO IN 1 through a high-pass, gated to note-on when HPF
  GATE = Enable) [DOC]. The HPF cutoff is [ENG].
- Gate: a level detector compared with THRESHOLD; GATE SENSE sets the close time [DOC
  semantics, ENG curves].

---

## 10. Host integration

### 10.1 Parameters and state
- **Stable string IDs**, hierarchical, never renamed or renumbered; new parameters are only
  appended. Examples: `prog.mode`, `t1.voice.assign`, `t1.osc1.wave`, `t1.osc1.ctrl1`,
  `t2.filter.cutoff`, `t1.patch3.dest`, `voc.ch3.level`, `voc.ef.sense`, `fx.delay.time`,
  `arp.type`, `global.mastertune`. The VST3 parameter IDs are derived from these strings.
- Values are in hardware units (for example cutoff 0..127, EG INT −63..+63, choice
  indices). Compatibility mode quantizes to hardware resolution. Extended mode allows
  fractional values on continuous parameters [EXT].
- The state stores a format version, all parameters for both timbres, the vocoder (including
  the 16 E.F. hold levels), effects and arpeggiator (including the step mask), imported DWGS
  user slots, and global settings except AUDIO IN THRU.

### 10.2 Real-time rules
- No allocation, file I/O, logging, locks or other blocking work in `processBlock`.
  Waveform imports and preset loads are prepared on the message thread and handed over
  through lock-free single-producer/single-consumer queues or atomic pointer swaps.
- **Sample-accurate MIDI**: blocks are split at event timestamps. Arpeggiator events are
  generated at exact sample offsets.
- **Smoothing**: continuous host and automation parameters (cutoff, resonance, levels, pan,
  intensities) ramp over 5-20 ms. Discrete parameters switch at the event sample. Internal
  modulation (EG, LFO, patch, velocity) is never smoothed.
- **Numerics**: FTZ/DAZ enabled for the block, filter and delay states flushed, and voice
  states checked for non-finite values (a voice found non-finite is reset and muted). Output
  samples are checked for finiteness. Feedback paths (delay, flanger, phaser, filter
  self-oscillation) are bounded.
- Supported rates 44.1-192 kHz and any host buffer size, including variable sizes. All
  coefficients are derived from the actual rate.
- Latency = oversampling FIR delay, reported with `setLatencySamples` and updated when the
  quality setting changes.

### 10.3 MIDI
Note on/off, pitch bend, CC#01 (mod wheel), CC#64 [HOST], CC#120/121/123-127 [DOC]. An
optional receive map of the hardware's default panel CC assignments ([OM] p.56, for example
CC#74 cutoff, CC#71 resonance, CC#73/75/70/72 amp EG) [DOC] can be enabled; host automation
is the primary control path. The hardware's NRPN and SysEx program dumps are out of scope.

### 10.4 Audio input
- **Kestrel VA** (VST3 instrument and standalone) has one optional stereo input bus,
  "Audio In": left = AUDIO IN 1 (OSC1 Audio In balance 127, vocoder modulator, DIRECT/HPF),
  right = AUDIO IN 2 (OSC1 Audio In balance 0, vocoder INST carrier). A mono source sent as
  dual-mono therefore feeds both inputs; set INST LEVEL to 0 when the mic must not also act as
  carrier. The standalone app maps device input channels 1 and 2 to IN1 and IN2.
- **Kestrel VA FX**: the same engine built as a VST3 effect that accepts MIDI, for hosts or
  setups where an instrument cannot receive audio. Its main input is the Audio In bus.
- AUDIO IN THRU (global, default OFF) passes the inputs to the output [DOC p.47].

### 10.5 FL Studio routing (documented by Image-Line, not tested in FL Studio by us)

**A. Instrument in the Channel Rack (Kestrel VA).**
1. Load Kestrel VA in the Channel Rack and assign it a Mixer track in Channel settings, for
   example track 10.
2. Put the source (mic via the track's External audio IN, or audio clips) on another Mixer
   track, for example track 8 ([FL-IO]).
3. Open the wrapper's Plugin options → *Processing* tab → *Connections*. Right-click the
   input field. For plugins loaded in channels, the numbers are Mixer-track offsets relative
   to the channel's Mixer track: "if the plugin is routed to Mixer track 10 and a plugin
   input is set to −2 … the plugin will receive audio-input from track 8" ([FL-W]).
4. Caveat: the same page says "Auto map inputs only applies to plugins loaded in Mixer effects
   slots since instrument channels can't receive audio input" ([FL-W]). Whether a VST3
   generator's input bus receives audio in current FL Studio versions must be verified. If it
   does not, use route B. If the bus shows as inactive, try *Processing* → "Process inactive
   inputs and outputs" ([FL-W]).

**B. Effect in a Mixer insert (Kestrel VA FX), the documented path.**
1. Insert Kestrel VA FX in an effect slot of the Mixer track that carries the modulator
   (mic). That track's audio is the plugin's main input.
2. To feed a second source (carrier, AUDIO IN 2) from another track, right-click that track's
   send switch on the Kestrel track and choose "Sidechain to this track" (a send at level 0).
   Disable the source's send to Master if it should not be heard ([FL-M]). Then, in
   *Processing* → *Connections*, sidechain the required number of tracks first and click
   "Auto map inputs" (the lowest-numbered sidechained track goes to the first plugin input),
   or assign the inputs manually ([FL-W]).
3. Effects cannot receive Piano roll notes ("There is no path from the Piano roll or Step
   Sequencer to Effects plugins", [FL-V]). Add a **MIDI Out** channel. In Kestrel VA FX's
   wrapper → *Settings* tab, set the MIDI **Input port** to the MIDI Out port number. Play or
   sequence the MIDI Out channel ([FL-MO], [FL-W] "Input port / Output port").
4. FL Studio shows the reported latency in the wrapper *Info* field and compensates for it
   (PDC) ([FL-W]).

---

## 11. Implementation priorities and module map

### 11.1 Build stages (each ends with a working build and tests)
1. VST3 + standalone shell, MIDI in, one playable voice (Saw → TPT LPF → EG → output).
2. Full oscillators (all OSC1 waves, OSC2 with sync/ring), mixer, all filter types, both EGs,
   both LFOs, virtual patch, hidden velocity-sense parameters.
3. Voice assign modes, trigger/EG reset rules, portamento, two timbres and Layer,
   Compatibility allocation, stealing, sustain and all-notes-off.
4. Arpeggiator, MOD FX, DELAY, EQ, tempo sync.
5. Vocoder, input bus routing (instrument and FX builds), gate and HPF path.
6. Interface (timbre, modulation, effects and vocoder views), preset bank, offline render and
   analysis harness, reference-capture procedure, status report.

### 11.2 Source layout

| Path | Contents |
|---|---|
| `kestrel/engine/` | Pure C++20, no JUCE dependency, unit-testable. |
| `engine/core/` | math helpers, parameter smoothing, oversampling (FIR half-bands), denormal guards, PRNG |
| `engine/osc/` | polyBLEP/BLAMP primitives, OSC1 wave models, OSC2, noise, wavetable/mip-map + DWGS/Vox banks and import conversion |
| `engine/filter/` | `FilterModel` interface, TPT SVF, 24 dB cascade, noise LPF |
| `engine/env/` | ADSR with reset semantics |
| `engine/lfo/` | LFO waves, key sync modes, tempo sync |
| `engine/mod/` | virtual patch matrix, source/destination enums |
| `engine/voice/` | voice (osc → mixer → filter → amp → dist), allocator |
| `engine/timbre/` | timbre: voice mode, trigger rules, portamento, unison |
| `engine/fx/` | mod FX, delay, EQ |
| `engine/vocoder/` | filter grid, analysis/synthesis banks, followers, gate, HPF path |
| `engine/arp/` | arpeggiator and clock |
| `engine/params/` | `ParamTable` (single source of truth: IDs, ranges, defaults, tags); `Mapping.cpp` (every hardware-value → physical-unit curve, each tagged with its evidence level so it can be replaced after measurement) |
| `engine/Engine.{h,cpp}` | top level: program, timbres, routing, block processing |
| `kestrel/plugin/` | JUCE `AudioProcessor`, editor, preset I/O, parameter bridge |
| `kestrel/tools/` | offline render and analysis CLI |
| `kestrel/tests/` | ctest suites |
| `kestrel/presets/` | original preset bank |

---

## 12. Unknowns register

Every row is currently [ENG]. "How to measure" refers to the tests in
`docs/REFERENCE_CAPTURE.md`.

| # | Unknown | Current Kestrel choice | How to measure |
|---|---|---|---|
| 1 | Internal sample rate, word length, DAC/output bandwidth | Host rate + oversampling; flat response | High saw/sync notes: look for alias image patterns; noise spectrum near Nyquist; output roll-off |
| 2 | Cutoff 0..127 → Hz | 1 semitone/step, about 13 Hz..19.9 kHz | Self-oscillation pitch per cutoff value; noise through filter, −3 dB points |
| 3 | Resonance curve, self-oscillation onset and amplitude, passband loss | Linear damping map; bounded oscillation | Resonance sweeps at fixed cutoff; level vs resonance |
| 4 | Filter slopes, BPF/HPF shapes | TPT SVF (12 dB), Butterworth cascade (24 dB) | White-noise transfer functions per type |
| 5 | EG time curves (0..127 → s), segment shapes, sustain level curve | Exponential decay/release, [ENG] attack; values in Mapping.cpp | Gate tests with sine/noise through open filter; envelope extraction |
| 6 | EG RESET behaviour on Poly steals | Reset applies to reused voices | Fast repeated notes beyond polyphony |
| 7 | LFO 0..127 → Hz; exact waveform shapes; S&H rate and smoothing; saw direction | Exponential Hz map; ideal shapes | LFO → pitch at high MOD INT; pitch tracking |
| 8 | LFO Off/Timbre sharing across voices; interaction with Trigger mode | One shared LFO per timbre | Chords with key sync variants |
| 9 | Portamento curve; constant time vs constant rate; glide shape | Constant-time exponential glide | Interval glides of 1, 12, 24 semitones |
| 10 | VIBRATO INT scaling; bend down symmetry | Placeholder cents/step; symmetric bend | Pitch tracking at full wheel |
| 11 | Patch MOD INT scaling per destination | Placeholders in Mapping.cpp | One test per destination at ±63 |
| 12 | Hidden velocity-sense ranges and scale; global "Curve" shape | ±63, linear; velocity passthrough | Velocity ladders 1..127 |
| 13 | Unison detune distribution (span vs step), Layer unison count | Span = detune, even spacing | Beat analysis of unison notes |
| 14 | OSC2 TUNE curve between anchors (0, ±48, ±63) | Monotonic curve through anchors | Pitch of OSC2 alone across values |
| 15 | Saw/Tri/Pulse CTRL1 exact maps (figure-based) | §4.1-4.3 | Isolated OSC1 spectra at CTRL1 0/32/63/95/127 |
| 16 | Cross-mod: PM vs FM, depth at 127, OSC2 level role | PM, placeholder depth | Sine + OSC2 sine at simple ratios; sideband analysis |
| 17 | Ring output scaling, sync reset details | Product; hard reset | Ring/Sync tests with OSC1 off and on |
| 18 | VOX waveforms; 64 DWGS waveforms | Original approximations + import | Single-cycle captures with filter open, low notes |
| 19 | Noise oscillator LPF slope and cutoff map; noise spectrum | 12 dB SVF, key tracked | Noise captures per CTRL1/CTRL2 |
| 20 | Mixer level curve, headroom, inter-stage gain staging | Linear levels, unity sums | Level ladders per mixer channel; clipping onset |
| 21 | Distortion curve, drive scale, position relative to LEVEL | Polynomial soft clip after VCA, before LEVEL | Sine level ladders with DIST on; harmonic analysis |
| 22 | AMP LEVEL curve, pan law, KBD TRACK scale | Linear level, constant-power pan | Level/pan ladders; keyboard scans |
| 23 | MOD FX delay times, LFO ranges, feedback, mix, ensemble voices, phaser stages | Placeholders | Impulse and noise through each type |
| 24 | Delay max time, 0..127 → ms curve, DEPTH → level/feedback split, repeat filtering | Placeholders; no filtering | Click-train captures |
| 25 | EQ type (shelf/peak) and Q | Shelving | Noise with ±12 dB at each frequency step |
| 26 | Vocoder BPF order and Q, RESONANCE range, follower times vs E.F.SENSE, gate timing, HPF cutoff, carrier/modulator level balance | 4th-order BPF, placeholders | Sine/noise carrier with swept-sine and speech modulators |
| 27 | Arpeggiator: note velocity, gate rounding, Random algorithm, key-sync timing, latch release | Held-note velocity; seeded PRNG | MIDI-out capture of the hardware arpeggiator |
| 28 | Layer allocation for undocumented combinations; steal choice | §8.1 table; oldest-first | Hold 4 notes in each Layer combination |
| 29 | Audio input gain staging (max input −3.5 dBu line / −33 dBu mic at VOLUME max, p.67) | 0 dBFS host input = full scale | Calibrated tone into AUDIO IN with known level |
