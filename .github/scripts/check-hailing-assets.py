#!/usr/bin/env python3
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parents[2]
ASSETS = [
    ROOT / "mobile/assets/images/hailing/ride-economy.png",
    ROOT / "mobile/assets/images/hailing/ride-comfort.png",
    ROOT / "mobile/assets/images/hailing/ride-xl.png",
]
SIGNATURE = b"\x89PNG\r\n\x1a\n"


def validate(path: Path) -> None:
    data = path.read_bytes()
    if not data.startswith(SIGNATURE):
        raise SystemExit(f"{path}: invalid PNG signature")
    offset = len(SIGNATURE)
    idat = bytearray()
    width = height = bit_depth = color_type = interlace = None
    saw_iend = False
    while offset < len(data):
        if offset + 12 > len(data):
            raise SystemExit(f"{path}: truncated PNG chunk header")
        length = struct.unpack(">I", data[offset:offset+4])[0]
        chunk_type = data[offset+4:offset+8]
        start = offset + 8
        end = start + length
        if end + 4 > len(data):
            raise SystemExit(f"{path}: truncated {chunk_type!r} chunk")
        payload = data[start:end]
        expected_crc = struct.unpack(">I", data[end:end+4])[0]
        actual_crc = zlib.crc32(chunk_type)
        actual_crc = zlib.crc32(payload, actual_crc) & 0xFFFFFFFF
        if actual_crc != expected_crc:
            raise SystemExit(f"{path}: CRC mismatch in {chunk_type.decode('ascii', 'replace')}")
        if chunk_type == b"IHDR":
            width, height, bit_depth, color_type, _, _, interlace = struct.unpack(">IIBBBBB", payload)
        elif chunk_type == b"IDAT":
            idat.extend(payload)
        elif chunk_type == b"IEND":
            saw_iend = True
            offset = end + 4
            break
        offset = end + 4
    if not saw_iend or offset != len(data):
        raise SystemExit(f"{path}: invalid PNG termination")
    if (width, height) != (320, 180) or bit_depth != 8 or interlace != 0:
        raise SystemExit(f"{path}: expected 320x180, 8-bit, non-interlaced PNG")
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}.get(color_type)
    if channels is None:
        raise SystemExit(f"{path}: unsupported color type {color_type}")
    try:
        raw = zlib.decompress(bytes(idat))
    except zlib.error as exc:
        raise SystemExit(f"{path}: corrupt IDAT stream: {exc}") from exc
    expected = height * (1 + width * channels)
    if len(raw) != expected:
        raise SystemExit(f"{path}: unexpected decompressed size {len(raw)} != {expected}")
    row = 1 + width * channels
    for y in range(height):
        filter_type = raw[y * row]
        if filter_type > 4:
            raise SystemExit(f"{path}: invalid row filter {filter_type} at row {y}")
    print(f"OK {path.relative_to(ROOT)} {width}x{height} color_type={color_type}")


for asset in ASSETS:
    validate(asset)
