// Parameters, program I/O, documented mapping anchors, oversampling filters.
#include <set>

#include "TestHelpers.h"
#include "core/Oversampler.h"
#include "params/Mapping.h"

using namespace kh;

TEST(params_ids_unique_and_ranges_valid) {
    std::set<std::string> ids;
    for (int i = 0; i < kNumParams; ++i) {
        const ParamInfo& p = paramInfo(i);
        CHECK_MSG(ids.insert(p.id).second, "duplicate id " + p.id);
        CHECK_MSG(p.minV < p.maxV, p.id);
        CHECK_MSG(p.defV >= p.minV && p.defV <= p.maxV, p.id);
        if (p.kind == PKind::Choice || p.kind == PKind::Bool) CHECK_MSG(int(p.maxV) + 1 == p.numChoices, p.id);
        CHECK_MSG(findParam(p.id) == i, p.id);
    }
    CHECK(kNumParams == 2 * TP_COUNT + GP_COUNT);
}

TEST(params_documented_ranges) {
    // Spot checks against the owner's manual / MIDI implementation.
    auto r = [](const char* id, float mn, float mx) {
        const ParamInfo& p = paramInfo(findParam(id));
        CHECK_MSG(p.minV == mn && p.maxV == mx, id);
    };
    r("t1.voice.unisonDetune", 0, 99);      // p.16
    r("t1.pitch.transpose", -24, 24);       // p.17
    r("t1.pitch.tune", -50, 50);
    r("t1.pitch.bendRange", -12, 12);
    r("t1.pitch.vibratoInt", -63, 63);
    r("t1.osc2.semitone", -24, 24);         // p.22
    r("t1.osc2.tune", -63, 63);
    r("t1.osc1.dwgs", 1, 64);               // p.20
    r("t2.filter.keyTrack", -63, 63);       // p.25
    r("arp.tempo", 20, 300);                // p.44
    r("arp.swing", -100, 100);              // p.45
    r("arp.lastStep", 1, 8);
    r("fx.eq.lowGain", -12, 12);            // p.42
    r("global.masterTune", 430, 450);       // p.47
    CHECK(paramInfo(findParam("t1.patch1.src")).numChoices == 8);  // p.30
    CHECK(paramInfo(findParam("t1.patch1.dst")).numChoices == 8);
    CHECK(paramInfo(findParam("t1.osc1.wave")).numChoices == 8);   // p.18
    CHECK(paramInfo(findParam("fx.delay.syncNote")).numChoices == 15); // p.65
}

TEST(param_display_formatting) {
    CHECK(formatParamValue(findParam("t1.amp.pan"), -12) == "L12");
    CHECK(formatParamValue(findParam("t1.amp.pan"), 0) == "CNT");
    CHECK(formatParamValue(findParam("t1.amp.pan"), 63) == "R63");
    CHECK(formatParamValue(findParam("t1.filter.type"), 2) == "-12dB BPF");
    CHECK(formatParamValue(findParam("voc.filter.efSense"), 127) == "Hold");
    CHECK(formatParamValue(findParam("t1.filter.egInt"), 12) == "+12");
    CHECK(formatParamValue(findParam("fx.eq.hiFreq"), 29) == "18.0kHz");
}

TEST(program_roundtrip) {
    Program p = basicProgram();
    p.name = "Round Trip";
    p.category = "Test";
    set(p, "t1.filter.cutoff", 33.5f);
    setChoice(p, "t2.osc1.wave", "DWGS");
    set(p, "voc.ch3.pan", -20);
    p.hasHold = true;
    for (int b = 0; b < 16; ++b) p.hold[size_t(b)] = 0.01f * float(b);
    const std::string text = serializeProgram(p);
    Program q;
    std::string err;
    std::vector<std::string> warn;
    CHECK(parseProgram(text, q, err, &warn));
    CHECK(warn.empty());
    CHECK(q.name == "Round Trip");
    CHECK(q.hasHold);
    for (int i = 0; i < kNumParams; ++i) {
        if (isGlobalSetting(i)) continue;
        CHECK_MSG(std::fabs(q.values[size_t(i)] - p.values[size_t(i)]) < 1e-3f, paramInfo(i).id);
    }
    CHECK_NEAR(q.hold[15], 0.15f, 1e-6);
}

TEST(program_parse_errors_and_unknown_keys) {
    Program q;
    std::string err;
    std::vector<std::string> warn;
    CHECK(!parseProgram("name=x\n", q, err, &warn));
    CHECK(parseProgram("format=kestrel-program 1\nfuture.param=3\nt1.osc1.wave=NotAWave\n", q, err, &warn));
    CHECK(warn.size() == 2);
}

TEST(mapping_documented_anchors) {
    using namespace mapping;
    CHECK_NEAR(osc2TuneCents(48), 1200, 1e-9);   // p.22: +-48 = 1 octave
    CHECK_NEAR(osc2TuneCents(-63), -2400, 1e-9); // +-63 = 2 octaves
    CHECK(std::fabs(osc2TuneCents(2)) < 5.0);    // fine near zero
    CHECK_NEAR(filterKeyTrackSteps(12, 48), 12, 1e-9); // p.25: +48 = 100 % tracking
    CHECK_NEAR(noiseCutoffHz(24, 261.63), 261.63, 1e-9); // p.20: CONTROL1 = 24 -> key pitch
    CHECK_NEAR(pulseWidth(0), 0.5, 1e-12);       // p.18: 0 = 50 %
    CHECK_NEAR(pulseWidth(127), 0.0, 1e-12);     //       127 = 0 %
    CHECK_NEAR(triangleFoldGain(127), 3.0, 1e-12); // p.19: 127 = octave + fifth (3x)
    CHECK_NEAR(sawPhaseOffset(127), 0.5, 1e-12); // p.18: 127 = octave up
    CHECK_NEAR(noteToHz(69, 440), 440, 1e-9);
    CHECK_NEAR(lfoSyncNoteBeats(6), 1.0, 1e-12); // 1/4 = one beat (p.65 example 1)
    CHECK_NEAR(delaySyncNoteBeats(5), 0.5, 1e-12); // 1/8 (example 2)
    CHECK_NEAR(eqHighFreqHz(29), 18000, 1e-9);
    CHECK_NEAR(eqLowFreqHz(0), 40, 1e-9);
    CHECK_NEAR(vocGridHz(4), 125, 1e-9);         // table 6-1: shift 0 filter 1
    CHECK_NEAR(vocGridHz(19), 5000, 1e-9);       //            filter 16
    CHECK_NEAR(vocGridHzInterp(4 + 2), 270, 1e-9); // shift +2 filter 1
    CHECK_NEAR(vocGridHzInterp(4 - 2), 65, 1e-9);  // shift -2 filter 1
    CHECK_NEAR(unisonOffsetCents(0, 4, 99) - unisonOffsetCents(3, 4, 99), -99, 1e-9); // fig 1-4 span
}

TEST(oversampler_halfband_quality) {
    // Measure passband flatness and stopband rejection of the 2x decimator with sines.
    for (int f : { 2, 4 }) {
        OversamplingChain os;
        os.prepare(Engine::kChunk);
        os.setFactor(f);
        const double fs = 48000.0, fsOs = fs * f;
        auto measure = [&](double hz) {
            os.reset();
            const int nLow = 8192;
            std::vector<float> inL(static_cast<size_t>(nLow * f)), inR(static_cast<size_t>(nLow * f)), outL(static_cast<size_t>(nLow)), outR(static_cast<size_t>(nLow));
            for (size_t i = 0; i < inL.size(); ++i) inL[i] = inR[i] = float(std::sin(2.0 * ka::kPi * hz * double(i) / fsOs));
            for (int c = 0; c < nLow; c += Engine::kChunk)
                os.downsample(inL.data() + c * f, inR.data() + c * f, outL.data() + c, outR.data() + c, Engine::kChunk);
            return ka::rms(outL.data() + 2048, size_t(nLow - 2048)) * std::sqrt(2.0);
        };
        const double pass = ka::db(measure(20000.0));
        CHECK_MSG(std::fabs(pass) < 0.05, kt::fmt("factor %g: 20 kHz passband %.3f dB", f, pass));
        const double p1k = ka::db(measure(1000.0));
        CHECK_MSG(std::fabs(p1k) < 0.01, kt::fmt("factor %g: 1 kHz %.4f dB", f, p1k));
        // images that would fold to 10 kHz (= 38 kHz before decimation) and to 1 kHz (47 kHz)
        const double stop1 = ka::db(measure(38000.0));
        const double stop2 = ka::db(measure(47000.0));
        CHECK_MSG(stop1 < -90.0 && stop2 < -90.0, kt::fmt("factor %g: stopband %.1f / %.1f dB", f, stop1, stop2));
    }
    CHECK(OversamplingChain::decimationLatencyFor(1) == 0);
    CHECK(OversamplingChain::decimationLatencyFor(2) == 25);
    CHECK(OversamplingChain::decimationLatencyFor(4) == 28);
}
