# Minimal Alpine-based Golem VM image for the transfer round-trip test.
# The point of this image is to declare the /golem/* volumes that the
# exe-unit `transfer` command resolves container paths against.
FROM alpine:3.20

# coreutils gives a full-featured cp/ls (busybox already has cp, but this
# keeps behaviour predictable across commands used in tests).
RUN apk add --no-cache coreutils

# Volumes the transfer test (and typical Golem tasks) read/write.
VOLUME /golem/work
VOLUME /golem/input
VOLUME /golem/output
VOLUME /golem/resource

WORKDIR /golem/work
