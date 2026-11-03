// kestrel_render — offline renderer for Kestrel VA programs.
//
// Usage:
//   kestrel_render [options] -o out.wav
//     -p, --program FILE        program file (.kvp); default = init program
//     -s, --set ID=VALUE        set a parameter (repeatable; choice names allowed)
//     -n, --note N,VEL,ON,OFF   note number, velocity, on/off time in seconds (repeatable)
//     -c, --cc T,NUM,VAL        control change at time T
//     -b, --bend T,VALUE14      pitch bend (0..16383, centre 8192) at time T
//     -t, --seconds S           total length (default 3)
//     -r, --rate HZ             sample rate (default 48000)
//         --block N             block size (default 256)
//         --in1 FILE --in2 FILE external audio for AUDIO IN 1 / 2 (mono WAV, first channel used)
//         --tempo BPM --playing host transport (for Clock = Host/Auto)
//         --list-params         print parameter ids, ranges and defaults
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include "common/RenderHarness.h"
#include "common/WavIO.h"

using namespace kestrel;
using namespace kestrel::tools;

static bool setParamString(Program& p, const std::string& kv) {
    const auto eq = kv.find('=');
    if (eq == std::string::npos) return false;
    std::string text = "format=kestrel-program 1\n" + kv + "\n";
    Program tmp = p;
    std::string err;
    std::vector<std::string> warn;
    if (!parseProgram(text, tmp, err, &warn) || !warn.empty()) {
        std::fprintf(stderr, "bad --set '%s'%s%s\n", kv.c_str(), warn.empty() ? "" : ": ", warn.empty() ? "" : warn[0].c_str());
        return false;
    }
    const int idx = findParam(kv.substr(0, eq));
    if (idx < 0) return false;
    p.values[size_t(idx)] = tmp.values[size_t(idx)];
    return true;
}

int main(int argc, char** argv) {
    Program prog;
    std::string out = "out.wav", in1Path, in2Path;
    std::vector<TimedMidi> midi;
    RenderSettings rs;
    rs.seconds = 3.0;
    std::vector<std::string> sets;
    for (int i = 1; i < argc; ++i) {
        const std::string a = argv[i];
        auto next = [&]() -> std::string { if (i + 1 >= argc) { std::fprintf(stderr, "missing value for %s\n", a.c_str()); std::exit(2); } return argv[++i]; };
        if (a == "-o" || a == "--out") out = next();
        else if (a == "-p" || a == "--program") {
            std::ifstream f(next());
            std::stringstream ss; ss << f.rdbuf();
            std::string err;
            std::vector<std::string> warn;
            if (!parseProgram(ss.str(), prog, err, &warn)) { std::fprintf(stderr, "program error: %s\n", err.c_str()); return 1; }
            for (auto& w : warn) std::fprintf(stderr, "warning: %s\n", w.c_str());
        }
        else if (a == "-s" || a == "--set") sets.push_back(next());
        else if (a == "-n" || a == "--note") {
            int n, v; double on, off;
            if (std::sscanf(next().c_str(), "%d,%d,%lf,%lf", &n, &v, &on, &off) != 4) { std::fprintf(stderr, "bad --note\n"); return 2; }
            midi.push_back(noteOn(on, n, v));
            midi.push_back(noteOff(off, n));
        }
        else if (a == "-c" || a == "--cc") {
            double t; int num, val;
            if (std::sscanf(next().c_str(), "%lf,%d,%d", &t, &num, &val) != 3) { std::fprintf(stderr, "bad --cc\n"); return 2; }
            midi.push_back(cc(t, num, val));
        }
        else if (a == "-b" || a == "--bend") {
            double t; int v;
            if (std::sscanf(next().c_str(), "%lf,%d", &t, &v) != 2) { std::fprintf(stderr, "bad --bend\n"); return 2; }
            midi.push_back(bend(t, v));
        }
        else if (a == "-t" || a == "--seconds") rs.seconds = std::atof(next().c_str());
        else if (a == "-r" || a == "--rate") rs.sampleRate = std::atof(next().c_str());
        else if (a == "--block") rs.blockSize = std::atoi(next().c_str());
        else if (a == "--in1") in1Path = next();
        else if (a == "--in2") in2Path = next();
        else if (a == "--tempo") { rs.transport.valid = true; rs.transport.bpm = std::atof(next().c_str()); }
        else if (a == "--playing") rs.transport.playing = true;
        else if (a == "--list-params") {
            for (int k = 0; k < kNumParams; ++k) {
                const ParamInfo& p = paramInfo(k);
                std::printf("%-28s %8g %8g %8g  %s\n", p.id.c_str(), double(p.minV), double(p.maxV), double(p.defV), p.name.c_str());
            }
            return 0;
        }
        else { std::fprintf(stderr, "unknown option %s\n", a.c_str()); return 2; }
    }
    for (auto& s : sets) if (!setParamString(prog, s)) return 2;

    std::vector<float> in1, in2;
    auto loadIn = [&](const std::string& path, std::vector<float>& dst) {
        if (path.empty()) return true;
        Audio a; std::string err;
        if (!readWav(path, a, err)) { std::fprintf(stderr, "%s\n", err.c_str()); return false; }
        dst = a.ch[0];
        return true;
    };
    if (!loadIn(in1Path, in1) || !loadIn(in2Path, in2)) return 1;
    if (!in1.empty()) rs.in1 = &in1;
    if (!in2.empty()) rs.in2 = &in2;

    Engine e;
    applyProgram(e, prog);
    e.prepare(rs.sampleRate, rs.blockSize);
    applyProgram(e, prog);
    const Rendered r = render(e, midi, rs);
    Audio a;
    a.sampleRate = rs.sampleRate;
    a.ch = { r.l, r.r };
    if (!writeWavFloat(out, a)) { std::fprintf(stderr, "cannot write %s\n", out.c_str()); return 1; }
    float peak = 0.0f;
    for (size_t i = 0; i < r.l.size(); ++i) peak = std::max(peak, std::max(std::fabs(r.l[i]), std::fabs(r.r[i])));
    std::printf("wrote %s (%.2f s, %.0f Hz, latency %d samples, peak %.3f)\n", out.c_str(), rs.seconds, rs.sampleRate, r.latency, double(peak));
    return 0;
}
