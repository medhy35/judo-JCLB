// src/services/dataService.js
const fs = require('fs');
const path = require('path');

class DataService {
    constructor() {
        this.dataDir = path.join(__dirname, '../../data');
        this.files = {
            tatamis: 'tatamis.json',
            equipes: 'equipes.json',
            combattants: 'combattants.json',
            combats: 'combats.json',
            config: 'config.json',
            poules: 'poules.json',
            tableau: 'tableau.json',
            logs: 'logs.json'
        };

        // Vérifier que le dossier data existe
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }

        // Initialiser les fichiers s'ils n'existent pas
        this.initializeFiles();
    }

    /**
     * Initialise les fichiers JSON avec des structures par défaut
     */
    initializeFiles() {
        const defaultData = {
            tatamis: [],
            equipes: [],
            combattants: [],
            combats: [],
            poules: [],
            tableau: { huitieme: [], quart: [], demi: [], finale: [] },
            logs: [],
            config: {
                combatDuration: 240,
                enableGoldenScore: true,
                osaekomi: { yuko: 10, wazari: 15, ippon: 20 },
                thresholds: { wazariForIppon: 2, shidoForDefeat: 3 },
                points: { ippon: 10, wazari: 7, yuko: 1 }
            }
        };

        Object.entries(this.files).forEach(([key, filename]) => {
            const filePath = path.join(this.dataDir, filename);
            if (!fs.existsSync(filePath)) {
                this.writeFile(key, defaultData[key]);
            }
        });
    }

    /**
     * Lit un fichier JSON et retourne son contenu
     * @param {string} fileKey - Clé du fichier (tatamis, equipes, etc.)
     * @returns {any} Contenu du fichier parsé
     */
    readFile(fileKey) {
        if (!this.files[fileKey]) {
            throw new Error(`Fichier non reconnu: ${fileKey}`);
        }

        const filePath = path.join(this.dataDir, this.files[fileKey]);

        try {
            if (!fs.existsSync(filePath)) {
                console.warn(`Fichier ${filePath} n'existe pas, retour d'un tableau vide`);
                return Array.isArray(this.getDefaultData(fileKey)) ? [] : {};
            }

            const content = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            console.error(`Erreur lors de la lecture de ${filePath}:`, error);
            return Array.isArray(this.getDefaultData(fileKey)) ? [] : {};
        }
    }

    /**
     * Écrit des données dans un fichier JSON
     * @param {string} fileKey - Clé du fichier
     * @param {any} data - Données à écrire
     */
    writeFile(fileKey, data) {
        if (!this.files[fileKey]) {
            throw new Error(`Fichier non reconnu: ${fileKey}`);
        }

        const filePath = path.join(this.dataDir, this.files[fileKey]);

        try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        } catch (error) {
            console.error(`Erreur lors de l'écriture de ${filePath}:`, error);
            throw error;
        }
    }

    /**
     * Retourne les données par défaut pour un type de fichier
     * @param {string} fileKey
     * @returns {any}
     */
    getDefaultData(fileKey) {
        const defaults = {
            tatamis: [],
            equipes: [],
            combattants: [],
            combats: [],
            poules: [],
            logs: [],
            tableau: { huitieme: [], quart: [], demi: [], finale: [] },
            config: {
                combatDuration: 240,
                enableGoldenScore: true,
                osaekomi: { yuko: 10, wazari: 15, ippon: 20 },
                thresholds: { wazariForIppon: 2, shidoForDefeat: 3 },
                points: { ippon: 10, wazari: 7, yuko: 1 }
            }
        };

        return defaults[fileKey] || [];
    }

    // === MÉTHODES SPÉCIALISÉES ===

    /**
     * Trouve un élément par ID dans une collection
     * @param {string} fileKey
     * @param {number|string} id
     * @returns {Object|null}
     */
    findById(fileKey, id) {
        const data = this.readFile(fileKey);
        if (!Array.isArray(data)) return null;

        return data.find(item =>
            item.id === id ||
            item.id === +id ||
            item.id === String(id)
        ) || null;
    }

    /**
     * Trouve plusieurs éléments selon un critère
     * @param {string} fileKey
     * @param {Function} predicate
     * @returns {Array}
     */
    findMany(fileKey, predicate) {
        const data = this.readFile(fileKey);
        if (!Array.isArray(data)) return [];

        return data.filter(predicate);
    }

    /**
     * Ajoute un nouvel élément
     * @param {string} fileKey
     * @param {Object} item
     * @returns {Object} L'élément ajouté
     */
    add(fileKey, item) {
        const data = this.readFile(fileKey);
        if (!Array.isArray(data)) {
            throw new Error(`Impossible d'ajouter à ${fileKey}: ce n'est pas un tableau`);
        }

        // Générer un ID si pas présent
        if (!item.id) {
            item.id = this.generateId();
        }

        data.push(item);
        this.writeFile(fileKey, data);

        return item;
    }

    /**
     * Met à jour un élément existant
     * @param {string} fileKey
     * @param {number|string} id
     * @param {Object} updates
     * @returns {Object|null} L'élément mis à jour ou null si non trouvé
     */
    update(fileKey, id, updates) {
        const data = this.readFile(fileKey);
        if (!Array.isArray(data)) return null;

        const index = data.findIndex(item =>
            item.id === id ||
            item.id === +id ||
            item.id === String(id)
        );

        if (index === -1) return null;

        // Fusionner les mises à jour
        Object.assign(data[index], updates);

        this.writeFile(fileKey, data);
        return data[index];
    }

    /**
     * Supprime un élément par ID
     * @param {string} fileKey
     * @param {number|string} id
     * @returns {boolean} true si supprimé, false si non trouvé
     */
    remove(fileKey, id) {
        const data = this.readFile(fileKey);
        if (!Array.isArray(data)) return false;

        const initialLength = data.length;
        const filteredData = data.filter(item =>
            item.id !== id &&
            item.id !== +id &&
            item.id !== String(id)
        );

        if (filteredData.length === initialLength) {
            return false; // Aucun élément supprimé
        }

        this.writeFile(fileKey, filteredData);
        return true;
    }

    /**
     * Génère un ID unique basé sur timestamp
     * @returns {number}
     */
    generateId() {
        return Date.now() + Math.floor(Math.random() * 1000);
    }

    /**
     * Exporte toutes les données
     * @returns {Object} Toutes les données
     */
    exportAll() {
        const exportData = {};
        Object.keys(this.files).forEach(key => {
            exportData[key] = this.readFile(key);
        });
        return exportData;
    }

    /**
     * Importe toutes les données (remplace l'existant)
     * @param {Object} data
     */
    importAll(data) {
        Object.keys(this.files).forEach(key => {
            if (data[key] !== undefined) {
                this.writeFile(key, data[key]);
            }
        });
    }

    /**
     * Remet à zéro toutes les données (sauf config)
     */
    resetAll() {
        Object.keys(this.files).forEach(key => {
            if (key !== 'config') {
                this.writeFile(key, this.getDefaultData(key));
            }
        });
    }

    // === MÉTHODES SPÉCIFIQUES AU MÉTIER ===

    /**
     * Récupère les combats d'un tatami
     * @param {number} tatamiId
     * @returns {Array}
     */
    getTatamiCombats(tatamiId) {
        const tatami = this.findById('tatamis', tatamiId);
        if (!tatami || !tatami.combatsIds) return [];

        const combats = this.readFile('combats');
        return tatami.combatsIds
            .map(id => combats.find(c => c.id === id))
            .filter(Boolean);
    }

    /**
     * Récupère les combattants d'une équipe
     * @param {string} equipeId
     * @returns {Array}
     */
    getEquipeCombattants(equipeId) {
        return this.findMany('combattants', c => c.equipeId === equipeId);
    }

    /**
     * Ajoute un log avec timestamp
     * @param {string} message
     * @param {Object} data
     */
    addLog(message, data = {}) {
        const logEntry = {
            id: this.generateId(),
            message,
            data,
            timestamp: new Date().toISOString()
        };

        this.add('logs', logEntry);
        console.log('[LOG]', message, data);
    }
}

module.exports = new DataService();