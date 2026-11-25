"""Encode PNG frames into a pixel-crisp GIF (nearest-neighbour upscale)."""
import sys, glob, os
from PIL import Image

def main(src, out, scale=2, ms=33, crop=None):
    files = sorted(glob.glob(os.path.join(src, '*.png')))
    frames = []
    for f in files:
        im = Image.open(f).convert('RGB')
        if crop:
            im = im.crop(crop)
        im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
        frames.append(im)
    # one shared palette keeps colours stable between frames (no flicker)
    pal = frames[len(frames) // 2].quantize(colors=255, method=Image.MEDIANCUT)
    q = [f.quantize(palette=pal, dither=Image.NONE) for f in frames]
    q[0].save(out, save_all=True, append_images=q[1:], duration=ms, loop=0, optimize=True, disposal=1)
    print(out, len(q), 'frames', os.path.getsize(out) // 1024, 'KB')

if __name__ == '__main__':
    src, out = sys.argv[1], sys.argv[2]
    scale = int(sys.argv[3]) if len(sys.argv) > 3 else 2
    ms = int(sys.argv[4]) if len(sys.argv) > 4 else 33
    crop = tuple(map(int, sys.argv[5].split(','))) if len(sys.argv) > 5 else None
    main(src, out, scale, ms, crop)
