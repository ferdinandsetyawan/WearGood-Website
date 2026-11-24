from fastapi import FastAPI, UploadFile, File, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from PIL import Image, ImageFilter
from rembg import remove
import numpy as np
import uvicorn
import io
import os

app = FastAPI(
    title="WearGoods Clothing Extractor & Background Removal API",
    description="Microservice AI untuk segmentasi pakaian (SegFormer) dan penghapus latar belakang (rembg)",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_clothing_model = None
_clothing_processor = None


def load_clothing_model():
    global _clothing_model, _clothing_processor
    if _clothing_model is None:
        from transformers import SegformerForSemanticSegmentation, SegformerImageProcessor

        model_name = "mattmdjaga/segformer_b2_clothes"
        print(f"[WearGoods Extractor] Loading SegFormer clothing model: {model_name}...")
        _clothing_processor = SegformerImageProcessor.from_pretrained(model_name)
        _clothing_model = SegformerForSemanticSegmentation.from_pretrained(model_name)
        _clothing_model.eval()
        print("[WearGoods Extractor] Model loaded successfully.")
    return _clothing_processor, _clothing_model


def get_clothing_mask(image: Image.Image) -> Image.Image:
    import torch

    processor, model = load_clothing_model()
    inputs = processor(images=image.convert("RGB"), return_tensors="pt")

    with torch.no_grad():
        logits = model(**inputs).logits

    logits = torch.nn.functional.interpolate(
        logits,
        size=(image.height, image.width),
        mode="bilinear",
        align_corners=False,
    )
    mask = logits.argmax(dim=1)[0].cpu().numpy()

    labels = model.config.id2label
    kept_label_ids = set()
    for label_id, label in labels.items():
        name = str(label).lower()
        if any(keyword in name for keyword in (
            "upper-clothes", "upper clothes", "shirt", "jacket", "coat",
            "dress", "pants", "trousers", "skirt", "shorts", "shoe",
            "suit", "blazer",
        )):
            kept_label_ids.add(int(label_id))

    cloth_mask = np.isin(mask, list(kept_label_ids)).astype(np.uint8) * 255
    return Image.fromarray(cloth_mask, mode="L")


def clean_clothing_mask(mask: Image.Image) -> Image.Image:
    import scipy.ndimage as ndi

    mask_array = np.asarray(mask) > 127

    mask_array = ndi.binary_fill_holes(mask_array)
    mask_array = ndi.binary_opening(mask_array, structure=np.ones((5, 5)), iterations=2)
    mask_array = ndi.binary_closing(mask_array, structure=np.ones((9, 9)), iterations=2)

    labeled, component_count = ndi.label(mask_array)
    if component_count:
        component_sizes = ndi.sum(mask_array, labeled, index=range(1, component_count + 1))
        keep_ids = set(np.flatnonzero(component_sizes >= max(component_sizes) * 0.12) + 1)
        mask_array = np.isin(labeled, list(keep_ids))

    cleaned = Image.fromarray((mask_array.astype(np.uint8) * 255), mode="L")
    cleaned = cleaned.filter(ImageFilter.MaxFilter(5))
    cleaned = cleaned.filter(ImageFilter.GaussianBlur(radius=1.1))
    return cleaned


def crop_transparent_image(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    bounds = alpha.getbbox()
    if bounds:
        return image.crop(bounds)
    return image


def remove_unused_alpha_pixels(image: Image.Image, mask: Image.Image) -> Image.Image:
    if image.mode != "RGBA":
        image = image.convert("RGBA")
    clean_mask = clean_clothing_mask(mask)
    image.putalpha(clean_mask)
    return crop_transparent_image(image)


@app.get("/")
def home():
    return {
        "service": "WearGoods AI Clothing Extractor",
        "status": "online",
        "message": "AI Wardrobe Backend Initialized",
        "endpoints": {
            "extract_clothing": "/extract-clothing/ (POST)",
            "remove_background": "/remove-background/ (POST)",
            "health": "/health (GET)"
        }
    }


@app.get("/health")
def health():
    return {"status": "ok", "service": "clothing-extractor"}


@app.post("/remove-background/")
async def remove_background(file: UploadFile = File(...)):
    try:
        image_bytes = await file.read()
        input_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        output_image = remove(input_image)

        image_byte_arr = io.BytesIO()
        output_image.save(image_byte_arr, format="PNG")
        return Response(content=image_byte_arr.getvalue(), media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal menghapus background: {str(e)}")


@app.post("/extract-clothing/")
async def extract_clothing(
    file: UploadFile = File(...),
    photo_type: str = Query("worn", description="worn or flatlay"),
):
    try:
        image_bytes = await file.read()
        input_image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        if photo_type.lower() == "flatlay":
            output_image = remove(input_image)
            output_image = crop_transparent_image(output_image)
        else:
            cloth_mask = get_clothing_mask(input_image)
            output_image = remove_unused_alpha_pixels(input_image, cloth_mask)

        image_byte_arr = io.BytesIO()
        output_image.save(image_byte_arr, format="PNG")
        return Response(content=image_byte_arr.getvalue(), media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mengekstrak pakaian: {str(e)}")


if __name__ == "__main__":
    port = int(os.environ.get("EXTRACTOR_PORT", 8000))
    host = os.environ.get("EXTRACTOR_HOST", "0.0.0.0")
    print(f"[WearGoods Extractor] Menjalankan server pada http://{host}:{port}")
    uvicorn.run(app, host=host, port=port)
