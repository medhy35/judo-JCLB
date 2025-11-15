// server.js - Version refactorisée
const dotenv = require("dotenv");
const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

dotenv.config();
// Import des modules
const apiRoutes = require('./src/routes/api');
const socketEvents = require('./src/utils/socketEvents');
const dataService = require('./src/services/databaseAdapter');
const configService = require('./src/services/configService');
const rateLimitMiddleware = require('./src/middleware/rateLimit');
const backupService = require('./src/services/backupService');

class JudoServer {
    constructor() {

        this.app = express();
        this.server = http.createServer(this.app);
        this.io = new Server(this.server);
        this.PORT = configService.get('app.port', process.env.PORT || 3000);

        this.init();
    }

    /**
     * Initialise le serveur
     */
    async init() {
        // CRITIQUE : Initialiser le databaseAdapter en premier
        console.log('🔄 Initialisation du databaseAdapter...');
        await dataService.init();

        // Vérifier que l'initialisation a réussi
        if (!dataService.isInitialized) {
            console.error('❌ DatabaseAdapter non initialisé !');
            throw new Error('Échec initialisation databaseAdapter');
        }

        console.log(`✅ DatabaseAdapter initialisé (Mode: ${dataService.usePostgres ? 'PostgreSQL' : 'JSON'})`);

        this.setupMiddlewares();
        this.setupRoutes();
        this.setupWebSockets();
        this.setupErrorHandling();
        this.logServerInfo();
    }

    /**
     * Configuration des middlewares
     */
    setupMiddlewares() {
        // Parsing JSON
        const maxSize = configService.get('app.maxUploadSize', '10mb');
        this.app.use(express.json({ limit: maxSize }));
        this.app.use(express.urlencoded({ extended: true }));

        // Fichiers statiques
        this.app.use(express.static(path.join(__dirname, 'public')));

        // CORS pour développement

        if (configService.isEnabled('CORS') || configService.get('security.enableCORS', true)) {
            const allowedOrigins = configService.get('security.allowedOrigins', ['*']);
            this.app.use((req, res, next) => {
                const origin = allowedOrigins.includes('*') ? '*' : allowedOrigins[0];
                res.header('Access-Control-Allow-Origin', origin);
                res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH,OPTIONS');
                res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

                if (req.method === 'OPTIONS') {
                    res.sendStatus(200);
                } else {
                    next();
                }
            });
        }

        // Logging des requêtes en développement
        if (process.env.NODE_ENV !== 'production') {
            this.app.use((req, res, next) => {
                console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
                next();
            });
        }
        this.app.use(rateLimitMiddleware.middleware());
    }

    /**
     * Configuration des routes
     */
    setupRoutes() {
        // Routes API
        this.app.use('/api', apiRoutes);



        // Route de santé
        this.app.get('/health', (req, res) => {
            const stats = this.getServerStats();
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                ...stats
            });
        });

        // Route par défaut - Redirection vers l'accueil
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });

        // 404 pour les routes non trouvées
        this.app.use('*', (req, res) => {
            if (req.path.startsWith('/api/')) {
                res.status(404).json({ error: 'Route API non trouvée' });
            } else {
                res.status(404).sendFile(path.join(__dirname, 'public', '404.html'), (err) => {
                    if (err) {
                        res.status(404).json({ error: 'Page non trouvée' });
                    }
                });
            }
        });
    }

    /**
     * Configuration des WebSockets
     */
    setupWebSockets() {
        if (!configService.isEnabled('websockets')) {
            console.log('⚠️  WebSockets désactivés dans la configuration');
            return;
        }
        // ⚠️ AJOUTER : Configuration optimisée pour production
        this.io = new Server(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            },
            pingTimeout: 60000,
            pingInterval: 25000,
            // ⚠️ Compression des messages
            perMessageDeflate: {
                threshold: 1024
            },
            // ⚠️ Limite de reconnexion
            maxHttpBufferSize: 1e6,
            transports: ['websocket', 'polling']
        });

        // Initialiser le gestionnaire d'événements Socket.io
        socketEvents.init(this.io);

        // Heartbeat selon la config
        const heartbeatInterval = configService.get('websockets.heartbeatInterval', 30000);


        // Événements personnalisés supplémentaires
        this.io.on('connection', (socket) => {
            // Envoi de l'état initial au client
            socket.emit('server:info', {
                version: this.getVersion(),
                timestamp: new Date().toISOString(),
                clientId: socket.id
            });

            // Gestion des demandes d'état complet
            socket.on('request:full-state', () => {
                socketEvents.sendFullStateToClient(socket);
            });

            // Gestion des subscriptions aux tatamis
            socket.on('subscribe:tatami', (tatamiId) => {
                socketEvents.joinTatamiRoom(socket, tatamiId);
                socket.emit('subscribed:tatami', { tatamiId });
            });

            socket.on('unsubscribe:tatami', (tatamiId) => {
                socketEvents.leaveTatamiRoom(socket, tatamiId);
                socket.emit('unsubscribed:tatami', { tatamiId });
            });

            // Heartbeat pour maintenir la connexion
            socket.on('ping', () => {
                socket.emit('pong', { timestamp: new Date().toISOString() });
            });
        });

        // Diffusion périodique des statistiques (toutes les 30 secondes)
        setInterval(() => {
            if (socketEvents.getConnectedClientsCount() > 0) {
                socketEvents.broadcastStats();
            }
        }, heartbeatInterval);
    }

    /**
     * Obtient la version de l'application
     */
    getVersion() {
        try {
            const packageJson = require('./package.json');
            return packageJson.version || '1.0.0';
        } catch {
            return '1.0.0';
        }
    }

    /**
     * Affiche les informations du serveur
     */
    logServerInfo() {
        const stats = this.getServerStats();
        dataService.addLog('Serveur démarré', {
            port: this.PORT,
            version: this.getVersion(),
            stats: stats.data,
            nodeVersion: process.version,
            environment: configService.get('app.environment', 'development')
        });
    }

    /**
     * Gestion des erreurs
     */
    setupErrorHandling() {
        // Gestionnaire d'erreurs Express
        this.app.use((err, req, res, next) => {
            console.error('Erreur serveur:', err);

            // Log détaillé pour le développement
            if (process.env.NODE_ENV !== 'production') {
                console.error(err.stack);
            }

            dataService.addLog('Erreur serveur', {
                error: err.message,
                path: req.path,
                method: req.method,
                stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined
            });

            res.status(err.status || 500).json({
                error: process.env.NODE_ENV === 'production'
                    ? 'Erreur serveur interne'
                    : err.message
            });
        });

        // Gestion des erreurs non capturées
        process.on('uncaughtException', (err) => {
            console.error('Exception non capturée:', err);
            dataService.addLog('Exception non capturée', { error: err.message, stack: err.stack });

            // Redémarrage gracieux en production
            if (process.env.NODE_ENV === 'production') {
                setTimeout(() => process.exit(1), 1000);
            }
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('Promesse rejetée non gérée:', reason);
            dataService.addLog('Promesse rejetée', { reason: String(reason) });
        });

        // Arrêt gracieux
        process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
    }

    /**
     * Obtient les statistiques du serveur
     */
    getServerStats() {
        try {
            const tatamis = dataService.readFile('tatamis');
            const combats = dataService.readFile('combats');
            const equipes = dataService.readFile('equipes');
            const combattants = dataService.readFile('combattants');
            const poules = dataService.readFile('poules');

            return {
                data: {
                    tatamis: tatamis.length,
                    combats: combats.length,
                    combatsTermines: combats.filter(c => c.etat === 'terminé').length,
                    combatsEnCours: combats.filter(c => c.etat === 'en cours').length,
                    equipes: equipes.length,
                    combattants: combattants.length,
                    poules: poules.length
                },
                websockets: {
                    clientsConnectes: socketEvents.getConnectedClientsCount()
                },
                server: {
                    memoire: {
                        utilise: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
                    },
                    uptime: Math.round(process.uptime())
                }
            };
        } catch (error) {
            console.error('Erreur récupération stats:', error);
            return { error: 'Impossible de récupérer les statistiques' };
        }
    }

    /**
     * Arrêt gracieux du serveur
     */
    async gracefulShutdown(signal) {
        console.log(`Signal ${signal} reçu, arrêt du serveur...`);

        dataService.addLog('Arrêt du serveur', { signal });

        // Fermer les nouvelles connexions
        this.server.close(async (err) => {
            if (err) {
                console.error('Erreur lors de la fermeture:', err);
                process.exit(1);
            }

            try {
                // Attendre que les connexions WebSocket se ferment
                await new Promise((resolve) => {
                    this.io.close(() => {
                        console.log('Connexions WebSocket fermées');
                        resolve();
                    });
                });

                console.log('Serveur arrêté proprement');
                process.exit(0);
            } catch (error) {
                console.error('Erreur lors de l\'arrêt:', error);
                process.exit(1);
            }
        });

        // Forcer l'arrêt après 10 secondes
        setTimeout(() => {
            console.error('Forcer l\'arrêt du serveur');
            process.exit(1);
        }, 10000);
    }

    /**
     * Démarre le serveur
     */
    async start() {

        this.server.listen(this.PORT, () => {
            const appName = configService.get('app.name', 'Serveur Judo');
            const version = configService.get('app.version', '1.0.0');
            const environment = configService.get('app.environment', 'development');

            console.log(`🥋 ${appName} v${version}`);
            console.log(`🌐 http://localhost:${this.PORT}`);
            console.log(`📊 Dashboard: http://localhost:${this.PORT}/dashboard.html`);
            console.log(`💻 Environnement: ${environment}`);

            if (configService.isEnabled('websockets')) {
                console.log(`🔌 WebSockets activés`);
            }

            // Validation de la config au démarrage
            const validation = configService.validate();
            if (!validation.valid) {
                console.warn('⚠️  Problèmes de configuration détectés:');
                validation.errors.forEach(err => console.warn(`   - ${err}`));
            }

            // Afficher les statistiques initiales
            const stats = this.getServerStats();
            if (stats.data) {
                console.log(`📈 Données: ${stats.data.equipes} équipes, ${stats.data.combattants} combattants, ${stats.data.combats} combats`);
            }
        });

        // Gestion des erreurs d'écoute
        this.server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`Port ${this.PORT} déjà utilisé. Essayez un autre port.`);
                process.exit(1);
            } else {
                console.error('Erreur serveur:', err);
                dataService.addLog('Erreur serveur', {error: err.message});
            }
        });

        return this.server;
    }
}

// Créer et démarrer le serveur
const judoServer = new JudoServer();
judoServer.start();

// Export pour les tests
module.exports = JudoServer;