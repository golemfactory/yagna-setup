"""Override Hoodi RPCs in an erc20_processor config (v0.5.1 ignores its env override)."""
import json
import re
import sys
from pathlib import Path

from prepare_runtime import hoodi_rpc_url


if __name__ == "__main__":
    rpc_url = hoodi_rpc_url()
    if not rpc_url:
        raise SystemExit("HOODI_GETH_ADDR must be configured")
    config = Path(sys.argv[1])
    text = config.read_text()
    if "[chain.hoodi]" not in text:
        raise SystemExit("The payment config has no Hoodi chain")
    text = re.sub(
        r"(?ms)^\[\[chain\.hoodi\.rpc-endpoints\]\]\n.*?(?=^\[|\Z)",
        "",
        text,
    )
    text += '\n[[chain.hoodi.rpc-endpoints]]\n'
    text += 'names = "Infura Hoodi"\n'
    text += f'endpoints = {json.dumps(rpc_url)}\n'
    config.write_text(text)
    config.chmod(0o600)
