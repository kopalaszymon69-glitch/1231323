#include "params/Params.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <unordered_map>
#include <vector>

namespace kestrel {
namespace choices {
const char* const kAssign[3] = { "Mono", "Poly", "Unison" };
const char* const kTrigger[2] = { "Single", "Multi" };
const char* const kOsc1Wave[8] = { "Saw", "Square", "Triangle", "Sine", "Vox Wave", "DWGS", "Noise", "Audio In" };
const char* const kOsc2Wave[3] = { "Saw", "Square", "Triangle" };
const char* const kOscMod[4] = { "Off", "Ring", "Sync", "RingSync" };
const char* const kFilterType[4] = { "-24dB LPF", "-12dB LPF", "-12dB BPF", "-12dB HPF" };
const char* const kOffOn[2] = { "Off", "On" };
const char* const kLfo1Wave[4] = { "Saw", "Square1", "Triangle", "S&H" };
const char* const kLfo2Wave[4] = { "Saw", "Square2", "Sine", "S&H" };
const char* const kKeySync[3] = { "Off", "Timbre", "Voice" };
// MIDI imp. *T-5 (LFO): index 0 = 1/1 ... 14 = 1/32
const char* const kLfoSyncNote[15] = { "1/1", "3/4", "2/3", "1/2", "3/8", "1/3", "1/4", "3/16", "1/6", "1/8", "3/32", "1/12", "1/16", "1/24", "1/32" };
// MIDI imp. *T-1 (Delay): index 0 = 1/32 ... 14 = 1/1
const char* const kDelaySyncNote[15] = { "1/32", "1/24", "1/16", "1/12", "3/32", "1/8", "1/6", "3/16", "1/4", "1/3", "3/8", "1/2", "2/3", "3/4", "1/1" };
const char* const kPatchSrc[8] = { "Filter EG", "Amp EG", "LFO1", "LFO2", "Velocity", "KBD Track", "Pitch Bend", "Mod Wheel" };
const char* const kPatchDst[8] = { "Pitch", "OSC2 Tune", "OSC1 Ctrl1", "Noise Level", "Cutoff", "Amp", "Pan", "LFO2 Freq" };
const char* const kVoiceMode[3] = { "Single", "Layer", "Vocoder" };
const char* const kModFxType[3] = { "Flanger/Chorus", "Ensemble", "Phaser" };
const char* const kDelayType[3] = { "Stereo Delay", "Cross Delay", "L/R Delay" };
// MIDI imp. *T-11
const char* const kEqLowFreq[30] = { "40Hz", "50Hz", "60Hz", "80Hz", "100Hz", "120Hz", "140Hz", "160Hz", "180Hz", "200Hz",
                                     "220Hz", "240Hz", "260Hz", "280Hz", "300Hz", "320Hz", "340Hz", "360Hz", "380Hz", "400Hz",
                                     "420Hz", "440Hz", "460Hz", "480Hz", "500Hz", "600Hz", "700Hz", "800Hz", "900Hz", "1.00kHz" };
// MIDI imp. *T-10
const char* const kEqHiFreq[30] = { "1.00kHz", "1.25kHz", "1.50kHz", "1.75kHz", "2.00kHz", "2.25kHz", "2.50kHz", "2.75kHz", "3.00kHz", "3.25kHz",
                                    "3.50kHz", "3.75kHz", "4.00kHz", "4.25kHz", "4.50kHz", "4.75kHz", "5.00kHz", "5.25kHz", "5.50kHz", "5.75kHz",
                                    "6.00kHz", "7.00kHz", "8.00kHz", "9.00kHz", "10.0kHz", "11.0kHz", "12.0kHz", "14.0kHz", "16.0kHz", "18.0kHz" };
const char* const kArpResolution[6] = { "1/24", "1/16", "1/12", "1/8", "1/6", "1/4" };
const char* const kArpType[6] = { "Up", "Down", "Alt1", "Alt2", "Random", "Trigger" };
const char* const kArpTarget[3] = { "Both", "Timbre 1", "Timbre 2" };
const char* const kFormantShift[5] = { "0", "+1", "+2", "-1", "-2" };
const char* const kFcModSrc[7] = { "Amp EG", "LFO1", "LFO2", "Velocity", "KBD Track", "Pitch Bend", "Mod Wheel" };
const char* const kHpfGate[2] = { "Disable", "Enable" };
const char* const kClock[3] = { "Internal", "Host", "Auto" };
const char* const kVoiceLimit[2] = { "Compatibility (4 voices)", "Extended" };
const char* const kQuality[4] = { "Auto", "1x", "2x", "4x" };
} // namespace choices

namespace {

struct Table {
    std::vector<ParamInfo> infos;
    std::unordered_map<std::string, int> byId;

    Table() {
        infos.reserve(kNumParams);
        for (int t = 0; t < kNumTimbres; ++t) {
            const std::string prefix = "t" + std::to_string(t + 1) + ".";
            const std::string namePrefix = "T" + std::to_string(t + 1) + " ";
#define KX(e, idS, nameS, sec, mn, mx, df, kind, ch, nch, ev, aut) \
    infos.push_back(ParamInfo{ prefix + idS, namePrefix + nameS, sec, float(mn), float(mx), float(df), PKind::kind, ch, nch, Evidence::ev, aut });
            KESTREL_TIMBRE_PARAMS(KX)
#undef KX
        }
#define KX(e, idS, nameS, sec, mn, mx, df, kind, ch, nch, ev, aut) \
    infos.push_back(ParamInfo{ idS, nameS, sec, float(mn), float(mx), float(df), PKind::kind, ch, nch, Evidence::ev, aut });
        KESTREL_GLOBAL_PARAMS(KX)
#undef KX
        for (int i = 0; i < int(infos.size()); ++i)
            byId[infos[size_t(i)].id] = i;
    }
};

const Table& table() {
    static const Table t;
    return t;
}

std::string fmtInt(int v) { return std::to_string(v); }

std::string fmtSigned(float v) {
    const int i = int(std::lround(v));
    if (i > 0) return "+" + std::to_string(i);
    return std::to_string(i);
}

std::string fmtPan(float v) {
    const int i = int(std::lround(v));
    if (i == 0) return "CNT";
    char buf[16];
    std::snprintf(buf, sizeof(buf), "%c%02d", i < 0 ? 'L' : 'R', std::abs(i));
    return buf;
}

} // namespace

const ParamInfo& paramInfo(int index) { return table().infos[size_t(index)]; }

int findParam(const std::string& id) {
    const auto& m = table().byId;
    auto it = m.find(id);
    return it == m.end() ? -1 : it->second;
}

float sanitizeParamValue(int index, float v) {
    const ParamInfo& p = paramInfo(index);
    if (!std::isfinite(v)) v = p.defV;
    v = std::clamp(v, p.minV, p.maxV);
    if (p.kind != PKind::Float) v = std::round(v);
    return v;
}

std::string formatParamValue(int index, float v) {
    const ParamInfo& p = paramInfo(index);
    v = sanitizeParamValue(index, v);
    if ((p.kind == PKind::Choice || p.kind == PKind::Bool) && p.choices != nullptr) {
        const int i = std::clamp(int(v), 0, p.numChoices - 1);
        return p.choices[i];
    }
    const std::string& id = p.id;
    auto endsWith = [&](const char* s) {
        const size_t n = std::char_traits<char>::length(s);
        return id.size() >= n && id.compare(id.size() - n, n, s) == 0;
    };
    if (endsWith(".pan")) return fmtPan(v);
    if (endsWith("voc.filter.efSense") && v >= 127.0f) return "Hold";
    if (endsWith("global.velocityCurve")) return v < 0.5f ? "Curve" : fmtInt(int(v));
    if (endsWith("global.masterTune")) {
        char buf[16];
        std::snprintf(buf, sizeof(buf), "%.1fHz", double(v));
        return buf;
    }
    if (endsWith("global.volume")) {
        char buf[16];
        std::snprintf(buf, sizeof(buf), "%.1fdB", double(v));
        return buf;
    }
    if (endsWith("arp.gate")) return fmtInt(int(std::lround(v))) + "%";
    if (endsWith("arp.swing")) return fmtSigned(v) + "%";
    if (endsWith("arp.tempo")) return fmtInt(int(std::lround(v)));
    if (endsWith("eq.lowGain") || endsWith("eq.hiGain")) return fmtSigned(v) + "dB";
    if (p.minV < 0.0f) return fmtSigned(v);
    if (p.kind == PKind::Float) {
        // Hardware shows integers; show one decimal only when automation produced a fraction.
        const float r = std::round(v);
        if (std::fabs(v - r) < 0.05f) return fmtInt(int(r));
        char buf[16];
        std::snprintf(buf, sizeof(buf), "%.1f", double(v));
        return buf;
    }
    return fmtInt(int(std::lround(v)));
}

} // namespace kestrel
