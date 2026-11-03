# Kestrel VA — status report

Kestrel VA is an original, **unofficial** virtual-analog synthesizer and vocoder. Its engine
behaviourally models the documented architecture of the original 2002 KORG microKORG. No
hardware or reference recordings were available during development, so the result is an
**approximation**. Structure, ranges, routings and documented behaviour follow the owner's
manual and the MIDI implementation. Undocumented curves and shapes are engineering choices
awaiting measurement (`docs/REFERENCE_CAPTURE.md`).

## Deliverables

| Item | Where |
|---|---|
| Sound engine (pure C++20, no dependencies) | `engine/src/` |
| VST3 instrument, Standalone, VST3 FX variant (JUCE 8.0.16-security) | `plugin/` |
| Windows x64 binaries (MSVC, built by CI) | GitHub Actions artifact **KestrelVA-windows-x64** (`.github/workflows/kestrel-va.yml`) |
| Linux x64 VST3 / Standalone | built locally and in CI (`docs/BUILD.md`) |
| Offline renderer, capture-set generator, comparison tool | `tools/` (`kestrel_render`, `kestrel_capture`, `kestrel_compare`) |
| Tests (65, ctest) | `tests/` |
| Host-side VST3 checker, UI snapshot tool | `plugin/tools/` |
| Factory bank (66 programs) | `presets/` |
| Architecture, sources, unknowns register | `docs/ARCHITECTURE.md` |
| Build, FL Studio, reference-capture guides | `docs/BUILD.md`, `docs/FL_STUDIO.md`, `docs/REFERENCE_CAPTURE.md` |
| Screenshots | `docs/images/` |

## Implemented

- **Program structure:** Synth Single/Layer and Vocoder programs; two complete timbres; effects
  chain MOD FX → DELAY → EQ; arpeggiator with target timbre.
- **OSC1:** Saw (two-phase saw, CONTROL 1 up to the octave), Square (PW 50 → 0 %, PWM), Triangle
  (wavefold up to octave + fifth), Sine (cross-mod by OSC2; vocoder variant), Vox, DWGS
  (64 documented slots; original approximations plus per-slot import of WAV or harmonic
  lists, stored in the plug-in state; Shepard-tone "Endless"), Noise (resonant key-tracked LPF),
  Audio In (IN1/IN2 balance). CONTROL 2 applies LFO1 modulation (or selects the DWGS slot).
- **OSC2:** Saw/Square/Triangle, SEMITONE, TUNE (documented anchors), Ring, Sync and
  RingSync with sub-sample-accurate sync.
- **Mixer** (OSC1/OSC2/independent white noise). **Filter**: −24 dB LPF, −12 dB LPF/BPF/HPF,
  resonance to self-oscillation, EG INT, key track (+48 = 100 %), hidden velocity-sense data
  bytes.
- **Two ADSR EGs** with EG RESET rules; **two LFOs** (documented shape sets, Square2
  unipolar, S&H) with KEY SYNC Off/Timbre/Voice and tempo sync to the 15 documented note
  values; **four virtual patches** with the documented 8 sources × 8 destinations; vibrato via
  MOD wheel × LFO2; pitch bend; portamento (with the first-note rule).
- **Voice modes:** Poly / Mono / Unison (detune spread per figure 1-4), trigger Single/Multi,
  last-note priority, **4-voice Compatibility allocation including the Layer splits** (p.16
  table), Extended mode (16 voices per timbre). Click-free voice stealing, sustain pedal,
  All Notes Off, All Sound Off, Reset All Controllers, and transport handling.
- **Arpeggiator:** Up/Down/Alt1/Alt2/Random/Trigger, range 1–4, gate, resolution, swing, latch,
  key sync, last step + 8-step pattern, internal or host clock (PPQ-locked), sample-accurate.
- **Effects:** Flanger/Chorus, Ensemble, Phaser; Stereo/Cross/L-R delay with tempo sync;
  2-band EQ with the exact documented frequency tables.
- **Vocoder:** 16 analysis + 16 synthesis band-pass filters on the documented frequency grid
  (table 6-1), 8 channel levels/pans, FORMANT SHIFT and CUTOFF along the grid, RESONANCE,
  E.F. SENSE with Formant Hold (saved with the program), THRESHOLD/GATE SENSE gate, HPF LEVEL
  with HPF GATE, DIRECT LEVEL, FC MOD, carrier from OSC1 + noise + AUDIO IN 2.
- **MIDI:** sample-accurate events; the hardware's default panel CC map (p.56 with the p.57
  value tables, synth and vocoder assignments, TIMBRE SELECT) and NRPNs, mirrored back to host
  parameters.
- **Host integration:** stable string parameter IDs (200 parameters, grouped), smoothing of
  host changes (10 ms), complete state recall (all parameters, imported DWGS data, formant hold
  levels), factory program list, latency reporting, any block size and sample rate (44.1–192
  kHz), FTZ/DAZ, non-finite guard, bounded feedback paths, and a lock-free UI → audio path
  (on-screen keyboard, wavetable swaps).
- **UI:** resizable (fixed aspect) panel with Timbre 1, Timbre 2, Modulation (patch matrix and
  dedicated routes with live values), FX/Arpeggiator, Vocoder (band meters) and Global (DWGS
  import, user programs) views; an LCD showing the last edited parameter and value; an
  on-screen keyboard. Fonts are embedded (OFL) and graphics are original.

## Verified

Engine tests (`ctest`, 65 tests, all passing on Linux and Windows CI) measured these results:

| Behaviour | Result |
|---|---|
| MIDI timing | note onsets within ±2 samples of the event + reported latency, for block sizes 64/256/1000 |
| Block-size independence | output identical (max difference < 1e-5) for blocks of 1, 7, 32, 256, 4096 and random sizes |
| Voice allocation | 4-voice limit with last-note priority; Layer splits Mono+Poly = 1+3, Poly+Poly = 2+2, Unison+Mono = 2+1 (manual table); only 2 keys in a Poly+Poly Layer; Extended mode raises the limit |
| Sustain / notes off | pedal holds and releases; can be disabled; All Notes Off releases; All Sound Off is silent within 10 ms |
| Stealing | no sample step > 0.05 while repeatedly stealing with EG RESET on |
| Envelope timing | attack and release (−60 dB) match the mapping within 30 ms / ±6 dB |
| Pitch | A4 within 0.2 cent at 44.1, 48, 96 and 192 kHz; transpose, tune, master tune and bend range exact |
| Saw spectrum | harmonics within 0.3 dB of 1/n; worst alias component −103.5 dB (110 Hz), −93 (440 Hz), −91 (880 Hz), −86 (1.76 kHz), −81.5 dB (2.64 kHz) at 48 kHz / 2× |
| CONTROL 1 | saw 127 = octave up (odd harmonics < −50 dB); square 50 % has no even harmonics (< −60 dB), 25 % nulls the 4th harmonic, 0 % is silent; triangle 127 = 3rd harmonic dominant |
| Sync / ring | sync output harmonic to OSC1 (inharmonic energy −84 to −91 dB); ring produces sum/difference with the carrier suppressed |
| Filter | −3.0 dB at fc, 24 and 12 dB/oct slopes, unity passbands; resonance peak grows monotonically; self-oscillation bounded (amplitude 0.1–3) with pitch within 35 cents of the cutoff; cutoff accurate to < 0.3 dB across 44.1–192 kHz; stable under random extreme modulation |
| Arpeggiator | Up/Down/Alt1/Alt2 sequences, timing for all resolutions to the sample, gate length, swing, last step and muted steps, latch, Trigger polyphony limit, host-grid alignment; arpeggiated notes do not reset Timbre-synced LFOs |
| Effects | delay time exact (synced and free), Cross and L/R routing, bounded at maximum feedback; EQ shelves ±12 dB and flat at 0 dB; MOD FX bypass at depth 0, stable at maximum |
| Vocoder | the band matching the modulator frequency responds strongest; formant shift moves the synthesis bands; Hold sustains with a silent modulator; end-to-end gated modulator tracking |
| Latency | onset shift equals the reported latency (0 / 25 / 28 samples at 1× / 2× / 4×); audio-in thru aligned |
| Oversampler | 20 kHz passband within 0.05 dB; images that could fold into the audio band below −90 dB |
| Stability | 6 s random-parameter fuzz with notes, CCs, bend, sustain and noise input at 44.1 and 96 kHz: always finite, peak ≤ 3.4, no non-finite events; extreme static settings bounded; exact digital silence after release |
| State / programs | program text round-trip; all 66 factory programs parse and render (finite, no clipping, audible) |
| CC map | documented CC/NRPN reception incl. p.57 tables, TIMBRE SELECT, switch off |

The host-side check (`KestrelPluginCheck`) runs locally and in Windows/Linux CI. It loads both
built **VST3 bundles** through a VST3 host layer, renders at three sample rates with fixed and
variable buffer sizes, and checks automation while rendering, the reported latency (25
samples), the program list (66) and **state recall into a fresh instance (0 mismatches)**.

CPU use (2.1 GHz Xeon, one core, 48 kHz): about 4.5 % for 4 voices with sync and effects at
2×, 4.9 % at 4×, 13 % for 16 voices (Extended), and 4.3 % for a 4-voice vocoder program.

## Not verified / limitations

- **No hardware comparison.** All [ENG] items in the unknowns register (`ARCHITECTURE.md` §12)
  are unmeasured: cutoff/resonance curves, filter topology and level dependence, EG/LFO/
  portamento/delay/MOD FX time curves, distortion curve, gain staging, Vox and DWGS waveforms,
  cross-mod type and depth, vocoder filter order, Q and follower ballistics, unison voice
  distribution beyond figure 1-4, and the Layer splits not listed in the manual.
- **FL Studio was not run.** The routing in `docs/FL_STUDIO.md` follows Image-Line's manual.
  The FX variant route is documented by Image-Line; feeding audio into the instrument variant
  in FL Studio is uncertain.
- **Steinberg's VST3 `validator` was not run.** Building the VST3 SDK from source was not
  permitted in the development environment; conformance was checked with the JUCE-based host
  check instead.
- The Windows UI was built and the plug-in loaded and rendered in CI, but the editor was only
  inspected visually on Linux (offscreen snapshots in `docs/images`).
- The DWGS tables are original approximations under the documented names, not KORG data.
  Users can import their own data per slot.
- The vocoder-program "Sine CONTROL 1" waveform change is undocumented; a wavefolder
  placeholder is used.
- SysEx program dumps are not implemented.
- OSC1 Audio In passes through the 2× input interpolator. That path has 25 samples more
  latency than reported (the vocoder and thru paths are aligned).

## Factory bank

The first 23 programs are the showcase requested for the project: **angelcore basses only**,
plus witch house / darkwave and deep house synths, keys, pads, plucks, arps, basses and
vocoders. Programs 24–66 are a **dark / sad / melancholic** collection: minor-mood pads,
worn keys, plucks, crying leads, heavy basses, drones, slow arps and dark vocoders. Every
program uses a different part of the engine (sync, ring, cross-mod, fold, DWGS, Vox, noise,
unison, Layer, arp patterns, tempo-synced LFO gating, patches, all three MOD FX and delay
types, vocoder formant shift). In the plug-in's program menu the programs are grouped under
their category.

| # | Program | Category |
|---|---|---|
| 1 | Init Program | Init |
| 2–7 | Halo Sub, Seraph Glide, Fallen Reese, Choir Pluck Bass, Nimbus Fold, Gate Halo | Angelcore Bass |
| 8–15 | Crypt Choir, Witch Drone, Hex Bells, Grave Arp, Velvet Coffin, Black Lace Keys, Phantom Organ, Ghost Sermon | Witch house / darkwave (pad, synth, keys, arp, lead, organ, vocoder) |
| 16–23 | Velvet Chord Stab, Late Night EP, Warehouse Organ Bass, Dub Pluck, Deep Sub Pulse, Sunday Pad, Soul Vocoder, Garage Swing Arp | Deep house (keys, EP, bass, pluck, pad, vocoder, arp) |
| 24–33 | Funeral Strings, Grey Morning, Ash Choir, Hollow Cathedral, Lost Signal, Winter Breath, Minor Haze, Requiem Layer, Dead Radio, Fog Bank | Dark Pad |
| 34–39 | Broken Music Box, Rain on Rhodes, Old Piano Ghost, Cold Organ, Glass Tears, Distant Clav | Melancholic Keys |
| 40–44 | Wilted Pluck, Shiver Pluck, Cracked Harp, Bitter Drops, Silent Koto | Sad Pluck |
| 45–49 | Lament Lead, Ghost Whistle, Sorrow Sync, Dirge Flute, Bleeding Vox | Dark Lead |
| 50–54 | Undertow Bass, Black Velvet Bass, Mourning Reese, Grave Dweller, Pulse of Regret | Dark Bass |
| 55–59 | Static Elegy, Abandoned Station, Night Tide, Rust Drone, Endless Descent | Dark Drone |
| 60–63 | Rain Arp, Memory Arp, Requiem Steps, Lullaby for None | Dark Arp |
| 64–66 | Hollow Choir Vocoder, Cold Machine Voice, Whisper Chant | Dark Vocoder |

Notes on the dark collection:

- *Minor Haze* plays a minor third on every key (OSC2 +3 semitones), so single notes already
  sound minor; play sparse voicings.
- *Requiem Layer* is a Layer program: in Compatibility mode each timbre gets 2 voices, so
  chords of more than two notes steal. Switch GLOBAL *Voice Allocation* to *Extended* for
  full chords.
- *Ghost Whistle* is a self-oscillating filter with full key tracking. It was measured in tune
  within 1 cent from C3 to C5.
- The arps (60–63) follow the host tempo while FL Studio plays. Hold a minor chord.
- The vocoders (64–66) need audio on AUDIO IN 1 (`docs/FL_STUDIO.md`). The whispered
  programs are quieter by nature (a noise carrier through narrow bands); raise the channel
  volume if needed.
- All levels were set with the preset audit (`tests/test_presets.cpp`): with a three-note
  chord and bass notes, every program peaks below 0 dBFS, most between −3 and −12 dBFS.

The angelcore genre research behind the bass programs is in `presets/notes/genre-research.md`.
Its sources are sample-pack and aggregator pages, because no authoritative definition of the
genre exists.

## Suggested next steps

1. Record the capture set on an original unit and replace the [ENG] curves with measured ones,
   starting with cutoff, resonance, EG times and the filter shape.
2. Run Steinberg's VST3 validator and test the routing in FL Studio (instrument with input
   versus the FX variant).
3. Compare DWGS and Vox recordings, and offer measured tables as an optional data pack (no
   redistribution of KORG data).
