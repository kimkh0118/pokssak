"""Local HWP 5 extraction and optional scanned PDF OCR. No external upload."""
from __future__ import annotations
import io
import shutil
import sys
import os
import struct
import subprocess
import tempfile
import zlib
from pathlib import Path

MAX_TEXT_BYTES = 32 * 1024 * 1024


def hwp_text(raw: bytes) -> str:
    import olefile
    with olefile.OleFileIO(io.BytesIO(raw)) as ole:
        header = ole.openstream('FileHeader').read(256)
        flags = struct.unpack_from('<I', header, 36)[0]
        if flags & 2:
            raise ValueError('암호화 HWP는 수동 확인이 필요합니다.')
        if flags & 4:
            raise ValueError('배포용 HWP는 수동 확인이 필요합니다.')
        names = sorted((n for n in ole.listdir() if len(n) == 2 and n[0] == 'BodyText' and n[1].startswith('Section')),
                       key=lambda n: int(n[1][7:]))
        out, total = [], 0
        for name in names:
            data = ole.openstream(name).read(MAX_TEXT_BYTES + 1)
            if len(data) > MAX_TEXT_BYTES:
                raise ValueError('HWP 텍스트 크기 제한 초과')
            if flags & 1:
                data = zlib.decompressobj(-15).decompress(data, MAX_TEXT_BYTES + 1)
            total += len(data)
            if total > MAX_TEXT_BYTES:
                raise ValueError('HWP 텍스트 크기 제한 초과')
            pos = 0
            while pos + 4 <= len(data):
                record = struct.unpack_from('<I', data, pos)[0]
                pos += 4
                tag, size = record & 0x3ff, record >> 20
                if size == 0xfff:
                    size = struct.unpack_from('<I', data, pos)[0]
                    pos += 4
                payload = data[pos:pos + size]
                if len(payload) != size:
                    raise ValueError('손상된 HWP 레코드')
                pos += size
                if tag == 67:  # HWPTAG_PARA_TEXT: inline controls occupy 8 UTF-16 units.
                    units = list(struct.unpack('<' + 'H' * (len(payload) // 2), payload))
                    clean, i = [], 0
                    while i < len(units):
                        ch = units[i]
                        if ch in (1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23):
                            i += 8
                            continue
                        if ch in (9, 10, 13) or ch >= 32:
                            clean.append(ch)
                        i += 1
                    out.append(struct.pack('<' + 'H' * len(clean), *clean).decode('utf-16le', 'replace'))
        return '\n'.join(out)


def ocr_pdf(raw: bytes, max_pages: int) -> str:
    if sys.platform == 'darwin' and shutil.which('swift'):
        with tempfile.TemporaryDirectory(prefix='busan-ocr-') as tmp:
            source = Path(tmp) / 'source.pdf'
            source.write_bytes(raw)
            cache = Path(tempfile.gettempdir()) / 'busan-ocr-swift-cache'
            cache.mkdir(exist_ok=True)
            env = {**os.environ, 'CLANG_MODULE_CACHE_PATH': str(cache), 'SWIFT_MODULECACHE_PATH': str(cache)}
            r = subprocess.run(['swift', str(Path(__file__).with_name('pdf_ocr.swift')), str(source), str(max_pages)],
                               capture_output=True, text=True, timeout=180, env=env)
            if r.returncode:
                raise ValueError('Mac OCR 실패: ' + r.stderr[-500:])
            return r.stdout
    if not shutil.which('pdftoppm') or not shutil.which('tesseract'):
        raise ValueError('스캔 PDF OCR 도구 미설치: poppler(pdftoppm), tesseract 및 kor 언어팩 필요')
    languages = subprocess.run(['tesseract', '--list-langs'], capture_output=True, text=True, timeout=15, check=True).stdout.splitlines()
    if 'kor' not in languages:
        raise ValueError('스캔 PDF OCR 한국어 언어팩(kor) 미설치')
    from pypdf import PdfReader
    if len(PdfReader(io.BytesIO(raw)).pages) > max_pages:
        raise ValueError(f'OCR 페이지 제한({max_pages}) 초과: 수동 확인 필요')
    with tempfile.TemporaryDirectory(prefix='busan-ocr-') as tmp:
        source, prefix = Path(tmp) / 'source.pdf', Path(tmp) / 'page'
        source.write_bytes(raw)
        subprocess.run(['pdftoppm', '-r', '150', '-png', str(source), str(prefix)], capture_output=True, timeout=120, check=True)
        texts = []
        for image in sorted(Path(tmp).glob('page-*.png')):
            r = subprocess.run(['tesseract', str(image), 'stdout', '-l', 'kor+eng'], capture_output=True, text=True, timeout=45, check=True)
            texts.append(r.stdout)
        return '\n'.join(texts)
