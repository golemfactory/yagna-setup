#!/bin/bash
set -e
cd golem/ya-service-bus
cargo build --release --target x86_64-unknown-linux-musl -p ya-sb-router --features "bin"
cp target/x86_64-unknown-linux-musl/release/ya-sb-router ../binaries/
