// src/controllers/poules.js
const dataService = require('../services/dataService');

class PoulesController {
    /**
     * GET /api/poules
     */
    async getAll(req, res) {
        try {
            const poules = dataService.readFile('poules');
            res.json(poules);
        } catch (error) {
            console.error('Erreur récupération poules:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * GET /api/poules/:id
     */
    async getById(req, res) {
        try {
            const pouleId = +req.params.id;
            const poule = dataService.findById('poules', pouleId);

            if (!poule) {
                return res.status(404).json({ error: 'Poule introuvable' });
            }

            res.json(poule);
        } catch (error) {
            console.error('Erreur récupération poule:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * POST /api/poules - Création automatique des poules
     */
    async create(req, res) {
        try {
            const nbPoules = parseInt(req.body.nbPoules || 1);

            if (nbPoules <= 0 || nbPoules > 10) {
                return res.status(400).json({ error: 'Nombre de poules invalide (1-10)' });
            }

            const equipes = dataService.readFile('equipes');
            if (equipes.length === 0) {
                return res.status(400).json({ error: 'Aucune équipe disponible' });
            }

            if (equipes.length < nbPoules) {
                return res.status(400).json({
                    error: `Pas assez d'équipes (${equipes.length}) pour ${nbPoules} poules`
                });
            }

            // Mélange aléatoire des équipes
            const shuffled = [...equipes].sort(() => Math.random() - 0.5);

            // Création des poules
            const poules = Array.from({ length: nbPoules }, (_, i) => ({
                id: i + 1,
                nom: `Poule ${String.fromCharCode(65 + i)}`, // A, B, C, etc.
                equipesIds: [],
                rencontres: [],
                classement: []
            }));

            // Répartition des équipes dans les poules (round-robin)
            shuffled.forEach((equipe, index) => {
                const pouleIndex = index % nbPoules;
                poules[pouleIndex].equipesIds.push(equipe.id);
                poules[pouleIndex].classement.push({
                    equipeId: equipe.id,
                    points: 0,
                    victoires: 0,
                    defaites: 0
                });
            });

            // Génération des rencontres pour chaque poule (round-robin)
            poules.forEach(poule => {
                const equipesIds = poule.equipesIds;

                for (let i = 0; i < equipesIds.length; i++) {
                    for (let j = i + 1; j < equipesIds.length; j++) {
                        const rencontreId = dataService.generateId();
                        poule.rencontres.push({
                            id: rencontreId,
                            equipeA: equipesIds[i],
                            equipeB: equipesIds[j],
                            combatsIds: [],
                            resultat: null,
                            etat: 'prevue'
                        });
                    }
                }
            });

            // Sauvegarder les poules
            dataService.writeFile('poules', poules);

            dataService.addLog(`${nbPoules} poules créées avec ${equipes.length} équipes`, {
                nbPoules,
                nbEquipes: equipes.length,
                poulesIds: poules.map(p => p.id)
            });
            res.locals.poule = poules;
            res.status(201).json(poules);
        } catch (error) {
            console.error('Erreur création poules:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * PATCH /api/poules/:id
     */
    async update(req, res) {
        try {
            const pouleId = +req.params.id;
            const updates = req.body;

            const poule = dataService.update('poules', pouleId, updates);
            if (!poule) {
                return res.status(404).json({ error: 'Poule introuvable' });
            }

            dataService.addLog(`Poule modifiée: ${poule.nom}`, {
                pouleId,
                changes: Object.keys(updates)
            });
            res.locals.poule = poule;
            res.json(poule);
        } catch (error) {
            console.error('Erreur mise à jour poule:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * PATCH /api/poules/:id/classement
     */
    async updateClassement(req, res) {
        try {
            const pouleId = +req.params.id;
            const { classement } = req.body;

            if (!Array.isArray(classement)) {
                return res.status(400).json({ error: 'Classement doit être un tableau' });
            }

            const updates = { classement };
            const poule = dataService.update('poules', pouleId, updates);

            if (!poule) {
                return res.status(404).json({ error: 'Poule non trouvée' });
            }

            dataService.addLog(`Classement de poule mis à jour: ${poule.nom}`, {
                pouleId,
                nbEquipes: classement.length
            });

            res.json({ success: true });
        } catch (error) {
            console.error('Erreur mise à jour classement:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * DELETE /api/poules - Reset de toutes les poules
     */
    async deleteAll(req, res) {
        try {
            dataService.writeFile('poules', []);
            dataService.addLog('Toutes les poules ont été supprimées');

            res.json({ success: true });
        } catch (error) {
            console.error('Erreur suppression poules:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * GET /api/classement/poule/:id
     */
    async getClassementPoule(req, res) {
        try {
            const pouleId = +req.params.id;
            const classementService = require('../services/classementService');

            const poule = classementService.calculerClassementPoule(pouleId);
            if (!poule) {
                return res.status(404).json({ error: 'Poule non trouvée' });
            }

            res.json(poule);
        } catch (error) {
            console.error('Erreur classement poule:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * GET /api/classement/general
     */
    async getClassementGeneral(req, res) {
        console.log('🔥 getClassementGeneral appelée !');
        try {
            console.log('🔍 Chargement du service...');
            const classementService = require('../services/classementService');

            console.log('📊 Calcul du classement...');
            const classement = classementService.calculerClassementGeneral();

            console.log('✅ Classement calculé:', classement.length, 'équipes');
            console.log('📋 Premier élément:', JSON.stringify(classement[0], null, 2));

            res.json(classement);
        } catch (error) {
            console.error('❌ ERREUR classement général:', error.message);
            console.error('📍 Stack:', error.stack);
            res.status(500).json({ error: 'Erreur serveur', details: error.message });
        }
    }

    /**
     * GET /api/confrontations/en-cours
     */
    async getConfrontationsEnCours(req, res) {
        try {
            const tatamis = dataService.readFile('tatamis');
            const combats = dataService.readFile('combats');

            const enCours = tatamis.flatMap(tatami => {
                if (!tatami.combatsIds || tatami.combatsIds.length === 0) {
                    return [];
                }

                const index = tatami.indexCombatActuel ?? 0;
                const combatId = tatami.combatsIds[index];
                const combatActuel = combats.find(c => c.id === combatId);

                if (!combatActuel || !['en cours', 'prévu'].includes(combatActuel.etat)) {
                    return [];
                }

                return [{
                    tatami: tatami.nom || `Tatami ${tatami.id}`,
                    equipeRougeId: combatActuel.rouge?.equipeId || combatActuel.rouge?.id,
                    equipeBleuId: combatActuel.bleu?.equipeId || combatActuel.bleu?.id,
                    equipeRougeNom: combatActuel.rouge?.equipe || combatActuel.rouge?.nom || 'Rouge',
                    equipeBleuNom: combatActuel.bleu?.equipe || combatActuel.bleu?.nom || 'Bleu',
                    combatId: combatActuel.id,
                    etat: combatActuel.etat
                }];
            });

            res.json(enCours);
        } catch (error) {
            console.error('Erreur confrontations en cours:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * POST /api/poules/assign-combat - Assigner un combat à partir d'une rencontre
     * Paramètres optionnels:
     *  - selection: [{categorie, rougeId, bleuId}, ...] pour sélection manuelle
     */
    async assignCombat(req, res) {
        try {
            const { rencontreId, tatamiId, selection } = req.body;

            if (!rencontreId || !tatamiId) {
                return res.status(400).json({ error: 'rencontreId et tatamiId requis' });
            }

            // Utiliser combatService pour générer les combats
            const combatService = require('../services/combatService');
            const tatamiService = require('../services/tatamiService');

            // Trouver la rencontre
            const poules = dataService.readFile('poules');
            let rencontre = null;

            for (const poule of poules) {
                rencontre = poule.rencontres.find(r => r.id == rencontreId);
                if (rencontre) break;
            }

            if (!rencontre) {
                return res.status(404).json({ error: 'Rencontre introuvable' });
            }

            // Générer les combats - soit avec sélection manuelle, soit automatique
            let combats;
            if (selection && Array.isArray(selection) && selection.length > 0) {
                // Mode sélection manuelle
                combats = combatService.genererCombatsAvecSelection(
                    rencontre.equipeA,
                    rencontre.equipeB,
                    selection
                );
            } else {
                // Mode automatique (comportement par défaut)
                combats = combatService.genererCombatsEquipes(
                    rencontre.equipeA,
                    rencontre.equipeB
                );
            }

            if (combats.length === 0) {
                return res.status(400).json({ error: 'Aucun combat valide généré' });
            }

            const combatsIds = combats.map(c => c.id);

            // Assigner au tatami
            const result = tatamiService.assignerCombats(tatamiId, combatsIds);
            if (!result.success) {
                return res.status(400).json(result);
            }

            // Mettre à jour la rencontre
            rencontre.combatsIds = combatsIds;
            rencontre.etat = 'assignee';
            dataService.writeFile('poules', poules);

            res.locals.tatami = result.tatami;
            res.json({
                success: true,
                combatsCrees: combats.length,
                rencontre,
                tatami: result.tatami,
                modeSelection: !!selection
            });

        } catch (error) {
            console.error('Erreur assignation combat:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * GET /api/poules/rencontre/:id/combattants-disponibles
     * Retourne les combattants disponibles par catégorie pour une rencontre
     */
    async getCombattantsDisponibles(req, res) {
        try {
            const rencontreId = +req.params.id;

            // Trouver la rencontre
            const poules = dataService.readFile('poules');
            let rencontre = null;

            for (const poule of poules) {
                rencontre = poule.rencontres.find(r => r.id === rencontreId);
                if (rencontre) break;
            }

            if (!rencontre) {
                return res.status(404).json({ error: 'Rencontre introuvable' });
            }

            const combatService = require('../services/combatService');
            const combattants = dataService.readFile('combattants');

            // Récupérer les combattants de chaque équipe
            const combattantsA = combattants.filter(c => c.equipeId === rencontre.equipeA);
            const combattantsB = combattants.filter(c => c.equipeId === rencontre.equipeB);

            // Grouper par catégorie (utilisera la méthode privée via une fonction publique)
            const categoriesA = {};
            const categoriesB = {};

            combattantsA.forEach(c => {
                const categorieAge = c.categorieAge || combatService.determinerCategorieAge(c.sexe, c.poids);
                const cle = `${categorieAge || 'inconnu'}|${c.sexe}|${c.poids}`;
                if (!categoriesA[cle]) categoriesA[cle] = [];
                categoriesA[cle].push(c);
            });

            combattantsB.forEach(c => {
                const categorieAge = c.categorieAge || combatService.determinerCategorieAge(c.sexe, c.poids);
                const cle = `${categorieAge || 'inconnu'}|${c.sexe}|${c.poids}`;
                if (!categoriesB[cle]) categoriesB[cle] = [];
                categoriesB[cle].push(c);
            });

            // Construire la liste des catégories communes
            const categories = [];
            Object.keys(categoriesA).forEach(categorie => {
                if (categoriesB[categorie]) {
                    const [categorieAge, sexe, poids] = categorie.split('|');
                    categories.push({
                        categorie,
                        categorieAge,
                        sexe,
                        poids,
                        combattantsRouge: categoriesA[categorie],
                        combattantsBleu: categoriesB[categorie]
                    });
                }
            });

            res.json({
                rencontreId,
                equipeA: rencontre.equipeA,
                equipeB: rencontre.equipeB,
                categories
            });

        } catch (error) {
            console.error('Erreur récupération combattants disponibles:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }
}

module.exports = new PoulesController();