// src/routes/tableauRoutes.js
// Routes pour le système de double tableau (Principal + Consolante + Bronze)

const dataService = require('../services/dataService');

// ==========================================
// FONCTIONS UTILITAIRES
// ==========================================

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

/**
 * Détermine la phase de départ basée sur le nombre d'équipes
 */
function determineStartPhase(nbEquipes) {
    if (nbEquipes <= 2) return 'finale';
    if (nbEquipes <= 4) return 'demi';
    if (nbEquipes <= 8) return 'quart';
    if (nbEquipes <= 16) return 'huitieme';
    return 'seizieme';
}

/**
 * Génère les matchs pour une phase avec gestion des byes
 */
function generateMatches(teams, phaseKey) {
    const matches = [];

    // Si nombre impair, ajouter un bye (null)
    const teamsWithBye = [...teams];
    if (teams.length % 2 !== 0) {
        teamsWithBye.push(null); // Bye
    }

    for (let i = 0; i < teamsWithBye.length; i += 2) {
        const equipeA = teamsWithBye[i];
        const equipeB = teamsWithBye[i + 1];

        // Si l'une des équipes est null (bye), l'autre gagne automatiquement
        const hasBye = equipeA === null || equipeB === null;
        const byeWinner = equipeA === null ? 'B' : (equipeB === null ? 'A' : null);

        matches.push({
            id: (i / 2) + 1,
            equipeA: equipeA,
            equipeB: equipeB,
            scoreA: 0,
            scoreB: 0,
            vainqueur: byeWinner, // Si bye, vainqueur déjà défini
            hasBye: hasBye,
            combatsIds: [],
            assigné: hasBye // Si bye, pas besoin d'assigner
        });
    }

    return matches;
}

/**
 * Crée la structure complète d'un tableau
 */
function createTableauStructure(teams, startPhase) {
    const tableau = {
        seizieme: [],
        huitieme: [],
        quart: [],
        demi: [],
        finale: []
    };

    // Générer les matchs de la phase de départ
    tableau[startPhase] = generateMatches(teams, startPhase);

    // Créer les phases suivantes (vides)
    const nextPhases = {
        seizieme: ['huitieme', 8],
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
            vainqueur: null,
            hasBye: false,
            combatsIds: [],
            assigné: false
        }));
        current = next;
    }

    return tableau;
}

// ==========================================
// ROUTES
// ==========================================

function setupTableauRoutes(router) {

    // GET /api/tableau - Récupérer tout le tableau
    router.get('/tableau', (req, res) => {
        const tableau = dataService.readFile('tableau');
        res.json(tableau);
    });

    // POST /api/tableau - Générer les 2 tableaux (principal + consolante)
    router.post('/tableau', (req, res) => {
        const { principal, consolante } = req.body;

        if (!principal || principal.length < 2) {
            return res.status(400).json({ error: 'Il faut au moins 2 équipes pour le tableau principal.' });
        }

        // Mélanger les équipes
        const shuffledPrincipal = principal.sort(() => Math.random() - 0.5);
        const shuffledConsolante = consolante ? consolante.sort(() => Math.random() - 0.5) : [];

        // Déterminer les phases de départ
        const startPhasePrincipal = determineStartPhase(shuffledPrincipal.length);
        const startPhaseConsolante = consolante && consolante.length >= 2
            ? determineStartPhase(shuffledConsolante.length)
            : null;

        // Créer les tableaux
        const tableauPrincipal = createTableauStructure(shuffledPrincipal, startPhasePrincipal);
        const tableauConsolante = shuffledConsolante.length >= 2
            ? createTableauStructure(shuffledConsolante, startPhaseConsolante)
            : { seizieme: [], huitieme: [], quart: [], demi: [], finale: [] };

        // Créer les matchs bronze (vides au départ)
        const bronze = [
            {
                id: 1,
                equipeA: null, // Perdant demi 1 du principal
                equipeB: null, // Finaliste 1 de la consolante
                scoreA: 0,
                scoreB: 0,
                vainqueur: null,
                combatsIds: [],
                assigné: false,
                description: 'Bronze #1'
            },
            {
                id: 2,
                equipeA: null, // Perdant demi 2 du principal
                equipeB: null, // Finaliste 2 de la consolante
                scoreA: 0,
                scoreB: 0,
                vainqueur: null,
                combatsIds: [],
                assigné: false,
                description: 'Bronze #2'
            }
        ];

        const tableau = {
            principal: tableauPrincipal,
            consolante: tableauConsolante,
            bronze: bronze
        };

        dataService.writeFile('tableau', tableau);
        dataService.addLog('Tableaux créés (Principal + Consolante + Bronze)', {
            nbEquipesPrincipal: principal.length,
            nbEquipesConsolante: consolante ? consolante.length : 0,
            startPhasePrincipal,
            startPhaseConsolante
        });

        res.status(201).json({
            success: true,
            startPhasePrincipal,
            startPhaseConsolante,
            tableau
        });
    });

    // POST /api/tableau/:type/:phase/:id/assign - Assigner un match à un tatami
    router.post('/tableau/:type/:phase/:id/assign', async (req, res) => {
        try {
            const { type, phase, id } = req.params;
            const { tatamiId } = req.body;

            if (type !== 'principal' && type !== 'consolante' && type !== 'bronze') {
                return res.status(400).json({ error: 'Type doit être "principal", "consolante" ou "bronze"' });
            }

            const tableau = dataService.readFile('tableau');
            const matches = type === 'bronze' ? tableau.bronze : tableau[type][phase];
            const match = type === 'bronze'
                ? matches.find(m => m.id === +id)
                : matches?.find(m => m.id === +id);

            if (!match) {
                return res.status(404).json({ error: 'Match introuvable' });
            }

            if (match.hasBye) {
                return res.status(400).json({ error: 'Ce match a un bye, pas besoin de l\'assigner' });
            }

            if (!match.equipeA || !match.equipeB) {
                return res.status(400).json({ error: 'Match incomplet (équipes manquantes)' });
            }

            // Générer les combats
            const combatService = require('../services/combatService');
            const combats = combatService.genererCombatsEquipes(match.equipeA, match.equipeB);

            if (combats.length === 0) {
                return res.status(400).json({ error: 'Aucun combat généré (catégories incompatibles)' });
            }

            // Assigner au tatami
            const tatamiService = require('../services/tatamiService');
            const result = tatamiService.assignerCombats(tatamiId, combats.map(c => c.id));

            if (!result.success) {
                return res.status(400).json(result);
            }

            // Mettre à jour le match
            match.combatsIds = combats.map(c => c.id);
            match.assigné = true;
            match.tatamiId = tatamiId;
            match.dateAssignation = new Date().toISOString();

            dataService.writeFile('tableau', tableau);
            dataService.addLog(`Match ${type} assigné: ${phase} ${id}`, {
                type, phase, matchId: id, tatamiId, combatsCreated: combats.length
            });

            res.json({
                success: true,
                combatsCrees: combats.length,
                combatsIds: combats.map(c => c.id),
                tatami: result.tatami
            });

        } catch (error) {
            console.error('Erreur assignation match:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });

    // GET /api/tableau/:type/:phase/:id/calculer-score - Calculer le score automatiquement
    router.get('/tableau/:type/:phase/:id/calculer-score', (req, res) => {
        try {
            const { type, phase, id } = req.params;

            const tableau = dataService.readFile('tableau');
            const matches = type === 'bronze' ? tableau.bronze : tableau[type][phase];
            const match = type === 'bronze'
                ? matches.find(m => m.id === +id)
                : matches?.find(m => m.id === +id);

            if (!match) {
                return res.status(404).json({ error: 'Match introuvable' });
            }

            if (match.hasBye) {
                return res.json({ scoreA: 0, scoreB: 0, termine: true, vainqueur: match.vainqueur });
            }

            if (!match.combatsIds || match.combatsIds.length === 0) {
                return res.json({ scoreA: 0, scoreB: 0, termine: false });
            }

            const combats = dataService.readFile('combats');
            const combatService = require('../services/combatService');

            let scoreA = 0;
            let scoreB = 0;
            let tousTermines = true;

            match.combatsIds.forEach(combatId => {
                const combat = combats.find(c => c.id === combatId);
                if (!combat || combat.etat !== 'terminé') {
                    tousTermines = false;
                    return;
                }

                const combatEnrichi = combatService.enrichCombat(combat);
                const vainqueur = combatService.determinerVainqueur(combat);

                const rougeEstEquipeA = combatEnrichi.rouge.equipeId === match.equipeA;

                if (vainqueur === 'rouge') {
                    if (rougeEstEquipeA) scoreA++;
                    else scoreB++;
                } else if (vainqueur === 'bleu') {
                    if (rougeEstEquipeA) scoreB++;
                    else scoreA++;
                }
            });

            // Mise à jour automatique si tous les combats terminés
            if (tousTermines && match.vainqueur === null) {
                match.scoreA = scoreA;
                match.scoreB = scoreB;
                match.vainqueur = scoreA > scoreB ? 'A' : (scoreB > scoreA ? 'B' : null);

                if (match.vainqueur) {
                    match.dateFinMatch = new Date().toISOString();
                }

                dataService.writeFile('tableau', tableau);
                dataService.addLog('Score match calculé automatiquement', {
                    type, phase, matchId: id, scoreA, scoreB, vainqueur: match.vainqueur
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
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });

    // POST /api/tableau/:type/:phase/:id/advance - Faire avancer le vainqueur
    router.post('/tableau/:type/:phase/:id/advance', (req, res) => {
        try {
            const { type, phase, id } = req.params;

            const tableau = dataService.readFile('tableau');
            const matches = type === 'bronze' ? tableau.bronze : tableau[type][phase];
            const match = type === 'bronze'
                ? matches.find(m => m.id === +id)
                : matches?.find(m => m.id === +id);

            if (!match) {
                return res.status(404).json({ error: 'Match introuvable' });
            }

            if (!match.vainqueur) {
                return res.status(400).json({ error: 'Aucun vainqueur défini' });
            }

            const winner = match.vainqueur === 'A' ? match.equipeA : match.equipeB;
            const loser = match.vainqueur === 'A' ? match.equipeB : match.equipeA;

            // Gestion de l'avancement selon le type et la phase
            if (type === 'bronze') {
                // Match bronze terminé
                dataService.addLog('Match bronze terminé', { matchId: id, medailleBronze: winner });
                dataService.writeFile('tableau', tableau);
                return res.json({ success: true, medailleBronze: winner, tableau });
            }

            const currentTableau = tableau[type];

            // Avancement dans le tableau
            if (phase === 'seizieme') {
                const nextIndex = Math.floor((+id - 1) / 2);
                const nextMatch = currentTableau.huitieme[nextIndex];
                if ((+id % 2) === 1) nextMatch.equipeA = winner;
                else nextMatch.equipeB = winner;
            } else if (phase === 'huitieme') {
                const nextIndex = Math.floor((+id - 1) / 2);
                const nextMatch = currentTableau.quart[nextIndex];
                if ((+id % 2) === 1) nextMatch.equipeA = winner;
                else nextMatch.equipeB = winner;
            } else if (phase === 'quart') {
                const nextIndex = Math.floor((+id - 1) / 2);
                const nextMatch = currentTableau.demi[nextIndex];
                if ((+id % 2) === 1) nextMatch.equipeA = winner;
                else nextMatch.equipeB = winner;
            } else if (phase === 'demi') {
                // Demi-finale: envoyer le gagnant en finale
                const finaleMatch = currentTableau.finale[0];
                if (+id === 1) finaleMatch.equipeA = winner;
                else finaleMatch.equipeB = winner;

                // Si tableau PRINCIPAL: envoyer perdant en bronze
                if (type === 'principal') {
                    const bronzeMatch = tableau.bronze[+id - 1]; // Bronze 1 ou Bronze 2
                    bronzeMatch.equipeA = loser; // Perdant de demi principal
                    dataService.addLog('Perdant demi principal envoyé en bronze', {
                        demiId: id, equipe: loser, bronzeMatchId: bronzeMatch.id
                    });
                }
            } else if (phase === 'finale') {
                // Finale terminée
                if (type === 'principal') {
                    dataService.addLog('Finale principale terminée', { champion: winner });
                } else if (type === 'consolante') {
                    // Finaliste consolante va en bronze
                    const finalisteIndex = +id === 1 ? 0 : 1;
                    const bronzeMatch = tableau.bronze[finalisteIndex];
                    bronzeMatch.equipeB = winner; // Finaliste consolante
                    dataService.addLog('Finaliste consolante envoyé en bronze', {
                        equipe: winner, bronzeMatchId: bronzeMatch.id
                    });
                }

                dataService.writeFile('tableau', tableau);
                return res.json({ success: true, champion: winner, tableau });
            }

            dataService.writeFile('tableau', tableau);
            dataService.addLog('Vainqueur avancé', {
                type, phase, matchId: id, winner, nextPhase: getNextPhase(phase)
            });

            res.json({ success: true, tableau });

        } catch (error) {
            console.error('Erreur avancement:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    });

    // PATCH /api/tableau/:type/:phase/:id - Mettre à jour manuellement un match
    router.patch('/tableau/:type/:phase/:id', (req, res) => {
        const { type, phase, id } = req.params;

        const tableau = dataService.readFile('tableau');
        const matches = type === 'bronze' ? tableau.bronze : tableau[type][phase];
        const match = type === 'bronze'
            ? matches.find(m => m.id === +id)
            : matches?.find(m => m.id === +id);

        if (!match) {
            return res.status(404).json({ error: 'Match introuvable' });
        }

        if (req.body.scoreA !== undefined) match.scoreA = req.body.scoreA;
        if (req.body.scoreB !== undefined) match.scoreB = req.body.scoreB;
        if (req.body.vainqueur !== undefined) match.vainqueur = req.body.vainqueur;

        dataService.writeFile('tableau', tableau);
        dataService.addLog('Match mis à jour manuellement', { type, phase, matchId: id });

        res.json(match);
    });

    // DELETE /api/tableau - Réinitialiser tous les tableaux
    router.delete('/tableau', (req, res) => {
        const emptyTableau = {
            principal: { seizieme: [], huitieme: [], quart: [], demi: [], finale: [] },
            consolante: { seizieme: [], huitieme: [], quart: [], demi: [], finale: [] },
            bronze: []
        };

        dataService.writeFile('tableau', emptyTableau);
        dataService.addLog('Tableaux réinitialisés');

        res.json({ success: true });
    });
}

module.exports = setupTableauRoutes;
