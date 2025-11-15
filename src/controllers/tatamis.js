// src/controllers/tatamis.js
const dataService = require('../services/databaseAdapter');

class TatamisController {
    /**
     * GET /api/tatamis
     */
    async getAll(req, res) {
        try {

            const tatamis = await dataService.getAllTatamis();

            console.log('🔧 [Backend] getAllTatamis retourne:', tatamis);
            console.log('🔧 [Backend] Type:', typeof tatamis);
            console.log('🔧 [Backend] Est un tableau?', Array.isArray(tatamis));

            // ✅ S'assurer que c'est un tableau
            if (!Array.isArray(tatamis)) {
                console.error('❌ [Backend] tatamis n\'est pas un tableau!');
                return res.json([]);
            }

            // ✅ TRANSFORMER les tatamis pour le frontend
            const tatamisFormates = tatamis.map(tatami => ({
                ...tatami,
                // ✅ Transformer snake_case → camelCase pour le frontend
                scoreConfrontation: {
                    rouge: tatami.score_rouge || 0,
                    bleu: tatami.score_bleu || 0
                },
                indexCombatActuel: tatami.index_combat_actuel || 0,
                combatsIds: tatami.combatsIds || []
            }));

            res.json(tatamisFormates);
        } catch (error) {
            console.error('❌ Erreur récupération tatamis:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }


    /**
     * GET /api/tatamis/:id/combat-actuel
     */
    async getCombatActuel(req, res) {
        try {
            const tatamiId = +req.params.id;
            const tatami = await dataService.getTatamiById(tatamiId);

            if (!tatami) {
                return res.status(404).json({ error: "Tatami introuvable" });
            }

            const combatId = tatami.combatsIds[tatami.index_combat_actuel || tatami.indexCombatActuel || 0];
            if (!combatId) {
                return res.json(null);
            }

            const combat = await dataService.getCombatById(combatId);
            if (!combat) {
                return res.json(null);
            }

            // TODO: Enrichir les données du combat (sera fait dans le service métier)
            res.json(combat);
        } catch (error) {
            console.error('Erreur combat actuel:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * GET /api/tatamis/:id/historique-combats
     */
    async getHistoriqueCombats(req, res) {
        try {
            const tatamiId = +req.params.id;
            const tatamiService = require('../services/tatamiService');

            const historique = await tatamiService.getHistoriqueCombats(tatamiId);
            res.json(historique);
        } catch (error) {
            console.error('Erreur historique combats:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * POST /api/tatamis
     */
    async create(req, res) {
        try {
            const newTatami = {
                nom: req.body.nom || `Tatami ${Date.now()}`,
                etat: 'libre',
                combatsIds: [],
                index_combat_actuel: 0,
                date_creation: new Date().toISOString(),
                historique: [],
                score_rouge:0,
                score_bleu:0
            };

            const tatami = await dataService.createTatami(newTatami);
            dataService.addLog(`Nouveau tatami créé: ${tatami.nom}`, { tatamiId: tatami.id });

            // Broadcast sera géré dans les routes
            res.locals.tatami = tatami;
            res.status(201).json(tatami);
        } catch (error) {
            console.error('Erreur création tatami:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * PATCH /api/tatamis/:id
     */
    async update(req, res) {
        try {
            const tatamiId = +req.params.id;
            const updates = req.body;

            const tatami = await dataService.updateTatami(tatamiId, updates);
            if (!tatami) {
                return res.status(404).json({ error: 'Tatami non trouvé' });
            }

            dataService.addLog(`Tatami modifié: ${tatami.nom}`, {
                tatamiId: tatami.id,
                changes: Object.keys(updates)
            });

            res.locals.tatami = tatami;
            res.json(tatami);
        } catch (error) {
            console.error('Erreur mise à jour tatami:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * PATCH /api/tatamis/:id/assigner
     */
    async assignerCombats(req, res) {
        try {
            const tatamiId = +req.params.id;
            const { combatsIds } = req.body;

            const tatami = await dataService.getTatamiById(tatamiId);
            if (!tatami) {
                return res.status(404).json({ error: 'Tatami non trouvé' });
            }

            if (!Array.isArray(combatsIds) || combatsIds.length === 0) {
                return res.status(400).json({ error: 'Liste combatsIds invalide' });
            }

            // Vérifier que tous les combats existent
            const combatsValides = [];
            for (const combatId of combatsIds) {
                const combat = await dataService.getCombatById(combatId);
                if (!combat) {
                    return res.status(404).json({ error: `Combat ${combatId} introuvable` });
                }
                combatsValides.push(combatId);
            }

            // Mise à jour du tatami
            const updates = {
                combatsIds: [...(tatami.combatsIds || []), ...combatsValides],
                index_combat_actuel: 0,
                etat: 'occupé',
                historique: [
                    ...(tatami.historique || []),
                    {
                        timestamp: new Date().toISOString(),
                        action: 'assigner_combats',
                        combats: combatsValides
                    }
                ]
            };

            const updatedTatami = await dataService.updateTatami(tatamiId, updates);

            // TODO: Mise à jour des poules (sera dans le service métier)

            dataService.addLog(`Combats assignés au tatami ${updatedTatami.nom}`, {
                tatamiId,
                combatsIds: combatsValides
            });

            res.locals.tatami = updatedTatami;
            res.json({ success: true, tatami: updatedTatami });
        } catch (error) {
            console.error('Erreur assignation combats:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * PATCH /api/tatamis/:id/etat
     */
    async changerEtat(req, res) {
        try {
            const tatamiId = +req.params.id;
            const { etat } = req.body;

            const etatsValides = ['libre', 'occupé', 'pause'];
            if (!etatsValides.includes(etat)) {
                return res.status(400).json({ error: 'État invalide' });
            }

            const tatami = await dataService.getTatamiById(tatamiId);
            if (!tatami) {
                return res.status(404).json({ error: 'Tatami non trouvé' });
            }

            const updates = {
                etat,
                historique: [
                    ...(tatami.historique || []),
                    {
                        timestamp: new Date().toISOString(),
                        action: 'changer_etat',
                        etat
                    }
                ]
            };

            await dataService.updateTatami(tatamiId, updates);
            dataService.addLog(`État du tatami ${tatami.nom} changé: ${etat}`, { tatamiId });

            res.json({ success: true });
        } catch (error) {
            console.error('Erreur changement état:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * PATCH /api/tatamis/:id/liberer
     */
    async liberer(req, res) {
        try {
            const tatamiId = +req.params.id;
            const tatami = await dataService.getTatamiById(tatamiId);

            if (!tatami) {
                return res.status(404).json({ error: 'Tatami non trouvé' });
            }

            const updates = {
                combatsIds: [],
                index_combat_actuel: 0,
                etat: 'libre',
                score_rouge: 0,
                score_bleu: 0,
                historique: [
                    ...(tatami.historique || []),
                    {
                        timestamp: new Date().toISOString(),
                        action: 'liberer_tatami'
                    }
                ]
            };

            const updatedTatami = await dataService.updateTatami(tatamiId, updates);
            dataService.addLog(`Tatami ${tatami.nom} libéré`, { tatamiId });

            res.locals.tatami = updatedTatami;
            res.json({ success: true, tatami: updatedTatami });
        } catch (error) {
            console.error('Erreur libération tatami:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * POST /api/tatamis/:id/suivant
     */
    async combatSuivant(req, res) {
        try {
            const tatamiId = +req.params.id;
            const tatami = await dataService.getTatamiById(tatamiId);

            if (!tatami) {
                return res.status(404).json({ error: 'Tatami non trouvé' });
            }

            const indexActuel = tatami.indexCombatActuel || 0;
            const nombreCombats = tatami.combatsIds.length;

            if (indexActuel >= nombreCombats - 1) {
                return res.status(400).json({ error: 'Déjà au dernier combat' });
            }

            const nouvelIndex = indexActuel + 1;
            const updates = {
                index_combat_actuel: nouvelIndex,
                historique: [
                    ...(tatami.historique || []),
                    {
                        timestamp: new Date().toISOString(),
                        action: 'combat_suivant',
                        index: nouvelIndex
                    }
                ]
            };

            await dataService.updateTatami(tatamiId, updates);
            await dataService.addLog(`Tatami ${tatami.nom} - Combat suivant`, {
                tatamiId,
                index: nouvelIndex
            });

            res.json({ success: true, index: nouvelIndex });
        } catch (error) {
            console.error('Erreur combat suivant:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * POST /api/tatamis/:id/precedent
     */
    async combatPrecedent(req, res) {
        try {
            const tatamiId = +req.params.id;
            const tatami = await dataService.getTatamiById(tatamiId);

            if (!tatami) {
                return res.status(404).json({ error: 'Tatami non trouvé' });
            }

            const indexActuel = tatami.indexCombatActuel || 0;

            if (indexActuel <= 0) {
                return res.status(400).json({ error: 'Déjà au premier combat' });
            }

            const nouvelIndex = indexActuel - 1;
            const updates = {
                index_combat_actuel: nouvelIndex,
                historique: [
                    ...(tatami.historique || []),
                    {
                        timestamp: new Date().toISOString(),
                        action: 'combat_precedent',
                        index: nouvelIndex
                    }
                ]
            };

            await dataService.updateTatami(tatamiId, updates);
            dataService.addLog(`Tatami ${tatami.nom} - Combat précédent`, {
                tatamiId,
                index: nouvelIndex
            });

            res.json({ success: true, index: nouvelIndex });
        } catch (error) {
            console.error('Erreur combat précédent:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * DELETE /api/tatamis/:id
     */
    async delete(req, res) {
        try {
            const tatamiId = +req.params.id;

            const tatami = await dataService.getTatamiById(tatamiId);
            if (!tatami) {
                return res.status(404).json({ error: 'Tatami introuvable' });
            }

            // Vérifier s'il y a des combats assignés
            if (tatami.combatsIds && tatami.combatsIds.length > 0) {
                // Optionnel : supprimer aussi les combats ou juste les désassigner
                // Pour l'instant, on permet la suppression même avec des combats
            }

            const deleted = await dataService.deleteTatami(tatamiId);
            if (!deleted) {
                return res.status(404).json({ error: 'Tatami introuvable' });
            }

            dataService.addLog(`Tatami supprimé: ${tatami.nom}`, { tatamiId });
            res.json({ success: true });
        } catch (error) {
            console.error('Erreur suppression tatami:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * GET /api/tatamis/:id
     */
    async getById(req, res) {
        try {
            const tatamiId = +req.params.id;
            const tatami = await dataService.getTatamiById(tatamiId);

            if (!tatami) {
                return res.status(404).json({ error: 'Tatami introuvable' });
            }
            const tatamiFormate = {
                ...tatami,
                scoreConfrontation: {
                    rouge: tatami.score_rouge || 0,
                    bleu: tatami.score_bleu || 0
                },
                indexCombatActuel: tatami.index_combat_actuel || 0,
                combatsIds: tatami.combatsIds || []
            };

            res.json(tatamiFormate);
        } catch (error) {
            console.error('Erreur récupération tatami:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }


}

module.exports = new TatamisController();