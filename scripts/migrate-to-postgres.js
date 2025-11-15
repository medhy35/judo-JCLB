// scripts/migrate-to-postgres.js
const fs = require('fs');
const path = require('path');
const postgresService = require('../src/services/postgresService');

/**
 * Script de migration des données JSON vers PostgreSQL
 * Usage: node scripts/migrate-to-postgres.js
 */

class Migration {
    constructor() {
        this.dataDir = path.join(__dirname, '../data');
        this.errors = [];
        this.stats = {
            equipes: 0,
            combattants: 0,
            tatamis: 0,
            combats: 0,
            poules: 0,
            logs: 0
        };
    }

    /**
     * Lit un fichier JSON
     */
    readJsonFile(filename) {
        try {
            const filePath = path.join(this.dataDir, filename);
            if (!fs.existsSync(filePath)) {
                console.warn(`⚠️  Fichier ${filename} non trouvé`);
                return [];
            }
            const content = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            console.error(`❌ Erreur lecture ${filename}:`, error.message);
            this.errors.push({ file: filename, error: error.message });
            return [];
        }
    }

    /**
     * Migre les équipes
     */
    async migrateEquipes() {
        console.log('\n📦 Migration des équipes...');
        const equipes = this.readJsonFile('equipes.json');

        for (const equipe of equipes) {
            try {
                await postgresService.createEquipe(equipe);
                this.stats.equipes++;
                console.log(`  ✓ ${equipe.nom}`);
            } catch (error) {
                console.error(`  ✗ Erreur équipe ${equipe.nom}:`, error.message);
                this.errors.push({ type: 'equipe', data: equipe, error: error.message });
            }
        }

        console.log(`✅ ${this.stats.equipes} équipes migrées`);
    }

    /**
     * Migre les combattants
     */
    async migrateCombattants() {
        console.log('\n🥋 Migration des combattants...');
        const combattants = this.readJsonFile('combattants.json');

        for (const combattant of combattants) {
            try {
                await postgresService.createCombattant(combattant);
                this.stats.combattants++;
                console.log(`  ✓ ${combattant.nom} (${combattant.equipeId})`);
            } catch (error) {
                console.error(`  ✗ Erreur combattant ${combattant.nom}:`, error.message);
                this.errors.push({ type: 'combattant', data: combattant, error: error.message });
            }
        }

        console.log(`✅ ${this.stats.combattants} combattants migrés`);
    }

    /**
     * Migre les tatamis
     */
    async migrateTatamis() {
        console.log('\n🥊 Migration des tatamis...');
        const tatamis = this.readJsonFile('tatamis.json');

        for (const tatami of tatamis) {
            try {
                // Créer le tatami
                const newTatami = await postgresService.createTatami({
                    nom: tatami.nom,
                    etat: tatami.etat
                });

                // Mettre à jour les détails
                await postgresService.updateTatami(newTatami.id, {
                    indexCombatActuel: tatami.indexCombatActuel || 0,
                    scoreConfrontation: tatami.scoreConfrontation || { rouge: 0, bleu: 0 },
                    combatsIds: tatami.combatsIds || []
                });

                // Migrer l'historique
                if (tatami.historique && tatami.historique.length > 0) {
                    for (const entry of tatami.historique) {
                        await postgresService.addTatamiHistorique(newTatami.id, entry);
                    }
                }

                this.stats.tatamis++;
                console.log(`  ✓ ${tatami.nom} (${tatami.combatsIds?.length || 0} combats)`);
            } catch (error) {
                console.error(`  ✗ Erreur tatami ${tatami.nom}:`, error.message);
                this.errors.push({ type: 'tatami', data: tatami, error: error.message });
            }
        }

        console.log(`✅ ${this.stats.tatamis} tatamis migrés`);
    }

    /**
     * Migre les combats
     */
    async migrateCombats() {
        console.log('\n⚔️  Migration des combats...');
        const combats = this.readJsonFile('combats.json');

        for (const combat of combats) {
            try {
                await postgresService.createCombat(combat);
                this.stats.combats++;

                const rouge = combat.rouge?.nom || combat.rouge?.equipe || 'Rouge';
                const bleu = combat.bleu?.nom || combat.bleu?.equipe || 'Bleu';
                console.log(`  ✓ ${rouge} vs ${bleu} (${combat.etat})`);
            } catch (error) {
                console.error(`  ✗ Erreur combat:`, error.message);
                this.errors.push({ type: 'combat', data: combat, error: error.message });
            }
        }

        console.log(`✅ ${this.stats.combats} combats migrés`);
    }

    /**
     * Migre les poules
     */
    async migratePoules() {
        console.log('\n🏆 Migration des poules...');
        const poules = this.readJsonFile('poules.json');

        if (!poules || poules.length === 0) {
            console.log('  ℹ️  Aucune poule à migrer');
            return;
        }

        try {
            const createdPoules = await postgresService.createPoules(poules);
            this.stats.poules = createdPoules.length;

            // Migrer les classements
            for (const poule of poules) {
                if (poule.classement && poule.classement.length > 0) {
                    const pouleId = createdPoules.find(p => p.nom === poule.nom)?.id;
                    if (pouleId) {
                        await postgresService.updateClassementPoule(pouleId, poule.classement);
                    }
                }
                console.log(`  ✓ ${poule.nom} (${poule.equipesIds?.length || 0} équipes)`);
            }

            console.log(`✅ ${this.stats.poules} poules migrées`);
        } catch (error) {
            console.error(`  ✗ Erreur migration poules:`, error.message);
            this.errors.push({ type: 'poules', error: error.message });
        }
    }

    /**
     * Migre les logs (optionnel, limité aux 1000 derniers)
     */
    async migrateLogs() {
        console.log('\n📝 Migration des logs...');
        const logs = this.readJsonFile('logs.json');

        // Ne migrer que les 1000 derniers logs pour éviter la surcharge
        const recentLogs = logs.slice(-1000);

        for (const log of recentLogs) {
            try {
                await postgresService.addLog(log.message, log.data || {});
                this.stats.logs++;
            } catch (error) {
                // Ignorer les erreurs de logs pour ne pas bloquer la migration
            }
        }

        console.log(`✅ ${this.stats.logs} logs migrés (sur ${logs.length})`);
    }

    /**
     * Lance la migration complète
     */
    async run() {
        console.log('═══════════════════════════════════════════════');
        console.log('🚀 MIGRATION JSON → PostgreSQL');
        console.log('═══════════════════════════════════════════════');

        try {
            // 1. Connexion à la base de données
            console.log('\n🔌 Connexion à PostgreSQL...');
            const connected = await postgresService.init({
                host: process.env.DB_HOST || 'localhost',
                port: process.env.DB_PORT || 5432,
                database: process.env.DB_NAME || 'judo-tournament',
                user: process.env.DB_USER || 'user',
                password: process.env.DB_PASSWORD || ''
            });

            if (!connected.success) {
                console.error('❌ Impossible de se connecter à PostgreSQL');
                console.error('Vérifiez vos paramètres de connexion');
                return;
            }

            // 2. Migrations dans l'ordre (respect des contraintes FK)
            await this.migrateEquipes();
            await this.migrateCombattants();
            await this.migrateTatamis();
            await this.migrateCombats();
            await this.migratePoules();
            await this.migrateLogs();

            // 3. Résumé
            console.log('\n═══════════════════════════════════════════════');
            console.log('📊 RÉSUMÉ DE LA MIGRATION');
            console.log('═══════════════════════════════════════════════');
            console.log(`✅ Équipes:      ${this.stats.equipes}`);
            console.log(`✅ Combattants:  ${this.stats.combattants}`);
            console.log(`✅ Tatamis:      ${this.stats.tatamis}`);
            console.log(`✅ Combats:      ${this.stats.combats}`);
            console.log(`✅ Poules:       ${this.stats.poules}`);
            console.log(`✅ Logs:         ${this.stats.logs}`);

            if (this.errors.length > 0) {
                console.log(`\n⚠️  ${this.errors.length} erreur(s) rencontrée(s)`);
                console.log('\nDétails des erreurs:');
                this.errors.forEach((err, i) => {
                    console.log(`\n${i + 1}. Type: ${err.type || 'unknown'}`);
                    console.log(`   Erreur: ${err.error}`);
                });
            } else {
                console.log('\n🎉 Migration terminée sans erreur !');
            }

            // 4. Vérification
            console.log('\n🔍 Vérification des données migrées...');
            const verification = await this.verifyMigration();
            console.log(verification);

        } catch (error) {
            console.error('\n❌ ERREUR FATALE:', error.message);
            console.error(error.stack);
        } finally {
            await postgresService.close();
        }
    }

    /**
     * Vérifie que les données ont bien été migrées
     */
    async verifyMigration() {
        const data = await postgresService.exportAll();

        return `
┌─────────────────────┬──────────┐
│ Table               │ Nombre   │
├─────────────────────┼──────────┤
│ Équipes             │ ${String(data.equipes.length).padStart(8)} │
│ Combattants         │ ${String(data.combattants.length).padStart(8)} │
│ Tatamis             │ ${String(data.tatamis.length).padStart(8)} │
│ Combats             │ ${String(data.combats.length).padStart(8)} │
│ Poules              │ ${String(data.poules.length).padStart(8)} │
│ Logs                │ ${String(data.logs.length).padStart(8)} │
└─────────────────────┴──────────┘
        `;
    }
}

// Lancer la migration
if (require.main === module) {
    const migration = new Migration();
    migration.run().then(() => {
        console.log('\n✨ Script terminé');
        process.exit(0);
    }).catch(error => {
        console.error('❌ Erreur:', error);
        process.exit(1);
    });
}

module.exports = Migration;