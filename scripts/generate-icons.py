from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
FONT = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"


def create_icon(size: int, filename: str) -> None:
    image = Image.new("RGB", (size, size), "#1f1e1b")
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(FONT, round(size * 0.55))
    bounds = draw.textbbox((0, 0), "D", font=font)
    width = bounds[2] - bounds[0]
    height = bounds[3] - bounds[1]
    position = (
        (size - width) / 2 - bounds[0],
        (size - height) / 2 - bounds[1] - size * 0.015,
    )
    draw.text(position, "D", font=font, fill="#f7f4ee")
    image.save(ROOT / "public" / filename, "PNG", optimize=True)


for icon_size, icon_name in (
    (192, "icon-192.png"),
    (512, "icon-512.png"),
    (180, "apple-touch-icon.png"),
):
    create_icon(icon_size, icon_name)
