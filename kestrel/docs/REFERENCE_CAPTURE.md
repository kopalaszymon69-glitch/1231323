# Reference capture and comparison procedure

Kestrel's engine follows the documented behaviour of the original 2002 microKORG. Every
quantity the documentation leaves open (cutoff in Hz, EG times, LFO rates, filter shape,
distortion curve, delay times...) is an **engineering approximation** in
`engine/src/params/Mapping.cpp` or in a self-contained DSP class (see the unknowns register in
`ARCHITECTURE.md` §12). This procedure produces the hardware recordings needed to replace those
approximations with measured models, and to check the result.

Without such recordings, Kestrel must be described as an approximation. A null test alone does
not establish perceptual accuracy.

## 1. Generate the test set

```bash
build/tools/kestrel_capture capture --render --rate 48000
```

This writes, per test (66 tests):

- `NN_name.mid`: a Standard MIDI File (type 0, 480 PPQ, 120 BPM). The first second is a
  **setup block** that configures the unit through its documented default CC map (owner's
  manual p.56; value tables p.57) and NRPNs (virtual patch source and destination). The
  test performance (notes, velocities, CC ramps) follows from t = 1 s.
- `NN_name.kvp`: the equivalent Kestrel program.
- `NN_name.kestrel.wav`: Kestrel's render of the same performance (with `--render`).
- `manifest.md`: every test with its purpose, length and the **panel settings that cannot be
  sent over MIDI** (e.g. VOICE ASSIGN, TRIGGER MODE, MOD FX TYPE, Layer).

The test groups are listed below; the manifest is the authoritative list.

| Group | Tests | Measures |
|---|---|---|
| Calibration | `calibration_sine_a4` | absolute level (sine A4, velocity 127, open filter) and noise floor (2 s silence) |
| Isolated OSC1 | `osc1_<wave>_ctrl1_<v>` for Saw, Square, Triangle, Sine, Vox at CONTROL 1 = 0/32/64/96/127, notes C2..C7 | spectra vs pitch and CONTROL 1; aliasing / bandwidth near Nyquist (high notes) |
| DWGS | `osc1_dwgs_all` (64 waves at C4) | harmonic content of every DWGS slot (data for `dwgs::approximation()` or for import as user data) |
| Noise | `osc1_noise_filter` | OSC1 noise LPF cutoff/resonance and key tracking (CTRL1 = 24 reference) |
| OSC2 | `osc2_<wave>`, `osc2_tune_curve` (TUNE ramp -63..+63) | OSC2 shapes; the TUNE curve between the documented anchors |
| Sync / ring | `oscmod_{Ring,Sync,RingSync}_semitone_sweep` | sync/ring spectra and aliasing at A2 and A4 |
| Filter | `filter_<type>_res<r>_noise_sweep` (4 types × res 0/64/100/127), `filter_self_oscillation_pitch`, `filter_input_level`, `filter_keytrack` | cutoff → Hz, slopes and shapes, resonance curve, self-oscillation pitch and amplitude, level dependence, key track |
| Envelopes | `amp_eg_{attack,decay,release}_times`, `filter_eg_decay_sweep` | EG time curves (0..127 → s) and segment shapes |
| LFO | `lfo1_rate_and_shape`, `lfo2_rate_and_shape` | LFO rates for FREQUENCY 20/64/100 and wave shapes (via LFO → Pitch) |
| Pitch / voices | `portamento_times`, `unison_detune`, `velocity_to_amp`, `voice_allocation` | glide curve, unison spread, velocity response, last-note priority and Layer split |
| Effects | `delay_times`, `modfx_types` | delay time curve, MOD FX speeds and depths |
| Complete patches | `patch_pluck_bass`, `patch_sync_lead` | representative musical patches specified completely on both instruments |

## 2. Prepare the hardware

1. **Unit and firmware:** an original microKORG (2002, *not* microKORG XL or microKORG 2). Note
   the serial number, and the firmware version if available. Let it warm up for 15 minutes
   (power supply and analog output stage).
2. **Global:** MASTER TUNE 440.0, MASTER TRANSPOSE 0, VELOCITY CURVE *Curve*, MIDI CH 1,
   LOCAL OFF, CLOCK *Internal*, SHIFT functions *MIDI FILTER: Control Change = Enable,
   Program Change = Disable*.
3. **Program:** for every test, select a scratch program location and initialise it (SHIFT +
   INIT PROGRAM, owner's manual p.59). Then make the panel settings from the manifest. The MIDI
   setup block sets everything else. Do not write (save) the program.
4. **Effects off** unless the test is about effects: MOD FX DEPTH 0, DELAY DEPTH 0 (both sent
   by CC), EQ LOW/HI GAIN 0 (by hand).
5. **Volume:** set the VOLUME knob to maximum and leave it there for the entire session. Use
   the calibration test to set the interface gain (below).

## 3. Recording requirements

- **Dry, direct and stereo:** connect OUTPUT L/MONO and R directly to a clean line input
  (balanced or unbalanced, no DI box, no mixer EQ or dynamics). Keep both channels.
- **Format:** 24-bit (or 32-bit float) WAV, 48 kHz. Also record 96 kHz for the oscillator and
  sync tests (`osc1_*`, `oscmod_*`), so that content near and above 20 kHz can be inspected.
- **Level calibration:** play `01_calibration_sine_a4` and set the interface gain so that
  the sine peaks at **-12 dBFS ± 0.5 dB**. Do not change the gain afterwards. Record the
  converter's stated input sensitivity (dBu at 0 dBFS) so absolute levels can be reconstructed.
- **Timing:** start each recording at least 1 s before playing the MIDI file. Record the whole
  file, including the setup block. Alignment is done in software.
- **MIDI:** play the files from a sequencer with a stable MIDI interface (DIN). Record the MIDI
  interface model. USB-MIDI jitter is tolerated by the analysis but should be noted.
- **Noise and hum:** use the 2 s silence in the calibration test to measure the noise floor.
  If hum is present, fix the grounding rather than filtering it.
- **Naming:** `NN_name.hw.wav` (same stem as the MIDI file), one file per test. Keep a session
  log with date, unit serial, interface, sample rate and any deviation from the manifest.

## 4. Compare

```bash
build/tools/kestrel_compare capture/12_filter_0_res100_noise_sweep.hw.wav capture/12_filter_0_res100_noise_sweep.kestrel.wav --report report.md --csv env.csv
```

For pitched monophonic tests, add `--f0`. The tool performs these steps:

1. **Aligns** the two signals: a coarse lag from the normalised correlation of 5 ms energy
   envelopes, then a fine lag from waveform cross-correlation. Differences in filter phase
   can bias the fine lag by up to about 1 ms, which is harmless for the metrics below.
2. **Calibrates level** (an RMS ratio over the region where both are above -50 dB) and reports
   the gain. Across a session this gain should be constant. The calibration test defines it.
3. Reports:
   - the envelope difference (10 ms RMS, dB) and per-note attack and release times;
   - the long-term 1/3-octave spectrum difference;
   - the time-varying spectral distance (mean, median and 90th percentile over STFT frames);
   - the F0 difference in cents (optional);
   - the null residual, **for information only**. Free-running oscillator and LFO phases,
     noise and sub-sample timing make the null residual large even when two sounds are
     perceptually identical. Never use it as the acceptance criterion.

## 5. Turning measurements into models

| Measurement | Update |
|---|---|
| Self-oscillation pitch per CUTOFF value; −3 dB points from noise sweeps | `mapping::cutoffStepsToHz` |
| Peak height vs RESONANCE, onset of self-oscillation, passband loss | `mapping::resonanceToDamping12/24`; `Svf` limiter constants; `MultimodeFilter` structure if the shapes differ |
| Filter transfer-function shapes per type | replace the `MultimodeFilter` model (self-contained class) |
| EG times and segment shapes | `mapping::egTimeSeconds`, `Envelope` segment law |
| LFO rates and shapes | `mapping::lfoFreqHz`, `Lfo::valueAt` |
| OSC2 TUNE curve, PITCH/VIBRATO depth | `mapping::osc2TuneCents`, `mapping::pitchModCents` |
| Portamento | `mapping::portamentoTau` (and constant-time vs. constant-rate law) |
| Velocity response (velocity → amp patch) | patch scaling in `Voice::render`, `mapping::levelToGain` |
| DWGS spectra | `dwgs::approximation()`, or ship measured data |
| Delay time / MOD FX | `mapping::delayTimeSeconds`, `mapping::modFxLfoHz`, `ModFx` internals |
| Aliasing patterns, bandwidth limits, quantisation found on the hardware | model them explicitly in **Compatibility mode only** (never by accident) |

After each change: re-run `ctest`, re-render the capture set, compare again, and record the
evidence level as **[MEAS]** in `ARCHITECTURE.md`, citing the session and test numbers.

## 6. Listening tests

Spectral and envelope agreement is necessary but not sufficient. For the complete-patch tests,
and for a few factory-style sounds programmed identically on both instruments, run blind ABX
or MUSHRA-style listening comparisons at matched loudness (equalise level with the calibration
gain first) and report the results with the objective metrics.
