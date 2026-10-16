// ========================================
// CONFIGURATION API
// ========================================

const API_URL = "https://script.google.com/macros/s/AKfycbwiT-8kyrAfAt6xMdLJUWmG6as0YYxjtVwdMbQKFKMNMzead_zdujcQwjNGDBDUWYUm9g/exec";

// ========================================
// VARIABLES GLOBALES
// ========================================

let allEmployees = [];
let filteredEmployees = [];
let headers = [];
let currentPage = 1;
const itemsPerPage = 10;

// Chart instances
let statusGenderChart = null;
let deptChart = null;

// ========================================
// INITIALISATION
// ========================================

document.addEventListener("DOMContentLoaded", function() {
    setupEventListeners();
    setupNavigation();
    loadAllEmployees();
    updateDateTime();
    setInterval(updateDateTime, 1000);
});

// ========================================
// DATE UTILITIES
// ========================================

function formatDate(dateString) {
    if (!dateString) return "-";
    
    if (typeof dateString === 'string' && dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = dateString.split('-');
        return `${day}/${month}/${year}`;
    }
    
    if (typeof dateString === 'string' && dateString.includes('T')) {
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) {
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
        }
    }
    
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    }
    
    return dateString;
}

function normalizeToISO(dateString) {
    if (!dateString) return null;
    const s = dateString.toString().trim();

    const localDateMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (localDateMatch) {
        const [, day, month, year] = localDateMatch;
        return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0)).toISOString();
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [y, m, d] = s.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, d, 0, 0, 0)).toISOString();
    }

    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
    return null;
}

function normalizeEmployeeDates(array) {
    return array.map(emp => {
        const e = { ...emp };
        if (e["Date de naissance"]) {
            const iso = normalizeToISO(e["Date de naissance"]);
            e["Date de naissance_iso"] = iso;
        }
        if (e["Date d'embauche"]) {
            const iso = normalizeToISO(e["Date d'embauche"]);
            e["Date d'embauche_iso"] = iso;
        }
        return e;
    });
}

function getBirthDateInfo(dateValue) {
    const iso = normalizeToISO(dateValue);
    if (!iso) {
        return { valid: false, iso: null, formatted: "-", age: null };
    }
    const age = calculateAge(iso);
    return {
        valid: age !== null && !isNaN(age),
        iso,
        formatted: formatDate(iso),
        age
    };
}

function getFieldValueByNormalizedName(record, targetName) {
    const normalize = (value) => value.toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
    const target = normalize(targetName);

    for (const key in record) {
        if (normalize(key) === target) {
            return record[key];
        }
    }
    return null;
}

function calculateAge(dateNaissance) {
    if (!dateNaissance) return null;
    
    let birthDate;
    let cleanDate = dateNaissance.toString().trim();
    
    if (cleanDate.includes('T')) {
        birthDate = new Date(cleanDate);
    } else if (cleanDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = cleanDate.split('-');
        birthDate = new Date(year, month - 1, day);
    } else if (cleanDate.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        const [day, month, year] = cleanDate.split('/');
        birthDate = new Date(year, month - 1, day);
    } else {
        birthDate = new Date(cleanDate);
    }
    
    if (isNaN(birthDate.getTime())) return null;
    
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}

function calculateTenure(dateEmbauche) {
    if (!dateEmbauche) return null;
    
    let hireDate;
    let cleanDate = dateEmbauche.toString().trim();
    
    if (cleanDate.includes('T')) {
        hireDate = new Date(cleanDate);
    } else if (cleanDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = cleanDate.split('-');
        hireDate = new Date(year, month - 1, day);
    } else if (cleanDate.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        const [day, month, year] = cleanDate.split('/');
        hireDate = new Date(year, month - 1, day);
    } else {
        hireDate = new Date(cleanDate);
    }
    
    if (isNaN(hireDate.getTime())) return null;
    
    const today = new Date();
    const diffTime = Math.abs(today - hireDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays / 365.25;
}

function getGeneration(age) {
    if (age === null || age === undefined || Number.isNaN(age)) return "Inconnu";
    if (age < 25) return "Génération Z";
    if (age < 41) return "Génération Y";
    if (age < 56) return "Génération X";
    return "Baby Boomer";
}

// ========================================
// EVENT LISTENERS
// ========================================

function setupEventListeners() {
    document.getElementById("refresh-btn").addEventListener("click", loadAllEmployees);

    const orgSearchButton = document.getElementById("org-search-btn");
    const orgResetButton = document.getElementById("org-reset-btn");
    const orgSearchInput = document.getElementById("org-search-input");

    orgSearchButton.addEventListener("click", searchInOrganigramme);
    orgResetButton.addEventListener("click", resetOrgSearch);
    orgSearchInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") searchInOrganigramme();
    });
    
    document.querySelector(".modal-close").addEventListener("click", closeModal);
    document.getElementById("employee-modal").addEventListener("click", (e) => {
        if (e.target.id === "employee-modal") closeModal();
    });
    document.getElementById("image-lightbox-close").addEventListener("click", closeImageLightbox);
    document.getElementById("image-lightbox").addEventListener("click", (e) => {
        if (e.target.id === "image-lightbox") closeImageLightbox();
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeImageLightbox();
            closeModal();
        }
    });
}

function setupNavigation() {
    const navLinks = document.querySelectorAll(".nav-link");
    
    navLinks.forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            
            const section = link.dataset.section;
            
            navLinks.forEach(l => l.classList.remove("active"));
            document.querySelectorAll(".content-section").forEach(s => s.classList.remove("active"));
            document.querySelector(".main-content").classList.toggle("organigramme-active", section === "organigramme");
            
            link.classList.add("active");
            document.getElementById(section).classList.add("active");
            
            updatePageHeader(section);
            
            if (section === "organigramme") {
                buildOrganigramme();
            }
        });
    });
}

function filterStatItems(event) {
    const input = event.target;
    const targetId = input.getAttribute("data-target");
    const container = document.getElementById(targetId);
    const query = input.value.trim().toLowerCase();
    
    if (!container) return;
    
    const items = container.querySelectorAll(".stat-item");
    let visibleCount = 0;
    
    items.forEach(item => {
        const label = item.querySelector(".stat-label");
        const labelText = label ? label.textContent.toLowerCase() : "";
        
        if (query === "" || labelText.includes(query)) {
            item.classList.remove("hidden");
            visibleCount++;
        } else {
            item.classList.add("hidden");
        }
    });
    
    let noResultsMsg = container.querySelector(".no-results");
    if (visibleCount === 0 && query !== "") {
        if (!noResultsMsg) {
            noResultsMsg = document.createElement("p");
            noResultsMsg.className = "no-results loading";
            noResultsMsg.textContent = "Aucun résultat trouvé";
            container.appendChild(noResultsMsg);
        }
        noResultsMsg.style.display = "block";
    } else if (noResultsMsg) {
        noResultsMsg.style.display = "none";
    }
}

function updateDateTime() {
    const now = new Date();
    const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    const datetimeElem = document.getElementById("current-datetime");
    if (datetimeElem) {
        datetimeElem.textContent = now.toLocaleDateString('fr-FR', options);
    }
}

function updatePageHeader(section) {
    const titles = {
        dashboard: { title: "Tableau de Bord", subtitle: "Vue d'ensemble de votre organisation" },
        organigramme: { title: "Organigramme", subtitle: "Structure hiérarchique de l'organisation" }
    };
    
    const data = titles[section] || titles.dashboard;
    const titleEl = document.getElementById("page-title");
    if (titleEl) titleEl.textContent = data.title;
}

// ========================================
// API CALLS
// ========================================

async function fetchFromAPI(params) {
    try {
        const url = API_URL + "?" + new URLSearchParams(params).toString();
        const response = await fetch(url);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error("API Error:", error);
        showToast("Erreur de connexion à l'API", "error");
        return { success: false, message: error.message, data: null };
    }
}

// ========================================
// CHARGEMENT DES DONNÉES
// ========================================

async function loadAllEmployees() {
    showLoading(true);

    let response = await fetchFromAPI({ action: "all" });
    let rawData = [];
    let extraKPIs = null;

    if (response && response.success && response.data && response.data.length > 0) {
        rawData = response.data;
        extraKPIs = response.kpis || null;
    } else {
        try {
            const localResp = await fetch('data.json');
            const localJson = await localResp.json();
            if (localJson && localJson.data && localJson.data.length > 0) {
                rawData = localJson.data;
                extraKPIs = localJson.kpis || null;
                showToast('Chargement depuis data.json (fallback)', 'info');
            } else {
                showToast('Aucune donnée trouvée (API et data.json vides)', 'error');
            }
        } catch (err) {
            console.error('Fallback load error', err);
            showToast('Impossible de charger les données (API + data.json)', 'error');
        }
    }

    if (rawData && rawData.length > 0) {
        const normalized = normalizeEmployeeDates(rawData);

        allEmployees = normalized.filter(emp => {
            const matricule = emp["Matricule"] || "";
            return matricule.toString().trim() !== "";
        }).map(emp => {
            const cleaned = { ...emp };

            let dateOfBirth = null;
            let dateOfBirthKey = null;
            
            for (const key in cleaned) {
                if (key.trim().toLowerCase() === "date de naissance") {
                    dateOfBirth = cleaned[key];
                    dateOfBirthKey = key;
                    break;
                }
            }

            if (dateOfBirth) {
                const dobInfo = getBirthDateInfo(dateOfBirth);
                if (dateOfBirthKey) {
                    cleaned[dateOfBirthKey + "_formatted"] = dobInfo.formatted;
                    cleaned["Date de naissance_valide"] = dobInfo.valid;
                    cleaned["Age"] = dobInfo.age;
                }
            }

            let hireDate = null;
            let hireDateKey = null;
            
            for (const key in cleaned) {
                if (key.trim().toLowerCase() === "date d'embauche") {
                    hireDate = cleaned[key];
                    hireDateKey = key;
                    break;
                }
            }

            if (hireDate) {
                const hireIso = normalizeToISO(hireDate);
                if (hireDateKey) {
                    cleaned[hireDateKey + "_formatted"] = formatDate(hireIso || hireDate);
                    cleaned["Anciennete"] = calculateTenure(hireIso || hireDate);
                }
            }

            return cleaned;
        });

        filteredEmployees = [...allEmployees];

        if (allEmployees.length > 0) headers = Object.keys(allEmployees[0]);

        window._extraKPIs = extraKPIs;

        displayDashboard();
        showToast(`${allEmployees.length} profils chargés avec succès`, "success");
    }

    showLoading(false);
}

// ========================================
// TABLEAU DE BORD
// ========================================

function displayDashboard() {
    updateKPIs();
    displayStatusStatistics();
    displayRattachmentStatistics();
    displayFunctionStatistics();
    displayAgeStatistics();
    displayTenureStatistics();
}

function updateKPIs() {
    const total = allEmployees.length;
    document.getElementById("kpi-total").textContent = total;
    
    let maleCount = 0, femaleCount = 0;
    allEmployees.forEach(emp => {
        const sexe = (emp["Sexe"] || "").toString().trim().toUpperCase();
        if (sexe === "M" || sexe === "H" || sexe === "HOMME") maleCount++;
        else if (sexe === "F" || sexe === "FEMME") femaleCount++;
    });
    
    document.getElementById("kpi-male").textContent = maleCount;
    document.getElementById("kpi-female").textContent = femaleCount;
    const tauxFeminisation = total > 0 ? ((femaleCount / total) * 100).toFixed(1) : 0;
    document.getElementById("kpi-ratio").textContent = `${tauxFeminisation}%`;
    
    const rattachements = new Set();
    const fonctions = new Set();
    allEmployees.forEach(emp => {
        const rattach = (emp["Rattachement"] || "").toString().trim();
        const fonction = (emp["Fonction"] || "").toString().trim();
        if (rattach && rattach !== "") rattachements.add(rattach);
        if (fonction && fonction !== "") fonctions.add(fonction);
    });
    
    document.getElementById("kpi-department").textContent = rattachements.size;
    document.getElementById("kpi-functions").textContent = fonctions.size;
    
    let totalTenure = 0;
    let tenureCount = 0;
    allEmployees.forEach(emp => {
        if (emp["Anciennete"] && !isNaN(emp["Anciennete"])) {
            totalTenure += emp["Anciennete"];
            tenureCount++;
        }
    });
    const avgTenure = tenureCount > 0 ? (totalTenure / tenureCount).toFixed(1) : 0;
    document.getElementById("kpi-avg-tenure").textContent = `${avgTenure} ans`;
    
    const allowedStatuses = ["CDI", "CDD", "STAGIAIRE", "CONSULTANT", "INT MDJ"];
    const statusCounts = { CDI:0, CDD:0, STAGIAIRE:0, CONSULTANT:0, "INT MDJ":0 };
    allEmployees.forEach(emp => {
        const raw = getFieldValueByNormalizedName(emp, "Statut") || emp["Statut"] || "";
        const statut = raw.toString().trim().toUpperCase();
        for (const s of allowedStatuses) {
            if (statut.includes(s)) {
                statusCounts[s]++;
                break;
            }
        }
    });

    document.getElementById("kpi-cdi").textContent = statusCounts["CDI"];
    document.getElementById("kpi-cdd").textContent = statusCounts["CDD"];
    document.getElementById("kpi-stage").textContent = statusCounts["STAGIAIRE"];
    const consultantElem = document.getElementById("kpi-consultant");
    if (consultantElem) consultantElem.textContent = statusCounts["CONSULTANT"];
    const intMdjElem = document.getElementById("kpi-int-mdj");
    if (intMdjElem) intMdjElem.textContent = statusCounts["INT MDJ"];
    
    let genZ = 0, genY = 0, genX = 0, boomer = 0;
    allEmployees.forEach(emp => {
        const birthDateValue = getFieldValueByNormalizedName(emp, "Date de naissance");
        const age = emp["Age"] ?? getBirthDateInfo(birthDateValue).age;
        const gen = getGeneration(age);
        if (gen === "Génération Z") genZ++;
        else if (gen === "Génération Y") genY++;
        else if (gen === "Génération X") genX++;
        else if (gen === "Baby Boomer") boomer++;
    });
    
    document.getElementById("kpi-genz").textContent = genZ;
    document.getElementById("kpi-millennial").textContent = genY;
    document.getElementById("kpi-genx").textContent = genX;
    document.getElementById("kpi-boomer").textContent = boomer;
}

function displayStatusStatistics() {
    const container = document.getElementById("statut-chart");
    const statusMap = {};
    const allowed = ["CDI", "CDD", "STAGIAIRE", "CONSULTANT", "INT MDJ"];
    allowed.forEach(s => statusMap[s] = 0);

    allEmployees.forEach(emp => {
        const raw = getFieldValueByNormalizedName(emp, "Statut") || emp["Statut"] || "";
        const up = raw.toString().trim().toUpperCase();
        let matched = false;
        for (const s of allowed) {
            if (up.includes(s) && !matched) {
                statusMap[s]++;
                matched = true;
                break;
            }
        }
    });
    
    let html = "";
    const sorted = Object.entries(statusMap).sort((a, b) => b[1] - a[1]);
    
    if (sorted.length > 0) {
        sorted.forEach(([statut, count]) => {
            const percentage = ((count / allEmployees.length) * 100).toFixed(1);
            html += `
                <div class="stat-item">
                    <span class="stat-label">${statut}</span>
                    <div class="stat-bar-container">
                        <div class="stat-bar" style="width: ${percentage}%"></div>
                    </div>
                    <span class="stat-value">${count} (${percentage}%)</span>
                </div>
            `;
        });
    } else {
        html = '<p class="loading">Aucun statut trouvé</p>';
    }
    container.innerHTML = html;
}

function displayRattachmentStatistics() {
    const container = document.getElementById("rattach-chart");
    const rattachMap = {};
    
    allEmployees.forEach(emp => {
        const rattach = (emp["Rattachement"] || "Non défini").toString().trim();
        if (rattach && rattach !== "") rattachMap[rattach] = (rattachMap[rattach] || 0) + 1;
    });
    
    let html = "";
    const sorted = Object.entries(rattachMap).sort((a, b) => b[1] - a[1]);
    
    if (sorted.length > 0) {
        sorted.forEach(([rattach, count]) => {
            const percentage = ((count / allEmployees.length) * 100).toFixed(1);
            html += `
                <div class="stat-item">
                    <span class="stat-label">${rattach}</span>
                    <span class="stat-value">${count} (${percentage}%)</span>
                </div>
            `;
        });
    } else {
        html = '<p class="loading">Aucun rattachement trouvé</p>';
    }
    container.innerHTML = html;
}

function displayFunctionStatistics() {
    const container = document.getElementById("fonction-chart");
    const fonctionMap = {};
    
    allEmployees.forEach(emp => {
        const fonction = (emp["Fonction"] || "Non défini").toString().trim();
        if (fonction && fonction !== "") fonctionMap[fonction] = (fonctionMap[fonction] || 0) + 1;
    });
    
    let html = "";
    const sorted = Object.entries(fonctionMap).sort((a, b) => b[1] - a[1]);

    if (sorted.length > 0) {
        sorted.forEach(([fonction, count]) => {
            const percentage = ((count / allEmployees.length) * 100).toFixed(1);
            html += `
                <div class="stat-item">
                    <span class="stat-label">${fonction}</span>
                    <span class="stat-value">${count} (${percentage}%)</span>
                </div>
            `;
        });
    } else {
        html = '<p class="loading">Aucune fonction trouvée</p>';
    }
    container.innerHTML = html;
}

function displayAgeStatistics() {
    const container = document.getElementById("age-chart");
    const ageRanges = {
        "Moins de 25 ans": 0,
        "25-34 ans": 0,
        "35-44 ans": 0,
        "45-54 ans": 0,
        "55 ans et +": 0
    };
    
    allEmployees.forEach(emp => {
        const birthDateValue = getFieldValueByNormalizedName(emp, "Date de naissance");
        const age = emp["Age"] ?? getBirthDateInfo(birthDateValue).age;
        if (age !== null && !isNaN(age)) {
            if (age < 25) ageRanges["Moins de 25 ans"]++;
            else if (age < 35) ageRanges["25-34 ans"]++;
            else if (age < 45) ageRanges["35-44 ans"]++;
            else if (age < 55) ageRanges["45-54 ans"]++;
            else ageRanges["55 ans et +"]++;
        }
    });
    
    let html = "";
    for (const [range, count] of Object.entries(ageRanges)) {
        const percentage = ((count / allEmployees.length) * 100).toFixed(1);
        html += `
            <div class="stat-item">
                <span class="stat-label">${range}</span>
                <div class="stat-bar-container">
                    <div class="stat-bar" style="width: ${percentage}%"></div>
                </div>
                <span class="stat-value">${count} (${percentage}%)</span>
            </div>
        `;
    }
    container.innerHTML = html || '<p class="loading">Aucune donnée d\'âge</p>';
}

function displayTenureStatistics() {
    const container = document.getElementById("tenure-chart");
    const tenureRanges = {
        "Moins d'1 an": 0,
        "1-3 ans": 0,
        "3-5 ans": 0,
        "5-10 ans": 0,
        "Plus de 10 ans": 0
    };
    
    allEmployees.forEach(emp => {
        const tenure = emp["Anciennete"];
        if (tenure !== null && !isNaN(tenure)) {
            if (tenure < 1) tenureRanges["Moins d'1 an"]++;
            else if (tenure < 3) tenureRanges["1-3 ans"]++;
            else if (tenure < 5) tenureRanges["3-5 ans"]++;
            else if (tenure < 10) tenureRanges["5-10 ans"]++;
            else tenureRanges["Plus de 10 ans"]++;
        }
    });
    
    let html = "";
    for (const [range, count] of Object.entries(tenureRanges)) {
        const percentage = ((count / allEmployees.length) * 100).toFixed(1);
        html += `
            <div class="stat-item">
                <span class="stat-label">${range}</span>
                <div class="stat-bar-container">
                    <div class="stat-bar" style="width: ${percentage}%"></div>
                </div>
                <span class="stat-value">${count} (${percentage}%)</span>
            </div>
        `;
    }
    container.innerHTML = html || '<p class="loading">Aucune donnée d\'ancienneté</p>';
}

// ========================================
// TABLEAU EMPLOYÉS
// ========================================

function displayEmployeesTable() {
    const table = document.getElementById("employees-table");
    const tableBody = document.getElementById("table-body");
    const tableHeaders = document.getElementById("table-headers");
    const loadingIndicator = document.getElementById("loading-indicator");
    const emptyState = document.getElementById("empty-state");
    
    if (filteredEmployees.length === 0) {
        table.style.display = "none";
        loadingIndicator.style.display = "none";
        emptyState.style.display = "block";
        return;
    }
    
    loadingIndicator.style.display = "none";
    emptyState.style.display = "none";
    
    const columns = [
        { key: "Matricule", label: "matricule" },
        { key: "Nom et prénoms", label: "nom et prénom" },
        { key: "Fonction", label: "fonction" }
    ];

    const normalizeLabel = (s) => s.toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');

    tableHeaders.innerHTML = "";
    columns.forEach((col) => {
        const th = document.createElement("th");
        th.textContent = col.label;
        th.setAttribute('data-col', normalizeLabel(col.label));
        tableHeaders.appendChild(th);
    });

    const actionTh = document.createElement("th");
    actionTh.textContent = "actions";
    actionTh.setAttribute('data-col', 'actions');
    tableHeaders.appendChild(actionTh);

    const startIdx = (currentPage - 1) * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    const pageEmployees = filteredEmployees.slice(startIdx, endIdx);

    tableBody.innerHTML = "";
    pageEmployees.forEach(emp => {
        const row = document.createElement("tr");

        columns.forEach(col => {
            const td = document.createElement("td");
            const colKey = normalizeLabel(col.label);
            td.setAttribute('data-col', colKey);
            let value = getFieldValueByNormalizedName(emp, col.key) || emp[col.key] || "-";
            td.textContent = value;
            row.appendChild(td);
        });

        const actionTd = document.createElement("td");
        actionTd.setAttribute('data-col', 'actions');
        const matricule = getFieldValueByNormalizedName(emp, "Matricule") || emp["Matricule"] || "";
        actionTd.innerHTML = `
            <button class="btn-action" onclick="viewEmployeeDetails('${matricule}')" aria-label="Voir les détails" title="Voir les détails">
                <span class="btn-action-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                </span>
                <span class="btn-action-text" aria-hidden="true">👁</span>
            </button>
        `;
        row.appendChild(actionTd);
        tableBody.appendChild(row);
    });

    table.style.display = "table";
    updatePaginationInfo();
}

// ========================================
// ORGANIGRAMME
// ========================================

function buildOrganigramme() {
    const treeContainer = document.getElementById("organigramme-tree");
    const loadingEl = document.getElementById("org-loading");
    const emptyEl = document.getElementById("org-empty");

    if (!allEmployees || allEmployees.length === 0) {
        loadingEl.style.display = "none";
        treeContainer.innerHTML = "";
        emptyEl.style.display = "block";
        return;
    }

    loadingEl.style.display = "flex";
    emptyEl.style.display = "none";

    // Petite pause pour laisser le spinner s'afficher
    setTimeout(() => {
        try {
            const roots = buildOrgTreeData(allEmployees);
            if (roots.length === 0) {
                treeContainer.innerHTML = "";
                emptyEl.style.display = "block";
            } else {
                const html = roots.map(root => renderOrgNode(root, 0)).join("");
                treeContainer.innerHTML = html;
                attachOrgInteractions();
            }
        } catch (err) {
            console.error("Erreur organigramme", err);
            treeContainer.innerHTML = "";
            emptyEl.style.display = "block";
        } finally {
            loadingEl.style.display = "none";
        }
    }, 120);
}

function getManagerMatricule(emp) {
    // Cherche la colonne "Matricule Manager" de manière tolérante
    const val = getFieldValueByNormalizedName(emp, "Matricule Manager") 
        ?? emp["Matricule Manager"] 
        ?? emp["Matricule manager"] 
        ?? "";
    return val.toString().trim();
}

function getEmployeeMatricule(emp) {
    const val = getFieldValueByNormalizedName(emp, "Matricule") ?? emp["Matricule"] ?? "";
    return val.toString().trim();
}

function getEmployeeName(emp) {
    return getFieldValueByNormalizedName(emp, "Nom et prénoms") || emp["Nom et prénoms"] || "Sans nom";
}

function getEmployeeFunction(emp) {
    return getFieldValueByNormalizedName(emp, "Fonction") || emp["Fonction"] || "-";
}

function getEmployeePhoto(emp) {
    const raw = getFieldValueByNormalizedName(emp, "Photo") || emp["Photo"] || "";
    const photo = raw.toString().trim();

    if (!photo || /^data:image\//i.test(photo)) {
        return photo;
    }

    const urlMatch = photo.match(/https?:\/\/[^\s"'<>]+/i);
    if (urlMatch) {
        return normalizePhotoUrl(urlMatch[0]);
    }

    if (/^https?:\/\//i.test(photo)) {
        return normalizePhotoUrl(photo);
    }

    const base64 = photo.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/");
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length < 16) {
        return "";
    }

    const paddedBase64 = base64 + "=".repeat((4 - base64.length % 4) % 4);
    const mimeType = base64.startsWith("iVBORw0KGgo")
        ? "image/png"
        : base64.startsWith("/9j/")
            ? "image/jpeg"
            : base64.startsWith("R0lGOD")
                ? "image/gif"
                : base64.startsWith("UklGR")
                    ? "image/webp"
                    : base64.startsWith("PHN2Zy") || base64.startsWith("PD94bWwg")
                        ? "image/svg+xml"
                        : "image/jpeg";

    return `data:${mimeType};base64,${paddedBase64}`;
}

function normalizePhotoUrl(value) {
    const url = value.trim().replace(/[),.;]+$/, "");

    try {
        const parsed = new URL(url);
        const isGoogleDrive = /(^|\.)drive\.google\.com$/i.test(parsed.hostname);

        if (isGoogleDrive) {
            const fileMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/i)
                || parsed.pathname.match(/\/d\/([^/]+)/i);
            const fileId = fileMatch
                ? fileMatch[1]
                : parsed.searchParams.get("id");

            if (fileId) {
                return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w400`;
            }
        }
    } catch (error) {
        console.warn("URL photo invalide:", url, error);
    }

    return url;
}

function getEmployeeInitials(name) {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function buildOrgTreeData(employees) {
    // Index par matricule
    const byMatricule = new Map();
    employees.forEach(emp => {
        const mat = getEmployeeMatricule(emp);
        if (mat) byMatricule.set(mat, emp);
    });

    // Construction de la hiérarchie
    const nodes = new Map();
    employees.forEach(emp => {
        const mat = getEmployeeMatricule(emp);
        if (!mat) return;
        nodes.set(mat, {
            id: mat,
            employee: emp,
            children: [],
            parentId: null
        });
    });

    nodes.forEach(node => {
        const emp = node.employee;
        let managerMat = getManagerMatricule(emp);

        // Nettoyage : "CN00063", "cn00063", " CN00063 "
        managerMat = (managerMat || "").toString().trim();

        // Ignorer les managers invalides ou auto-références
        if (!managerMat || managerMat === node.id) {
            return;
        }

        // Résolution insensible à la casse
        let resolvedManagerId = null;
        if (nodes.has(managerMat)) {
            resolvedManagerId = managerMat;
        } else {
            const lower = managerMat.toLowerCase();
            for (const key of nodes.keys()) {
                if (key.toLowerCase() === lower) {
                    resolvedManagerId = key;
                    break;
                }
            }
        }

        if (resolvedManagerId && nodes.has(resolvedManagerId)) {
            node.parentId = resolvedManagerId;
            nodes.get(resolvedManagerId).children.push(node);
        }
    });

    // Détection des cycles : si un nœud est son propre ancêtre, on le détache
    nodes.forEach(node => {
        const visited = new Set();
        let current = node;
        while (current && current.parentId) {
            if (visited.has(current.id)) {
                // Cycle détecté : on détache ce nœud de son parent
                const parent = nodes.get(current.parentId);
                if (parent) {
                    parent.children = parent.children.filter(c => c.id !== current.id);
                }
                current.parentId = null;
                break;
            }
            visited.add(current.id);
            current = nodes.get(current.parentId);
        }
    });

    // Racines = nœuds sans parent
    const roots = [];
    nodes.forEach(node => {
        if (!node.parentId) roots.push(node);
    });

    // Tri : managers en premier (ceux qui ont des enfants)
    roots.sort((a, b) => {
        if (a.children.length > 0 && b.children.length === 0) return -1;
        if (a.children.length === 0 && b.children.length > 0) return 1;
        return getEmployeeName(a.employee).localeCompare(getEmployeeName(b.employee));
    });

    // Tri récursif des enfants
    const sortChildren = (n) => {
        n.children.sort((a, b) => getEmployeeName(a.employee).localeCompare(getEmployeeName(b.employee)));
        n.children.forEach(sortChildren);
    };
    roots.forEach(sortChildren);

    return roots;
}

function renderOrgNode(node, level) {
    const emp = node.employee;
    const name = getEmployeeName(emp);
    const mat = getEmployeeMatricule(emp);
    const fonction = getEmployeeFunction(emp);
    const photo = getEmployeePhoto(emp);
    const hasChildren = node.children.length > 0;
    const initials = getEmployeeInitials(name);

    const avatarHtml = renderEmployeeAvatar(photo, name, initials, "org-photo", "org-avatar-fallback");

    const childrenHtml = hasChildren
        ? `<div class="org-children">${node.children.map(c => renderOrgNode(c, level + 1)).join("")}</div>`
        : "";

    return `
        <div class="org-node ${hasChildren ? "org-node--manager" : "org-node--collab"}" data-matricule="${escapeHtmlAttr(mat)}">
            <div class="org-card" onclick="openOrgCard('${escapeHtmlAttr(mat)}')">
                <div class="org-photo-wrapper">
                    ${avatarHtml}
                </div>
                <div class="org-info">
                    <div class="org-name">${escapeHtml(name)}</div>
                    <div class="org-mat">${escapeHtml(mat)}</div>
                    <div class="org-func">${escapeHtml(fonction)}</div>
                </div>
                ${hasChildren ? `<div class="org-badge" title="${node.children.length} collaborateur(s)">${node.children.length}</div>` : ""}
            </div>
            ${childrenHtml}
        </div>
    `;
}

function escapeHtml(s) {
    return (s || "").toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escapeHtmlAttr(s) {
    return escapeHtml(s);
}

function renderEmployeeAvatar(photo, name, initials, imageClass, fallbackClass) {
    if (!photo) {
        return `<div class="${fallbackClass}" style="display:flex;">${escapeHtml(initials)}</div>`;
    }

    return `<img src="${escapeHtmlAttr(photo)}" alt="${escapeHtmlAttr(name)}" class="${imageClass} photo-expandable" loading="lazy" onclick="event.stopPropagation(); openImageLightbox(this)" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><div class="${fallbackClass}" style="display:none;">${escapeHtml(initials)}</div>`;
}

function openImageLightbox(image) {
    if (!image || !image.src) return;

    const lightbox = document.getElementById("image-lightbox");
    const lightboxImage = document.getElementById("image-lightbox-image");
    if (!lightbox || !lightboxImage) return;

    lightboxImage.src = image.src;
    lightboxImage.alt = image.alt || "Photo du collaborateur";
    lightbox.classList.add("show");
    document.body.classList.add("lightbox-open");
}

function closeImageLightbox() {
    const lightbox = document.getElementById("image-lightbox");
    const lightboxImage = document.getElementById("image-lightbox-image");
    if (!lightbox) return;

    lightbox.classList.remove("show");
    document.body.classList.remove("lightbox-open");
    if (lightboxImage) lightboxImage.removeAttribute("src");
}

function attachOrgInteractions() {
    // Rien de spécial pour l'instant : on gère via onclick inline
}

function openOrgCard(matricule) {
    // Ouvre la fiche détaillée de l'employé
    if (!matricule) return;
    // Réutilise la modal employé
    viewEmployeeDetails(matricule);
}

function searchInOrganigramme() {
    const query = (document.getElementById("org-search-input").value || "").trim().toLowerCase();
    const tree = document.getElementById("organigramme-tree");

    if (!query) {
        showToast("Entrez un matricule ou un nom", "info");
        return;
    }

    clearOrganigrammeFilter();
    const nodes = tree.querySelectorAll(".org-node");
    const matches = [];
    nodes.forEach(node => {
        const mat = (node.dataset.matricule || "").toLowerCase();
        const name = (node.querySelector(".org-name")?.textContent || "").toLowerCase();
        if (mat.includes(query) || name.includes(query)) {
            matches.push(node);
        }
    });

    if (matches.length === 0) {
        showToast("Aucun employé trouvé dans l'organigramme", "error");
        return;
    }

    const visibleNodes = new Set();
    const matchSet = new Set(matches);
    matches.forEach(match => {
        visibleNodes.add(match);
        match.querySelectorAll(".org-node").forEach(descendant => visibleNodes.add(descendant));

        let parent = match.parentElement.closest(".org-node");
        while (parent) {
            visibleNodes.add(parent);
            parent = parent.parentElement.closest(".org-node");
        }
    });

    nodes.forEach(node => {
        const isVisible = visibleNodes.has(node);
        node.classList.toggle("org-node--filtered-out", !isVisible);
        node.classList.remove("org-node--first-visible", "org-node--last-visible");
        node.querySelector(".org-card").classList.toggle("org-card--highlight", matchSet.has(node));
    });

    tree.querySelectorAll(".org-children").forEach(children => {
        const visibleChildren = Array.from(children.children).filter(child => !child.classList.contains("org-node--filtered-out"));
        if (visibleChildren.length > 0) {
            visibleChildren[0].classList.add("org-node--first-visible");
            visibleChildren[visibleChildren.length - 1].classList.add("org-node--last-visible");
        }
    });

    const firstMatch = matches[0];
    firstMatch.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    showToast(
        matches.length === 1 ? "Employé localisé avec sa hiérarchie" : `${matches.length} personnes trouvées avec leur hiérarchie`,
        "success"
    );
}

function clearOrganigrammeFilter() {
    const tree = document.getElementById("organigramme-tree");
    tree.querySelectorAll(".org-node").forEach(node => {
        node.classList.remove("org-node--filtered-out", "org-node--first-visible", "org-node--last-visible");
        node.querySelector(".org-card").classList.remove("org-card--highlight");
    });
}

function resetOrgSearch() {
    document.getElementById("org-search-input").value = "";
    clearOrganigrammeFilter();
    if (!document.getElementById("organigramme-tree").querySelector(".org-node")) {
        buildOrganigramme();
    }
}

// ========================================
// RECHERCHE
// ========================================

async function searchEmployees() {
    const query = document.getElementById("search-input").value.trim();
    
    if (!query) {
        resetSearch();
        return;
    }
    
    showLoading(true);
    const response = await fetchFromAPI({ action: "search", query: query });
    
    if (response.success && response.data) {
        filteredEmployees = response.data;
        filteredEmployees = filteredEmployees.map(emp => {
            const cleaned = {...emp};
            if (cleaned["Date de naissance"]) {
                cleaned["Date de naissance_formatted"] = formatDate(cleaned["Date de naissance"]);
                cleaned["Age"] = calculateAge(cleaned["Date de naissance"]);
            }
            if (cleaned["Date d'embauche"]) {
                cleaned["Date d'embauche_formatted"] = formatDate(cleaned["Date d'embauche"]);
                cleaned["Anciennete"] = calculateTenure(cleaned["Date d'embauche"]);
            }
            return cleaned;
        });
        currentPage = 1;
        displayEmployeesTable();
        showToast(response.message, "success");
    } else {
        showToast("Erreur: " + response.message, "error");
    }
    
    showLoading(false);
}

function resetSearch() {
    document.getElementById("search-input").value = "";
    filteredEmployees = [...allEmployees];
    currentPage = 1;
    displayEmployeesTable();
}

// ========================================
// DÉTAILS EMPLOYÉ
// ========================================

function viewEmployeeDetails(matricule) {
    // Recherche tolérante sur le matricule
    const target = (matricule || "").toString().trim().toLowerCase();
    const employee = allEmployees.find(emp => {
        const m = (getEmployeeMatricule(emp) || "").toString().trim().toLowerCase();
        return m === target;
    });
    
    if (!employee) {
        showToast("Employé non trouvé", "error");
        return;
    }
    
    const modalBody = document.getElementById("modal-body");
    const name = getEmployeeName(employee);
    const photo = getEmployeePhoto(employee);
    const initials = getEmployeeInitials(name);
    
    const photoHtml = renderEmployeeAvatar(photo, name, initials, "modal-photo", "modal-avatar-fallback");
    
    let html = `
        <div class="modal-profile">
            <div class="modal-photo-wrapper">${photoHtml}</div>
            <div class="modal-profile-info">
                <h2>${escapeHtml(name)}</h2>
                <p class="modal-mat">${escapeHtml(getEmployeeMatricule(employee))}</p>
                <p class="modal-func">${escapeHtml(getEmployeeFunction(employee))}</p>
            </div>
        </div>
        <div class="form-grid">
    `;
    
    const displayFields = [
        "Matricule groupe",
        "Matricule",
        "Fonction",
        "Statut",
        "Niveau",
        "Flotte",
        "Numéro collabo.",
        "Mail Collabo.",
        "Matricule Manager",
        "Nom de manager",
        "Numéro manager",
        "Mail manager."
    ];
    
    displayFields.forEach((field) => {
        let value = getFieldValueByNormalizedName(employee, field) || "-";
        html += `
            <div class="form-group">
                <label>${escapeHtml(field)}</label>
                <input type="text" value="${escapeHtmlAttr(value)}" readonly>
            </div>
        `;
    });
    
    html += '</div>';
    modalBody.innerHTML = html;
    
    document.getElementById("employee-modal").classList.add("show");
}

function closeModal() {
    document.getElementById("employee-modal").classList.remove("show");
}

// ========================================
// PAGINATION
// ========================================

function updatePaginationInfo() {
    const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);
    document.getElementById("page-info").textContent = `Page ${currentPage} / ${totalPages}`;
    
    const prevBtn = document.getElementById("prev-btn");
    const nextBtn = document.getElementById("next-btn");
    if (prevBtn) prevBtn.disabled = currentPage === 1;
    if (nextBtn) nextBtn.disabled = currentPage === totalPages;
}

function previousPage() {
    if (currentPage > 1) {
        currentPage--;
        displayEmployeesTable();
    }
}

function nextPage() {
    const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        displayEmployeesTable();
    }
}

// ========================================
// RECHERCHE COLLABORATEUR
// ========================================

async function searchCollaborators() {
    const query = document.getElementById("collab-search-input").value.trim();
    
    if (!query) {
        resetCollaboratorSearch();
        return;
    }
    
    const loading = document.getElementById("collab-loading");
    loading.style.display = "flex";
    
    const response = await fetchFromAPI({ action: "search", query: query });
    
    if (response.success && response.data) {
        const collaborators = response.data.map(emp => {
            const cleaned = {...emp};
            let dateOfBirth = null;
            let dateOfBirthKey = null;
            for (const key in cleaned) {
                if (key.trim().toLowerCase() === "date de naissance") {
                    dateOfBirth = cleaned[key];
                    dateOfBirthKey = key;
                    break;
                }
            }
            if (dateOfBirth) {
                const dobInfo = getBirthDateInfo(dateOfBirth);
                if (dateOfBirthKey) {
                    cleaned[dateOfBirthKey + "_formatted"] = dobInfo.formatted;
                    cleaned["Age"] = dobInfo.age;
                }
            }
            let hireDate = null;
            let hireDateKey = null;
            for (const key in cleaned) {
                if (key.trim().toLowerCase() === "date d'embauche") {
                    hireDate = cleaned[key];
                    hireDateKey = key;
                    break;
                }
            }
            if (hireDate) {
                const hireDateFormatted = formatDate(hireDate);
                if (hireDateKey) {
                    cleaned[hireDateKey + "_formatted"] = hireDateFormatted;
                    cleaned["Anciennete"] = calculateTenure(hireDate);
                }
            }
            return cleaned;
        });

        displayCollaboratorsTable(collaborators);
        showToast(response.message, "success");
    } else {
        showToast("Erreur: " + response.message, "error");
        displayCollaboratorsTable([]);
    }
    
    loading.style.display = "none";
}

function resetCollaboratorSearch() {
    document.getElementById("collab-search-input").value = "";
    displayCollaboratorsTable([]);
}

function displayCollaboratorsTable(collaborators) {
    const table = document.getElementById("collab-table");
    const tableBody = document.getElementById("collab-table-body");
    const tableHeaders = document.getElementById("collab-table-headers");
    const emptyState = document.getElementById("collab-empty-state");
    
    if (collaborators.length === 0) {
        table.style.display = "none";
        emptyState.style.display = "block";
        return;
    }
    
    emptyState.style.display = "none";
    
    const columns = [
        { key: "Matricule", label: "matricule" },
        { key: "Nom et prénoms", label: "nom et prénom" },
        { key: "Fonction", label: "fonction" }
    ];

    const normalizeLabel = (s) => s.toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');

    tableHeaders.innerHTML = "";
    columns.forEach((col) => {
        const th = document.createElement("th");
        th.textContent = col.label;
        th.setAttribute('data-col', normalizeLabel(col.label));
        tableHeaders.appendChild(th);
    });

    const actionTh = document.createElement("th");
    actionTh.textContent = "actions";
    actionTh.setAttribute('data-col', 'actions');
    tableHeaders.appendChild(actionTh);

    tableBody.innerHTML = "";
    collaborators.forEach(collab => {
        const row = document.createElement("tr");

        columns.forEach(col => {
            const td = document.createElement("td");
            const colKey = normalizeLabel(col.label);
            td.setAttribute('data-col', colKey);
            let value = getFieldValueByNormalizedName(collab, col.key) || collab[col.key] || "-";
            td.textContent = value;
            row.appendChild(td);
        });

        const actionTd = document.createElement("td");
        actionTd.setAttribute('data-col', 'actions');
        const matricule = getFieldValueByNormalizedName(collab, "Matricule") || "";
        actionTd.innerHTML = `
            <button class="btn-action" onclick="viewEmployeeDetails('${escapeHtmlAttr(matricule)}')" aria-label="Voir les détails" title="Voir les détails">
                <span class="btn-action-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                </span>
            </button>
        `;
        row.appendChild(actionTd);
        tableBody.appendChild(row);
    });

    table.style.display = "table";
}

// ========================================
// UTILITAIRES
// ========================================

function showLoading(show) {
    const loadingIndicator = document.getElementById("loading-indicator");
    if (loadingIndicator) {
        loadingIndicator.style.display = show ? "flex" : "none";
    }
}

function showToast(message, type = "info") {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    
    setTimeout(() => {
        toast.classList.remove("show");
    }, 4000);
}