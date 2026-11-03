#include "io/ProgramIO.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <sstream>

namespace kestrel {

Program::Program() {
    for (int i = 0; i < kNumParams; ++i) values[size_t(i)] = paramInfo(i).defV;
}

bool isGlobalSetting(int i) {
    return paramInfo(i).id.rfind("global.", 0) == 0;
}

namespace {
std::string trim(const std::string& s) {
    size_t a = 0, b = s.size();
    while (a < b && std::isspace(static_cast<unsigned char>(s[a]))) ++a;
    while (b > a && std::isspace(static_cast<unsigned char>(s[b - 1]))) --b;
    return s.substr(a, b - a);
}
std::string lower(std::string s) {
    for (auto& c : s) c = char(std::tolower(static_cast<unsigned char>(c)));
    return s;
}
std::string escape(const std::string& s) {
    std::string r;
    for (char c : s) r += (c == '\n' || c == '\r') ? ' ' : c;
    return r;
}
} // namespace

std::string serializeProgram(const Program& p, bool includeGlobals) {
    std::string out = "# Kestrel VA program (unofficial; inspired by the 2002 microKORG architecture)\n";
    out += "format=kestrel-program 1\n";
    out += "name=" + escape(p.name) + "\n";
    if (!p.category.empty()) out += "category=" + escape(p.category) + "\n";
    if (!p.author.empty()) out += "author=" + escape(p.author) + "\n";
    if (!p.description.empty()) out += "description=" + escape(p.description) + "\n";
    char buf[64];
    for (int i = 0; i < kNumParams; ++i) {
        if (!includeGlobals && isGlobalSetting(i)) continue;
        const ParamInfo& info = paramInfo(i);
        const float v = sanitizeParamValue(i, p.values[size_t(i)]);
        out += info.id + "=";
        if ((info.kind == PKind::Choice || info.kind == PKind::Bool) && info.choices != nullptr) {
            out += info.choices[std::clamp(int(v), 0, info.numChoices - 1)];
        } else if (info.kind == PKind::Float && std::fabs(v - std::round(v)) > 1e-4f) {
            std::snprintf(buf, sizeof(buf), "%.3f", double(v));
            out += buf;
        } else {
            std::snprintf(buf, sizeof(buf), "%d", int(std::lround(v)));
            out += buf;
        }
        out += "\n";
    }
    if (p.hasHold) {
        out += "voc.hold=";
        for (int b = 0; b < 16; ++b) {
            std::snprintf(buf, sizeof(buf), "%s%.6g", b ? "," : "", double(p.hold[size_t(b)]));
            out += buf;
        }
        out += "\n";
    }
    return out;
}

bool parseProgram(const std::string& text, Program& out, std::string& error, std::vector<std::string>* warnings) {
    Program p;
    std::istringstream in(text);
    std::string line;
    bool sawFormat = false;
    int lineNo = 0;
    while (std::getline(in, line)) {
        ++lineNo;
        line = trim(line);
        if (line.empty() || line[0] == '#') continue;
        const auto eq = line.find('=');
        if (eq == std::string::npos) {
            if (warnings) warnings->push_back("line " + std::to_string(lineNo) + ": ignored (no '=')");
            continue;
        }
        const std::string key = trim(line.substr(0, eq));
        const std::string val = trim(line.substr(eq + 1));
        if (key == "format") {
            if (val.rfind("kestrel-program", 0) != 0) { error = "not a Kestrel program file"; return false; }
            sawFormat = true;
            continue;
        }
        if (key == "name") { p.name = val; continue; }
        if (key == "category") { p.category = val; continue; }
        if (key == "author") { p.author = val; continue; }
        if (key == "description") { p.description = val; continue; }
        if (key == "voc.hold") {
            std::istringstream hs(val);
            std::string tok;
            int b = 0;
            while (std::getline(hs, tok, ',') && b < 16) p.hold[size_t(b++)] = float(std::atof(tok.c_str()));
            p.hasHold = b == 16;
            continue;
        }
        const int idx = findParam(key);
        if (idx < 0) {
            if (warnings) warnings->push_back("line " + std::to_string(lineNo) + ": unknown parameter '" + key + "'");
            continue;
        }
        const ParamInfo& info = paramInfo(idx);
        float v = 0.0f;
        bool ok = false;
        // choice parameters: names take precedence (e.g. formant shift "-1"), then indices
        if (info.choices != nullptr) {
            for (int c = 0; c < info.numChoices && !ok; ++c)
                if (lower(info.choices[c]) == lower(val)) { v = float(c); ok = true; }
        }
        if (!ok) {
            char* endp = nullptr;
            const double num = std::strtod(val.c_str(), &endp);
            if (endp != val.c_str() && *endp == '\0') { v = float(num); ok = true; }
        }
        if (!ok) {
            if (warnings) warnings->push_back("line " + std::to_string(lineNo) + ": bad value '" + val + "' for " + key);
            continue;
        }
        p.values[size_t(idx)] = sanitizeParamValue(idx, v);
    }
    if (!sawFormat) { error = "missing 'format=kestrel-program' header"; return false; }
    out = p;
    return true;
}

} // namespace kestrel
