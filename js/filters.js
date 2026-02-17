/**
 * Filter module for search and filtering functionality
 */

const Filters = {
    // Current filter state
    state: {
        search: '',
        team: '',
        category: '',
        gender: '',
        run: '',
        contentType: '',
        eventType: '',
        discipline: '',
        dateFrom: '',
        dateTo: '',
        montageVariant: ''
    },

    /**
     * Update filter state
     */
    set(key, value) {
        this.state[key] = value;
        this.triggerChange();
    },

    /**
     * Clear all filters
     */
    clear() {
        Object.keys(this.state).forEach(key => {
            this.state[key] = '';
        });
        this.triggerChange();
    },

    /**
     * Get current filter state
     */
    get() {
        return { ...this.state };
    },

    /**
     * Check if any filters are active
     */
    hasActiveFilters() {
        return Object.values(this.state).some(v => v !== '');
    },

    // Change listeners
    listeners: [],

    /**
     * Add a change listener
     */
    onChange(callback) {
        this.listeners.push(callback);
    },

    /**
     * Trigger change event
     */
    triggerChange() {
        this.listeners.forEach(callback => callback(this.state));
    },

    // ========================================
    // Filter Functions
    // ========================================

    /**
     * Filter events by current state
     */
    filterEvents(events) {
        return events.filter(event => {
            // Event type filter
            if (this.state.eventType && event.event_type !== this.state.eventType) {
                return false;
            }

            // Discipline filter (sl matches sl_youth and sl_adult, gs matches gs_panel, etc.)
            if (this.state.discipline) {
                const eventDisc = event.discipline || '';
                if (this.state.discipline === 'sl') {
                    if (!eventDisc.startsWith('sl')) return false;
                } else if (this.state.discipline === 'gs') {
                    if (!eventDisc.startsWith('gs')) return false;
                } else if (this.state.discipline === 'sg') {
                    if (!eventDisc.startsWith('sg')) return false;
                } else if (eventDisc !== this.state.discipline) {
                    return false;
                }
            }

            // Date filter
            if (this.state.dateFrom && event.event_date < this.state.dateFrom) {
                return false;
            }
            if (this.state.dateTo && event.event_date > this.state.dateTo) {
                return false;
            }

            // Team filter - check if event has this team
            if (this.state.team && event.teams && !event.teams.includes(this.state.team)) {
                return false;
            }

            // Category filter (case-insensitive)
            if (this.state.category && event.categories) {
                const catLower = this.state.category.toLowerCase();
                if (!event.categories.some(c => c.toLowerCase() === catLower)) {
                    return false;
                }
            }

            // Search filter - check event name
            if (this.state.search) {
                const searchLower = this.state.search.toLowerCase();
                if (!event.event_name.toLowerCase().includes(searchLower)) {
                    return false;
                }
            }

            return true;
        });
    },

    /**
     * Filter videos by current state
     */
    filterVideos(videos) {
        return videos.filter(video => {
            // Exclude DNS (Did Not Start) racers
            if ((video.status || '').toUpperCase() === 'DNS') {
                return false;
            }

            // Team filter
            if (this.state.team && video.team !== this.state.team) {
                return false;
            }

            // Category filter
            if (this.state.category && video.category !== this.state.category) {
                return false;
            }

            // Gender filter
            if (this.state.gender && video.gender !== this.state.gender) {
                return false;
            }

            // Run filter
            if (this.state.run && video.run !== parseInt(this.state.run)) {
                return false;
            }

            // Content type filter
            if (this.state.contentType === 'videos' && video.is_comparison) {
                return false;
            }
            if (this.state.contentType === 'comparison' && !video.is_comparison) {
                return false;
            }

            // Search filter - check athlete name or bib
            if (this.state.search) {
                const searchLower = this.state.search.toLowerCase();
                const bibMatch = video.bib.toString() === this.state.search;
                const nameMatch = video.athlete.toLowerCase().includes(searchLower);
                if (!bibMatch && !nameMatch) {
                    return false;
                }
            }

            return true;
        });
    },

    /**
     * Filter montages by current state
     */
    filterMontages(montages) {
        return montages.filter(montage => {
            // FPS filter
            if (this.state.fps) {
                const filterFps = parseFloat(this.state.fps);
                if (montage.fps !== null && montage.fps !== filterFps) {
                    return false;
                }
            }

            // Search filter
            if (this.state.search) {
                const searchLower = this.state.search.toLowerCase();
                // Montages might not have athlete names, filter by ID or timestamp
                if (!montage.id.toLowerCase().includes(searchLower)) {
                    return false;
                }
            }

            // Variant/speed filter
            if (this.state.montageVariant && montage.variant) {
                if (montage.variant !== this.state.montageVariant) {
                    return false;
                }
            }

            return true;
        });
    },

    /**
     * Extract unique variant names from montages, sorted slowest first
     */
    getVariantsSlowestFirst(montages) {
        const variants = [...new Set(montages.map(m => m.variant).filter(Boolean))];
        return variants.sort((a, b) => {
            return this.variantSpeed(a) - this.variantSpeed(b);
        });
    },

    /**
     * Parse variant name to a numeric speed value (higher = slower/more spread)
     */
    variantSpeed(variant) {
        if (!variant) return 0;
        const match = variant.match(/(\d+\.?\d*)/);
        return match ? parseFloat(match[1]) : 0;
    },

    // ========================================
    // Sort Functions
    // ========================================

    /**
     * Sort events by date (most recent first)
     */
    sortEventsByDate(events, ascending = false) {
        return [...events].sort((a, b) => {
            const dateA = new Date(a.event_date);
            const dateB = new Date(b.event_date);
            return ascending ? dateA - dateB : dateB - dateA;
        });
    },

    /**
     * Sort videos by bib number
     */
    sortVideosByBib(videos, ascending = true) {
        return [...videos].sort((a, b) => {
            return ascending ? a.bib - b.bib : b.bib - a.bib;
        });
    },

    /**
     * Sort videos by athlete name
     */
    sortVideosByName(videos) {
        return [...videos].sort((a, b) => {
            return a.athlete.localeCompare(b.athlete);
        });
    },

    /**
     * Check if a video has DSQ/DNF status
     */
    isDsqDnf(video) {
        const status = (video.status || '').toUpperCase();
        return status === 'DSQ' || status === 'DNF';
    },

    /**
     * Sort videos by duration (fastest first), DSQ/DNF always at end
     */
    sortVideosByDuration(videos, ascending = true) {
        return [...videos].sort((a, b) => {
            const aDsq = this.isDsqDnf(a);
            const bDsq = this.isDsqDnf(b);
            // DSQ/DNF always at the end
            if (aDsq && !bDsq) return 1;
            if (!aDsq && bDsq) return -1;
            if (aDsq && bDsq) return a.bib - b.bib; // Sort DSQ/DNF by bib
            return ascending ? a.duration - b.duration : b.duration - a.duration;
        });
    },

    /**
     * Sort videos by rank (best rank first), DSQ/DNF always at end
     */
    sortVideosByRank(videos, ascending = true) {
        return [...videos].sort((a, b) => {
            const aDsq = this.isDsqDnf(a);
            const bDsq = this.isDsqDnf(b);
            // DSQ/DNF always at the end
            if (aDsq && !bDsq) return 1;
            if (!aDsq && bDsq) return -1;
            if (aDsq && bDsq) return a.bib - b.bib; // Sort DSQ/DNF by bib
            const rankA = a.rank || 999;
            const rankB = b.rank || 999;
            return ascending ? rankA - rankB : rankB - rankA;
        });
    },

    /**
     * Group videos by team
     */
    groupVideosByTeam(videos) {
        const groups = {};
        videos.forEach(video => {
            if (!groups[video.team]) {
                groups[video.team] = [];
            }
            groups[video.team].push(video);
        });
        return groups;
    },

    /**
     * Group videos by category and gender
     */
    groupVideosByCategoryGender(videos) {
        const groups = {};
        videos.forEach(video => {
            const key = `${video.category} ${video.gender}`;
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(video);
        });
        return groups;
    }
};

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Filters;
}
