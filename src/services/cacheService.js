// src/services/cacheService.js

/**
 * Service de cache mémoire pour optimiser les lectures fréquentes
 * Utilise un cache LRU (Least Recently Used) avec TTL configurable
 */
class CacheService {
    constructor() {
        // Cache pour les données statiques (longue durée)
        this.staticCache = new Map();
        // Cache pour les données dynamiques (courte durée)
        this.dynamicCache = new Map();

        // Configuration des TTL (Time To Live) en millisecondes
        this.TTL = {
            static: 5 * 60 * 1000,    // 5 minutes pour données statiques
            dynamic: 30 * 1000,        // 30 secondes pour données dynamiques
            combat: 1000               // 1 seconde pour combats (existant)
        };

        // Limites de taille des caches
        this.maxSize = {
            static: 100,
            dynamic: 50
        };

        // Clés considérées comme statiques (changent rarement)
        this.staticKeys = ['equipes', 'combattants', 'config', 'poules'];
        // Clés dynamiques (changent fréquemment)
        this.dynamicKeys = ['combats', 'tatamis', 'tableau'];
    }

    /**
     * Récupère une valeur du cache
     * @param {string} key Clé du cache
     * @returns {any|null} Valeur cachée ou null si expirée/inexistante
     */
    get(key) {
        const cache = this._getCache(key);
        const entry = cache.get(key);

        if (!entry) {
            return null;
        }

        // Vérifier l'expiration
        if (Date.now() > entry.expiresAt) {
            cache.delete(key);
            return null;
        }

        // Mettre à jour le timestamp d'accès (LRU)
        entry.lastAccess = Date.now();

        return entry.value;
    }

    /**
     * Stocke une valeur dans le cache
     * @param {string} key Clé du cache
     * @param {any} value Valeur à cacher
     * @param {number|null} customTTL TTL personnalisé (optionnel)
     */
    set(key, value, customTTL = null) {
        const cache = this._getCache(key);
        const ttl = customTTL || this._getTTL(key);

        const entry = {
            value,
            expiresAt: Date.now() + ttl,
            lastAccess: Date.now(),
            createdAt: Date.now()
        };

        cache.set(key, entry);

        // Nettoyage si le cache dépasse la limite
        this._enforceMaxSize(cache, key);
    }

    /**
     * Invalide une clé spécifique du cache
     * @param {string} key Clé à invalider
     */
    invalidate(key) {
        this.staticCache.delete(key);
        this.dynamicCache.delete(key);
    }

    /**
     * Invalide toutes les clés d'un type
     * @param {string} type 'static' ou 'dynamic'
     */
    invalidateType(type) {
        if (type === 'static') {
            this.staticCache.clear();
        } else if (type === 'dynamic') {
            this.dynamicCache.clear();
        }
    }

    /**
     * Vide complètement le cache
     */
    clear() {
        this.staticCache.clear();
        this.dynamicCache.clear();
    }

    /**
     * Obtient les statistiques du cache
     * @returns {Object} Statistiques
     */
    getStats() {
        return {
            static: {
                size: this.staticCache.size,
                maxSize: this.maxSize.static,
                keys: Array.from(this.staticCache.keys())
            },
            dynamic: {
                size: this.dynamicCache.size,
                maxSize: this.maxSize.dynamic,
                keys: Array.from(this.dynamicCache.keys())
            },
            totalMemoryUsage: this._estimateMemoryUsage()
        };
    }

    /**
     * Nettoie les entrées expirées
     */
    cleanup() {
        const now = Date.now();

        // Nettoyer le cache statique
        for (const [key, entry] of this.staticCache.entries()) {
            if (now > entry.expiresAt) {
                this.staticCache.delete(key);
            }
        }

        // Nettoyer le cache dynamique
        for (const [key, entry] of this.dynamicCache.entries()) {
            if (now > entry.expiresAt) {
                this.dynamicCache.delete(key);
            }
        }
    }

    // === MÉTHODES PRIVÉES ===

    /**
     * Détermine quel cache utiliser pour une clé
     * @private
     */
    _getCache(key) {
        return this.staticKeys.includes(key) ? this.staticCache : this.dynamicCache;
    }

    /**
     * Détermine le TTL approprié pour une clé
     * @private
     */
    _getTTL(key) {
        if (this.staticKeys.includes(key)) {
            return this.TTL.static;
        } else if (key === 'combats') {
            return this.TTL.combat;
        } else {
            return this.TTL.dynamic;
        }
    }

    /**
     * Applique la limite de taille du cache (stratégie LRU)
     * @private
     */
    _enforceMaxSize(cache, excludeKey) {
        const maxSize = cache === this.staticCache ? this.maxSize.static : this.maxSize.dynamic;

        if (cache.size <= maxSize) {
            return;
        }

        // Trouver l'entrée la moins récemment utilisée
        let oldestKey = null;
        let oldestAccess = Infinity;

        for (const [key, entry] of cache.entries()) {
            if (key !== excludeKey && entry.lastAccess < oldestAccess) {
                oldestAccess = entry.lastAccess;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            cache.delete(oldestKey);
        }
    }

    /**
     * Estime l'utilisation mémoire du cache (approximatif)
     * @private
     */
    _estimateMemoryUsage() {
        let totalSize = 0;

        const estimateEntrySize = (entry) => {
            try {
                return JSON.stringify(entry.value).length;
            } catch {
                return 0;
            }
        };

        for (const entry of this.staticCache.values()) {
            totalSize += estimateEntrySize(entry);
        }

        for (const entry of this.dynamicCache.values()) {
            totalSize += estimateEntrySize(entry);
        }

        return {
            bytes: totalSize,
            kilobytes: (totalSize / 1024).toFixed(2),
            megabytes: (totalSize / (1024 * 1024)).toFixed(2)
        };
    }
}

module.exports = new CacheService();
