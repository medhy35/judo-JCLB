// src/controllers/equipes.js
const dataService = require('../services/databaseAdapter');

class EquipesController {
    /**
     * GET /api/equipes
     */
    async getAll(req, res) {
        try {
            const equipes = await dataService.getAllEquipes();
            res.json(equipes);
        } catch (error) {
            console.error('Erreur récupération équipes:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * GET /api/equipes/:id
     */
    async getById(req, res) {
        try {
            const equipeId = req.params.id;
            const equipe = await dataService.getEquipeById(equipeId);

            if (!equipe) {
                return res.status(404).json({ error: 'Équipe introuvable' });
            }

            // Ajouter les combattants de l'équipe
            const combattants = await dataService.getCombattantsByEquipe(equipeId);
            const equipeComplete = {
                ...equipe,
                combattants
            };

            res.json(equipeComplete);
        } catch (error) {
            console.error('Erreur récupération équipe:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * POST /api/equipes
     */
    async create(req, res) {
        try {
            const { id, nom, couleur } = req.body;

            if (!id || !nom) {
                return res.status(400).json({ error: 'ID et nom sont requis' });
            }

            // Vérifier si l'équipe existe déjà
            const existing = await dataService.getEquipeById(id);
            if (existing) {
                return res.status(400).json({ error: 'Une équipe avec cet ID existe déjà' });
            }

            const newEquipe = {
                id,
                nom,
                couleur: couleur || 'primary',
                dateCreation: new Date().toISOString(),
                victoires: 0,
                points: 0,
                scoreGlobal: 0
            };

            const equipe = await dataService.createEquipe(newEquipe);
            dataService.addLog(`Nouvelle équipe créée: ${nom}`, { equipeId: id });
            res.locals.equipe = equipe;
            res.status(201).json(equipe);
        } catch (error) {
            console.error('Erreur création équipe:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * PATCH /api/equipes/:id
     */
    async update(req, res) {
        try {
            const equipeId = req.params.id;
            const updates = req.body;

            const equipe = await dataService.updateEquipe(equipeId, updates);
            if (!equipe) {
                return res.status(404).json({ error: 'Équipe introuvable' });
            }

            dataService.addLog(`Équipe modifiée: ${equipe.nom}`, {
                equipeId,
                changes: Object.keys(updates)
            });
            res.locals.equipe = equipe;
            res.json(equipe);
        } catch (error) {
            console.error('Erreur mise à jour équipe:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * PATCH /api/equipes/:id/score
     */
    async updateScore(req, res) {
        try {
            const equipeId = req.params.id;
            const { points, victoire } = req.body;

            const equipe = await dataService.getEquipeById(equipeId);
            if (!equipe) {
                return res.status(404).json({ error: 'Équipe introuvable' });
            }

            const updates = {
                points: (equipe.points || 0) + (parseInt(points) || 0),
                victoires: (equipe.victoires || 0) + (parseInt(victoire) || 0)
            };

            // Recalculer le score global
            updates.scoreGlobal = updates.points + (updates.victoires * 10); // Exemple de calcul

            const updatedEquipe = await dataService.updateEquipe(equipeId, updates);

            dataService.addLog(`Score équipe mis à jour: ${equipe.nom}`, {
                equipeId,
                points: updates.points,
                victoires: updates.victoires
            });

            res.json({
                success: true,
                points: updatedEquipe.points,
                victoires: updatedEquipe.victoires
            });
        } catch (error) {
            console.error('Erreur mise à jour score:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * DELETE /api/equipes/:id
     */
    async delete(req, res) {
        try {
            const equipeId = req.params.id;

            // Vérifier s'il y a des combattants dans cette équipe
            const combattants = await dataService.getCombattantsByEquipe(equipeId);
            if (combattants.length > 0) {
                return res.status(400).json({
                    error: `Impossible de supprimer l'équipe: ${combattants.length} combattant(s) assigné(s)`
                });
            }

            const deleted = await dataService.deleteEquipe(equipeId);
            if (!deleted) {
                return res.status(404).json({ error: 'Équipe introuvable' });
            }

            dataService.addLog(`Équipe supprimée`, { equipeId });
            res.json({ success: true });
        } catch (error) {
            console.error('Erreur suppression équipe:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * GET /api/equipes/:id/combattants
     */
    async getCombattants(req, res) {
        try {
            const equipeId = req.params.id;

            const equipe = await dataService.getEquipeById(equipeId);
            if (!equipe) {
                return res.status(404).json({ error: 'Équipe introuvable' });
            }

            const combattants = await dataService.getCombattantsByEquipe(equipeId);
            res.json(combattants);
        } catch (error) {
            console.error('Erreur récupération combattants équipe:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * GET /api/equipes/:id/stats
     */
    async getStats(req, res) {
        try {
            const equipeId = req.params.id;
            const classementService = require('../services/classementService');

            const stats = await classementService.getStatsEquipe(equipeId);
            if (!stats) {
                return res.status(404).json({ error: 'Équipe introuvable' });
            }

            res.json(stats);
        } catch (error) {
            console.error('Erreur récupération stats équipe:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }
}

module.exports = new EquipesController();