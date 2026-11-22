from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "data"
RAW = DATA / "raw"
REFERENCE = DATA / "reference"
DB_PATH = DATA / "allsvenskan.sqlite"
WEB_DATA = ROOT / "web" / "public" / "data"
