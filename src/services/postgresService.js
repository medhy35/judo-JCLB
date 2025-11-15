// src/services/postgresService.js
const { Pool } = require('pg');
const configService = require('./configService');
const dotenv = require('dotenv');
dotenv.config();

class PostgresService {
    constructor() {
        this.pool = null;
        this.isConnected = false;
    }

    /**
     * Initialise la connexion à PostgreSQL
     * @param {Object} config - Configuration de connexion
     */
    async init(config = {}) {
        const dbConfig = {
            host: config.host || process.env.DB_HOST || 'localhost',
            port: config.port || process.env.DB_PORT || 5432,
            database: config.database || process.env.DB_NAME || 'judo_tournament',
            user: config.user || process.env.DB_USER || 'postgres',
            password: config.password || process.env.DB_PASSWORD || '',
            max: config.max || 20, // Nombre max de connexions dans le pool
            idleTimeoutMillis: config.idleTimeoutMillis || 30000,
            connectionTimeoutMillis: config.connectionTimeoutMillis || 2000,
        };

        this.pool = new Pool(dbConfig);

        // Gestionnaire d'erreur
        this.pool.on('error', (err) => {
            console.error('Erreur PostgreSQL inattendue:', err);
        });

        try {
            // Test de connexion
            const client = await this.pool.connect();
            console.log('✅ Connexion PostgreSQL établie');
            client.release();
            this.isConnected = true;
            return { success: true };
        } catch (error) {
            console.error('❌ Erreur connexion PostgreSQL:', error.message);
            this.isConnected = false;
            return { success: false, error: error.message };
        }
    }

    /**
     * Exécute une requête SQL
     * @param {string} query - Requête SQL
     * @param {Array} params - Paramètres de la requête
     */
    async query(query, params = []) {
        if (!this.isConnected) {
            throw new Error('Base de données non connectée');
        }

        try {
            const result = await this.pool.query(query, params);
            return result;
        } catch (error) {
            console.error('Erreur requête SQL:', error.message);
            console.error('Query:', query);
            console.error('Params:', params);
            throw error;
        }
    }

    /**
     * Démarre une transaction
     */
    async beginTransaction() {
        const client = await this.pool.connect();
        await client.query('BEGIN');
        return client;
    }

    /**
     * Commit une transaction
     */
    async commitTransaction(client) {
        await client.query('COMMIT');
        client.release();
    }

    /**
     * Rollback une transaction
     */
    async rollbackTransaction(client) {
        await client.query('ROLLBACK');
        client.release();
    }

    // =============================================
    // MÉTHODES ÉQUIPES
    // =============================================

    async getAllEquipes() {
        const result = await this.query('SELECT * FROM equipes ORDER BY nom');
        return result.rows;
    }

    async getEquipeById(id) {
        const result = await this.query('SELECT * FROM equipes WHERE id = $1', [id]);
        return result.rows[0] || null;
    }

    async createEquipe(equipe) {
        const { id, nom, couleur } = equipe;
        const result = await this.query(
            `INSERT INTO equipes (id, nom, couleur, victoires, points, score_global)
             VALUES ($1, $2, $3, 0, 0, 0)
             RETURNING *`,
            [id, nom, couleur || 'primary']
        );
        return result.rows[0];
    }

    async updateEquipe(id, updates) {
        const fields = [];
        const values = [];
        let paramIndex = 1;

        Object.entries(updates).forEach(([key, value]) => {
            fields.push(`${this.camelToSnake(key)} = $${paramIndex}`);
            values.push(value);
            paramIndex++;
        });

        if (fields.length === 0) return null;

        values.push(id);
        const result = await this.query(
            `UPDATE equipes SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
            values
        );
        return result.rows[0] || null;
    }

    async deleteEquipe(id) {
        const result = await this.query('DELETE FROM equipes WHERE id = $1 RETURNING *', [id]);
        return result.rowCount > 0;
    }

    // =============================================
    // MÉTHODES COMBATTANTS
    // =============================================

    async getAllCombattants() {
        const result = await this.query(`
            SELECT c.*, e.nom as equipe_nom, e.couleur as equipe_couleur
            FROM combattants c
            LEFT JOIN equipes e ON c.equipe_id = e.id
            ORDER BY c.nom
        `);
        return result.rows;
    }

    async getCombattantById(id) {
        const result = await this.query(`
            SELECT c.*, e.nom as equipe_nom, e.couleur as equipe_couleur
            FROM combattants c
            LEFT JOIN equipes e ON c.equipe_id = e.id
            WHERE c.id = $1
        `, [id]);
        return result.rows[0] || null;
    }

    async createCombattant(combattant) {
        const { nom, sexe, poids, equipeId } = combattant;
        const result = await this.query(
            `INSERT INTO combattants (nom, sexe, poids, equipe_id)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [nom, sexe, poids, equipeId]
        );
        return result.rows[0];
    }

    async updateCombattant(id, updates) {
        const fields = [];
        const values = [];
        let paramIndex = 1;

        Object.entries(updates).forEach(([key, value]) => {
            fields.push(`${this.camelToSnake(key)} = $${paramIndex}`);
            values.push(value);
            paramIndex++;
        });

        if (fields.length === 0) return null;

        values.push(id);
        const result = await this.query(
            `UPDATE combattants SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
            values
        );
        return result.rows[0] || null;
    }

    async deleteCombattant(id) {
        const result = await this.query('DELETE FROM combattants WHERE id = $1 RETURNING *', [id]);
        return result.rowCount > 0;
    }

    async getCombattantsByEquipe(equipeId) {
        const result = await this.query(
            'SELECT * FROM combattants WHERE equipe_id = $1 ORDER BY nom',
            [equipeId]
        );
        return result.rows;
    }

    async getCombattantsByCategorie(sexe, poids) {
        let query = 'SELECT c.*, e.nom as equipe_nom FROM combattants c LEFT JOIN equipes e ON c.equipe_id = e.id WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        if (sexe) {
            query += ` AND c.sexe = $${paramIndex}`;
            params.push(sexe);
            paramIndex++;
        }

        if (poids) {
            query += ` AND c.poids = $${paramIndex}`;
            params.push(poids);
        }

        query += ' ORDER BY c.nom';
        const result = await this.query(query, params);
        return result.rows;
    }

    // =============================================
    // MÉTHODES TATAMIS
    // =============================================

    async getAllTatamis() {
        const result = await this.query('SELECT * FROM tatamis ORDER BY id');

        // Récupérer les combats assignés pour chaque tatami
        for (let tatami of result.rows) {
            const combatsResult = await this.query(
                `SELECT combat_id FROM tatamis_combats 
                 WHERE tatami_id = $1 ORDER BY ordre`,
                [tatami.id]
            );
            tatami.combatsIds = combatsResult.rows.map(r => r.combat_id);

            // Récupérer l'historique
            const historiqueResult = await this.query(
                `SELECT timestamp, action, donnees, ancien_index, nouveau_index
                 FROM historique_tatamis 
                 WHERE tatami_id = $1 ORDER BY timestamp DESC LIMIT 50`,
                [tatami.id]
            );
            tatami.historique = historiqueResult.rows;

            // Ajouter scoreConfrontation
            tatami.scoreConfrontation = {
                rouge: tatami.score_rouge || 0,
                bleu: tatami.score_bleu || 0
            };
        }

        return result.rows;
    }

    async getTatamiById(id) {
        const result = await this.query('SELECT * FROM tatamis WHERE id = $1', [id]);
        if (result.rows.length === 0) return null;

        const tatami = result.rows[0];

        // Récupérer les combats assignés
        const combatsResult = await this.query(
            `SELECT combat_id FROM tatamis_combats 
             WHERE tatami_id = $1 ORDER BY ordre`,
            [id]
        );
        tatami.combatsIds = combatsResult.rows.map(r => r.combat_id);

        // Récupérer l'historique
        const historiqueResult = await this.query(
            `SELECT timestamp, action, donnees FROM historique_tatamis 
             WHERE tatami_id = $1 ORDER BY timestamp DESC LIMIT 50`,
            [id]
        );
        tatami.historique = historiqueResult.rows;

        tatami.scoreConfrontation = {
            rouge: tatami.score_rouge || 0,
            bleu: tatami.score_bleu || 0
        };

        return tatami;
    }

    async createTatami(tatami) {
        const { nom, etat } = tatami;
        const result = await this.query(
            `INSERT INTO tatamis (nom, etat, index_combat_actuel, score_rouge, score_bleu)
             VALUES ($1, $2, 0, 0, 0)
             RETURNING *`,
            [nom || 'Tatami', etat || 'libre']
        );

        const newTatami = result.rows[0];
        newTatami.combatsIds = [];
        newTatami.historique = [];
        newTatami.scoreConfrontation = { rouge: 0, bleu: 0 };

        return newTatami;
    }

    async updateTatami(id, updates) {
        const fields = [];
        const values = [];
        let paramIndex = 1;

        // Gérer les champs spéciaux
        if (updates.scoreConfrontation) {
            updates.score_rouge = updates.scoreConfrontation.rouge;
            updates.score_bleu = updates.scoreConfrontation.bleu;
            delete updates.scoreConfrontation;
        }

        Object.entries(updates).forEach(([key, value]) => {
            if (key !== 'combatsIds' && key !== 'historique') {
                fields.push(`${this.camelToSnake(key)} = $${paramIndex}`);
                values.push(value);
                paramIndex++;
            }
        });

        if (fields.length > 0) {
            values.push(id);
            await this.query(
                `UPDATE tatamis SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
                values
            );
        }

        // Gérer combatsIds séparément si présent
        if (updates.combatsIds) {
            await this.assignCombatsToTatami(id, updates.combatsIds);
        }

        // Ajouter à l'historique si présent
        if (updates.historique && Array.isArray(updates.historique)) {
            const lastEntry = updates.historique[updates.historique.length - 1];
            if (lastEntry) {
                await this.addTatamiHistorique(id, lastEntry);
            }
        }

        return await this.getTatamiById(id);
    }

    async deleteTatami(id) {
        const result = await this.query('DELETE FROM tatamis WHERE id = $1 RETURNING *', [id]);
        return result.rowCount > 0;
    }

    async assignCombatsToTatami(tatamiId, combatsIds) {
        // Supprimer les anciens combats
        await this.query('DELETE FROM tatamis_combats WHERE tatami_id = $1', [tatamiId]);

        // Ajouter les nouveaux combats
        for (let i = 0; i < combatsIds.length; i++) {
            await this.query(
                `INSERT INTO tatamis_combats (tatami_id, combat_id, ordre)
                 VALUES ($1, $2, $3)`,
                [tatamiId, combatsIds[i], i]
            );
        }
    }

    async addTatamiHistorique(tatamiId, entry) {
        await this.query(
            `INSERT INTO historique_tatamis (tatami_id, timestamp, action, donnees, ancien_index, nouveau_index)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                tatamiId,
                entry.timestamp || new Date().toISOString(),
                entry.action,
                JSON.stringify(entry.donnees || entry),
                entry.ancienIndex || entry.ancien_index || null,
                entry.nouveauIndex || entry.nouveau_index || null
            ]
        );
    }

    // =============================================
    // MÉTHODES COMBATS
    // =============================================

    async getAllCombats() {
        const result = await this.query('SELECT * FROM combats ORDER BY date_creation DESC');
        return result.rows.map(this.formatCombat);
    }

    async getCombatById(id) {
        const result = await this.query('SELECT * FROM combats WHERE id = $1', [id]);
        return result.rows[0] ? this.formatCombat(result.rows[0]) : null;
    }

    async createCombat(combat) {
        const result = await this.query(
            `INSERT INTO combats (
                id, tatami_id,
                rouge_id, rouge_nom, rouge_equipe_id, rouge_equipe_nom,
                bleu_id, bleu_nom, bleu_equipe_id, bleu_equipe_nom,
                etat, categorie, duree_combat
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *`,
            [
                combat.id || Date.now(),
                combat.tatamiId || null,
                combat.rouge?.id || null,
                combat.rouge?.nom || null,
                combat.rouge?.equipeId || null,
                combat.rouge?.equipe || null,
                combat.bleu?.id || null,
                combat.bleu?.nom || null,
                combat.bleu?.equipeId || null,
                combat.bleu?.equipe || null,
                combat.etat || 'prévu',
                combat.categorie || null,
                combat.dureeCombat || 300
            ]
        );
        return this.formatCombat(result.rows[0]);
    }

    async updateCombat(id, updates) {
        // Gérer les objets imbriqués rouge/bleu
        const flatUpdates = { ...updates };

        if (updates.rouge) {
            Object.entries(updates.rouge).forEach(([key, value]) => {
                flatUpdates[`rouge_${this.camelToSnake(key)}`] = value;
            });
            delete flatUpdates.rouge;
        }

        if (updates.bleu) {
            Object.entries(updates.bleu).forEach(([key, value]) => {
                flatUpdates[`bleu_${this.camelToSnake(key)}`] = value;
            });
            delete flatUpdates.bleu;
        }

        const fields = [];
        const values = [];
        let paramIndex = 1;

        Object.entries(flatUpdates).forEach(([key, value]) => {
            const columnName = key.includes('_') ? key : this.camelToSnake(key);
            fields.push(`${columnName} = $${paramIndex}`);
            values.push(value);
            paramIndex++;
        });

        if (fields.length === 0) return null;

        values.push(id);
        const result = await this.query(
            `UPDATE combats SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
            values
        );
        console.log('✅ Combat après UPDATE:', result.rows[0]);
        return result.rows[0] ? this.formatCombat(result.rows[0]) : null;
    }

    async deleteCombat(id) {
        const result = await this.query('DELETE FROM combats WHERE id = $1 RETURNING *', [id]);
        return result.rowCount > 0;
    }

    /**
     * Formate un combat de la DB vers le format attendu par l'application
     */
    formatCombat(dbCombat) {

        if (!dbCombat) return null;

        return {
            id: dbCombat.id,
            tatamiId: dbCombat.tatami_id,
            rouge: {
                id: dbCombat.rouge_id,
                nom: dbCombat.rouge_nom,
                equipeId: dbCombat.rouge_equipe_id,
                equipe: dbCombat.rouge_equipe_nom,
                ippon: dbCombat.rouge_ippon || 0,
                wazari: dbCombat.rouge_wazari || 0,
                yuko: dbCombat.rouge_yuko || 0,
                shido: dbCombat.rouge_shido || 0,
                points: dbCombat.rouge_points || 0
            },
            bleu: {
                id: dbCombat.bleu_id,
                nom: dbCombat.bleu_nom,
                equipeId: dbCombat.bleu_equipe_id,
                equipe: dbCombat.bleu_equipe_nom,
                ippon: dbCombat.bleu_ippon || 0,
                wazari: dbCombat.bleu_wazari || 0,
                yuko: dbCombat.bleu_yuko || 0,
                shido: dbCombat.bleu_shido || 0,
                points: dbCombat.bleu_points || 0
            },
            // ⚠️ AJOUTER AUSSI LES SCORES EN SNAKE_CASE POUR COMPATIBILITÉ
            rouge_ippon: dbCombat.rouge_ippon || 0,
            rouge_wazari: dbCombat.rouge_wazari || 0,
            rouge_yuko: dbCombat.rouge_yuko || 0,
            rouge_shido: dbCombat.rouge_shido || 0,
            bleu_ippon: dbCombat.bleu_ippon || 0,
            bleu_wazari: dbCombat.bleu_wazari || 0,
            bleu_yuko: dbCombat.bleu_yuko || 0,
            bleu_shido: dbCombat.bleu_shido || 0,
            etat: dbCombat.etat,
            vainqueur: dbCombat.vainqueur,
            dureeCombat: dbCombat.duree_combat,
            tempsEcoule: dbCombat.temps_ecoule,
            dateCreation: dbCombat.date_creation,
            dateDebut: dbCombat.date_debut,
            dateFin: dbCombat.date_fin,
            osaekoميActif: dbCombat.osaekomi_actif,
            osaekoميCote: dbCombat.osaekomi_cote,
            categorie: dbCombat.categorie,
            raisonFin: dbCombat.raison_fin
        };
    }

    // =============================================
    // MÉTHODES POULES
    // =============================================

    async getAllPoules() {
        const result = await this.query('SELECT * FROM poules ORDER BY id');

        for (let poule of result.rows) {
            // Récupérer les équipes de la poule
            const equipesResult = await this.query(
                'SELECT equipe_id FROM poules_equipes WHERE poule_id = $1',
                [poule.id]
            );
            poule.equipesIds = equipesResult.rows.map(r => r.equipe_id);

            // Récupérer les rencontres
            const rencontresResult = await this.query(
                `SELECT r.*, 
                 ARRAY(SELECT combat_id FROM rencontres_combats WHERE rencontre_id = r.id) as combats_ids
                 FROM rencontres r WHERE poule_id = $1`,
                [poule.id]
            );
            poule.rencontres = rencontresResult.rows.map(r => ({
                id: r.id,
                equipeA: r.equipe_a_id,
                equipeB: r.equipe_b_id,
                combatsIds: r.combats_ids || [],
                resultat: r.resultat,
                etat: r.etat
            }));

            // Récupérer le classement
            const classementResult = await this.query(
                `SELECT * FROM classements_poules 
                 WHERE poule_id = $1 ORDER BY points DESC, differentiel DESC`,
                [poule.id]
            );
            poule.classement = classementResult.rows;
        }

        return result.rows;
    }

    async getPouleById(id) {
        const result = await this.query('SELECT * FROM poules WHERE id = $1', [id]);
        if (result.rows.length === 0) return null;

        const poule = result.rows[0];

        // Récupérer les équipes
        const equipesResult = await this.query(
            'SELECT equipe_id FROM poules_equipes WHERE poule_id = $1',
            [id]
        );
        poule.equipesIds = equipesResult.rows.map(r => r.equipe_id);

        // Récupérer les rencontres
        const rencontresResult = await this.query(
            'SELECT * FROM rencontres WHERE poule_id = $1',
            [id]
        );
        poule.rencontres = rencontresResult.rows;

        // Récupérer le classement
        const classementResult = await this.query(
            'SELECT * FROM classements_poules WHERE poule_id = $1 ORDER BY points DESC',
            [id]
        );
        poule.classement = classementResult.rows;

        return poule;
    }

    async createPoules(poulesData) {
        const createdPoules = [];

        for (let pouleData of poulesData) {
            // Créer la poule
            const pouleResult = await this.query(
                'INSERT INTO poules (nom) VALUES ($1) RETURNING *',
                [pouleData.nom]
            );
            const poule = pouleResult.rows[0];

            // Ajouter les équipes
            for (let equipeId of pouleData.equipesIds) {
                await this.query(
                    'INSERT INTO poules_equipes (poule_id, equipe_id) VALUES ($1, $2)',
                    [poule.id, equipeId]
                );

                // Créer l'entrée de classement
                await this.query(
                    `INSERT INTO classements_poules (poule_id, equipe_id)
                     VALUES ($1, $2)`,
                    [poule.id, equipeId]
                );
            }

            // Créer les rencontres
            for (let rencontre of pouleData.rencontres) {
                await this.query(
                    `INSERT INTO rencontres (id, poule_id, equipe_a_id, equipe_b_id, etat)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [rencontre.id, poule.id, rencontre.equipeA, rencontre.equipeB, 'prevue']
                );
            }

            poule.equipesIds = pouleData.equipesIds;
            poule.rencontres = pouleData.rencontres;
            createdPoules.push(poule);
        }

        return createdPoules;
    }

    async deleteAllPoules() {
        await this.query('DELETE FROM poules');
        return true;
    }

    async updateClassementPoule(pouleId, classement) {
        for (let entry of classement) {
            await this.query(
                `UPDATE classements_poules 
                 SET points = $1, victoires = $2, defaites = $3, egalites = $4,
                     confrontations_jouees = $5, points_marques = $6, points_encaisses = $7, differentiel = $8
                 WHERE poule_id = $9 AND equipe_id = $10`,
                [
                    entry.points || 0,
                    entry.victoires || 0,
                    entry.defaites || 0,
                    entry.egalites || 0,
                    entry.confrontationsJouees || 0,
                    entry.pointsMarques || 0,
                    entry.pointsEncaisses || 0,
                    entry.differentiel || 0,
                    pouleId,
                    entry.equipeId
                ]
            );
        }

        // Mettre à jour le timestamp de la poule
        await this.query(
            'UPDATE poules SET derniere_mise_a_jour = CURRENT_TIMESTAMP WHERE id = $1',
            [pouleId]
        );

        return true;
    }

    // =============================================
    // MÉTHODES LOGS
    // =============================================

    async addLog(message, data = {}) {
        await this.query(
            'INSERT INTO logs (message, donnees) VALUES ($1, $2)',
            [message, JSON.stringify(data)]
        );
        console.log('[LOG]', message, data);
    }

    async getAllLogs(limit = 100) {
        const result = await this.query(
            'SELECT * FROM logs ORDER BY timestamp DESC LIMIT $1',
            [limit]
        );
        return result.rows;
    }

    async cleanOldLogs(days = 30) {
        const result = await this.query(
            `DELETE FROM logs WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '${days} days'`
        );
        return result.rowCount;
    }

    // =============================================
    // UTILITAIRES
    // =============================================

    /**
     * Convertit camelCase en snake_case
     */
    camelToSnake(str) {
        // Si déjà en snake_case, ne rien faire
        if (str.includes('_')) {
            return str;
        }
        // Sinon convertir camelCase → snake_case
        return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    }

    /**
     * Génère un ID unique
     */
    generateId() {
        return Date.now() + Math.floor(Math.random() * 1000);
    }

    /**
     * Export de toutes les données (pour backup)
     */
    async exportAll() {
        const data = {
            equipes: await this.getAllEquipes(),
            combattants: await this.getAllCombattants(),
            tatamis: await this.getAllTatamis(),
            combats: await this.getAllCombats(),
            poules: await this.getAllPoules(),
            logs: await this.getAllLogs(1000)
        };
        return data;
    }

    /**
     * Ferme la connexion
     */
    async close() {
        if (this.pool) {
            await this.pool.end();
            this.isConnected = false;
            console.log('Connexion PostgreSQL fermée');
        }
    }
}

module.exports = new PostgresService();