add_executable(kestrel_tests
    TestMain.cpp
    test_core.cpp
    test_voice.cpp
    test_osc.cpp
    test_filter.cpp
    test_arp.cpp
    test_fx.cpp
    test_stability.cpp
    test_presets.cpp)
target_include_directories(kestrel_tests PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
target_link_libraries(kestrel_tests PRIVATE kestrel_tools_common)
target_compile_definitions(kestrel_tests PRIVATE KESTREL_PRESET_DIR="${CMAKE_SOURCE_DIR}/presets")

# One ctest entry per area (the executable filters tests by name substring).
foreach(area params program mapping oversampler midi output compat extended unison mono sustain stolen
             envelope pitch portamento mod_wheel velocity saw pulse triangle sine osc2 noise dwgs vox audio_in
             filter arp delay eq modfx vocoder latency fuzz extreme silence mode_switch presets)
    add_test(NAME ${area} COMMAND kestrel_tests ${area})
endforeach()
