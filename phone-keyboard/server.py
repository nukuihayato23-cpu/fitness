"""iPhone から Windows PC に文字を打ち込むための小さなサーバー。

使い方:  py server.py   (ポートを変える場合:  py server.py 8765)
外部ライブラリ不要（Python 3.8 以降の標準ライブラリだけで動きます）。
"""

import ctypes
import json
import secrets
import socket
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
TOKEN = secrets.token_urlsafe(8)
IS_WINDOWS = sys.platform == "win32"

# ---------------------------------------------------------------------------
# キー入力（Windows の SendInput を使用。日本語も Unicode で直接送れる）
# ---------------------------------------------------------------------------

VK = {
    "enter": 0x0D, "backspace": 0x08, "tab": 0x09, "escape": 0x1B,
    "left": 0x25, "up": 0x26, "right": 0x27, "down": 0x28,
    "delete": 0x2E, "home": 0x24, "end": 0x23, "space": 0x20,
}

if IS_WINDOWS:
    from ctypes import wintypes

    INPUT_KEYBOARD = 1
    KEYEVENTF_KEYUP = 0x0002
    KEYEVENTF_UNICODE = 0x0004
    ULONG_PTR = ctypes.c_size_t

    class KEYBDINPUT(ctypes.Structure):
        _fields_ = [("wVk", wintypes.WORD), ("wScan", wintypes.WORD),
                    ("dwFlags", wintypes.DWORD), ("time", wintypes.DWORD),
                    ("dwExtraInfo", ULONG_PTR)]

    class MOUSEINPUT(ctypes.Structure):
        _fields_ = [("dx", wintypes.LONG), ("dy", wintypes.LONG),
                    ("mouseData", wintypes.DWORD), ("dwFlags", wintypes.DWORD),
                    ("time", wintypes.DWORD), ("dwExtraInfo", ULONG_PTR)]

    class HARDWAREINPUT(ctypes.Structure):
        _fields_ = [("uMsg", wintypes.DWORD), ("wParamL", wintypes.WORD),
                    ("wParamH", wintypes.WORD)]

    class _INPUTUNION(ctypes.Union):
        _fields_ = [("ki", KEYBDINPUT), ("mi", MOUSEINPUT), ("hi", HARDWAREINPUT)]

    class INPUT(ctypes.Structure):
        _fields_ = [("type", wintypes.DWORD), ("u", _INPUTUNION)]

    _SendInput = ctypes.windll.user32.SendInput
    _SendInput.argtypes = (wintypes.UINT, ctypes.POINTER(INPUT), ctypes.c_int)

    def _key_input(vk=0, scan=0, flags=0):
        inp = INPUT(type=INPUT_KEYBOARD)
        inp.u.ki = KEYBDINPUT(wVk=vk, wScan=scan, dwFlags=flags)
        return inp

    def _send(inputs):
        arr = (INPUT * len(inputs))(*inputs)
        _SendInput(len(inputs), arr, ctypes.sizeof(INPUT))

    def press_key(name):
        vk = VK[name]
        _send([_key_input(vk=vk), _key_input(vk=vk, flags=KEYEVENTF_KEYUP)])

    def type_text(text):
        inputs = []
        for ch in text.replace("\r\n", "\n"):
            if ch == "\n":
                inputs += [_key_input(vk=VK["enter"]),
                           _key_input(vk=VK["enter"], flags=KEYEVENTF_KEYUP)]
                continue
            # 絵文字などは UTF-16 のサロゲートペアを順に送る
            data = ch.encode("utf-16-le")
            for i in range(0, len(data), 2):
                unit = int.from_bytes(data[i:i + 2], "little")
                inputs += [_key_input(scan=unit, flags=KEYEVENTF_UNICODE),
                           _key_input(scan=unit, flags=KEYEVENTF_UNICODE | KEYEVENTF_KEYUP)]
        if inputs:
            _send(inputs)
else:
    # Windows 以外では動作確認用に表示するだけ
    def press_key(name):
        print(f"[key] {name}")

    def type_text(text):
        print(f"[text] {text!r}")

# ---------------------------------------------------------------------------
# スマホ用ページ
# ---------------------------------------------------------------------------

PAGE = """<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>PCキーボード</title>
<style>
:root{--bg:#f4f5f7;--card:#fff;--fg:#1c1d21;--muted:#6b6f76;--accent:#2f6fed;--key:#e6e8ec}
@media (prefers-color-scheme:dark){:root{--bg:#121316;--card:#1d1f24;--fg:#eceef2;--muted:#9a9fa8;--accent:#5b8cff;--key:#2b2e35}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font-family:-apple-system,system-ui,sans-serif;
  padding:16px;padding-top:max(16px,env(safe-area-inset-top))}
h1{font-size:17px;margin:0 0 12px;display:flex;justify-content:space-between;align-items:center}
#status{font-size:13px;color:var(--muted);font-weight:400}
textarea{width:100%;height:30vh;font-size:17px;padding:12px;border-radius:12px;border:1px solid var(--key);
  background:var(--card);color:var(--fg);resize:vertical}
.row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
button{flex:1;min-width:64px;font-size:16px;padding:14px 8px;border:0;border-radius:10px;
  background:var(--key);color:var(--fg)}
button:active{opacity:.6}
.primary{background:var(--accent);color:#fff;font-weight:600}
label{display:flex;align-items:center;gap:8px;margin-top:12px;color:var(--muted);font-size:14px}
</style></head><body>
<h1>PCキーボード <span id="status">接続中…</span></h1>
<textarea id="t" placeholder="ここに入力して「送信」"></textarea>
<div class="row">
  <button class="primary" id="send">送信</button>
  <button data-key="enter">Enter</button>
</div>
<div class="row">
  <button data-key="backspace">⌫</button>
  <button data-key="tab">Tab</button>
  <button data-key="escape">Esc</button>
  <button data-key="delete">Del</button>
</div>
<div class="row">
  <button data-key="left">←</button>
  <button data-key="up">↑</button>
  <button data-key="down">↓</button>
  <button data-key="right">→</button>
</div>
<label><input type="checkbox" id="enter"> 送信後に Enter も押す</label>
<script>
const token = new URLSearchParams(location.search).get("t") || "";
const st = document.getElementById("status"), t = document.getElementById("t");
const enter = document.getElementById("enter");
try { enter.checked = localStorage.getItem("enter") === "1"; } catch (e) {}
enter.onchange = () => { try { localStorage.setItem("enter", enter.checked ? "1" : "0"); } catch (e) {} };
async function post(body) {
  try {
    const r = await fetch("/input", {method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({...body, token})});
    st.textContent = r.ok ? "接続OK" : (r.status === 403 ? "合言葉が違います" : "エラー " + r.status);
    return r.ok;
  } catch (e) { st.textContent = "PCに接続できません"; return false; }
}
document.getElementById("send").onclick = async () => {
  if (!t.value) return;
  if (await post({text: t.value})) {
    t.value = "";
    if (enter.checked) await post({key: "enter"});
  }
  t.focus();
};
document.querySelectorAll("[data-key]").forEach(b => b.onclick = () => post({key: b.dataset.key}));
post({ping: true});
</script></body></html>"""

# ---------------------------------------------------------------------------
# HTTP サーバー
# ---------------------------------------------------------------------------


class Handler(BaseHTTPRequestHandler):
    def _reply(self, code, body=b"", ctype="text/plain; charset=utf-8"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path != "/":
            return self._reply(404, b"not found")
        token = parse_qs(url.query).get("t", [""])[0]
        if not secrets.compare_digest(token, TOKEN):
            return self._reply(403, "PCの画面に表示されたURLを開いてください".encode())
        self._reply(200, PAGE.encode(), "text/html; charset=utf-8")

    def do_POST(self):
        if self.path != "/input":
            return self._reply(404, b"not found")
        try:
            length = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(min(length, 100_000)))
        except (ValueError, json.JSONDecodeError):
            return self._reply(400, b"bad request")
        if not secrets.compare_digest(str(data.get("token", "")), TOKEN):
            return self._reply(403, b"forbidden")
        if isinstance(data.get("text"), str):
            type_text(data["text"])
        elif data.get("key") in VK:
            press_key(data["key"])
        self._reply(200, b"ok")

    def log_message(self, fmt, *args):
        pass  # アクセスログは表示しない


def local_ips():
    ips = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except socket.gaierror:
        pass
    ips.discard("127.0.0.1")
    # iPhone のUSBテザリング (172.20.10.x) を先頭に
    return sorted(ips, key=lambda ip: (not ip.startswith("172.20.10."), ip))


def main():
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print("=" * 60)
    print(" iPhone の Safari で次のどれかを開いてください")
    print(" （USBテザリングなら 172.20.10.x のアドレス）")
    print("=" * 60)
    for ip in local_ips() or ["<PCのIPアドレス>"]:
        print(f"  http://{ip}:{PORT}/?t={TOKEN}")
    print("\n 文字を打ち込みたいアプリ（メモ帳など）をクリックして選択しておくこと")
    print(" 終了: Ctrl+C")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
