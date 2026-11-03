// Kestrel VA — hardware-value -> physical-unit mappings.
//
// ALL curves that convert a hardware parameter value (0..127, -63..63, ...) into
// physical units live here, so they can be replaced after measurement without
// touching DSP code. Each function is tagged:
//   [DOC] value/anchor stated in the official documentation (page cited)
//   [FIG] read from an official figure
//   [ENG] engineering approximation; requires comparison with hardware
// See docs/ARCHITECTURE.md (Unknowns register) and docs/REFERENCE_CAPTURE.md.
#pragma once

namespace kestrel::mapping {

// ----- Pitch -------------------------------------------------------------
// [DOC p.47] Master tune: A4 = 430..450 Hz.
double noteToHz(double midiNote, double a4Hz) noexcept;

// [DOC p.22] OSC2 TUNE: +-48 = +-1 octave, +-63 = +-2 octaves, fine near 0.
// [ENG] curve between the documented anchors (quadratic to 48, then linear).
double osc2TuneCents(double v) noexcept;

// [ENG] Patch "Pitch" destination and VIBRATO INT depth: re-use the OSC2 TUNE
// curve (fine resolution near zero, +-2 octaves at +-63). Unmeasured.
double pitchModCents(double intensity) noexcept;

// [ENG] Portamento 0..127 -> exponential glide time constant in seconds (0 = off).
double portamentoTau(double v) noexcept;

// [FIG p.16 fig 1-4] Unison detune: voices evenly spread, total span = detune cents.
double unisonOffsetCents(int voiceIndex, int numVoices, double detuneCents) noexcept;

// ----- OSC1 control ---------------------------------------------------------
// [ENG] CONTROL 2 depth: LFO1 (+-1) * ctrl2 adds up to +-ctrl2 units to CONTROL 1.
double ctrl2Depth(double ctrl2) noexcept;
// [FIG p.18 fig 3-1] Saw: phase offset (cycles) between two summed saws, 0..0.5.
double sawPhaseOffset(double ctrl1) noexcept;
// [DOC p.18] Square: pulse width 50% (0) .. 0% (127); linear [ENG].
double pulseWidth(double ctrl1) noexcept;
// [FIG p.19 fig 3-3] Triangle: fold gain 1 (0) .. 3 (127), linear (63 ~ 2 matches fig).
double triangleFoldGain(double ctrl1) noexcept;
// [ENG] Sine cross-modulation: peak phase deviation in cycles for CONTROL 1.
double crossModDepthCycles(double ctrl1) noexcept;
// [FIG/DOC p.20] Noise LPF cutoff in Hz: semitone steps, 24 = key pitch (100% key tracking).
double noiseCutoffHz(double ctrl1, double keyHz) noexcept;
// [DOC p.21] Audio In balance: 127 = IN1 only, 0 = IN2 only (linear crossfade [ENG]).
double audioInBalanceIn1(double ctrl1) noexcept;

// ----- Mixer / amp --------------------------------------------------------
// [ENG] linear amplitude level 0..127 -> 0..1
double levelToGain(double v) noexcept;
// [ENG] equal-power pan, -63..63
void panGains(double pan, float& gl, float& gr) noexcept;
// [DOC p.27 sign/centre C4] [ENG slope] Amp keyboard track: dB per octave at +-63.
double ampKeyTrackGain(double noteDeltaFromC4, double kt) noexcept;
// [ENG] hidden "velocity sense" data bytes (MIDI imp. TABLE 2 +23/+28): 0 = no effect.
double ampVelSenseGain(double velocity01, double sense) noexcept;
double filterVelSenseSteps(double velocity01, double sense) noexcept;

// ----- Filter -------------------------------------------------------------
// [ENG] cutoff in "steps" (0..127 nominal, modulation may exceed) -> Hz.
// Semitone steps: f = 440 * 2^((steps + 8 - 69)/12)  (~13 Hz .. ~19.9 kHz).
double cutoffStepsToHz(double steps) noexcept;
// [DOC p.25] key track: +48 = cutoff follows pitch 1:1 around C4 (note 60).
double filterKeyTrackSteps(double noteDeltaFromC4, double kt) noexcept;
// [ENG] FILTER EG INT: steps added at EG = 1.0.
double filterEgSteps(double eg, double egInt) noexcept;
// [ENG] resonance 0..127 -> SVF damping k (= 1/Q) for 12 dB modes. Goes slightly
// negative at the top so that the filter self-oscillates [DOC p.25].
double resonanceToDamping12(double res) noexcept;
// [ENG] 24 dB mode stage-2 damping (stage 1 fixed at Butterworth k = 1.8478).
double resonanceToDamping24(double res) noexcept;
constexpr double kLp24Stage1Damping = 1.8477590650225735; // 1/0.5412 (4th-order Butterworth)

// ----- Envelopes ----------------------------------------------------------
// [ENG] EG time 0..127 -> seconds (attack: time to peak; decay/release: time to -60 dB).
double egTimeSeconds(double v) noexcept;
// [ENG] sustain 0..127 -> level 0..1 (linear)
double egSustainLevel(double v) noexcept;

// ----- LFO ----------------------------------------------------------------
// [ENG] LFO FREQUENCY 0..127 -> Hz
double lfoFreqHz(double v) noexcept;
// [DOC p.65, MIDI imp. *T-5] LFO sync note index -> length in quarter-note beats.
double lfoSyncNoteBeats(int index) noexcept;
// [DOC p.65, MIDI imp. *T-1] delay sync note index -> length in quarter-note beats.
double delaySyncNoteBeats(int index) noexcept;

// ----- Effects ------------------------------------------------------------
double modFxLfoHz(double speed) noexcept;          // [ENG]
double delayTimeSeconds(double v) noexcept;        // [ENG]
double eqLowFreqHz(int index) noexcept;            // [DOC MIDI imp. *T-11]
double eqHighFreqHz(int index) noexcept;           // [DOC MIDI imp. *T-10]

// ----- Arpeggiator --------------------------------------------------------
// [DOC p.44] resolution index -> step length in quarter-note beats.
double arpResolutionBeats(int index) noexcept;

// ----- Vocoder ------------------------------------------------------------
// [DOC p.35 table 6-1] 24-point frequency grid; shift 0 => filters at indices 4..19.
constexpr int kVocGridSize = 24;
double vocGridHz(int index) noexcept;
// [ENG] log-interpolated grid position (fractional index, extrapolated at ends).
double vocGridHzInterp(double position) noexcept;
// [DOC] formant shift choice index (0,+1,+2,-1,-2 order) -> grid steps
int formantShiftSteps(int choiceIndex) noexcept;
// [DOC p.35] CUTOFF +-63 => +-2 grid steps (continuous) [ENG: linear in steps]
double vocCutoffSteps(double cutoff) noexcept;
// [ENG] FC MOD intensity +-63 with source +-1 => +-2 grid steps
double vocFcModSteps(double src, double intensity) noexcept;
// [ENG] E.F. Sense 0..126 -> follower attack / release seconds
double vocFollowerAttack(double sense) noexcept;
double vocFollowerRelease(double sense) noexcept;
// [ENG] Threshold 0..127 -> linear gate threshold; Gate Sense -> gate release seconds
double vocGateThreshold(double v) noexcept;
double vocGateRelease(double v) noexcept;
constexpr double kVocHpfCutoffHz = 3500.0; // [ENG] HPF LEVEL path corner (undocumented)

// ----- Gain staging -------------------------------------------------------
// [ENG] gain applied to the summed voice output so a single full-level saw
// voice peaks near -12 dBFS (no hardware calibration available yet).
constexpr double kVoiceOutputGain = 0.25;
// [ENG] distortion pre-gain (manual: drive is set by the MIXER levels).
constexpr double kDistortionDrive = 2.0;

} // namespace kestrel::mapping
