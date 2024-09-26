import argparse
import os
import random
import string
from pathlib import Path

# current script directory
CURRENT_DIR = os.path.abspath(os.path.dirname(os.path.realpath(__file__)))
PROJECT_ROOT_PATH = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
TARGET_DIR = os.path.join(PROJECT_ROOT_PATH, "golem")

YAGNA_API_ALLOW_ORIGIN = "*"
YA_NET_TYPE = "central"
YA_NET_RELAY_HOST = ""
CENTRAL_NET_HOST = ""

SUBNET = ""

REQUESTOR_APP_KEY = "66iiOdkvV29"
PROVIDER_APP_KEY = "provider111"

YA_PAYMENT_NETWORK = "holesky"

REQUESTOR_YAGNA_DATADIR = "yagnadir"
PROVIDER_YAGNDA_DATADIR = "yagnadir"
PROVIDER_PROVIDER_DATADIR = "providerdir"


def gen_connection_env():
    s = "# autogenerated by prepare_runtime.py\n\n"

    s += f"YAGNA_API_ALLOW_ORIGIN={YAGNA_API_ALLOW_ORIGIN}\n\n"

    s += f"# NET settings\n"
    s += f"YA_NET_TYPE={YA_NET_TYPE}\n"
    if YA_NET_TYPE == "central" and CENTRAL_NET_HOST:
        s += f"CENTRAL_NET_HOST={CENTRAL_NET_HOST}\n"

    if YA_NET_TYPE == "hybrid" and YA_NET_RELAY_HOST:
        s += f"YA_NET_RELAY_HOST={YA_NET_RELAY_HOST}\n"

    return s


def gen_provider_env(provider_no):
    s = "\n# Provider settings\n\n"

    s += f"# Subnet tag is read by ya-provider\n"
    s += f"SUBNET={SUBNET}\n\n"

    s += f"# Rest API key\n"
    s += f"YAGNA_AUTOCONF_APPKEY={PROVIDER_APP_KEY}\n"
    s += f"YAGNA_APPKEY={PROVIDER_APP_KEY}\n\n"

    s += f"# NET settings\n"
    if YA_NET_TYPE == "central":
        s += f"MEAN_CYCLIC_BCAST_INTERVAL=30s\n\n"

    s += f"# Payment settings\n"
    s += f"YA_PAYMENT_NETWORK={YA_PAYMENT_NETWORK}\n\n"

    s += f"YAGNA_DATADIR={PROVIDER_YAGNDA_DATADIR}\n"
    s += f"DATA_DIR={PROVIDER_PROVIDER_DATADIR}\n"

    port1 = 7540 + provider_no * 2
    port2 = 7541 + provider_no * 2
    s += f"GSB_URL=tcp://127.0.0.1:{port1}\n"
    s += f"YAGNA_API_URL=http://127.0.0.1:{port2}\n"

    s += f"NODE_NAME=my-provider-{provider_no}\n"
    # used when YA_NET_TYPE=hybrid
    if YA_NET_TYPE == "hybrid":
        port_udp = 11951 + provider_no
        s += f"YA_NET_BIND_URL=udp://0.0.0.0:{port_udp}"

    return s


def gen_requestor_env():
    s = "\n# Requestor settings\n\n"
    s += f"NODE_NAME=my-requestor\n"
    s += f"# Rest API key\n"
    # s += f"YAGNA_AUTOCONF_APPKEY={REQUESTOR_APP_KEY}\n"
    # s += f"YAGNA_APPKEY={REQUESTOR_APP_KEY}\n\n"

    s += f"YAGNA_DATADIR={REQUESTOR_YAGNA_DATADIR}\n"

    if YA_NET_TYPE == "hybrid":
        port_udp = 11950
        s += f"YA_NET_BIND_URL=udp://0.0.0.0:{port_udp}\n\n"

    # s += f"YAGNA_DEV_SKIP_ALLOCATION_VALIDATION=1\n\n"

    s += ""
    return s


def get_api_env():
    s = "# autogenerated by prepare_runtime.py\n\n"
    s += f"YAGNA_SUBNET={SUBNET}\n\n"
    return s


if __name__ == "__main__":
    # args
    # Initialize the argument parser
    parser = argparse.ArgumentParser(description="A program that can run in either central or hybrid mode.")

    # Add the mode argument
    parser.add_argument(
        '--mode',
        choices=['central', 'hybrid'],
        default='hybrid',
        help="The mode in which to run the program. Choices are 'central' or 'hybrid'. Default is 'central'."
    )

    # Add the mode argument
    parser.add_argument(
        '--payments',
        choices=['full', 'skip'],
        default='skip',
    )

    # Add the no-providers argument
    parser.add_argument(
        '--num-providers',
        type=int,
        default=1,
        help="The number of providers. Default is 1."
    )

    # Parse the arguments
    args = parser.parse_args()

    if args.mode == "central":
        YA_NET_TYPE = "central"
    elif args.mode == "hybrid":
        YA_NET_TYPE = "hybrid"
    else:
        raise ValueError("Invalid mode")

    # SUBNET = 'AUTO' + ''.join(random.choice(string.ascii_uppercase + string.digits) for _ in range(6))
    SUBNET = "public"

    print("Generating runtime for requestor: {}".format(f"{TARGET_DIR}/requestor"))
    Path(f"{TARGET_DIR}/requestor").mkdir(parents=True, exist_ok=True)
    with open(f"{TARGET_DIR}/requestor/.env", "w") as f:
        f.write(gen_connection_env())
        f.write(gen_requestor_env())

    for i in range(args.num_providers):
        print("Generating runtime for provider: {}".format(f"{TARGET_DIR}/provider_{i}"))
        Path(f"{TARGET_DIR}/provider_{i}").mkdir(parents=True, exist_ok=True)
        with open(f"{TARGET_DIR}/provider_{i}/.env", "w") as f:
            f.write(gen_connection_env())
            f.write(gen_provider_env(i))

    with open(os.path.join(PROJECT_ROOT_PATH, "examples", "jsexecutor", ".env"), "w") as f:
        f.write(get_api_env())

    with open(os.path.join(PROJECT_ROOT_PATH, "examples", "debitnotetest", ".env"), "w") as f:
        f.write(get_api_env())

    YAPAPI_PATH = os.path.join(PROJECT_ROOT_PATH, "examples", "golem", "yapapi")
    if os.path.exists(YAPAPI_PATH):
        with open(os.path.join(YAPAPI_PATH, ".env"), "w") as f:
            f.write(get_api_env())
