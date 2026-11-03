# Kestrel VA plug-in targets.
#   KestrelVA    : instrument (VST3 + Standalone). Optional stereo input bus "Audio In 1/2".
#   KestrelVAFX  : the same engine as a VST3 *effect* that accepts MIDI. Hosts that cannot
#                  feed audio into instruments (FL Studio: insert it on a Mixer track and send
#                  notes with a MIDI Out channel) can use this for the vocoder / Audio In.

file(GLOB KESTREL_PRESET_FILES CONFIGURE_DEPENDS "${CMAKE_SOURCE_DIR}/presets/*.kvp")
juce_add_binary_data(KestrelPresets SOURCES ${KESTREL_PRESET_FILES} ${CMAKE_SOURCE_DIR}/presets/bank-order.txt)

set(KESTREL_PLUGIN_SOURCES
    src/PluginProcessor.cpp
    src/PluginEditor.cpp
    src/PresetBank.cpp
    src/ui/KestrelLookAndFeel.cpp
    src/ui/Widgets.cpp
    src/ui/Views.cpp)

function(kestrel_add_plugin target productName pluginCode isSynth formats categories)
    juce_add_plugin(${target}
        COMPANY_NAME "Kestrel Audio (unofficial project)"
        COMPANY_WEBSITE "https://example.invalid/kestrel"
        BUNDLE_ID "org.kestrel.${target}"
        PLUGIN_MANUFACTURER_CODE Kstr
        PLUGIN_CODE ${pluginCode}
        PRODUCT_NAME "${productName}"
        VERSION ${PROJECT_VERSION}
        FORMATS ${formats}
        IS_SYNTH ${isSynth}
        NEEDS_MIDI_INPUT TRUE
        NEEDS_MIDI_OUTPUT FALSE
        IS_MIDI_EFFECT FALSE
        EDITOR_WANTS_KEYBOARD_FOCUS FALSE
        COPY_PLUGIN_AFTER_BUILD FALSE
        VST3_CATEGORIES ${categories}
        MICROPHONE_PERMISSION_ENABLED TRUE
        MICROPHONE_PERMISSION_TEXT "Kestrel VA uses audio input for the vocoder and OSC1 Audio In.")
    target_sources(${target} PRIVATE ${KESTREL_PLUGIN_SOURCES})
    target_include_directories(${target} PRIVATE src)
    target_compile_definitions(${target} PUBLIC
        JUCE_WEB_BROWSER=0
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0
        JUCE_DISPLAY_SPLASH_SCREEN=0
        KESTREL_IS_FX_VARIANT=$<IF:$<BOOL:${isSynth}>,0,1>)
    target_link_libraries(${target}
        PRIVATE
            kestrel_engine
            KestrelPresets
            juce::juce_audio_utils
            juce::juce_audio_processors
            juce::juce_gui_extra
        PUBLIC
            juce::juce_recommended_config_flags
            juce::juce_recommended_lto_flags
            juce::juce_recommended_warning_flags)
endfunction()

kestrel_add_plugin(KestrelVA   "Kestrel VA"    Kva4 TRUE  "VST3;Standalone" "Instrument|Synth")
kestrel_add_plugin(KestrelVAFX "Kestrel VA FX" Kvfx FALSE "VST3"            "Fx|Instrument")

# Host-side check of the built bundles (JUCE VST3 hosting). Not shipped.
option(KESTREL_BUILD_PLUGIN_CHECK "Build kestrel_plugin_check (VST3 host-side smoke test)" ON)
if(KESTREL_BUILD_PLUGIN_CHECK)
    juce_add_console_app(KestrelPluginCheck PRODUCT_NAME "kestrel_plugin_check")
    target_sources(KestrelPluginCheck PRIVATE tools/PluginCheck.cpp)
    target_compile_definitions(KestrelPluginCheck PRIVATE
        JUCE_PLUGINHOST_VST3=1 JUCE_PLUGINHOST_AU=0 JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0 JUCE_MODAL_LOOPS_PERMITTED=1)
    target_link_libraries(KestrelPluginCheck PRIVATE juce::juce_audio_processors juce::juce_events
        PUBLIC juce::juce_recommended_config_flags)
endif()

# Offscreen UI snapshots (review / documentation). Not shipped.
juce_add_console_app(KestrelSnapshot PRODUCT_NAME "kestrel_snapshot")
target_sources(KestrelSnapshot PRIVATE tools/Snapshot.cpp ${KESTREL_PLUGIN_SOURCES})
target_include_directories(KestrelSnapshot PRIVATE src)
target_compile_definitions(KestrelSnapshot PRIVATE JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0 JucePlugin_Name="Kestrel VA"
    KESTREL_IS_FX_VARIANT=0 JUCE_STANDALONE_APPLICATION=1)
target_link_libraries(KestrelSnapshot PRIVATE kestrel_engine KestrelPresets juce::juce_audio_utils juce::juce_audio_processors
    juce::juce_gui_extra PUBLIC juce::juce_recommended_config_flags)
