#!/bin/bash

set -euo pipefail

dir=$(dirname $0)

out="$dir/workloads.js"

echo "var workloads = {" > $out

for file in $dir/*.yaml; do
  name=$(basename $file)
  name=${name%".yaml"}
  echo -n "  $name: \`" >> $out
  cat $file >> $out
  echo "\`," >> $out
done

echo "};" >> $out
echo "Generated $out"
