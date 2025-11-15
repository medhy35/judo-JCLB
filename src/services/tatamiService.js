// src/services/tatamiService.js
const dataService = require('./databaseAdapter');
const combatService = require('./combatService');
const classementService = require('./classementService');

class TatamiService {
    /**
     * Met à jour le score de confrontation d'un tatami
     * @param {number} tatamiId
     * @returns {Object} Score de confrontation mis à jour
     */
    async calculerScoreConfrontation(tatamiId) {
        const tatami = await dataService.getTatamiById(tatamiId);
        if (!tatami || !tatami.combatsIds) {
            return {rouge: 0, bleu: 0};
        }

        const combats = await dataService.getAllCombats();
        let scoreRouge = 0;
        let scoreBleu = 0;

        for (const combatId of tatami.combatsIds) {
            const combat = combats.find(c => c.id === combatId);
            if (!combat || combat.etat !== 'terminé') continue;

            const combatEnrichi = await combatService.enrichCombatAsync(combat);

            // Calculer les points de chaque côté
            const pointsRouge = combatService.calculerPointsCombat(combatEnrichi, combatEnrichi.rouge.equipeId);
            const pointsBleu = combatService.calculerPointsCombat(combatEnrichi, combatEnrichi.bleu.equipeId);

            scoreRouge += pointsRouge;
            scoreBleu += pointsBleu;
        }

        // ✅ CORRIGER : Utiliser les noms de colonnes PostgreSQL
        const updates = {
            score_rouge: scoreRouge,
            score_bleu: scoreBleu
        };

        // Mettre à jour le tatami
        await dataService.updateTatami(tatamiId, updates);

        dataService.addLog(`Score confrontation calculé pour ${tatami.nom}`, {
            tatamiId,
            scoreRouge,
            scoreBleu
        });

        return {rouge: scoreRouge, bleu: scoreBleu};
    }

    /**
     * Obtient le combat actuel d'un tatami avec toutes les données enrichies
     * @param {number} tatamiId
     * @returns {Object|null}
     */
    async getCombatActuel(tatamiId) {
        const tatami = await dataService.getTatamiById(tatamiId);

        if (!tatami) return null;

        const index = tatami.index_combat_actuel || tatami.indexCombatActuel || 0;
        const combatId = tatami.combatsIds?.[index];
        if (!combatId) return null;

        const combat = await dataService.getCombatById(combatId);
        if (!combat) return null;

        // Enrichir le combat avec toutes les données
        return await combatService.enrichCombatAsync(combat);
    }

    /**
     * Passe au combat suivant sur un tatami
     * @param {number} tatamiId
     * @returns {Object} Résultat de l'opération
     */
    async combatSuivant(tatamiId) {
        const tatami = await dataService.getTatamiById(tatamiId);
        if (!tatami) {
            return {success: false, error: 'Tatami introuvable'};
        }

        const indexActuel = tatami.index_combat_actuel || tatami.indexCombatActuel || 0;
        const nombreCombats = tatami.combatsIds?.length || 0;
        console.log('🔧 [Backend] combatSuivant - indexActuel:', indexActuel);
        console.log('🔧 [Backend] combatSuivant - nombreCombats:', nombreCombats);


        if (indexActuel >= nombreCombats - 1) {
            return {success: false, error: 'Déjà au dernier combat'};
        }

        const nouvelIndex = indexActuel + 1;
        const updates = {
            index_combat_actuel: nouvelIndex,
            historique: [
                ...(tatami.historique || []),
                {
                    timestamp: new Date().toISOString(),
                    action: 'combat_suivant',
                    ancienIndex: indexActuel,
                    nouveauIndex: nouvelIndex
                }
            ]
        };

        console.log('🔧 [Backend] Mise à jour tatami avec:', updates);
        await dataService.updateTatami(tatamiId, updates);

        const combatActuel = await this.getCombatActuel(tatamiId);
        const tatamiMisAJour = await dataService.getTatamiById(tatamiId);
        console.log('🔧 [Backend] Nouveau combat:', combatActuel?.id);

        dataService.addLog(`${tatami.nom} - Combat suivant`, {
            tatamiId,
            index: nouvelIndex,
            combatId: combatActuel?.id
        });

        return {
            success: true,
            index: nouvelIndex,
            combatActuel,
            tatami:  tatamiMisAJour
        };
    }

    /**
     * Passe au combat précédent sur un tatami
     * @param {number} tatamiId
     * @returns {Object} Résultat de l'opération
     */
    async combatPrecedent(tatamiId) {
        const tatami = await dataService.getTatamiById(tatamiId);
        if (!tatami) {
            return {success: false, error: 'Tatami introuvable'};
        }

        const indexActuel = tatami.index_combat_actuel || tatami.indexCombatActuel || 0;


        if (indexActuel <= 0) {
            return {success: false, error: 'Déjà au premier combat'};
        }

        const nouvelIndex = indexActuel - 1;
        const updates = {
            index_combat_actuel: nouvelIndex,
            historique: [
                ...(tatami.historique || []),
                {
                    timestamp: new Date().toISOString(),
                    action: 'combat_precedent',
                    ancienIndex: indexActuel,
                    nouveauIndex: nouvelIndex
                }
            ]
        };

        await dataService.updateTatami(tatamiId, updates);

        const combatActuel = await this.getCombatActuel(tatamiId);

        dataService.addLog(`${tatami.nom} - Combat précédent`, {
            tatamiId,
            index: nouvelIndex,
            combatId: combatActuel?.id
        });

        return {
            success: true,
            index: nouvelIndex,
            combatActuel,
            tatami: await dataService.getTatamiById(tatamiId)
        };
    }

    /**
     * Assigne des combats à un tatami avec gestion des poules
     * @param {number} tatamiId
     * @param {Array} combatsIds
     * @returns {Object} Résultat de l'assignation
     */
    async assignerCombats(tatamiId, combatsIds) {
        const tatami = await dataService.getTatamiById(tatamiId);
        if (!tatami) {
            return {success: false, error: 'Tatami introuvable'};
        }

        if (!Array.isArray(combatsIds) || combatsIds.length === 0) {
            return {success: false, error: 'Liste de combats invalide'};
        }

        // Vérifier que tous les combats existent
        const combatsValides = [];
        for (const combatId of combatsIds) {
            const combat = await dataService.getCombatById(combatId);
            if (!combat) {
                return {success: false, error: `Combat ${combatId} introuvable`};
            }
            combatsValides.push(combatId);
        }

        // Mettre à jour le tatami
        const updates = {
            combatsIds: [...(tatami.combatsIds || []), ...combatsValides],
            index_combat_actuel: 0,
            etat: 'occupé',
            historique: [
                ...(tatami.historique || []),
                {
                    timestamp: new Date().toISOString(),
                    action: 'assigner_combats',
                    combatsIds: combatsValides,
                    nombreCombats: combatsValides.length
                }
            ]
        };

        const tatamiMisAJour = await dataService.updateTatami(tatamiId, updates);

        // Mise à jour des poules
        await this._mettreAJourPoules(combatsValides);

        dataService.addLog(`${combatsValides.length} combats assignés au ${tatami.nom}`, {
            tatamiId,
            combatsIds: combatsValides
        });

        return {
            success: true,
            tatami: tatamiMisAJour,
            combatsAssignes: combatsValides.length,
            combatActuel: await this.getCombatActuel(tatamiId)
        };
    }

    /**
     * Libère un tatami de tous ses combats
     * @param {number} tatamiId
     * @returns {Object} Résultat de la libération
     */
    async libererTatami(tatamiId) {
        const tatami = await dataService.getTatamiById(tatamiId);
        if (!tatami) {
            return {success: false, error: 'Tatami introuvable'};
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
                    action: 'liberer_tatami',
                    anciensCombats: tatami.combatsIds?.length || 0
                }
            ]
        };

        const tatamiLibere = await dataService.updateTatami(tatamiId, updates);

        dataService.addLog(`Tatami ${tatami.nom} libéré`, {
            tatamiId,
            anciensCombats: tatami.combatsIds?.length || 0
        });

        return {
            success: true,
            tatami: tatamiLibere
        };
    }

    /**
     * Obtient l'historique complet des combats d'un tatami
     * @param {number} tatamiId
     * @returns {Array}
     */
    async getHistoriqueCombats(tatamiId) {
        const tatami = await dataService.getTatamiById(tatamiId);
        if (!tatami) return [];

        const combats = await dataService.getAllCombats();
        const historique = [];

        for (const combatId of (tatami.combatsIds || [])) {
            const index = (tatami.combatsIds || []).indexOf(combatId);
            const combat = combats.find(c => c.id === combatId);
            if (!combat) continue;

            const combatEnrichi = await combatService.enrichCombatAsync(combat);
            const vainqueur = combatService.determinerVainqueur(combat);

            historique.push({
                index: index + 1,
                combatId: combat.id,
                etat: combat.etat,
                dateDebut: combat.dateCreation,
                dateFin: combat.dateFin,
                rouge: {
                    nom: combatEnrichi.rouge.nom,
                    equipe: combatEnrichi.rouge.equipe,
                    points: combatService.calculerPointsCombat(combatEnrichi, combatEnrichi.rouge.equipeId)
                },
                bleu: {
                    nom: combatEnrichi.bleu.nom,
                    equipe: combatEnrichi.bleu.equipe,
                    points: combatService.calculerPointsCombat(combatEnrichi, combatEnrichi.bleu.equipeId)
                },
                vainqueur,
                duree: combat.dateFin && combat.dateCreation ?
                    Math.round((new Date(combat.dateFin) - new Date(combat.dateCreation)) / 1000) : null
            });
        }

        return historique;
    }

    /**
     * Obtient les statistiques d'un tatami
     * @param {number} tatamiId
     * @returns {Object}
     */
    async getStatsTatami(tatamiId) {
        const tatami = await dataService.getTatamiById(tatamiId);
        if (!tatami) return null;

        const historique = await this.getHistoriqueCombats(tatamiId);
        const combatsTermines = historique.filter(h => h.etat === 'terminé');

        const stats = {
            tatami: {
                id: tatami.id,
                nom: tatami.nom,
                etat: tatami.etat,
                dateCreation: tatami.dateCreation
            },
            combats: {
                total: historique.length,
                termines: combatsTermines.length,
                enCours: historique.filter(h => h.etat === 'en cours').length,
                prevus: historique.filter(h => h.etat === 'prévu').length,
                pourcentageTermines: historique.length > 0 ?
                    Math.round((combatsTermines.length / historique.length) * 100) : 0
            },
            temps: {
                dureemoyenne: 0,
                dureeTotale: 0,
                combatPlusLong: null,
                combatPlusCourt: null
            },
            scores: {
                rouge: tatami.score_rouge || 0,
                bleu: tatami.score_bleu || 0
            }
        };

        // Calcul des temps
        const dureesValides = combatsTermines
            .filter(c => c.duree !== null)
            .map(c => c.duree);

        if (dureesValides.length > 0) {
            stats.temps.dureeTotale = dureesValides.reduce((sum, d) => sum + d, 0);
            stats.temps.dureemoyenne = Math.round(stats.temps.dureeTotale / dureesValides.length);
            stats.temps.combatPlusLong = Math.max(...dureesValides);
            stats.temps.combatPlusCourt = Math.min(...dureesValides);
        }

        return stats;
    }

    /**
     * Vérifie si un tatami peut recevoir de nouveaux combats
     * @param {number} tatamiId
     * @returns {Object} État de disponibilité
     */
    async verifierDisponibilite(tatamiId) {
        const tatami = await dataService.getTatamiById(tatamiId);
        if (!tatami) {
            return {disponible: false, raison: 'Tatami introuvable'};
        }

        if (tatami.etat === 'occupé') {
            const combatsRestants = (tatami.combatsIds?.length || 0) - (tatami.indexCombatActuel || 0);
            return {
                disponible: false,
                raison: 'Tatami occupé',
                combatsRestants,
                combatActuel: await this.getCombatActuel(tatamiId)
            };
        }

        if (tatami.etat === 'pause') {
            return {
                disponible: false,
                raison: 'Tatami en pause',
                peutReprendre: true
            };
        }

        return {
            disponible: true,
            etat: tatami.etat
        };
    }

    /**
     * Met à jour les poules après assignation de combats
     * @private
     */
    async _mettreAJourPoules(combatsIds) {
        const poules = await dataService.getAllPoules();
        const combats = await dataService.getAllCombats();
        let poulesModifiees = false;

        for (const combatId of combatsIds) {
            const combat = combats.find(c => c.id === combatId);
            if (!combat) continue;

            const combatEnrichi = await combatService.enrichCombatAsync(combat);
            const equipeRougeId = combatEnrichi.rouge.equipeId;
            const equipeBleuId = combatEnrichi.bleu.equipeId;

            // Trouver la rencontre correspondante
            poules.forEach(poule => {
                const rencontre = poule.rencontres.find(r =>
                    (r.equipeA === equipeRougeId && r.equipeB === equipeBleuId) ||
                    (r.equipeA === equipeBleuId && r.equipeB === equipeRougeId)
                );

                if (rencontre) {
                    if (!rencontre.combatsIds) {
                        rencontre.combatsIds = [];
                    }
                    if (!rencontre.combatsIds.includes(combatId)) {
                        rencontre.combatsIds.push(combatId);
                        rencontre.etat = 'assignee';
                        poulesModifiees = true;
                    }
                }
            });
        }

        if (poulesModifiees) {
            await dataService.createPoules(poules);
            dataService.addLog('Poules mises à jour après assignation', {
                combatsIds
            });
        }
    }

    /**
     * Termine automatiquement un combat et passe au suivant
     * @param {number} tatamiId
     * @param {Object} resultatCombat Résultat du combat terminé
     * @returns {Object}
     */
    async terminerEtSuivant(tatamiId, resultatCombat) {
        const tatami = await dataService.getTatamiById(tatamiId);
        if (!tatami) {
            return {success: false, error: 'Tatami introuvable'};
        }

        const combatActuel = await this.getCombatActuel(tatamiId);
        if (!combatActuel) {
            return {success: false, error: 'Aucun combat actuel'};
        }

        // Terminer le combat actuel
        const combatTermine = await dataService.updateCombat(combatActuel.id, {
            ...resultatCombat,
            etat: 'terminé',
            dateFin: new Date().toISOString()
        });

        // Mettre à jour les classements
        await classementService.mettreAJourClassements(combatTermine);

        // Recalculer le score de confrontation
        await this.calculerScoreConfrontation(tatamiId);

        // Passer au combat suivant si possible
        const suivantResult = await this.combatSuivant(tatamiId);

        dataService.addLog(`Combat terminé et passage au suivant sur ${tatami.nom}`, {
            tatamiId,
            combatTermineId: combatActuel.id,
            combatSuivantResult: suivantResult.success
        });

        return {
            success: true,
            combatTermine,
            combatSuivant: suivantResult.success ? suivantResult.combatActuel : null,
            finDeConfrontation: !suivantResult.success
        };
    }

    /**
     * Obtient tous les tatamis avec leurs combats actuels
     * @returns {Array}
     */
    async getTatamisAvecCombats() {
        const tatamis = await dataService.getAllTatamis();

        return await Promise.all(tatamis.map(async tatami => ({
            ...tatami,
            combatActuel: await this.getCombatActuel(tatami.id),
            stats: {
                combatsTotal: tatami.combatsIds?.length || 0,
                combatsRestants: Math.max(0, (tatami.combatsIds?.length || 0) - (tatami.indexCombatActuel || 0)),
                progression: tatami.combatsIds?.length > 0 ?
                    Math.round(((tatami.indexCombatActuel || 0) / tatami.combatsIds.length) * 100) : 0
            }
        })));
    }


}

module.exports = new TatamiService();