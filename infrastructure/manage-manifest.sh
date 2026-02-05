#!/bin/bash
# Manage manifests for skiframes media
# Usage:
#   ./manage-manifest.sh list                    - List all events
#   ./manage-manifest.sh view <event_id>         - View a manifest
#   ./manage-manifest.sh edit <event_id>         - Download, edit, and upload manifest
#   ./manage-manifest.sh index                   - View root index.json

set -e

# Configuration
BUCKET_NAME="avillachlab-netm"
MEDIA_DISTRIBUTION_ID="E1NKIYZ9037N7Q"
REGION="us-east-1"
TMP_DIR="/tmp/skiframes-manifests"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Create temp directory
mkdir -p "$TMP_DIR"

# Get editor (prefer code, then nano, then vi)
get_editor() {
    if command -v code &> /dev/null; then
        echo "code --wait"
    elif command -v nano &> /dev/null; then
        echo "nano"
    else
        echo "vi"
    fi
}

# List all events
list_events() {
    echo -e "${CYAN}Events in S3:${NC}"
    aws s3 ls "s3://$BUCKET_NAME/events/" --region "$REGION" | awk '{print $2}' | sed 's/\/$//'
}

# View a manifest
view_manifest() {
    local event_id="$1"
    if [ -z "$event_id" ]; then
        echo -e "${RED}Usage: $0 view <event_id>${NC}"
        echo "Available events:"
        list_events
        exit 1
    fi

    echo -e "${CYAN}Manifest for $event_id:${NC}"
    aws s3 cp "s3://$BUCKET_NAME/events/$event_id/manifest.json" - --region "$REGION" 2>/dev/null | python3 -m json.tool

    if [ $? -ne 0 ]; then
        echo -e "${RED}Manifest not found for event: $event_id${NC}"
        exit 1
    fi
}

# Edit a manifest
edit_manifest() {
    local event_id="$1"
    if [ -z "$event_id" ]; then
        echo -e "${RED}Usage: $0 edit <event_id>${NC}"
        echo "Available events:"
        list_events
        exit 1
    fi

    local manifest_file="$TMP_DIR/${event_id}_manifest.json"

    # Download
    echo -e "${YELLOW}Downloading manifest...${NC}"
    aws s3 cp "s3://$BUCKET_NAME/events/$event_id/manifest.json" "$manifest_file" --region "$REGION"

    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to download manifest for: $event_id${NC}"
        exit 1
    fi

    # Format JSON for easier editing
    python3 -m json.tool "$manifest_file" > "${manifest_file}.tmp" && mv "${manifest_file}.tmp" "$manifest_file"

    # Get file hash before editing
    local hash_before=$(md5 -q "$manifest_file" 2>/dev/null || md5sum "$manifest_file" | awk '{print $1}')

    # Open in editor
    local editor=$(get_editor)
    echo -e "${YELLOW}Opening in editor ($editor)...${NC}"
    $editor "$manifest_file"

    # Get file hash after editing
    local hash_after=$(md5 -q "$manifest_file" 2>/dev/null || md5sum "$manifest_file" | awk '{print $1}')

    # Check if file was modified
    if [ "$hash_before" = "$hash_after" ]; then
        echo -e "${YELLOW}No changes made. Skipping upload.${NC}"
        exit 0
    fi

    # Validate JSON
    if ! python3 -m json.tool "$manifest_file" > /dev/null 2>&1; then
        echo -e "${RED}Invalid JSON! Please fix the syntax.${NC}"
        echo "File saved at: $manifest_file"
        exit 1
    fi

    # Confirm upload
    echo -e "${YELLOW}Changes detected. Upload to S3? (y/n)${NC}"
    read -r confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        echo "Upload cancelled. File saved at: $manifest_file"
        exit 0
    fi

    # Upload
    echo -e "${YELLOW}Uploading manifest...${NC}"
    aws s3 cp "$manifest_file" "s3://$BUCKET_NAME/events/$event_id/manifest.json" \
        --content-type "application/json" \
        --cache-control "max-age=60" \
        --region "$REGION"

    # Invalidate cache
    echo -e "${YELLOW}Invalidating CDN cache...${NC}"
    aws cloudfront create-invalidation \
        --distribution-id "$MEDIA_DISTRIBUTION_ID" \
        --paths "/events/$event_id/manifest.json" \
        --region "$REGION" > /dev/null

    echo -e "${GREEN}Manifest updated successfully!${NC}"

    # Cleanup
    rm -f "$manifest_file"
}

# View root index
view_index() {
    echo -e "${CYAN}Root index.json:${NC}"
    aws s3 cp "s3://$BUCKET_NAME/index.json" - --region "$REGION" 2>/dev/null | python3 -m json.tool

    if [ $? -ne 0 ]; then
        echo -e "${YELLOW}No index.json found. Creating empty one...${NC}"
        echo '{"events":[],"last_updated":""}' | python3 -m json.tool
    fi
}

# Edit root index
edit_index() {
    local index_file="$TMP_DIR/index.json"

    # Download
    echo -e "${YELLOW}Downloading index.json...${NC}"
    aws s3 cp "s3://$BUCKET_NAME/index.json" "$index_file" --region "$REGION" 2>/dev/null || echo '{"events":[],"last_updated":""}' > "$index_file"

    # Format JSON
    python3 -m json.tool "$index_file" > "${index_file}.tmp" && mv "${index_file}.tmp" "$index_file"

    # Get file hash before editing
    local hash_before=$(md5 -q "$index_file" 2>/dev/null || md5sum "$index_file" | awk '{print $1}')

    # Open in editor
    local editor=$(get_editor)
    echo -e "${YELLOW}Opening in editor ($editor)...${NC}"
    $editor "$index_file"

    # Get file hash after editing
    local hash_after=$(md5 -q "$index_file" 2>/dev/null || md5sum "$index_file" | awk '{print $1}')

    # Check if file was modified
    if [ "$hash_before" = "$hash_after" ]; then
        echo -e "${YELLOW}No changes made. Skipping upload.${NC}"
        exit 0
    fi

    # Validate JSON
    if ! python3 -m json.tool "$index_file" > /dev/null 2>&1; then
        echo -e "${RED}Invalid JSON! Please fix the syntax.${NC}"
        echo "File saved at: $index_file"
        exit 1
    fi

    # Confirm upload
    echo -e "${YELLOW}Changes detected. Upload to S3? (y/n)${NC}"
    read -r confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        echo "Upload cancelled. File saved at: $index_file"
        exit 0
    fi

    # Upload
    echo -e "${YELLOW}Uploading index.json...${NC}"
    aws s3 cp "$index_file" "s3://$BUCKET_NAME/index.json" \
        --content-type "application/json" \
        --cache-control "max-age=60" \
        --region "$REGION"

    # Invalidate cache
    echo -e "${YELLOW}Invalidating CDN cache...${NC}"
    aws cloudfront create-invalidation \
        --distribution-id "$MEDIA_DISTRIBUTION_ID" \
        --paths "/index.json" \
        --region "$REGION" > /dev/null

    echo -e "${GREEN}Index updated successfully!${NC}"

    # Cleanup
    rm -f "$index_file"
}

# Main
case "$1" in
    list)
        list_events
        ;;
    view)
        view_manifest "$2"
        ;;
    edit)
        edit_manifest "$2"
        ;;
    index)
        view_index
        ;;
    edit-index)
        edit_index
        ;;
    *)
        echo "Skiframes Manifest Manager"
        echo ""
        echo "Usage:"
        echo "  $0 list                 List all events"
        echo "  $0 view <event_id>      View an event's manifest"
        echo "  $0 edit <event_id>      Edit an event's manifest"
        echo "  $0 index                View root index.json"
        echo "  $0 edit-index           Edit root index.json"
        echo ""
        echo "Examples:"
        echo "  $0 list"
        echo "  $0 view 2026-02-04_u12_run_1"
        echo "  $0 edit 2026-02-04_u12_run_1"
        ;;
esac
