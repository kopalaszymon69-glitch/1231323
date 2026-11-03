#pragma once

// Minimal WAV reader/writer for the offline tools (32-bit float or 16/24-bit PCM read).
#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

namespace kestrel::tools {

struct Audio {
    double sampleRate = 48000.0;
    std::vector<std::vector<float>> ch; // channels
    size_t frames() const { return ch.empty() ? 0 : ch[0].size(); }
};

inline bool writeWavFloat(const std::string& path, const Audio& a) {
    FILE* f = std::fopen(path.c_str(), "wb");
    if (!f) return false;
    const uint16_t nch = uint16_t(a.ch.size());
    const uint32_t sr = uint32_t(a.sampleRate + 0.5);
    const uint32_t frames = uint32_t(a.frames());
    const uint32_t dataBytes = frames * nch * 4u;
    auto w32 = [&](uint32_t v) { std::fwrite(&v, 4, 1, f); };
    auto w16 = [&](uint16_t v) { std::fwrite(&v, 2, 1, f); };
    std::fwrite("RIFF", 1, 4, f); w32(36 + dataBytes); std::fwrite("WAVE", 1, 4, f);
    std::fwrite("fmt ", 1, 4, f); w32(16); w16(3); w16(nch); w32(sr); w32(sr * nch * 4u); w16(uint16_t(nch * 4)); w16(32);
    std::fwrite("data", 1, 4, f); w32(dataBytes);
    for (uint32_t i = 0; i < frames; ++i)
        for (uint16_t c = 0; c < nch; ++c) { const float v = a.ch[c][i]; std::fwrite(&v, 4, 1, f); }
    std::fclose(f);
    return true;
}

inline bool readWav(const std::string& path, Audio& a, std::string& err) {
    FILE* f = std::fopen(path.c_str(), "rb");
    if (!f) { err = "cannot open " + path; return false; }
    std::vector<uint8_t> d;
    uint8_t buf[65536];
    size_t n;
    while ((n = std::fread(buf, 1, sizeof buf, f)) > 0) d.insert(d.end(), buf, buf + n);
    std::fclose(f);
    if (d.size() < 44 || std::memcmp(d.data(), "RIFF", 4) || std::memcmp(d.data() + 8, "WAVE", 4)) { err = "not a WAV file"; return false; }
    auto r16 = [&](size_t o) { return uint16_t(d[o] | (d[o + 1] << 8)); };
    auto r32 = [&](size_t o) { return uint32_t(d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (uint32_t(d[o + 3]) << 24)); };
    size_t pos = 12;
    uint16_t fmt = 0, nch = 0, bits = 0;
    uint32_t sr = 0;
    while (pos + 8 <= d.size()) {
        const uint32_t sz = r32(pos + 4);
        if (!std::memcmp(d.data() + pos, "fmt ", 4)) {
            fmt = r16(pos + 8); nch = r16(pos + 10); sr = r32(pos + 12); bits = r16(pos + 22);
            if (fmt == 0xFFFE && sz >= 26) fmt = r16(pos + 32);
        } else if (!std::memcmp(d.data() + pos, "data", 4)) {
            if (nch == 0) { err = "data before fmt"; return false; }
            const size_t bps = bits / 8;
            const size_t frames = std::min<size_t>(sz, d.size() - pos - 8) / (bps * nch);
            a.sampleRate = sr;
            a.ch.assign(nch, std::vector<float>(frames));
            const uint8_t* p = d.data() + pos + 8;
            for (size_t i = 0; i < frames; ++i)
                for (uint16_t c = 0; c < nch; ++c, p += bps) {
                    float v = 0.0f;
                    if (fmt == 3 && bits == 32) std::memcpy(&v, p, 4);
                    else if (fmt == 1 && bits == 16) v = float(int16_t(p[0] | (p[1] << 8))) / 32768.0f;
                    else if (fmt == 1 && bits == 24) { int32_t s = (p[0] | (p[1] << 8) | (p[2] << 16)); if (s & 0x800000) s |= ~0xFFFFFF; v = float(s) / 8388608.0f; }
                    else if (fmt == 1 && bits == 32) { int32_t s; std::memcpy(&s, p, 4); v = float(double(s) / 2147483648.0); }
                    else { err = "unsupported WAV sample format"; return false; }
                    a.ch[c][i] = v;
                }
            return true;
        }
        pos += 8 + sz + (sz & 1);
    }
    err = "no data chunk";
    return false;
}

} // namespace kestrel::tools
