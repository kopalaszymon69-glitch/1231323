// Stability under extreme settings and parameter changes; denormals; reset.
#include "TestHelpers.h"

using namespace kh;

namespace {
struct Fuzz { Rng rng { 0xBEEF }; int every = 0; };
void fuzzAutomation(Engine& e, double, void* user) {
    auto* f = static_cast<Fuzz*>(user);
    // change ~10 random parameters every block (skip global quality to keep latency fixed)
    for (int k = 0; k < 10; ++k) {
        const int i = int(f->rng.nextU32() % uint32_t(kNumParams));
        const ParamInfo& p = paramInfo(i);
        if (p.id == "global.quality" || p.id == "global.volume") continue;
        e.setParam(i, p.minV + (p.maxV - p.minV) * f->rng.unipolar());
    }
}
} // namespace

TEST(fuzz_random_parameters_stays_finite_and_bounded) {
    for (double fs : { 44100.0, 96000.0 }) {
        Program p = basicProgram();
        Rig r(p, fs, 128);
        Fuzz f;
        r.rs.automation = &fuzzAutomation;
        r.rs.automationUser = &f;
        std::vector<TimedMidi> m;
        Rng g(11);
        for (int k = 0; k < 120; ++k) {
            const double t = 0.05 * k;
            const int n = 24 + int(g.nextU32() % 80);
            m.push_back(noteOn(t, n, 1 + int(g.nextU32() % 127)));
            m.push_back(noteOff(t + 0.03 + 0.2 * g.unipolar(), n));
            if (k % 7 == 0) m.push_back(cc(t, 1, int(g.nextU32() % 128)));
            if (k % 5 == 0) m.push_back(bend(t, int(g.nextU32() % 16384)));
            if (k % 23 == 0) m.push_back(cc(t, 64, (k / 23) % 2 ? 0 : 127));
        }
        std::vector<float> in1(size_t(fs * 6.5)), in2(size_t(fs * 6.5));
        for (size_t i = 0; i < in1.size(); ++i) { in1[i] = 0.5f * g.bipolar(); in2[i] = 0.5f * g.bipolar(); }
        r.rs.in1 = &in1;
        r.rs.in2 = &in2;
        const auto out = r.run(m, 6.0);
        float pk = 0.0f;
        bool finite = true;
        for (size_t i = 0; i < out.l.size(); ++i) {
            finite &= isFiniteF(out.l[i]) && isFiniteF(out.r[i]);
            pk = std::max(pk, std::max(std::fabs(out.l[i]), std::fabs(out.r[i])));
        }
        CHECK(finite);
        CHECK(r.e->nonFiniteEvents() == 0);
        std::printf("    fuzz fs %.0f: peak %.2f\n", fs, double(pk));
        CHECK_MSG(pk < 30.0f, kt::fmt("peak %g", pk));
    }
}

TEST(extreme_static_settings) {
    // maximum resonance + key track + EG + distortion + ring/sync + full delay feedback
    Program p = basicProgram();
    set(p, "t1.filter.resonance", 127);
    set(p, "t1.filter.keyTrack", 63);
    set(p, "t1.filter.egInt", 63);
    set(p, "t1.mixer.osc2", 127);
    set(p, "t1.mixer.noise", 127);
    setChoice(p, "t1.osc2.mod", "RingSync");
    setChoice(p, "t1.amp.distortion", "On");
    set(p, "fx.delay.depth", 127);
    set(p, "fx.mod.depth", 127);
    set(p, "fx.eq.lowGain", 12);
    set(p, "fx.eq.hiGain", 12);
    for (const char* t : { "-24dB LPF", "-12dB LPF", "-12dB BPF", "-12dB HPF" }) {
        setChoice(p, "t1.filter.type", t);
        const auto out = renderNote(p, 100, 2.0, 48000.0, 0.0, 1.0, 127);
        float pk = 0.0f;
        for (float v : out.l) { CHECK(isFiniteF(v)); pk = std::max(pk, std::fabs(v)); }
        CHECK_MSG(pk < 30.0f, std::string(t) + kt::fmt(" peak %g", pk));
    }
}

TEST(silence_after_release_is_exact_zero) {
    Program p = basicProgram();
    set(p, "t1.filter.resonance", 90);
    const auto out = renderNote(p, 60, 5.0, 48000.0, 0.0, 0.5);
    // amp EG finished -> voices idle; decimator / effects / DC blocker settle to exact zero (no denormal tail)
    bool zero = true;
    for (size_t i = size_t(4.5 * 48000); i < out.l.size(); ++i) zero &= out.l[i] == 0.0f;
    CHECK(zero);
}

TEST(mode_switch_while_playing_is_clean) {
    Program p = basicProgram();
    Rig r(p);
    r.run({ noteOn(0.0, 60, 100), noteOn(0.0, 64, 100) }, 0.1);
    for (const char* m : { "Layer", "Vocoder", "Single" }) {
        r.e->setParam(pG(VoiceMode), float(std::string(m) == "Layer" ? 1 : (std::string(m) == "Vocoder" ? 2 : 0)));
        const auto out = r.run({ noteOn(0.0, 67, 100) }, 0.1);
        for (float v : out.l) CHECK(isFiniteF(v));
    }
    // quality switch re-prepares voices without glitches
    r.e->setParam(pG(Quality), 3);
    const auto out = r.run({ noteOn(0.0, 60, 100) }, 0.1);
    CHECK(r.e->latencySamples() == 28);
    for (float v : out.l) CHECK(isFiniteF(v));
}
