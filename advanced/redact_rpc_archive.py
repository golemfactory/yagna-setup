"""Remove the configured RPC credential from diagnostics before uploading them."""
import io
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
from urllib.parse import urlsplit


def redact_archive(path, rpc_url):
    if not rpc_url:
        return
    secrets = {rpc_url.encode()}
    for endpoint in rpc_url.split(","):
        parsed = urlsplit(endpoint.strip())
        if parsed.hostname and parsed.hostname.endswith(".infura.io"):
            key = parsed.path.rsplit("/", 1)[-1]
            if key:
                secrets.add(key.encode())

    with tempfile.TemporaryDirectory() as directory:
        source = path
        if path.suffix == ".zst":
            source = Path(directory) / "source.tar"
            with source.open("wb") as output:
                subprocess.run(["zstd", "-dc", str(path)], stdout=output, check=True)
        cleaned = Path(directory) / "cleaned.tar"
        with tarfile.open(source, "r:*") as original, tarfile.open(cleaned, "w") as target:
            for member in original:
                if member.isfile():
                    with original.extractfile(member) as stream:
                        data = stream.read()
                    for secret in sorted(secrets, key=len, reverse=True):
                        # Preserve byte offsets if a credential appears in a database.
                        data = data.replace(secret, b"*" * len(secret))
                    target.addfile(member, io.BytesIO(data))
                else:
                    target.addfile(member)
        compressor = "zstd" if path.suffix == ".zst" else "xz"
        replacement = path.with_name(path.name + ".redacted")
        try:
            with replacement.open("wb") as output:
                subprocess.run([compressor, "-c", str(cleaned)], stdout=output, check=True)
            replacement.replace(path)
        finally:
            replacement.unlink(missing_ok=True)


if __name__ == "__main__":
    redact_archive(Path(sys.argv[1]), os.environ.get("HOODI_GETH_ADDR", ""))
