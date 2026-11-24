# WearGoods AI Clothing Extractor Microservice

Layanan terpisah (microservice) berbasis **Python FastAPI**, **Transformers (SegFormer)**, dan **rembg** untuk segmentasi pakaian presisi tinggi dan penghapusan latar belakang pada foto pakaian.

## Fitur Utama

1. **`POST /extract-clothing/?photo_type=worn`**
   * Menggunakan model **SegFormer** (`mattmdjaga/segformer_b2_clothes`) fine-tuned khusus segmentasi semantik pakaian.
   * Mengisolasi pakaian (`upper-clothes`, `shirt`, `jacket`, `dress`, `pants`, `skirt`, `blazer`, dll.) dan memotong habis tubuh model (kepala, wajah, leher, lengan, kaki) serta latar belakang.
   * Membersihkan mask dengan *morphological opening/closing* dan *connected component filtering* (`scipy.ndimage`), lalu memangkas batas transparan (*auto-crop*).
2. **`POST /extract-clothing/?photo_type=flatlay`**
   * Menggunakan model **rembg (U2-Net)** untuk foto pakaian yang diletakkan di kasur, lantai, gantungan, atau meja (*flatlay*).
3. **`POST /remove-background/`**
   * Menghapus latar belakang umum gambar menggunakan `rembg`.

---

## Cara Menjalankan

### Cara Cepat (Windows)
Cukup jalankan file:
```cmd
clothing_extractor\run.bat
```

### Cara Manual
```bash
# 1. Masuk ke direktori
cd clothing_extractor

# 2. Buat virtual environment (disarankan)
python -m venv venv
venv\Scripts\activate      # Windows
# source venv/bin/activate # Linux/Mac

# 3. Instal dependencies
pip install -r requirements.txt

# 4. Jalankan server
python app.py
# atau
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

Server akan aktif di: `http://localhost:8000`  
Dokumentasi Swagger UI otomatis: `http://localhost:8000/docs`
