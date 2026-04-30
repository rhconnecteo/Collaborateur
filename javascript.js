// ========================================
// CONFIGURATION API
// ========================================

const API_URL = "https://script.google.com/macros/s/AKfycbwO0zMEkcp3bFdNB-9o2bL10K0CaJ86JyuwaLlybraQK84JDt_nJiBZ4ZebOepKrfmePA/exec";
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
let evolutionChart = null;
let agePyramid = null;

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
// DATE UTILITIES - CORRECTION DU PROBLÈME
// ========================================

function formatDate(dateString) {
    if (!dateString) return "N/A";
    
    // Si c'est déjà une date au format YYYY-MM-DD
    if (typeof dateString === 'string' && dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = dateString.split('-');
        return `${day}/${month}/${year}`;
    }
    
    // Si c'est au format ISO avec T
    if (typeof dateString === 'string' && dateString.includes('T')) {
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) {
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
        }
    }
    
    // Essayer de parser autrement
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    }
    
    return dateString;
}

// Normalize a date string (YYYY-MM-DD or ISO) to an ISO UTC string or null
function normalizeToISO(dateString) {
    if (!dateString) return null;
    const s = dateString.toString().trim();

    // DD/MM/YYYY ou DD-MM-YYYY (format fréquent dans Sheets / export local)
    const localDateMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (localDateMatch) {
        const [, day, month, year] = localDateMatch;
        return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0)).toISOString();
    }

    // YYYY-MM-DD (date-only) -> interpret as midnight UTC
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [y, m, d] = s.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, d, 0, 0, 0)).toISOString();
    }

    // If already contains T or time info, try to parse and re-emit ISO
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
    return null;
}

// Normalize date fields on employee records (adds *_iso fields)
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
        return {
            valid: false,
            iso: null,
            formatted: "N/A",
            age: null
        };
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
    
    // Nettoyer la date
    let cleanDate = dateNaissance.toString().trim();
    
    // Si c'est au format ISO
    if (cleanDate.includes('T')) {
        birthDate = new Date(cleanDate);
    } 
    // Si c'est au format YYYY-MM-DD
    else if (cleanDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = cleanDate.split('-');
        birthDate = new Date(year, month - 1, day);
    }
    // Si c'est au format DD/MM/YYYY
    else if (cleanDate.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        const [day, month, year] = cleanDate.split('/');
        birthDate = new Date(year, month - 1, day);
    }
    else {
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
    } 
    else if (cleanDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = cleanDate.split('-');
        hireDate = new Date(year, month - 1, day);
    }
    else if (cleanDate.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        const [day, month, year] = cleanDate.split('/');
        hireDate = new Date(year, month - 1, day);
    }
    else {
        hireDate = new Date(cleanDate);
    }
    
    if (isNaN(hireDate.getTime())) return null;
    
    const today = new Date();
    const diffTime = Math.abs(today - hireDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const diffYears = diffDays / 365.25;
    
    return diffYears;
}

function getGeneration(age) {
    if (age === null || age === undefined || Number.isNaN(age)) return "Inconnu";
    if (age < 25) return "Génération Z";
    if (age < 41) return "Millennial";
    if (age < 56) return "Génération X";
    return "Baby Boomer";
}

// ========================================
// EVENT LISTENERS
// ========================================

function setupEventListeners() {
    document.getElementById("refresh-btn").addEventListener("click", loadAllEmployees);
    document.getElementById("search-btn").addEventListener("click", searchEmployees);
    document.getElementById("reset-btn").addEventListener("click", resetSearch);
    
    document.getElementById("prev-btn").addEventListener("click", previousPage);
    document.getElementById("next-btn").addEventListener("click", nextPage);
    
    document.getElementById("search-input").addEventListener("keypress", (e) => {
        if (e.key === "Enter") searchEmployees();
    });

    // Collaborator search listeners
    document.getElementById("collab-search-btn").addEventListener("click", searchCollaborators);
    document.getElementById("collab-reset-btn").addEventListener("click", resetCollaboratorSearch);
    document.getElementById("collab-search-input").addEventListener("keypress", (e) => {
        if (e.key === "Enter") searchCollaborators();
    });
    
    document.querySelector(".modal-close").addEventListener("click", closeModal);
    document.getElementById("employee-modal").addEventListener("click", (e) => {
        if (e.target.id === "employee-modal") closeModal();
    });

    // Panel search listeners for filtering stat items
    const panelSearchInputs = document.querySelectorAll(".panel-search");
    panelSearchInputs.forEach(input => {
        input.addEventListener("keyup", filterStatItems);
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
            
            link.classList.add("active");
            document.getElementById(section).classList.add("active");
            
            updatePageHeader(section);
            
            if (section === "analytics") {
                loadAnalyticsCharts();
            }
        });
    });
}

// Filter stat items in panels based on search input
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
    
    // Show "no results" message if nothing matches
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
        employees: { title: "Employés", subtitle: "Gérez et consultez vos collaborateurs" },
        analytics: { title: "Analytique", subtitle: "Statistiques détaillées et rapports" },
        search: { title: "Recherche Collaborateur", subtitle: "Trouvez rapidement vos collaborateurs" }
    };
    
    const data = titles[section] || titles.dashboard;
    document.getElementById("page-title").textContent = data.title;
    document.getElementById("page-subtitle").textContent = data.subtitle;
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
        // Fallback: essayer de charger data.json local si l'API ne renvoie rien
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
        // Normaliser les dates vers ISO si nécessaire
        const normalized = normalizeEmployeeDates(rawData);

        allEmployees = normalized.filter(emp => {
            const matricule = emp["Matricule"] || "";
            return matricule.toString().trim() !== "";
        }).map(emp => {
            const cleaned = { ...emp };

            // Chercher la colonne "Date de naissance" (peut avoir des espaces)
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

            // Chercher la colonne "Date d'embauche" 
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

        // Exposer KPIs additionnels pour affichage
        window._extraKPIs = extraKPIs;

        const birthDateSamples = allEmployees.slice(0, 5).map((emp, index) => {
            const birthValue = getFieldValueByNormalizedName(emp, "Date de naissance");
            const birthInfo = getBirthDateInfo(birthValue);
            return {
                index: index + 1,
                matricule: getFieldValueByNormalizedName(emp, "Matricule"),
                nom: getFieldValueByNormalizedName(emp, "Nom et prénoms"),
                rawBirthDate: birthValue,
                parsedISO: birthInfo.iso,
                age: birthInfo.age,
                valid: birthInfo.valid
            };
        });

        console.log("[HRFlow] Échantillon dates de naissance", birthDateSamples);

        displayDashboard();
        displayEmployeesTable();
        showToast(`${allEmployees.length} employés chargés avec succès`, "success");
    }

    showLoading(false);
}

// ========================================
// TABLEAU DE BORD AVEC NOUVEAUX KPI
// ========================================

function displayDashboard() {
    console.log("📊 Affichage du tableau de bord avec", allEmployees.length, "employés");
    
    updateKPIs();
    displayStatusStatistics();
    displayRattachmentStatistics();
    displayFunctionStatistics();
    displayGenderStatistics();
    displayAgeStatistics();
    displayTenureStatistics();
}

function updateKPIs() {
    const total = allEmployees.length;
    document.getElementById("kpi-total").textContent = total;
    
    // Genre
    let maleCount = 0, femaleCount = 0;
    allEmployees.forEach(emp => {
        const sexe = (emp["Sexe"] || "").toString().trim().toUpperCase();
        if (sexe === "M" || sexe === "H" || sexe === "HOMME") maleCount++;
        else if (sexe === "F" || sexe === "FEMME") femaleCount++;
    });
    
    document.getElementById("kpi-male").textContent = maleCount;
    document.getElementById("kpi-female").textContent = femaleCount;
    const ratio = femaleCount > 0 ? ((maleCount / femaleCount) * 100).toFixed(1) : (maleCount > 0 ? 100 : 0);
    document.getElementById("kpi-ratio").textContent = `${ratio}% H/F`;
    
    // Organisation
    const rattachements = new Set();
    const fonctions = new Set();
    allEmployees.forEach(emp => {
        const rattach = (emp["Rattachement"] || "").toString().trim();
        const fonction = (emp["Fonction"] || "").toString().trim();
        if (rattach && rattach !== "") {
            rattachements.add(rattach);
        }
        if (fonction && fonction !== "") fonctions.add(fonction);
    });
    
    document.getElementById("kpi-department").textContent = rattachements.size;
    document.getElementById("kpi-functions").textContent = fonctions.size;
    
    // Ancienneté moyenne
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
    
    // Turnover removed per request
    
    // Statuts
    // Statuts — count only requested statuses with exclusive matching
    const allowedStatuses = ["CDI", "CDD", "STAGIAIRE", "CONSULTANT", "INT MDJ"];
    const statusCounts = { CDI:0, CDD:0, STAGIAIRE:0, CONSULTANT:0, "INT MDJ":0 };
    allEmployees.forEach(emp => {
        const raw = getFieldValueByNormalizedName(emp, "Statut") || emp["Statut"] || "";
        const statut = raw.toString().trim().toUpperCase();
        // Use exclusive matching to avoid double-counting
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
    
    // Générations
    let genZ = 0, millennial = 0, genX = 0, boomer = 0;
    allEmployees.forEach(emp => {
        const birthDateValue = getFieldValueByNormalizedName(emp, "Date de naissance");
        const age = emp["Age"] ?? getBirthDateInfo(birthDateValue).age;
        const gen = getGeneration(age);
        if (gen === "Génération Z") genZ++;
        else if (gen === "Millennial") millennial++;
        else if (gen === "Génération X") genX++;
        else if (gen === "Baby Boomer") boomer++;
    });

    console.log("[HRFlow] KPI générations", { total, genZ, millennial, genX, boomer });
    console.log("[HRFlow] Statuts détectés", [...new Set(allEmployees.map(emp => getFieldValueByNormalizedName(emp, "Statut")).filter(Boolean))]);
    
    document.getElementById("kpi-genz").textContent = genZ;
    document.getElementById("kpi-millennial").textContent = millennial;
    document.getElementById("kpi-genx").textContent = genX;
    document.getElementById("kpi-boomer").textContent = boomer;
}

function displayStatusStatistics() {
    const container = document.getElementById("statut-chart");
    const statusMap = {};
    
    // Only include the requested statuses and in this order
    const allowed = ["CDI", "CDD", "STAGIAIRE", "CONSULTANT", "INT MDJ"];
    allowed.forEach(s => statusMap[s] = 0);

    allEmployees.forEach(emp => {
        const raw = getFieldValueByNormalizedName(emp, "Statut") || emp["Statut"] || "";
        const statut = raw.toString().trim();
        const up = statut.toUpperCase();
        
        // Use exclusive matching to avoid double-counting
        let matched = false;
        for (const s of allowed) {
            if (up.includes(s) && !matched) {
                statusMap[s]++;
                matched = true;
                break;
            }
        }
    });

    console.log("[HRFlow] Répartition par statut (corrigée)", statusMap);
    
    let html = "";
    const sorted = Object.entries(statusMap).sort((a, b) => b[1] - a[1]);
    
    if (sorted.length > 0) {
        sorted.forEach(([statut, count]) => {
            const percentage = ((count / allEmployees.length) * 100).toFixed(1);
            const width = percentage;
            html += `
                <div class="stat-item">
                    <span class="stat-label">${statut}</span>
                    <div class="stat-bar-container">
                        <div class="stat-bar" style="width: ${width}%"></div>
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
        // show all and let CSS scrolling handle overflow
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

function displayGenderStatistics() {
    const container = document.getElementById("sexe-chart");
    const genderMap = {};
    
    allEmployees.forEach(emp => {
        const sexe = (emp["Sexe"] || "Non défini").toString().trim().toUpperCase();
        let gender = "Non défini";
        if (sexe === "M" || sexe === "H" || sexe === "HOMME") gender = "Hommes";
        else if (sexe === "F" || sexe === "FEMME") gender = "Femmes";
        genderMap[gender] = (genderMap[gender] || 0) + 1;
    });
    
    let html = "";
    const sorted = Object.entries(genderMap).sort((a, b) => b[1] - a[1]);
    
    if (sorted.length > 0) {
        sorted.forEach(([gender, count]) => {
            const percentage = ((count / allEmployees.length) * 100).toFixed(1);
            const icon = gender === "Hommes" ? "👨" : gender === "Femmes" ? "👩" : "❓";
            html += `
                <div class="stat-item">
                    <span class="stat-label">${icon} ${gender}</span>
                    <div class="stat-bar-container">
                        <div class="stat-bar" style="width: ${percentage}%"></div>
                    </div>
                    <span class="stat-value">${count} (${percentage}%)</span>
                </div>
            `;
        });
    } else {
        html = '<p class="loading">Aucune donnée</p>';
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

    console.log("[HRFlow] Répartition par âge", ageRanges);
    
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
    
    // En-têtes compacts pour meilleure lisibilité
    tableHeaders.innerHTML = "";
    const displayHeaders = [
        "Matricule", 
        "Nom et prénoms", 
        "Fonction", 
        "Niveau"
    ];
    
    const displayNames = [
        "Matricule",
        "Nom et prénom",
        "Fonction",
        "Niveau"
    ];
    
    displayHeaders.forEach((header, idx) => {
        const th = document.createElement("th");
        th.textContent = displayNames[idx];
        tableHeaders.appendChild(th);
    });
    
    const actionTh = document.createElement("th");
    actionTh.textContent = "Actions";
    tableHeaders.appendChild(actionTh);
    
    // Pagination
    const startIdx = (currentPage - 1) * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    const pageEmployees = filteredEmployees.slice(startIdx, endIdx);
    
    // Contenu
    tableBody.innerHTML = "";
    pageEmployees.forEach(emp => {
        const row = document.createElement("tr");
        
        displayHeaders.forEach(header => {
            const td = document.createElement("td");
            let value = emp[header] || "N/A";
            
            // Pour l'âge, ajouter "ans"
            if (header === "Age" && value !== "N/A" && !isNaN(value)) {
                value = `${value} ans`;
            }
            
            td.textContent = value;
            row.appendChild(td);
        });
        
        const actionTd = document.createElement("td");
        actionTd.innerHTML = `
            <button class="btn-action" onclick="viewEmployeeDetails('${emp["Matricule"] || ''}')" aria-label="Voir les détails" title="Voir les détails">
                <span class="btn-action-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                </span>
                <span class="btn-action-text">Voir</span>
            </button>
        `;
        row.appendChild(actionTd);
        tableBody.appendChild(row);
    });
    
    table.style.display = "table";
    updatePaginationInfo();
}

// ========================================
// ANALYTICS CHARTS
// ========================================

function loadAnalyticsCharts() {
    if (allEmployees.length === 0) return;
    
    // Status by Gender Chart
    const statusGenderCtx = document.getElementById('status-gender-chart');
    if (statusGenderCtx && statusGenderChart) {
        statusGenderChart.destroy();
    }
    
    if (statusGenderCtx) {
        const statuses = [...new Set(allEmployees.map(emp => emp["Statut"]).filter(s => s))];
        const maleData = [];
        const femaleData = [];
        
        statuses.forEach(status => {
            let male = 0, female = 0;
            allEmployees.forEach(emp => {
                const empStatus = emp["Statut"];
                const sexe = (emp["Sexe"] || "").toString().trim().toUpperCase();
                if (empStatus === status) {
                    if (sexe === "M" || sexe === "H" || sexe === "HOMME") male++;
                    else if (sexe === "F" || sexe === "FEMME") female++;
                }
            });
            maleData.push(male);
            femaleData.push(female);
        });
        
        statusGenderChart = new Chart(statusGenderCtx, {
            type: 'bar',
            data: {
                labels: statuses,
                datasets: [
                    {
                        label: 'Hommes',
                        data: maleData,
                        backgroundColor: 'rgba(54, 162, 235, 0.5)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Femmes',
                        data: femaleData,
                        backgroundColor: 'rgba(255, 99, 132, 0.5)',
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'top' }
                }
            }
        });
    }
    
    // Department Chart
    const deptCtx = document.getElementById('dept-chart');
    if (deptCtx && deptChart) deptChart.destroy();
    
    if (deptCtx) {
        const deptMap = {};
        allEmployees.forEach(emp => {
            const dept = emp["Rattachement"];
            if (dept && dept !== "") deptMap[dept] = (deptMap[dept] || 0) + 1;
        });
        
        const sortedDepts = Object.entries(deptMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
        
        deptChart = new Chart(deptCtx, {
            type: 'pie',
            data: {
                labels: sortedDepts.map(d => d[0]),
                datasets: [{
                    data: sortedDepts.map(d => d[1]),
                    backgroundColor: [
                        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0',
                        '#9966FF', '#FF9F40', '#FF6384', '#C9CBCF'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'right' }
                }
            }
        });
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
        // Reformater les dates pour les résultats de recherche
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
    const employee = allEmployees.find(emp => emp["Matricule"] === matricule);
    
    if (!employee) {
        showToast("Employé non trouvé", "error");
        return;
    }
    
    const modalBody = document.getElementById("modal-body");
    
    let html = `<h2>${getFieldValueByNormalizedName(employee, "Nom et prénoms") || "N/A"}</h2>`;
    html += '<div class="form-grid">';
    
    // Colonnes à afficher
    const displayFields = [
        "Matricule groupe",
        "Matricule",
        "Fonction",
        "Statut",
        "Niveau",
        "Numéro collabo.",
        "Mail Collabo.",
        "Nom de manager",
        "Numéro manager",
        "Mail manager."
    ];
    
    displayFields.forEach((field) => {
        let value = getFieldValueByNormalizedName(employee, field) || "N/A";
        html += `
            <div class="form-group">
                <label>${field}</label>
                <input type="text" value="${value}" readonly>
            </div>
        `;
    });
    
    html += '</div>';
    modalBody.innerHTML = html;
    
    document.getElementById("employee-modal").classList.add("show");
}

// View collaborator details from search results
function viewCollaboratorDetails(matricule) {
    // Chercher le collaborateur dans allEmployees
    let collaborator = allEmployees.find(emp => {
        const empMatricule = getFieldValueByNormalizedName(emp, "Matricule");
        return empMatricule === matricule;
    });
    
    if (!collaborator) {
        showToast("Collaborateur non trouvé", "error");
        return;
    }
    
    const modalBody = document.getElementById("modal-body");
    
    let html = `<h2>${getFieldValueByNormalizedName(collaborator, "Nom et prénoms") || "N/A"}</h2>`;
    html += '<div class="form-grid">';
    
    // Mêmes colonnes que viewEmployeeDetails
    const displayFields = [
        "Matricule groupe",
        "Matricule",
        "Fonction",
        "Statut",
        "Niveau",
        "Numéro collabo.",
        "Mail Collabo.",
        "Nom de manager",
        "Numéro manager",
        "Mail manager."
    ];
    
    displayFields.forEach((field) => {
        let value = getFieldValueByNormalizedName(collaborator, field) || "N/A";
        html += `
            <div class="form-group">
                <label>${field}</label>
                <input type="text" value="${value}" readonly>
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
// RECHERCHE COLLABORATEUR (section spéciale)
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

            // Chercher la colonne "Date de naissance" (peut avoir des espaces)
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

            // Chercher la colonne "Date d'embauche"
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

        console.log("[HRFlow] Recherche collaborateur - échantillon", collaborators.slice(0, 5).map((emp, index) => ({
            index: index + 1,
            matricule: getFieldValueByNormalizedName(emp, "Matricule"),
            nom: getFieldValueByNormalizedName(emp, "Nom et prénoms"),
            rawBirthDate: getFieldValueByNormalizedName(emp, "Date de naissance"),
            parsedBirthInfo: getBirthDateInfo(getFieldValueByNormalizedName(emp, "Date de naissance"))
        })));

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
    
    // Colonnes à afficher dans la table (sans les colonnes débordantes)
    const displayHeaders = [
        "Matricule",
        "Nom et prénoms",
        "Fonction",
        "Niveau"
    ];
    
    // En-têtes
    tableHeaders.innerHTML = "";
    displayHeaders.forEach((header) => {
        const th = document.createElement("th");
        th.textContent = header;
        tableHeaders.appendChild(th);
    });
    
    // Ajouter colonne Actions
    const actionTh = document.createElement("th");
    actionTh.textContent = "Actions";
    tableHeaders.appendChild(actionTh);
    
    // Contenu
    tableBody.innerHTML = "";
    collaborators.forEach(collab => {
        const row = document.createElement("tr");
        
        displayHeaders.forEach(header => {
            const td = document.createElement("td");
            
            // Chercher la colonne correspondante (avec ou sans espaces)
            let value = null;
            for (const key in collab) {
                if (key.trim().toLowerCase() === header.toLowerCase()) {
                    value = collab[key];
                    break;
                }
            }
            
            if (value === null || value === undefined) {
                value = "N/A";
            } else {
                // Formater la date de naissance si elle existe
                if (header.toLowerCase() === "date de naissance" && value !== "N/A") {
                    value = formatDate(value);
                }
            }
            
            td.textContent = value;
            row.appendChild(td);
        });
        
        // Ajouter bouton Voir
        const actionTd = document.createElement("td");
        const matricule = getFieldValueByNormalizedName(collab, "Matricule") || "";
        actionTd.innerHTML = `
            <button class="btn-action" onclick="viewCollaboratorDetails('${matricule}')" aria-label="Voir les détails" title="Voir les détails">
                <span class="btn-action-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                </span>
                <span class="btn-action-text">Voir</span>
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