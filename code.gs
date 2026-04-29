// Configuration
const SHEET_ID = "18n5KEQUAqL-tL6z0rXQDf_HLAfjWTdTwNb3zeGQ-oWs";
const SHEET_NAME = "personne";

/**
 * Récupère toutes les données des employés
 */
function doGet(e) {
  try {
    const action = e.parameter.action || "all";
    
    if (action === "all") {
      return getAllEmployees();
    } else if (action === "search") {
      const query = e.parameter.query || "";
      return searchEmployees(query);
    } else if (action === "getById") {
      const matricule = e.parameter.matricule || "";
      return getEmployeeByMatricule(matricule);
    }
    
    return sendResponse(false, "Action non reconnue", null);
  } catch (error) {
    return sendResponse(false, error.toString(), null);
  }
}

/**
 * Gère les requêtes POST (créer, modifier, supprimer)
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    if (action === "create") {
      return createEmployee(data);
    } else if (action === "update") {
      return updateEmployee(data);
    } else if (action === "delete") {
      return deleteEmployee(data.matricule);
    }
    
    return sendResponse(false, "Action non reconnue", null);
  } catch (error) {
    return sendResponse(false, error.toString(), null);
  }
}

/**
 * Normalise les noms de colonnes
 */
function normalizeHeaderName(header) {
  return header
    .toString()
    .trim()
    .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
    .replace(/^\s+|\s+$/g, '');  // Remove leading/trailing spaces
}

/**
 * Récupère tous les employés
 */
function getAllEmployees() {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    
    if (data.length === 0) {
      return sendResponse(false, "Aucune donnée trouvée", []);
    }
    
    // Première ligne = en-têtes (normalisés)
    const headers = data[0].map(h => normalizeHeaderName(h));
    Logger.log("Headers normalisés: " + headers.join(", "));
    
    const employees = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const employee = {};
      
      headers.forEach((header, index) => {
        employee[header] = row[index] || "";
      });
      
      employees.push(employee);
    }
    
    return sendResponse(true, "Données récupérées avec succès", employees);
  } catch (error) {
    return sendResponse(false, error.toString(), null);
  }
}

/**
 * Recherche des employés par nom, matricule ou fonction
 */
function searchEmployees(query) {
  try {
    if (!query || query.trim() === "") {
      return getAllEmployees();
    }
    
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    
    const headers = data[0].map(h => normalizeHeaderName(h));
    const employees = [];
    const lowerQuery = query.toLowerCase();
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const employee = {};
      let match = false;
      
      headers.forEach((header, index) => {
        const value = (row[index] || "").toString().toLowerCase();
        employee[header] = row[index] || "";
        
        if (value.includes(lowerQuery)) {
          match = true;
        }
      });
      
      if (match) {
        employees.push(employee);
      }
    }
    
    return sendResponse(true, employees.length + " employé(s) trouvé(s)", employees);
  } catch (error) {
    return sendResponse(false, error.toString(), null);
  }
}

/**
 * Récupère un employé par son matricule
 */
function getEmployeeByMatricule(matricule) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    
    const headers = data[0].map(h => normalizeHeaderName(h));
    const matriculeIndex = headers.findIndex(h => h.toLowerCase() === "matricule");
    
    if (matriculeIndex === -1) {
      return sendResponse(false, "Colonne 'Matricule' non trouvée", null);
    }
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][matriculeIndex] === matricule) {
        const employee = {};
        headers.forEach((header, index) => {
          employee[header] = data[i][index] || "";
        });
        return sendResponse(true, "Employé trouvé", employee);
      }
    }
    
    return sendResponse(false, "Employé non trouvé", null);
  } catch (error) {
    return sendResponse(false, error.toString(), null);
  }
}

/**
 * Crée un nouvel employé
 */
function createEmployee(employeeData) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => normalizeHeaderName(h));
    
    const newRow = [];
    headers.forEach(header => {
      newRow.push(employeeData[header] || "");
    });
    
    sheet.appendRow(newRow);
    return sendResponse(true, "Employé créé avec succès", employeeData);
  } catch (error) {
    return sendResponse(false, error.toString(), null);
  }
}


/**
 * Met à jour les données d'un employé
 */
function updateEmployee(employeeData) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => normalizeHeaderName(h));
    
    const matriculeIndex = headers.findIndex(h => h.toLowerCase() === "matricule");
    if (matriculeIndex === -1) {
      return sendResponse(false, "Colonne 'Matricule' non trouvée", null);
    }
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][matriculeIndex] === employeeData.Matricule) {
        headers.forEach((header, index) => {
          const key = header;
          if (employeeData[key] !== undefined) {
            sheet.getRange(i + 1, index + 1).setValue(employeeData[key]);
          }
        });
        return sendResponse(true, "Employé mis à jour avec succès", employeeData);
      }
    }
    
    return sendResponse(false, "Employé non trouvé", null);
  } catch (error) {
    return sendResponse(false, error.toString(), null);
  }
}


/**
 * Supprime un employé par son matricule
 */
function deleteEmployee(matricule) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(h => normalizeHeaderName(h));
    
    const matriculeIndex = headers.findIndex(h => h.toLowerCase() === "matricule");
    if (matriculeIndex === -1) {
      return sendResponse(false, "Colonne 'Matricule' non trouvée", null);
    }
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][matriculeIndex] === matricule) {
        sheet.deleteRow(i + 1);
        return sendResponse(true, "Employé supprimé avec succès", { matricule });
      }
    }
    
    return sendResponse(false, "Employé non trouvé", null);
  } catch (error) {
    return sendResponse(false, error.toString(), null);
  }
}


/**
 * Fonction utilitaire pour envoyer les réponses
 */
function sendResponse(success, message, data) {
  const output = ContentService.createTextOutput(
    JSON.stringify({
      success: success,
      message: message,
      data: data
    })
  );
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}