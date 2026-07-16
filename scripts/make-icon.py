#!/usr/bin/env python3
"""Placeholder extension icon, Python stdlib only (no Pillow). A white shopping
cart on an Ametller-green squircle, anti-aliased via signed distance fields.
-> icon.png (512x512, RGBA). Swap for the real Ametller Origen logo later."""
import math
import struct
import zlib

S = 512
TOP, BOT = (106, 168, 79), (38, 84, 20)  # #6AA84F -> #265414 leaf-green gradient
WHITE = (255, 255, 255)


def clamp01(v):
    return 0.0 if v < 0 else 1.0 if v > 1 else v


def sd_segment(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    t = clamp01((wx * vx + wy * vy) / (vx * vx + vy * vy))
    dx, dy = wx - t * vx, wy - t * vy
    return math.hypot(dx, dy)


def sd_round_rect(px, py, cx, cy, hw, hh, r):
    qx, qy = abs(px - cx) - hw + r, abs(py - cy) - hh + r
    outside = math.hypot(max(qx, 0.0), max(qy, 0.0))
    return outside + min(max(qx, qy), 0.0) - r


def C(fx, fy):
    return (fx * S, fy * S)


HALF = 0.052 * S / 2          # main stroke half-width
RIB = HALF * 0.60             # rib half-width
WHEEL_R = 0.046 * S
Y_TOP, Y_BOT = 0.40, 0.62

STROKES = [
    (C(0.19, 0.29), C(0.30, 0.29)),
    (C(0.30, 0.29), C(0.34, Y_TOP)),
    (C(0.34, Y_TOP), C(0.75, Y_TOP)),
    (C(0.75, Y_TOP), C(0.68, Y_BOT)),
    (C(0.68, Y_BOT), C(0.40, Y_BOT)),
    (C(0.40, Y_BOT), C(0.34, Y_TOP)),
]
RIBS = [
    (C(0.45, 0.43), C(0.45, 0.60)),
    (C(0.54, 0.43), C(0.54, 0.60)),
    (C(0.63, 0.43), C(0.63, 0.60)),
]
WHEELS = [C(0.46, 0.70), C(0.64, 0.70)]

BX0, BX1 = int(0.14 * S), int(0.80 * S)
BY0, BY1 = int(0.24 * S), int(0.78 * S)

buf = bytearray(4 * S * S)
for y in range(S):
    grad = tuple(int(TOP[i] + (BOT[i] - TOP[i]) * (y / (S - 1))) for i in range(3))
    row = y * S * 4
    for x in range(S):
        sdf = sd_round_rect(x + 0.5, y + 0.5, S / 2, S / 2, S / 2, S / 2, 0.22 * S)
        bg = clamp01(0.5 - sdf)
        i = row + x * 4
        if bg <= 0:
            continue
        cart = 0.0
        if BX0 <= x <= BX1 and BY0 <= y <= BY1:
            px, py = x + 0.5, y + 0.5
            for (ax, ay), (bx, by) in STROKES:
                cart = max(cart, clamp01(0.5 - (sd_segment(px, py, ax, ay, bx, by) - HALF)))
            for (ax, ay), (bx, by) in RIBS:
                cart = max(cart, clamp01(0.5 - (sd_segment(px, py, ax, ay, bx, by) - RIB)))
            for cx, cy in WHEELS:
                cart = max(cart, clamp01(0.5 - (math.hypot(px - cx, py - cy) - WHEEL_R)))
            cart *= bg
        r = int(grad[0] + (WHITE[0] - grad[0]) * cart)
        g = int(grad[1] + (WHITE[1] - grad[1]) * cart)
        b = int(grad[2] + (WHITE[2] - grad[2]) * cart)
        buf[i:i + 4] = bytes((r, g, b, int(bg * 255)))


def chunk(typ, data):
    return struct.pack(">I", len(data)) + typ + data + struct.pack(">I", zlib.crc32(typ + data) & 0xffffffff)


raw = bytearray()
for y in range(S):
    raw.append(0)
    raw.extend(buf[y * S * 4:(y + 1) * S * 4])

png = (b"\x89PNG\r\n\x1a\n"
       + chunk(b"IHDR", struct.pack(">IIBBBBB", S, S, 8, 6, 0, 0, 0))
       + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
       + chunk(b"IEND", b""))
with open("icon.png", "wb") as f:
    f.write(png)
print(f"wrote icon.png {S}x{S}")
