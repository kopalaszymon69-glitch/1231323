// Kestrel VA — parameter table (single source of truth).
//
// Every user-facing parameter is declared exactly once here, with:
//   * a STABLE string ID (never renamed or reused; new parameters are appended),
//   * the hardware range in hardware units (e.g. 0..127, -63..63),
//   * the default value,
//   * an evidence tag (see docs/ARCHITECTURE.md):
//       Doc = range/meaning established by the official owner's manual / MIDI implementation,
//       Fig = behaviour inferred from an official figure,
//       Eng = engineering approximation (pending measurement),
//       Ext = optional extension that does not exist on the reference hardware.
//
// Values are stored as plain floats in hardware units. Physical mappings
// (Hz, seconds, dB ...) live in params/Mapping.cpp, never here.
#pragma once

#include <cstdint>
#include <string>

namespace kestrel {

enum class PKind : uint8_t { Float, Int, Choice, Bool };
enum class Evidence : uint8_t { Doc, Fig, Eng, Ext };

struct ParamInfo {
    std::string id;           // stable ID, e.g. "t1.filter.cutoff"
    std::string name;         // display name, e.g. "T1 Cutoff"
    const char* section;      // UI section ("OSC1", "FILTER", ...)
    float minV, maxV, defV;
    PKind kind;
    const char* const* choices;
    int numChoices;
    Evidence evidence;
    bool automatable;         // false for structural/global settings hosts should not automate
};

// ---------------------------------------------------------------- choice lists
namespace choices {
extern const char* const kAssign[3];
extern const char* const kTrigger[2];
extern const char* const kOsc1Wave[8];
extern const char* const kOsc2Wave[3];
extern const char* const kOscMod[4];
extern const char* const kFilterType[4];
extern const char* const kOffOn[2];
extern const char* const kLfo1Wave[4];
extern const char* const kLfo2Wave[4];
extern const char* const kKeySync[3];
extern const char* const kLfoSyncNote[15];
extern const char* const kDelaySyncNote[15];
extern const char* const kPatchSrc[8];
extern const char* const kPatchDst[8];
extern const char* const kVoiceMode[3];
extern const char* const kModFxType[3];
extern const char* const kDelayType[3];
extern const char* const kEqLowFreq[30];
extern const char* const kEqHiFreq[30];
extern const char* const kArpResolution[6];
extern const char* const kArpType[6];
extern const char* const kArpTarget[3];
extern const char* const kFormantShift[5];
extern const char* const kFcModSrc[7];
extern const char* const kHpfGate[2];
extern const char* const kClock[3];
extern const char* const kVoiceLimit[2];
extern const char* const kQuality[4];
} // namespace choices

// X(enum, idSuffix, displayName, section, min, max, default, kind, choices, nChoices, evidence, automatable)
// Timbre parameters exist twice: "t1.<suffix>" and "t2.<suffix>".
#define KESTREL_TIMBRE_PARAMS(X) \
    X(VoiceAssign,   "voice.assign",       "Voice Assign",   "VOICE",   0, 2, 1,   Choice, choices::kAssign, 3,   Doc, true) \
    X(TriggerMode,   "voice.trigger",      "Trigger Mode",   "VOICE",   0, 1, 1,   Choice, choices::kTrigger, 2,  Doc, true) \
    X(UnisonDetune,  "voice.unisonDetune", "Unison Detune",  "VOICE",   0, 99, 10, Int,    nullptr, 0,            Doc, true) \
    X(Transpose,     "pitch.transpose",    "Transpose",      "PITCH", -24, 24, 0,  Int,    nullptr, 0,            Doc, true) \
    X(Tune,          "pitch.tune",         "Tune",           "PITCH", -50, 50, 0,  Float,  nullptr, 0,            Doc, true) \
    X(BendRange,     "pitch.bendRange",    "Bend Range",     "PITCH", -12, 12, 2,  Int,    nullptr, 0,            Doc, true) \
    X(VibratoInt,    "pitch.vibratoInt",   "Vibrato Int",    "PITCH", -63, 63, 0,  Float,  nullptr, 0,            Doc, true) \
    X(Portamento,    "pitch.portamento",   "Portamento",     "PITCH",   0, 127, 0, Float,  nullptr, 0,            Doc, true) \
    X(Osc1Wave,      "osc1.wave",          "OSC1 Wave",      "OSC1",    0, 7, 0,   Choice, choices::kOsc1Wave, 8, Doc, true) \
    X(Osc1Ctrl1,     "osc1.ctrl1",         "OSC1 Control 1", "OSC1",    0, 127, 0, Float,  nullptr, 0,            Doc, true) \
    X(Osc1Ctrl2,     "osc1.ctrl2",         "OSC1 Control 2", "OSC1",    0, 127, 0, Float,  nullptr, 0,            Doc, true) \
    X(Osc1Dwgs,      "osc1.dwgs",          "OSC1 DWGS Wave", "OSC1",    1, 64, 1,  Int,    nullptr, 0,            Doc, true) \
    X(Osc2Wave,      "osc2.wave",          "OSC2 Wave",      "OSC2",    0, 2, 0,   Choice, choices::kOsc2Wave, 3, Doc, true) \
    X(Osc2Mod,       "osc2.mod",           "OSC Mod",        "OSC2",    0, 3, 0,   Choice, choices::kOscMod, 4,   Doc, true) \
    X(Osc2Semitone,  "osc2.semitone",      "OSC2 Semitone",  "OSC2",  -24, 24, 0,  Int,    nullptr, 0,            Doc, true) \
    X(Osc2Tune,      "osc2.tune",          "OSC2 Tune",      "OSC2",  -63, 63, 0,  Float,  nullptr, 0,            Doc, true) \
    X(MixOsc1,       "mixer.osc1",         "OSC1 Level",     "MIXER",   0, 127, 127, Float, nullptr, 0,           Doc, true) \
    X(MixOsc2,       "mixer.osc2",         "OSC2 Level",     "MIXER",   0, 127, 0, Float,  nullptr, 0,            Doc, true) \
    X(MixNoise,      "mixer.noise",        "Noise Level",    "MIXER",   0, 127, 0, Float,  nullptr, 0,            Doc, true) \
    X(FilterType,    "filter.type",        "Filter Type",    "FILTER",  0, 3, 0,   Choice, choices::kFilterType, 4, Doc, true) \
    X(Cutoff,        "filter.cutoff",      "Cutoff",         "FILTER",  0, 127, 127, Float, nullptr, 0,           Doc, true) \
    X(Resonance,     "filter.resonance",   "Resonance",      "FILTER",  0, 127, 0, Float,  nullptr, 0,            Doc, true) \
    X(FilterEgInt,   "filter.egInt",       "Filter EG Int",  "FILTER", -63, 63, 0, Float,  nullptr, 0,            Doc, true) \
    X(FilterKeyTrack,"filter.keyTrack",    "Filter Key Track","FILTER",-63, 63, 0, Float,  nullptr, 0,            Doc, true) \
    X(FilterVelSense,"filter.velSense",    "Filter Velocity Sense (data only)", "FILTER", -63, 63, 0, Int, nullptr, 0, Ext, true) \
    X(FegAttack,     "feg.attack",         "Filter EG Attack", "FILTER EG", 0, 127, 0,  Float, nullptr, 0,        Doc, true) \
    X(FegDecay,      "feg.decay",          "Filter EG Decay",  "FILTER EG", 0, 127, 64, Float, nullptr, 0,        Doc, true) \
    X(FegSustain,    "feg.sustain",        "Filter EG Sustain","FILTER EG", 0, 127, 0,  Float, nullptr, 0,        Doc, true) \
    X(FegRelease,    "feg.release",        "Filter EG Release","FILTER EG", 0, 127, 20, Float, nullptr, 0,        Doc, true) \
    X(FegReset,      "feg.reset",          "Filter EG Reset",  "FILTER EG", 0, 1, 0,    Bool,  choices::kOffOn, 2, Doc, true) \
    X(AmpLevel,      "amp.level",          "Amp Level",      "AMP",     0, 127, 127, Float, nullptr, 0,           Doc, true) \
    X(AmpPan,        "amp.pan",            "Panpot",         "AMP",   -63, 63, 0,  Float,  nullptr, 0,            Doc, true) \
    X(Distortion,    "amp.distortion",     "Distortion",     "AMP",     0, 1, 0,   Bool,   choices::kOffOn, 2,    Doc, true) \
    X(AmpKeyTrack,   "amp.keyTrack",       "Amp Kbd Track",  "AMP",   -63, 63, 0,  Float,  nullptr, 0,            Doc, true) \
    X(AmpVelSense,   "amp.velSense",       "Amp Velocity Sense (data only)", "AMP", -63, 63, 0, Int, nullptr, 0,   Ext, true) \
    X(AegAttack,     "aeg.attack",         "Amp EG Attack",  "AMP EG",  0, 127, 0,   Float, nullptr, 0,           Doc, true) \
    X(AegDecay,      "aeg.decay",          "Amp EG Decay",   "AMP EG",  0, 127, 64,  Float, nullptr, 0,           Doc, true) \
    X(AegSustain,    "aeg.sustain",        "Amp EG Sustain", "AMP EG",  0, 127, 127, Float, nullptr, 0,           Doc, true) \
    X(AegRelease,    "aeg.release",        "Amp EG Release", "AMP EG",  0, 127, 20,  Float, nullptr, 0,           Doc, true) \
    X(AegReset,      "aeg.reset",          "Amp EG Reset",   "AMP EG",  0, 1, 0,     Bool,  choices::kOffOn, 2,   Doc, true) \
    X(Lfo1Wave,      "lfo1.wave",          "LFO1 Wave",      "LFO1",    0, 3, 2,   Choice, choices::kLfo1Wave, 4, Doc, true) \
    X(Lfo1KeySync,   "lfo1.keySync",       "LFO1 Key Sync",  "LFO1",    0, 2, 0,   Choice, choices::kKeySync, 3,  Doc, true) \
    X(Lfo1TempoSync, "lfo1.tempoSync",     "LFO1 Tempo Sync","LFO1",    0, 1, 0,   Bool,   choices::kOffOn, 2,    Doc, true) \
    X(Lfo1Freq,      "lfo1.freq",          "LFO1 Frequency", "LFO1",    0, 127, 64, Float, nullptr, 0,            Doc, true) \
    X(Lfo1SyncNote,  "lfo1.syncNote",      "LFO1 Sync Note", "LFO1",    0, 14, 6,  Choice, choices::kLfoSyncNote, 15, Doc, true) \
    X(Lfo2Wave,      "lfo2.wave",          "LFO2 Wave",      "LFO2",    0, 3, 2,   Choice, choices::kLfo2Wave, 4, Doc, true) \
    X(Lfo2KeySync,   "lfo2.keySync",       "LFO2 Key Sync",  "LFO2",    0, 2, 0,   Choice, choices::kKeySync, 3,  Doc, true) \
    X(Lfo2TempoSync, "lfo2.tempoSync",     "LFO2 Tempo Sync","LFO2",    0, 1, 0,   Bool,   choices::kOffOn, 2,    Doc, true) \
    X(Lfo2Freq,      "lfo2.freq",          "LFO2 Frequency", "LFO2",    0, 127, 80, Float, nullptr, 0,            Doc, true) \
    X(Lfo2SyncNote,  "lfo2.syncNote",      "LFO2 Sync Note", "LFO2",    0, 14, 9,  Choice, choices::kLfoSyncNote, 15, Doc, true) \
    X(P1Src,         "patch1.src",         "Patch1 Source",  "PATCH",   0, 7, 0,   Choice, choices::kPatchSrc, 8, Doc, true) \
    X(P1Dst,         "patch1.dst",         "Patch1 Dest",    "PATCH",   0, 7, 0,   Choice, choices::kPatchDst, 8, Doc, true) \
    X(P1Int,         "patch1.int",         "Patch1 Mod Int", "PATCH", -63, 63, 0,  Float,  nullptr, 0,            Doc, true) \
    X(P2Src,         "patch2.src",         "Patch2 Source",  "PATCH",   0, 7, 2,   Choice, choices::kPatchSrc, 8, Doc, true) \
    X(P2Dst,         "patch2.dst",         "Patch2 Dest",    "PATCH",   0, 7, 4,   Choice, choices::kPatchDst, 8, Doc, true) \
    X(P2Int,         "patch2.int",         "Patch2 Mod Int", "PATCH", -63, 63, 0,  Float,  nullptr, 0,            Doc, true) \
    X(P3Src,         "patch3.src",         "Patch3 Source",  "PATCH",   0, 7, 3,   Choice, choices::kPatchSrc, 8, Doc, true) \
    X(P3Dst,         "patch3.dst",         "Patch3 Dest",    "PATCH",   0, 7, 1,   Choice, choices::kPatchDst, 8, Doc, true) \
    X(P3Int,         "patch3.int",         "Patch3 Mod Int", "PATCH", -63, 63, 0,  Float,  nullptr, 0,            Doc, true) \
    X(P4Src,         "patch4.src",         "Patch4 Source",  "PATCH",   0, 7, 4,   Choice, choices::kPatchSrc, 8, Doc, true) \
    X(P4Dst,         "patch4.dst",         "Patch4 Dest",    "PATCH",   0, 7, 5,   Choice, choices::kPatchDst, 8, Doc, true) \
    X(P4Int,         "patch4.int",         "Patch4 Mod Int", "PATCH", -63, 63, 0,  Float,  nullptr, 0,            Doc, true)

#define KESTREL_GLOBAL_PARAMS(X) \
    X(VoiceMode,     "prog.voiceMode",     "Voice Mode",     "VOICE",   0, 2, 0,   Choice, choices::kVoiceMode, 3, Doc, true) \
    X(ArpOn,         "arp.on",             "Arp On",         "ARPEG",   0, 1, 0,   Bool,   choices::kOffOn, 2,   Doc, true) \
    X(ArpTempo,      "arp.tempo",          "Arp Tempo",      "ARPEG",  20, 300, 120, Float, nullptr, 0,          Doc, true) \
    X(ArpResolution, "arp.resolution",     "Arp Resolution", "ARPEG",   0, 5, 1,   Choice, choices::kArpResolution, 6, Doc, true) \
    X(ArpGate,       "arp.gate",           "Arp Gate",       "ARPEG",   0, 100, 75, Float, nullptr, 0,           Doc, true) \
    X(ArpType,       "arp.type",           "Arp Type",       "ARPEG",   0, 5, 0,   Choice, choices::kArpType, 6, Doc, true) \
    X(ArpRange,      "arp.range",          "Arp Range",      "ARPEG",   1, 4, 1,   Int,    nullptr, 0,           Doc, true) \
    X(ArpLatch,      "arp.latch",          "Arp Latch",      "ARPEG",   0, 1, 0,   Bool,   choices::kOffOn, 2,   Doc, true) \
    X(ArpSwing,      "arp.swing",          "Arp Swing",      "ARPEG", -100, 100, 0, Float, nullptr, 0,           Doc, true) \
    X(ArpKeySync,    "arp.keySync",        "Arp Key Sync",   "ARPEG",   0, 1, 0,   Bool,   choices::kOffOn, 2,   Doc, true) \
    X(ArpLastStep,   "arp.lastStep",       "Arp Last Step",  "ARPEG",   1, 8, 8,   Int,    nullptr, 0,           Doc, true) \
    X(ArpStep1,      "arp.step1",          "Arp Step 1",     "ARPEG",   0, 1, 1,   Bool,   choices::kOffOn, 2,   Doc, true) \
    X(ArpStep2,      "arp.step2",          "Arp Step 2",     "ARPEG",   0, 1, 1,   Bool,   choices::kOffOn, 2,   Doc, true) \
    X(ArpStep3,      "arp.step3",          "Arp Step 3",     "ARPEG",   0, 1, 1,   Bool,   choices::kOffOn, 2,   Doc, true) \
    X(ArpStep4,      "arp.step4",          "Arp Step 4",     "ARPEG",   0, 1, 1,   Bool,   choices::kOffOn, 2,   Doc, true) \
    X(ArpStep5,      "arp.step5",          "Arp Step 5",     "ARPEG",   0, 1, 1,   Bool,   choices::kOffOn, 2,   Doc, true) \
    X(ArpStep6,      "arp.step6",          "Arp Step 6",     "ARPEG",   0, 1, 1,   Bool,   choices::kOffOn, 2,   Doc, true) \
    X(ArpStep7,      "arp.step7",          "Arp Step 7",     "ARPEG",   0, 1, 1,   Bool,   choices::kOffOn, 2,   Doc, true) \
    X(ArpStep8,      "arp.step8",          "Arp Step 8",     "ARPEG",   0, 1, 1,   Bool,   choices::kOffOn, 2,   Doc, true) \
    X(ArpTarget,     "arp.target",         "Arp Target Timbre","ARPEG", 0, 2, 0,   Choice, choices::kArpTarget, 3, Doc, true) \
    X(ModFxType,     "fx.mod.type",        "Mod FX Type",    "MOD FX",  0, 2, 0,   Choice, choices::kModFxType, 3, Doc, true) \
    X(ModFxSpeed,    "fx.mod.speed",       "Mod FX LFO Speed","MOD FX", 0, 127, 20, Float, nullptr, 0,           Doc, true) \
    X(ModFxDepth,    "fx.mod.depth",       "Mod FX Depth",   "MOD FX",  0, 127, 0, Float,  nullptr, 0,           Doc, true) \
    X(DelayType,     "fx.delay.type",      "Delay Type",     "DELAY",   0, 2, 0,   Choice, choices::kDelayType, 3, Doc, true) \
    X(DelaySync,     "fx.delay.sync",      "Delay Tempo Sync","DELAY",  0, 1, 0,   Bool,   choices::kOffOn, 2,   Doc, true) \
    X(DelayTime,     "fx.delay.time",      "Delay Time",     "DELAY",   0, 127, 64, Float, nullptr, 0,           Doc, true) \
    X(DelaySyncNote, "fx.delay.syncNote",  "Delay Sync Note","DELAY",   0, 14, 5,  Choice, choices::kDelaySyncNote, 15, Doc, true) \
    X(DelayDepth,    "fx.delay.depth",     "Delay Depth",    "DELAY",   0, 127, 0, Float,  nullptr, 0,           Doc, true) \
    X(EqLowFreq,     "fx.eq.lowFreq",      "Low EQ Freq",    "EQ",      0, 29, 4,  Choice, choices::kEqLowFreq, 30, Doc, true) \
    X(EqLowGain,     "fx.eq.lowGain",      "Low EQ Gain",    "EQ",    -12, 12, 0,  Float,  nullptr, 0,           Doc, true) \
    X(EqHiFreq,      "fx.eq.hiFreq",       "Hi EQ Freq",     "EQ",      0, 29, 12, Choice, choices::kEqHiFreq, 30, Doc, true) \
    X(EqHiGain,      "fx.eq.hiGain",       "Hi EQ Gain",     "EQ",    -12, 12, 0,  Float,  nullptr, 0,           Doc, true) \
    X(VocGateSense,  "voc.in1.gateSense",  "Gate Sense",     "AUDIO IN 1", 0, 127, 32, Float, nullptr, 0,        Doc, true) \
    X(VocThreshold,  "voc.in1.threshold",  "Threshold",      "AUDIO IN 1", 0, 127, 0, Float, nullptr, 0,         Doc, true) \
    X(VocHpfLevel,   "voc.in1.hpfLevel",   "HPF Level",      "AUDIO IN 1", 0, 127, 0, Float, nullptr, 0,         Doc, true) \
    X(VocHpfGate,    "voc.in1.hpfGate",    "HPF Gate",       "AUDIO IN 1", 0, 1, 1,  Choice, choices::kHpfGate, 2, Doc, true) \
    X(VocMixOsc1,    "voc.mixer.osc1",     "Voc OSC1 Level", "VOC MIXER", 0, 127, 127, Float, nullptr, 0,        Doc, true) \
    X(VocMixInst,    "voc.mixer.inst",     "Voc Inst Level", "VOC MIXER", 0, 127, 0, Float, nullptr, 0,          Doc, true) \
    X(VocMixNoise,   "voc.mixer.noise",    "Voc Noise Level","VOC MIXER", 0, 127, 0, Float, nullptr, 0,          Doc, true) \
    X(VocFormantShift,"voc.filter.formantShift","Formant Shift","VOC FILTER", 0, 4, 0, Choice, choices::kFormantShift, 5, Doc, true) \
    X(VocCutoff,     "voc.filter.cutoff",  "Voc Cutoff",     "VOC FILTER", -63, 63, 0, Float, nullptr, 0,        Doc, true) \
    X(VocResonance,  "voc.filter.resonance","Voc Resonance", "VOC FILTER", 0, 127, 0, Float, nullptr, 0,         Doc, true) \
    X(VocFcModSrc,   "voc.fcmod.src",      "FC Mod Source",  "FC MOD",  0, 6, 0,   Choice, choices::kFcModSrc, 7, Doc, true) \
    X(VocFcModInt,   "voc.fcmod.int",      "FC Mod Intensity","FC MOD", -63, 63, 0, Float, nullptr, 0,           Doc, true) \
    X(VocEfSense,    "voc.filter.efSense", "E.F. Sense (127=Hold)", "VOC FILTER", 0, 127, 40, Int, nullptr, 0,   Doc, true) \
    X(VocLevel,      "voc.amp.level",      "Voc Level",      "VOC AMP", 0, 127, 127, Float, nullptr, 0,          Doc, true) \
    X(VocDirectLevel,"voc.amp.directLevel","Direct Level",   "VOC AMP", 0, 127, 0, Float,  nullptr, 0,           Doc, true) \
    X(VocDistortion, "voc.amp.distortion", "Voc Distortion", "VOC AMP", 0, 1, 0,   Bool,   choices::kOffOn, 2,   Doc, true) \
    X(VocKeyTrack,   "voc.amp.keyTrack",   "Voc Kbd Track",  "VOC AMP", -63, 63, 0, Float, nullptr, 0,           Doc, true) \
    X(VocVelSense,   "voc.amp.velSense",   "Voc Velocity Sense (data only)", "VOC AMP", -63, 63, 0, Int, nullptr, 0, Ext, true) \
    X(VocCh1Level,   "voc.ch1.level",      "CH1 Level",      "CH LEVEL", 0, 127, 127, Float, nullptr, 0,         Doc, true) \
    X(VocCh2Level,   "voc.ch2.level",      "CH2 Level",      "CH LEVEL", 0, 127, 127, Float, nullptr, 0,         Doc, true) \
    X(VocCh3Level,   "voc.ch3.level",      "CH3 Level",      "CH LEVEL", 0, 127, 127, Float, nullptr, 0,         Doc, true) \
    X(VocCh4Level,   "voc.ch4.level",      "CH4 Level",      "CH LEVEL", 0, 127, 127, Float, nullptr, 0,         Doc, true) \
    X(VocCh5Level,   "voc.ch5.level",      "CH5 Level",      "CH LEVEL", 0, 127, 127, Float, nullptr, 0,         Doc, true) \
    X(VocCh6Level,   "voc.ch6.level",      "CH6 Level",      "CH LEVEL", 0, 127, 127, Float, nullptr, 0,         Doc, true) \
    X(VocCh7Level,   "voc.ch7.level",      "CH7 Level",      "CH LEVEL", 0, 127, 127, Float, nullptr, 0,         Doc, true) \
    X(VocCh8Level,   "voc.ch8.level",      "CH8 Level",      "CH LEVEL", 0, 127, 127, Float, nullptr, 0,         Doc, true) \
    X(VocCh1Pan,     "voc.ch1.pan",        "CH1 Pan",        "CH PAN", -63, 63, 0, Float, nullptr, 0,            Doc, true) \
    X(VocCh2Pan,     "voc.ch2.pan",        "CH2 Pan",        "CH PAN", -63, 63, 0, Float, nullptr, 0,            Doc, true) \
    X(VocCh3Pan,     "voc.ch3.pan",        "CH3 Pan",        "CH PAN", -63, 63, 0, Float, nullptr, 0,            Doc, true) \
    X(VocCh4Pan,     "voc.ch4.pan",        "CH4 Pan",        "CH PAN", -63, 63, 0, Float, nullptr, 0,            Doc, true) \
    X(VocCh5Pan,     "voc.ch5.pan",        "CH5 Pan",        "CH PAN", -63, 63, 0, Float, nullptr, 0,            Doc, true) \
    X(VocCh6Pan,     "voc.ch6.pan",        "CH6 Pan",        "CH PAN", -63, 63, 0, Float, nullptr, 0,            Doc, true) \
    X(VocCh7Pan,     "voc.ch7.pan",        "CH7 Pan",        "CH PAN", -63, 63, 0, Float, nullptr, 0,            Doc, true) \
    X(VocCh8Pan,     "voc.ch8.pan",        "CH8 Pan",        "CH PAN", -63, 63, 0, Float, nullptr, 0,            Doc, true) \
    X(MasterTune,    "global.masterTune",  "Master Tune",    "GLOBAL", 430, 450, 440, Float, nullptr, 0,         Doc, false) \
    X(MasterTranspose,"global.masterTranspose","Master Transpose","GLOBAL", -12, 12, 0, Int, nullptr, 0,          Doc, false) \
    X(VelocityCurve, "global.velocityCurve","Velocity Curve (0=Curve)", "GLOBAL", 0, 127, 0, Int, nullptr, 0,     Doc, false) \
    X(Clock,         "global.clock",       "Arp/LFO Clock",  "GLOBAL",  0, 2, 2,   Choice, choices::kClock, 3,   Doc, false) \
    X(AudioInThru,   "global.audioInThru", "Audio In Thru",  "GLOBAL",  0, 1, 0,   Bool,   choices::kOffOn, 2,   Doc, false) \
    X(VoiceLimit,    "global.voiceLimit",  "Voice Allocation","GLOBAL", 0, 1, 0,   Choice, choices::kVoiceLimit, 2, Ext, false) \
    X(Quality,       "global.quality",     "Oversampling",   "GLOBAL",  0, 3, 0,   Choice, choices::kQuality, 4, Ext, false) \
    X(Damper,        "global.damper",      "Sustain Pedal (CC64)", "GLOBAL", 0, 1, 1, Bool, choices::kOffOn, 2,   Ext, false) \
    X(MasterVolume,  "global.volume",      "Master Volume dB","GLOBAL", -60, 6, 0, Float, nullptr, 0,            Ext, true)

enum TP : int {
#define KX(e, ...) e,
    KESTREL_TIMBRE_PARAMS(KX)
#undef KX
    TP_COUNT
};

enum GP : int {
#define KX(e, ...) e,
    KESTREL_GLOBAL_PARAMS(KX)
#undef KX
    GP_COUNT
};

constexpr int kNumTimbres = 2;
constexpr int kNumParams = kNumTimbres * TP_COUNT + GP_COUNT;

constexpr int pT(int timbre, TP p) noexcept { return timbre * TP_COUNT + int(p); }
constexpr int pG(GP p) noexcept { return kNumTimbres * TP_COUNT + int(p); }

const ParamInfo& paramInfo(int index);
int findParam(const std::string& id); // -1 if unknown

// Converts a plain value to display text in hardware style (e.g. "L12", "-24dB LPF", "R63").
std::string formatParamValue(int index, float plainValue);

// Clamp + quantize a plain value to the parameter's legal values.
float sanitizeParamValue(int index, float plainValue);

// Patch source / destination indices (hardware order, MIDI imp. *T-3 / *T-4)
enum class PatchSrc : int { FilterEG = 0, AmpEG, LFO1, LFO2, Velocity, KbdTrack, PitchBend, ModWheel };
enum class PatchDst : int { Pitch = 0, Osc2Tune, Osc1Ctrl1, NoiseLevel, Cutoff, Amp, Pan, Lfo2Freq };

enum class Wave1 : int { Saw = 0, Square, Triangle, Sine, Vox, Dwgs, Noise, AudioIn };
enum class FilterKind : int { LP24 = 0, LP12, BP12, HP12 };
enum class ProgMode : int { Single = 0, Layer, Vocoder };
enum class Assign : int { Mono = 0, Poly, Unison };

} // namespace kestrel
