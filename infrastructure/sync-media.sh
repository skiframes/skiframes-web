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

# Check for session_manifest.json (photo-montages format) and rename to manifest.json
SESSION_MANIFEST="$SOURCE_DIR/session_manifest.json"
MANIFEST_PATH="$SOURCE_DIR/manifest.json"

if [ -f "$SESSION_MANIFEST" ] && [ ! -f "$MANIFEST_PATH" ]; then
    echo -e "${YELLOW}Found session_manifest.json, copying to manifest.json...${NC}"
    cp "$SESSION_MANIFEST" "$MANIFEST_PATH"
fi

# Sync all files
aws s3 sync "$SOURCE_DIR" "s3://$BUCKET_NAME/events/$EVENT_ID/" \
    --exclude ".DS_Store" \
    --exclude "*.txt" \
    --exclude "*.log" \
    --exclude "session_manifest.json" \
    --region "$REGION"

# Upload manifest with proper content type
if [ -f "$MANIFEST_PATH" ]; then
    echo -e "${YELLOW}Uploading manifest.json...${NC}"
    aws s3 cp "$MANIFEST_PATH" "s3://$BUCKET_NAME/events/$EVENT_ID/manifest.json" \
        --content-type "application/json" \
        --cache-control "max-age=60" \
        --region "$REGION"
else
    echo -e "${RED}No manifest.json found! Create one or ensure session_manifest.json exists.${NC}"
    exit 1
fi

# Extract event info from manifest for index update
EVENT_NAME=$(python3 -c "
import json
try:
    with open('$MANIFEST_PATH') as f:
        m = json.load(f)
    race = m.get('race', {})
    name = ' - '.join(filter(None, [race.get('event'), race.get('age_group'), race.get('discipline'), race.get('run')]))
    print(name or m.get('event_name', '$EVENT_ID'))
except:
    print('$EVENT_ID')
" 2>/dev/null)

EVENT_DATE=$(python3 -c "
import json
try:
    with open('$MANIFEST_PATH') as f:
        m = json.load(f)
    print(m.get('race', {}).get('date') or m.get('event_date') or '$EVENT_ID'.split('_')[0])
except:
    print('$EVENT_ID'.split('_')[0])
" 2>/dev/null)

VIDEO_COUNT=$(python3 -c "
import json
try:
    with open('$MANIFEST_PATH') as f:
        m = json.load(f)
    videos = m.get('videos', m.get('content', {}).get('videos', []))
    # Count non-comparison videos
    print(len([v for v in videos if not v.get('is_comparison', False)]))
except:
    print(0)
" 2>/dev/null)

TEAMS=$(python3 -c "
import json
try:
    with open('$MANIFEST_PATH') as f:
        m = json.load(f)
    videos = m.get('videos', m.get('content', {}).get('videos', []))
    teams = list(set(v.get('team') for v in videos if v.get('team')))
    print(json.dumps(teams))
except:
    print('[]')
" 2>/dev/null)

# Update root index.json
echo -e "${YELLOW}Updating root index.json...${NC}"

INDEX_PATH="/tmp/skiframes_index.json"
aws s3 cp "s3://$BUCKET_NAME/index.json" "$INDEX_PATH" 2>/dev/null || echo '{"events":[],"last_updated":""}' > "$INDEX_PATH"

# Update index using Python
python3 << EOF
import json
from datetime import datetime

with open('$INDEX_PATH', 'r') as f:
    index = json.load(f)

event_id = '$EVENT_ID'
event_name = '$EVENT_NAME'
event_date = '$EVENT_DATE'
video_count = int('$VIDEO_COUNT' or 0)
teams = json.loads('$TEAMS')

# Convert old string format to object format if needed
if index['events'] and isinstance(index['events'][0], str):
    index['events'] = [{'event_id': e, 'event_name': e, 'event_date': e.split('_')[0]} for e in index['events']]

# Check if event already exists
existing = next((e for e in index['events'] if e.get('event_id') == event_id), None)

if existing:
    # Update existing event
    existing['event_name'] = event_name
    existing['event_date'] = event_date
    existing['video_count'] = video_count
    existing['teams'] = teams
    print(f"Updated {event_id} in index")
else:
    # Add new event
    index['events'].append({
        'event_id': event_id,
        'event_name': event_name,
        'event_date': event_date,
        'event_type': 'race',
        'location': 'Ragged Mountain, NH',
        'video_count': video_count,
        'teams': teams
    })
    print(f"Added {event_id} to index")

# Sort by date descending
index['events'].sort(key=lambda x: x.get('event_date', ''), reverse=True)
index['last_updated'] = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')

with open('$INDEX_PATH', 'w') as f:
    json.dump(index, f, indent=2)
EOF

# Upload updated index
aws s3 cp "$INDEX_PATH" "s3://$BUCKET_NAME/index.json" \
    --content-type "application/json" \
    --cache-control "max-age=60" \
    --region "$REGION"

echo -e "${GREEN}Sync complete!${NC}"
echo "Event: $EVENT_NAME"
echo "Videos: $VIDEO_COUNT"
echo "Media URL: https://media.skiframes.com/events/$EVENT_ID/"
echo "View at: https://skiframes.com/event.html?event=$EVENT_ID"
