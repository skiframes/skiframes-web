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
            return await response.json();
        } catch (error) {
            console.error('Error fetching event manifest:', error);
            // Return mock data for development
            return this.getMockEventManifest(eventId);
        }
    },

    /**
     * Get full URL for a media file
     */
    getMediaUrl(relativePath, eventId) {
        if (relativePath.startsWith('http')) return relativePath;
        return `${this.MEDIA_BASE}/events/${eventId}/${relativePath}`;
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
