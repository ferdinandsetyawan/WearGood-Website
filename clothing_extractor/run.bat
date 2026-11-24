@echo off
echo ===================================================
echo Memulai WearGoods AI Clothing Extractor (FastAPI)...
echo ===================================================

if not exist "venv" (
    echo Membuat virtual environment venv...
    python -m venv venv
)

call venv\Scripts\activate.bat
echo Memeriksa dan menginstal dependencies...
pip install -r requirements.txt

echo.
echo Menjalankan server pada http://localhost:8000
python app.py
pause
