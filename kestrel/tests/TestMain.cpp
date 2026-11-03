#include <cstdio>
#include <cstring>

#include "TestFramework.h"

int main(int argc, char** argv) {
    const char* filter = argc > 1 ? argv[1] : nullptr;
    int run = 0;
    for (auto& t : kt::registry()) {
        if (filter && std::strstr(t.name, filter) == nullptr) continue;
        kt::currentTest() = t.name;
        const int before = kt::failures();
        t.fn();
        ++run;
        std::printf("%s %s\n", kt::failures() == before ? "[ OK ]" : "[FAIL]", t.name);
    }
    std::printf("\n%d tests, %d failed checks\n", run, kt::failures());
    return kt::failures() == 0 ? 0 : 1;
}
