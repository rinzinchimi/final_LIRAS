#!/usr/bin/env bash
# Convenience startup script.
# Usage: ./run.sh
set -e

cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi

source .venv/bin/activate
pip install -q -r requirements.txt

echo "Starting LIRAS backend on http://localhost:8000 ..."
uvicorn main:app --reload --host 0.0.0.0 --port 8000
