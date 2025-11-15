// src/services/configService.js
const fs = require('fs');
const path = require('path');

class ConfigService {
    constructor() {
        this.configPath = path.join(__dirname, '../../data/config.json');
        this.config = null;
        this.defaultConfig = this.getDefaultConfig();
        this.loadConfig();
    }

    /**
     * Configuration par défaut si le fichier n'existe pas
     */
    getDefaultConfig() {
        return {
            app: {
                name: "Système de Gestion Tournoi Judo",
                version: "1.0.0",
                environment: "development",
                port: 3000,
                maxUploadSize: "10mb",
                timezone: "Europe/Paris"
            },
            combat: {
                dureeParDefaut: 240,
                dureeGoldenScore: 180,
                enableGoldenScore: true,
                pauseEntreRounds: 60,
                tempsPreparation: 30,
                osaekomi: {
                    yuko: 5,
                    wazari: 10,
                    ippon: 20
                },
                thresholds: {
                    wazariForIppon: 2,
                    shidoForDefeat: 3,
                    maxShido: 3
                },
                points: {
                    ippon: 100,
                    wazari: 10,
                    yuko: 1,
                    victoire: 1,
                    defaite: 0,
                    egalite: 0
                }
            },
            poules: {
                maxEquipesParPoule: 10,
                minEquipesParPoule: 2,
                typeRencontre: "round-robin",
                pointsVictoire: 1,
                pointsDefaite: 0,
                pointsEgalite: 0
            },
            tableau: {
                phases: ["seizieme", "huitieme", "quart", "demi", "finale"],
                enablePetiteFinale: false,
                melangementAleatoire: true
            },
            tatamis: {
                nombreMax: 10,
                autoLiberation: false,
                delaiAutoLiberation: 300,
                affichagePublic: true
            },
            equipes: {
                minCombattantsParEquipe: 1,
                maxCombattantsParEquipe: 20,
                categoriesObligatoires: [
                    "M-60", "M-66", "M-73", "M-81", "M-90", "M+90",
                    "F-48", "F-52", "F-57", "F-63", "F-70", "F+70"
                ]
            },
            combattants: {
                categoriesPoids: {
                    masculin: ["-60", "-66", "-73", "-81", "-90", "+90"],
                    feminin: ["-48", "-52", "-57", "-63", "-70", "+70"]
                },
                ceintures: ["blanche", "jaune", "orange", "verte", "bleue", "marron", "noire"]
            },
            websockets: {
                enabled: true,
                heartbeatInterval: 30000,
                reconnectAttempts: 5,
                reconnectDelay: 3000,
                broadcastStats: true
            },
            database: {
                autoSave: true,
                autoSaveInterval: 60000,
                backupEnabled: true,
                backupInterval: 3600000,
                maxBackups: 10
            },
            display: {
                refreshInterval: 1000,
                showTimer: true,
                showScores: true,
                showClassement: true,
                animationsEnabled: true,
                theme: "default"
            },
            security: {
                enableCORS: true,
                allowedOrigins: ["*"],
                rateLimit: {
                    enabled: false,
                    windowMs: 900000,
                    max: 100
                }
            },
            logs: {
                maxEntries: 1000,
                level: "info",
                saveToFile: false,
                retentionDays: 30
            }
        };
    }

    /**
     * Charge la configuration depuis le fichier
     */
    loadConfig() {
        try {
            if (!fs.existsSync(this.configPath)) {
                console.warn('Fichier config.json non trouvé, utilisation de la config par défaut');
                this.config = this.defaultConfig;
                this.saveConfig();
                return;
            }

            const fileContent = fs.readFileSync(this.configPath, 'utf-8');
            this.config = JSON.parse(fileContent);

            // Merge avec la config par défaut pour les clés manquantes
            this.config = this.mergeDeep(this.defaultConfig, this.config);

            console.log('✅ Configuration chargée avec succès');
        } catch (error) {
            console.error('Erreur chargement config:', error);
            this.config = this.defaultConfig;
        }
    }

    /**
     * Sauvegarde la configuration dans le fichier
     */
    saveConfig() {
        try {
            const dir = path.dirname(this.configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(
                this.configPath,
                JSON.stringify(this.config, null, 2),
                'utf-8'
            );
            console.log('✅ Configuration sauvegardée');
        } catch (error) {
            console.error('Erreur sauvegarde config:', error);
            throw error;
        }
    }

    /**
     * Fusionne récursivement deux objets
     */
    mergeDeep(target, source) {
        const output = { ...target };

        if (this.isObject(target) && this.isObject(source)) {
            Object.keys(source).forEach(key => {
                if (this.isObject(source[key])) {
                    if (!(key in target)) {
                        output[key] = source[key];
                    } else {
                        output[key] = this.mergeDeep(target[key], source[key]);
                    }
                } else {
                    output[key] = source[key];
                }
            });
        }

        return output;
    }

    /**
     * Vérifie si une valeur est un objet
     */
    isObject(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    }

    /**
     * Récupère toute la configuration
     */
    getAll() {
        return { ...this.config };
    }

    /**
     * Récupère une valeur de configuration par chemin
     * @param {string} path - Chemin séparé par des points (ex: 'combat.dureeParDefaut')
     * @param {any} defaultValue - Valeur par défaut si non trouvée
     */
    get(path, defaultValue = null) {
        const keys = path.split('.');
        let value = this.config;

        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return defaultValue;
            }
        }

        return value;
    }

    /**
     * Définit une valeur de configuration
     * @param {string} path - Chemin séparé par des points
     * @param {any} value - Nouvelle valeur
     */
    set(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        let obj = this.config;

        for (const key of keys) {
            if (!(key in obj)) {
                obj[key] = {};
            }
            obj = obj[key];
        }

        obj[lastKey] = value;
        this.saveConfig();
    }

    /**
     * Met à jour plusieurs valeurs de configuration
     * @param {Object} updates - Objet avec les mises à jour
     */
    update(updates) {
        this.config = this.mergeDeep(this.config, updates);
        this.saveConfig();
    }

    /**
     * Réinitialise la configuration aux valeurs par défaut
     */
    reset() {
        this.config = this.getDefaultConfig();
        this.saveConfig();
    }

    /**
     * Valide la configuration actuelle
     */
    validate() {
        const errors = [];

        // Validation de la durée des combats
        if (this.config.combat.dureeParDefaut < 60 || this.config.combat.dureeParDefaut > 600) {
            errors.push('Durée de combat invalide (60-600 secondes)');
        }

        // Validation des seuils osaekomi
        const { yuko, wazari, ippon } = this.config.combat.osaekomi;
        if (yuko >= wazari || wazari >= ippon) {
            errors.push('Seuils osaekomi incohérents (yuko < wazari < ippon)');
        }

        // Validation des poules
        if (this.config.poules.minEquipesParPoule < 2) {
            errors.push('Minimum 2 équipes par poule requis');
        }

        // Validation des tatamis
        if (this.config.tatamis.nombreMax < 1 || this.config.tatamis.nombreMax > 20) {
            errors.push('Nombre de tatamis invalide (1-20)');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Récupère la config des combats (raccourci fréquent)
     */
    getCombatConfig() {
        return this.config.combat;
    }

    /**
     * Récupère la config des points (raccourci fréquent)
     */
    getPointsConfig() {
        return this.config.combat.points;
    }

    /**
     * Récupère la config osaekomi (raccourci fréquent)
     */
    getOsaekomoConfig() {
        return this.config.combat.osaekomi;
    }

    /**
     * Récupère la config des seuils (raccourci fréquent)
     */
    getThresholdsConfig() {
        return this.config.combat.thresholds;
    }

    /**
     * Vérifie si une fonctionnalité est activée
     */
    isEnabled(feature) {
        const featureMap = {
            'golden-score': 'combat.enableGoldenScore',
            'websockets': 'websockets.enabled',
            'auto-save': 'database.autoSave',
            'backup': 'database.backupEnabled',
            'rate-limit': 'security.rateLimit.enabled'
        };

        const path = featureMap[feature];
        return path ? this.get(path, false) : false;
    }

    /**
     * Export de la configuration pour sauvegarde
     */
    export() {
        return {
            config: this.config,
            timestamp: new Date().toISOString(),
            version: this.config.app.version
        };
    }

    /**
     * Import d'une configuration
     */
    import(configData) {
        try {
            if (configData.config) {
                this.config = this.mergeDeep(this.defaultConfig, configData.config);
                this.saveConfig();
                return { success: true };
            } else {
                return { success: false, error: 'Format de configuration invalide' };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

// Singleton
module.exports = new ConfigService();