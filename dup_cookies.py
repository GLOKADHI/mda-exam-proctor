import ctypes
from ctypes import wintypes
import os

ntdll = ctypes.WinDLL("ntdll.dll")
kernel32 = ctypes.WinDLL("kernel32.dll")

STATUS_INFO_LENGTH_MISMATCH = 0xC0000004
SystemHandleInformation = 16

class SYSTEM_HANDLE_TABLE_ENTRY_INFO(ctypes.Structure):
    _fields_ = [
        ("UniqueProcessId", wintypes.USHORT),
        ("CreatorBackTraceIndex", wintypes.USHORT),
        ("ObjectTypeIndex", ctypes.c_ubyte),
        ("HandleAttributes", ctypes.c_ubyte),
        ("HandleValue", wintypes.USHORT),
        ("Object", ctypes.c_void_p),
        ("GrantedAccess", wintypes.ULONG),
    ]

pid = 10880
h_proc = kernel32.OpenProcess(0x0040, False, pid) # PROCESS_DUP_HANDLE
print("Process handle:", h_proc)

if not h_proc:
    print("Cannot open process:", kernel32.GetLastError())
    exit(1)

# Allocate buffer for SystemHandleInformation
size = 1024 * 1024
buf = ctypes.create_string_buffer(size)
ret_len = wintypes.ULONG()

while True:
    status = ntdll.NtQuerySystemInformation(SystemHandleInformation, buf, size, ctypes.byref(ret_len))
    code = status & 0xFFFFFFFF
    if code == 0xC0000004:
        size = ret_len.value + 128 * 1024
        buf = ctypes.create_string_buffer(size)
    elif code == 0:
        break
    else:
        print("NtQuerySystemInformation failed:", hex(code))
        exit(1)

handle_count = ctypes.cast(buf, ctypes.POINTER(ctypes.c_ulong)).contents.value
print("Total system handles:", handle_count)

entries_ptr = ctypes.addressof(buf) + ctypes.sizeof(ctypes.c_ulong) + (4 if ctypes.sizeof(ctypes.c_void_p) == 8 else 0)
entry_size = ctypes.sizeof(SYSTEM_HANDLE_TABLE_ENTRY_INFO)

target_handles = []
for i in range(handle_count):
    entry = SYSTEM_HANDLE_TABLE_ENTRY_INFO.from_address(entries_ptr + i * entry_size)
    if entry.UniqueProcessId == pid:
        target_handles.append(entry.HandleValue)

print(f"Found {len(target_handles)} handles in PID {pid}")

temp_db = r"C:\Users\lokad\Music\quiz\temp_dup_cookies.db"

found = False
for h in target_handles:
    dup_handle = wintypes.HANDLE()
    ok = kernel32.DuplicateHandle(
        h_proc,
        wintypes.HANDLE(h),
        kernel32.GetCurrentProcess(),
        ctypes.byref(dup_handle),
        0,
        False,
        2 # DUPLICATE_SAME_ACCESS
    )
    if ok:
        name_buf = ctypes.create_unicode_buffer(512)
        res = kernel32.GetFinalPathNameByHandleW(dup_handle, name_buf, 512, 0)
        if res > 0:
            path = name_buf.value
            if "Cookies" in path and not path.endswith("journal"):
                print("Found Cookies file handle! Path:", path)
                # Read all bytes
                fsize = wintypes.LARGE_INTEGER()
                kernel32.GetFileSizeEx(dup_handle, ctypes.byref(fsize))
                sz = fsize.value
                print("File size:", sz)
                
                # Seek to beginning
                zero = wintypes.LARGE_INTEGER(0)
                kernel32.SetFilePointerEx(dup_handle, zero, None, 0)
                
                data = ctypes.create_string_buffer(sz)
                bytes_read = wintypes.DWORD()
                kernel32.ReadFile(dup_handle, data, sz, ctypes.byref(bytes_read), None)
                print(f"Read {bytes_read.value} bytes!")
                
                with open(temp_db, "wb") as f_out:
                    f_out.write(data.raw[:bytes_read.value])
                
                found = True
                kernel32.CloseHandle(dup_handle)
                break
        kernel32.CloseHandle(dup_handle)

kernel32.CloseHandle(h_proc)
print("Finished search. Found:", found)
