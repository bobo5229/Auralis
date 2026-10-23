// Windows M4A publication and a non-mutating source lock for exclusive tag publication.
#define NOMINMAX
#define _WIN32_WINNT 0x0A00
#include <windows.h>
#include <filesystem>
#include <iostream>
#include <vector>
#include <string>

struct Handle {
    HANDLE value = INVALID_HANDLE_VALUE;
    ~Handle() { if (value != INVALID_HANDLE_VALUE) CloseHandle(value); }
};
int failure(DWORD error) {
    std::cout << "{\"winError\":" << error << "}" << std::endl;
    return 1;
}
int wmain(int argc, wchar_t** argv) {
    const bool lockOnly = argc == 8 && std::wstring(argv[7]) == L"--lock-source";
    if (argc != 7 && !lockOnly) return failure(ERROR_INVALID_PARAMETER);
    try {
        const auto original = std::filesystem::absolute(argv[1]).lexically_normal();
        const auto staging = std::filesystem::absolute(argv[2]).lexically_normal();
        auto extension = original.extension().wstring();
        for (auto& c : extension) c = towlower(c);
        if ((!lockOnly && extension != L".m4a") || original.parent_path() != staging.parent_path() ||
            !staging.wstring().starts_with(original.wstring() + L".auralis-replacement-"))
            return failure(ERROR_INVALID_PARAMETER);
        // Deny new writers, and require all existing readers to share deletion.
        Handle source{CreateFileW(original.c_str(), GENERIC_READ | DELETE,
            FILE_SHARE_READ | FILE_SHARE_DELETE, nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr)};
        if (source.value == INVALID_HANDLE_VALUE) return failure(GetLastError());
        BY_HANDLE_FILE_INFORMATION info{};
        if (!GetFileInformationByHandle(source.value, &info)) return failure(GetLastError());
        const auto size = (UINT64(info.nFileSizeHigh) << 32) | info.nFileSizeLow;
        const auto id = (UINT64(info.nFileIndexHigh) << 32) | info.nFileIndexLow;
        const auto ticks = (UINT64(info.ftLastWriteTime.dwHighDateTime) << 32) | info.ftLastWriteTime.dwLowDateTime;
        const auto mtimeNs = (ticks - 116444736000000000ULL) * 100;
        FILE_BASIC_INFO basic{};
        if (!GetFileInformationByHandleEx(source.value, FileBasicInfo, &basic, sizeof(basic)))
            return failure(GetLastError());
        const auto ctimeNs = (UINT64(basic.ChangeTime.QuadPart) - 116444736000000000ULL) * 100;
        if (size != std::stoull(argv[3]) || id != std::stoull(argv[4]) ||
            mtimeNs != std::stoull(argv[5]) || ctimeNs != std::stoull(argv[6]))
            return failure(ERROR_FILE_INVALID);
        if (lockOnly) {
            // Keep the source inode immutable while the main process moves it,
            // publishes without overwriting and either removes or restores it.
            // A crashed parent closes stdin, releasing this read-only lock.
            std::cout << "{\"winError\":0}" << std::endl;
            char command;
            DWORD received;
            ReadFile(GetStdHandle(STD_INPUT_HANDLE), &command, 1, &received, nullptr);
            return 0;
        }
        Handle replacement{CreateFileW(staging.c_str(), GENERIC_READ | GENERIC_WRITE | DELETE,
            0, nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr)};
        if (replacement.value == INVALID_HANDLE_VALUE) return failure(GetLastError());
        if (!FlushFileBuffers(replacement.value)) return failure(GetLastError());
        const auto name = original.wstring();
        const DWORD bytes = DWORD(name.size() * sizeof(wchar_t));
        std::vector<BYTE> buffer(offsetof(FILE_RENAME_INFO, FileName) + bytes + sizeof(wchar_t));
        auto rename = reinterpret_cast<FILE_RENAME_INFO*>(buffer.data());
        rename->Flags = FILE_RENAME_FLAG_REPLACE_IF_EXISTS | FILE_RENAME_FLAG_POSIX_SEMANTICS;
        rename->RootDirectory = nullptr;
        rename->FileNameLength = bytes;
        memcpy(rename->FileName, name.data(), bytes);
        if (!SetFileInformationByHandle(replacement.value, FileRenameInfoEx, rename, DWORD(buffer.size())))
            return failure(GetLastError());
        // There are deliberately no fallible filesystem operations after publication.
        std::cout << "{\"winError\":0}" << std::endl;
        return 0;
    } catch (...) { return failure(ERROR_INVALID_PARAMETER); }
}
