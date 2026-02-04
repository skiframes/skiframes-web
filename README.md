# Skiframes Web

Public web gallery for ski race videos and photo montages at [skiframes.com](https://skiframes.com).

## Features

- **Browse Events**: Race days and training sessions organized by date
- **Search & Filter**: Find athletes by name, bib number, team, category
- **Video Player**: Playback speed control (0.25x-2x), frame-by-frame stepping
- **Photo Montages**: Stop-motion composite images with zoom viewer
- **Download**: Individual files or bulk download by team
- **Mobile Friendly**: Responsive design for phones/tablets

## Tech Stack

- Pure HTML/CSS/JavaScript (no framework dependencies)
- AWS S3 for static hosting
- AWS CloudFront CDN for fast global delivery
- No backend required - all data stored in JSON manifests

## Development

```bash
# Start local development server
python -m http.server 8000

# Open http://localhost:8000
```

## Deployment

### Prerequisites

1. AWS CLI configured with appropriate credentials
2. ACM certificate for skiframes.com (in us-east-1)
3. Route 53 hosted zone for skiframes.com

### Deploy Infrastructure

```bash
# Deploy CloudFormation stack
aws cloudformation deploy \
  --template-file infrastructure/cloudformation.yaml \
  --stack-name skiframes-web \
  --parameter-overrides \
    CertificateArn=arn:aws:acm:us-east-1:xxx:certificate/xxx

# Note the outputs for bucket names and distribution IDs
```

### Deploy Website

```bash
# Update DISTRIBUTION_ID in deploy.sh with the output from CloudFormation
./infrastructure/deploy.sh
```

### Upload Media

```bash
# From photo-montages output directory
./infrastructure/sync-media.sh /path/to/output/stitch_2026-02-04_u12_run_1
```

## S3 Structure

```
skiframes.com-media/
├── index.json                    # Master index of all events
└── events/
    └── 2026-02-04_u12-sl/
        ├── manifest.json         # Event metadata
        └── videos/
            └── RMST/
                └── Women/
                    └── U12_Run1/
                        ├── MollyMcClay_Bib1.mp4
                        └── MollyMcClay_Bib1_thumb.jpg
```

## Integration

The [photo-montages](https://github.com/skiframes/photo-montages) edge software uploads content after processing:

1. Stitched videos → `events/{event_id}/videos/`
2. Photo montages → `events/{event_id}/montages/`
3. Updates manifest.json with new content

## License

MIT
