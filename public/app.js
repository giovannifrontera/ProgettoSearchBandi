const { createApp, ref, reactive, onMounted, computed, watch, nextTick } = Vue;

const app = createApp({
    data() {
        return {
            currentView: 'results', // 'results', 'schools', 'scanner', 'settings'
            toasts: [],
            nextToastId: 0,
            // Shared states or props if needed across components could go here
        };
    },
    methods: {
        setView(viewName) {
            this.currentView = viewName;
        },
        addToast(toastConfig) { // { title: 'Error', message: 'Details', type: 'danger' (bootstrap bg color) }
            const id = this.nextToastId++;
            this.toasts.push({ ...toastConfig, id });
            setTimeout(() => {
                this.dismissToast(id);
            }, 5000); // Auto-dismiss after 5 seconds
        },
        dismissToast(toastId) {
            this.toasts = this.toasts.filter(t => t.id !== toastId);
        },
        handleScanRequest(schoolIds) {
            this.setView('scanner');
            // Use nextTick to ensure scannerViewRef is available if view just changed
            nextTick(() => {
                if (this.$refs.scannerViewRef) {
                    this.$refs.scannerViewRef.startScanForSchoolIds(schoolIds);
                } else {
                    console.error("Scanner component reference not found.");
                    this.addToast({ title: 'Errore Interfaccia', message: 'Componente Scanner non pronto.', type: 'warning' });
                }
            });
        }
    },
    // If using child components defined below, they need to be registered
    // This will be handled by defining them globally for now.
});

// --- API Service ---
const apiService = {
    async get(endpoint, params = {}) {
        try {
            const response = await axios.get(`/api${endpoint}`, { params });
            return response.data;
        } catch (error) {
            console.error(`API GET Error ${endpoint}:`, error);
            throw error; // Re-throw to be caught by component
        }
    },
    async post(endpoint, data = {}) {
        try {
            const response = await axios.post(`/api${endpoint}`, data);
            return response.data;
        } catch (error) {
            console.error(`API POST Error ${endpoint}:`, error);
            throw error;
        }
    }
};

// --- Reusable Components (Inline Templates) ---

// FiltersPanel Component (Example - can be a child of TendersView or SchoolsView)
const FiltersPanel = {
    props: ['regions', 'provinces', 'initialFilters'],
    emits: ['filters-changed'],
    setup(props, { emit }) {
        const filters = reactive({
            regione: props.initialFilters?.regione || '',
            provincia: props.initialFilters?.provincia || '',
            q: props.initialFilters?.q || '',
        });

        const currentProvinces = computed(() => {
            if (filters.regione && props.provinces[filters.regione]) {
                return props.provinces[filters.regione];
            }
            return [];
        });

        watch(() => filters.regione, (newRegion, oldRegion) => {
            if (newRegion !== oldRegion) {
                filters.provincia = ''; // Reset provincia when region changes
            }
            // No need to emit here, applyFilters will do it
        });

        const applyFilters = () => {
            emit('filters-changed', { ...filters });
        };

        const resetFilters = () => {
            filters.regione = '';
            filters.provincia = '';
            filters.q = '';
            emit('filters-changed', { ...filters });
        };

        return { filters, currentProvinces, applyFilters, resetFilters };
    },
    template: `
        <div class="card mb-3">
            <div class="card-body">
                <h5 class="card-title">Filtri</h5>
                <div class="row g-3">
                    <div class="col-md-4">
                        <label for="filterRegione" class="form-label">Regione</label>
                        <select id="filterRegione" class="form-select" v-model="filters.regione">
                            <option value="">Tutte</option>
                            <option v-for="region in regions" :key="region" :value="region">{{ region }}</option>
                        </select>
                    </div>
                    <div class="col-md-4">
                        <label for="filterProvincia" class="form-label">Provincia</label>
                        <select id="filterProvincia" class="form-select" v-model="filters.provincia" :disabled="!filters.regione || currentProvinces.length === 0">
                            <option value="">Tutte</option>
                            <option v-for="province in currentProvinces" :key="province" :value="province">{{ province }}</option>
                        </select>
                    </div>
                    <div class="col-md-4">
                        <label for="filterQuery" class="form-label">Ricerca Libera</label>
                        <input type="text" id="filterQuery" class="form-control" v-model="filters.q" placeholder="Nome, comune, codice...">
                    </div>
                </div>
                <div class="mt-3">
                    <button class="btn btn-primary me-2" @click="applyFilters"><i class="bi bi-funnel-fill"></i> Applica Filtri</button>
                    <button class="btn btn-outline-secondary" @click="resetFilters"><i class="bi bi-arrow-clockwise"></i> Reset</button>
                </div>
            </div>
        </div>
    `
};
app.component('filters-panel', FiltersPanel);


// --- TendersView Component ---
app.component('tenders-view', {
    components: { FiltersPanel },
    emits: ['show-toast'],
    setup(props, { emit }) {
        const tenders = ref([]);
        const isLoading = ref(false);
        const pagination = reactive({ currentPage: 1, totalPages: 1, totalItems: 0, itemsPerPage: 25 });
        const filters = reactive({ regione: '', provincia: '', q: '', type: '' });
        const sortBy = ref('publish_date');
        const sortOrder = ref('DESC');

        const regions = ref([]);
        const provinces = reactive({}); // { 'Lazio': ['RM', 'LT'], ... }

        const fetchRegions = async () => {
            try {
                regions.value = await apiService.get('/schools/regions');
            } catch (error) {
                emit('show-toast', { title: 'Errore Caricamento Regioni', message: error.response?.data?.message || error.message, type: 'danger' });
            }
        };

        const fetchProvincesForRegion = async (region) => {
            if (!region) {
                provinces[region] = []; // Should not happen if UI prevents empty region for this call
                return;
            }
            try {
                provinces[region] = await apiService.get('/schools/provinces', { regione: region });
            } catch (error) {
                emit('show-toast', { title: 'Errore Caricamento Province', message: error.response?.data?.message || error.message, type: 'danger' });
                provinces[region] = []; // Clear on error for this region
            }
        };

        watch(() => filters.regione, (newRegion) => {
            if (newRegion && !provinces[newRegion]) {
                fetchProvincesForRegion(newRegion);
            }
        });

        const fetchTenders = async () => {
            isLoading.value = true;
            try {
                const params = {
                    ...filters,
                    page: pagination.currentPage,
                    limit: pagination.itemsPerPage,
                    sortBy: sortBy.value,
                    sortOrder: sortOrder.value,
                };
                const response = await apiService.get('/tenders', params);
                tenders.value = response.data;
                if (response.pagination) {
                    Object.assign(pagination, response.pagination);
                }
            } catch (error) {
                emit('show-toast', { title: 'Errore Caricamento Bandi', message: error.response?.data?.message || error.message, type: 'danger' });
                tenders.value = []; // Clear data on error
            } finally {
                isLoading.value = false;
            }
        };

        onMounted(() => {
            fetchRegions();
            fetchTenders();
        });

        const handleFilterChange = (newFilters) => {
            Object.assign(filters, newFilters);
            pagination.currentPage = 1; // Reset to first page on filter change
            fetchTenders();
        };

        const changePage = (newPage) => {
            if (newPage >= 1 && newPage <= pagination.totalPages) {
                pagination.currentPage = newPage;
                fetchTenders();
            }
        };

        const updateSort = (newSortBy) => {
            if (sortBy.value === newSortBy) {
                sortOrder.value = sortOrder.value === 'ASC' ? 'DESC' : 'ASC';
            } else {
                sortBy.value = newSortBy;
                sortOrder.value = 'DESC'; // Default to DESC for new column
            }
            fetchTenders();
        };

        const exportData = (format) => {
            let dataStr, fileName, mimeType;
            if (format === 'csv') {
                if (tenders.value.length === 0) {
                    emit('show-toast', { title: 'Esportazione', message: 'Nessun dato da esportare.', type: 'info' });
                    return;
                }
                const header = Object.keys(tenders.value[0]).join(',');
                const rows = tenders.value.map(row => Object.values(row).map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(','));
                dataStr = [header, ...rows].join('\r\n');
                fileName = 'bandi.csv';
                mimeType = 'text/csv;charset=utf-8;';
            } else if (format === 'json') {
                dataStr = JSON.stringify(tenders.value, null, 2);
                fileName = 'bandi.json';
                mimeType = 'application/json;charset=utf-8;';
            } else {
                return;
            }
            const blob = new Blob([dataStr], { type: mimeType });
            saveAs(blob, fileName);
             emit('show-toast', { title: 'Esportazione', message: `Dati esportati come ${fileName}`, type: 'success' });
        };

        const formatDate = (dateString) => {
            if (!dateString) return 'N/A';
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return dateString; // if already formatted or invalid
            return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
        };

        const getSortIcon = (column) => {
            if (sortBy.value === column) {
                return sortOrder.value === 'ASC' ? 'bi-sort-up' : 'bi-sort-down';
            }
            return 'bi-arrow-down-up'; // Default unsorted icon
        };


        return {
            tenders, isLoading, pagination, filters, sortBy, sortOrder, regions, provinces,
            fetchTenders, handleFilterChange, changePage, updateSort, exportData, formatDate, getSortIcon
        };
    },
    template: `
        <div>
            <h3><i class="bi bi-search"></i> Risultati Bandi</h3>
            <filters-panel
                :regions="regions"
                :provinces="provinces"
                :initial-filters="filters"
                @filters-changed="handleFilterChange">
            </filters-panel>

            <div class="d-flex justify-content-end mb-2">
                <button class="btn btn-sm btn-outline-success me-2" @click="exportData('csv')"><i class="bi bi-file-earmark-spreadsheet"></i> Esporta CSV</button>
                <button class="btn btn-sm btn-outline-primary" @click="exportData('json')"><i class="bi bi-file-earmark-code"></i> Esporta JSON</button>
            </div>

            <div v-if="isLoading" class="text-center my-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Caricamento...</span>
                </div>
                <p>Caricamento bandi...</p>
            </div>
            <div v-else-if="tenders.length === 0" class="alert alert-info">
                Nessun bando trovato con i filtri correnti.
            </div>
            <div v-else class="table-responsive">
                <table class="table table-striped table-hover table-sm">
                    <thead>
                        <tr>
                            <th @click="updateSort('title')" style="cursor:pointer;">Titolo <i :class="getSortIcon('title')"></i></th>
                            <th @click="updateSort('school_name')" style="cursor:pointer;">Scuola <i :class="getSortIcon('school_name')"></i></th>
                            <th @click="updateSort('type')" style="cursor:pointer;">Tipologia <i :class="getSortIcon('type')"></i></th>
                            <th @click="updateSort('publish_date')" style="cursor:pointer;">Data Pubblicazione <i :class="getSortIcon('publish_date')"></i></th>
                            <th @click="updateSort('deadline')" style="cursor:pointer;">Scadenza <i :class="getSortIcon('deadline')"></i></th>
                            <th>URL</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="tender in tenders" :key="tender.id">
                            <td>{{ tender.title }} <small v-if="tender.summary" class="text-muted d-block">{{ tender.summary }}</small></td>
                            <td>{{ tender.school_name }} <small class="text-muted d-block">{{tender.school_provincia}} ({{tender.school_regione}})</small></td>
                            <td>{{ tender.type }}</td>
                            <td>{{ formatDate(tender.publish_date) }}</td>
                            <td>{{ formatDate(tender.deadline) }}</td>
                            <td><a :href="tender.url" target="_blank" class="btn btn-sm btn-outline-info"><i class="bi bi-link-45deg"></i> Link</a></td>
                        </tr>
                    </tbody>
                </table>
                <!-- Pagination Controls -->
                <nav aria-label="Page navigation" v-if="pagination.totalPages > 1">
                    <ul class="pagination justify-content-center">
                        <li class="page-item" :class="{ disabled: pagination.currentPage === 1 }">
                            <a class="page-link" href="#" @click.prevent="changePage(pagination.currentPage - 1)">Precedente</a>
                        </li>
                        <li class="page-item" v-for="page in pagination.totalPages" :key="page" :class="{ active: page === pagination.currentPage }">
                            <a class="page-link" href="#" @click.prevent="changePage(page)">{{ page }}</a>
                        </li>
                        <li class="page-item" :class="{ disabled: pagination.currentPage === pagination.totalPages }">
                            <a class="page-link" href="#" @click.prevent="changePage(pagination.currentPage + 1)">Successiva</a>
                        </li>
                    </ul>
                </nav>
                 <p class="text-center text-muted small">Mostrando {{ tenders.length }} di {{ pagination.totalItems }} bandi.</p>
            </div>
        </div>
    `
});

// --- SchoolsView Component ---
app.component('schools-view', {
    components: { FiltersPanel },
    emits: ['show-toast', 'scan-schools'],
    setup(props, { emit }) {
        const schools = ref([]);
        const isLoading = ref(false);
        const pagination = reactive({ currentPage: 1, totalPages: 1, totalItems: 0, itemsPerPage: 25 });
        const filters = reactive({ regione: '', provincia: '', q: '' });

        const regions = ref([]);
        const provinces = reactive({});
        const selectedSchools = ref(new Set());


        const fetchRegions = async () => {
            try {
                regions.value = await apiService.get('/schools/regions');
            } catch (error) {
                emit('show-toast', { title: 'Errore Caricamento Regioni', message: error.response?.data?.message || error.message, type: 'danger' });
            }
        };

        const fetchProvincesForRegion = async (region) => {
             if (!region) {
                provinces[region] = [];
                return;
            }
            try {
                provinces[region] = await apiService.get('/schools/provinces', { regione: region });
            } catch (error) {
                emit('show-toast', { title: 'Errore Caricamento Province', message: error.response?.data?.message || error.message, type: 'danger' });
                provinces[region] = [];
            }
        };

        watch(() => filters.regione, (newRegion) => {
            selectedSchools.value.clear(); // Clear selection when region changes
            if (newRegion && !provinces[newRegion]) {
                fetchProvincesForRegion(newRegion);
            }
        });


        const fetchSchools = async () => {
            isLoading.value = true;
            selectedSchools.value.clear(); // Clear selection on new fetch
            try {
                const params = {
                    ...filters,
                    page: pagination.currentPage,
                    limit: pagination.itemsPerPage
                };
                const response = await apiService.get('/schools', params);
                schools.value = response.data;
                 if (response.pagination) {
                    Object.assign(pagination, response.pagination);
                }
            } catch (error) {
                emit('show-toast', { title: 'Errore Caricamento Scuole', message: error.response?.data?.message || error.message, type: 'danger' });
                schools.value = [];
            } finally {
                isLoading.value = false;
            }
        };

        onMounted(() => {
            fetchRegions();
            fetchSchools();
        });

        const handleFilterChange = (newFilters) => {
            Object.assign(filters, newFilters);
            pagination.currentPage = 1;
            fetchSchools();
        };

        const changePage = (newPage) => {
            if (newPage >= 1 && newPage <= pagination.totalPages) {
                pagination.currentPage = newPage;
                fetchSchools();
            }
        };

        const toggleSelectSchool = (schoolId) => {
            if (selectedSchools.value.has(schoolId)) {
                selectedSchools.value.delete(schoolId);
            } else {
                selectedSchools.value.add(schoolId);
            }
        };

        const toggleSelectAllOnPage = () => {
            const allOnPageSelected = schools.value.every(s => selectedSchools.value.has(s.id));
            if (allOnPageSelected) {
                schools.value.forEach(s => selectedSchools.value.delete(s.id));
            } else {
                schools.value.forEach(s => selectedSchools.value.add(s.id));
            }
        };

        const isAllOnPageSelected = computed(() => {
            return schools.value.length > 0 && schools.value.every(s => selectedSchools.value.has(s.id));
        });

        const startScanSelected = () => {
            if (selectedSchools.value.size === 0) {
                emit('show-toast', { title: 'Selezione Vuota', message: 'Seleziona almeno una scuola per avviare lo scanner.', type: 'warning' });
                return;
            }
            emit('scan-schools', Array.from(selectedSchools.value));
        };

        return {
            schools, isLoading, pagination, filters, regions, provinces, selectedSchools, isAllOnPageSelected,
            fetchSchools, handleFilterChange, changePage, toggleSelectSchool, toggleSelectAllOnPage, startScanSelected
        };
    },
    template: `
        <div>
            <h3><i class="bi bi-building"></i> Elenco Scuole</h3>
            <filters-panel
                :regions="regions"
                :provinces="provinces"
                :initial-filters="filters"
                @filters-changed="handleFilterChange">
            </filters-panel>

            <div class="mb-3 d-flex justify-content-between align-items-center">
                <button class="btn btn-primary" @click="startScanSelected" :disabled="selectedSchools.size === 0">
                    <i class="bi bi-play-circle"></i> Avvia Scan per Selezionate ({{ selectedSchools.size }})
                </button>
            </div>

            <div v-if="isLoading" class="text-center my-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Caricamento...</span>
                </div>
                <p>Caricamento scuole...</p>
            </div>
            <div v-else-if="schools.length === 0" class="alert alert-info">
                Nessuna scuola trovata con i filtri correnti.
            </div>
            <div v-else class="table-responsive">
                <table class="table table-striped table-hover table-sm">
                    <thead>
                        <tr>
                            <th><input type="checkbox" class="form-check-input" @change="toggleSelectAllOnPage" :checked="isAllOnPageSelected"></th>
                            <th>Codice Mecc.</th>
                            <th>Denominazione</th>
                            <th>Comune</th>
                            <th>Provincia</th>
                            <th>Regione</th>
                            <th>Sito Web</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="school in schools" :key="school.id" :class="{'table-active': selectedSchools.has(school.id)}">
                            <td><input type="checkbox" class="form-check-input" :value="school.id" :checked="selectedSchools.has(school.id)" @change="toggleSelectSchool(school.id)"></td>
                            <td>{{ school.codice_mecc }}</td>
                            <td>{{ school.denominazione }}</td>
                            <td>{{ school.comune }}</td>
                            <td>{{ school.provincia }}</td>
                            <td>{{ school.regione }}</td>
                            <td><a :href="school.sito_web" target="_blank" v-if="school.sito_web">{{ school.sito_web }}</a><span v-else class="text-muted">N/D</span></td>
                        </tr>
                    </tbody>
                </table>
                 <!-- Pagination Controls -->
                <nav aria-label="Page navigation" v-if="pagination.totalPages > 1">
                    <ul class="pagination justify-content-center">
                        <li class="page-item" :class="{ disabled: pagination.currentPage === 1 }">
                            <a class="page-link" href="#" @click.prevent="changePage(pagination.currentPage - 1)">Precedente</a>
                        </li>
                        <li class="page-item" v-for="page in pagination.totalPages" :key="page" :class="{ active: page === pagination.currentPage }">
                            <a class="page-link" href="#" @click.prevent="changePage(page)">{{ page }}</a>
                        </li>
                        <li class="page-item" :class="{ disabled: pagination.currentPage === pagination.totalPages }">
                            <a class="page-link" href="#" @click.prevent="changePage(pagination.currentPage + 1)">Successiva</a>
                        </li>
                    </ul>
                </nav>
                <p class="text-center text-muted small">Mostrando {{ schools.length }} di {{ pagination.totalItems }} scuole.</p>
            </div>
        </div>
    `
});


// --- ScannerView Component ---
app.component('scanner-view', {
    emits: ['show-toast'],
    expose: ['startScanForSchoolIds'], // Expose method to parent
    setup(props, { emit }) {
        const isScanning = ref(false);
        const progress = ref(0);
        const totalSchoolsToScan = ref(0);
        const scannedSchoolsCount = ref(0);
        const scanLog = ref([]); // To show messages like "Scanning X...", "Found Y tenders for X"
        const overallStatus = ref(''); // e.g. "In corso...", "Completato", "Errore"
        const currentSchoolScanning = ref('');
        const lastScanResults = ref([]); // [{school_id, name, status, found_tenders, message}]

        const importStatus = ref('');
        const isImporting = ref(false);
        const fileInputRef = ref(null); // For manual file upload

        const updateSchoolDataset = async (source = 'auto', file = null) => {
            isImporting.value = true;
            importStatus.value = source === 'auto' ? 'Download e importazione automatica in corso...' : 'Importazione da file in corso...';
            emit('show-toast', { title: 'Aggiornamento Scuole', message: importStatus.value, type: 'info' });

            let filePath = null;
            if (source === 'upload' && file) {
                // This is tricky without backend handling multipart/form-data
                // The prompt implies a file path. For a web client, this would typically be:
                // 1. User selects file.
                // 2. File is uploaded to backend (e.g. via FormData + Axios POST to a dedicated endpoint).
                // 3. Backend saves it temporarily, gets a path.
                // 4. Backend calls importSchools with this path.
                // For now, we'll simulate that the backend can accept a 'filePath' directly,
                // which isn't standard for web uploads without a prior upload step.
                // The current /api/schools/import expects a filePath.
                // This part of the UI might need adjustment based on actual backend capabilities for file upload.
                // For now, we will just send a signal to backend; backend needs to handle the file itself if source=upload.
                // The prompt indicates filePath for "upload", so we'll assume it's a path the server can access.
                // This is more of a conceptual client-side trigger.
                // A real implementation would use FormData.
                emit('show-toast', { title: 'Importazione File', message: 'La gestione diretta di file upload da client a server non è completamente implementata in questo boilerplate. Questa azione segnala al backend di usare un file locale se specificato.', type: 'warning' });
                 // Let's assume for now that if filePath is provided, it's a path on the server.
                 // filePath = file.name; // This is NOT how it works.
                 // We'll pass null for filePath and let the backend decide based on source
                 // The POST /api/schools/import {source:"upload", filePath: "path/to/file.csv"}
                 // This implies the client somehow knows a server path.
                 // For now, we will not use the file object directly.
            }

            try {
                // If source is 'upload', filePath would need to be set to a server-accessible path.
                // This example doesn't implement the client-side file upload to get such a path.
                // It just calls the API.
                const payload = { source };
                if (source === 'upload') {
                    // This is a placeholder. Actual file upload needs more.
                    payload.filePath = "NEEDS_ACTUAL_SERVER_SIDE_FILE_HANDLING_OR_PATH";
                     emit('show-toast', { title: 'Nota', message: 'L\'import manuale richiede un file già presente sul server o un endpoint di upload dedicato.', type: 'warning' });
                }

                const response = await apiService.post('/schools/import', payload);
                importStatus.value = response.message || 'Avviato. Controlla i log del server.';
                emit('show-toast', { title: 'Aggiornamento Scuole', message: importStatus.value, type: 'success' });
            } catch (error) {
                importStatus.value = `Errore: ${error.response?.data?.message || error.message}`;
                emit('show-toast', { title: 'Errore Aggiornamento Scuole', message: importStatus.value, type: 'danger' });
            } finally {
                isImporting.value = false;
            }
        };

        const handleFileUpload = (event) => {
            const file = event.target.files[0];
            if (file) {
                // This is where you would typically use FormData to upload the file
                // For now, we'll just call updateSchoolDataset with source 'upload'
                // and rely on backend to have a mechanism if filePath is used.
                // This is a simplification.
                emit('show-toast', { title: 'File Selezionato', message: `File: ${file.name}. L'importazione manuale con upload diretto non è implementata. Usa l'import automatico o assicurati che il backend possa accedere al file se specificato manualmente.`, type: 'info' });
                // updateSchoolDataset('upload', file); // This 'file' object can't be directly used as 'filePath' by backend
            }
        };


        const startScanForSchoolIds = async (schoolIds) => {
            if (!schoolIds || schoolIds.length === 0) {
                emit('show-toast', { title: 'Scanner', message: 'Nessuna scuola fornita per lo scan.', type: 'warning' });
                return;
            }
            isScanning.value = true;
            progress.value = 0;
            scannedSchoolsCount.value = 0;
            totalSchoolsToScan.value = schoolIds.length;
            scanLog.value = [`Avvio scansione per ${totalSchoolsToScan.value} scuole...`];
            overallStatus.value = 'In corso...';
            currentSchoolScanning.value = '';
            lastScanResults.value = [];

            try {
                // The backend /api/scan is currently implemented to take all IDs and process them.
                // It returns 202 Accepted and then processes in background.
                // This means the client won't get live progress per school from THIS call directly.
                // For live progress, WebSockets or a polling mechanism would be needed.
                // For now, we'll simulate "in progress" based on the 202.
                const response = await apiService.post('/scan', { schoolIds });
                scanLog.value.push(response.message || `Richiesta di scansione inviata per ${schoolIds.length} scuole.`);
                overallStatus.value = `Scansione in corso nel backend per ${response.schoolsToScan?.length || schoolIds.length} scuole. Controllare i log del server per dettagli.`;
                // Simulate a completion message after a delay, as we don't have real-time updates
                // This is a placeholder for a more complex progress update system.
                setTimeout(() => {
                    if(isScanning.value) { // Check if still relevant
                         overallStatus.value = `Scansione (presumibilmente) completata nel backend. Controllare i risultati nella sezione Bandi e i log del server.`;
                         scanLog.value.push(overallStatus.value);
                         isScanning.value = false; // Reset scanning state
                         progress.value = 100; // Assume completion for UI
                         scannedSchoolsCount.value = totalSchoolsToScan.value;
                    }
                }, 10000 + (schoolIds.length * 2000)); // Rough estimate

                // To show some activity on the frontend even if backend is async:
                // We can iterate through the schools that were *sent* for scanning.
                // This doesn't reflect actual backend progress but gives user feedback.
                if (response.schoolsToScan && response.schoolsToScan.length > 0) {
                    totalSchoolsToScan.value = response.schoolsToScan.length;
                    for (let i = 0; i < response.schoolsToScan.length; i++) {
                        const school = response.schoolsToScan[i];
                        currentSchoolScanning.value = `(Backend) In attesa di scansione: ${school.name}`;
                        // No actual per-school result here, just updating UI that it's "in progress"
                        // progress.value = ((i + 1) / totalSchoolsToScan.value) * 100;
                        // await new Promise(resolve => setTimeout(resolve, 100)); // Small delay for UI update effect
                    }
                }


            } catch (error) {
                const errorMsg = error.response?.data?.message || error.message;
                scanLog.value.push(`Errore durante l'avvio della scansione: ${errorMsg}`);
                overallStatus.value = `Errore: ${errorMsg}`;
                emit('show-toast', { title: 'Errore Scanner', message: errorMsg, type: 'danger' });
                isScanning.value = false;
            }
            // Note: isScanning might be set to false prematurely if the backend is truly async.
            // The UI feedback needs to be carefully managed for async backend tasks.
        };

        // This method is exposed to be called by parent
        // const startScanForSchoolIds = (ids) => { ... } already defined above

        return {
            isScanning, progress, scanLog, overallStatus, currentSchoolScanning,
            totalSchoolsToScan, scannedSchoolsCount, lastScanResults,
            importStatus, isImporting, fileInputRef,
            updateSchoolDataset, handleFileUpload,
            startScanForSchoolIds // Make sure it's returned to be used in template AND exposed
        };
    },
    template: `
        <div>
            <h3><i class="bi bi-binoculars"></i> Scanner & Gestione Dati</h3>

            <div class="card mb-4">
                <div class="card-body">
                    <h5 class="card-title">Dataset Scuole</h5>
                    <p>Aggiorna l'elenco delle scuole italiane dal dataset ministeriale.</p>
                    <button class="btn btn-success me-2" @click="updateSchoolDataset('auto')" :disabled="isImporting">
                        <i class="bi bi-cloud-download"></i> Aggiorna da MIUR (Auto)
                    </button>
                    <input type="file" ref="fileInputRef" @change="handleFileUpload" accept=".csv,.json" style="display: none;">
                    <button class="btn btn-info" @click="fileInputRef.click()" :disabled="isImporting">
                        <i class="bi bi-upload"></i> Carica File Scuole (CSV/JSON)
                    </button>
                    <div v-if="isImporting || importStatus" class="mt-2">
                        <div v-if="isImporting" class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                        <span>{{ importStatus }}</span>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-body">
                    <h5 class="card-title">Controllo Scanner Bandi</h5>
                    <p>Avvia la scansione per le scuole selezionate nella scheda "Elenco Scuole".</p>
                    <div v-if="!isScanning && overallStatus">
                         <p class="alert" :class="{'alert-success': !overallStatus.toLowerCase().includes('errore'), 'alert-danger': overallStatus.toLowerCase().includes('errore')}">
                            <strong>Stato ultimo scan:</strong> {{ overallStatus }}
                         </p>
                    </div>
                    <div v-if="isScanning">
                        <p><strong>Stato:</strong> {{ overallStatus }}</p>
                        <p v-if="currentSchoolScanning">{{ currentSchoolScanning }}</p>
                        <div class="progress" style="height: 25px;">
                            <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar"
                                 :style="{width: progress + '%'}"
                                 :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100">
                                 {{ Math.round(progress) }}% ({{ scannedSchoolsCount }} / {{ totalSchoolsToScan }})
                            </div>
                        </div>
                        <ul class="list-group mt-3" style="max-height: 200px; overflow-y: auto;">
                            <li v-for="(log, index) in scanLog.slice().reverse()" :key="index" class="list-group-item list-group-item-light small p-1">{{ log }}</li>
                        </ul>
                    </div>
                     <div v-else>
                        <p class="text-muted">Per avviare una nuova scansione, vai alla scheda "Elenco Scuole", seleziona le scuole desiderate e premi "Avvia Scan per Selezionate".</p>
                    </div>

                    <div v-if="!isScanning && lastScanResults.length > 0" class="mt-3">
                        <h6>Risultati Ultima Scansione Completata:</h6>
                        <ul class="list-group" style="max-height: 200px; overflow-y: auto;">
                            <li v-for="result in lastScanResults" :key="result.school_id"
                                class="list-group-item d-flex justify-content-between align-items-center"
                                :class="{'list-group-item-success': result.status === 'success' && result.found_tenders > 0, 'list-group-item-warning': result.status !== 'success' || result.found_tenders === 0}">
                                {{ result.name }} ({{ result.status }})
                                <span class="badge bg-primary rounded-pill">{{ result.found_tenders }} bandi</span>
                                <small v-if="result.message" class="text-danger">{{ result.message }}</small>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    `
});


// --- SettingsView Component ---
app.component('settings-view', {
    emits: ['show-toast'],
    setup(props, { emit }) {
        const settings = reactive({
            dbHost: 'localhost', // Example, these would ideally be loaded/saved
            corsProxy: '',
            scanThreads: 5,
            cronInterval: 'daily',
        });

        const saveSettings = () => {
            // Placeholder: In a real app, save to localStorage or backend
            console.log("Settings saved (simulated):", settings);
            emit('show-toast', { title: 'Impostazioni', message: 'Impostazioni salvate (simulazione).', type: 'success' });
        };

        const isSettingUpDb = ref(false);

        const setupDatabase = async () => {
            isSettingUpDb.value = true;
            emit('show-toast', { title: 'Setup Database', message: 'Avvio procedura di installazione/ripristino del database...', type: 'info' });
            try {
                const response = await apiService.post('/setup-database');
                if (response.success) {
                    emit('show-toast', { title: 'Setup Database', message: response.message || 'Database configurato con successo!', type: 'success' });
                } else {
                    emit('show-toast', { title: 'Errore Setup Database', message: response.message || 'Errore durante la configurazione.', type: 'danger' });
                }
            } catch (error) {
                 emit('show-toast', { title: 'Errore Setup Database', message: error.response?.data?.message || error.message || 'Errore di comunicazione con il server.', type: 'danger' });
            } finally {
                isSettingUpDb.value = false;
            }
        };

        onMounted(() => {
            // Placeholder: Load settings if they were saved previously
            // For example, from localStorage
            // const loadedSettings = JSON.parse(localStorage.getItem('schoolTenderFinderSettings'));
            // if (loadedSettings) {
            //    Object.assign(settings, loadedSettings);
            // }
        });

        return { settings, saveSettings, setupDatabase, isSettingUpDb };
    },
    template: `
        <div>
            <h3><i class="bi bi-gear"></i> Impostazioni</h3>
            <div class="card mb-4">
                <div class="card-body">
                    <h5 class="card-title">Gestione Database</h5>
                    <p>Se è il primo utilizzo o se ci sono problemi con il database, puoi tentare un setup/ripristino.</p>
                    <button class="btn btn-warning" @click="setupDatabase" :disabled="isSettingUpDb">
                        <span v-if="isSettingUpDb" class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                        <i v-else class="bi bi-database-gear"></i>
                        Installa/Ripristina Database
                    </button>
                    <div v-if="isSettingUpDb" class="form-text">Operazione in corso...</div>
                </div>
            </div>

            <div class="card">
                <div class="card-body">
                    <h5 class="card-title">Configurazione Applicazione (Simulata)</h5>
                    <p class="text-muted">Queste impostazioni sono principalmente illustrative per questo PoC e non hanno effetto reale sul backend.</p>

                    <div class="mb-3">
                        <label for="dbHost" class="form-label">Host MySQL</label>
                        <input type="text" class="form-control" id="dbHost" v-model="settings.dbHost" placeholder="Es. localhost o IP server DB">
                        <div class="form-text">Modifica effettiva richiede riavvio server & modifica <code>db/config.js</code>.</div>
                    </div>

                    <div class="mb-3">
                        <label for="corsProxy" class="form-label">URL Proxy CORS (opzionale)</label>
                        <input type="text" class="form-control" id="corsProxy" v-model="settings.corsProxy" placeholder="Es. https://cors-anywhere.herokuapp.com/">
                         <div class="form-text">Da usare se si riscontrano errori CORS durante il fetch dei siti delle scuole. Non implementato attivamente nel crawler attuale.</div>
                    </div>

                    <div class="mb-3">
                        <label for="scanThreads" class="form-label">Thread Crawler Paralleli</label>
                        <input type="number" class="form-control" id="scanThreads" v-model.number="settings.scanThreads" min="1" max="20">
                        <div class="form-text">Numero di scuole da scansionare contemporaneamente. Gestito a livello di API/backend.</div>
                    </div>

                    <div class="mb-3">
                        <label for="cronInterval" class="form-label">Intervallo Cron per Scan Automatico</label>
                        <select class="form-select" id="cronInterval" v-model="settings.cronInterval">
                            <option value="disabled">Disabilitato</option>
                            <option value="hourly">Ogni ora</option>
                            <option value="daily">Giornaliero (notte)</option>
                            <option value="weekly">Settimanale</option>
                        </select>
                        <div class="form-text">Configurazione del job schedulato (se abilitato nel backend con <code>node-schedule</code>).</div>
                    </div>

                    <button class="btn btn-primary" @click="saveSettings"><i class="bi bi-save"></i> Salva Impostazioni (Simulato)</button>
                </div>
            </div>
        </div>
    `
});


// Mount the app to the #app element
app.mount('#app');
