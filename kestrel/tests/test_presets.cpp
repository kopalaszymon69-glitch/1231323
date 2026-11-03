// Factory bank audit: every program parses without warnings and renders a musical
// phrase with sane levels (finite, no clipping, audible).
#include <filesystem>
#include <fstream>
#include <sstream>

#include "TestHelpers.h"

using namespace kh;

namespace {
std::vector<std::filesystem::path> presetFiles() {
    std::vector<std::filesystem::path> v;
    for (auto& e : std::filesystem::directory_iterator(KESTREL_PRESET_DIR))
        if (e.path().extension() == ".kvp") v.push_back(e.path());
    std::sort(v.begin(), v.end());
    return v;
}
// crude "voice": glottal-like pulse train through two formant resonators, syllables every 0.25 s
std::vector<float> syntheticVoice(double fs, double seconds) {
    std::vector<float> y(size_t(fs * seconds));
    double ph = 0.0;
    float b1[2] = { 0, 0 }, b2[2] = { 0, 0 };
    for (size_t i = 0; i < y.size(); ++i) {
        const double t = double(i) / fs;
        const double f0 = 140.0 + 20.0 * std::sin(t * 3.0);
        ph += f0 / fs;
        float x = 0.0f;
        if (ph >= 1.0) { ph -= 1.0; x = 1.0f; }
        const bool vowelA = std::fmod(t, 0.5) < 0.25;
        auto reson = [&](float* st, double fc, float in) {
            const double r = 0.97, w = 2 * ka::kPi * fc / fs;
            const float o = float(in + 2 * r * std::cos(w) * st[0] - r * r * st[1]);
            st[1] = st[0]; st[0] = o;
            return o;
        };
        const float a = reson(b1, vowelA ? 750 : 300, x), b = reson(b2, vowelA ? 1200 : 2300, x);
        const float env = std::fmod(t, 0.25) < 0.2 ? 1.0f : 0.0f;
        y[i] = 0.08f * (a + 0.6f * b) * env;
    }
    return y;
}
} // namespace

TEST(presets_parse_and_render_sanely) {
    const auto files = presetFiles();
    CHECK(files.size() >= 20);
    const auto voice = syntheticVoice(48000.0, 4.0);
    std::printf("    %-28s %-22s %8s %8s\n", "program", "category", "peak dB", "rms dB");
    for (const auto& f : files) {
        std::ifstream in(f);
        std::stringstream ss;
        ss << in.rdbuf();
        Program p;
        std::string err;
        std::vector<std::string> warn;
        CHECK_MSG(parseProgram(ss.str(), p, err, &warn), f.filename().string() + ": " + err);
        CHECK_MSG(warn.empty(), f.filename().string() + (warn.empty() ? "" : ": " + warn[0]));
        Rig r(p);
        r.rs.in1 = &voice;
        r.rs.transport.valid = true;
        r.rs.transport.bpm = 120.0;
        // phrase: a chord, then a low melodic line with overlaps (legato for mono patches)
        std::vector<TimedMidi> m = { noteOn(0.0, 57, 100), noteOn(0.0, 60, 90), noteOn(0.0, 64, 80), cc(0.5, 1, 64),
                                     noteOff(1.4, 57), noteOff(1.4, 60), noteOff(1.4, 64), cc(1.4, 1, 0),
                                     noteOn(1.6, 36, 110), noteOn(1.9, 43, 70), noteOff(2.0, 36), noteOn(2.2, 48, 127),
                                     noteOff(2.4, 43), noteOff(2.8, 48) };
        const auto out = r.run(m, 4.0);
        float pk = 0.0f;
        bool finite = true;
        for (size_t i = 0; i < out.l.size(); ++i) { finite &= isFiniteF(out.l[i]) && isFiniteF(out.r[i]); pk = std::max(pk, std::max(std::fabs(out.l[i]), std::fabs(out.r[i]))); }
        const double rmsDb = ka::db(ka::rms(out.l.data(), size_t(3.0 * 48000)));
        std::printf("    %-28s %-22s %8.1f %8.1f\n", p.name.c_str(), p.category.c_str(), ka::db(pk), rmsDb);
        CHECK_MSG(finite, p.name);
        CHECK_MSG(pk < 1.0f, p.name + kt::fmt(": peak %g dBFS", ka::db(pk)));
        CHECK_MSG(rmsDb > -45.0, p.name + kt::fmt(": too quiet (%g dB RMS)", rmsDb));
    }
}

TEST(presets_bank_order_complete) {
    // bank-order.txt lists every program file exactly once, every listed file exists,
    // and program names are unique (the host's program list shows names only).
    const auto files = presetFiles();
    std::ifstream in(std::filesystem::path(KESTREL_PRESET_DIR) / "bank-order.txt");
    CHECK(in.good());
    std::vector<std::string> listed;
    std::string line;
    while (std::getline(in, line)) {
        while (!line.empty() && (line.back() == '\r' || line.back() == ' ')) line.pop_back();
        if (line.empty() || line[0] == '#') continue;
        CHECK_MSG(std::find(listed.begin(), listed.end(), line) == listed.end(), "listed twice: " + line);
        CHECK_MSG(std::filesystem::exists(std::filesystem::path(KESTREL_PRESET_DIR) / line), "missing file: " + line);
        listed.push_back(line);
    }
    std::vector<std::string> names;
    for (const auto& f : files) {
        const std::string fn = f.filename().string();
        CHECK_MSG(std::find(listed.begin(), listed.end(), fn) != listed.end(), "not in bank-order.txt: " + fn);
        std::ifstream pf(f);
        std::stringstream ss;
        ss << pf.rdbuf();
        Program p;
        std::string err;
        if (!parseProgram(ss.str(), p, err, nullptr)) continue;
        CHECK_MSG(std::find(names.begin(), names.end(), p.name) == names.end(), "duplicate program name: " + p.name);
        names.push_back(p.name);
    }
    std::printf("    %zu programs listed\n", listed.size());
}
