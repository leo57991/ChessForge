"""Local/LAN launcher. Run a single worker so queued jobs remain consistent."""

import argparse, os, secrets, socket, sys
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--lan", action="store_true")
args = parser.parse_args()
root = Path(__file__).resolve().parent
sys.path.insert(0, str(root / "backend"))
if not (root / "frontend" / "dist" / "index.html").exists():
    raise SystemExit("請先執行安裝腳本，或在 frontend 執行 npm ci && npm run build。")
if args.lan:
    os.environ["CHESSFORGE_TOKEN"] = secrets.token_urlsafe(24)
    print(
        "\nLAN 存取碼（請在手機介面輸入）：" + os.environ["CHESSFORGE_TOKEN"],
        flush=True,
    )
    print("只限可信任私人區域網路。請勿設定路由器轉送連接埠。", flush=True)
    print("在手機開啟 http://<這台電腦的區域網路 IP>:8000", flush=True)
else:
    print("開啟 http://127.0.0.1:8000", flush=True)
import uvicorn

uvicorn.run(
    "main:app", host="0.0.0.0" if args.lan else "127.0.0.1", port=8000, workers=1
)
