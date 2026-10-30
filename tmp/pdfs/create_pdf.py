from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

output = Path("output/pdf/enforceflow-ui-screens.pdf")
pages = [
    ("Login", Path("tmp/pdfs/screens/01-login.jpg")),
    ("Command centre dashboard", Path("tmp/pdfs/screens/02-dashboard.jpg")),
]
width, height = landscape(A4)
document = canvas.Canvas(str(output), pagesize=(width, height))

for page_number, (title, image_path) in enumerate(pages, start=1):
    document.setFillColor(HexColor("#102c3f"))
    document.rect(0, height - 42, width, 42, fill=1, stroke=0)
    document.setFillColor(HexColor("#ffffff"))
    document.setFont("Helvetica-Bold", 16)
    document.drawString(28, height - 27, f"EnforceFlow UI - {title}")
    document.setFillColor(HexColor("#5b707c"))
    document.setFont("Helvetica", 9)
    document.drawRightString(width - 28, 18, f"{page_number} / {len(pages)}")
    image = ImageReader(str(image_path))
    image_width, image_height = image.getSize()
    scale = min((width - 56) / image_width, (height - 82) / image_height)
    draw_width, draw_height = image_width * scale, image_height * scale
    document.drawImage(image, (width - draw_width) / 2, 35, draw_width, draw_height, mask="auto")
    document.showPage()

document.save()
