#include "PresetBank.h"

#include "BinaryData.h"

namespace kestrel::plugin {

PresetBank::PresetBank() {
    loadFactory();
    rescanUser();
}

void PresetBank::loadFactory() {
    entries_.clear();
    juce::StringArray order;
    int orderSize = 0;
    if (const char* o = BinaryData::getNamedResource("bankorder_txt", orderSize))
        order.addLines(juce::String::fromUTF8(o, orderSize));
    order.trim();
    order.removeEmptyStrings();

    auto resourceFor = [](const juce::String& fileName) {
        for (int i = 0; i < BinaryData::namedResourceListSize; ++i)
            if (fileName == BinaryData::getNamedResourceOriginalFilename(BinaryData::namedResourceList[i]))
                return juce::String(BinaryData::namedResourceList[i]);
        return juce::String();
    };
    juce::StringArray names;
    for (auto& line : order) {
        if (line.startsWithChar('#')) continue;
        const auto r = resourceFor(line.trim());
        if (r.isNotEmpty()) names.add(r);
    }
    // any embedded program not listed in the order file goes last
    for (int i = 0; i < BinaryData::namedResourceListSize; ++i) {
        const juce::String orig = BinaryData::getNamedResourceOriginalFilename(BinaryData::namedResourceList[i]);
        if (orig.endsWith(".kvp") && !names.contains(BinaryData::namedResourceList[i])) names.add(BinaryData::namedResourceList[i]);
    }
    for (auto& n : names) {
        int sz = 0;
        const char* data = BinaryData::getNamedResource(n.toRawUTF8(), sz);
        if (data == nullptr) continue;
        Entry e;
        std::string err;
        if (!parseProgram(std::string(data, size_t(sz)), e.program, err)) continue;
        e.file = n;
        e.factory = true;
        entries_.push_back(std::move(e));
    }
    if (entries_.empty()) {
        Entry e;
        e.program.name = "Init Program";
        entries_.push_back(e);
    }
    numFactory_ = int(entries_.size());
}

juce::File PresetBank::userFolder() {
    return juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory)
        .getChildFile("Kestrel VA").getChildFile("Programs");
}

void PresetBank::rescanUser() {
    entries_.resize(size_t(numFactory_));
    const auto dir = userFolder();
    if (!dir.isDirectory()) return;
    auto files = dir.findChildFiles(juce::File::findFiles, false, "*.kvp");
    files.sort();
    for (auto& f : files) {
        Entry e;
        std::string err;
        if (!parseProgram(f.loadFileAsString().toStdString(), e.program, err)) continue;
        e.file = f.getFullPathName();
        e.factory = false;
        entries_.push_back(std::move(e));
    }
}

bool PresetBank::saveUser(const Program& p, juce::String& error) {
    const auto dir = userFolder();
    if (!dir.createDirectory()) { error = "cannot create " + dir.getFullPathName(); return false; }
    auto name = juce::File::createLegalFileName(juce::String(p.name).trim());
    if (name.isEmpty()) name = "Program";
    const auto file = dir.getChildFile(name + ".kvp");
    if (!file.replaceWithText(juce::String(serializeProgram(p)))) { error = "cannot write " + file.getFullPathName(); return false; }
    rescanUser();
    return true;
}

} // namespace kestrel::plugin
