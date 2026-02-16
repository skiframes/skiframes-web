/**
 * Main application module
 */

const App = {
    // Current state
    state: {
        events: [],
        currentEvent: null,
        sortBy: 'rank', // 'rank' or 'duration'
        showFastest: false
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
        const disciplineFilter = document.getElementById('disciplineFilter');
        const clearBtn = document.getElementById('clearFilters');

        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.performAthleteSearch(searchInput.value);
                }
            });
        }

        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                this.performAthleteSearch(searchInput?.value || '');
            });
        }

        // Clear search button
        const clearSearchBtn = document.getElementById('clearSearch');
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                this.hideSearchResults();
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

        if (disciplineFilter) {
            disciplineFilter.addEventListener('change', () => {
                Filters.set('discipline', disciplineFilter.value);
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
                if (disciplineFilter) disciplineFilter.value = '';
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

        container.innerHTML = events.map(event => {
            const logoUrl = event.logo_url ? API.getMediaUrl(event.logo_url) : '';
            return `
            <a href="event.html?event=${event.event_id}" class="event-card">
                <div class="event-card-image">
                    ${logoUrl ? `<img src="${logoUrl}" alt="${event.event_name}" class="event-card-logo">` : ''}
                    <span class="event-badge ${event.event_type}">${event.event_type}</span>
                    ${event.discipline && event.discipline !== 'freeski' ? `<span class="event-badge discipline">${{sl_youth:'SL',sl_adult:'SL',gs_panel:'GS',sg_panel:'SG'}[event.discipline] || event.discipline}</span>` : ''}
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
        `}).join('');
    },

    /**
     * Search for athletes across all events
     */
    async performAthleteSearch(query) {
        if (!query || query.trim() === '') {
            this.hideSearchResults();
            return;
        }

        const searchTerm = query.trim().toLowerCase();
        const resultsContainer = document.getElementById('searchResultsGrid');
        const resultsSection = document.getElementById('searchResults');

        if (!resultsContainer || !resultsSection) return;

        // Show loading state
        resultsSection.style.display = 'block';
        resultsContainer.innerHTML = '<div class="loading">Searching athletes...</div>';

        // Hide other sections while showing results
        this.toggleEventSections(false);

        try {
            // Load all event manifests and search
            const results = [];
            for (const event of this.state.events) {
                const manifest = await API.getEventManifest(event.event_id);
                const videos = manifest.content?.videos || [];

                // Filter to non-comparison videos only
                const athleteVideos = videos.filter(v => !v.is_comparison);

                // Search by name or bib
                const matches = athleteVideos.filter(v => {
                    const nameMatch = v.athlete.toLowerCase().includes(searchTerm);
                    const bibMatch = v.bib.toString() === query.trim();
                    return nameMatch || bibMatch;
                });

                if (matches.length > 0) {
                    results.push({
                        event: event,
                        manifest: manifest,
                        matches: matches
                    });
                }
            }

            this.renderSearchResults(results, query);
        } catch (error) {
            console.error('Search error:', error);
            resultsContainer.innerHTML = '<div class="empty-state"><h3>Search failed</h3><p>Please try again</p></div>';
        }
    },

    /**
     * Render search results
     */
    renderSearchResults(results, query) {
        const container = document.getElementById('searchResultsGrid');
        if (!container) return;

        if (results.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No athletes found</h3>
                    <p>No results for "${query}"</p>
                </div>
            `;
            return;
        }

        // Flatten results into individual athlete entries
        let html = '';
        results.forEach(({ event, manifest, matches }) => {
            const logoUrl = event.logo_url ? API.getMediaUrl(event.logo_url) : '';
            matches.forEach(video => {
                html += `
                <a href="event.html?event=${event.event_id}&search=${encodeURIComponent(video.athlete)}" class="search-result-card">
                    <div class="search-result-logo">
                        ${logoUrl ? `<img src="${logoUrl}" alt="">` : ''}
                    </div>
                    <div class="search-result-info">
                        <h3>${video.athlete}</h3>
                        <p class="search-result-meta">
                            Bib ${video.bib} • ${video.team || ''} • ${video.gender}
                            ${video.rank ? `• Rank ${video.rank}` : ''}
                        </p>
                        <p class="search-result-event">${event.event_name}</p>
                    </div>
                </a>
                `;
            });
        });

        container.innerHTML = html;
    },

    /**
     * Hide search results and show event sections
     */
    hideSearchResults() {
        const resultsSection = document.getElementById('searchResults');
        if (resultsSection) {
            resultsSection.style.display = 'none';
        }
        this.toggleEventSections(true);
    },

    /**
     * Toggle visibility of event sections
     */
    toggleEventSections(show) {
        ['recent', 'races', 'training'].forEach(id => {
            const section = document.getElementById(id);
            if (section) {
                section.style.display = show ? 'block' : 'none';
            }
        });
    },

    // ========================================
    // Event Page
    // ========================================

    async initEventPage() {
        // Get event ID from URL
        const params = new URLSearchParams(window.location.search);
        const eventId = params.get('event');
        const searchQuery = params.get('search');

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

        // Apply search filter from URL if present
        if (searchQuery) {
            const searchInput = document.getElementById('athleteSearch');
            if (searchInput) {
                searchInput.value = searchQuery;
            }
            Filters.set('search', searchQuery);
        }

        // Setup sort buttons
        this.setupSortButtons();

        // Setup download listeners
        this.setupDownloadListeners(manifest);

        // Set default montage variant to slowest speed
        this.initMontageSpeedFilter(manifest);

        // Setup fastest skier toggle
        this.setupFastestToggle(manifest);

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

        // Start auto-refresh polling for new montages
        this.startMontagePolling(manifest.event_id);
    },

    /**
     * Poll manifest for new montages and update the page automatically
     */
    startMontagePolling(eventId) {
        // Poll every 10 seconds
        this.montagePollingInterval = setInterval(async () => {
            try {
                const updated = await API.getEventManifest(eventId, true);
                const currentCount = (this.state.currentEvent.content.montages || []).length;
                const newCount = (updated.content.montages || []).length;

                if (newCount > currentCount) {
                    // Preserve current variant selection
                    const currentVariant = Filters.state.montageVariant;

                    this.state.currentEvent = updated;

                    // Re-init speed buttons if new variants appeared
                    const variants = Filters.getVariantsSlowestFirst(updated.content.montages || []);
                    if (variants.length > 0) {
                        if (!currentVariant || !variants.includes(currentVariant)) {
                            Filters.state.montageVariant = variants[0];
                        }
                        this.renderMontageSpeedButtons(variants);
                    }

                    this.renderEventContent();
                }
            } catch (e) {
                // Silently ignore polling errors
            }
        }, 10000);
    },

    updateEventHeader(manifest) {
        document.title = `${manifest.event_name} - Skiframes`;

        const logoEl = document.getElementById('eventLogo');
        const typeEl = document.getElementById('eventType');
        const nameEl = document.getElementById('eventName');
        const metaEl = document.getElementById('eventMeta');

        if (logoEl && manifest.logo_url) {
            logoEl.src = API.getMediaUrl(manifest.logo_url);
            logoEl.alt = manifest.event_name;
            logoEl.style.display = 'block';
        }

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

    setupSortButtons() {
        document.querySelectorAll('.sort-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.state.sortBy = btn.dataset.sort;
                this.updateSortButtons();
                this.renderEventContent();
            });
        });
    },

    initMontageSpeedFilter(manifest) {
        const montages = manifest.content.montages || [];
        const variants = Filters.getVariantsSlowestFirst(montages);

        if (variants.length === 0) return;

        // Default to the slowest speed (first in sorted list)
        Filters.state.montageVariant = variants[0];

        this.renderMontageSpeedButtons(variants);
    },

    renderMontageSpeedButtons(variants) {
        const container = document.getElementById('montageSpeedButtons');
        if (!container || variants.length === 0) return;

        container.innerHTML = variants.map(variant => {
            const label = this.variantLabel(variant);
            const isActive = Filters.state.montageVariant === variant;
            return `<button class="speed-btn ${isActive ? 'active' : ''}" data-variant="${variant}">${label}</button>`;
        }).join('');

        container.querySelectorAll('.speed-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                Filters.set('montageVariant', btn.dataset.variant);
                container.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    },

    variantLabel(variant) {
        if (!variant || variant === 'base') return 'Base';
        const match = variant.match(/(\d+)/);
        if (match) return `${match[1]}x`;
        return variant.replace(/^_/, '').replace(/later$/i, 'x');
    },

    setupFastestToggle(manifest) {
        const montages = manifest.content.montages || [];
        const hasTimingData = montages.some(m => m.elapsed_time != null);

        const toggleBtn = document.getElementById('showFastestToggle');
        if (!toggleBtn || !hasTimingData) return;

        toggleBtn.style.display = 'inline-flex';
        toggleBtn.addEventListener('click', () => {
            this.state.showFastest = !this.state.showFastest;
            toggleBtn.classList.toggle('active', this.state.showFastest);
            toggleBtn.textContent = this.state.showFastest ? 'Hide Fastest' : 'Show Fastest';
            this.renderEventContent();
        });
    },

    getFastestMontage(montages, variant) {
        const candidates = montages.filter(m =>
            m.elapsed_time != null && (!variant || m.variant === variant)
        );
        if (candidates.length === 0) return null;
        return candidates.reduce((fastest, m) =>
            m.elapsed_time < fastest.elapsed_time ? m : fastest
        );
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

        // Render montages (latest first by run_number, then timestamp)
        const montages = manifest.content.montages || [];
        const filteredMontages = Filters.filterMontages(montages);
        const sortedMontages = [...filteredMontages].sort((a, b) => {
            if (a.run_number !== undefined && b.run_number !== undefined) {
                return b.run_number - a.run_number;
            }
            return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
        });
        this.renderMontagesGrid(sortedMontages, manifest.event_id);

        // Update counts
        const videoCount = document.getElementById('videoCount');
        const montageCount = document.getElementById('montageCount');

        if (videoCount) videoCount.textContent = `${filteredRegular.length} videos`;
        if (montageCount) montageCount.textContent = `${sortedMontages.length} montages`;

        // Hide empty sections
        const videosSection = document.getElementById('videosSection');
        const montagesSection = document.getElementById('montagesSection');
        if (videosSection) videosSection.style.display = filteredRegular.length > 0 ? '' : 'none';
        if (montagesSection) montagesSection.style.display = sortedMontages.length > 0 ? '' : 'none';

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

        const showRankColumn = this.state.sortBy === 'rank';
        const colSpan = showRankColumn ? 9 : 8;

        // Calculate ranks per gender based on duration (client-side ranking)
        const calculateRanks = (videoList) => {
            const rankMap = {};
            ['Women', 'Men'].forEach(gender => {
                const genderVideos = videoList.filter(v => v.gender === gender);
                // Filter to only videos with valid duration and not affected by DNF/DSQ for this run
                const rankable = genderVideos.filter(v => {
                    const statusUpper = (v.status || '').toUpperCase();
                    const statusMatch = statusUpper.match(/^(DNF|DSQ)(\d+)?$/);
                    const statusType = statusMatch ? statusMatch[1] : null;
                    const statusRun = statusMatch && statusMatch[2] ? parseInt(statusMatch[2]) : null;
                    const isAffected = statusType && (statusRun === null || statusRun === v.run);
                    return v.duration && !isAffected;
                });
                // Sort by duration
                rankable.sort((a, b) => a.duration - b.duration);
                // Assign ranks
                rankable.forEach((v, idx) => {
                    rankMap[v.id] = idx + 1;
                });
            });
            return rankMap;
        };

        const rankMap = calculateRanks(videos);

        // Helper to build a row
        const buildRow = (video) => {
            // Parse status to extract type and run number (e.g., "DNF1" -> {type: "DNF", run: 1})
            const statusUpper = (video.status || '').toUpperCase();
            const statusMatch = statusUpper.match(/^(DNF|DSQ)(\d+)?$/);
            const statusType = statusMatch ? statusMatch[1] : null; // "DNF" or "DSQ"
            const statusRun = statusMatch && statusMatch[2] ? parseInt(statusMatch[2]) : null;

            // Check if this video's run is affected by the status
            // If statusRun is null (legacy format like "DNF"), it affects all runs
            // If statusRun matches video.run, this run is affected
            const isAffectedByStatus = statusType && (statusRun === null || statusRun === video.run);

            // Get display status (full string like DNF1, DSQ2, or legacy DNF/DSQ)
            const displayStatus = statusUpper || statusType;

            // Rank display: show full status if affected, otherwise show calculated rank
            const calculatedRank = rankMap[video.id];
            const rankDisplay = isAffectedByStatus ? displayStatus : (calculatedRank ? `#${calculatedRank}` : '-');

            // Duration display: show full status if affected, otherwise show time
            const durationDisplay = isAffectedByStatus
                ? displayStatus
                : video.duration ? `${video.duration.toFixed(2)}s` : '-';

            // Gender abbreviation
            const genderDisplay = video.gender === 'Women' ? 'F' : 'M';

            // USSA profile link in separate column
            const ussaLink = video.ussa_profile_url
                ? `<a href="${video.ussa_profile_url}" target="_blank" class="ussa-link" onclick="event.stopPropagation()">USSA</a>`
                : '';

            // Check if comparison video exists for this bib
            const comparisonUrl = comparisonLookup[video.bib] || '';
            const ghostRaceBtn = comparisonUrl
                ? `<button class="btn btn-sm btn-ghost ghost-race-btn" data-comparison-url="${comparisonUrl}">Ghost Race</button>`
                : '';

            const rankCell = showRankColumn ? `<td class="col-rank">${rankDisplay}</td>` : '';

            return `
                <tr class="video-row" data-item-id="${video.id}" data-video-url="${API.getMediaUrl(video.video_url, eventId)}">
                    <td class="col-select"><input type="checkbox" ${Download.isSelected(video.id) ? 'checked' : ''} onclick="event.stopPropagation(); Download.toggle('${video.id}');"></td>
                    ${rankCell}
                    <td class="col-athlete">${video.athlete}</td>
                    <td class="col-ussa">${ussaLink}</td>
                    <td class="col-gender">${genderDisplay}</td>
                    <td class="col-bib">${video.bib}</td>
                    <td class="col-team">${video.team || '-'}</td>
                    <td class="col-time">${durationDisplay}</td>
                    <td class="col-actions">
                        <button class="btn btn-sm btn-primary play-btn">Play</button>
                        ${ghostRaceBtn}
                    </td>
                </tr>
            `;
        };

        // Helper to sort by calculated rank (DNF/DSQ go to bottom)
        const sortByRank = (a, b) => {
            const rankA = rankMap[a.id] || Infinity;
            const rankB = rankMap[b.id] || Infinity;
            return rankA - rankB;
        };

        // Group by gender when sorting by rank
        let tableContent = '';
        if (this.state.sortBy === 'rank') {
            const women = videos.filter(v => v.gender === 'Women').sort(sortByRank);
            const men = videos.filter(v => v.gender === 'Men').sort(sortByRank);

            if (women.length > 0) {
                tableContent += `<tr class="gender-header"><td colspan="${colSpan}">Women</td></tr>`;
                tableContent += women.map(buildRow).join('');
            }
            if (men.length > 0) {
                tableContent += `<tr class="gender-header"><td colspan="${colSpan}">Men</td></tr>`;
                tableContent += men.map(buildRow).join('');
            }
        } else {
            tableContent = videos.map(buildRow).join('');
        }

        const rankHeader = showRankColumn ? '<th class="col-rank">Run Rank</th>' : '';

        container.innerHTML = `
            <table class="video-table">
                <thead>
                    <tr>
                        <th class="col-select"></th>
                        ${rankHeader}
                        <th class="col-athlete">Athlete</th>
                        <th class="col-ussa"></th>
                        <th class="col-gender">Gender</th>
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

        // Add click handlers for Ghost Race buttons
        container.querySelectorAll('.ghost-race-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const row = btn.closest('.video-row');
                const comparisonUrl = btn.dataset.comparisonUrl;
                const video = videos.find(v => v.id === row.dataset.itemId);

                if (video && comparisonUrl) {
                    Player.open(
                        comparisonUrl,
                        `${video.athlete} - Ghost Race`,
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

        // Find fastest montage for the current variant
        const allMontages = this.state.currentEvent?.content.montages || [];
        const fastest = this.state.showFastest
            ? this.getFastestMontage(allMontages, Filters.state.montageVariant)
            : null;

        container.innerHTML = montages.map(montage => {
            const timeOverlay = montage.elapsed_time != null
                ? `<span class="montage-time-overlay">${montage.elapsed_time.toFixed(2)}s</span>`
                : '';
            const isFastest = fastest && montage.run_number === fastest.run_number;
            const fastestBadge = isFastest ? '<span class="montage-fastest-badge">Fastest</span>' : '';

            if (fastest && !isFastest) {
                // Side-by-side: fastest on left, this montage on right
                const fastestTimeOverlay = fastest.elapsed_time != null
                    ? `<span class="montage-time-overlay">${fastest.elapsed_time.toFixed(2)}s</span>`
                    : '';
                return `
                    <div class="montage-card montage-card-compare" data-montage-id="${montage.id}">
                        <div class="montage-compare-row">
                            <div class="montage-thumbnail montage-thumb-half">
                                ${fastest.thumb_url ? `<img src="${API.getMediaUrl(fastest.thumb_url, eventId)}" alt="Fastest">` : ''}
                                ${fastestTimeOverlay}
                                <span class="montage-fastest-badge">Fastest</span>
                            </div>
                            <div class="montage-thumbnail montage-thumb-half">
                                ${montage.thumb_url ? `<img src="${API.getMediaUrl(montage.thumb_url, eventId)}" alt="Montage">` : ''}
                                ${timeOverlay}
                            </div>
                        </div>
                        <div class="montage-card-content">
                            <p>Run ${montage.run_number || '?'} • ${this.formatTime(montage.timestamp)}</p>
                        </div>
                    </div>
                `;
            }

            // Single card (fastest itself, or showFastest is off)
            return `
                <div class="montage-card" data-montage-id="${montage.id}">
                    <div class="montage-thumbnail">
                        ${montage.thumb_url ? `<img src="${API.getMediaUrl(montage.thumb_url, eventId)}" alt="Montage">` : ''}
                        ${timeOverlay}
                        ${fastestBadge}
                    </div>
                    <div class="montage-card-content">
                        <p>${montage.elapsed_time != null ? `Run ${montage.run_number || '?'} • ` : ''}${this.formatTime(montage.timestamp)}</p>
                    </div>
                </div>
            `;
        }).join('');

        // Add click handlers
        container.querySelectorAll('.montage-card').forEach(card => {
            card.addEventListener('click', () => {
                const montage = montages.find(m => m.id === card.dataset.montageId);
                if (montage) {
                    ImageViewer.open(
                        API.getMediaUrl(montage.thumb_url, eventId),
                        API.getMediaUrl(montage.full_url, eventId),
                        `Photo Montage - Run ${montage.run_number || '?'}${montage.elapsed_time != null ? ` • ${montage.elapsed_time.toFixed(2)}s` : ''}`
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

        setupSpeedBtn('speed025', 0.25);
        setupSpeedBtn('speedDown', 0.5);
        setupSpeedBtn('speedNormal', 1);

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
