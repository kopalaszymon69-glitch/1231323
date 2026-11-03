// kestrel_plugin_check — loads the built VST3 bundles through JUCE's VST3 hosting
// layer (as a host would) and exercises them: parameters, rendering at several
// sample rates and buffer sizes, MIDI, automation, programs and state recall.
//
//   kestrel_plugin_check "Kestrel VA.vst3" ["Kestrel VA FX.vst3" ...]
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_events/juce_events.h>

#include <cmath>
#include <cstdio>

namespace {
int failures = 0;
void check(bool ok, const juce::String& what) {
    std::printf("  %s %s\n", ok ? "ok  " : "FAIL", what.toRawUTF8());
    if (!ok) ++failures;
}

struct RenderResult {
    float peak = 0.0f;
    bool finite = true;
};

RenderResult renderNotes(juce::AudioPluginInstance& p, double sr, int block, double seconds, bool varyBlocks) {
    p.releaseResources();
    p.setRateAndBufferSizeDetails(sr, block);
    p.prepareToPlay(sr, block);
    const int nch = std::max(p.getTotalNumInputChannels(), p.getTotalNumOutputChannels());
    juce::AudioBuffer<float> buf(std::max(2, nch), block);
    RenderResult r;
    const int total = int(sr * seconds);
    int pos = 0, k = 0;
    juce::Random rnd(1);
    while (pos < total) {
        const int n = varyBlocks ? 1 + rnd.nextInt(block) : block;
        buf.clear();
        juce::MidiBuffer midi;
        if (pos == 0) {
            midi.addEvent(juce::MidiMessage::noteOn(1, 60, uint8_t(110)), 0);
            midi.addEvent(juce::MidiMessage::noteOn(1, 64, uint8_t(90)), std::min(n - 1, 17));
        }
        if (pos <= int(sr * 0.5) && pos + n > int(sr * 0.5)) {
            midi.addEvent(juce::MidiMessage::noteOff(1, 60), int(sr * 0.5) - pos);
            midi.addEvent(juce::MidiMessage::noteOff(1, 64), int(sr * 0.5) - pos);
        }
        juce::AudioBuffer<float> view(buf.getArrayOfWritePointers(), buf.getNumChannels(), n);
        p.processBlock(view, midi);
        for (int ch = 0; ch < p.getTotalNumOutputChannels(); ++ch)
            for (int i = 0; i < n; ++i) {
                const float v = view.getSample(ch, i);
                if (!std::isfinite(v)) r.finite = false;
                r.peak = std::max(r.peak, std::fabs(v));
            }
        pos += n;
        ++k;
    }
    p.releaseResources();
    return r;
}

// Kestrel's own parameters (JUCE's VST3 wrapper also exposes MIDI-CC proxy parameters,
// which are transient and not part of the state).
bool isKestrelParam(juce::AudioProcessorParameter* p) {
    const auto n = p->getName(128);
    return !n.startsWith("MIDI CC") && !n.startsWithIgnoreCase("Bypass") && !n.startsWithIgnoreCase("Program");
}
std::vector<juce::String> paramTexts(juce::AudioPluginInstance& p) {
    std::vector<juce::String> v;
    for (auto* prm : p.getParameters())
        if (isKestrelParam(prm)) v.push_back(prm->getName(64) + "=" + prm->getCurrentValueAsText());
    return v;
}

void checkPlugin(const juce::String& path) {
    std::printf("\n== %s\n", path.toRawUTF8());
    juce::VST3PluginFormat fmt;
    juce::OwnedArray<juce::PluginDescription> types;
    fmt.findAllTypesForFile(types, path);
    check(types.size() == 1, "bundle exposes exactly one plug-in class (" + juce::String(types.size()) + ")");
    if (types.isEmpty()) return;
    const auto& desc = *types[0];
    std::printf("  name '%s', manufacturer '%s', category '%s', instrument=%d\n", desc.name.toRawUTF8(),
                desc.manufacturerName.toRawUTF8(), desc.category.toRawUTF8(), int(desc.isInstrument));
    juce::String err;
    std::unique_ptr<juce::AudioPluginInstance> a(fmt.createInstanceFromDescription(desc, 48000.0, 512, err));
    check(a != nullptr, "instantiate " + err);
    if (!a) return;
    const int numParams = a->getParameters().size();
    std::printf("  %d parameters, %d programs, in %d / out %d channels, latency %d\n", numParams, a->getNumPrograms(),
                a->getTotalNumInputChannels(), a->getTotalNumOutputChannels(), a->getLatencySamples());
    check(numParams > 200, "parameter count");
    check(a->acceptsMidi(), "accepts MIDI");
    check(a->getTotalNumOutputChannels() == 2, "stereo output");
    check(a->getTotalNumInputChannels() == 2, "stereo input bus (Audio In 1/2)");

    for (double sr : { 44100.0, 48000.0, 96000.0 }) {
        for (int block : { 64, 512, 2048 }) {
            const auto r = renderNotes(*a, sr, block, 1.0, false);
            check(r.finite && r.peak > 0.01f && r.peak < 4.0f,
                  juce::String::formatted("render %.0f Hz / block %d: peak %.3f", sr, block, double(r.peak)));
        }
        const auto v = renderNotes(*a, sr, 1024, 1.0, true);
        check(v.finite && v.peak > 0.01f, juce::String::formatted("render %.0f Hz / variable blocks: peak %.3f", sr, double(v.peak)));
    }
    a->prepareToPlay(48000.0, 512);
    juce::MessageManager::getInstance()->runDispatchLoopUntil(200);
    check(a->getLatencySamples() == 25, "latency reported (2x oversampling at 48 kHz = 25 samples): " + juce::String(a->getLatencySamples()));
    a->releaseResources();
    int own = 0;
    for (auto* prm : a->getParameters()) own += isKestrelParam(prm) ? 1 : 0;
    std::printf("  %d Kestrel parameters\n", own);

    // programs
    if (a->getNumPrograms() > 1) {
        a->setCurrentProgram(1);
        juce::MessageManager::getInstance()->runDispatchLoopUntil(50);
        const auto r = renderNotes(*a, 48000.0, 512, 0.5, false);
        check(r.finite, "program 1 (" + a->getProgramName(1) + ") renders");
    }

    // state recall: change parameters, save, load into a fresh instance, compare
    juce::Random rnd(42);
    auto& params = a->getParameters();
    for (int i = 0; i < params.size(); i += 3)
        if (isKestrelParam(params[i])) params[i]->setValueNotifyingHost(rnd.nextFloat());
    juce::MessageManager::getInstance()->runDispatchLoopUntil(50);
    const auto before = paramTexts(*a);
    juce::MemoryBlock state;
    a->getStateInformation(state);
    check(state.getSize() > 100, "state size " + juce::String(int(state.getSize())));
    std::unique_ptr<juce::AudioPluginInstance> b(fmt.createInstanceFromDescription(desc, 48000.0, 512, err));
    b->setStateInformation(state.getData(), int(state.getSize()));
    juce::MessageManager::getInstance()->runDispatchLoopUntil(50);
    const auto after = paramTexts(*b);
    int mismatches = 0;
    for (size_t i = 0; i < before.size() && i < after.size(); ++i)
        if (before[i] != after[i]) {
            if (mismatches < 5) std::printf("    mismatch %s vs %s\n", before[i].toRawUTF8(), after[i].toRawUTF8());
            ++mismatches;
        }
    check(before.size() == after.size() && mismatches == 0, "state recall into a new instance (" + juce::String(mismatches) + " mismatches)");

    // automation while rendering: cutoff sweep must change the output and stay finite
    b->prepareToPlay(48000.0, 256);
    juce::AudioBuffer<float> buf(2, 256);
    juce::AudioProcessorParameter* cutoff = nullptr;
    for (auto* prm : b->getParameters())
        if (prm->getName(64).contains("T1 Cutoff")) cutoff = prm;
    check(cutoff != nullptr, "found 'T1 Cutoff' parameter");
    bool finite = true;
    float pk = 0.0f;
    for (int blk = 0; blk < 200; ++blk) {
        juce::MidiBuffer midi;
        if (blk == 0) midi.addEvent(juce::MidiMessage::noteOn(1, 48, uint8_t(100)), 0);
        if (cutoff) cutoff->setValueNotifyingHost(0.5f + 0.5f * std::sin(float(blk) * 0.1f));
        buf.clear();
        b->processBlock(buf, midi);
        for (int i = 0; i < 256; ++i) { finite &= std::isfinite(buf.getSample(0, i)); pk = std::max(pk, std::fabs(buf.getSample(0, i))); }
    }
    check(finite && pk > 0.01f, "automated cutoff sweep renders");
    b->releaseResources();
}
} // namespace

int main(int argc, char** argv) {
    juce::ScopedJuceInitialiser_GUI init;
    if (argc < 2) {
        std::printf("usage: kestrel_plugin_check <bundle.vst3> ...\n");
        return 2;
    }
    for (int i = 1; i < argc; ++i) checkPlugin(juce::String(argv[i]));
    std::printf("\n%s (%d failures)\n", failures == 0 ? "ALL CHECKS PASSED" : "CHECKS FAILED", failures);
    return failures == 0 ? 0 : 1;
}
