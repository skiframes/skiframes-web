/**
 * API module for fetching data from S3/CloudFront
 */

const API = {
    // Base URL for media content (CloudFront distribution)
    MEDIA_BASE: 'https://media.skiframes.com',

    // For local development, use relative paths or local server
    // MEDIA_BASE: '',

    /**
     * Fetch the master index of all events
     */
    async getEventsIndex() {
        try {
            const response = await fetch(`${this.MEDIA_BASE}/index.json`);
            if (!response.ok) throw new Error('Failed to fetch events index');
            return await response.json();
        } catch (error) {
            console.error('Error fetching events index:', error);
            // Return mock data for development
            return this.getMockEventsIndex();
        }
    },

    /**
     * Fetch a single event's manifest
     */
    async getEventManifest(eventId) {
        try {
            const response = await fetch(`${this.MEDIA_BASE}/events/${eventId}/manifest.json`);
            if (!response.ok) throw new Error('Failed to fetch event manifest');
            const rawManifest = await response.json();
            return this.normalizeManifest(rawManifest, eventId);
        } catch (error) {
            console.error('Error fetching event manifest:', error);
            // Return mock data for development
            return this.getMockEventManifest(eventId);
        }
    },

    /**
     * Normalize manifest from photo-montages format to skiframes-web format
     * Handles both old skiframes format and new photo-montages format
     */
    normalizeManifest(manifest, eventId) {
        // Check if already in skiframes format (has content.videos)
        if (manifest.content && manifest.content.videos) {
            return manifest;
        }

        // Check for edge montage format (has runs[] array from RTSP detection)
        if (manifest.runs && Array.isArray(manifest.runs)) {
            const montages = [];
            manifest.runs.forEach((run, idx) => {
                // Each run has variants (base, _2later, etc.)
                for (const [variantName, variant] of Object.entries(run.variants || {})) {
                    montages.push({
                        id: `m${String(idx * 10 + Object.keys(run.variants).indexOf(variantName) + 1).padStart(3, '0')}`,
                        run_number: run.run_number,
                        variant: variantName,
                        timestamp: run.timestamp,
                        thumb_url: variant.thumbnail,
                        full_url: variant.fullres,
                        frame_count: variant.frame_count
                    });
                }
            });

            const dateFromId = eventId.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];

            return {
                event_id: eventId,
                event_name: manifest.event_name || eventId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                event_date: manifest.event_date || dateFromId,
                event_type: manifest.event_type || 'training',
                discipline: manifest.discipline || 'freeski',
                location: 'Ragged Mountain, NH',
                teams: [],
                categories: manifest.group ? [manifest.group] : [],
                content: {
                    videos: [],
                    montages: montages
                }
            };
        }

        // Convert from photo-montages stitcher format
        const race = manifest.race || {};
        const videos = manifest.videos || [];

        // Extract unique teams from videos
        const teams = [...new Set(videos.map(v => v.team).filter(t => t))];

        // Build event name from race info
        const eventName = [race.event, race.age_group, race.discipline, race.run]
            .filter(x => x)
            .join(' - ') || eventId;

        // Build lookup from rankings for fallback data (when video name is just "BibXXX")
        const rankingsLookup = {};
        const rankings = manifest.rankings?.by_gender || {};
        for (const [gender, racers] of Object.entries(rankings)) {
            for (const racer of racers) {
                rankingsLookup[racer.bib] = {
                    name: racer.name,
                    team: racer.team,
                    gender: gender,
                    ussa_id: racer.ussa_id,
                    ussa_profile_url: racer.ussa_profile_url
                };
            }
        }

        // Find comparison videos and build lookup
        const comparisonLookup = {};
        videos.forEach(v => {
            if (v.is_comparison && v.comparison_bib) {
                const key = `${v.bib}_${v.gender}`;
                comparisonLookup[key] = v.path;
            }
        });

        // Convert videos to skiframes format
        const normalizedVideos = videos.map((v, idx) => {
            // Generate thumb URL from video path
            const thumbUrl = v.path.replace('.mp4', '_thumb.jpg');

            // Check if name is just "BibXXX" pattern (unmatched racer) - use rankings as fallback
            const needsFallback = /^Bib\d+$/.test(v.name);
            const fallback = rankingsLookup[v.bib] || {};

            // Get corrected values from rankings if needed
            const athleteName = needsFallback ? (fallback.name || v.name) : v.name;
            const athleteTeam = needsFallback ? (fallback.team || v.team || '') : (v.team || '');
            const athleteGender = needsFallback ? (fallback.gender || v.gender) : v.gender;
            const athleteUssaId = needsFallback ? (fallback.ussa_id || v.ussa_id) : v.ussa_id;
            const athleteUssaUrl = needsFallback ? (fallback.ussa_profile_url || v.ussa_profile_url) : v.ussa_profile_url;

            // Find comparison URL for non-comparison videos
            let comparisonUrl = null;
            if (!v.is_comparison) {
                const key = `${v.bib}_${athleteGender}`;
                comparisonUrl = comparisonLookup[key] || null;
            }

            // Clean USSA ID (strip leading letter)
            const cleanUssaId = athleteUssaId ? String(athleteUssaId).replace(/^[A-Za-z]/, '') : '';

            return {
                id: `v${String(idx + 1).padStart(3, '0')}`,
                athlete: athleteName,
                bib: v.bib,
                team: athleteTeam,
                gender: athleteGender,
                category: race.age_group || '',
                run: parseInt(race.run?.replace('Run ', '') || '1'),
                duration: v.duration,
                video_url: v.path,
                thumb_url: thumbUrl,
                comparison_url: comparisonUrl,
                is_comparison: v.is_comparison || false,
                comparison_bib: v.comparison_bib,
                rank: v.rank,
                ussa_id: cleanUssaId,
                ussa_profile_url: athleteUssaUrl ||
                    (cleanUssaId ? `https://www.usskiandsnowboard.org/public-tools/members/${cleanUssaId}` : null),
                status: v.status
            };
        });

        // Extract date from eventId if not in manifest (format: YYYY-MM-DD_name)
        const dateFromId = eventId.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];

        return {
            event_id: eventId,
            event_name: eventName,
            event_date: race.date || manifest.created_at?.split('T')[0] || dateFromId,
            event_type: 'race',
            location: manifest.course?.location || 'Ragged Mountain, NH',
            logo_url: manifest.logo_url || null,
            teams: teams,
            categories: race.age_group ? [race.age_group] : [],
            summary: manifest.summary,
            rankings: manifest.rankings,
            content: {
                videos: normalizedVideos,
                montages: []
            }
        };
    },

    /**
     * Get full URL for a media file
     */
    getMediaUrl(relativePath, eventId) {
        if (!relativePath) return '';
        if (relativePath.startsWith('http')) return relativePath;
        // Paths starting with 'logos/' are at root level, not within event folders
        if (relativePath.startsWith('logos/')) {
            return `${this.MEDIA_BASE}/${relativePath}`;
        }
        return `${this.MEDIA_BASE}/events/${eventId}/${relativePath}`;
    },

    /**
     * Fetch live banner configuration
     */
    async getLiveBannerConfig() {
        try {
            const response = await fetch(`${this.MEDIA_BASE}/config/live-banner.json?t=${Date.now()}`);
            if (!response.ok) throw new Error('Failed to fetch live banner config');
            return await response.json();
        } catch (error) {
            console.error('Error fetching live banner config:', error);
            // Return default disabled state
            return { enabled: false, title: '', subtitle: '', raceStartTime: null };
        }
    },

    /**
     * Get all teams across all events
     */
    async getAllTeams() {
        const index = await this.getEventsIndex();
        const teams = new Set();
        index.events.forEach(event => {
            if (event.teams) {
                event.teams.forEach(team => teams.add(team));
            }
        });
        return Array.from(teams).sort();
    },

    // ========================================
    // Mock Data for Development
    // ========================================

    getMockEventsIndex() {
        return {
            events: [
                {
                    event_id: '2026-02-04_western-divisional-u12-sl',
                    event_name: 'Western Divisional U12 Ranking - SL',
                    event_date: '2026-02-04',
                    event_type: 'race',
                    location: 'Ragged Mountain, NH',
                    teams: ['RMST', 'CBMST', 'GSC', 'MWV', 'SUN'],
                    categories: ['U12'],
                    video_count: 48,
                    montage_count: 0,
                    thumb_url: ''
                },
                {
                    event_id: '2026-02-03_u14-training',
                    event_name: 'U14 Morning Training',
                    event_date: '2026-02-03',
                    event_type: 'training',
                    location: 'Ragged Mountain, NH',
                    teams: ['RMST'],
                    categories: ['U14'],
                    video_count: 0,
                    montage_count: 24,
                    thumb_url: ''
                },
                {
                    event_id: '2026-01-28_western-divisional-u14-gs',
                    event_name: 'Western Divisional U14 Ranking - GS',
                    event_date: '2026-01-28',
                    event_type: 'race',
                    location: 'Ragged Mountain, NH',
                    teams: ['RMST', 'CBMST', 'GSC', 'MWV', 'BMA'],
                    categories: ['U14'],
                    video_count: 52,
                    montage_count: 0,
                    thumb_url: ''
                }
            ],
            last_updated: new Date().toISOString()
        };
    },

    getMockEventManifest(eventId) {
        // Generate mock videos
        const mockVideos = [];
        const teams = ['RMST', 'CBMST', 'GSC', 'MWV', 'SUN'];
        const genders = ['Men', 'Women'];
        const firstNames = {
            Women: ['Emma', 'Olivia', 'Ava', 'Sophia', 'Isabella', 'Mia', 'Charlotte', 'Amelia'],
            Men: ['Liam', 'Noah', 'Oliver', 'Elijah', 'James', 'William', 'Benjamin', 'Lucas']
        };
        const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];

        let bibNum = 1;
        genders.forEach(gender => {
            teams.forEach(team => {
                for (let i = 0; i < 3; i++) {
                    const firstName = firstNames[gender][Math.floor(Math.random() * firstNames[gender].length)];
                    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
                    const name = `${firstName} ${lastName}`;
                    const duration = 35 + Math.random() * 15;

                    mockVideos.push({
                        id: `v${String(bibNum).padStart(3, '0')}`,
                        athlete: name,
                        bib: bibNum,
                        team: team,
                        gender: gender,
                        category: 'U12',
                        run: 1,
                        duration: duration,
                        video_url: `videos/${team}/${gender}/U12_Run1/${firstName}${lastName}_Bib${bibNum}.mp4`,
                        thumb_url: `videos/${team}/${gender}/U12_Run1/${firstName}${lastName}_Bib${bibNum}_thumb.jpg`,
                        comparison_url: bibNum > 1 ? `videos/${team}/${gender}/U12_Run1/${firstName}${lastName}_Bib${bibNum}_vs_Bib1.mp4` : null,
                        fastest_bib: 1
                    });
                    bibNum++;
                }
            });
        });

        return {
            event_id: eventId,
            event_name: 'Western Divisional U12 Ranking - SL',
            event_date: '2026-02-04',
            event_type: 'race',
            location: 'Ragged Mountain, NH',
            teams: teams,
            categories: ['U12'],
            content: {
                videos: mockVideos,
                montages: []
            }
        };
    }
};

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
}
