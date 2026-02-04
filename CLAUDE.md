# skiframes-web

Public web gallery for ski race videos and photo montages at skiframes.com.

## Project Overview

A static web application hosted on AWS (S3 + CloudFront) that displays:
- **Race Day Videos**: Multi-camera stitched videos per athlete
- **Comparison Videos**: Side-by-side with ghost overlay vs fastest racer
- **Photo Montages**: Stop-motion composite images from training/races

No login required for public browsing. Content organized hierarchically.

## Content Organization

```
S3 Bucket Structure:
skiframes-media/
├── events/
│   └── {YYYY-MM-DD}_{event-name}/
│       ├── manifest.json           # Event metadata + all content index
│       ├── videos/
│       │   └── {team}/
│       │       └── {gender}/
│       │           └── {age-group}_{run}/
│       │               ├── {Name}_Bib{#}.mp4
│       │               ├── {Name}_Bib{#}_thumb.jpg
│       │               └── {Name}_Bib{#}_vs_Bib{X}.mp4  (comparison)
│       └── montages/
│           └── {session-id}/
│               ├── run_{###}_thumb.jpg
│               └── run_{###}_full.jpg
└── index.json                      # Master index of all events
```

## Manifest Format

```json
{
  "event_id": "2026-02-04_western-divisional-u12-sl",
  "event_name": "Western Divisional U12 Ranking - SL",
  "event_date": "2026-02-04",
  "event_type": "race",
  "location": "Ragged Mountain, NH",
  "teams": ["RMST", "CBMST", "GSC", "MWV", "SUN"],
  "categories": ["U12", "U14"],
  "content": {
    "videos": [
      {
        "id": "v001",
        "athlete": "Molly McClay",
        "bib": 1,
        "team": "RMST",
        "gender": "Women",
        "category": "U12",
        "run": 1,
        "duration": 43.27,
        "video_url": "videos/RMST/Women/U12_Run1/MollyMcClay_Bib1.mp4",
        "thumb_url": "videos/RMST/Women/U12_Run1/MollyMcClay_Bib1_thumb.jpg",
        "comparison_url": "videos/RMST/Women/U12_Run1/MollyMcClay_Bib1_vs_Bib3.mp4",
        "fastest_bib": 3
      }
    ],
    "montages": [
      {
        "id": "m001",
        "session_type": "training",
        "timestamp": "2026-02-04T09:15:23-05:00",
        "thumb_url": "montages/session_001/run_001_thumb.jpg",
        "full_url": "montages/session_001/run_001_full.jpg"
      }
    ]
  }
}
```

## Tech Stack

- **Frontend**: Vanilla JS + HTML/CSS (lightweight, fast loading)
- **Hosting**: AWS S3 static website + CloudFront CDN
- **Media**: S3 bucket with CloudFront distribution
- **No Backend**: All data in JSON manifests, client-side filtering

## Features

### Browse
- Landing page: Recent events, quick links to Race Days / Training Days
- Event list: Filter by date range, event type (race/training)
- Event detail: Browse by Team → Category → Gender → Run
- Grid/list view toggle

### Search & Filter
- Search by athlete name
- Filter by bib number
- Filter by team
- Filter by date range
- Filter by category (U12/U14)
- Filter by gender

### Download
- Individual file download (video or montage)
- Bulk download by team (generates zip)
- Bulk download by event
- Download queue with progress

### Video Player
- Inline video playback
- Fullscreen mode
- Playback speed control (0.25x - 2x)
- Frame-by-frame stepping

## File Structure

```
skiframes-web/
├── CLAUDE.md
├── README.md
├── index.html              # Landing page
├── event.html              # Single event view
├── css/
│   └── style.css           # All styles
├── js/
│   ├── app.js              # Main application logic
│   ├── api.js              # S3/manifest fetching
│   ├── filters.js          # Search and filter logic
│   ├── download.js         # Download queue management
│   └── player.js           # Video player controls
├── assets/
│   ├── logo.svg
│   └── icons/
├── infrastructure/
│   ├── cloudformation.yaml # AWS infrastructure as code
│   ├── deploy.sh           # Deployment script
│   └── sync-media.sh       # Media upload script
└── package.json            # For build tools if needed
```

## AWS Infrastructure

### S3 Buckets
1. `skiframes-web` - Static website files (HTML/CSS/JS)
2. `skiframes-media` - Videos, images, manifests

### CloudFront Distributions
1. `skiframes.com` - Website distribution (S3 origin)
2. `media.skiframes.com` - Media CDN (S3 origin, optimized for video)

### Route 53
- `skiframes.com` → CloudFront website
- `media.skiframes.com` → CloudFront media CDN

## Development

```bash
# Local development (requires Python for simple server)
python -m http.server 8000

# Deploy website
./infrastructure/deploy.sh

# Sync media from edge device
./infrastructure/sync-media.sh /path/to/output
```

## Integration with photo-montages

The edge device (photo-montages repo) uploads content:
1. After video stitching: uploads to `skiframes-media/events/{date}_{name}/videos/`
2. After montage generation: uploads to `skiframes-media/events/{date}_{name}/montages/`
3. Updates `manifest.json` with new content entries
4. Updates root `index.json` if new event

Upload script in photo-montages handles manifest updates atomically.
