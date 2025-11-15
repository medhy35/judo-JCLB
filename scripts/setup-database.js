#!/usr/bin/env node

/**
 * Script de setup automatique pour PostgreSQL
 * Usage: node scripts/setup-database.js
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

function execCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject({ error, stderr });
            } else {
                resolve(stdout);
            }
        });
    });
}

async function main() {
    console.log('╔═══════════════════════════════════════════════════╗');
    console.log('║   🥋 SETUP BASE DE DONNÉES POSTGRESQL - JUDO     ║');
    console.log('╚═══════════════════════════════════════════════════╝\n');

    try {
        // 1. Vérifier que PostgreSQL est installé
        console.log('🔍 Vérification de PostgreSQL...');
        try {
            await execCommand('psql --version');
            console.log('✅ PostgreSQL est installé\n');
        } catch (error) {
            console.error('❌ PostgreSQL n\'est pas installé !');
            console.log('\n📥 Installer PostgreSQL :');
            console.log('   Windows: https://www.postgresql.org/download/windows/');
            console.log('   macOS:   brew install postgresql@16');
            console.log('   Linux:   sudo apt install postgresql postgresql-contrib\n');
            process.exit(1);
        }

        // 2. Demander les informations de connexion
        console.log('📝 Configuration de la connexion PostgreSQL:\n');

        const dbHost = await question('  Hôte (localhost): ') || 'localhost';
        const dbPort = await question('  Port (5432): ') || '5432';
        const dbName = await question('  Nom de la base (judo_tournament): ') || 'judo_tournament';
        const dbUser = await question('  Utilisateur (postgres): ') || 'postgres';
        const dbPassword = await question('  Mot de passe: ');

        if (!dbPassword) {
            console.error('\n❌ Mot de passe requis !');
            process.exit(1);
        }

        // 3. Créer le fichier .env
        console.log('\n📄 Création du fichier .env...');
        const envContent = `# Configuration Base de Données
DB_HOST=${dbHost}
DB_PORT=${dbPort}
DB_NAME=${dbName}
DB_USER=${dbUser}
DB_PASSWORD=${dbPassword}

# Configuration Serveur
PORT=3000
NODE_ENV=development

# Options
USE_POSTGRES=false
KEEP_JSON_BACKUPS=true
`;

        fs.writeFileSync('.env', envContent);
        console.log('✅ Fichier .env créé\n');

        // 4. Créer la base de données
        console.log('🗄️  Création de la base de données...');
        const createDbCommand = `PGPASSWORD=${dbPassword} psql -h ${dbHost} -p ${dbPort} -U ${dbUser} -c "CREATE DATABASE ${dbName};"`;

        try {
            await execCommand(createDbCommand);
            console.log(`✅ Base de données "${dbName}" créée\n`);
        } catch (error) {
            if (error.stderr.includes('already exists')) {
                console.log(`ℹ️  Base de données "${dbName}" existe déjà\n`);
            } else {
                console.error('❌ Erreur création base:', error.stderr);
                throw error;
            }
        }

        // 5. Exécuter le schéma SQL
        console.log('📋 Création des tables...');
        const schemaPath = path.join(__dirname, '../database/schema.sql');

        if (!fs.existsSync(schemaPath)) {
            console.error(`❌ Fichier schema.sql introuvable: ${schemaPath}`);
            process.exit(1);
        }

        const schemaCommand = `PGPASSWORD=${dbPassword} psql -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} -f "${schemaPath}"`;

        try {
            const output = await execCommand(schemaCommand);
            console.log('✅ Tables créées avec succès\n');
        } catch (error) {
            console.error('❌ Erreur création tables:', error.stderr);
            throw error;
        }

        // 6. Vérifier les tables
        console.log('🔍 Vérification des tables...');
        const listTablesCommand = `PGPASSWORD=${dbPassword} psql -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} -c "\\dt"`;

        try {
            const tables = await execCommand(listTablesCommand);
            console.log(tables);
            console.log('✅ Base de données configurée\n');
        } catch (error) {
            console.error('⚠️  Impossible de lister les tables');
        }

        // 7. Proposer la migration
        console.log('╔═══════════════════════════════════════════════════╗');
        console.log('║              ✨ SETUP TERMINÉ !                   ║');
        console.log('╚═══════════════════════════════════════════════════╝\n');

        console.log('Prochaines étapes:\n');
        console.log('1️⃣  Installer les dépendances Node.js:');
        console.log('    npm install\n');
        console.log('2️⃣  Migrer vos données JSON vers PostgreSQL:');
        console.log('    node scripts/migrate-to-postgres.js\n');
        console.log('3️⃣  Activer PostgreSQL dans .env:');
        console.log('    USE_POSTGRES=true\n');
        console.log('4️⃣  Démarrer le serveur:');
        console.log('    npm start\n');

        const migrate = await question('🚀 Lancer la migration maintenant ? (o/N): ');

        if (migrate.toLowerCase() === 'o' || migrate.toLowerCase() === 'oui') {
            console.log('\n🔄 Lancement de la migration...\n');
            await execCommand('node scripts/migrate-to-postgres.js');
        } else {
            console.log('\n💡 Vous pourrez migrer plus tard avec:');
            console.log('   node scripts/migrate-to-postgres.js\n');
        }

    } catch (error) {
        console.error('\n❌ ERREUR:', error.message || error);
        process.exit(1);
    } finally {
        rl.close();
    }
}

// Lancer le script
if (require.main === module) {
    main().then(() => {
        console.log('👋 À bientôt !\n');
        process.exit(0);
    }).catch(error => {
        console.error('💥 Erreur fatale:', error);
        process.exit(1);
    });
}

module.exports = { main };