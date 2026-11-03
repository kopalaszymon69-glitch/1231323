#pragma once

// RAII flush-to-zero / denormals-are-zero for the audio thread. Restores the
// previous floating-point control state on destruction.

#if defined(__SSE__) || defined(_M_X64) || (defined(_M_IX86_FP) && _M_IX86_FP >= 1)
#include <xmmintrin.h>
#define KESTREL_HAS_SSE 1
#endif

#include <cstdint>

namespace kestrel {

class ScopedNoDenormals {
public:
    ScopedNoDenormals() noexcept {
#if defined(KESTREL_HAS_SSE)
        prev_ = _mm_getcsr();
        _mm_setcsr(prev_ | 0x8040u); // FTZ | DAZ
#elif defined(__aarch64__)
        uint64_t fpcr;
        asm volatile("mrs %0, fpcr" : "=r"(fpcr));
        prev_ = fpcr;
        asm volatile("msr fpcr, %0" : : "r"(fpcr | (1ull << 24)));
#endif
    }
    ~ScopedNoDenormals() noexcept {
#if defined(KESTREL_HAS_SSE)
        _mm_setcsr(unsigned(prev_));
#elif defined(__aarch64__)
        asm volatile("msr fpcr, %0" : : "r"(prev_));
#endif
    }
    ScopedNoDenormals(const ScopedNoDenormals&) = delete;
    ScopedNoDenormals& operator=(const ScopedNoDenormals&) = delete;

private:
    uint64_t prev_ = 0;
};

} // namespace kestrel
