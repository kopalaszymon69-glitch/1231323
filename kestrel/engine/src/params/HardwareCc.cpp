#include "params/HardwareCc.h"

#include <algorithm>

namespace kestrel {

namespace {
// p.57 "OSC 2 Semitone values": lowest CC value of each semitone step (-24..+24)
constexpr int kSemiStart[49] = { 0,  3,  6,  8,  11, 14, 16, 19, 21, 24, 27, 29, 32, 34, 37, 40, 42,
                                 45, 48, 50, 53, 55, 58, 61, 63, 66, 68, 71, 74, 76, 79, 81, 84, 87,
                                 89, 92, 95, 97, 100, 102, 105, 108, 110, 113, 115, 118, 121, 123, 126 };

float bipolar(int v) { return float(std::clamp(v - 64, -63, 63)); }                // 0/1 -> -63, 64 -> 0, 127 -> +63
int quarter(int v) { return std::clamp(v / 32, 0, 3); }                             // 0..31, 32..63, 64..95, 96..127
int lfoSyncNote(int v) {                                                             // p.57 table (LFO column)
    static const int lo[15] = { 0, 9, 18, 26, 35, 43, 52, 60, 69, 77, 86, 94, 103, 111, 120 };
    int i = 0;
    while (i < 14 && v >= lo[i + 1]) ++i;
    return i;
}
} // namespace

int HardwareCcMap::semitoneFromCc(int v) noexcept {
    int i = 0;
    while (i < 48 && v >= kSemiStart[i + 1]) ++i;
    return i - 24;
}

int HardwareCcMap::controlChange(int cc, int v, ProgMode mode, int ts, const float* cur, CcTarget out[2]) noexcept {
    v = std::clamp(v, 0, 127);
    const bool voc = mode == ProgMode::Vocoder;
    int n = 0;
    auto timbre = [&](TP p, float value) {
        const bool t1 = voc || ts == 0 || ts == 1;
        const bool t2 = !voc && mode == ProgMode::Layer && (ts == 1 || ts == 2);
        if (t1 && n < 2) out[n++] = { pT(0, p), value };
        if (t2 && n < 2) out[n++] = { pT(1, p), value };
    };
    auto global = [&](GP p, float value) { if (n < 2) out[n++] = { pG(p), value }; };
    const int tsel = (ts == 2 && mode == ProgMode::Layer) ? 1 : 0; // timbre whose state decides value tables
    auto curT = [&](TP p) { return cur[pT(tsel, p)]; };
    switch (cc) {
        case 5: timbre(Portamento, float(v)); break;
        case 77: timbre(Osc1Wave, float(std::clamp(v / 16, 0, 7))); break;
        case 14: timbre(Osc1Ctrl1, float(v)); break;
        case 15:
            if (int(curT(Osc1Wave)) == int(Wave1::Dwgs)) timbre(Osc1Dwgs, float(v / 2 + 1)); // p.57 DWGS table
            else timbre(Osc1Ctrl2, float(v));
            break;
        case 78: if (!voc) timbre(Osc2Wave, float(v <= 42 ? 0 : (v <= 85 ? 1 : 2))); break;
        case 82: if (!voc) timbre(Osc2Mod, float(quarter(v))); break;
        case 18: if (voc) global(VocHpfLevel, float(v)); else timbre(Osc2Semitone, float(semitoneFromCc(v))); break;
        case 19: if (voc) global(VocThreshold, float(v)); else timbre(Osc2Tune, bipolar(v)); break;
        case 20: if (voc) global(VocMixOsc1, float(v)); else timbre(MixOsc1, float(v)); break;
        case 21: if (voc) global(VocMixInst, float(v)); else timbre(MixOsc2, float(v)); break;
        case 22: if (voc) global(VocMixNoise, float(v)); else timbre(MixNoise, float(v)); break;
        case 83:
            if (voc) global(VocFormantShift, float(v <= 25 ? 0 : (v <= 51 ? 1 : (v <= 76 ? 2 : (v <= 102 ? 3 : 4)))));
            else timbre(FilterType, float(quarter(v)));
            break;
        case 74: if (voc) global(VocCutoff, bipolar(v)); else timbre(Cutoff, float(v)); break;
        case 71: if (voc) global(VocResonance, float(v)); else timbre(Resonance, float(v)); break;
        case 79: if (voc) global(VocFcModInt, bipolar(v)); else timbre(FilterEgInt, bipolar(v)); break;
        case 85: if (voc) global(VocEfSense, float(v)); else timbre(FilterKeyTrack, bipolar(v)); break;
        case 23: if (!voc) timbre(FegAttack, float(v)); break;
        case 24: if (!voc) timbre(FegDecay, float(v)); break;
        case 25: if (!voc) timbre(FegSustain, float(v)); break;
        case 26: if (!voc) timbre(FegRelease, float(v)); break;
        case 7: if (voc) global(VocLevel, float(v)); else timbre(AmpLevel, float(v)); break;
        case 10: if (voc) global(VocDirectLevel, float(v)); else timbre(AmpPan, bipolar(v)); break;
        case 92: if (voc) global(VocDistortion, v >= 64 ? 1.0f : 0.0f); else timbre(Distortion, v >= 64 ? 1.0f : 0.0f); break;
        case 73: timbre(AegAttack, float(v)); break;
        case 75: timbre(AegDecay, float(v)); break;
        case 70: timbre(AegSustain, float(v)); break;
        case 72: timbre(AegRelease, float(v)); break;
        case 87: timbre(Lfo1Wave, float(quarter(v))); break;
        case 27: if (curT(Lfo1TempoSync) >= 0.5f) timbre(Lfo1SyncNote, float(lfoSyncNote(v))); else timbre(Lfo1Freq, float(v)); break;
        case 88: timbre(Lfo2Wave, float(quarter(v))); break;
        case 76: if (curT(Lfo2TempoSync) >= 0.5f) timbre(Lfo2SyncNote, float(lfoSyncNote(v))); else timbre(Lfo2Freq, float(v)); break;
        case 28: if (!voc) timbre(P1Int, bipolar(v)); break;
        case 29: if (!voc) timbre(P2Int, bipolar(v)); break;
        case 30: if (!voc) timbre(P3Int, bipolar(v)); break;
        case 31: if (!voc) timbre(P4Int, bipolar(v)); break;
        case 12: global(ModFxSpeed, float(v)); break;
        case 93: global(ModFxDepth, float(v)); break;
        case 13:
            // DELAY sync note column runs 1/32 .. 1/1 (p.57) -> same thresholds as the LFO table
            if (cur[pG(DelaySync)] >= 0.5f) global(DelaySyncNote, float(lfoSyncNote(v)));
            else global(DelayTime, float(v));
            break;
        case 94: global(DelayDepth, float(v)); break;
        default: break;
    }
    return n;
}

int HardwareCcMap::nrpn(int msb, int lsb, int v, ProgMode mode, int ts, const float*, CcTarget out[2]) noexcept {
    v = std::clamp(v, 0, 127);
    const bool voc = mode == ProgMode::Vocoder;
    int n = 0;
    auto timbre = [&](TP p, float value) {
        const bool t1 = voc || ts == 0 || ts == 1;
        const bool t2 = !voc && mode == ProgMode::Layer && (ts == 1 || ts == 2);
        if (t1 && n < 2) out[n++] = { pT(0, p), value };
        if (t2 && n < 2) out[n++] = { pT(1, p), value };
    };
    auto global = [&](GP p, float value) { if (n < 2) out[n++] = { pG(p), value }; };
    if (msb == 0x00) {
        switch (lsb) {
            case 0x02: global(ArpOn, v >= 64 ? 1.0f : 0.0f); break;
            case 0x03: global(ArpRange, float(std::clamp(v, 0, 3) + 1)); break;
            case 0x04: global(ArpLatch, v >= 64 ? 1.0f : 0.0f); break;
            case 0x07: { // *2-1
                const int t = v <= 0x15 ? 0 : (v <= 0x2A ? 1 : (v <= 0x3F ? 2 : (v <= 0x55 ? 3 : (v <= 0x6A ? 4 : 5))));
                global(ArpType, float(t));
                break;
            }
            case 0x0A: global(ArpGate, float((v * 100) / 127)); break; // *2-2 (0..127 -> 0..100 %, truncated as tabulated)
            default: break;
        }
    } else if (msb == 0x04) {
        if (lsb <= 0x03) {
            if (voc && lsb == 0x00) {
                // FC MOD source (*2-3 groups; vocoder list starts at AMP EG = group 1)
                const int g = v / 16;
                if (g >= 1) global(VocFcModSrc, float(std::clamp(g - 1, 0, 6)));
            } else if (!voc) {
                timbre(TP(P1Src + 3 * lsb), float(std::clamp(v / 16, 0, 7)));
            }
        } else if (lsb >= 0x08 && lsb <= 0x0B) {
            if (!voc) timbre(TP(P1Dst + 3 * (lsb - 0x08)), float(std::clamp(v / 16, 0, 7)));
        } else if (lsb >= 0x10 && lsb <= 0x1E && (lsb % 2) == 0) {
            if (voc) global(GP(VocCh1Level + (lsb - 0x10) / 2), float(v));
        } else if (lsb >= 0x20 && lsb <= 0x2E && (lsb % 2) == 0) {
            if (voc) global(GP(VocCh1Pan + (lsb - 0x20) / 2), float(std::clamp(v - 64, -63, 63)));
        }
    }
    return n;
}

} // namespace kestrel
