from PIL import Image, ImageDraw
import os
from shutil import copyfile

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(root, 'images', 'tab')
os.makedirs(out, exist_ok=True)

assets = os.path.join(os.path.dirname(root), 'assets')
mp = os.path.join(root, 'images')
os.makedirs(mp, exist_ok=True)
copyfile(os.path.join(assets, 'avatar-1-leek-shield.png'), os.path.join(mp, 'mascot.png'))

SIZE = 81


def make_icon(name, draw_fn, active=False):
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    color = (46, 204, 113, 255) if active else (153, 153, 153, 255)
    draw_fn(d, color)
    suffix = 'active' if active else 'normal'
    path = os.path.join(out, f'{name}-{suffix}.png')
    img.save(path, 'PNG')
    print('wrote', path)


def home(d, c):
    d.polygon([(40, 14), (66, 36), (58, 36), (58, 66), (22, 66), (22, 36), (14, 36)], fill=c)
    d.rectangle([34, 46, 46, 66], fill=(245, 245, 247, 255))


def add(d, c):
    d.ellipse([10, 10, 70, 70], outline=c, width=5)
    d.rectangle([36, 24, 44, 56], fill=c)
    d.rectangle([24, 36, 56, 44], fill=c)


def list_icon(d, c):
    for y in (22, 40, 58):
        d.ellipse([16, y - 4, 24, y + 4], fill=c)
        d.rounded_rectangle([32, y - 3, 66, y + 3], radius=2, fill=c)


def profile(d, c):
    """简易人像：头 + 肩，作「我的」tab。"""
    d.ellipse([28, 14, 52, 38], fill=c)
    d.pieslice([16, 40, 64, 88], start=200, end=340, fill=c)


for active in (False, True):
    make_icon('home', home, active)
    make_icon('add', add, active)
    make_icon('list', list_icon, active)
    make_icon('profile', profile, active)

print('done')
