r"""Extract text from a peer review PDF using pypdf and save to workspace.

Usage:
    python extract_pdf.py <pdf_url_or_path>

Requirements:
    pypdf (bundled with Codex primary runtime or pip install pypdf)

Output:
    Saves extracted text to D:\everyday_recommand\pr_text.txt (temporary file)

Codex Automation:
    When run by Codex, use the bundled Python in the primary runtime:
    C:\Users\16198\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe
    This Python has pypdf pre-installed and is accessible from Node REPL child_process.
"""
import sys
import io
import os
import urllib.request

# Fix Windows console encoding for Unicode output
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

def main():
    if len(sys.argv) < 2:
        print("Usage: python extract_pdf.py <pdf_url_or_path>")
        sys.exit(1)

    source = sys.argv[1]

    # Try pypdf first, fallback to PyPDF2
    try:
        from pypdf import PdfReader
    except ImportError:
        try:
            from PyPDF2 import PdfReader
        except ImportError:
            print("ERROR: Neither pypdf nor PyPDF2 is installed.")
            print("Install: pip install pypdf")
            sys.exit(1)

    # Read PDF
    if source.startswith("http://") or source.startswith("https://"):
        print(f"Downloading: {source}")
        req = urllib.request.Request(source, headers={"User-Agent": "Mozilla/5.0"})
        data = urllib.request.urlopen(req).read()
    else:
        # Try source path, then temp directory as fallback
        if os.path.exists(source):
            path = source
        else:
            import tempfile
            alt = os.path.join(tempfile.gettempdir(), "pr_file.pdf")
            if os.path.exists(alt):
                path = alt
            else:
                print(f"ERROR: File not found: {source}")
                sys.exit(1)
        with open(path, "rb") as f:
            data = f.read()

    print(f"PDF size: {len(data)} bytes")
    reader = PdfReader(io.BytesIO(data))
    print(f"Pages: {len(reader.pages)}")

    all_text = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text()
        if text and text.strip():
            all_text.append(f"--- Page {i+1} ---\n{text}")

    output = "\n\n".join(all_text)
    out_path = r"D:\everyday_recommand\pr_text.txt"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(output)

    print(f"Extracted {len(all_text)} pages -> {out_path} ({len(output)} chars)")

if __name__ == "__main__":
    main()

