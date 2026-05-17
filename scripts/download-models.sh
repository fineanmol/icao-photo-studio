#!/usr/bin/env bash
# Downloads face-api.js model weights into public/models
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODEL_DIR="$ROOT/public/models"
BASE="https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights"
mkdir -p "$MODEL_DIR"

files=(
  tiny_face_detector_model-weights_manifest.json
  tiny_face_detector_model-shard1
  face_landmark_68_tiny_model-weights_manifest.json
  face_landmark_68_tiny_model-shard1
  face_expression_model-weights_manifest.json
  face_expression_model-shard1
)

for f in "${files[@]}"; do
  echo "Downloading $f"
  curl -fsSL "$BASE/$f" -o "$MODEL_DIR/$f"
done

echo "Models saved to $MODEL_DIR"
