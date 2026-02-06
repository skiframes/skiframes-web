#!/bin/bash
# Deploy skiframes-web to AWS S3
# Usage: ./deploy.sh [dev|prod]

set -e

ENV="${1:-dev}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# S3 buckets
DEV_BUCKET="avillachlab-net-dev"
PROD_BUCKET="avillachlab-net"
PROD_DISTRIBUTION="E3PZ6V0J6EMIMY"

case "$ENV" in
  dev)
    echo "Deploying to DEV..."
    aws s3 sync "$SCRIPT_DIR" "s3://$DEV_BUCKET" \
      --exclude ".git/*" \
      --exclude "infrastructure/*" \
      --exclude "CLAUDE.md" \
      --exclude "README.md" \
      --exclude ".DS_Store" \
      --exclude ".claude/*" \
      --exclude "deploy.sh"
    echo ""
    echo "Done! View at:"
    echo "  http://$DEV_BUCKET.s3-website-us-east-1.amazonaws.com"
    ;;
  prod)
    echo "Deploying to PRODUCTION..."
    read -p "Are you sure? (y/N) " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
      echo "Cancelled."
      exit 0
    fi

    aws s3 sync "$SCRIPT_DIR" "s3://$PROD_BUCKET" \
      --exclude ".git/*" \
      --exclude "infrastructure/*" \
      --exclude "CLAUDE.md" \
      --exclude "README.md" \
      --exclude ".DS_Store" \
      --exclude ".claude/*" \
      --exclude "deploy.sh"

    echo ""
    echo "Invalidating CloudFront cache..."
    aws cloudfront create-invalidation --distribution-id "$PROD_DISTRIBUTION" --paths "/*" --output text

    echo ""
    echo "Done! View at:"
    echo "  https://skiframes.com"
    ;;
  *)
    echo "Usage: ./deploy.sh [dev|prod]"
    echo ""
    echo "  dev   - Deploy to dev environment (default)"
    echo "  prod  - Deploy to production (requires confirmation)"
    exit 1
    ;;
esac
