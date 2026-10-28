"""Fixture-only Win32 sharing probe or read handle that denies deletion."""
import ctypes
from ctypes import wintypes
from pathlib import Path
import json
import sys

path = Path(sys.argv[2]).resolve()
if not any(p.name.startswith('auralis-mpv-m4a-') for p in path.parents):
    raise RuntimeError('Only isolated fixture paths are accepted')
api = ctypes.WinDLL('kernel32', use_last_error=True)
api.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p,
                           wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
api.CreateFileW.restype = wintypes.HANDLE
api.CloseHandle.argtypes = [wintypes.HANDLE]
share = 3 if sys.argv[1] == 'hold' else 0
handle = api.CreateFileW(str(path), 0x80000000, share, None, 3, 0x80, None)
error = ctypes.get_last_error() if handle == ctypes.c_void_p(-1).value else 0
print(json.dumps({'opened': not error, 'winError': error}), flush=True)
if not error:
    try:
        if sys.argv[1] == 'hold':
            sys.stdin.readline()
    finally:
        api.CloseHandle(handle)
