// src/utils/socketEvents.js
const dataService = require('../services/dataService');

class SocketEvents {
    constructor() {
        this.io = null;
    }

    /**
     * Initialise les événements Socket.io
     * @param {Server} io Instance Socket.io
     */
    init(io) {
        this.io = io;

        this.io.on('connection', (socket) => {
            // Logging réduit : seulement en console, pas dans le fichier
            console.log('[WebSocket] Client connecté:', socket.id);

            // ⚠️ AJOUTER : Gestion des rooms par tatami
            socket.on('join-tatami', (tatamiId) => {
                const roomName = `tatami-${tatamiId}`;
                socket.join(roomName);
                console.log(`✅ Client ${socket.id} rejoint la room ${roomName}`);

                socket.emit('joined-tatami', { tatamiId, roomName });
            });

            socket.on('leave-tatami', (tatamiId) => {
                const roomName = `tatami-${tatamiId}`;
                socket.leave(roomName);
                console.log(`👋 Client ${socket.id} quitte la room ${roomName}`);
            });

            // Événements Osaekomi
            socket.on('osaekomi:update', (data) => {
                this.handleOsaekomiUpdate(socket, data);
            });

            socket.on('osaekomi:stop', (data) => {
                this.handleOsaekomiStop(socket, data);
            });

            // Événements Combat
            socket.on('combats:update', (data) => {
                this.handleCombatUpdate(socket, data);
            });

            // Déconnexion
            socket.on('disconnect', () => {
                // Logging réduit : seulement en console
                console.log('[WebSocket] Client déconnecté:', socket.id);
            });
        });
    }

    /**
     * Diffuse un événement à tous les clients connectés
     * @param {string} event Nom de l'événement
     * @param {Object} data Données à envoyer
     */
    broadcast(event, data) {
        if (!this.io) {
            console.warn('Socket.io non initialisé');
            return;
        }

        this.io.emit(event, data);
        // Logging supprimé pour performance - broadcast appelé très fréquemment
    }

    /**
     * Diffuse un événement à une room spécifique
     * @param {string} room Nom de la room
     * @param {string} event Nom de l'événement
     * @param {Object} data Données à envoyer
     */
    broadcastToRoom(room, event, data) {
        if (!this.io) return;

        this.io.to(room).emit(event, data);
        // Logging supprimé pour performance
    }

    /**
     * Gère les mises à jour d'Osaekomi
     * @private
     */
    handleOsaekomiUpdate(socket, data) {
        const { tatamiId, osaekomiCounter, osaekomiCote } = data;

        if (!tatamiId || typeof osaekomiCounter !== 'number') {
            socket.emit('error', { message: 'Données Osaekomi invalides' });
            return;
        }

        // Vérifier que le tatami existe
        const tatami = dataService.findById('tatamis', tatamiId);
        if (!tatami) {
            socket.emit('error', { message: 'Tatami introuvable' });
            return;
        }

        // Diffuser à tous les clients (sauf l'expéditeur)
        socket.broadcast.emit('osaekomi:update', {
            tatamiId,
            osaekomiCounter,
            osaekomiCote,
            timestamp: new Date().toISOString()
        });

        // Log important gardé avec type pour filtrage
        dataService.addLog('Osaekomi update', { type: 'combat', tatamiId, counter: osaekomiCounter, cote: osaekomiCote });
    }

    /**
     * Gère l'arrêt d'Osaekomi
     * @private
     */
    handleOsaekomiStop(socket, data) {
        const { tatamiId } = data;

        if (!tatamiId) {
            socket.emit('error', { message: 'tatamiId requis' });
            return;
        }

        // Diffuser à tous les clients
        socket.broadcast.emit('osaekomi:stop', {
            tatamiId,
            timestamp: new Date().toISOString()
        });

        dataService.addLog('Osaekomi stop', { type: 'combat', tatamiId });
    }

    /**
     * Gère les mises à jour de combat
     * @private
     */
    handleCombatUpdate(socket, data) {
        const { tatamiId, combat } = data;

        if (!tatamiId || !combat) {
            socket.emit('error', { message: 'Données combat invalides' });
            return;
        }

        // Diffuser à tous les autres clients
        socket.broadcast.emit('combats:update', {
            tatamiId,
            combat,
            timestamp: new Date().toISOString()
        });

        dataService.addLog('Combat update broadcasted', {
            type: 'combat',
            tatamiId,
            combatId: combat.id,
            etat: combat.etat
        });
    }

    // === MÉTHODES DE DIFFUSION SPÉCIALISÉES ===

    /**
     * Diffuse une mise à jour des tatamis (optimisé avec rooms)
     * @param {Object} tatami Tatami mis à jour
     * @param {Object} combatActuel Combat actuel (optionnel)
     */
    broadcastTatamiUpdate(tatami, combatActuel = null) {
        const data = {
            tatami,
            combatActuel,
            timestamp: new Date().toISOString()
        };

        // Broadcast ciblé vers la room du tatami + broadcast global
        if (tatami && tatami.id) {
            this.broadcastToRoom(`tatami-${tatami.id}`, 'tatamis:update', data);
        }
        // Broadcast global pour les vues d'ensemble (dashboard)
        this.broadcast('tatamis:update', data);
    }

    /**
     * Diffuse une mise à jour de combat (optimisé avec rooms)
     * @param {number} tatamiId ID du tatami
     * @param {Object} combat Combat mis à jour
     */
    broadcastCombatUpdate(tatamiId, combat) {
        const data = {
            tatamiId,
            combat,
            timestamp: new Date().toISOString()
        };

        // Broadcast ciblé vers la room du tatami concerné
        if (tatamiId) {
            this.broadcastToRoom(`tatami-${tatamiId}`, 'combats:update', data);
        }
        // Broadcast global pour les vues d'ensemble
        this.broadcast('combats:update', data);
    }

    /**
     * Diffuse une mise à jour des équipes
     * @param {Object} equipe Équipe mise à jour
     */
    broadcastEquipeUpdate(equipe) {
        this.broadcast('equipes:update', {
            equipe,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Diffuse une mise à jour des combattants
     * @param {Object} combattant Combattant mis à jour
     */
    broadcastCombattantUpdate(combattant) {
        this.broadcast('combattants:update', {
            combattant,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Diffuse une mise à jour des poules
     * @param {Array} poules Poules mises à jour
     */
    broadcastPoulesUpdate(poules) {
        this.broadcast('poules:update', {
            poules,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Diffuse une mise à jour des classements
     * @param {string} type Type de classement ('poule' ou 'general')
     * @param {Object|Array} data Données du classement
     */
    broadcastClassementUpdate(type, data) {
        this.broadcast('classement:update', {
            type,
            data,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Diffuse un événement de fin de combat avec effet spécial
     * @param {Object} combat Combat terminé
     * @param {string} vainqueur Nom du vainqueur
     */
    broadcastFinCombat(combat, vainqueur) {
        this.broadcast('combat:termine', {
            combat,
            vainqueur,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Diffuse les données complètes pour une reconnexion
     * @param {Object} socket Socket du client qui se reconnecte
     */
    sendFullStateToClient(socket) {
        const state = {
            tatamis: dataService.readFile('tatamis'),
            combats: dataService.readFile('combats'),
            equipes: dataService.readFile('equipes'),
            combattants: dataService.readFile('combattants'),
            poules: dataService.readFile('poules'),
            timestamp: new Date().toISOString()
        };

        socket.emit('full-state', state);
        // Log supprimé - événement fréquent sur reconnexion
    }

    /**
     * Diffuse une notification générale
     * @param {string} message Message à afficher
     * @param {string} type Type de notification ('info', 'success', 'warning', 'error')
     * @param {Object} data Données supplémentaires (optionnel)
     */
    broadcastNotification(message, type = 'info', data = {}) {
        this.broadcast('notification', {
            message,
            type,
            data,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Diffuse les statistiques en temps réel
     */
    broadcastStats() {
        const tatamis = dataService.readFile('tatamis');
        const combats = dataService.readFile('combats');
        const equipes = dataService.readFile('equipes');
        const combattants = dataService.readFile('combattants');

        const stats = {
            tatamis: {
                total: tatamis.length,
                libres: tatamis.filter(t => t.etat === 'libre').length,
                occupes: tatamis.filter(t => t.etat === 'occupé').length,
                enPause: tatamis.filter(t => t.etat === 'pause').length
            },
            combats: {
                total: combats.length,
                termines: combats.filter(c => c.etat === 'terminé').length,
                enCours: combats.filter(c => c.etat === 'en cours').length,
                prevus: combats.filter(c => c.etat === 'prévu').length
            },
            equipes: equipes.length,
            combattants: combattants.length
        };

        this.broadcast('stats:update', {
            stats,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Obtient le nombre de clients connectés
     * @returns {number}
     */
    getConnectedClientsCount() {
        return this.io ? this.io.engine.clientsCount : 0;
    }

    /**
     * Crée une room pour un tatami spécifique
     * @param {Object} socket
     * @param {number} tatamiId
     */
    joinTatamiRoom(socket, tatamiId) {
        const roomName = `tatami-${tatamiId}`;
        socket.join(roomName);
        // Log supprimé - événement fréquent
    }

    /**
     * Quitte la room d'un tatami
     * @param {Object} socket
     * @param {number} tatamiId
     */
    leaveTatamiRoom(socket, tatamiId) {
        const roomName = `tatami-${tatamiId}`;
        socket.leave(roomName);
        // Log supprimé - événement fréquent
    }
}

module.exports = new SocketEvents();