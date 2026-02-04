#!/bin/bash
# Sync media files from local output directory to S3
# Usage: ./sync-media.sh /path/to/output [event_id]

set -e

# Configuration
BUCKET_NAME="avillachlab-netm"
REGION="us-east-1"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Arguments
SOURCE_DIR="$1"
EVENT_ID="$2"

if [ -z "$SOURCE_DIR" ]; then
    echo -e "${RED}Usage: $0 <source_directory> [event_id]${NC}"
    echo "Example: $0 /path/to/output/stitch_2026-02-04_u12_run_1"
    exit 1
fi

if [ ! -d "$SOURCE_DIR" ]; then
    echo -e "${RED}Directory not found: $SOURCE_DIR${NC}"
    exit 1
fi

# Auto-detect event_id from directory name if not provided
if [ -z "$EVENT_ID" ]; then
    DIR_NAME=$(basename "$SOURCE_DIR")
    # Try to extract date and name from directory (e.g., stitch_2026-02-04_u12_run_1)
    if [[ $DIR_NAME =~ ^stitch_([0-9]{4}-[0-9]{2}-[0-9]{2})_(.+)$ ]]; then
        DATE="${BASH_REMATCH[1]}"
        NAME="${BASH_REMATCH[2]}"
        EVENT_ID="${DATE}_${NAME}"
    else
        echo -e "${RED}Could not auto-detect event_id. Please provide it as second argument.${NC}"
        exit 1
    fi
fi

echo -e "${YELLOW}Syncing media to S3...${NC}"
echo "Source: $SOURCE_DIR"
echo "Event ID: $EVENT_ID"
echo "Destination: s3://$BUCKET_NAME/events/$EVENT_ID/"

# Sync all files
aws s3 sync "$SOURCE_DIR" "s3://$BUCKET_NAME/events/$EVENT_ID/" \
    --exclude ".DS_Store" \
    --exclude "*.txt" \
    --region "$REGION"

# Generate manifest if it doesn't exist
MANIFEST_PATH="$SOURCE_DIR/manifest.json"
if [ ! -f "$MANIFEST_PATH" ]; then
    echo -e "${YELLOW}Generating manifest.json...${NC}"

    # Count files
    VIDEO_COUNT=$(find "$SOURCE_DIR" -name "*.mp4" | wc -l | tr -d ' ')
    MONTAGE_COUNT=$(find "$SOURCE_DIR" -name "*_full.jpg" | wc -l | tr -d ' ')

    # Extract date from event_id
    EVENT_DATE=$(echo "$EVENT_ID" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}')

    # Create basic manifest
    cat > "$MANIFEST_PATH" << EOF
{
  "event_id": "$EVENT_ID",
  "event_name": "$EVENT_ID",
  "event_date": "$EVENT_DATE",
  "event_type": "race",
  "location": "Ragged Mountain, NH",
  "teams": [],
  "categories": [],
  "content": {
    "videos": [],
    "montages": []
  },
  "video_count": $VIDEO_COUNT,
  "montage_count": $MONTAGE_COUNT,
  "generated": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF

    echo "Created basic manifest. Please update with full content details."
fi

# Upload manifest
aws s3 cp "$MANIFEST_PATH" "s3://$BUCKET_NAME/events/$EVENT_ID/manifest.json" \
    --content-type "application/json" \
    --cache-control "max-age=60" \
    --region "$REGION"

# Update root index.json
echo -e "${YELLOW}Updating root index.json...${NC}"

# Download current index or create new one
INDEX_PATH="/tmp/skiframes_index.json"
aws s3 cp "s3://$BUCKET_NAME/index.json" "$INDEX_PATH" 2>/dev/null || echo '{"events":[],"last_updated":""}' > "$INDEX_PATH"

# Add event to index if not present (simple check)
if ! grep -q "\"$EVENT_ID\"" "$INDEX_PATH"; then
    echo "Adding $EVENT_ID to index..."
    # This is a simple approach - for production, use jq or Python
    # For now, we'll just note that manual update may be needed
    echo -e "${YELLOW}Note: You may need to manually update index.json to add this event.${NC}"
fi

# Upload updated index
aws s3 cp "$INDEX_PATH" "s3://$BUCKET_NAME/index.json" \
    --content-type "application/json" \
    --cache-control "max-age=60" \
    --region "$REGION"

echo -e "${GREEN}Sync complete!${NC}"
echo "Media URL: https://media.skiframes.com/events/$EVENT_ID/"
