// src/services/combatService.js
const dataService = require('./dataService');
const configService = require('./configService');

class CombatService {
    constructor() {
        // ⚠️ AJOUTER : Cache simple
        this.cache = new Map();
        this.cacheTimeout = 1000; // 1 seconde
    }

    /**
     * Enrichit les données d'un combat avec les informations complètes
     * @param {Object} combat
     * @param {Object} preloadedData - Données pré-chargées optionnelles {equipes, combattants, tatamis}
     * @returns {Object} Combat enrichi
     */
    enrichCombat(combat, preloadedData = null) {
        if (!combat) return null;
        // ⚠️ Vérifier le cache
        const cacheKey = `combat-${combat.id}`;
        const cached = this.cache.get(cacheKey);

        if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
            return cached.data;
        }

        // Utiliser les données pré-chargées si fournies, sinon lire les fichiers
        // Avec cacheService, ces lectures sont maintenant très rapides
        const equipes = preloadedData?.equipes || dataService.readFile('equipes');
        const combattants = preloadedData?.combattants || dataService.readFile('combattants');
        const tatamis = preloadedData?.tatamis || dataService.readFile('tatamis');

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
                wazari: combat.wazariRouge || 0,
                ippon: combat.ipponRouge || false,
                yuko: combat.yukoRouge || 0,
                shido: combat.penalitesRouge || 0
            },
            bleu: {
                id: bleuCombattant?.id || bleuId || null,
                nom: bleuCombattant?.nom || combat.bleu?.nom || "Inconnu",
                equipe: bleuEquipe?.nom || combat.bleu?.equipe || "N/A",
                equipeId: bleuCombattant?.equipeId || combat.bleu?.equipeId,
                poids: bleuCombattant?.poids || combat.bleu?.poids || "Non défini",
                sexe: bleuCombattant?.sexe || combat.bleu?.sexe,
                wazari: combat.wazariBleu || 0,
                ippon: combat.ipponBleu || false,
                yuko: combat.yukoBleu || 0,
                shido: combat.penalitesBleu || 0
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
     * Enrichit plusieurs combats en une seule fois (optimisé)
     * Charge les données une seule fois pour tous les combats
     * @param {Array} combats - Tableau de combats à enrichir
     * @returns {Array} Combats enrichis
     */
    enrichCombats(combats) {
        if (!Array.isArray(combats) || combats.length === 0) {
            return [];
        }

        // Charger les données une seule fois pour tous les combats
        const preloadedData = {
            equipes: dataService.readFile('equipes'),
            combattants: dataService.readFile('combattants'),
            tatamis: dataService.readFile('tatamis')
        };

        // Enrichir chaque combat avec les données pré-chargées
        return combats.map(combat => this.enrichCombat(combat, preloadedData));
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
        if (combat.ipponRouge) return "rouge";
        if (combat.ipponBleu) return "bleu";

        // Double wazari
        if ((combat.wazariRouge || 0) >= thresholds.wazariForIppon) return "rouge";
        if ((combat.wazariBleu || 0) >= thresholds.wazariForIppon) return "bleu";

        // Défaite par pénalités (shido adversaire)
        if ((combat.penalitesBleu || 0) >= thresholds.shidoForDefeat) return "rouge";
        if ((combat.penalitesRouge || 0) >= thresholds.shidoForDefeat) return "bleu";

        // Avantage par wazari
        const wazariRouge = combat.wazariRouge || 0;
        const wazariBleu = combat.wazariBleu || 0;
        if (wazariRouge > wazariBleu) return "rouge";
        if (wazariBleu > wazariRouge) return "bleu";

        // Avantage par yuko
        const yukoRouge = combat.yukoRouge || 0;
        const yukoBleu = combat.yukoBleu || 0;
        if (yukoRouge > yukoBleu) return "rouge";
        if (yukoBleu > yukoRouge) return "bleu";

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
        if (combat.ipponRouge || combat.ipponBleu) {
            return 'ippon';
        }

        // Double wazari
        if ((combat.wazariRouge || 0) >= thresholds.wazariForIppon ||
            (combat.wazariBleu || 0) >= thresholds.wazariForIppon) {
            return 'double_wazari';
        }

        // Disqualification par shido
        if ((combat.penalitesRouge || 0) >= thresholds.shidoForDefeat ||
            (combat.penalitesBleu || 0) >= thresholds.shidoForDefeat) {
            return 'disqualification';
        }

        // Timer à 0 (sans osaekomi en cours)
        if (combat.timer !== undefined && combat.timer <= 0 && combat.etat === 'en cours') {
            return 'temps_ecoule';
        }

        // Fin en golden score avec avantage
        if (combat.etat === 'golden_score') {
            if ((combat.wazariRouge || 0) > 0 || (combat.wazariBleu || 0) > 0 ||
                (combat.yukoRouge || 0) > 0 || (combat.yukoBleu || 0) > 0) {
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
                combatCopie[`ippon${couleur}`] = true;
                break;
            case 'wazari':
                combatCopie[`wazari${couleur}`] = (combatCopie[`wazari${couleur}`] || 0) + 1;
                break;
            case 'yuko':
                combatCopie[`yuko${couleur}`] = (combatCopie[`yuko${couleur}`] || 0) + 1;
                break;
            case 'shido':
                // Le shido est donné à l'adversaire
                combatCopie[`penalites${couleur}`] = (combatCopie[`penalites${couleur}`] || 0) + 1;
                break;
            default:
                throw new Error(`Type de point invalide: ${type}`);
        }

        // Vérifier si le combat doit se terminer automatiquement
        const raisonFin = this.verifierFinCombat(combatCopie);
        if (raisonFin) {
            combatCopie.etat = 'terminé';
            combatCopie.dateFin = new Date().toISOString();
            combatCopie.raisonFin = raisonFin;
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
            combatCopie[`ippon${couleur}`] = true;
            pointsMarques.push('ippon');

            // NE PAS effacer les autres scores ! L'ippon s'ajoute aux scores existants
            // Les wazari et yuko précédents (hors osaekomi) restent, mais sont "masqués" par l'ippon

            // Fin automatique du combat sur ippon
            combatCopie.etat = 'terminé';
            combatCopie.dateFin = new Date().toISOString();
            combatCopie.raisonFin = 'osaekomi_ippon';
            combatCopie.vainqueur = cote;

        } else if (duree >= osaekomoConfig.wazari) {
            // 15s = +1 Wazari + conversion d'1 Yuko DE CET OSAEKOMI
            const wazariActuel = combatCopie[`wazari${couleur}`] || 0;
            let yukoActuel = combatCopie[`yuko${couleur}`] || 0;

            // Cet osaekomi génère 1 yuko (10s-15s) + 1 wazari (15s)
            // Donc on a 1 yuko "virtuel" de cet osaekomi à convertir
            yukoActuel += 1; // Ajouter le yuko de 10s-15s de cet osaekomi

            // Ajouter le wazari
            combatCopie[`wazari${couleur}`] = wazariActuel + 1;
            pointsMarques.push('wazari');

            // Conversion : retirer 1 yuko (du total disponible)
            if (yukoActuel > 0) {
                yukoActuel -= 1; // Conversion d'1 yuko
            }

            combatCopie[`yuko${couleur}`] = yukoActuel;

            // Fin automatique si double wazari
            if (combatCopie[`wazari${couleur}`] >= 2) {
                combatCopie.etat = 'terminé';
                combatCopie.dateFin = new Date().toISOString();
                combatCopie.raisonFin = 'double_wazari';
                combatCopie.vainqueur = cote;
            }

        } else if (duree >= osaekomoConfig.yuko) {
            // 10s = +1 Yuko simple
            const yukoActuel = combatCopie[`yuko${couleur}`] || 0;
            combatCopie[`yuko${couleur}`] = yukoActuel + 1;
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
     * @param {Object} combat
     * @param {string} equipeId
     * @returns {number}
     */
    calculerPointsCombat(combat, equipeId) {
        if (combat.etat !== 'terminé') return 0;

        const pointsConfig = configService.getPointsConfig();
        let points = 0;

        // Déterminer la couleur de l'équipe dans ce combat
        const combatEnrichi = this.enrichCombat(combat);
        const estRouge = combatEnrichi.rouge.equipeId === equipeId;
        const estBleu = combatEnrichi.bleu.equipeId === equipeId;

        if (!estRouge && !estBleu) return 0;

        if (estRouge) {
            if (combat.ipponRouge) points += pointsConfig.ippon;
            points += (combat.wazariRouge || 0) * pointsConfig.wazari;
            points += (combat.yukoRouge || 0) * (pointsConfig.yuko || 1);
        }

        if (estBleu) {
            if (combat.ipponBleu) points += pointsConfig.ippon;
            points += (combat.wazariBleu || 0) * pointsConfig.wazari;
            points += (combat.yukoBleu || 0) * (pointsConfig.yuko || 1);
        }

        return points;
    }

    /**
     * Détermine si une équipe a gagné un combat
     * @param {Object} combat
     * @param {string} equipeId
     * @returns {boolean}
     */
    aGagneCombat(combat, equipeId) {
        const vainqueur = this.determinerVainqueur(combat);
        if (!vainqueur) return false;

        const combatEnrichi = this.enrichCombat(combat);
        const estRouge = combatEnrichi.rouge.equipeId === equipeId;
        const estBleu = combatEnrichi.bleu.equipeId === equipeId;

        return (vainqueur === 'rouge' && estRouge) || (vainqueur === 'bleu' && estBleu);
    }

    /**
     * Génère les combats entre deux équipes
     * @param {string} equipeAId
     * @param {string} equipeBId
     * @returns {Array} Liste des combats créés
     */
    genererCombatsEquipes(equipeAId, equipeBId) {
        const combattants = dataService.readFile('combattants');

        const combattantsA = combattants.filter(c => c.equipeId === equipeAId);
        const combattantsB = combattants.filter(c => c.equipeId === equipeBId);

        const combatsCrees = [];

        // Grouper par catégorie (poids + sexe)
        const categoriesA = this._grouperParCategorie(combattantsA);
        const categoriesB = this._grouperParCategorie(combattantsB);
        const combatConfig = configService.getCombatConfig();

        // Créer un combat pour chaque catégorie commune
        Object.keys(categoriesA).forEach(categorie => {
            if (categoriesB[categorie]) {
                // Prendre le premier combattant de chaque équipe dans cette catégorie
                const rouge = categoriesA[categorie][0];
                const bleu = categoriesB[categorie][0];

                const combat = dataService.add('combats', {
                    rouge: { ...rouge, equipeId: equipeAId },
                    bleu: { ...bleu, equipeId: equipeBId },
                    etat: 'prévu',
                    ipponRouge: false,
                    ipponBleu: false,
                    wazariRouge: 0,
                    wazariBleu: 0,
                    yukoRouge: 0,
                    yukoBleu: 0,
                    penalitesRouge: 0,
                    penalitesBleu: 0,
                    timer: combatConfig.dureeParDefaut,
                    dateCreation: new Date().toISOString()
                });

                combatsCrees.push(combat);
            }
        });

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
    getStatsCombattant(combattantId) {
        const combats = dataService.readFile('combats');
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
            pointsMarques: { ippon: 0, wazari: 0, yuko: 0 },
            penalitesRecues: 0
        };

        combatsCombattant.forEach(combat => {
            const combatEnrichi = this.enrichCombat(combat);
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
                    if (combat.ipponRouge) stats.pointsMarques.ippon++;
                    stats.pointsMarques.wazari += combat.wazariRouge || 0;
                    stats.pointsMarques.yuko += combat.yukoRouge || 0;
                    stats.penalitesRecues += combat.penalitesRouge || 0;
                } else {
                    if (combat.ipponBleu) stats.pointsMarques.ippon++;
                    stats.pointsMarques.wazari += combat.wazariBleu || 0;
                    stats.pointsMarques.yuko += combat.yukoBleu || 0;
                    stats.penalitesRecues += combat.penalitesBleu || 0;
                }
            }
        });

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