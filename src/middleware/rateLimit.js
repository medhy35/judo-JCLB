const configService = require('../services/configService');

class RateLimitMiddleware {
    constructor() {
        this.requests = new Map();
        this.enabled = configService.isEnabled('rate-limit');
        this.windowMs = configService.get('security.rateLimit.windowMs', 900000);
        this.max = configService.get('security.rateLimit.max', 100);

        // Nettoyer les anciennes entrées toutes les minutes
        setInterval(() => this.cleanup(), 60000);
    }

    middleware() {
        return (req, res, next) => {
            if (!this.enabled) {
                return next();
            }

            const ip = req.ip || req.connection.remoteAddress;
            const now = Date.now();
            const userRequests = this.requests.get(ip) || [];

            // Filtrer les requêtes dans la fenêtre de temps
            const validRequests = userRequests.filter(
                timestamp => now - timestamp < this.windowMs
            );

            if (validRequests.length >= this.max) {
                return res.status(429).json({
                    error: 'Trop de requêtes',
                    retryAfter: Math.ceil((validRequests[0] + this.windowMs - now) / 1000)
                });
            }

            validRequests.push(now);
            this.requests.set(ip, validRequests);
            next();
        };
    }

    cleanup() {
        const now = Date.now();
        for (const [ip, timestamps] of this.requests.entries()) {
            const validRequests = timestamps.filter(
                timestamp => now - timestamp < this.windowMs
            );

            if (validRequests.length === 0) {
                this.requests.delete(ip);
            } else {
                this.requests.set(ip, validRequests);
            }
        }
    }
}

module.exports = new RateLimitMiddleware();