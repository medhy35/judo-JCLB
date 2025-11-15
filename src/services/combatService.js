// src/services/combatService.js
const dataService = require('./databaseAdapter');
const configService = require('./configService');
const sseManager = require('./sseManager');

class CombatService {
    constructor() {
        // ⚠️ AJOUTER : Cache simple
        this.cache = new Map();
        this.cacheTimeout = 1000; // 1 seconde
    }

    /**
     * Enrichit les données d'un combat avec les informations complètes
     * @param {Object} combat
     * @returns {Object} Combat enrichi
     */
    enrichCombat(combat) {
        if (!combat) return null;
        // ⚠️ Vérifier le cache
        const cacheKey = `combat-${combat.id}`;
        const cached = this.cache.get(cacheKey);

        if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
            return cached.data;
        }

        const equipes = dataService.readFile('equipes');
        const combattants = dataService.readFile('combattants');
        const tatamis = dataService.readFile('tatamis');

        // Récupération des combattants
        const rougeId = typeof combat.rouge === "object" ? combat.rouge.id : combat.rouge;
        const bleuId = typeof combat.bleu === "object" ? combat.bleu.id : combat.bleu;

        const rougeCombattant = combattants.find(c => Number(c.id) === Number(rougeId));
        const bleuCombattant = combattants.find(c => Number(c.id) === Number(bleuId));

        // Récupération des équipes
        const rougeEquipe = rougeCombattant ? equipes.find(e => e.id === rougeCombattant.equipeId) : null;
        const bleuEquipe = bleuCombattant ? equipes.find(e => e.id === bleuCombattant.equipeId) : null;

        // Trouver le tatami assigné
        const tatami = tatamis.find(t => Array.isArray(t.combatsIds) && t.combatsIds.includes(combat.id));

        // Déterminer le vainqueur
        const vainqueur = this.determinerVainqueur(combat);

        const enrichedCombat = {
            ...combat,
            rouge: {
                id: rougeCombattant?.id || rougeId || null,
                nom: rougeCombattant?.nom || combat.rouge?.nom || "Inconnu",
                equipe: rougeEquipe?.nom || combat.rouge?.equipe || "N/A",
                equipeId: rougeCombattant?.equipeId || combat.rouge?.equipeId,
                poids: rougeCombattant?.poids || combat.rouge?.poids || "Non défini",
                sexe: rougeCombattant?.sexe || combat.rouge?.sexe,
                wazari: combat.rouge_wazari || 0,
                ippon: combat.rouge_ippon || false,
                yuko: combat.rouge_yuko || 0,
                shido: combat.rouge_shido || 0
            },
            bleu: {
                id: bleuCombattant?.id || bleuId || null,
                nom: bleuCombattant?.nom || combat.bleu?.nom || "Inconnu",
                equipe: bleuEquipe?.nom || combat.bleu?.equipe || "N/A",
                equipeId: bleuCombattant?.equipeId || combat.bleu?.equipeId,
                poids: bleuCombattant?.poids || combat.bleu?.poids || "Non défini",
                sexe: bleuCombattant?.sexe || combat.bleu?.sexe,
                wazari: combat.bleu_wazari || 0,
                ippon: combat.bleu_ippon || false,
                yuko: combat.bleu_yuko || 0,
                shido: combat.bleu_shido || 0
            },
            tatami: tatami ? tatami.nom : "Non assigné",
            tatamiId: tatami?.id || null,
            vainqueur
        };
        // ⚠️ METTRE EN CACHE avant de retourner
        this.cache.set(cacheKey, {
            data: enrichedCombat,
            timestamp: Date.now()
        });
        return enrichedCombat;
    }

    /**
     * Version async de enrichCombat
     */
    async enrichCombatAsync(combat) {
        if (!combat) return null;

        const equipes = await dataService.getAllEquipes();
        const combattants = await dataService.getAllCombattants();
        const tatamis = await dataService.getAllTatamis();

        // Récupération des combattants
        const rougeId = typeof combat.rouge === "object" ? combat.rouge.id : combat.rouge;
        const bleuId = typeof combat.bleu === "object" ? combat.bleu.id : combat.bleu;

        const rougeCombattant = combattants.find(c => Number(c.id) === Number(rougeId));
        const bleuCombattant = combattants.find(c => Number(c.id) === Number(bleuId));

        // Récupération des équipes (gérer equipeId et equipe_id)
        const rougeEquipe = rougeCombattant ?
            equipes.find(e => e.id === (rougeCombattant.equipeId || rougeCombattant.equipe_id)) : null;
        const bleuEquipe = bleuCombattant ?
            equipes.find(e => e.id === (bleuCombattant.equipeId || bleuCombattant.equipe_id)) : null;

        // Trouver le tatami assigné
        const tatami = tatamis.find(t => Array.isArray(t.combatsIds) && t.combatsIds.includes(combat.id));

        // Déterminer le vainqueur
        const vainqueur = this.determinerVainqueur(combat);

        return {
            ...combat,
            rouge: {
                id: rougeCombattant?.id || rougeId || null,
                nom: rougeCombattant?.nom || combat.rouge?.nom || "Inconnu",
                equipe: rougeEquipe?.nom || combat.rouge?.equipe || "N/A",
                equipeId: rougeCombattant?.equipeId || rougeCombattant?.equipe_id || combat.rouge?.equipeId,
                poids: rougeCombattant?.poids || combat.rouge?.poids || "Non défini",
                sexe: rougeCombattant?.sexe || combat.rouge?.sexe,
                wazari: combat.rouge_wazari || 0,
                ippon: combat.rouge_ippon || false,
                yuko: combat.rouge_yuko || 0,
                shido: combat.rouge_shido || 0
            },
            bleu: {
                id: bleuCombattant?.id || bleuId || null,
                nom: bleuCombattant?.nom || combat.bleu?.nom || "Inconnu",
                equipe: bleuEquipe?.nom || combat.bleu?.equipe || "N/A",
                equipeId: bleuCombattant?.equipeId || bleuCombattant?.equipe_id || combat.bleu?.equipeId,
                poids: bleuCombattant?.poids || combat.bleu?.poids || "Non défini",
                sexe: bleuCombattant?.sexe || combat.bleu?.sexe,
                wazari: combat.bleu_wazari || 0,
                ippon: combat.bleu_ippon || false,
                yuko: combat.bleu_yuko || 0,
                shido: combat.bleu_shido || 0
            },
            tatami: tatami ? tatami.nom : "Non assigné",
            tatamiId: tatami?.id || null,
            vainqueur
        };
    }

    /**
     * Détermine le vainqueur d'un combat
     * @param {Object} combat
     * @returns {string|null} 'rouge', 'bleu', ou null
     */
    determinerVainqueur(combat) {
        if (combat.etat !== "terminé") return null;

        const thresholds = configService.getThresholdsConfig();

        // Ippon direct
        if (combat.rouge_ippon || combat.rouge?.ippon) return "rouge";
        if (combat.bleu_ippon || combat.bleu?.ippon) return "bleu";


        // Double wazari
        const rougeWazari = combat.rouge_wazari || combat.rouge?.wazari || 0;
        const bleuWazari = combat.bleu_wazari || combat.bleu?.wazari || 0;

        if (rougeWazari >= thresholds.wazariForIppon) return "rouge";
        if (bleuWazari >= thresholds.wazariForIppon) return "bleu";

        // Défaite par pénalités (shido adversaire)
        const rougeShido = combat.rouge_shido || combat.rouge?.shido || 0;
        const bleuShido = combat.bleu_shido || combat.bleu?.shido || 0;

        if (bleuShido >= thresholds.shidoForDefeat) return "rouge";
        if (rougeShido >= thresholds.shidoForDefeat) return "bleu";


        // Avantage par wazari
        if (rougeWazari > bleuWazari) return "rouge";
        if (bleuWazari > rougeWazari) return "bleu";

        // Avantage par yuko
        const rougeYuko = combat.rouge_yuko || combat.rouge?.yuko || 0;
        const bleuYuko = combat.bleu_yuko || combat.bleu?.yuko || 0;

        if (rougeYuko > bleuYuko) return "rouge";
        if (bleuYuko > rougeYuko) return "bleu";

        // Égalité
        return null;
    }

    /**
     * Vérifie si un combat doit se terminer automatiquement
     * @param {Object} combat
     * @returns {string|null} Raison de la fin ou null
     */
    verifierFinCombat(combat) {
        const thresholds = configService.getThresholdsConfig();

        // Ippon
        if (combat.rouge_ippon || combat.bleu_ippon) {
            return 'ippon';
        }

        // Double wazari
        if ((combat.rouge_wazari || 0) >= thresholds.wazariForIppon ||
            (combat.bleu_wazari || 0) >= thresholds.wazariForIppon) {
            return 'double_wazari';
        }

        // Disqualification par shido
        if ((combat.rouge_shido || 0) >= thresholds.shidoForDefeat ||
            (combat.bleu_shido || 0) >= thresholds.shidoForDefeat) {
            return 'disqualification';
        }

        // Fin en golden score avec avantage
        if (combat.etat === 'golden_score') {
            if ((combat.rouge_wazari || 0) > 0 || (combat.bleu_wazari || 0) > 0 ||
                (combat.rouge_yuko || 0) > 0 || (combat.bleu_yuko || 0) > 0) {
                return 'avantage_golden_score';
            }
        }

        return null;
    }

    /**
     * Met à jour automatiquement les scores d'un combat après un point
     * @param {Object} combat
     * @param {string} cote - 'rouge' ou 'bleu'
     * @param {string} type - 'ippon', 'wazari', 'yuko', 'shido'
     * @returns {Object} Combat mis à jour
     */
    marquerPoint(combat, cote, type) {
        if (!combat || combat.etat === 'terminé') {
            throw new Error('Combat terminé ou invalide');
        }

        const combatCopie = { ...combat };
        const couleur = cote.charAt(0).toUpperCase() + cote.slice(1);

        switch (type) {
            case 'ippon':
                combatCopie[`${cote}_ippon`] = 1;
                break;
            case 'wazari':
                combatCopie[`${cote}_wazari`] = (combatCopie[`${cote}_wazari`] || 0) + 1;
                break;
            case 'yuko':
                combatCopie[`${cote}_yuko`] = (combatCopie[`${cote}_yuko`] || 0) + 1;
                break;
            case 'shido':
                // Le shido est donné à l'adversaire
                combatCopie[`${cote}_shido`] = (combatCopie[`${cote}_shido`] || 0) + 1;
                break;
            default:
                throw new Error(`Type de point invalide: ${type}`);
        }

        // Vérifier si le combat doit se terminer
        const raisonFin = this.verifierFinCombat(combatCopie);
        if (raisonFin) {
            combatCopie.etat = 'terminé';
            combatCopie.date_fin = new Date().toISOString();
            combatCopie.raison_fin = raisonFin;
            combatCopie.vainqueur = this.determinerVainqueur(combatCopie);
        }

        return combatCopie;
    }

    /**
     * Traite les règles de l'osaekomi
     * @param {number} duree - Durée en secondes
     * @param {Object} combat
     * @param {string} cote - 'rouge' ou 'bleu'
     * @returns {Object} Résultat de l'osaekomi
     */
    traiterOsaekomi(duree, combat, cote) {
        const osaekomoConfig = configService.getOsaekomoConfig();
        const combatCopie = { ...combat };
        const couleur = cote.charAt(0).toUpperCase() + cote.slice(1);

        let pointsMarques = [];

        if (duree >= osaekomoConfig.ippon) {
            // 20s = Ippon (remplace SEULEMENT les points de CET osaekomi)
            combatCopie[`${cote}_ippon`] = 1;
            pointsMarques.push('ippon');

            // NE PAS effacer les autres scores ! L'ippon s'ajoute aux scores existants
            // Les wazari et yuko précédents (hors osaekomi) restent, mais sont "masqués" par l'ippon

            // Combat terminé par Ippon
            combatCopie.etat = 'terminé';
            combatCopie.date_fin = new Date().toISOString();
            combatCopie.raison_fin = 'osaekomi_ippon';
            combatCopie.vainqueur = cote;

        } else if (duree >= osaekomoConfig.wazari) {
            // 15s = +1 Wazari + conversion d'1 Yuko DE CET OSAEKOMI
            const wazariActuel = combatCopie[`${cote}_wazari`] || 0;
            let yukoActuel = combatCopie[`${cote}_yuko`] || 0;

            let yukosTotal = yukoActuel + 1;  // Ajouter le yuko de cet osaekomi
            let wazarisTotal = wazariActuel + 1;  // Ajouter le wazari de cet osaekomi

            if (yukosTotal > 0) {
                yukosTotal -= 1;
            }
            combatCopie[`${cote}_wazari`] = wazarisTotal;
            combatCopie[`${cote}_yuko`] = yukosTotal;

            // Cet osaekomi génère 1 yuko (10s-15s) + 1 wazari (15s)
            // Donc on a 1 yuko "virtuel" de cet osaekomi à convertir
            // yukoActuel += 1; // Ajouter le yuko de 10s-15s de cet osaekomi

            // Ajouter le wazari
            /*combatCopie[`${cote}_wazari`] = wazariActuel + 1;*/
            pointsMarques.push('wazari');

            // Conversion : retirer 1 yuko (du total disponible)


            //combatCopie[`${cote}_yuko`] = yukoActuel;

            // Vérifier si double wazari = victoire
            if (wazarisTotal >= configService.getThresholdsConfig().wazariForIppon) {
                combatCopie.etat = 'terminé';
                combatCopie.date_fin = new Date().toISOString();
                combatCopie.raison_fin = 'double_wazari';
                combatCopie.vainqueur = cote;
            }

        } else if (duree >= osaekomoConfig.yuko) {
            // 10s = +1 Yuko simple
            const yukoActuel = combatCopie[`${cote}_yuko`] || 0;
            combatCopie[`${cote}_yuko`] = yukoActuel + 1;
            pointsMarques.push('yuko');
        }

        return {
            combat: combatCopie,
            pointsMarques,
            finCombat: combatCopie.etat === 'terminé'
        };
    }

    /**
     * Calcule les points d'un combat pour une équipe
     *  * ⚠️ IMPORTANT : Le combat doit être enrichi AVANT d'appeler cette méthode
     * @param {Object} combat
     * @param {string} equipeId
     * @returns {number}
     */
    calculerPointsCombat(combat, equipeId) {
        if (combat.etat !== 'terminé') return 0;

        const pointsConfig = configService.getPointsConfig();
        let points = 0;

        const estRouge = combat.rouge?.equipeId === equipeId;
        const estBleu = combat.bleu?.equipeId === equipeId;

        if (!estRouge && !estBleu) return 0;

        if (estRouge) {
            if (combat.rouge_ippon) points += pointsConfig.ippon;
            points += (combat.rouge_wazari || 0) * pointsConfig.wazari;
            points += (combat.rouge_yuko || 0) * (pointsConfig.yuko || 1);
        }

        if (estBleu) {
            if (combat.bleu_ippon) points += pointsConfig.ippon;
            points += (combat.bleu_wazari || 0) * pointsConfig.wazari;
            points += (combat.bleu_yuko || 0) * (pointsConfig.yuko || 1);
        }

        return points;
    }

    /**
     * Détermine si une équipe a gagné un combat
     *  * ⚠️ IMPORTANT : Le combat doit être enrichi AVANT d'appeler cette méthode
     * @param {Object} combat
     * @param {string} equipeId
     * @returns {boolean}
     */
    aGagneCombat(combat, equipeId) {
        const vainqueur = this.determinerVainqueur(combat);
        if (!vainqueur) return false;

        // Utiliser directement le combat (doit être enrichi avant)
        const estRouge = combat.rouge?.equipeId === equipeId;
        const estBleu = combat.bleu?.equipeId === equipeId;

        return (vainqueur === 'rouge' && estRouge) || (vainqueur === 'bleu' && estBleu);
    }

    /**
     * Génère les combats entre deux équipes
     * @param {string} equipeAId
     * @param {string} equipeBId
     * @returns {Array} Liste des combats créés
     */
    async genererCombatsEquipes(equipeAId, equipeBId) {
        const combattants = await dataService.getAllCombattants();

        const combattantsA = combattants.filter(c =>
            (c.equipeId || c.equipe_id) === equipeAId
        );
        const combattantsB = combattants.filter(c =>
            (c.equipeId || c.equipe_id) === equipeBId
        );

        const combatsCrees = [];

        // Grouper par catégorie (poids + sexe)
        const categoriesA = this._grouperParCategorie(combattantsA);
        const categoriesB = this._grouperParCategorie(combattantsB);
        const combatConfig = configService.getCombatConfig();

        // Créer un combat pour chaque catégorie commune
        for (const categorie of Object.keys(categoriesA)) {
            if (categoriesB[categorie]) {
                // Prendre le premier combattant de chaque équipe dans cette catégorie
                const rouge = categoriesA[categorie][0];
                const bleu = categoriesB[categorie][0];

                const combat = await dataService.createCombat({
                    rouge: { ...rouge, equipeId: equipeAId },
                    bleu: { ...bleu, equipeId: equipeBId },
                    etat: 'prévu',
                    rouge_ippon: false,
                    bleu_ippon: false,
                    rouge_wazari: 0,
                    bleu_wazari: 0,
                    rouge_yuko: 0,
                    bleu_yuko: 0,
                    rouge_shido: 0,
                    bleu_shido: 0,
                    timer: combatConfig.dureeParDefaut,
                    dateCreation: new Date().toISOString()
                });

                combatsCrees.push(combat);
            }
        }

        dataService.addLog(`${combatsCrees.length} combats générés entre équipes`, {
            equipeA: equipeAId,
            equipeB: equipeBId,
            combatsIds: combatsCrees.map(c => c.id)
        });

        return combatsCrees;
    }

    /**
     * Groupe les combattants par catégorie (poids + sexe)
     * @private
     */
    _grouperParCategorie(combattants) {
        const groupes = {};

        combattants.forEach(c => {
            const categorie = `${c.sexe}-${c.poids}`;
            if (!groupes[categorie]) {
                groupes[categorie] = [];
            }
            groupes[categorie].push(c);
        });

        return groupes;
    }

    /**
     * Obtient les statistiques d'un combattant
     * @param {number} combattantId
     * @returns {Object}
     */
    async getStatsCombattant(combattantId) {
        const combats = await dataService.getAllCombats();
        const combatsCombattant = combats.filter(c =>
            (c.rouge && (c.rouge.id === combattantId || c.rouge === combattantId)) ||
            (c.bleu && (c.bleu.id === combattantId || c.bleu === combattantId))
        );

        const stats = {
            totalCombats: combatsCombattant.length,
            victoires: 0,
            defaites: 0,
            egalites: 0,
            combatsTermines: 0,
            pointsMarques: {ippon: 0, wazari: 0, yuko: 0},
            penalitesRecues: 0
        };

        for (const combat of combatsCombattant) {
            const combatEnrichi = await this.enrichCombatAsync(combat);
            const estRouge = combatEnrichi.rouge.id == combattantId;

            if (combat.etat === 'terminé') {
                stats.combatsTermines++;

                const vainqueur = this.determinerVainqueur(combat);
                if (vainqueur === 'rouge' && estRouge) {
                    stats.victoires++;
                } else if (vainqueur === 'bleu' && !estRouge) {
                    stats.victoires++;
                } else if (vainqueur === null) {
                    stats.egalites++;
                } else {
                    stats.defaites++;
                }

                // Points marqués
                if (estRouge) {
                    if (combat.rouge_ippon) stats.pointsMarques.ippon++;
                    stats.pointsMarques.wazari += combat.rouge_wazari || 0;
                    stats.pointsMarques.yuko += combat.rouge_yuko || 0;
                    stats.penalitesRecues += combat.rouge_shido || 0;
                } else {
                    if (combat.bleu_ippon) stats.pointsMarques.ippon++;
                    stats.pointsMarques.wazari += combat.bleu_wazari || 0;
                    stats.pointsMarques.yuko += combat.bleu_yuko || 0;
                    stats.penalitesRecues += combat.bleu_shido || 0;
                }
            }
        }

        return stats;
    }

    /**
     * Valide si un combat peut être modifié
     * @param {Object} combat
     * @param {string} action
     * @returns {Object} { valid: boolean, error?: string }
     */
    validerModificationCombat(combat, action) {
        if (!combat) {
            return { valid: false, error: 'Combat introuvable' };
        }

        switch (action) {
            case 'marquer_point':
            case 'start_osaekomi':
                if (combat.etat === 'terminé') {
                    return { valid: false, error: 'Combat déjà terminé' };
                }
                if (combat.etat !== 'en cours' && combat.etat !== 'pause') {
                    return { valid: false, error: 'Combat doit être en cours ou en pause' };
                }
                break;

            case 'stop_osaekomi':
                if (!combat.osaekomoActif) {
                    return { valid: false, error: 'Aucun osaekomi en cours' };
                }
                break;

            case 'correction':
            case 'reset':
                // Les corrections et reset sont toujours autorisés
                break;

            default:
                return { valid: false, error: 'Action non reconnue' };
        }

        return { valid: true };
    }

    /**
     * Formate les données d'un combat pour l'affichage public
     * @param {Object} combat
     * @returns {Object} Combat formaté pour affichage public
     */
    formaterCombatPublic(combat) {
        const combatEnrichi = this.enrichCombat(combat);

        return {
            id: combatEnrichi.id,
            etat: combatEnrichi.etat,
            timer: combatEnrichi.timer,
            tatami: combatEnrichi.tatami,
            rouge: {
                nom: combatEnrichi.rouge.nom,
                equipe: combatEnrichi.rouge.equipe,
                scores: {
                    ippon: combatEnrichi.rouge.ippon,
                    wazari: combatEnrichi.rouge.wazari,
                    yuko: combatEnrichi.rouge.yuko,
                    shido: combatEnrichi.rouge.shido
                }
            },
            bleu: {
                nom: combatEnrichi.bleu.nom,
                equipe: combatEnrichi.bleu.equipe,
                scores: {
                    ippon: combatEnrichi.bleu.ippon,
                    wazari: combatEnrichi.bleu.wazari,
                    yuko: combatEnrichi.bleu.yuko,
                    shido: combatEnrichi.bleu.shido
                }
            },
            vainqueur: combatEnrichi.vainqueur,
            raisonFin: combatEnrichi.raisonFin
        };
    }
}

module.exports = new CombatService();