"""
Garden-to-Table Host -- Root entrypoint forwarding to backend.main:app
Allows running:
    uvicorn main:app --reload --port 8086
or
    python main.py
directly from the repository root.
"""
import sys
from pathlib import Path

# Add backend directory to sys.path so 'backend.main' and relative modules resolve cleanly
ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from backend.main import app, PORT

if __name__ == "__main__":
    import uvicorn
    print("\n==================================================")
    print("Garden-to-Table Host (FastAPI Python) Ready!")
    print(f"URL: http://localhost:{PORT}")
    print("==================================================\n")
    uvicorn.run("backend.main:app", host="0.0.0.0", port=PORT, reload=True)
