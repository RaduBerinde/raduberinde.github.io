#!/bin/bash

if ! which inotifywait >/dev/null; then
  echo "Error: inotifywait required (install inotify-tools)."
  exit 1
fi

while true; do
  make
  inotifywait -e close_write,moved_to,create -q lib/ workloads/
done
