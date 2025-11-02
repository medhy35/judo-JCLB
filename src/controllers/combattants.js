// src/controllers/combattants.js
const dataService = require('../services/dataService');
const configService = require('../services/configService');

class CombattantsController {
    /**
     * GET /api/combattants
     */
    async getAll(req, res) {
        try {
            const combattants = dataService.readFile('combattants');
            res.json(combattants);
        } catch (error) {
            console.error('Erreur récupération combattants:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * GET /api/combattants/:id
     */
    async getById(req, res) {
        try {
            const combattantId = +req.params.id;
            const combattant = dataService.findById('combattants', combattantId);

            if (!combattant) {
                return res.status(404).json({ error: 'Combattant introuvable' });
            }

            // Ajouter les informations de l'équipe
            const equipe = dataService.findById('equipes', combattant.equipeId);
            const combattantComplet = {
                ...combattant,
                equipe: equipe ? { id: equipe.id, nom: equipe.nom, couleur: equipe.couleur } : null
            };

            res.json(combattantComplet);
        } catch (error) {
            console.error('Erreur récupération combattant:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * POST /api/combattants
     */
    async create(req, res) {
        try {
            const { nom, sexe, poids, equipeId } = req.body;

            if (!nom || !sexe || !poids || !equipeId) {
                return res.status(400).json({ error: 'Tous les champs sont requis' });
            }

            // Vérifier que l'équipe existe
            const equipe = dataService.findById('equipes', equipeId);
            if (!equipe) {
                return res.status(400).json({ error: 'Équipe introuvable' });
            }

            // Vérifier le format du poids
            if (typeof poids !== 'string' && typeof poids !== 'number') {
                return res.status(400).json({ error: 'Format de poids invalide' });
            }


            // Vérifier le sexe
            if (!['M', 'F'].includes(sexe)) {
                return res.status(400).json({ error: 'Sexe doit être M ou F' });
            }
            const categoriesPoids = configService.get('combattants.categoriesPoids');
            const categoriesValides = sexe === 'M'
                ? categoriesPoids.masculin
                : categoriesPoids.feminin;

            if (!categoriesValides.includes(poids)) {
                return res.status(400).json({
                    error: 'Catégorie de poids invalide',
                    categoriesValides
                });
            }
            const combattantsEquipe = dataService.getEquipeCombattants(equipeId);
            const maxCombattants = configService.get('equipes.maxCombattantsParEquipe', 20);

            if (combattantsEquipe.length >= maxCombattants) {
                return res.status(400).json({
                    error: `Nombre maximum de combattants atteint (${maxCombattants})`
                });
            }

            const newCombattant = {
                nom: nom.trim(),
                sexe,
                poids,
                equipeId,
                dateCreation: new Date().toISOString()
            };

            const combattant = dataService.add('combattants', newCombattant);
            dataService.addLog(`Nouveau combattant créé: ${nom}`, {
                combattantId: combattant.id,
                equipeId,
                poids,
                sexe
            });
            res.locals.combattant = combattant;
            res.status(201).json(combattant);
        } catch (error) {
            console.error('Erreur création combattant:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * PATCH /api/combattants/:id
     */
    async update(req, res) {
        try {
            const combattantId = +req.params.id;
            const updates = req.body;

            const combattant = dataService.findById('combattants', combattantId);
            if (!combattant) {
                return res.status(404).json({ error: 'Combattant non trouvé' });
            }

            // Valider les champs modifiables
            const champsValides = ['nom', 'sexe', 'poids', 'equipeId'];
            const updatesFiltered = {};

            Object.keys(updates).forEach(key => {
                if (champsValides.includes(key)) {
                    updatesFiltered[key] = updates[key];
                }
            });

            // Vérifications spécifiques
            if (updatesFiltered.equipeId) {
                const equipe = dataService.findById('equipes', updatesFiltered.equipeId);
                if (!equipe) {
                    return res.status(400).json({ error: 'Équipe introuvable' });
                }
            }

            if (updatesFiltered.sexe && !['M', 'F'].includes(updatesFiltered.sexe)) {
                return res.status(400).json({ error: 'Sexe doit être M ou F' });
            }

            if (updatesFiltered.nom) {
                updatesFiltered.nom = updatesFiltered.nom.trim();
            }

            const updatedCombattant = dataService.update('combattants', combattantId, updatesFiltered);

            dataService.addLog(`Combattant modifié: ${updatedCombattant.nom}`, {
                combattantId,
                changes: Object.keys(updatesFiltered)
            });
            res.locals.combattant = combattant;
            res.json(updatedCombattant);
        } catch (error) {
            console.error('Erreur mise à jour combattant:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * DELETE /api/combattants/:id
     */
    async delete(req, res) {
        try {
            const combattantId = +req.params.id;

            // Vérifier s'il y a des combats avec ce combattant
            const combats = dataService.readFile('combats');
            const combatsActifs = combats.filter(c =>
                (c.rouge && (c.rouge.id === combattantId || c.rouge === combattantId)) ||
                (c.bleu && (c.bleu.id === combattantId || c.bleu === combattantId))
            );

            if (combatsActifs.length > 0) {
                return res.status(400).json({
                    error: `Impossible de supprimer: ${combatsActifs.length} combat(s) associé(s)`
                });
            }

            const deleted = dataService.remove('combattants', combattantId);
            if (!deleted) {
                return res.status(404).json({ error: 'Combattant introuvable' });
            }

            dataService.addLog(`Combattant supprimé`, { combattantId });
            res.json({ success: true });
        } catch (error) {
            console.error('Erreur suppression combattant:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * GET /api/combattants/by-equipe/:equipeId
     */
    async getByEquipe(req, res) {
        try {
            const equipeId = req.params.equipeId;

            const equipe = dataService.findById('equipes', equipeId);
            if (!equipe) {
                return res.status(404).json({ error: 'Équipe introuvable' });
            }

            const combattants = dataService.getEquipeCombattants(equipeId);
            res.json(combattants);
        } catch (error) {
            console.error('Erreur récupération combattants par équipe:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * GET /api/combattants/by-categorie
     */
    async getByCategorie(req, res) {
        try {
            const { poids, sexe } = req.query;

            let combattants = dataService.readFile('combattants');

            if (poids) {
                combattants = combattants.filter(c => c.poids === poids);
            }

            if (sexe && ['M', 'F'].includes(sexe)) {
                combattants = combattants.filter(c => c.sexe === sexe);
            }

            // Enrichir avec les informations des équipes
            const equipes = dataService.readFile('equipes');
            const combattantsEnrichis = combattants.map(c => {
                const equipe = equipes.find(e => e.id === c.equipeId);
                return {
                    ...c,
                    equipe: equipe ? { id: equipe.id, nom: equipe.nom, couleur: equipe.couleur } : null
                };
            });

            res.json(combattantsEnrichis);
        } catch (error) {
            console.error('Erreur récupération combattants par catégorie:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * GET /api/combattants/:id/combats
     */
    async getCombats(req, res) {
        try {
            const combattantId = +req.params.id;

            const combattant = dataService.findById('combattants', combattantId);
            if (!combattant) {
                return res.status(404).json({ error: 'Combattant introuvable' });
            }

            const combatService = require('../services/combatService');
            const stats = combatService.getStatsCombattant(combattantId);

            const combats = dataService.readFile('combats');
            const combatsCombattant = combats.filter(c =>
                (c.rouge && (c.rouge.id === combattantId || c.rouge === combattantId)) ||
                (c.bleu && (c.bleu.id === combattantId || c.bleu === combattantId))
            ).map(c => combatService.enrichCombat(c));

            res.json({
                combattant,
                combats: combatsCombattant,
                stats
            });
        } catch (error) {
            console.error('Erreur récupération combats du combattant:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }
}

module.exports = new CombattantsController();