/**
 * Main application module
 */

const App = {
    // Current state
    state: {
        events: [],
        currentEvent: null,
        sortBy: 'rank' // 'rank' or 'duration'
    },

    /**
     * Initialize application
     */
    async init() {
        // Determine which page we're on
        const isEventPage = window.location.pathname.includes('event.html') ||
                           window.location.search.includes('event=');

        if (isEventPage) {
            await this.initEventPage();
        } else {
            await this.initHomePage();
        }

        // Setup global event listeners
        this.setupGlobalListeners();
    },

    // ========================================
    // Home Page
    // ========================================

    async initHomePage() {
        // Load events
        const data = await API.getEventsIndex();
        this.state.events = data.events || [];

        // Populate team filter
        const teams = await API.getAllTeams();
        this.populateTeamFilter('teamFilter', teams);

        // Setup filter listeners
        this.setupHomeFilters();

        // Render events
        this.renderHomeEvents();
    },

    setupHomeFilters() {
        const searchInput = document.getElementById('globalSearch');
        const searchBtn = document.getElementById('searchBtn');
        const dateFilter = document.getElementById('dateFilter');
        const teamFilter = document.getElementById('teamFilter');
        const categoryFilter = document.getElementById('categoryFilter');
        const typeFilter = document.getElementById('typeFilter');
        const clearBtn = document.getElementById('clearFilters');

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                Filters.set('search', searchInput.value);
            });
        }

        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                this.renderHomeEvents();
            });
        }

        if (dateFilter) {
            dateFilter.addEventListener('change', () => {
                Filters.set('dateFrom', dateFilter.value);
                Filters.set('dateTo', dateFilter.value);
            });
        }

        if (teamFilter) {
            teamFilter.addEventListener('change', () => {
                Filters.set('team', teamFilter.value);
            });
        }

        if (categoryFilter) {
            categoryFilter.addEventListener('change', () => {
                Filters.set('category', categoryFilter.value);
            });
        }

        if (typeFilter) {
            typeFilter.addEventListener('change', () => {
                Filters.set('eventType', typeFilter.value);
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                Filters.clear();
                if (searchInput) searchInput.value = '';
                if (dateFilter) dateFilter.value = '';
                if (teamFilter) teamFilter.value = '';
                if (categoryFilter) categoryFilter.value = '';
                if (typeFilter) typeFilter.value = '';
            });
        }

        // Listen for filter changes
        Filters.onChange(() => {
            this.renderHomeEvents();
        });
    },

    renderHomeEvents() {
        const allEvents = this.state.events;
        const filteredEvents = Filters.filterEvents(allEvents);
        const sortedEvents = Filters.sortEventsByDate(filteredEvents);

        // Recent events (top 6)
        this.renderEventGrid('recentEvents', sortedEvents.slice(0, 6));

        // Race events
        const raceEvents = sortedEvents.filter(e => e.event_type === 'race');
        this.renderEventGrid('raceEvents', raceEvents);

        // Training events
        const trainingEvents = sortedEvents.filter(e => e.event_type === 'training');
        this.renderEventGrid('trainingEvents', trainingEvents);
    },

    renderEventGrid(containerId, events) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (events.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No events found</h3>
                    <p>Try adjusting your filters</p>
                </div>
            `;
            return;
        }

        container.innerHTML = events.map(event => `
            <a href="event.html?event=${event.event_id}" class="event-card">
                <div class="event-card-image">
                    ${event.thumb_url ? `<img src="${event.thumb_url}" alt="${event.event_name}">` : ''}
                    <span class="event-badge ${event.event_type}">${event.event_type}</span>
                </div>
                <div class="event-card-content">
                    <h3>${event.event_name}</h3>
                    <p class="event-card-meta">${this.formatDate(event.event_date)} • ${event.location || ''}</p>
                    <div class="event-card-stats">
                        ${event.video_count ? `<span>${event.video_count} videos</span>` : ''}
                        ${event.montage_count ? `<span>${event.montage_count} montages</span>` : ''}
                        ${event.teams ? `<span>${event.teams.length} teams</span>` : ''}
                    </div>
                </div>
            </a>
        `).join('');
    },

    // ========================================
    // Event Page
    // ========================================

    async initEventPage() {
        // Get event ID from URL
        const params = new URLSearchParams(window.location.search);
        const eventId = params.get('event');

        if (!eventId) {
            this.showError('No event specified');
            return;
        }

        // Load event data
        const manifest = await API.getEventManifest(eventId);
        this.state.currentEvent = manifest;

        // Update page header
        this.updateEventHeader(manifest);

        // Populate filters
        this.populateEventFilters(manifest);

        // Setup filter listeners
        this.setupEventFilters();

        // Setup tabs
        this.setupTabs();

        // Setup download listeners
        this.setupDownloadListeners(manifest);

        // Render content
        this.renderEventContent();

        // Initialize video player
        Player.init(
            document.getElementById('modalVideo'),
            document.getElementById('videoModal')
        );

        // Initialize image viewer
        ImageViewer.init(
            document.getElementById('modalImage'),
            document.getElementById('imageModal')
        );
    },

    updateEventHeader(manifest) {
        document.title = `${manifest.event_name} - Skiframes`;

        const typeEl = document.getElementById('eventType');
        const nameEl = document.getElementById('eventName');
        const metaEl = document.getElementById('eventMeta');

        if (typeEl) {
            typeEl.textContent = manifest.event_type;
            typeEl.className = `event-badge ${manifest.event_type}`;
        }

        if (nameEl) {
            nameEl.textContent = manifest.event_name;
        }

        if (metaEl) {
            metaEl.textContent = `${this.formatDate(manifest.event_date)} • ${manifest.location || ''}`;
        }
    },

    populateEventFilters(manifest) {
        // Teams
        if (manifest.teams) {
            this.populateTeamFilter('teamFilterEvent', manifest.teams);
        }

        // Categories
        if (manifest.categories) {
            const categorySelect = document.getElementById('categoryFilterEvent');
            if (categorySelect) {
                manifest.categories.forEach(cat => {
                    const option = document.createElement('option');
                    option.value = cat;
                    option.textContent = cat;
                    categorySelect.appendChild(option);
                });
            }
        }

        // Populate team dropdown for bulk download
        const teamDropdown = document.getElementById('teamDropdown');
        if (teamDropdown && manifest.teams) {
            teamDropdown.innerHTML = manifest.teams.map(team => `
                <div class="dropdown-item" data-team="${team}">Download ${team}</div>
            `).join('');
        }
    },

    setupEventFilters() {
        const searchInput = document.getElementById('athleteSearch');
        const teamFilter = document.getElementById('teamFilterEvent');
        const categoryFilter = document.getElementById('categoryFilterEvent');
        const genderFilter = document.getElementById('genderFilter');
        const runFilter = document.getElementById('runFilter');
        const contentType = document.getElementById('contentType');
        const clearBtn = document.getElementById('clearFiltersEvent');

        const setupFilter = (element, filterKey) => {
            if (element) {
                element.addEventListener('change', () => {
                    Filters.set(filterKey, element.value);
                });
            }
        };

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                Filters.set('search', searchInput.value);
            });
        }

        setupFilter(teamFilter, 'team');
        setupFilter(categoryFilter, 'category');
        setupFilter(genderFilter, 'gender');
        setupFilter(runFilter, 'run');
        setupFilter(contentType, 'contentType');

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                Filters.clear();
                if (searchInput) searchInput.value = '';
                document.querySelectorAll('.filter-select').forEach(s => s.value = '');
            });
        }

        Filters.onChange(() => {
            this.renderEventContent();
        });
    },

    setupTabs() {
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;

                // Update active tab
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Show corresponding section
                document.getElementById('videosSection').style.display =
                    tabName === 'videos' ? 'block' : 'none';
                document.getElementById('montagesSection').style.display =
                    tabName === 'montages' ? 'block' : 'none';
            });
        });

        // Sort buttons
        document.querySelectorAll('.sort-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.state.sortBy = btn.dataset.sort;
                this.updateSortButtons();
                this.renderEventContent();
            });
        });
    },

    setupDownloadListeners(manifest) {
        const selectAllBtn = document.getElementById('selectAll');
        const selectNoneBtn = document.getElementById('selectNone');
        const downloadSelectedBtn = document.getElementById('downloadSelected');
        const downloadByTeamBtn = document.getElementById('downloadByTeam');
        const teamDropdown = document.getElementById('teamDropdown');
        const cancelDownloadBtn = document.getElementById('cancelDownload');

        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', () => {
                const videos = manifest.content.videos || [];
                const filtered = Filters.filterVideos(videos);
                Download.selectAll(filtered.map(v => v.id));
                this.renderEventContent();
            });
        }

        if (selectNoneBtn) {
            selectNoneBtn.addEventListener('click', () => {
                Download.clearSelection();
                this.renderEventContent();
            });
        }

        if (downloadSelectedBtn) {
            downloadSelectedBtn.addEventListener('click', () => {
                const videos = manifest.content.videos || [];
                const items = videos.map(v => ({
                    id: v.id,
                    url: API.getMediaUrl(v.video_url, manifest.event_id),
                    filename: `${v.athlete.replace(/\s+/g, '')}_Bib${v.bib}.mp4`,
                    team: v.team
                }));
                Download.downloadSelected(items);
            });
        }

        if (downloadByTeamBtn && teamDropdown) {
            downloadByTeamBtn.addEventListener('click', () => {
                teamDropdown.style.display =
                    teamDropdown.style.display === 'none' ? 'block' : 'none';
            });

            teamDropdown.addEventListener('click', (e) => {
                const team = e.target.dataset.team;
                if (team) {
                    const videos = manifest.content.videos || [];
                    const montages = manifest.content.montages || [];

                    // Split videos into regular and comparison
                    const regularVideos = videos.filter(v => !v.is_comparison);
                    const comparisonVideos = videos.filter(v => v.is_comparison);

                    Download.downloadByTeam(
                        regularVideos,
                        comparisonVideos,
                        montages,
                        team,
                        manifest.event_id
                    );
                    teamDropdown.style.display = 'none';
                }
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!downloadByTeamBtn.contains(e.target) && !teamDropdown.contains(e.target)) {
                    teamDropdown.style.display = 'none';
                }
            });
        }

        if (cancelDownloadBtn) {
            cancelDownloadBtn.addEventListener('click', () => {
                Download.cancelDownload();
            });
        }
    },

    renderEventContent() {
        const manifest = this.state.currentEvent;
        if (!manifest) return;

        // Split videos into regular and comparison
        const allVideos = manifest.content.videos || [];
        const regularVideos = allVideos.filter(v => !v.is_comparison);
        const comparisonVideos = allVideos.filter(v => v.is_comparison);

        // Build lookup: bib -> comparison video URL
        const comparisonLookup = {};
        comparisonVideos.forEach(v => {
            comparisonLookup[v.bib] = API.getMediaUrl(v.video_url, manifest.event_id);
        });

        // Filter and sort regular videos
        const filteredRegular = Filters.filterVideos(regularVideos);
        const sortedRegular = this.sortVideos(filteredRegular);
        this.renderVideosGrid(sortedRegular, manifest.event_id, 'videosGrid', comparisonLookup);

        // Render montages
        const montages = manifest.content.montages || [];
        const filteredMontages = Filters.filterMontages(montages);
        this.renderMontagesGrid(filteredMontages, manifest.event_id);

        // Update counts
        const videoCount = document.getElementById('videoCount');
        const montageCount = document.getElementById('montageCount');

        if (videoCount) videoCount.textContent = `${filteredRegular.length} videos`;
        if (montageCount) montageCount.textContent = `${filteredMontages.length} montages`;

        // Update sort button active state
        this.updateSortButtons();
    },

    sortVideos(videos) {
        switch (this.state.sortBy) {
            case 'duration':
                return Filters.sortVideosByDuration(videos);
            case 'rank':
            default:
                return Filters.sortVideosByRank(videos);
        }
    },

    updateSortButtons() {
        document.querySelectorAll('.sort-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sort === this.state.sortBy);
        });
    },

    renderVideosGrid(videos, eventId, containerId = 'videosGrid', comparisonLookup = {}) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (videos.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No videos found</h3>
                    <p>Try adjusting your filters</p>
                </div>
            `;
            return;
        }

        container.className = 'video-table-container';

        // Helper to build a row
        const buildRow = (video) => {
            // Status display (DSQ/DNF or rank)
            const statusUpper = (video.status || '').toUpperCase();
            const rankDisplay = statusUpper === 'DSQ' ? 'DSQ'
                : statusUpper === 'DNF' ? 'DNF'
                : video.rank ? `#${video.rank}` : '-';

            // Format duration as time (e.g., 29.04s)
            const durationDisplay = video.duration ? `${video.duration.toFixed(2)}s` : '-';

            // Gender abbreviation
            const genderDisplay = video.gender === 'Women' ? 'F' : 'M';

            // Wrap athlete name with USSA profile link if available
            const athleteDisplay = video.ussa_profile_url
                ? `<a href="${video.ussa_profile_url}" target="_blank" class="athlete-link" onclick="event.stopPropagation()">${video.athlete}</a>`
                : video.athlete;

            // Check if comparison video exists for this bib
            const comparisonUrl = comparisonLookup[video.bib] || '';
            const vsFastestBtn = comparisonUrl
                ? `<button class="btn btn-sm btn-secondary vs-fastest-btn" data-comparison-url="${comparisonUrl}">vs Fastest</button>`
                : '';

            return `
                <tr class="video-row" data-item-id="${video.id}" data-video-url="${API.getMediaUrl(video.video_url, eventId)}">
                    <td class="col-select"><input type="checkbox" ${Download.isSelected(video.id) ? 'checked' : ''} onclick="event.stopPropagation(); Download.toggle('${video.id}');"></td>
                    <td class="col-rank">${rankDisplay}</td>
                    <td class="col-athlete">${athleteDisplay} <span class="gender-tag">${genderDisplay}</span></td>
                    <td class="col-bib">${video.bib}</td>
                    <td class="col-team">${video.team || '-'}</td>
                    <td class="col-time">${durationDisplay}</td>
                    <td class="col-actions">
                        <button class="btn btn-sm btn-primary play-btn">Play</button>
                        ${vsFastestBtn}
                    </td>
                </tr>
            `;
        };

        // Group by gender when sorting by rank
        let tableContent = '';
        if (this.state.sortBy === 'rank') {
            const women = videos.filter(v => v.gender === 'Women');
            const men = videos.filter(v => v.gender === 'Men');

            if (women.length > 0) {
                tableContent += `<tr class="gender-header"><td colspan="7">Women</td></tr>`;
                tableContent += women.map(buildRow).join('');
            }
            if (men.length > 0) {
                tableContent += `<tr class="gender-header"><td colspan="7">Men</td></tr>`;
                tableContent += men.map(buildRow).join('');
            }
        } else {
            tableContent = videos.map(buildRow).join('');
        }

        container.innerHTML = `
            <table class="video-table">
                <thead>
                    <tr>
                        <th class="col-select"></th>
                        <th class="col-rank">Rank</th>
                        <th class="col-athlete">Athlete</th>
                        <th class="col-bib">Bib</th>
                        <th class="col-team">Team</th>
                        <th class="col-time">Time</th>
                        <th class="col-actions"></th>
                    </tr>
                </thead>
                <tbody>
                    ${tableContent}
                </tbody>
            </table>
        `;

        // Add click handlers for Play buttons
        container.querySelectorAll('.play-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const row = btn.closest('.video-row');
                const videoUrl = row.dataset.videoUrl;
                const video = videos.find(v => v.id === row.dataset.itemId);

                if (video) {
                    Player.open(
                        videoUrl,
                        video.athlete,
                        `Bib ${video.bib} • ${video.team} • ${video.category} ${video.gender} • Run ${video.run}`,
                        videoUrl,
                        null
                    );
                }
            });
        });

        // Add click handlers for vs Fastest buttons
        container.querySelectorAll('.vs-fastest-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const row = btn.closest('.video-row');
                const comparisonUrl = btn.dataset.comparisonUrl;
                const video = videos.find(v => v.id === row.dataset.itemId);

                if (video && comparisonUrl) {
                    Player.open(
                        comparisonUrl,
                        `${video.athlete} vs Fastest`,
                        `Bib ${video.bib} • ${video.team} • ${video.category} ${video.gender} • Run ${video.run}`,
                        comparisonUrl,
                        null
                    );
                }
            });
        });

        // Add click handlers for row (clicking anywhere else plays the video)
        container.querySelectorAll('.video-row').forEach(row => {
            row.addEventListener('click', (e) => {
                // Don't trigger if clicking checkbox or buttons
                if (e.target.type === 'checkbox' || e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return;

                const videoUrl = row.dataset.videoUrl;
                const video = videos.find(v => v.id === row.dataset.itemId);

                if (video) {
                    Player.open(
                        videoUrl,
                        video.athlete,
                        `Bib ${video.bib} • ${video.team} • ${video.category} ${video.gender} • Run ${video.run}`,
                        videoUrl,
                        null
                    );
                }
            });
        });
    },

    renderMontagesGrid(montages, eventId) {
        const container = document.getElementById('montagesGrid');
        if (!container) return;

        if (montages.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No montages found</h3>
                    <p>Photo montages will appear here when available</p>
                </div>
            `;
            return;
        }

        container.innerHTML = montages.map(montage => `
            <div class="montage-card" data-montage-id="${montage.id}">
                <div class="montage-thumbnail">
                    ${montage.thumb_url ? `<img src="${API.getMediaUrl(montage.thumb_url, eventId)}" alt="Montage">` : ''}
                </div>
                <div class="montage-card-content">
                    <p>${this.formatTime(montage.timestamp)}</p>
                </div>
            </div>
        `).join('');

        // Add click handlers
        container.querySelectorAll('.montage-card').forEach(card => {
            card.addEventListener('click', () => {
                const montage = montages.find(m => m.id === card.dataset.montageId);
                if (montage) {
                    ImageViewer.open(
                        API.getMediaUrl(montage.thumb_url, eventId),
                        API.getMediaUrl(montage.full_url, eventId),
                        `Photo Montage - ${this.formatTime(montage.timestamp)}`
                    );
                }
            });
        });
    },

    // ========================================
    // Global Listeners
    // ========================================

    setupGlobalListeners() {
        // Modal close buttons
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                Player.close();
                ImageViewer.close();
            });
        });

        // Modal backdrop click
        document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
            backdrop.addEventListener('click', () => {
                Player.close();
                ImageViewer.close();
            });
        });

        // Video player controls
        const setupSpeedBtn = (id, speed) => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.addEventListener('click', () => Player.setSpeed(speed));
            }
        };

        setupSpeedBtn('speedDown', 0.5);
        setupSpeedBtn('speedNormal', 1);
        setupSpeedBtn('speedUp', 2);

        const frameBackBtn = document.getElementById('frameBack');
        const frameForwardBtn = document.getElementById('frameForward');

        if (frameBackBtn) {
            frameBackBtn.addEventListener('click', () => Player.frameBack());
        }

        if (frameForwardBtn) {
            frameForwardBtn.addEventListener('click', () => Player.frameForward());
        }
    },

    // ========================================
    // Helpers
    // ========================================

    populateTeamFilter(selectId, teams) {
        const select = document.getElementById(selectId);
        if (!select) return;

        teams.forEach(team => {
            const option = document.createElement('option');
            option.value = team;
            option.textContent = team;
            select.appendChild(option);
        });
    },

    formatDate(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr + 'T00:00:00');
        if (isNaN(date.getTime())) return dateStr; // Return original if invalid
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    },

    formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit'
        });
    },

    showError(message) {
        const main = document.querySelector('main');
        if (main) {
            main.innerHTML = `
                <div class="empty-state" style="padding: 100px 24px;">
                    <h3>Error</h3>
                    <p>${message}</p>
                    <a href="/" class="btn btn-primary" style="margin-top: 20px;">Back to Home</a>
                </div>
            `;
        }
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
