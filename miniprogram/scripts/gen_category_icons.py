"""生成绿色主题分类 PNG 图标（一次性脚本）。"""
from PIL import Image, ImageDraw
import os

out = os.path.join(os.path.dirname(__file__), "..", "images", "categories")
os.makedirs(out, exist_ok=True)
GREEN = (39, 174, 96, 255)  # #27ae60
LIGHT = (39, 174, 96, 70)
BG = (0, 0, 0, 0)
W = 128


def new():
    return Image.new("RGBA", (W, W), BG)


def save(img, name):
    img.save(os.path.join(out, name), "PNG")


im = new()
d = ImageDraw.Draw(im)
d.ellipse((24, 40, 104, 88), outline=GREEN, width=7)
d.arc((24, 56, 104, 110), 0, 180, fill=GREEN, width=7)
d.line((48, 36, 44, 22), fill=GREEN, width=5)
d.line((64, 34, 64, 18), fill=GREEN, width=5)
d.line((80, 36, 84, 22), fill=GREEN, width=5)
save(im, "food.png")

im = new()
d = ImageDraw.Draw(im)
d.rounded_rectangle((22, 28, 106, 88), radius=14, outline=GREEN, width=7)
d.line((22, 56, 106, 56), fill=GREEN, width=6)
d.rounded_rectangle((34, 36, 58, 50), radius=4, fill=LIGHT, outline=GREEN, width=3)
d.rounded_rectangle((70, 36, 94, 50), radius=4, fill=LIGHT, outline=GREEN, width=3)
d.ellipse((36, 90, 52, 106), fill=GREEN)
d.ellipse((76, 90, 92, 106), fill=GREEN)
save(im, "transport.png")

im = new()
d = ImageDraw.Draw(im)
d.line([(36, 48), (92, 48), (86, 108), (42, 108), (36, 48)], fill=GREEN, width=7)
d.arc((44, 28, 84, 68), 200, 340, fill=GREEN, width=7)
save(im, "shop.png")

im = new()
d = ImageDraw.Draw(im)
d.line([(20, 60), (64, 24), (108, 60)], fill=GREEN, width=7)
d.line([(36, 56), (36, 104), (92, 104), (92, 56)], fill=GREEN, width=7)
d.rounded_rectangle((56, 72, 72, 104), radius=3, fill=LIGHT, outline=GREEN, width=4)
save(im, "home.png")

im = new()
d = ImageDraw.Draw(im)
d.rounded_rectangle((18, 44, 110, 90), radius=22, outline=GREEN, width=7)
d.ellipse((36, 60, 50, 74), fill=GREEN)
d.ellipse((78, 60, 92, 74), fill=GREEN)
d.line((60, 56, 60, 78), fill=GREEN, width=5)
d.line((50, 67, 70, 67), fill=GREEN, width=5)
d.line((34, 44, 26, 28), fill=GREEN, width=5)
d.line((94, 44, 102, 28), fill=GREEN, width=5)
save(im, "fun.png")

im = new()
d = ImageDraw.Draw(im)
d.rounded_rectangle((24, 24, 104, 104), radius=18, outline=GREEN, width=7)
d.line((64, 40, 64, 88), fill=GREEN, width=10)
d.line((40, 64, 88, 64), fill=GREEN, width=10)
save(im, "medical.png")

im = new()
d = ImageDraw.Draw(im)
d.line([(16, 52), (64, 28), (112, 52), (64, 76), (16, 52)], fill=GREEN, width=6)
d.line([(32, 60), (32, 84)], fill=GREEN, width=6)
d.arc((32, 70, 96, 110), 200, 340, fill=GREEN, width=6)
d.line((112, 52, 112, 84), fill=GREEN, width=6)
save(im, "edu.png")

im = new()
d = ImageDraw.Draw(im)
d.rounded_rectangle((22, 56, 106, 108), radius=8, outline=GREEN, width=7)
d.rounded_rectangle((18, 40, 110, 58), radius=6, outline=GREEN, width=7)
d.line((64, 40, 64, 108), fill=GREEN, width=7)
d.arc((34, 22, 64, 52), 200, 20, fill=GREEN, width=6)
d.arc((64, 22, 94, 52), 160, 340, fill=GREEN, width=6)
save(im, "gift.png")

im = new()
d = ImageDraw.Draw(im)
d.line([(24, 72), (100, 48)], fill=GREEN, width=10)
d.line([(52, 62), (40, 28)], fill=GREEN, width=8)
d.line([(70, 56), (88, 90)], fill=GREEN, width=8)
d.line([(28, 74), (18, 90)], fill=GREEN, width=7)
d.ellipse((96, 42, 112, 58), fill=GREEN)
save(im, "travel.png")

im = new()
d = ImageDraw.Draw(im)
d.line((24, 100, 24, 28), fill=GREEN, width=7)
d.line((24, 100, 108, 100), fill=GREEN, width=7)
d.line([(36, 84), (56, 56), (72, 68), (96, 36)], fill=GREEN, width=7)
d.ellipse((90, 28, 106, 44), fill=GREEN)
save(im, "invest.png")

im = new()
d = ImageDraw.Draw(im)
d.line([(20, 44), (88, 44)], fill=GREEN, width=7)
d.polygon([(78, 30), (104, 44), (78, 58)], fill=GREEN)
d.line([(108, 84), (40, 84)], fill=GREEN, width=7)
d.polygon([(50, 70), (24, 84), (50, 98)], fill=GREEN)
save(im, "transfer.png")

im = new()
d = ImageDraw.Draw(im)
d.rounded_rectangle((28, 28, 100, 100), radius=12, outline=GREEN, width=7)
for x in (48, 64, 80):
    d.ellipse((x - 6, 58, x + 6, 70), fill=GREEN)
save(im, "other.png")

im = new()
d = ImageDraw.Draw(im)
d.rounded_rectangle((50, 18, 78, 70), radius=14, outline=GREEN, width=7)
d.arc((34, 48, 94, 100), 0, 180, fill=GREEN, width=7)
d.line((64, 94, 64, 112), fill=GREEN, width=7)
d.line((48, 112, 80, 112), fill=GREEN, width=7)
save(im, "mic.png")

print("ok", sorted(os.listdir(out)))
