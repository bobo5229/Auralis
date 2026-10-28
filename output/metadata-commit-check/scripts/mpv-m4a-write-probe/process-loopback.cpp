// Windows process-tree loopback API; inspired by Microsoft's ApplicationLoopback
// sample. Captures only the explicitly supplied test process and descendants.
#define NOMINMAX
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <wrl.h>
#include <fstream>
#include <filesystem>
#include <iostream>
#include <vector>
#include <stdexcept>

using namespace Microsoft::WRL;
void check(HRESULT hr) {
    if (FAILED(hr)) { std::cerr << "HRESULT 0x" << std::hex << unsigned(hr) << std::endl; throw std::runtime_error("audio API failed"); }
}
class Activation final : public RuntimeClass<RuntimeClassFlags<ClassicCom>, IActivateAudioInterfaceCompletionHandler, FtmBase> {
public:
    HANDLE done = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    HRESULT result = E_FAIL;
    ComPtr<IAudioClient> client;
    ~Activation() { CloseHandle(done); }
    STDMETHODIMP ActivateCompleted(IActivateAudioInterfaceAsyncOperation* operation) override {
        ComPtr<IUnknown> unknown;
        HRESULT status = operation->GetActivateResult(&result, &unknown);
        if (FAILED(status)) result = status;
        if (SUCCEEDED(result)) result = unknown.As(&client);
        SetEvent(done);
        return S_OK;
    }
};
int wmain(int argc, wchar_t** argv) {
    try {
        if (argc != 4) throw std::runtime_error("process-loopback.exe PID output-directory seconds");
        DWORD pid = std::stoul(argv[1]);
        std::filesystem::path root(argv[2]);
        DWORD duration = std::stoul(argv[3]) * 1000;
        check(CoInitializeEx(nullptr, COINIT_MULTITHREADED));
        AUDIOCLIENT_ACTIVATION_PARAMS params{};
        params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
        params.ProcessLoopbackParams.TargetProcessId = pid;
        params.ProcessLoopbackParams.ProcessLoopbackMode = PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE;
        PROPVARIANT blob{}; blob.vt = VT_BLOB;
        blob.blob.cbSize = sizeof(params); blob.blob.pBlobData = reinterpret_cast<BYTE*>(&params);
        auto activation = Make<Activation>();
        ComPtr<IActivateAudioInterfaceAsyncOperation> operation;
        check(ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, __uuidof(IAudioClient), &blob, activation.Get(), &operation));
        if (WaitForSingleObject(activation->done, 10000) != WAIT_OBJECT_0) throw std::runtime_error("activation timeout");
        check(activation->result);
        auto client = activation->client;
        WAVEFORMATEX fmt{}; fmt.wFormatTag = WAVE_FORMAT_IEEE_FLOAT;
        fmt.nChannels = 2; fmt.nSamplesPerSec = 48000; fmt.wBitsPerSample = 32;
        fmt.nBlockAlign = 8; fmt.nAvgBytesPerSec = 48000 * 8;
        check(client->Initialize(AUDCLNT_SHAREMODE_SHARED,
            AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK | AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,
            0, 0, &fmt, nullptr));
        HANDLE ready = CreateEventW(nullptr, FALSE, FALSE, nullptr);
        check(client->SetEventHandle(ready));
        ComPtr<IAudioCaptureClient> capture;
        check(client->GetService(IID_PPV_ARGS(&capture)));
        std::ofstream audio(root / "loopback.f32", std::ios::binary);
        std::ofstream packets(root / "packets.csv");
        packets << "devicePosition,frames,flags,qpc100ns\n";
        check(client->Start());
        std::ofstream(root / "capture-ready") << "process-loopback";
        auto started = GetTickCount64();
        UINT64 frames = 0;
        while (GetTickCount64() - started < duration) {
            WaitForSingleObject(ready, 100);
            UINT32 count = 0; check(capture->GetNextPacketSize(&count));
            while (count) {
                BYTE* data = nullptr; DWORD flags = 0; UINT64 position = 0, qpc = 0;
                check(capture->GetBuffer(&data, &count, &flags, &position, &qpc));
                packets << position << ',' << count << ',' << flags << ',' << qpc << '\n';
                if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
                    std::vector<char> zeros(count * fmt.nBlockAlign); audio.write(zeros.data(), zeros.size());
                } else audio.write(reinterpret_cast<char*>(data), count * fmt.nBlockAlign);
                frames += count;
                check(capture->ReleaseBuffer(count));
                check(capture->GetNextPacketSize(&count));
            }
        }
        check(client->Stop());
        CloseHandle(ready);
        std::ofstream info(root / "device.json");
        info << "{\"capture\":\"Windows process-tree loopback\",\"targetPid\":" << pid
             << ",\"rate\":48000,\"channels\":2,\"frames\":" << frames
             << ",\"physical_microphone\":false,\"other_processes_included\":false}";
        std::cout << "captured " << frames << " frames" << std::endl;
        return 0;
    } catch (const std::exception& e) { std::cerr << e.what() << std::endl; return 1; }
}
