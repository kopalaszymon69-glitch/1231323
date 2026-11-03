#pragma once

#include <juce_core/juce_core.h>

#include <vector>

#include "io/ProgramIO.h"

namespace kestrel::plugin {

// Factory programs embedded in the binary (presets/*.kvp, order from presets/bank-order.txt)
// plus user programs saved in the user's application-data folder.
class PresetBank {
public:
    struct Entry {
        Program program;
        juce::String file;   // resource name or absolute path
        bool factory = true;
    };

    PresetBank();
    int size() const noexcept { return int(entries_.size()); }
    const Entry& entry(int i) const { return entries_[size_t(i)]; }
    void rescanUser();

    static juce::File userFolder();
    bool saveUser(const Program& p, juce::String& error);

private:
    void loadFactory();
    std::vector<Entry> entries_;
    int numFactory_ = 0;
};

} // namespace kestrel::plugin
