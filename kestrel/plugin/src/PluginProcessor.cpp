#include "PluginProcessor.h"

#include <juce_audio_formats/juce_audio_formats.h>

#include <bit>

#include "PluginEditor.h"
#include "osc/Wavetable.h"

namespace kestrel::plugin {

namespace {
juce::String groupIdFor(const ParamInfo& p) {
    const juce::String id(p.id);
    return id.upToFirstOccurrenceOf(".", false, false);
}
juce::String groupNameFor(const juce::String& gid) {
    if (gid == "t1") return "Timbre 1";
    if (gid == "t2") return "Timbre 2";
    if (gid == "prog") return "Program";
    if (gid == "arp") return "Arpeggiator";
    if (gid == "fx") return "Effects";
    if (gid == "voc") return "Vocoder";
    if (gid == "global") return "Global";
    return gid;
}
} // namespace

KestrelProcessor::BusesProperties KestrelProcessor::makeBuses() {
#if KESTREL_IS_FX_VARIANT
    return BusesProperties()
        .withInput("Audio In 1/2", juce::AudioChannelSet::stereo(), true)
        .withOutput("Output", juce::AudioChannelSet::stereo(), true);
#else
    // Instrument: stereo input bus "Audio In 1/2" (L = AUDIO IN 1 / modulator, R = AUDIO IN 2 / inst).
    // Hosts may disable it; the engine then receives silence.
    return BusesProperties()
        .withOutput("Output", juce::AudioChannelSet::stereo(), true)
        .withInput("Audio In 1/2", juce::AudioChannelSet::stereo(), true);
#endif
}

juce::AudioProcessorValueTreeState::ParameterLayout KestrelProcessor::createLayout() {
    std::map<juce::String, std::unique_ptr<juce::AudioProcessorParameterGroup>> groups;
    juce::StringArray order;
    for (int i = 0; i < kNumParams; ++i) {
        const ParamInfo& p = paramInfo(i);
        const juce::String gid = groupIdFor(p);
        if (!groups.count(gid)) {
            groups[gid] = std::make_unique<juce::AudioProcessorParameterGroup>(gid, groupNameFor(gid), "|");
            order.add(gid);
        }
        const juce::ParameterID pid { juce::String(p.id), 1 };
        const juce::String name(p.name);
        auto toText = [i](float v, int) { return juce::String(formatParamValue(i, v)); };
        std::unique_ptr<juce::RangedAudioParameter> param;
        switch (p.kind) {
            case PKind::Float:
                param = std::make_unique<juce::AudioParameterFloat>(
                    pid, name, juce::NormalisableRange<float>(p.minV, p.maxV), p.defV,
                    juce::AudioParameterFloatAttributes().withStringFromValueFunction(toText).withAutomatable(p.automatable));
                break;
            case PKind::Int:
                param = std::make_unique<juce::AudioParameterInt>(
                    pid, name, int(p.minV), int(p.maxV), int(p.defV),
                    juce::AudioParameterIntAttributes().withStringFromValueFunction(toText).withAutomatable(p.automatable));
                break;
            case PKind::Choice:
            case PKind::Bool: {
                juce::StringArray items;
                for (int c = 0; c < p.numChoices; ++c) items.add(p.choices[c]);
                param = std::make_unique<juce::AudioParameterChoice>(
                    pid, name, items, int(p.defV), juce::AudioParameterChoiceAttributes().withAutomatable(p.automatable));
                break;
            }
        }
        groups[gid]->addChild(std::move(param));
    }
    juce::AudioProcessorValueTreeState::ParameterLayout layout;
    for (auto& g : order) layout.add(std::move(groups[g]));
    return layout;
}

KestrelProcessor::KestrelProcessor()
    : AudioProcessor(makeBuses()), apvts_(*this, nullptr, "KestrelParams", createLayout()) {
    for (int i = 0; i < kNumParams; ++i) {
        const juce::String id(paramInfo(i).id);
        params_[size_t(i)] = apvts_.getParameter(id);
        raw_[size_t(i)] = apvts_.getRawParameterValue(id);
        jassert(params_[size_t(i)] != nullptr && raw_[size_t(i)] != nullptr);
        lastSent_[size_t(i)] = std::numeric_limits<float>::quiet_NaN();
    }
    midi_.resize(kMaxMidiEventsPerBlock);
    for (auto& h : publishedHold_) h.store(0.0f);
    if (bank_.size() > 0) {
        currentProgram_ = 0;
        loadProgram(bank_.entry(0).program);
    }
    keyboardState_.addListener(&uiKeyListener_);
    // Hosts may query latency before prepareToPlay: report the value for the typical case.
    setLatencySamples(Engine::latencyFor(48000.0, int(raw_[size_t(pG(Quality))]->load())));
    startTimerHz(10);
}

KestrelProcessor::~KestrelProcessor() {
    stopTimer();
    keyboardState_.removeListener(&uiKeyListener_);
}

void KestrelProcessor::pushUiNote(int status, int note, int vel) {
    const auto scope = uiFifo_.write(1);
    if (scope.blockSize1 > 0) uiNotes_[size_t(scope.startIndex1)] = uint32_t(status) | (uint32_t(note & 127) << 8) | (uint32_t(vel & 127) << 16);
}

bool KestrelProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const {
    const auto out = layouts.getMainOutputChannelSet();
    if (out != juce::AudioChannelSet::stereo() && out != juce::AudioChannelSet::mono()) return false;
    const auto in = layouts.getMainInputChannelSet();
    return in.isDisabled() || in == juce::AudioChannelSet::mono() || in == juce::AudioChannelSet::stereo();
}

void KestrelProcessor::prepareToPlay(double sampleRate, int samplesPerBlock) {
    sampleRate_ = sampleRate;
    maxBlock_ = std::max(1, samplesPerBlock);
    engine_.prepare(sampleRate, maxBlock_);
    inCopy_.setSize(4, std::max(maxBlock_, 2048), false, true, false);
    for (auto& v : lastSent_) v = std::numeric_limits<float>::quiet_NaN();
    snapParams_.store(true);
    setLatencySamples(Engine::latencyFor(sampleRate, int(raw_[size_t(pG(Quality))]->load())));
}

void KestrelProcessor::releaseResources() {}

void KestrelProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) {
    juce::ScopedNoDenormals noDenormals;
    const int n = buffer.getNumSamples();
    const int numIn = getTotalNumInputChannels();
    const int numOut = getTotalNumOutputChannels();

    // ---- parameters (only changed values are forwarded)
    if (snapParams_.exchange(false)) {
        std::array<float, kNumParams> all {};
        for (int i = 0; i < kNumParams; ++i) all[size_t(i)] = raw_[size_t(i)]->load(std::memory_order_relaxed);
        engine_.reset();
        engine_.setAllParamsImmediate(all.data());
        lastSent_ = all;
    } else {
        for (int i = 0; i < kNumParams; ++i) {
            const float v = raw_[size_t(i)]->load(std::memory_order_relaxed);
            if (std::bit_cast<uint32_t>(v) != std::bit_cast<uint32_t>(lastSent_[size_t(i)])) {
                engine_.setParam(i, v);
                lastSent_[size_t(i)] = v;
            }
        }
    }
    if (pendingHold_.exchange(false)) engine_.setVocoderHoldLevels(pendingHoldLevels_);

    // ---- transport
    TransportInfo tr;
    if (auto* ph = getPlayHead()) {
        if (auto pos = ph->getPosition()) {
            if (auto bpm = pos->getBpm()) { tr.valid = true; tr.bpm = *bpm; }
            if (auto ppq = pos->getPpqPosition()) tr.ppq = *ppq;
            tr.playing = pos->getIsPlaying();
        }
    }

    // ---- MIDI (sample-accurate; long system-exclusive messages are ignored)
    int ne = 0;
    {   // on-screen keyboard notes (lock-free FIFO from the message thread) at the block start
        const auto scope = uiFifo_.read(uiFifo_.getNumReady());
        auto take = [&](int start, int count) {
            for (int k = 0; k < count && ne < kMaxMidiEventsPerBlock; ++k) {
                const uint32_t m = uiNotes_[size_t(start + k)];
                MidiEvent& e = midi_[size_t(ne++)];
                e.offset = 0;
                e.size = 3;
                e.data[0] = uint8_t(m & 0xFF);
                e.data[1] = uint8_t((m >> 8) & 0x7F);
                e.data[2] = uint8_t((m >> 16) & 0x7F);
            }
        };
        take(scope.startIndex1, scope.blockSize1);
        take(scope.startIndex2, scope.blockSize2);
    }
    for (const auto meta : midi) {
        if (meta.numBytes < 1 || meta.numBytes > 3) continue;
        if (ne >= kMaxMidiEventsPerBlock) break;
        MidiEvent& e = midi_[size_t(ne++)];
        e.offset = juce::jlimit(0, std::max(0, n - 1), meta.samplePosition);
        e.size = uint8_t(meta.numBytes);
        e.data[0] = meta.data[0];
        e.data[1] = meta.numBytes > 1 ? meta.data[1] : 0;
        e.data[2] = meta.numBytes > 2 ? meta.data[2] : 0;
    }

    // ---- render in sub-blocks no larger than the scratch capacity (no allocation if a
    //      host delivers more samples than announced in prepareToPlay)
    const int cap = inCopy_.getNumSamples();
    int ei = 0;
    for (int start = 0; start < n; start += cap) {
        const int len = std::min(cap, n - start);
        // inputs are copied first: the buffer is overwritten by the output
        const float* in1 = nullptr;
        const float* in2 = nullptr;
        if (numIn > 0) {
            inCopy_.copyFrom(0, 0, buffer, 0, start, len);
            inCopy_.copyFrom(1, 0, buffer, numIn > 1 ? 1 : 0, start, len);
            in1 = inCopy_.getReadPointer(0);
            in2 = inCopy_.getReadPointer(1);
        }
        const int firstEv = ei;
        while (ei < ne && midi_[size_t(ei)].offset < start + len) {
            midi_[size_t(ei)].offset -= start;
            ++ei;
        }
        float* l = numOut > 1 ? buffer.getWritePointer(0, start) : inCopy_.getWritePointer(2);
        float* r = numOut > 1 ? buffer.getWritePointer(1, start) : inCopy_.getWritePointer(3);
        engine_.process(l, r, in1, in2, len, midi_.data() + firstEv, ei - firstEv, tr);
        if (numOut == 1) {
            float* o = buffer.getWritePointer(0, start);
            for (int i = 0; i < len; ++i) o[i] = 0.5f * (l[i] + r[i]);
        }
        if (tr.playing && tr.valid) tr.ppq += double(len) / sampleRate_ * tr.bpm / 60.0;
    }
    for (int ch = 2; ch < buffer.getNumChannels(); ++ch) buffer.clear(ch, 0, n);
    midi.clear();

    // ---- publish formant hold levels for state saving
    if (engine_.vocoderHoldValid()) {
        const auto h = engine_.vocoderHoldLevels();
        for (int b = 0; b < 16; ++b) publishedHold_[size_t(b)].store(h[size_t(b)], std::memory_order_relaxed);
        publishedHoldValid_.store(true, std::memory_order_relaxed);
    } else {
        publishedHoldValid_.store(false, std::memory_order_relaxed);
    }
}

void KestrelProcessor::timerCallback() {
    const int lat = Engine::latencyFor(sampleRate_, int(raw_[size_t(pG(Quality))]->load()));
    if (lat != getLatencySamples()) setLatencySamples(lat);
    engine_.collectGarbage();
    // received hardware-map CC / NRPN changes -> host parameters (keeps automation lanes in sync)
    int idx;
    float v;
    while (engine_.popControllerChange(idx, v)) {
        auto* prm = params_[size_t(idx)];
        prm->setValueNotifyingHost(prm->convertTo0to1(v));
    }
}

juce::AudioProcessorEditor* KestrelProcessor::createEditor() { return new KestrelEditor(*this); }

// ---------------------------------------------------------------- programs
Program KestrelProcessor::captureProgram() const {
    Program p;
    p.name = programName_.toStdString();
    for (int i = 0; i < kNumParams; ++i) p.values[size_t(i)] = raw_[size_t(i)]->load();
    if (publishedHoldValid_.load()) {
        p.hasHold = true;
        p.hold = holdLevels();
    }
    return p;
}

void KestrelProcessor::loadProgram(const Program& p) {
    for (int i = 0; i < kNumParams; ++i) {
        if (isGlobalSetting(i)) continue; // GLOBAL settings belong to the instrument, not the program
        auto* prm = params_[size_t(i)];
        prm->setValueNotifyingHost(prm->convertTo0to1(sanitizeParamValue(i, p.values[size_t(i)])));
    }
    programName_ = juce::String(p.name);
    if (p.hasHold) {
        pendingHoldLevels_ = p.hold;
        pendingHold_.store(true);
    }
    snapParams_.store(true);
}

void KestrelProcessor::setCurrentProgram(int index) {
    if (index < 0 || index >= bank_.size()) return;
    currentProgram_ = index;
    loadProgram(bank_.entry(index).program);
}

const juce::String KestrelProcessor::getProgramName(int index) {
    if (index < 0 || index >= bank_.size()) return {};
    const auto& e = bank_.entry(index);
    return juce::String(e.program.category.empty() ? "" : e.program.category + ": ") + juce::String(e.program.name);
}

// ---------------------------------------------------------------- DWGS import
bool KestrelProcessor::importDwgs(int slot, const juce::File& file, juce::String& error) {
    if (slot < 0 || slot >= dwgs::kNumWaves) { error = "invalid slot"; return false; }
    WaveBank::Spectrum s;
    std::string err;
    bool ok = false;
    if (file.hasFileExtension("wav;aif;aiff;flac")) {
        juce::AudioFormatManager fm;
        fm.registerBasicFormats();
        std::unique_ptr<juce::AudioFormatReader> r(fm.createReaderFor(file));
        if (!r) { error = "cannot read audio file"; return false; }
        const int len = int(std::min<juce::int64>(r->lengthInSamples, 1 << 16));
        juce::AudioBuffer<float> b(1, len);
        r->read(&b, 0, len, 0, true, false);
        std::vector<float> cyc(b.getReadPointer(0), b.getReadPointer(0) + len);
        ok = dwgs::spectrumFromCycle(cyc, s, err);
    } else {
        ok = dwgs::parseHarmonicText(file.loadFileAsString().toStdString(), s, err);
    }
    if (!ok) { error = juce::String(err); return false; }
    {
        const juce::ScopedLock sl(dwgsLock_);
        dwgsOverrides_[size_t(slot)] = s;
    }
    rebuildWaveTables();
    return true;
}

void KestrelProcessor::clearDwgs(int slot) {
    if (slot < 0 || slot >= dwgs::kNumWaves) return;
    {
        const juce::ScopedLock sl(dwgsLock_);
        dwgsOverrides_[size_t(slot)] = {};
    }
    rebuildWaveTables();
}

bool KestrelProcessor::dwgsIsUser(int slot) const {
    if (slot < 0 || slot >= dwgs::kNumWaves) return false;
    return !dwgsOverrides_[size_t(slot)].amp.empty();
}

void KestrelProcessor::rebuildWaveTables() {
    DwgsOverrides copy;
    {
        const juce::ScopedLock sl(dwgsLock_);
        copy = dwgsOverrides_;
    }
    engine_.setWaveTables(buildWaveTables(&copy)); // lock-free handoff to the audio thread
}

std::array<float, 16> KestrelProcessor::holdLevels() const {
    std::array<float, 16> h {};
    for (int b = 0; b < 16; ++b) h[size_t(b)] = publishedHold_[size_t(b)].load();
    return h;
}

// ---------------------------------------------------------------- state
void KestrelProcessor::getStateInformation(juce::MemoryBlock& destData) {
    juce::XmlElement root("KestrelVA");
    root.setAttribute("version", 1);
    root.setAttribute("program", programName_);
    root.setAttribute("programIndex", currentProgram_);
    if (auto params = apvts_.copyState().createXml()) root.addChildElement(params.release());
    {
        const juce::ScopedLock sl(dwgsLock_);
        for (int i = 0; i < dwgs::kNumWaves; ++i) {
            if (dwgsOverrides_[size_t(i)].amp.empty()) continue;
            auto* e = root.createNewChildElement("DWGS");
            e->setAttribute("slot", i + 1);
            e->addTextElement(juce::String(dwgs::toHarmonicText(dwgsOverrides_[size_t(i)])));
        }
    }
    if (publishedHoldValid_.load()) {
        juce::StringArray vals;
        for (float v : holdLevels()) vals.add(juce::String(v, 7));
        root.createNewChildElement("HOLD")->addTextElement(vals.joinIntoString(","));
    }
    copyXmlToBinary(root, destData);
}

void KestrelProcessor::setStateInformation(const void* data, int sizeInBytes) {
    auto xml = getXmlFromBinary(data, sizeInBytes);
    if (!xml || !xml->hasTagName("KestrelVA")) return;
    if (auto* params = xml->getChildByName(apvts_.state.getType())) apvts_.replaceState(juce::ValueTree::fromXml(*params));
    programName_ = xml->getStringAttribute("program", "Init Program");
    currentProgram_ = juce::jlimit(0, std::max(0, bank_.size() - 1), xml->getIntAttribute("programIndex", 0));
    DwgsOverrides ov;
    for (auto* e : xml->getChildWithTagNameIterator("DWGS")) {
        const int slot = e->getIntAttribute("slot", 0) - 1;
        if (slot < 0 || slot >= dwgs::kNumWaves) continue;
        WaveBank::Spectrum s;
        std::string err;
        if (dwgs::parseHarmonicText(e->getAllSubText().toStdString(), s, err)) ov[size_t(slot)] = s;
    }
    {
        const juce::ScopedLock sl(dwgsLock_);
        dwgsOverrides_ = ov;
    }
    rebuildWaveTables();
    if (auto* h = xml->getChildByName("HOLD")) {
        juce::StringArray vals;
        vals.addTokens(h->getAllSubText(), ",", "");
        if (vals.size() == 16) {
            for (int b = 0; b < 16; ++b) pendingHoldLevels_[size_t(b)] = vals[b].getFloatValue();
            pendingHold_.store(true);
        }
    }
    snapParams_.store(true);
}

} // namespace kestrel::plugin

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new kestrel::plugin::KestrelProcessor(); }
