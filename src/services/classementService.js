// src/services/classementService.js
const dataService = require('./databaseAdapter');
const combatService = require('./combatService');
const configService = require('./configService');

class ClassementService {
    constructor() {
    }

    /**
     * Calcule le classement d'une poule
     * @param {number} pouleId
     * @returns {Object} Poule avec classement mis à jour
     */
    async calculerClassementPoule(pouleId) {
        const poule = await dataService.getPouleById(pouleId);
        if (!poule) return null;

        const combats = await dataService.getAllCombats();
        const equipes = await dataService.getAllEquipes();
        const poulesConfig = configService.get('poules');

        // Initialiser les stats pour chaque équipe de la poule
        const statsEquipes = {};
        poule.equipesIds.forEach(equipeId => {
            const equipe = equipes.find(e => e.id === equipeId);
            statsEquipes[equipeId] = {
                equipeId,
                nom: equipe?.nom || equipeId,
                points: 0,
                victoires: 0,
                defaites: 0,
                egalites: 0,
                confrontationsJouees: 0, // ← Renommé pour plus de clarté
                pointsMarques: 0,
                pointsEncaisses: 0,
                differentiel: 0
            };
        });

        // Analyser les CONFRONTATIONS (rencontres) au lieu des combats individuels
        for (const rencontre of poule.rencontres) {
            if (!rencontre.combatsIds || rencontre.combatsIds.length === 0) continue;

            // Vérifier si tous les combats de cette rencontre sont terminés
            const combatsRencontre = rencontre.combatsIds.map(id =>
                combats.find(c => c.id === id)
            ).filter(c => c && c.etat === 'terminé');

            // Si tous les combats ne sont pas terminés, ignorer cette rencontre
            if (combatsRencontre.length !== rencontre.combatsIds.length) continue;

            const equipeAId = rencontre.equipeA;
            const equipeBId = rencontre.equipeB;

            if (!statsEquipes[equipeAId] || !statsEquipes[equipeBId]) continue;

            // Calculer le résultat de la CONFRONTATION
            let victoiresA = 0;
            let victoiresB = 0;
            let pointsTotauxA = 0;
            let pointsTotauxB = 0;

            for (const combat of combatsRencontre) {
                const combatEnrichi = await combatService.enrichCombatAsync(combat);
                const equipeRougeId = combatEnrichi.rouge.equipeId;
                const equipeBleuId = combatEnrichi.bleu.equipeId;

                // Déterminer quelle équipe correspond à A ou B
                let estRougeEquipeA;
                if (equipeRougeId === equipeAId) {
                    estRougeEquipeA = true;
                } else if (equipeRougeId === equipeBId) {
                    estRougeEquipeA = false;
                } else {
                    continue; // Combat ne concerne pas cette rencontre
                }

                // Compter les victoires par combat
                const vainqueur = combatService.determinerVainqueur(combat);
                if (vainqueur === 'rouge') {
                    if (estRougeEquipeA) victoiresA++;
                    else victoiresB++;
                } else if (vainqueur === 'bleu') {
                    if (estRougeEquipeA) victoiresB++;
                    else victoiresA++;
                }

                // Compter les points techniques marqués
                const pointsRouge = combatService.calculerPointsCombat(combatEnrichi, equipeRougeId);
                const pointsBleu = combatService.calculerPointsCombat(combatEnrichi, equipeBleuId);

                if (estRougeEquipeA) {
                    pointsTotauxA += pointsRouge;
                    pointsTotauxB += pointsBleu;
                } else {
                    pointsTotauxA += pointsBleu;
                    pointsTotauxB += pointsRouge;
                }
            }

            // Mettre à jour les stats des équipes
            const statsA = statsEquipes[equipeAId];
            const statsB = statsEquipes[equipeBId];

            statsA.confrontationsJouees++;
            statsB.confrontationsJouees++;

            statsA.pointsMarques += pointsTotauxA;
            statsA.pointsEncaisses += pointsTotauxB;
            statsB.pointsMarques += pointsTotauxB;
            statsB.pointsEncaisses += pointsTotauxA;

            // *** POINTS DE CLASSEMENT PAR CONFRONTATION ***
            if (victoiresA > victoiresB) {
                // Équipe A gagne la confrontation
                statsA.victoires++;
                statsA.points += poulesConfig.pointsVictoire; // ← +1 point pour une confrontation gagnée
                statsB.defaites++;
                statsB.points += poulesConfig.pointsDefaite; // points pour une défaite
            } else if (victoiresB > victoiresA) {
                // Équipe B gagne la confrontation
                statsB.victoires++;
                statsB.points += poulesConfig.pointsVictoire; // ← +1 point pour une confrontation gagnée
                statsA.defaites++;
                statsA.points += poulesConfig.pointsDefaite; // points pour une défaite
            } else {
                // Égalité en nombre de victoires - départager par points techniques
                if (pointsTotauxA > pointsTotauxB) {
                    statsA.victoires++;
                    statsA.points += poulesConfig.pointsVictoire; // ← +1 point pour une confrontation gagnée
                    statsB.defaites++;
                    statsB.points += poulesConfig.pointsDefaite; // points pour une défaite
                } else if (pointsTotauxB > pointsTotauxA) {
                    statsB.victoires++;
                    statsB.points += poulesConfig.pointsVictoire; // ← +1 point pour une confrontation gagnée
                    statsA.defaites++;
                    statsA.points += poulesConfig.pointsDefaite; // points pour une défaite
                } else {
                    // Égalité parfaite - départage impossible, pas de points
                    // Dans ce cas très rare, on peut attribuer à celui qui a le plus de points techniques
                    // ou considérer comme match nul (0 point chacun)
                    statsA.egalites++;
                    statsB.egalites++;
                    statsA.points += poulesConfig.pointsEgalite; // ← Config
                    statsB.points += poulesConfig.pointsEgalite;
                    // Pas de points attribués en cas d'égalité parfaite
                }
            }
        }

        // Calculer les différentiels
        Object.values(statsEquipes).forEach(stats => {
            stats.differentiel = stats.pointsMarques - stats.pointsEncaisses;
        });

        // Trier le classement
        const classement = Object.values(statsEquipes).sort((a, b) => {
            // 1. Points de classement (confrontations gagnées)
            if (b.points !== a.points) return b.points - a.points;
            // 2. Nombre de victoires
            if (b.victoires !== a.victoires) return b.victoires - a.victoires;
            // 3. Différentiel de points techniques
            if (b.differentiel !== a.differentiel) return b.differentiel - a.differentiel;
            // 4. Points techniques marqués
            if (b.pointsMarques !== a.pointsMarques) return b.pointsMarques - a.pointsMarques;
            // 5. Moins de points encaissés
            return a.pointsEncaisses - b.pointsEncaisses;
        });

        // Mettre à jour la poule
        const pouleMAJ = {
            ...poule,
            classement,
            derniereMiseAJour: new Date().toISOString()
        };

        await dataService.updatePoule(pouleId, pouleMAJ);
        dataService.addLog(`Classement de poule calculé: ${poule.nom}`, {
            pouleId,
            nbEquipes: classement.length
        });

        return pouleMAJ;
    }

    /**
     * Calcule le classement général de toutes les poules
     * @returns {Array} Classement général
     */
    async calculerClassementGeneral() {
        const poules = await dataService.getAllPoules();
        const equipes = await dataService.getAllEquipes();

        // Agréger les stats de toutes les poules
        const statsGlobales = {};

        // Initialiser avec toutes les équipes
        equipes.forEach(equipe => {
            statsGlobales[equipe.id] = {
                equipeId: equipe.id,
                nom: equipe.nom,
                couleur: equipe.couleur,
                points: 0,
                victoires: 0,
                defaites: 0,
                egalites: 0,
                confrontationsJouees: 0,
                pointsMarques: 0,
                pointsEncaisses: 0,
                differentiel: 0,
                poulesParticipees: []
            };
        });

        // Agréger les données des poules
        poules.forEach(poule => {
            if (!poule.classement) return;

            poule.classement.forEach(stats => {
                const equipeId = stats.equipeId;
                if (!statsGlobales[equipeId]) return;

                const global = statsGlobales[equipeId];
                global.points += stats.points || 0;
                global.victoires += stats.victoires || 0;
                global.defaites += stats.defaites || 0;
                global.egalites += stats.egalites || 0;
                global.confrontationsJouees += stats.confrontationsJouees || 0;  // ← CORRIGÉ ICI
                global.pointsMarques += stats.pointsMarques || 0;
                global.pointsEncaisses += stats.pointsEncaisses || 0;
                global.poulesParticipees.push(poule.nom);
            });
        });

        // Recalculer les différentiels
        Object.values(statsGlobales).forEach(stats => {
            stats.differentiel = stats.pointsMarques - stats.pointsEncaisses;
        });

        // Trier le classement général
        const classementGeneral = Object.values(statsGlobales)
            .filter(stats => stats.confrontationsJouees > 0) // Seulement les équipes ayant joué
            .sort((a, b) => {
                if (b.points !== a.points) return b.points - a.points;
                if (b.victoires !== a.victoires) return b.victoires - a.victoires;
                if (b.differentiel !== a.differentiel) return b.differentiel - a.differentiel;
                if (b.pointsMarques !== a.pointsMarques) return b.pointsMarques - a.pointsMarques;
                return a.pointsEncaisses - b.pointsEncaisses;
            });

        dataService.addLog('Classement général calculé', {
            nbEquipesClassees: classementGeneral.length
        });

        return classementGeneral;
    }

    /**
     * Met à jour automatiquement tous les classements après un combat terminé
     * @param {Object} combat Combat terminé
     */
    async mettreAJourClassements(combat) {
        if (combat.etat !== 'terminé') return;

        const poules = await dataService.getAllPoules();
        const poulesAMettreAJour = [];

        // Trouver les poules concernées par ce combat
        poules.forEach(poule => {
            const rencontresConcernees = poule.rencontres.filter(r =>
                r.combatsIds && r.combatsIds.includes(combat.id)
            );

            if (rencontresConcernees.length > 0) {
                poulesAMettreAJour.push(poule.id);
            }
        });

        // Mettre à jour les classements des poules concernées
        for (const pouleId of poulesAMettreAJour) {
            await this.calculerClassementPoule(pouleId);
        }

        dataService.addLog('Classements mis à jour après combat', {
            combatId: combat.id,
            poulesMAJ: poulesAMettreAJour
        });
    }

    /**
     * Obtient les statistiques détaillées d'une équipe
     * @param {string} equipeId
     * @returns {Object}
     */
    async getStatsEquipe(equipeId) {
        const equipe = await dataService.getEquipeById(equipeId);
        if (!equipe) return null;

        const combats = await dataService.getAllCombats();
        const combattants = await dataService.getCombattantsByEquipe(equipeId);

        // Combats de l'équipe
        const combatsEquipe = [];
        for (const c of combats) {
            const combatEnrichi = await combatService.enrichCombatAsync(c);
            if (combatEnrichi.rouge.equipeId === equipeId || combatEnrichi.bleu.equipeId === equipeId) {
                combatsEquipe.push(c);
            }
        }

        const stats = {
            equipe,
            combattants: combattants.length,
            combats: {
                total: combatsEquipe.length,
                termines: 0,
                enCours: 0,
                prevus: 0,
                victoires: 0,
                defaites: 0,
                egalites: 0
            },
            points: {
                marques: 0,
                encaisses: 0,
                differentiel: 0
            },
            categories: {}
        };

        // Analyser chaque combat
        for (const combat of combatsEquipe) {
            const combatEnrichi = await combatService.enrichCombatAsync(combat);
            const estRouge = combatEnrichi.rouge.equipeId === equipeId;

            // États des combats
            if (combat.etat === 'terminé') {
                stats.combats.termines++;

                const vainqueur = combatService.determinerVainqueur(combat);
                if ((vainqueur === 'rouge' && estRouge) || (vainqueur === 'bleu' && !estRouge)) {
                    stats.combats.victoires++;
                } else if (vainqueur === null) {
                    stats.combats.egalites++;
                } else {
                    stats.combats.defaites++;
                }

                // Points marqués
                const pointsMarques = combatService.calculerPointsCombat(combatEnrichi, equipeId);
                const adversaireId = estRouge ? combatEnrichi.bleu.equipeId : combatEnrichi.rouge.equipeId;
                const pointsEncaisses = combatService.calculerPointsCombat(combatEnrichi, adversaireId);

                stats.points.marques += pointsMarques;
                stats.points.encaisses += pointsEncaisses;

            } else if (combat.etat === 'en cours') {
                stats.combats.enCours++;
            } else {
                stats.combats.prevus++;
            }

            // Analyser par catégorie
            const categorie = `${combatEnrichi.rouge.sexe}-${combatEnrichi.rouge.poids}`;
            if (!stats.categories[categorie]) {
                stats.categories[categorie] = {
                    poids: combatEnrichi.rouge.poids,
                    sexe: combatEnrichi.rouge.sexe,
                    combats: 0,
                    victoires: 0,
                    defaites: 0
                };
            }

            if (combat.etat === 'terminé') {
                stats.categories[categorie].combats++;
                const vainqueur = combatService.determinerVainqueur(combat);
                if ((vainqueur === 'rouge' && estRouge) || (vainqueur === 'bleu' && !estRouge)) {
                    stats.categories[categorie].victoires++;
                } else if (vainqueur !== null) {
                    stats.categories[categorie].defaites++;
                }
            }
        }

        stats.points.differentiel = stats.points.marques - stats.points.encaisses;

        return stats;
    }

    /**
     * Obtient le top des équipes par critère
     * @param {string} critere - 'victoires', 'points', 'differentiel'
     * @param {number} limite
     * @returns {Array}
     */
    async getTopEquipes(critere = 'points', limite = 10) {
        const classement = await this.calculerClassementGeneral();

        let trie;
        switch (critere) {
            case 'victoires':
                trie = classement.sort((a, b) => b.victoires - a.victoires);
                break;
            case 'differentiel':
                trie = classement.sort((a, b) => b.differentiel - a.differentiel);
                break;
            case 'pointsMarques':
                trie = classement.sort((a, b) => b.pointsMarques - a.pointsMarques);
                break;
            default:
                trie = classement; // Déjà trié par points
        }

        return trie.slice(0, limite);
    }

    /**
     * Génère un rapport complet de compétition
     * @returns {Object}
     */
    async genererRapportCompetition() {
        const equipes = await dataService.getAllEquipes();
        const combats = await dataService.getAllCombats();
        const poules = await dataService.getAllPoules();
        const tatamis = await dataService.getAllTatamis();
        const combattants = await dataService.getAllCombattants();

        const rapport = {
            dateGeneration: new Date().toISOString(),
            statistiques: {
                equipes: equipes.length,
                combattants: combattants.length,
                combats: {
                    total: combats.length,
                    termines: combats.filter(c => c.etat === 'terminé').length,
                    enCours: combats.filter(c => c.etat === 'en cours').length,
                    prevus: combats.filter(c => c.etat === 'prévu').length
                },
                poules: poules.length,
                tatamis: {
                    total: tatamis.length,
                    libres: tatamis.filter(t => t.etat === 'libre').length,
                    occupes: tatamis.filter(t => t.etat === 'occupé').length
                }
            },
            classements: {
                general: await this.calculerClassementGeneral(),
                parPoule: await Promise.all(poules.map(poule => this.calculerClassementPoule(poule.id)))
            },
            topPerformances: {
                plusVictorieuses: await this.getTopEquipes('victoires', 5),
                meilleurDifferentiel: await this.getTopEquipes('differentiel', 5),
                plusGrandesMarqueuses: await this.getTopEquipes('pointsMarques', 5)
            }
        };

        dataService.addLog('Rapport de compétition généré', {
            nbEquipes: rapport.statistiques.equipes,
            combatsTermines: rapport.statistiques.combats.termines
        });

        return rapport;
    }

    /**
     * Vérifie si une rencontre de poule est terminée
     * @param {Object} rencontre
     * @returns {boolean}
     */
    async isRencontreTerminee(rencontre) {
        if (!rencontre.combatsIds || rencontre.combatsIds.length === 0) {
            return false;
        }

        const combats = await dataService.getAllCombats();
        const combatsRencontre = rencontre.combatsIds.map(id =>
            combats.find(c => c.id === id)
        ).filter(Boolean);

        return combatsRencontre.length > 0 &&
            combatsRencontre.every(c => c.etat === 'terminé');
    }

    /**
     * Calcule le score d'une rencontre entre deux équipes
     * @param {Object} rencontre
     * @returns {Object} Résultat de la rencontre
     */
    async calculerResultatRencontre(rencontre) {
        if (!await this.isRencontreTerminee(rencontre)) {
            return {
                equipeA: rencontre.equipeA,
                equipeB: rencontre.equipeB,
                scoreA: 0,
                scoreB: 0,
                vainqueur: null,
                termine: false
            };
        }

        const combats = await dataService.getAllCombats();
        const combatsRencontre = rencontre.combatsIds
            .map(id => combats.find(c => c.id === id))
            .filter(Boolean);

        let victoiresA = 0;
        let victoiresB = 0;
        let pointsA = 0;
        let pointsB = 0;

        for (const combat of combatsRencontre) {
            const vainqueur = combatService.determinerVainqueur(combat);
            const combatEnrichi = await combatService.enrichCombatAsync(combat);

            // Identifier quelle équipe correspond à A ou B
            const equipeRouge = combatEnrichi.rouge.equipeId;
            const equipeBleu = combatEnrichi.bleu.equipeId;

            let estRougeEquipeA;
            if (equipeRouge === rencontre.equipeA) {
                estRougeEquipeA = true;
            } else if (equipeRouge === rencontre.equipeB) {
                estRougeEquipeA = false;
            } else {
                continue; // Combat ne concerne pas cette rencontre
            }

            // Compter les victoires
            if (vainqueur === 'rouge') {
                if (estRougeEquipeA) victoiresA++;
                else victoiresB++;
            } else if (vainqueur === 'bleu') {
                if (estRougeEquipeA) victoiresB++;
                else victoiresA++;
            }

            // Compter les points
            const pointsRouge = combatService.calculerPointsCombat(combatEnrichi, equipeRouge);
            const pointsBleu = combatService.calculerPointsCombat(combatEnrichi, equipeBleu);

            if (estRougeEquipeA) {
                pointsA += pointsRouge;
                pointsB += pointsBleu;
            } else {
                pointsA += pointsBleu;
                pointsB += pointsRouge;
            }
        }

        // Déterminer le vainqueur de la rencontre
        let vainqueurRencontre = null;
        if (victoiresA > victoiresB) {
            vainqueurRencontre = 'A';
        } else if (victoiresB > victoiresA) {
            vainqueurRencontre = 'B';
        } else if (pointsA > pointsB) {
            vainqueurRencontre = 'A';
        } else if (pointsB > pointsA) {
            vainqueurRencontre = 'B';
        }

        return {
            equipeA: rencontre.equipeA,
            equipeB: rencontre.equipeB,
            scoreA: victoiresA,
            scoreB: victoiresB,
            pointsA,
            pointsB,
            vainqueur: vainqueurRencontre,
            termine: true
        };
    }
}

module.exports = new ClassementService();