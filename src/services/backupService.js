const fs = require('fs');
const path = require('path');
const configService = require('./configService');
const dataService = require('./dataService');

class BackupService {
    constructor() {
        this.backupDir = path.join(__dirname, '../../backups');
        this.enabled = configService.get('database.backupEnabled', false);
        this.interval = configService.get('database.backupInterval', 3600000);
        this.maxBackups = configService.get('database.maxBackups', 10);
        this.timer = null;

        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
        }

        if (this.enabled) {
            this.start();
        }
    }

    start() {
        console.log('🔄 Système de backup automatique démarré');

        // Backup immédiat au démarrage
        this.createBackup();

        // Puis backups périodiques
        this.timer = setInterval(() => {
            this.createBackup();
        }, this.interval);
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            console.log('🛑 Système de backup automatique arrêté');
        }
    }

    createBackup() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `backup_${timestamp}.json`;
            const filepath = path.join(this.backupDir, filename);

            const data = dataService.exportAll();
            const backupData = {
                ...data,
                config: configService.getAll(),
                timestamp: new Date().toISOString(),
                version: configService.get('app.version', '1.0.0')
            };

            fs.writeFileSync(filepath, JSON.stringify(backupData, null, 2), 'utf-8');

            console.log(`✅ Backup créé: ${filename}`);
            dataService.addLog('Backup créé', { filename });

            // Nettoyer les anciens backups
            this.cleanOldBackups();

            return { success: true, filename };
        } catch (error) {
            console.error('Erreur création backup:', error);
            return { success: false, error: error.message };
        }
    }

    cleanOldBackups() {
        try {
            const files = fs.readdirSync(this.backupDir)
                .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
                .map(f => ({
                    name: f,
                    path: path.join(this.backupDir, f),
                    time: fs.statSync(path.join(this.backupDir, f)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time);

            // Supprimer les backups excédentaires
            if (files.length > this.maxBackups) {
                const toDelete = files.slice(this.maxBackups);
                toDelete.forEach(file => {
                    fs.unlinkSync(file.path);
                    console.log(`🗑️  Ancien backup supprimé: ${file.name}`);
                });
            }
        } catch (error) {
            console.error('Erreur nettoyage backups:', error);
        }
    }

    listBackups() {
        try {
            const files = fs.readdirSync(this.backupDir)
                .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
                .map(f => {
                    const filepath = path.join(this.backupDir, f);
                    const stats = fs.statSync(filepath);
                    return {
                        filename: f,
                        size: stats.size,
                        created: stats.mtime,
                        path: filepath
                    };
                })
                .sort((a, b) => b.created.getTime() - a.created.getTime());

            return files;
        } catch (error) {
            console.error('Erreur liste backups:', error);
            return [];
        }
    }

    restoreBackup(filename) {
        try {
            const filepath = path.join(this.backupDir, filename);

            if (!fs.existsSync(filepath)) {
                return { success: false, error: 'Fichier backup introuvable' };
            }

            const content = fs.readFileSync(filepath, 'utf-8');
            const backupData = JSON.parse(content);

            // Restaurer les données
            dataService.importAll(backupData);

            // Restaurer la config si présente
            if (backupData.config) {
                configService.import({ config: backupData.config });
            }

            dataService.addLog('Backup restauré', { filename });
            console.log(`✅ Backup restauré: ${filename}`);

            return { success: true };
        } catch (error) {
            console.error('Erreur restauration backup:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = new BackupService();