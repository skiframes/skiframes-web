#!/bin/bash
# Deploy website files to S3 and invalidate CloudFront cache

set -e

# Configuration
BUCKET_NAME="avillachlab-net"
DISTRIBUTION_ID="E3PZ6V0J6EMIMY"  # Website CloudFront distribution
REGION="us-east-1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Deploying Skiframes website...${NC}"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}AWS CLI not found. Please install it first.${NC}"
    exit 1
fi

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Project directory: $PROJECT_DIR"

# Sync website files to S3
echo -e "${YELLOW}Syncing files to S3...${NC}"
aws s3 sync "$PROJECT_DIR" "s3://$BUCKET_NAME" \
    --exclude ".git/*" \
    --exclude "infrastructure/*" \
    --exclude "CLAUDE.md" \
    --exclude "*.md" \
    --exclude ".DS_Store" \
    --delete \
    --cache-control "max-age=31536000" \
    --region "$REGION"

# Set shorter cache for HTML files (for faster updates)
echo -e "${YELLOW}Setting cache headers for HTML files...${NC}"
aws s3 cp "s3://$BUCKET_NAME" "s3://$BUCKET_NAME" \
    --exclude "*" \
    --include "*.html" \
    --metadata-directive REPLACE \
    --cache-control "max-age=300" \
    --content-type "text/html" \
    --recursive \
    --region "$REGION"

# Set cache for JSON files (manifests update frequently)
aws s3 cp "s3://$BUCKET_NAME" "s3://$BUCKET_NAME" \
    --exclude "*" \
    --include "*.json" \
    --metadata-directive REPLACE \
    --cache-control "max-age=60" \
    --content-type "application/json" \
    --recursive \
    --region "$REGION"

# Set cache for JS files (need to update when code changes)
aws s3 cp "s3://$BUCKET_NAME" "s3://$BUCKET_NAME" \
    --exclude "*" \
    --include "*.js" \
    --metadata-directive REPLACE \
    --cache-control "max-age=300" \
    --content-type "application/javascript" \
    --recursive \
    --region "$REGION"

# Invalidate CloudFront cache
if [ -n "$DISTRIBUTION_ID" ]; then
    echo -e "${YELLOW}Invalidating CloudFront cache...${NC}"
    aws cloudfront create-invalidation \
        --distribution-id "$DISTRIBUTION_ID" \
        --paths "/*" \
        --region "$REGION"
fi

echo -e "${GREEN}Deployment complete!${NC}"
echo "Website: https://skiframes.com"
