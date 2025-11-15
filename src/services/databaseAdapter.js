// src/services/databaseAdapter.js
const postgresService = require('./postgresService');
const jsonDataService = require('./dataService'); // Votre ancien service JSON
const configService = require('./configService');
const dotenv = require('dotenv');
dotenv.config();
/**
 * Adaptateur qui permet de basculer entre JSON et PostgreSQL
 * sans modifier le code existant
 */
class DatabaseAdapter {
    constructor() {
        // Par défaut, utiliser JSON (pour la rétrocompatibilité)
        this.usePostgres = process.env.USE_POSTGRES === 'true' || false;
        this.service = null;
        this.isInitialized = false;
    }

    /**
     * Initialise l'adaptateur
     */
    async init() {
        if (this.usePostgres) {
            console.log('🐘 Mode PostgreSQL activé');
            const result = await postgresService.init({
                host: process.env.DB_HOST,
                port: process.env.DB_PORT,
                database: process.env.DB_NAME,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD
            });

            if (result.success) {
                this.service = postgresService;
                this.isInitialized = true;
                console.log('✅ PostgreSQL initialisé');
            } else {
                console.error('❌ Erreur PostgreSQL, retour au mode JSON');
                this.usePostgres = false;
                this.service = jsonDataService;
                this.isInitialized = true;
            }
        } else {
            console.log('📁 Mode JSON activé');
            this.service = jsonDataService;
            this.isInitialized = true;
        }
    }

    /**
     * Bascule vers PostgreSQL
     */
    async switchToPostgres() {
        this.usePostgres = true;
        await this.init();
    }

    /**
     * Bascule vers JSON
     */
    switchToJson() {
        this.usePostgres = false;
        this.service = jsonDataService;
    }

    // =========================================
    // MÉTHODES ÉQUIPES
    // =========================================

    async getAllEquipes() {
        if (this.usePostgres) {
            return await this.service.getAllEquipes();
        } else {
            return this.service.readFile('equipes');
        }
    }

    async getEquipeById(id) {
        if (this.usePostgres) {
            return await this.service.getEquipeById(id);
        } else {
            return this.service.findById('equipes', id);
        }
    }

    async createEquipe(equipe) {
        if (this.usePostgres) {
            return await this.service.createEquipe(equipe);
        } else {
            return this.service.add('equipes', {
                ...equipe,
                dateCreation: new Date().toISOString(),
                victoires: 0,
                points: 0,
                scoreGlobal: 0
            });
        }
    }

    async updateEquipe(id, updates) {
        if (this.usePostgres) {
            return await this.service.updateEquipe(id, updates);
        } else {
            return this.service.update('equipes', id, updates);
        }
    }

    async deleteEquipe(id) {
        if (this.usePostgres) {
            return await this.service.deleteEquipe(id);
        } else {
            return this.service.remove('equipes', id);
        }
    }

    // =========================================
    // MÉTHODES COMBATTANTS
    // =========================================

    async getAllCombattants() {
        if (this.usePostgres) {
            return await this.service.getAllCombattants();
        } else {
            return this.service.readFile('combattants');
        }
    }

    async getCombattantById(id) {
        if (this.usePostgres) {
            return await this.service.getCombattantById(id);
        } else {
            return this.service.findById('combattants', id);
        }
    }

    async createCombattant(combattant) {
        if (this.usePostgres) {
            return await this.service.createCombattant(combattant);
        } else {
            return this.service.add('combattants', {
                ...combattant,
                dateCreation: new Date().toISOString()
            });
        }
    }

    async updateCombattant(id, updates) {
        if (this.usePostgres) {
            return await this.service.updateCombattant(id, updates);
        } else {
            return this.service.update('combattants', id, updates);
        }
    }

    async deleteCombattant(id) {
        if (this.usePostgres) {
            return await this.service.deleteCombattant(id);
        } else {
            return this.service.remove('combattants', id);
        }
    }

    async getCombattantsByEquipe(equipeId) {
        if (this.usePostgres) {
            return await this.service.getCombattantsByEquipe(equipeId);
        } else {
            return this.service.getEquipeCombattants(equipeId);
        }
    }

    async getCombattantsByCategorie(sexe, poids) {
        if (this.usePostgres) {
            return await this.service.getCombattantsByCategorie(sexe, poids);
        } else {
            let combattants = this.service.readFile('combattants');
            if (sexe) combattants = combattants.filter(c => c.sexe === sexe);
            if (poids) combattants = combattants.filter(c => c.poids === poids);
            return combattants;
        }
    }

    // =========================================
    // MÉTHODES TATAMIS
    // =========================================

    async getAllTatamis() {
        if (this.usePostgres) {
            return await this.service.getAllTatamis();
        } else {
            return this.service.readFile('tatamis');
        }
    }

    async getTatamiById(id) {
        if (this.usePostgres) {
            return await this.service.getTatamiById(id);
        } else {
            return this.service.findById('tatamis', id);
        }
    }

    async createTatami(tatami) {
        if (this.usePostgres) {
            return await this.service.createTatami(tatami);
        } else {
            return this.service.add('tatamis', {
                ...tatami,
                etat: tatami.etat || 'libre',
                combatsIds: [],
                indexCombatActuel: 0,
                dateCreation: new Date().toISOString(),
                historique: [],
                scoreConfrontation: { rouge: 0, bleu: 0 }
            });
        }
    }

    async updateTatami(id, updates) {
        if (this.usePostgres) {
            return await this.service.updateTatami(id, updates);
        } else {
            return this.service.update('tatamis', id, updates);
        }
    }

    async deleteTatami(id) {
        if (this.usePostgres) {
            return await this.service.deleteTatami(id);
        } else {
            return this.service.remove('tatamis', id);
        }
    }

    // =========================================
    // MÉTHODES COMBATS
    // =========================================

    async getAllCombats() {
        if (this.usePostgres) {
            return await this.service.getAllCombats();
        } else {
            return this.service.readFile('combats');
        }
    }

    async getCombatById(id) {
        if (this.usePostgres) {
            return await this.service.getCombatById(id);
        } else {
            return this.service.findById('combats', id);
        }
    }

    async createCombat(combat) {
        if (this.usePostgres) {
            return await this.service.createCombat(combat);
        } else {
            return this.service.add('combats', {
                ...combat,
                id: combat.id || this.generateId(),
                dateCreation: new Date().toISOString()
            });
        }
    }

    async updateCombat(id, updates) {
        if (this.usePostgres) {
            return await this.service.updateCombat(id, updates);
        } else {
            return this.service.update('combats', id, updates);
        }
    }

    async deleteCombat(id) {
        if (this.usePostgres) {
            return await this.service.deleteCombat(id);
        } else {
            return this.service.remove('combats', id);
        }
    }

    // =========================================
    // MÉTHODES POULES
    // =========================================

    async getAllPoules() {
        if (this.usePostgres) {
            return await this.service.getAllPoules();
        } else {
            return this.service.readFile('poules');
        }
    }

    async getPouleById(id) {
        if (this.usePostgres) {
            return await this.service.getPouleById(id);
        } else {
            return this.service.findById('poules', id);
        }
    }

    async createPoules(poules) {
        if (this.usePostgres) {
            return await this.service.createPoules(poules);
        } else {
            this.service.writeFile('poules', poules);
            return poules;
        }
    }

    async deleteAllPoules() {
        if (this.usePostgres) {
            return await this.service.deleteAllPoules();
        } else {
            this.service.writeFile('poules', []);
            return true;
        }
    }

    async updatePoule(id, updates) {
        if (this.usePostgres) {
            // TODO: implémenter dans postgresService
            return null;
        } else {
            return this.service.update('poules', id, updates);
        }
    }

    async updateClassementPoule(pouleId, classement) {
        if (this.usePostgres) {
            return await this.service.updateClassementPoule(pouleId, classement);
        } else {
            const poule = this.service.findById('poules', pouleId);
            if (poule) {
                poule.classement = classement;
                poule.derniereMiseAJour = new Date().toISOString();
                return this.service.update('poules', pouleId, poule);
            }
            return null;
        }
    }

    // =========================================
    // MÉTHODES LOGS
    // =========================================

    async addLog(message, data = {}) {
        if (this.usePostgres) {
            return await this.service.addLog(message, data);
        } else {
            this.service.addLog(message, data);
        }
    }

    async getAllLogs(limit = 100) {
        if (this.usePostgres) {
            return await this.service.getAllLogs(limit);
        } else {
            const logs = this.service.readFile('logs');
            return logs.slice(-limit);
        }
    }

    // =========================================
    // UTILITAIRES
    // =========================================

    generateId() {
        return Date.now() + Math.floor(Math.random() * 1000);
    }

    async exportAll() {
        if (this.usePostgres) {
            return await this.service.exportAll();
        } else {
            return this.service.exportAll();
        }
    }

    /**
     * Méthodes spécifiques au JSON (compatibilité)
     */
    readFile(fileKey) {
        if (this.usePostgres) {
            console.warn('readFile() appelé en mode PostgreSQL, utiliser les méthodes spécifiques');
            return [];
        }
        return this.service.readFile(fileKey);
    }

    writeFile(fileKey, data) {
        if (this.usePostgres) {
            console.warn('writeFile() appelé en mode PostgreSQL, opération ignorée');
            return;
        }
        return this.service.writeFile(fileKey, data);
    }

    findById(fileKey, id) {
        if (this.usePostgres) {
            console.warn('findById() appelé en mode PostgreSQL, utiliser les méthodes spécifiques');
            return null;
        }
        return this.service.findById(fileKey, id);
    }

    update(fileKey, id, updates) {
        if (this.usePostgres) {
            console.warn('update() appelé en mode PostgreSQL, utiliser les méthodes spécifiques');
            return null;
        }
        return this.service.update(fileKey, id, updates);
    }

    add(fileKey, item) {
        if (this.usePostgres) {
            console.warn('add() appelé en mode PostgreSQL, utiliser les méthodes spécifiques');
            return null;
        }
        return this.service.add(fileKey, item);
    }

    remove(fileKey, id) {
        if (this.usePostgres) {
            console.warn('remove() appelé en mode PostgreSQL, utiliser les méthodes spécifiques');
            return false;
        }
        return this.service.remove(fileKey, id);
    }

    findMany(fileKey, predicate) {
        if (this.usePostgres) {
            console.warn('findMany() appelé en mode PostgreSQL');
            return [];
        }
        return this.service.findMany(fileKey, predicate);
    }

    getEquipeCombattants(equipeId) {
        return this.getCombattantsByEquipe(equipeId);
    }
}

// Singleton
const adapter = new DatabaseAdapter();

module.exports = adapter;