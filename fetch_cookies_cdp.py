import asyncio
import json
import urllib.request
import websockets

async def get_all_cookies():
    # 1. Read DevTools port
    port_file = r"C:\Users\lokad\AppData\Local\GoogleFormActiveNotifier\chromium-profile\DevToolsActivePort"
    with open(port_file, "r") as f:
        port = f.readline().strip()
    
    version_url = f"http://127.0.0.1:{port}/json/version"
    req = urllib.request.urlopen(version_url)
    data = json.loads(req.read().decode())
    ws_url = data["webSocketDebuggerUrl"]
    print(f"Connecting to CDP: {ws_url}")
    
    async with websockets.connect(ws_url) as ws:
        # Request cookies from Storage domain
        msg = {
            "id": 1,
            "method": "Storage.getCookies"
        }
        await ws.send(json.dumps(msg))
        
        resp = await ws.recv()
        result = json.loads(resp)
        cookies = result.get("result", {}).get("cookies", [])
        print(f"Total cookies found in browser: {len(cookies)}")
        
        taufa_cookies = {}
        for c in cookies:
            domain = c.get("domain", "")
            if "taufa" in domain:
                name = c.get("name")
                val = c.get("value")
                taufa_cookies[name] = val
                print(f"  Cookie: {name} = {val[:15]}... ({domain})")
                
        if not taufa_cookies:
            print("No taufa cookies found via Storage.getCookies. Checking all cookies for taufa tokens...")
            for c in cookies:
                print(f"  Domain: {c.get('domain')}, Name: {c.get('name')}")
        else:
            cookie_str = "; ".join(f"{k}={v}" for k, v in taufa_cookies.items())
            with open(r"C:\Users\lokad\Music\quiz\cookie.txt", "w", encoding="utf-8") as f:
                f.write(cookie_str)
            print(f"\nSuccessfully saved {len(taufa_cookies)} cookies to cookie.txt!")

if __name__ == "__main__":
    asyncio.run(get_all_cookies())
