// Isolated foobar2000 component: synthetic fixtures only, no Auralis integration.
#define NOMINMAX
#include <SDK/foobar2000.h>
#include <atomic>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <mutex>
#include <thread>
#include <vector>

DECLARE_COMPONENT_VERSION("Auralis isolated M4A probe", "0.1", "Synthetic fixtures only")
VALIDATE_COMPONENT_FILENAME("foo_auralis_probe.dll")

namespace {
namespace fs = std::filesystem;
using Clock = std::chrono::steady_clock;
fs::path root;
std::mutex logMutex;
std::ofstream logFile;
std::vector<std::string> samples;
std::thread worker;
// Host services are unavailable during DLL static initialization. The latest
// SDK abort_callback_impl queries a host service in its constructor.
class ProbeAbort : public abort_callback {
    std::atomic<bool> stopped{false};
    HANDLE event = CreateEventW(nullptr, TRUE, FALSE, nullptr);
public:
    ~ProbeAbort() { CloseHandle(event); }
    bool is_aborting() const override { return stopped; }
    abort_callback_event get_abort_event() const override { return event; }
    void set() { stopped = true; SetEvent(event); }
} shutdownAbort;

double elapsed(Clock::time_point t) {
    return std::chrono::duration<double, std::milli>(Clock::now() - t).count();
}
template<typename... T> void log(T const&... v) {
    std::lock_guard<std::mutex> guard(logMutex);
    ((logFile << v), ...); logFile << std::endl;
}
std::string url(const fs::path& p) {
    pfc::string8 out;
    auto u = p.u8string();
    filesystem::g_get_canonical_path(reinterpret_cast<const char*>(u.c_str()), out);
    return out.c_str();
}
input_decoder::ptr openDecoder(const std::string& path) {
    input_decoder::ptr d;
    input_entry::g_open_for_decoding(d, nullptr, path.c_str(), shutdownAbort);
    d->initialize(0, input_flag_no_looping | input_flag_no_postproc, shutdownAbort);
    return d;
}
struct PCM {
    std::vector<audio_sample> data;
    unsigned rate = 0, channels = 0;
    void append(const audio_chunk& c) {
        if (rate && (rate != c.get_srate() || channels != c.get_channels()))
            throw std::runtime_error("PCM format changed");
        rate = c.get_srate(); channels = c.get_channels();
        data.insert(data.end(), c.get_data(), c.get_data() + c.get_sample_count() * channels);
    }
    void save(const fs::path& p) const {
        // Normalize the artifact format across SDK audio_sample configurations.
        std::ofstream f(p, std::ios::binary);
        for (auto v : data) { double d = v; f.write(reinterpret_cast<char*>(&d), sizeof(d)); }
    }
};
PCM decode(const std::string& path) {
    auto lock = file_lock_manager::get()->acquire_read(path.c_str(), shutdownAbort);
    auto d = openDecoder(path);
    PCM pcm; audio_chunk_impl chunk;
    while (d->run(chunk, shutdownAbort)) pcm.append(chunk);
    return pcm;
}
double compare(const PCM& a, const PCM& b) {
    if (a.rate != b.rate || a.channels != b.channels || a.data.size() != b.data.size()) return -1;
    double maxError = 0;
    for (size_t i = 0; i < a.data.size(); ++i)
        maxError = std::max(maxError, std::abs(double(a.data[i]) - double(b.data[i])));
    return maxError;
}
void writeTags(const std::string& path, const std::string& title, int ordinal, const char* mode) {
    auto start = Clock::now();
    log("write-request\t", mode, "\t", ordinal);
    auto lock = file_lock_manager::get()->acquire_write(path.c_str(), shutdownAbort);
    double lockMs = elapsed(start);
    input_info_writer::ptr w;
    input_entry::g_open_for_info_write(w, nullptr, path.c_str(), shutdownAbort);
    file_info_impl info; w->get_info(0, info, shutdownAbort);
    info.meta_set("TITLE", title.c_str());
    info.meta_set("ARTIST", "Auralis isolated SDK test");
    w->set_info(0, info, shutdownAbort); w->commit(shutdownAbort);
    w.release();
    input_info_reader::ptr r;
    input_entry::g_open_for_info_read(r, nullptr, path.c_str(), shutdownAbort);
    file_info_impl actual; r->get_info(0, actual, shutdownAbort);
    auto value = actual.meta_get("TITLE", 0);
    if (!value || title != value) throw std::runtime_error("tag readback mismatch");
    log("write-ok\t", mode, "\t", ordinal, "\t", lockMs, "\t", elapsed(start), "\t", title.size());
}

// Exercise the documented cooperative protocol using the real SDK lock manager
// and the host's real M4A decoders. This is distinct from the host playback test.
void cooperativeTest(const std::string& name) {
    const auto original = root / "fixtures" / name;
    const auto target = root / "work" / ("cooperative-" + name);
    fs::copy_file(original, target, fs::copy_options::overwrite_existing);
    const auto path = url(target);
    const auto baseline = decode(path);
    auto api = file_lock_manager::get();
    auto lock = api->acquire_read(path.c_str(), shutdownAbort);
    auto d = openDecoder(path);
    PCM actual; audio_chunk_impl chunk;
    std::exception_ptr writeError;
    std::thread writer;
    unsigned round = 0;
    size_t frames = 0;
    while (d->run(chunk, shutdownAbort)) {
        actual.append(chunk); frames += chunk.get_sample_count();
        if (round < 3 && frames >= baseline.rate * (2 + round * 2)) {
            const auto n = ++round;
            writer = std::thread([&, n] {
                try { writeTags(path, n == 2 ? std::string(131072, 'X') : "edit-" + std::to_string(n), n, "cooperative"); }
                catch (...) { writeError = std::current_exception(); }
            });
            const auto waitStart = Clock::now();
            while (!lock->is_release_requested()) {
                if (elapsed(waitStart) > 10000) {
                    shutdownAbort.set(); writer.join();
                    throw std::runtime_error("release signal timeout");
                }
                Sleep(1);
            }
            d.release(); lock.release();
            writer.join(); // wait for the actual tag writer before reacquiring
            if (writeError) std::rethrow_exception(writeError);
            lock = api->acquire_read(path.c_str(), shutdownAbort);
            d = openDecoder(path);
            d->seek(double(frames) / baseline.rate, shutdownAbort);
            log("reopened\t", name, "\t", n, "\t", frames, "\t", elapsed(waitStart));
        }
    }
    d.release(); lock.release();
    const auto error = compare(baseline, actual);
    log("cooperative-result\t", name, "\t", round, "\t", baseline.data.size() / baseline.channels,
        "\t", actual.data.size() / actual.channels, "\t", error);
    baseline.save(root / "results" / (name + ".reference.f64"));
    actual.save(root / "results" / (name + ".cooperative.f64"));
    log("format\t", name, "\t", baseline.rate, "\t", baseline.channels);
}

PCM capture;
size_t playbackIndex = 0;
bool editingPass = false, capturing = false;
std::atomic<bool> writerDone{true};
std::atomic<unsigned> edits{0};
std::string activePath;
Clock::time_point captureStart, lastChunk;
double maxChunkInterval = 0;

void startPlayback();
class Capture : public playback_stream_capture_callback {
    void on_chunk(const audio_chunk& chunk) override {
        if (!capturing) return;
        auto now = Clock::now();
        if (!capture.data.empty()) maxChunkInterval = std::max(maxChunkInterval, elapsed(lastChunk));
        lastChunk = now;
        capture.append(chunk);
        auto frames = capture.data.size() / capture.channels;
        // Trigger from delivered audio, not a guessed wall-clock delay.
        if (editingPass && edits < 3 && writerDone && frames >= capture.rate * (2 + edits * 2)) {
            if (worker.joinable()) worker.join();
            writerDone = false;
            auto n = ++edits;
            log("playback-write-at\t", samples[playbackIndex], "\t", n, "\t", frames, "\t", elapsed(captureStart));
            worker = std::thread([n] {
                try { writeTags(activePath, n == 2 ? std::string(131072, 'Y') : "playing-edit-" + std::to_string(n), n, "playback"); }
                catch (const std::exception& e) { log("ERROR\tplayback-write\t", e.what()); }
                writerDone = true;
            });
        }
    }
} captureCallback;

class Playback : public play_callback_static {
public:
    unsigned get_flags() override { return flag_on_playback_all; }
    void on_playback_starting(play_control::t_track_command, bool) override {}
    void on_playback_new_track(metadb_handle_ptr) override {
        if (capturing) log("playback-new-track\t", samples[playbackIndex], "\t", editingPass);
    }
    void on_playback_stop(play_control::t_stop_reason reason) override {
        if (!capturing) return;
        capturing = false;
        log("playback-stop\t", samples[playbackIndex], "\t", editingPass, "\t", reason,
            "\t", capture.data.size() / std::max(1u, capture.channels), "\t", edits.load(), "\t", maxChunkInterval);
        capture.save(root / "results" / (samples[playbackIndex] + (editingPass ? ".edited.f64" : ".control.f64")));
        if (worker.joinable()) worker.join();
        if (!editingPass) editingPass = true;
        else { editingPass = false; ++playbackIndex; }
        fb2k::inMainThread([] { startPlayback(); });
    }
    void on_playback_seek(double t) override { log("playback-seek\t", t); }
    void on_playback_pause(bool p) override { log("playback-pause\t", p); }
    void on_playback_edited(metadb_handle_ptr) override { log("playback-edited-event"); }
    void on_playback_dynamic_info(const file_info&) override {}
    void on_playback_dynamic_info_track(const file_info&) override {}
    void on_playback_time(double) override {}
    void on_volume_change(float) override {}
};
play_callback_static_factory_t<Playback> playbackFactory;

void startPlayback() {
    if (playbackIndex == samples.size()) {
        playback_stream_capture::get()->remove_callback(&captureCallback);
        log("DONE");
        PostMessage(core_api::get_main_window(), WM_CLOSE, 0, 0);
        return;
    }
    const auto& name = samples[playbackIndex];
    const auto target = root / "work" / ("playing-" + name);
    fs::copy_file(root / "fixtures" / name, target, fs::copy_options::overwrite_existing);
    activePath = url(target);
    auto pm = playlist_manager::get();
    auto idx = pm->find_or_create_playlist("Isolated SDK probe");
    pm->playlist_clear(idx);
    metadb_handle_list items;
    items.add_item(metadb::get()->handle_create(activePath.c_str(), 0));
    pm->playlist_add_items(idx, items, bit_array_true());
    pm->set_active_playlist(idx); pm->set_playing_playlist(idx); pm->playlist_set_focus_item(idx, 0);
    capture = {}; edits = 0; maxChunkInterval = 0;
    capturing = true; captureStart = Clock::now();
    log("playback-start\t", name, "\t", editingPass);
    playback_control::get()->start(playback_control::track_command_play);
}

class Init : public initquit {
public:
    void on_init() override {
        // Explicit environment opt-in prevents an accidentally copied component
        // from testing an ordinary foobar2000 installation.
        wchar_t path[32768];
        if (!GetEnvironmentVariableW(L"AURALIS_FB2K_PROBE_ROOT", path, 32768)) return;
        root = path;
        if (!fs::exists(root / "ISOLATED_SYNTHETIC_ONLY")) return;
        fs::create_directories(root / "work"); fs::create_directories(root / "results");
        logFile.open(root / "results" / "events.tsv", std::ios::trunc);
        std::ifstream manifest(root / "samples.txt");
        for (std::string line; std::getline(manifest, line);) {
            if (!line.empty() && line.back() == '\r') line.pop_back();
            if (line.empty()) continue;
            if (fs::path(line).filename().string() != line) throw std::runtime_error("invalid sample name");
            samples.push_back(line);
        }
        log("host-profile\t", core_api::get_profile_path());
        log("sample-bytes\t", sizeof(audio_sample));
        ShowWindow(core_api::get_main_window(), SW_HIDE);
        // Null output exercises the host playback pipeline without audible tones.
        auto out = output_manager_v2::get();
        out->listDevices([](const char* name, const GUID&, const GUID&) { log("output-device\t", name); });
        auto config = out->getCoreConfig();
        config.m_output = output_id_null; config.m_device = pfc::guid_null;
        config.m_buffer_length = 1; config.m_flags = 0;
        out->setCoreConfig(config);
        playback_stream_capture_v2::get()->add_callback_v2(&captureCallback, 0.02);
        worker = std::thread([] {
            try { for (const auto& name : samples) cooperativeTest(name); }
            catch (const std::exception& e) { log("ERROR\tcooperative\t", e.what()); }
            fb2k::inMainThread([] { if (worker.joinable()) worker.join(); startPlayback(); });
        });
    }
    void on_quit() override {
        shutdownAbort.set();
        if (worker.joinable()) worker.join();
        if (logFile.is_open()) log("QUIT");
    }
};
initquit_factory_t<Init> initFactory;
} // namespace
