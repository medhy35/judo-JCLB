// src/routes/api.js
const express = require('express');
const router = express.Router();

// Import des contrôleurs
const tatamisController = require('../controllers/tatamis');
const combatsController = require('../controllers/combats');
const equipesController = require('../controllers/equipes');
const combattantsController = require('../controllers/combattants');
const poulesController = require('../controllers/poules');

// Import des services
const dataService = require('../services/databaseAdapter');
const classementService = require('../services/classementService');
const tatamiService = require('../services/tatamiService');

const combatService = require("../services/combatService");
const configService = require('../services/configService');
const backupService = require('../services/backupService');
const sseManager = require('../services/sseManager');

// Middleware pour ajouter les services aux requêtes
router.use((req, res, next) => {
    req.services = {
        data: dataService,
        classement: classementService,
        tatami: tatamiService
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
                            sseManager.broadcast(res.locals.tatami.id, 'tatami_update', {
                                tatami: res.locals.tatami,
                                combatActuel: res.locals.combatActuel
                            });
                        }
                        break;
                    case 'combats':
                        if (res.locals.combat) {
                            // ⚠️ Trouver le tatami concerné
                            const tatamis = await require('../services/databaseAdapter').getAllTatamis();
                            const tatami = tatamis.find(t =>
                                t.combatsIds && t.combatsIds.includes(res.locals.combat.id)
                            );

                            if (tatami) {
                                // Broadcaster seulement aux spectateurs de CE tatami
                                sseManager.broadcast(tatami.id, 'combat_update', {
                                    tatamiId: tatami.id,
                                    combat: res.locals.combat
                                });
                            }
                        }
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
    req.tatami = await dataService.getTatamiById(+req.params.id);
}, 'tatamis'));

router.patch('/tatamis/:id/liberer', withBroadcast(async (req, res) => {
    await tatamisController.liberer(req, res);
    req.tatami = res.locals.tatami;
}, 'tatamis'));

router.post('/tatamis/:id/suivant', withBroadcast(async (req, res) => {
    const result = await tatamiService.combatSuivant(+req.params.id);
    if (result.success) {
        req.tatami = result.tatami;
        req.combatActuel = result.combatActuel;
        res.json(result);
    } else {
        res.status(400).json(result);
    }
}, 'tatamis'));

router.post('/tatamis/:id/precedent', withBroadcast(async (req, res) => {
    const result = await tatamiService.combatPrecedent(+req.params.id);
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

// GET /api/tatamis/:id/events - SSE stream
router.get('/tatamis/:id/events', async (req, res) => {
    const tatamiId = parseInt(req.params.id);

    // Configuration SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Pour Nginx

    // Heartbeat toutes les 30 secondes
    const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n');
    }, 30000);

    // Nettoyer à la déconnexion
    req.on('close', () => {
        clearInterval(heartbeat);
        // Retirer le client de la liste
        sseManager.removeClient(tatamiId, res);
    });

    // Ajouter le client
    sseManager.addClient(tatamiId, res);

    // Envoyer état initial
    const tatami = await dataService.getTatamiById(tatamiId);
    const combat = await tatamiService.getCombatActuel(tatamiId);

    res.write(`event: init\ndata: ${JSON.stringify({ tatami, combat })}\n\n`);
});

// ==========================================
// ROUTES COMBATS
// ==========================================
router.get('/combats', async (req, res) => {
    try {
        const combats = await dataService.getAllCombats();
        const combatService = require('../services/combatService');
        const combatsEnrichis = await Promise.all(
            combats.map(c => combatService.enrichCombatAsync(c))
        );
        res.json(combatsEnrichis);
    } catch (error) {
        console.error('Erreur récupération combats:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

router.get('/combats/:id', async (req, res) => {
    try {
        const combat = await dataService.getCombatById(+req.params.id);
        if (!combat) {
            return res.status(404).json({ error: 'Combat introuvable' });
        }
        const combatService = require('../services/combatService');
        res.json(await combatService.enrichCombatAsync(combat));
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
    const combat = await dataService.getCombatById(combatId);
    if (combat && combat.etat === 'terminé') {
        await classementService.mettreAJourClassements(combat);

        // Mettre à jour le score de confrontation du tatami
        const tatamis = await dataService.getAllTatamis();
        const tatami = tatamis.find(t => t.combatsIds && t.combatsIds.includes(combatId));
        if (tatami) {
            await tatamiService.calculerScoreConfrontation(tatami.id);
            req.tatamiId = tatami.id;
        }
        const tableau = dataService.readFile('tableau');
        const combatConfig = configService.getCombatConfig();

        if (combatConfig?.tableau?.phases && tableau) {
            const phases = combatConfig.tableau.phases;
            for (const phase of phases) {
                if (tableau[phase]) {
                    const match = tableau[phase].find(m =>
                        m.combatsIds && m.combatsIds.includes(combatId)
                    );

                    if (match) {
                        // Recalculer le score du match
                        const combatService = require('../services/combatService');
                        const combats = await dataService.getAllCombats();

                        let scoreA = 0;
                        let scoreB = 0;
                        let tousTermines = true;

                        for (const cId of match.combatsIds) {
                            const c = combats.find(combat => combat.id === cId);
                            if (!c || c.etat !== 'terminé') {
                                tousTermines = false;
                                continue;
                            }

                            const cEnrichi = await combatService.enrichCombatAsync(c);
                            const vainqueur = combatService.determinerVainqueur(c);
                            const rougeEstEquipeA = cEnrichi.rouge.equipeId === match.equipeA;

                            if (vainqueur === 'rouge') {
                                if (rougeEstEquipeA) scoreA++;
                                else scoreB++;
                            } else if (vainqueur === 'bleu') {
                                if (rougeEstEquipeA) scoreB++;
                                else scoreA++;
                            }
                        }

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
        else {
            console.log('ℹ️ Pas de phases de tableau configurées, skip calcul tableau');
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
    req.equipe = await dataService.getEquipeById(req.params.id);
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
    req.poules = await dataService.getAllPoules();
}, 'poules'));

router.delete('/poules', withBroadcast(async (req, res) => {
    await poulesController.deleteAll(req, res);
    req.poules = [];
}, 'poules'));

// Assignation de combat depuis une poule
router.post('/poules/assign-combat', withBroadcast(async (req, res) => {
    await poulesController.assignCombat(req, res);
    req.poules = await dataService.getAllPoules();
    req.tatami = res.locals.tatami;
}, 'poules'));

// ==========================================
// ROUTES CLASSEMENTS
// ==========================================
router.get('/classement/poule/:id', poulesController.getClassementPoule);
router.get('/classement/general', poulesController.getClassementGeneral);
router.get('/confrontations/en-cours', poulesController.getConfrontationsEnCours);

// ==========================================
// ROUTES TABLEAU ÉLIMINATOIRE
// ==========================================
// Fonction utilitaire pour déterminer la phase suivante
function getNextPhase(currentPhase) {
    const phases = {
        'seizieme': 'huitieme',
        'huitieme': 'quart',
        'quart': 'demi',
        'demi': 'finale',
        'finale': 'terminé'
    };
    return phases[currentPhase] || 'inconnu';
}
router.get('/tableau', (req, res) => {
    const tableau = dataService.readFile('tableau');
    res.json(tableau);
});

router.post('/tableau', (req, res) => {
    const { qualifiees } = req.body;
    if (!qualifiees || qualifiees.length < 2) {
        return res.status(400).json({ error: 'Il faut au moins 2 équipes.' });
    }

    const shuffled = qualifiees.sort(() => Math.random() - 0.5);
    let startPhase = 'finale';
    if (shuffled.length > 16) startPhase = 'seizieme';
    else if (shuffled.length > 8) startPhase = 'huitieme';
    else if (shuffled.length > 4) startPhase = 'quart';
    else if (shuffled.length > 2) startPhase = 'demi';

    const tableau = { seizieme: [], huitieme: [], quart: [], demi: [], finale: [] };

    function generateMatches(teams, phaseKey) {
        const matches = [];
        for (let i = 0; i < teams.length; i += 2) {
            matches.push({
                id: i / 2 + 1,
                equipeA: teams[i] || null,
                equipeB: teams[i + 1] || null,
                scoreA: 0,
                scoreB: 0,
                vainqueur: null
            });
        }
        tableau[phaseKey] = matches;
    }

    generateMatches(shuffled, startPhase);

    const nextPhases = {
        huitieme: ['quart', 4],
        quart: ['demi', 2],
        demi: ['finale', 1],
        finale: []
    };

    let current = startPhase;
    while (nextPhases[current]?.length) {
        const [next, count] = nextPhases[current];
        tableau[next] = Array.from({ length: count }, (_, i) => ({
            id: i + 1,
            equipeA: null,
            equipeB: null,
            scoreA: 0,
            scoreB: 0,
            vainqueur: null
        }));
        current = next;
    }

    dataService.writeFile('tableau', tableau);
    dataService.addLog('Tableau éliminatoire créé', { startPhase, nbEquipes: qualifiees.length });
    res.status(201).json({ startPhase, tableau });
});

router.post('/tableau/assign/:phase/:id', async (req, res) => {
    try {
        const { phase, id } = req.params;
        const { tatamiId } = req.body;

        const tableau = dataService.readFile('tableau');
        const match = tableau[phase]?.find(m => m.id === +id);

        if (!match) {
            return res.status(404).json({ error: 'Match introuvable' });
        }

        if (!match.equipeA || !match.equipeB) {
            return res.status(400).json({ error: 'Match incomplet' });
        }

        // Générer les combats
        const combatService = require('../services/combatService');
        const combats = await combatService.genererCombatsEquipes(match.equipeA, match.equipeB);

        if (combats.length === 0) {
            return res.status(400).json({ error: 'Aucun combat généré' });
        }

        // Assigner au tatami
        const tatamiService = require('../services/tatamiService');
        const result = await tatamiService.assignerCombats(tatamiId, combats.map(c => c.id));

        if (!result.success) {
            return res.status(400).json(result);
        }

        // Mettre à jour le match tableau
        match.combatsIds = combats.map(c => c.id);
        match.assigné = true;
        match.tatamiId = tatamiId;
        match.dateAssignation = new Date().toISOString();

        dataService.writeFile('tableau', tableau);

        dataService.addLog(`Match tableau assigné: ${phase} ${id}`, {
            phase, matchId: id, tatamiId, combatsCreated: combats.length
        });

        res.json({
            success: true,
            combatsCrees: combats.length,
            combatsIds: combats.map(c => c.id),
            tatami: result.tatami
        });

    } catch (error) {
        console.error('Erreur assignation tableau:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

router.patch('/tableau/:phase/:id', (req, res) => {
    const { phase, id } = req.params;
    const tableau = dataService.readFile('tableau');
    const match = tableau[phase]?.find(m => m.id === +id);
    if (!match) return res.status(404).json({ error: 'Match non trouvé' });

    match.scoreA = req.body.scoreA;
    match.scoreB = req.body.scoreB;
    match.vainqueur = req.body.vainqueur;

    dataService.writeFile('tableau', tableau);
    dataService.addLog('Match du tableau mis à jour', { phase, matchId: id });
    res.json(match);
});

// Calculer le score d'un match tableau basé sur les combats terminés
router.get('/tableau/:phase/:id/calculer-score', async (req, res) => {
    try {
        const {phase, id} = req.params;
        const tableau = dataService.readFile('tableau');
        const match = tableau[phase]?.find(m => m.id === +id);

        if (!match) {
            return res.status(404).json({error: 'Match introuvable'});
        }

        if (!match.combatsIds || match.combatsIds.length === 0) {
            return res.json({scoreA: 0, scoreB: 0, termine: false});
        }

        const combats = dataService.readFile('combats');
        const combatService = require('../services/combatService');

        let scoreA = 0;
        let scoreB = 0;
        let tousTermines = true;

        for (const combatId of match.combatsIds) {
            const combat = combats.find(c => c.id === combatId);
            if (!combat || combat.etat !== 'terminé') {
                tousTermines = false;
                continue;
            }

            const combatEnrichi = await combatService.enrichCombatAsync(combat);
            const vainqueur = combatService.determinerVainqueur(combat);

            // Déterminer si rouge = equipeA ou equipeB
            const rougeEstEquipeA = combatEnrichi.rouge.equipeId === match.equipeA;

            if (vainqueur === 'rouge') {
                if (rougeEstEquipeA) scoreA++;
                else scoreB++;
            } else if (vainqueur === 'bleu') {
                if (rougeEstEquipeA) scoreB++;
                else scoreA++;
            }
        }

        // Si tous les combats sont terminés, mettre à jour automatiquement
        if (tousTermines && match.vainqueur === null) {
            match.scoreA = scoreA;
            match.scoreB = scoreB;
            match.vainqueur = scoreA > scoreB ? 'A' : (scoreB > scoreA ? 'B' : null);

            if (match.vainqueur) {
                match.dateFinMatch = new Date().toISOString();
            }

            dataService.writeFile('tableau', tableau);

            dataService.addLog('Score match tableau calculé automatiquement', {
                phase, matchId: id, scoreA, scoreB, vainqueur: match.vainqueur
            });
        }

        res.json({
            scoreA,
            scoreB,
            vainqueur: match.vainqueur,
            termine: tousTermines,
            combatsRestants: match.combatsIds.length - combats.filter(c =>
                match.combatsIds.includes(c.id) && c.etat === 'terminé'
            ).length
        });

    } catch (error) {
        console.error('Erreur calcul score:', error);
        res.status(500).json({error: 'Erreur serveur'});
    }
});

router.post('/tableau/advance/:phase/:id', (req, res) => {
    const { phase, id } = req.params;
    const tableau = dataService.readFile('tableau');
    const match = tableau[phase]?.find(m => m.id === +id);
    if (!match) return res.status(404).json({ error: 'Match introuvable' });
    if (!match.vainqueur) return res.status(400).json({ error: 'Aucun vainqueur défini.' });

    const winner = match.vainqueur === 'A' ? match.equipeA : match.equipeB;

    if (phase === 'seizieme') {
        // Seizièmes → Huitièmes : 16 matchs → 8 matchs
        const huitiemeIndex = Math.floor((+id - 1) / 2);
        const huitiemeMatch = tableau.huitieme[huitiemeIndex];
        if ((+id % 2) === 1) huitiemeMatch.equipeA = winner;
        else huitiemeMatch.equipeB = winner;
    } else if (phase === 'huitieme') {
        // Huitièmes → Quarts : 8 matchs → 4 matchs
        const quartIndex = Math.floor((+id - 1) / 2);
        const quartMatch = tableau.quart[quartIndex];
        if ((+id % 2) === 1) quartMatch.equipeA = winner;
        else quartMatch.equipeB = winner;
    } else if (phase === 'quart') {
        // Quarts → Demis : 4 matchs → 2 matchs
        const demiIndex = Math.floor((+id - 1) / 2);
        const demiMatch = tableau.demi[demiIndex];
        if ((+id % 2) === 1) demiMatch.equipeA = winner;
        else demiMatch.equipeB = winner;
    } else if (phase === 'demi') {// Demis → Finale : 2 matchs → 1 match
        const finaleMatch = tableau.finale[0];
        if (+id === 1) finaleMatch.equipeA = winner;
        else finaleMatch.equipeB = winner;
    } else if (phase === 'finale') {
        // Finale terminée
        dataService.addLog('Finale terminée', { champion: winner });
        return res.json({ success: true, champion: winner, tableau });
    }
    dataService.writeFile('tableau', tableau);
    dataService.addLog('Vainqueur avancé dans le tableau', {
        phase,
        matchId: id,
        winner,
        nextPhase: getNextPhase(phase)
    });
    res.json({ success: true, tableau });
});

router.delete('/tableau', (req, res) => {
    dataService.writeFile('tableau', { quart: [], demi: [], finale: [] });
    dataService.addLog('Tableau éliminatoire réinitialisé');
    res.json({ success: true });
});

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

router.get('/logs', async (req, res) => {
    const logs = await dataService.getAllLogs();
    res.json(logs.slice(-100)); // Derniers 100 logs
});

// Export/Import
router.get('/export', async (req, res) => {
    const exportData = await dataService.exportAll();
    res.setHeader('Content-Disposition', 'attachment; filename="backup_judo.json"');
    res.json(exportData);
});

router.post('/import', (req, res) => {
    try {
        dataService.importAll(req.body);

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

        dataService.addLog('Toutes les données ont été réinitialisées');
        res.json({ success: true });
    } catch (error) {
        console.error('Erreur reset:', error);
        res.status(500).json({ error: 'Erreur lors de la réinitialisation' });
    }
});

// Statistiques globales
router.get('/stats', async (req, res) => {
    const rapport = await classementService.genererRapportCompetition();
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
        console.log(`✅ Backup ${filename} restauré avec succès`);
    }
    res.json(result);
});


module.exports = router;