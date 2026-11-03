# Pinned JUCE dependency (reproducible): tag 8.0.16-security, commit ea77444750de45e036e0279bb0291144bf8e3688.
#
# Offline / pre-fetched builds: pass -DKESTREL_JUCE_DIR=/path/to/JUCE (a checkout of the
# same commit). Otherwise CMake FetchContent clones the tag and the commit is verified.
set(KESTREL_JUCE_TAG "8.0.16-security")
set(KESTREL_JUCE_COMMIT "ea77444750de45e036e0279bb0291144bf8e3688")
set(KESTREL_JUCE_DIR "" CACHE PATH "Local JUCE checkout (must be ${KESTREL_JUCE_TAG})")

if(KESTREL_JUCE_DIR)
    set(_juce_src "${KESTREL_JUCE_DIR}")
    add_subdirectory("${KESTREL_JUCE_DIR}" "${CMAKE_BINARY_DIR}/_deps/juce-build" EXCLUDE_FROM_ALL)
else()
    include(FetchContent)
    FetchContent_Declare(juce
        GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
        GIT_TAG        ${KESTREL_JUCE_TAG}
        GIT_SHALLOW    TRUE
        GIT_PROGRESS   TRUE)
    FetchContent_MakeAvailable(juce)
    set(_juce_src "${juce_SOURCE_DIR}")
endif()

find_package(Git QUIET)
if(GIT_FOUND AND EXISTS "${_juce_src}/.git")
    execute_process(COMMAND "${GIT_EXECUTABLE}" -C "${_juce_src}" rev-parse HEAD
                    OUTPUT_VARIABLE _juce_head OUTPUT_STRIP_TRAILING_WHITESPACE ERROR_QUIET)
    if(_juce_head AND NOT _juce_head STREQUAL KESTREL_JUCE_COMMIT)
        message(FATAL_ERROR "JUCE checkout is at ${_juce_head}, expected ${KESTREL_JUCE_COMMIT} (${KESTREL_JUCE_TAG}).")
    endif()
    message(STATUS "JUCE ${KESTREL_JUCE_TAG} @ ${_juce_head}")
endif()
