import os
import json
import base64
import sqlite3
import shutil
import win32crypt
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

profile = r"C:\Users\lokad\AppData\Local\Google\Chrome for Testing\User Data"
local_state_path = os.path.join(profile, "Local State")

with open(local_state_path, "r", encoding="utf-8") as f:
    local_state = json.load(f)

encrypted_key = base64.b64decode(local_state["os_crypt"]["encrypted_key"])[5:]
aes_key = win32crypt.CryptUnprotectData(encrypted_key, None, None, None, 0)[1]

cookie_src = os.path.join(profile, "Default", "Network", "Cookies")
temp_db = r"C:\Users\lokad\Music\quiz\temp_cookies2.db"

try:
    shutil.copy2(cookie_src, temp_db)
    print("Copied Cookies database successfully!")
except Exception as e:
    print(f"Direct copy failed ({e}), trying shadow/shared read...")
    import win32file, win32con
    # Try reading with win32file
    try:
        h = win32file.CreateFile(
            cookie_src,
            win32con.GENERIC_READ,
            win32con.FILE_SHARE_READ | win32con.FILE_SHARE_WRITE | win32con.FILE_SHARE_DELETE,
            None,
            win32con.OPEN_EXISTING,
            0,
            None
        )
        data = win32file.ReadFile(h, os.path.getsize(cookie_src))[1]
        win32file.CloseHandle(h)
        with open(temp_db, "wb") as f:
            f.write(data)
        print("Read and copied Cookies database via win32file!")
    except Exception as e2:
        print(f"win32file failed too: {e2}")

if os.path.exists(temp_db):
    conn = sqlite3.connect(temp_db)
    cursor = conn.cursor()
    cursor.execute("SELECT host_key, name, encrypted_value FROM cookies WHERE host_key LIKE '%taufa%'")
    rows = cursor.fetchall()
    print(f"Found {len(rows)} taufa cookies:")
    
    cookie_dict = {}
    for host_key, name, enc_val in rows:
        try:
            nonce = enc_val[3:15]
            ciphertext = enc_val[15:]
            aesgcm = AESGCM(aes_key)
            val = aesgcm.decrypt(nonce, ciphertext, None).decode("utf-8")
            cookie_dict[name] = val
            print(f"  [+] {name} ({len(val)} chars)")
        except Exception as err:
            print(f"  [-] Failed for {name}: {err}")
    
    conn.close()
    try:
        os.remove(temp_db)
    except:
        pass
    
    if cookie_dict:
        cookie_str = "; ".join(f"{k}={v}" for k, v in cookie_dict.items())
        with open(r"C:\Users\lokad\Music\quiz\cookie.txt", "w", encoding="utf-8") as f:
            f.write(cookie_str)
        print(f"\nSUCCESS! Wrote {len(cookie_dict)} cookies to cookie.txt")
    else:
        print("\nNo taufa cookies found in this database.")
