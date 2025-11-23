// src/controllers/combats.js
const dataService = require('../services/dataService');
const configService = require('../services/configService');

class CombatsController {
    /**
     * GET /api/combats
     */
    async getAll(req, res) {
        try {
            const combats = dataService.readFile('combats');
            const combatService = require('../services/combatService');
            const combatsEnrichis = combats.map(c => combatService.enrichCombat(c));
            res.json(combatsEnrichis);
        } catch (error) {
            console.error('Erreur récupération combats:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * GET /api/combats/:id
     */
    async getById(req, res) {
        try {
            const combatId = +req.params.id;
            const combat = dataService.findById('combats', combatId);

            if (!combat) {
                return res.status(404).json({ error: 'Combat introuvable' });
            }

            const combatService = require('../services/combatService');
            res.json(combatService.enrichCombat(combat));
        } catch (error) {
            console.error('Erreur récupération combat:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * POST /api/combats
     */
    async create(req, res) {
        try {
            const { rouge, bleu, timer } = req.body;

            if (!rouge || !bleu) {
                return res.status(400).json({ error: 'Combattants rouge et bleu requis' });
            }

            const newCombat = {
                rouge,
                bleu,
                etat: 'prévu',
                ipponRouge: false,
                ipponBleu: false,
                wazariRouge: 0,
                wazariBleu: 0,
                yukoRouge: 0,
                yukoBleu: 0,
                penalitesRouge: 0,
                penalitesBleu: 0,
                timer: timer ?? configService.get('combat.dureeParDefaut', 240),
                dateCreation: new Date().toISOString()
            };

            const combat = dataService.add('combats', newCombat);

            const combatService = require('../services/combatService');
            const combatEnrichi = combatService.enrichCombat(combat);

            dataService.addLog('Nouveau combat créé', {
                combatId: combat.id,
                rouge: rouge.nom || rouge.id,
                bleu: bleu.nom || bleu.id
            });

            res.locals.combat = combatEnrichi;
            res.status(201).json(combatEnrichi);
        } catch (error) {
            console.error('Erreur création combat:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * PATCH /api/combats/:id - Version améliorée avec actions spéciales
     */
    async update(req, res) {
        try {
            const combatId = +req.params.id;
            const updates = req.body;
            const combatService = require('../services/combatService');

            // Récupérer le combat actuel
            let combat = dataService.findById('combats', combatId);
            if (!combat) {
                return res.status(404).json({ error: 'Combat introuvable' });
            }

            // Traiter les actions spéciales
            if (updates.action) {
                const result = await this._handleSpecialAction(combat, updates);
                if (result.error) {
                    return res.status(400).json({ error: result.error });
                }

                combat = result.combat;
                res.locals.combat = combat;

                if (result.additionalData) {
                    return res.json({
                        combat,
                        ...result.additionalData
                    });
                }

                return res.json(combat);
            }

            // Mise à jour normale
            combat = dataService.update('combats', combatId, updates);

            // Vérification automatique de fin de combat
            const raisonFin = combatService.verifierFinCombat(combat);
            if (raisonFin && combat.etat !== 'terminé') {
                const vainqueur = combatService.determinerVainqueur(combat);
                const finalUpdates = {
                    etat: 'terminé',
                    dateFin: new Date().toISOString(),
                    raisonFin,
                    vainqueur
                };

                combat = dataService.update('combats', combatId, finalUpdates);

                // Mettre à jour les classements
                const classementService = require('../services/classementService');
                classementService.mettreAJourClassements(combat);

                dataService.addLog('Combat terminé automatiquement', {
                    combatId: combat.id,
                    raison: raisonFin,
                    vainqueur
                });
            }

            // Enrichir le combat avant de le retourner
            const combatEnrichi = combatService.enrichCombat(combat);
            res.locals.combat = combatEnrichi;
            res.json(combatEnrichi);

        } catch (error) {
            console.error('Erreur mise à jour combat:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * Gère les actions spéciales sur un combat
     * @private
     */
    async _handleSpecialAction(combat, updates) {
        const combatService = require('../services/combatService');

        switch (updates.action) {
            case 'marquer_point':
                return await this._handleMarquerPoint(combat, updates);

            case 'start_osaekomi':
                return await this._handleStartOsaekomi(combat, updates);

            case 'stop_osaekomi':
                return await this._handleStopOsaekomi(combat, updates);

            case 'correction':
                return await this._handleCorrection(combat, updates);

            case 'reset':
                return await this._handleReset(combat);

            default:
                return { error: 'Action non reconnue' };
        }
    }

    /**
     * Marquer un point
     * @private
     */
    async _handleMarquerPoint(combat, { cote, type }) {
        if (!cote || !type) {
            return { error: 'Côté et type requis' };
        }

        if (combat.etat === 'terminé') {
            return { error: 'Combat déjà terminé' };
        }

        const combatService = require('../services/combatService');

        try {
            // Utiliser la méthode du service pour marquer le point
            const combatMisAJour = combatService.marquerPoint(combat, cote, type);

            // Sauvegarder
            const savedCombat = dataService.update('combats', combat.id, combatMisAJour);

            // Mettre à jour les classements si combat terminé
            if (savedCombat.etat === 'terminé') {
                const classementService = require('../services/classementService');
                classementService.mettreAJourClassements(savedCombat);
            }

            dataService.addLog(`Point marqué: ${type} ${cote}`, {
                combatId: combat.id,
                type,
                cote,
                combatTermine: savedCombat.etat === 'terminé'
            });

            return {
                combat: combatService.enrichCombat(savedCombat)
            };

        } catch (error) {
            return { error: error.message || 'Erreur lors du marquage du point' };
        }
    }

    /**
     * Démarrer un osaekomi
     * @private
     */
    async _handleStartOsaekomi(combat, { cote }) {
        if (!cote) {
            return { error: 'Côté requis pour osaekomi' };
        }

        if (combat.etat !== 'en cours') {
            return { error: 'Combat doit être en cours pour osaekomi' };
        }

        // Arrêter un osaekomi en cours s'il y en a un
        const updates = {
            osaekomoActif: true,
            osaekomoCote: cote,
            osaekomoDebut: new Date().toISOString()
        };

        const combatMisAJour = dataService.update('combats', combat.id, updates);
        const combatService = require('../services/combatService');

        dataService.addLog(`Osaekomi démarré: ${cote}`, {
            combatId: combat.id,
            cote
        });

        return {
            combat: combatService.enrichCombat(combatMisAJour)
        };
    }

    /**
     * Arrêter un osaekomi
     * @private
     */
    async _handleStopOsaekomi(combat, { duree }) {
        if (!combat.osaekomoActif) {
            return { error: 'Aucun osaekomi en cours' };
        }

        const combatService = require('../services/combatService');
        const dureeEffective = duree || 0;

        try {
            // Traiter l'osaekomi avec le service
            const result = combatService.traiterOsaekomi(
                dureeEffective,
                combat,
                combat.osaekomoCote
            );

            // Nettoyer les données osaekomi
            const cleanupUpdates = {
                ...result.combat,
                osaekomoActif: false,
                osaekomoCote: null,
                osaekomoDebut: null
            };

            const combatMisAJour = dataService.update('combats', combat.id, cleanupUpdates);

            // Mettre à jour les classements si combat terminé
            if (result.finCombat) {
                const classementService = require('../services/classementService');
                classementService.mettreAJourClassements(combatMisAJour);
            }

            dataService.addLog('Osaekomi arrêté', {
                combatId: combat.id,
                duree: dureeEffective,
                pointsMarques: result.pointsMarques,
                finCombat: result.finCombat
            });

            return {
                combat: combatService.enrichCombat(combatMisAJour),
                additionalData: {
                    pointsMarques: result.pointsMarques,
                    finCombat: result.finCombat,
                    duree: dureeEffective
                }
            };

        } catch (error) {
            return { error: error.message || 'Erreur lors de l\'arrêt osaekomi' };
        }
    }

    /**
     * Gérer une correction de score
     * @private
     */
    async _handleCorrection(combat, { cote, operation, type, from, to }) {
        if (!cote || !operation) {
            return { error: 'Côté et opération requis pour correction' };
        }

        const couleur = cote.charAt(0).toUpperCase() + cote.slice(1);
        const updates = {};

        try {
            switch (operation) {
                case 'retirer':
                    if (!type) return { error: 'Type requis pour retrait' };

                    switch (type) {
                        case 'ippon':
                            if (combat[`ippon${couleur}`]) {
                                updates[`ippon${couleur}`] = false;
                            }
                            break;
                        case 'wazari':
                            const wazari = combat[`wazari${couleur}`] || 0;
                            if (wazari > 0) {
                                updates[`wazari${couleur}`] = wazari - 1;
                            }
                            break;
                        case 'yuko':
                            const yuko = combat[`yuko${couleur}`] || 0;
                            if (yuko > 0) {
                                updates[`yuko${couleur}`] = yuko - 1;
                            }
                            break;
                        case 'shido':
                            const shido = combat[`penalites${couleur}`] || 0;
                            if (shido > 0) {
                                updates[`penalites${couleur}`] = shido - 1;
                            }
                            break;
                    }
                    break;

                case 'convertir':
                    if (!from || !to) return { error: 'Types source et destination requis' };

                    // Vérifier et effectuer la conversion
                    if (from === 'ippon' && combat[`ippon${couleur}`]) {
                        updates[`ippon${couleur}`] = false;
                        if (to === 'wazari') {
                            updates[`wazari${couleur}`] = (combat[`wazari${couleur}`] || 0) + 1;
                        } else if (to === 'yuko') {
                            updates[`yuko${couleur}`] = (combat[`yuko${couleur}`] || 0) + 1;
                        }
                    } else if (from === 'wazari' && (combat[`wazari${couleur}`] || 0) > 0) {
                        updates[`wazari${couleur}`] = combat[`wazari${couleur}`] - 1;
                        if (to === 'yuko') {
                            updates[`yuko${couleur}`] = (combat[`yuko${couleur}`] || 0) + 1;
                        }
                    }
                    break;

                case 'raz':
                    updates[`ippon${couleur}`] = false;
                    updates[`wazari${couleur}`] = 0;
                    updates[`yuko${couleur}`] = 0;
                    updates[`penalites${couleur}`] = 0;
                    break;
            }

            // Si le combat était terminé, le remettre en état pour permettre les corrections
            if (combat.etat === 'terminé') {
                updates.etat = 'pause';
                updates.dateFin = null;
                updates.raisonFin = null;
                updates.vainqueur = null;
            }

            const combatMisAJour = dataService.update('combats', combat.id, updates);
            const combatService = require('../services/combatService');

            dataService.addLog(`Correction appliquée: ${operation}`, {
                combatId: combat.id,
                cote,
                operation,
                type,
                from,
                to
            });

            return {
                combat: combatService.enrichCombat(combatMisAJour)
            };

        } catch (error) {
            return { error: error.message || 'Erreur lors de la correction' };
        }
    }

    /**
     * Remettre à zéro un combat
     * @private
     */
    async _handleReset(combat) {
        const resetUpdates = {
            etat: 'prévu',
            timer: 240,
            ipponRouge: false,
            ipponBleu: false,
            wazariRouge: 0,
            wazariBleu: 0,
            yukoRouge: 0,
            yukoBleu: 0,
            penalitesRouge: 0,
            penalitesBleu: 0,
            dateFin: null,
            raisonFin: null,
            vainqueur: null,
            osaekomoActif: false,
            osaekomoCote: null,
            osaekomoDebut: null
        };

        const combatReset = dataService.update('combats', combat.id, resetUpdates);
        const combatService = require('../services/combatService');

        dataService.addLog('Combat remis à zéro', {
            combatId: combat.id
        });

        return {
            combat: combatService.enrichCombat(combatReset)
        };
    }

    /**
     * DELETE /api/combats/:id
     */
    async delete(req, res) {
        try {
            const combatId = +req.params.id;
            const deleted = dataService.remove('combats', combatId);

            if (!deleted) {
                return res.status(404).json({ error: 'Combat introuvable' });
            }

            dataService.addLog('Combat supprimé', { combatId });
            res.json({ success: true });
        } catch (error) {
            console.error('Erreur suppression combat:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }
}

module.exports = new CombatsController();