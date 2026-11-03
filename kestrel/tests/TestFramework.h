#pragma once

// Tiny self-contained test framework (no external dependency).
#include <cmath>
#include <cstdio>
#include <functional>
#include <string>
#include <vector>

namespace kt {

struct TestCase {
    const char* name;
    std::function<void()> fn;
};

inline std::vector<TestCase>& registry() {
    static std::vector<TestCase> r;
    return r;
}
inline int& failures() {
    static int f = 0;
    return f;
}
inline const char*& currentTest() {
    static const char* c = "";
    return c;
}

struct Registrar {
    Registrar(const char* n, std::function<void()> f) { registry().push_back({ n, std::move(f) }); }
};

inline void report(bool ok, const char* expr, const char* file, int line, const std::string& msg) {
    if (ok) return;
    ++failures();
    std::printf("  FAIL [%s] %s:%d: %s %s\n", currentTest(), file, line, expr, msg.c_str());
}

inline std::string fmt(const char* f, double a = 0, double b = 0, double c = 0) {
    char buf[256];
    std::snprintf(buf, sizeof buf, f, a, b, c);
    return buf;
}

} // namespace kt

#define KT_CAT2(a, b) a##b
#define KT_CAT(a, b) KT_CAT2(a, b)
#define TEST(name) \
    static void KT_CAT(test_, name)(); \
    static kt::Registrar KT_CAT(reg_, name)(#name, &KT_CAT(test_, name)); \
    static void KT_CAT(test_, name)()

#define CHECK(cond) kt::report(bool(cond), #cond, __FILE__, __LINE__, "")
#define CHECK_MSG(cond, msg) kt::report(bool(cond), #cond, __FILE__, __LINE__, (msg))
#define CHECK_NEAR(a, b, tol) \
    kt::report(std::fabs(double(a) - double(b)) <= double(tol), #a " ~= " #b, __FILE__, __LINE__, \
               kt::fmt("(%g vs %g, tol %g)", double(a), double(b), double(tol)))
