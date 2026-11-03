add_library(kestrel_engine STATIC
    src/Engine.cpp
    src/arp/Arpeggiator.cpp
    src/core/Fft.cpp
    src/core/Oversampler.cpp
    src/env/Envelope.cpp
    src/fx/Effects.cpp
    src/io/ProgramIO.cpp
    src/osc/Oscillators.cpp
    src/osc/Wavetable.cpp
    src/params/HardwareCc.cpp
    src/params/Mapping.cpp
    src/params/Params.cpp
    src/timbre/Timbre.cpp
    src/vocoder/Vocoder.cpp
    src/voice/Voice.cpp
)
target_include_directories(kestrel_engine PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_compile_features(kestrel_engine PUBLIC cxx_std_20)
if(MSVC)
    target_compile_options(kestrel_engine PRIVATE /W4 /permissive- /fp:precise)
    target_compile_definitions(kestrel_engine PUBLIC _USE_MATH_DEFINES NOMINMAX)
else()
    target_compile_options(kestrel_engine PRIVATE -Wall -Wextra -Wno-unused-parameter)
endif()
