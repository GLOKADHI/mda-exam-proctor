import os
import json
import base64
import sqlite3
import shutil
import win32crypt
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

profile = r"C:\Users\lokad\AppData\Local\GoogleFormActiveNotifier\chromium-profile"
local_state_path = os.path.join(profile, "Local State")

with open(local_state_path, "r", encoding="utf-8") as f:
    local_state = json.load(f)

encrypted_key = base64.b64decode(local_state["os_crypt"]["encrypted_key"])[5:]
aes_key = win32crypt.CryptUnprotectData(encrypted_key, None, None, None, 0)[1]

cookie_src = os.path.join(profile, "Default", "Network", "Cookies")
temp_db = r"C:\Users\lokad\Music\quiz\temp_cookies.db"
shutil.copy2(cookie_src, temp_db)

conn = sqlite3.connect(temp_db)
cursor = conn.cursor()
cursor.execute("SELECT host_key, name, encrypted_value FROM cookies WHERE host_key LIKE '%taufa%'")
rows = cursor.fetchall()
print(f"Found {len(rows)} cookies for taufa")

cookie_dict = {}
for host_key, name, enc_val in rows:
    try:
        nonce = enc_val[3:15]
        ciphertext = enc_val[15:]
        aesgcm = AESGCM(aes_key)
        val = aesgcm.decrypt(nonce, ciphertext, None).decode("utf-8")
        cookie_dict[name] = val
        print(f"  [+] {name} = {val[:12]}... (len {len(val)})")
    except Exception as e:
        print(f"  [-] Failed for {name}: {e}")

conn.close()
if os.path.exists(temp_db):
    os.remove(temp_db)

cookie_str = "; ".join(f"{k}={v}" for k, v in cookie_dict.items())
with open(r"C:\Users\lokad\Music\quiz\cookie.txt", "w", encoding="utf-8") as f:
    f.write(cookie_str)

print(f"\nSuccessfully wrote {len(cookie_str)} bytes of cookies to cookie.txt!")
