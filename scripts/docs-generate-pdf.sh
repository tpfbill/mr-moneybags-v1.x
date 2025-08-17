#!/usr/bin/env bash
# Generate PDF from HTML using headless Chrome
# Usage: ./scripts/docs-generate-pdf.sh
# Note: If permission denied, run: chmod +x scripts/docs-generate-pdf.sh

# Exit on error, undefined variables, and pipe failures
set -euo pipefail

# Resolve repo root directory relative to script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Define paths
HTML="${ROOT_DIR}/docs/guides/AccuFund_Migration_Steps_v1.x_PDF_Ready.html"
PDF="${ROOT_DIR}/docs/guides/AccuFund_Migration_Steps_v1.x.pdf"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# Validate Chrome exists
if [ ! -x "$CHROME" ]; then
  echo "Error: Chrome not found at $CHROME"
  echo "Please install Google Chrome or update the CHROME path in this script."
  exit 1
fi

# Validate HTML exists
if [ ! -f "$HTML" ]; then
  echo "Error: HTML file not found at $HTML"
  exit 1
fi

echo "Generating PDF from HTML using headless Chrome..."
"$CHROME" --headless --disable-gpu --print-to-pdf="$PDF" "file://$HTML"

# Check if PDF was created successfully
if [ -f "$PDF" ]; then
  echo "✅ Success! PDF generated at:"
  echo "$PDF"
else
  echo "❌ Error: Failed to generate PDF."
  exit 1
fi

echo "📋 To commit the changes:"
echo "git add \"$PDF\""
echo "git commit -m \"docs: regenerate AccuFund migration PDF for macOS\""
