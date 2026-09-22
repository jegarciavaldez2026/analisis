import sys, os, shutil, math
from pathlib import Path
from datetime import datetime

server_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/root/analisis/analisis/server.py")
if not server_path.exists():
    server_path = Path(os.path.expanduser("~/analisis/analisis/server.py"))

print(f"Archivo: {server_path}")
original = server_path.read_text(encoding="utf-8")
content = original

backup = server_path.with_suffix(f".bak_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
shutil.copy2(server_path, backup)
print(f"Backup: {backup.name}")

PATCH1_S = "import numpy as np\nimport pandas as pd"
PATCH1_R = """import numpy as np\nimport pandas as pd\nimport math\n\ndef sanitize_float(value, default=0.0):\n    try:\n        if value is None: return default\n        f = float(value)\n        if math.isnan(f) or math.isinf(f): return default\n        return f\n    except: return default"""

PATCH2_S = "        return MarketIndicatorsResponse(\n            vix=MarketIndicator(\n                name=\"VIX - Índice de Volatilidad\","
PATCH2_R = """        def s(v, d=0.0): return sanitize_float(v, d)\n        vix_current=s(vix_current); vix_change=s(vix_change); vix_change_pct=s(vix_change_pct)\n        treasury_current=s(treasury_current); treasury_change=s(treasury_change); treasury_change_pct=s(treasury_change_pct)\n        sp500_current=s(sp500_current); sp500_change=s(sp500_change); sp500_change_pct=s(sp500_change_pct)\n        gold_current=s(gold_current); gold_change=s(gold_change); gold_change_pct=s(gold_change_pct)\n        oil_current=s(oil_current); oil_change=s(oil_change); oil_change_pct=s(oil_change_pct)\n        eurusd_current=s(eurusd_current); eurusd_change=s(eurusd_change); eurusd_change_pct=s(eurusd_change_pct)\n\n        return MarketIndicatorsResponse(\n            vix=MarketIndicator(\n                name="VIX - Índice de Volatilidad","""

patches = [(PATCH1_S, PATCH1_R, "sanitize_float"), (PATCH2_S, PATCH2_R, "sanitizar market-indicators")]

for search, replace, name in patches:
    if search in content:
        content = content.replace(search, replace, 1)
        print(f"OK: {name}")
    else:
        print(f"SKIP (ya aplicado?): {name}")

if content != original:
    server_path.write_text(content, encoding="utf-8")
    print("server.py actualizado!")
else:
    print("Sin cambios.")
