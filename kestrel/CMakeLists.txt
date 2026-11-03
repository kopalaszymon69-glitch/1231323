cmake_minimum_required(VERSION 3.22)

project(KestrelVA VERSION 0.6.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE Release CACHE STRING "" FORCE)
endif()

option(KESTREL_BUILD_PLUGIN "Build the JUCE VST3 / Standalone targets" ON)
option(KESTREL_BUILD_TESTS  "Build the offline renderer, analysis tools and tests" ON)

# Pure C++20 sound engine (no JUCE dependency)
add_subdirectory(engine)

if(KESTREL_BUILD_TESTS)
    enable_testing()
    add_subdirectory(tools)
    add_subdirectory(tests)
endif()

if(KESTREL_BUILD_PLUGIN)
    include(cmake/JUCE.cmake)
    add_subdirectory(plugin)
endif()
