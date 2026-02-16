# Task: Add `elapsed_time` to montage manifest for skiframes.com fastest-skier comparison

## Context

skiframes-web now supports a "Show Fastest" toggle on the montage gallery. When enabled, each montage is shown side-by-side with the fastest skier's montage, and elapsed times are overlaid on the images. For this to work, the photo-montages edge device needs to compute and include `elapsed_time` in each run entry of `manifest.json`.

## What `elapsed_time` means

`elapsed_time` is the number of seconds between when the skier crosses the **start trigger zone** and when they cross the **end trigger zone**. This is the skier's run duration as measured by the montage system's trigger detection.

## Required manifest change

Add an `elapsed_time` field (float, seconds) to each run object in the manifest. The current format:

```json
{
  "runs": [
    {
      "run_number": 1,
      "timestamp": "2026-02-16T09:15:23-05:00",
      "variants": {
        "base": { "thumbnail": "...", "fullres": "...", "frame_count": 45 },
        "_2later": { "thumbnail": "...", "fullres": "...", "frame_count": 23 }
      }
    }
  ]
}
```

Should become:

```json
{
  "runs": [
    {
      "run_number": 1,
      "timestamp": "2026-02-16T09:15:23-05:00",
      "elapsed_time": 4.23,
      "variants": {
        "base": { "thumbnail": "...", "fullres": "...", "frame_count": 45 },
        "_2later": { "thumbnail": "...", "fullres": "...", "frame_count": 23 }
      }
    }
  ]
}
```

## Implementation steps

1. **Find where trigger zone crossings are detected** - Look for the code that detects when a skier enters the start trigger zone and when they exit the end trigger zone. These are the two timestamps needed.

2. **Compute elapsed time** - Calculate the difference in seconds between end trigger timestamp and start trigger timestamp:
   ```python
   elapsed_time = round(end_trigger_time - start_trigger_time, 2)
   ```

3. **Store it on the run object** - When building the run data structure (before writing to manifest), add the `elapsed_time` field.

4. **Write it to manifest.json** - When the manifest is written/updated (the code that serializes runs to `manifest.json` and uploads to S3), ensure `elapsed_time` is included in each run entry.

5. **Handle edge cases**:
   - If the end trigger is never crossed (skier falls/stops), set `elapsed_time` to `null`
   - If only one trigger zone is configured, set `elapsed_time` to `null`
   - Always use seconds as the unit, with 2 decimal places of precision

## How skiframes-web consumes this

The web frontend (`js/api.js` line 65) reads `elapsed_time` from each run during manifest normalization:

```javascript
elapsed_time: run.elapsed_time || null,
```

It then:
- Displays the time as an overlay on each montage thumbnail (e.g. "4.23s")
- Finds the fastest run (lowest `elapsed_time`) per speed variant
- Shows side-by-side comparisons when the user enables "Show Fastest"

## Testing

After implementing, verify by checking a generated `manifest.json` and confirming:
- Each run has `"elapsed_time": <number>` or `"elapsed_time": null`
- The value is in seconds (not milliseconds)
- The fastest run has the smallest `elapsed_time` value
