# ProctorIQ Session & Cookie Helper Extension (v1.2.0)

A lightweight Chrome / Edge extension that extracts active session cookies from **LeetCode** and **Taufa.ai** and synchronizes them directly into your ProctorIQ Desktop Application (`cookie.txt`).

---

## 🚀 How to Install in Chrome / Edge / Brave

1. Open your browser and navigate to:
   - **Chrome**: `chrome://extensions`
   - **Edge**: `edge://extensions`
   - **Brave**: `brave://extensions`
2. Enable **Developer mode** (toggle switch in top-right or sidebar).
3. Click **Load unpacked** (top-left button).
4. Select this directory:
   ```
   c:\Users\lokad\Music\quiz\cookie-extension
   ```
   *(or `dist\cookie-extension` in your release folder)*
5. The **ProctorIQ Session Helper** icon will appear in your browser extension toolbar! Pin it for quick access.

---

## ⚡ How to Use

1. **Log in to LeetCode**:
   - Open [https://leetcode.com](https://leetcode.com) and log in to your account.
2. **Log in to Taufa.ai** (optional, for AI chat / question generation):
   - Open [https://taufa.ai](https://taufa.ai) and log in.
3. **Open the ProctorIQ Extension**:
   - Click the extension icon. It will automatically detect your active `LEETCODE_SESSION` and Taufa cookies.
4. **Click Sync**:
   - Click **🌟 One-Click Sync Both (LeetCode + Taufa)** to sync both sessions together.
   - Or click **⚡ Sync to cookie.txt** under the LeetCode card to sync only LeetCode.
5. **Done!**:
   - Your `cookie.txt` is updated with structured sections:
     ```text
     # Taufa.ai Session Cookies
     __Host-authjs.csrf-token=...; __Secure-authjs.session-token=...

     # LeetCode Session Cookies
     LEETCODE_SESSION=...; csrftoken=...
     ```
   - ProctorIQ automatically recognizes your connected LeetCode account and enables full execution across up to 15 test cases!
