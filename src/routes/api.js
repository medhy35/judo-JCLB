// src/routes/api.js
const express = require('express');
const router = express.Router();

// Import des contrôleurs
const tatamisController = require('../controllers/tatamis');
const combatsController = require('../controllers/combats');
const equipesController = require('../controllers/equipes');
const combattantsController = require('../controllers/combattants');
const poulesController = require('../controllers/poules');

// Import des routes modulaires
const setupTableauRoutes = require('./tableauRoutes');

// Import des services
const dataService = require('../services/dataService');
const classementService = require('../services/classementService');
const tatamiService = require('../services/tatamiService');
const socketEvents = require('../utils/socketEvents');
const combatService = require("../services/combatService");
const configService = require('../services/configService');
const backupService = require('../services/backupService');

// Middleware pour ajouter les services aux requêtes
router.use((req, res, next) => {
    req.services = {
        data: dataService,
        classement: classementService,
        tatami: tatamiService,
        socket: socketEvents
    };
    next();
});

// Middleware pour la gestion des erreurs et broadcasts
const withBroadcast = (controllerMethod, broadcastType) => {
    return async (req, res) => {
        try {
            await controllerMethod(req, res);

            // Broadcast après succès selon le type
            if (res.statusCode < 400) {
                switch (broadcastType) {
                    case 'tatamis':
                        if (res.locals.tatami) {
                            // ⚠️ OPTIMISATION : Ne broadcaster QUE le tatami modifié
                            socketEvents.broadcastToRoom(`tatami-${res.locals.tatami.id}`, 'tatamis:update', {
                                tatami: res.locals.tatami,
                                combatActuel: res.locals.combatActuel
                            });
                        }
                        break;
                    case 'combats':
                        if (res.locals.combat) {
                            // ⚠️ Trouver le tatami concerné
                            const tatamis = require('../services/dataService').readFile('tatamis');
                            const tatami = tatamis.find(t =>
                                t.combatsIds && t.combatsIds.includes(res.locals.combat.id)
                            );

                            if (tatami) {
                                // Broadcaster seulement aux spectateurs de CE tatami
                                socketEvents.broadcastToRoom(`tatami-${tatami.id}`, 'combats:update', {
                                    tatamiId: tatami.id,
                                    combat: res.locals.combat
                                });
                            }
                        }
                        break;
                    case 'equipes':
                        if (req.equipe) socketEvents.broadcastEquipeUpdate(req.equipe);
                        break;
                    case 'combattants':
                        if (req.combattant) socketEvents.broadcastCombattantUpdate(req.combattant);
                        break;
                    case 'poules':
                        if (req.poules) socketEvents.broadcastPoulesUpdate(req.poules);
                        break;
                }
            }
        } catch (error) {
            console.error(`Erreur ${broadcastType}:`, error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Erreur serveur interne' });
            }
        }
    };
};

// ==========================================
// ROUTES TATAMIS
// ==========================================
router.get('/tatamis', tatamisController.getAll);
router.get('/tatamis/:id/combat-actuel', tatamisController.getCombatActuel);
router.get('/tatamis/:id/historique-combats', tatamisController.getHistoriqueCombats);
router.get('/tatamis/:id', tatamisController.getById);

router.post('/tatamis', withBroadcast(async (req, res) => {
    await tatamisController.create(req, res);
    req.tatami = res.locals.tatami;
}, 'tatamis'));

router.patch('/tatamis/:id', withBroadcast(async (req, res) => {
    await tatamisController.update(req, res);
    req.tatami = res.locals.tatami;
}, 'tatamis'));

router.patch('/tatamis/:id/assigner', withBroadcast(async (req, res) => {
    await tatamisController.assignerCombats(req, res);
    req.tatami = res.locals.tatami;
}, 'tatamis'));

router.patch('/tatamis/:id/etat', withBroadcast(async (req, res) => {
    await tatamisController.changerEtat(req, res);
    req.tatami = dataService.findById('tatamis', +req.params.id);
}, 'tatamis'));

router.patch('/tatamis/:id/liberer', withBroadcast(async (req, res) => {
    await tatamisController.liberer(req, res);
    req.tatami = res.locals.tatami;
}, 'tatamis'));

router.post('/tatamis/:id/suivant', withBroadcast(async (req, res) => {
    const result = tatamiService.combatSuivant(+req.params.id);
    if (result.success) {
        req.tatami = result.tatami;
        req.combatActuel = result.combatActuel;
        res.json(result);
    } else {
        res.status(400).json(result);
    }
}, 'tatamis'));

router.post('/tatamis/:id/precedent', withBroadcast(async (req, res) => {
    const result = tatamiService.combatPrecedent(+req.params.id);
    if (result.success) {
        req.tatami = result.tatami;
        req.combatActuel = result.combatActuel;
        res.json(result);
    } else {
        res.status(400).json(result);
    }
}, 'tatamis'));

router.delete('/tatamis/:id', withBroadcast(async (req, res) => {
    await tatamisController.delete(req, res);
}, 'tatamis'));

// ==========================================
// ROUTES COMBATS
// ==========================================
router.get('/combats', async (req, res) => {
    try {
        const combats = dataService.readFile('combats');
        const combatService = require('../services/combatService');
        // Optimisation : enrichir tous les combats en une seule passe
        const combatsEnrichis = combatService.enrichCombats(combats);
        res.json(combatsEnrichis);
    } catch (error) {
        console.error('Erreur récupération combats:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

router.get('/combats/:id', async (req, res) => {
    try {
        const combat = dataService.findById('combats', +req.params.id);
        if (!combat) {
            return res.status(404).json({ error: 'Combat introuvable' });
        }
        const combatService = require('../services/combatService');
        res.json(combatService.enrichCombat(combat));
    } catch (error) {
        console.error('Erreur récupération combat:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

router.post('/combats', withBroadcast(async (req, res) => {
    await combatsController.create(req, res);
    req.combat = res.locals.combat;
}, 'combats'));

router.patch('/combats/:id', withBroadcast(async (req, res) => {
    const combatId = +req.params.id;
    await combatsController.update(req, res);

    // Mise à jour automatique des classements si combat terminé
    const combat = dataService.findById('combats', combatId);
    if (combat && combat.etat === 'terminé') {
        classementService.mettreAJourClassements(combat);

        // Mettre à jour le score de confrontation du tatami
        const tatamis = dataService.readFile('tatamis');
        const tatami = tatamis.find(t => t.combatsIds && t.combatsIds.includes(combatId));
        if (tatami) {
            tatamiService.calculerScoreConfrontation(tatami.id);
            req.tatamiId = tatami.id;
        }
        const tableau = dataService.readFile('tableau');
        const phases = configService.get('tableau.phases', ['huitieme', 'quart', 'demi', 'finale']);

        for (const phase of phases) {
            if (tableau[phase]) {
                const match = tableau[phase].find(m =>
                    m.combatsIds && m.combatsIds.includes(combatId)
                );

                if (match) {
                    // Recalculer le score du match
                    const combatService = require('../services/combatService');
                    const combats = dataService.readFile('combats');

                    let scoreA = 0;
                    let scoreB = 0;
                    let tousTermines = true;

                    match.combatsIds.forEach(cId => {
                        const c = combats.find(combat => combat.id === cId);
                        if (!c || c.etat !== 'terminé') {
                            tousTermines = false;
                            return;
                        }

                        const cEnrichi = combatService.enrichCombat(c);
                        const vainqueur = combatService.determinerVainqueur(c);
                        const rougeEstEquipeA = cEnrichi.rouge.equipeId === match.equipeA;

                        if (vainqueur === 'rouge') {
                            if (rougeEstEquipeA) scoreA++;
                            else scoreB++;
                        } else if (vainqueur === 'bleu') {
                            if (rougeEstEquipeA) scoreB++;
                            else scoreA++;
                        }
                    });

                    match.scoreA = scoreA;
                    match.scoreB = scoreB;

                    if (tousTermines && !match.vainqueur) {
                        match.vainqueur = scoreA > scoreB ? 'A' : (scoreB > scoreA ? 'B' : null);
                        if (match.vainqueur) {
                            match.dateFinMatch = new Date().toISOString();
                        }
                    }

                    dataService.writeFile('tableau', tableau);

                    dataService.addLog('Score match tableau mis à jour', {
                        phase, matchId: match.id, scoreA, scoreB,
                        vainqueur: match.vainqueur, tousTermines
                    });

                    break;
                }
            }
        }
    }

    req.combat = combat;
}, 'combats'));

router.delete('/combats/:id', withBroadcast(async (req, res) => {
    await combatsController.delete(req, res);
}, 'combats'));

// ==========================================
// ROUTES ÉQUIPES
// ==========================================
router.get('/equipes', equipesController.getAll);
router.get('/equipes/:id', equipesController.getById);
router.get('/equipes/:id/combattants', equipesController.getCombattants);
router.get('/equipes/:id/stats', equipesController.getStats);

router.post('/equipes', withBroadcast(async (req, res) => {
    await equipesController.create(req, res);
    req.equipe = res.locals.equipe;
}, 'equipes'));

router.patch('/equipes/:id', withBroadcast(async (req, res) => {
    await equipesController.update(req, res);
    req.equipe = res.locals.equipe;
}, 'equipes'));

router.patch('/equipes/:id/score', withBroadcast(async (req, res) => {
    await equipesController.updateScore(req, res);
    req.equipe = dataService.findById('equipes', req.params.id);
}, 'equipes'));

router.delete('/equipes/:id', withBroadcast(async (req, res) => {
    await equipesController.delete(req, res);
}, 'equipes'));

// ==========================================
// ROUTES COMBATTANTS
// ==========================================
router.get('/combattants', combattantsController.getAll);
router.get('/combattants/:id', combattantsController.getById);
router.get('/combattants/by-equipe/:equipeId', combattantsController.getByEquipe);
router.get('/combattants/by-categorie', combattantsController.getByCategorie);
router.get('/combattants/:id/combats', combattantsController.getCombats);

router.post('/combattants', withBroadcast(async (req, res) => {
    await combattantsController.create(req, res);
    req.combattant = res.locals.combattant;
}, 'combattants'));

router.patch('/combattants/:id', withBroadcast(async (req, res) => {
    await combattantsController.update(req, res);
    req.combattant = res.locals.combattant;
}, 'combattants'));

router.delete('/combattants/:id', withBroadcast(async (req, res) => {
    await combattantsController.delete(req, res);
}, 'combattants'));

// ==========================================
// ROUTES POULES
// ==========================================
router.get('/poules', poulesController.getAll);
router.get('/poules/:id', poulesController.getById);

router.post('/poules', withBroadcast(async (req, res) => {
    await poulesController.create(req, res);
    req.poules = res.locals.poules;
}, 'poules'));

router.patch('/poules/:id', withBroadcast(async (req, res) => {
    await poulesController.update(req, res);
    req.poules = [res.locals.poule];
}, 'poules'));

router.patch('/poules/:id/classement', withBroadcast(async (req, res) => {
    await poulesController.updateClassement(req, res);
    req.poules = dataService.readFile('poules');
}, 'poules'));

router.delete('/poules', withBroadcast(async (req, res) => {
    await poulesController.deleteAll(req, res);
    req.poules = [];
}, 'poules'));

// Assignation de combat depuis une poule
router.post('/poules/assign-combat', withBroadcast(async (req, res) => {
    await poulesController.assignCombat(req, res);
    req.poules = dataService.readFile('poules');
    req.tatami = res.locals.tatami;
}, 'poules'));

// Obtenir les combattants disponibles pour une rencontre
router.get('/poules/rencontre/:id/combattants-disponibles', poulesController.getCombattantsDisponibles);

// ==========================================
// ROUTES CLASSEMENTS
// ==========================================
router.get('/classement/poule/:id', poulesController.getClassementPoule);
router.get('/classement/general', poulesController.getClassementGeneral);
router.get('/confrontations/en-cours', poulesController.getConfrontationsEnCours);

// ==========================================
// ROUTES TABLEAU ÉLIMINATOIRE (Dual System: Principal + Consolante + Bronze)
// ==========================================
setupTableauRoutes(router);

// ==========================================
// ROUTES UTILITAIRES
// ==========================================

// Configuration

// GET /api/config/validate - Valider la configuration
router.get('/config/validate', (req, res) => {
    try {
        const validation = configService.validate();
        res.json(validation);
    } catch (error) {
        console.error('Erreur validation config:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});
// POST /api/config/export - Exporter la configuration
router.post('/config/export', (req, res) => {
    try {
        const exportData = configService.export();
        res.setHeader('Content-Disposition', 'attachment; filename="config_judo.json"');
        res.json(exportData);
    } catch (error) {
        console.error('Erreur export config:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});
// POST /api/config/import - Importer une configuration
router.post('/config/import', (req, res) => {
    try {
        const result = configService.import(req.body);

        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }

        dataService.addLog('Configuration importée');
        socketEvents.broadcast('config:update', configService.getAll());

        res.json({
            success: true,
            config: configService.getAll()
        });
    } catch (error) {
        console.error('Erreur import config:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});
router.post('/config/reset', (req, res) => {
    try {
        configService.reset();
        dataService.addLog('Configuration réinitialisée');
        socketEvents.broadcast('config:update', configService.getAll());

        res.json({
            success: true,
            config: configService.getAll()
        });
    } catch (error) {
        console.error('Erreur reset config:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});



router.get('/config/:section', (req, res) => {
    try {
        const { section } = req.params;
        const value = configService.get(section);

        if (value === null) {
            return res.status(404).json({ error: 'Section non trouvée' });
        }

        res.json({ [section]: value });
    } catch (error) {
        console.error('Erreur récupération config:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});
router.get('/config', (req, res) => {
    try {
        const config = configService.getAll();
        res.json(config);
    } catch (error) {
        console.error('Erreur récupération config:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});
router.patch('/config', (req, res) => {
    try {
        const updates = req.body;

        configService.update(updates);

        // Valider la nouvelle config
        const validation = configService.validate();
        if (!validation.valid) {
            return res.status(400).json({
                error: 'Configuration invalide',
                details: validation.errors
            });
        }

        dataService.addLog('Configuration mise à jour', { updates });
        socketEvents.broadcast('config:update', configService.getAll());

        res.json({
            success: true,
            config: configService.getAll()
        });
    } catch (error) {
        console.error('Erreur mise à jour config:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});


// Logs
router.post('/logs', (req, res) => {
    const { message, data } = req.body;
    dataService.addLog(message, data);
    res.json({ success: true });
});

router.get('/logs', (req, res) => {
    const logs = dataService.readFile('logs');
    res.json(logs.slice(-100)); // Derniers 100 logs
});

// Export/Import
router.get('/export', (req, res) => {
    const exportData = dataService.exportAll();
    res.setHeader('Content-Disposition', 'attachment; filename="backup_judo.json"');
    res.json(exportData);
});

router.post('/import', (req, res) => {
    try {
        dataService.importAll(req.body);
        socketEvents.broadcast('data:update', { message: 'Données importées' });
        dataService.addLog('Données importées depuis un fichier');
        res.json({ success: true });
    } catch (error) {
        console.error('Erreur import:', error);
        res.status(400).json({ error: 'Erreur lors de l\'import' });
    }
});

// Reset
router.post('/reset', (req, res) => {
    try {
        dataService.resetAll();
        socketEvents.broadcast('data:update', { message: 'Données réinitialisées' });
        dataService.addLog('Toutes les données ont été réinitialisées');
        res.json({ success: true });
    } catch (error) {
        console.error('Erreur reset:', error);
        res.status(500).json({ error: 'Erreur lors de la réinitialisation' });
    }
});

// Statistiques globales
router.get('/stats', (req, res) => {
    const rapport = classementService.genererRapportCompetition();
    res.json(rapport);
});

router.get('/backups', (req, res) => {
    const backups = backupService.listBackups();
    res.json(backups);
});

router.post('/backups/create', (req, res) => {
    const result = backupService.createBackup();
    res.json(result);
});

router.post('/backups/restore/:filename', (req, res) => {
    const { filename } = req.params;
    const result = backupService.restoreBackup(filename);

    if (result.success) {
        socketEvents.broadcast('data:restored', { filename });
    }
    res.json(result);
});


module.exports = router;