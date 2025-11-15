// scripts/test-combattants.js
const postgresService = require('../src/services/postgresService');
const databaseAdapter = require('../src/services/databaseAdapter');

async function testCombattants() {
    console.log('🔍 Diagnostic des combattants\n');

    try {
        // 1. INITIALISER d'abord le databaseAdapter (CRITIQUE!)
        console.log('1️⃣ Initialisation du databaseAdapter...');
        await databaseAdapter.init();

        if (!databaseAdapter.isInitialized) {
            console.error('❌ DatabaseAdapter non initialisé !');
            return;
        }
        console.log(`✅ DatabaseAdapter initialisé (usePostgres: ${databaseAdapter.usePostgres})\n`);

        // 2. Test direct PostgreSQL
        console.log('2️⃣ Test direct PostgreSQL...');
        const result = await postgresService.query('SELECT * FROM combattants LIMIT 5');
        console.log(`   Nombre de combattants: ${result.rows.length}`);
        if (result.rows.length > 0) {
            console.log('   Premier combattant:', JSON.stringify(result.rows[0], null, 2));
        }
        console.log('');

        // 3. Test postgresService.getAllCombattants()
        console.log('3️⃣ Test postgresService.getAllCombattants()...');
        const combattantsPG = await postgresService.getAllCombattants();
        console.log(`   Nombre retourné: ${combattantsPG.length}`);
        if (combattantsPG.length > 0) {
            console.log('   Premier combattant:', JSON.stringify(combattantsPG[0], null, 2));
        }
        console.log('');

        // 4. Test databaseAdapter.getAllCombattants() (MAINTENANT ÇA DEVRAIT MARCHER!)
        console.log('4️⃣ Test databaseAdapter.getAllCombattants()...');
        const combattantsAdapter = await databaseAdapter.getAllCombattants();
        console.log(`   Nombre retourné: ${combattantsAdapter.length}`);
        if (combattantsAdapter.length > 0) {
            console.log('   Premier combattant:', JSON.stringify(combattantsAdapter[0], null, 2));
        }
        console.log('');

        // 5. Vérifier USE_POSTGRES
        console.log('5️⃣ Configuration...');
        console.log(`   USE_POSTGRES: ${process.env.USE_POSTGRES}`);
        console.log(`   databaseAdapter.usePostgres: ${databaseAdapter.usePostgres}`);
        console.log(`   databaseAdapter.isInitialized: ${databaseAdapter.isInitialized}`);
        console.log(`   databaseAdapter.service: ${databaseAdapter.service ? 'OK' : 'NULL ❌'}`);
        console.log('');

        // 6. Compter dans la base
        console.log('6️⃣ Comptage dans la base...');
        const countResult = await postgresService.query('SELECT COUNT(*) as total FROM combattants');
        console.log(`   Total combattants en base: ${countResult.rows[0].total}`);
        console.log('');

        // 7. Vérifier les équipes liées
        console.log('7️⃣ Vérifier les jointures avec équipes...');
        const withEquipe = await postgresService.query(`
            SELECT c.id, c.nom, c.equipe_id, e.nom as equipe_nom
            FROM combattants c
                     LEFT JOIN equipes e ON c.equipe_id = e.id
                LIMIT 3
        `);
        console.log(`   Combattants avec équipes: ${withEquipe.rows.length}`);
        withEquipe.rows.forEach(row => {
            console.log(`   - ${row.nom} (${row.equipe_nom || 'AUCUNE ÉQUIPE'})`);
        });
        console.log('');

        // 8. Test de la structure retournée
        console.log('8️⃣ Structure des données...');
        if (combattantsAdapter.length > 0) {
            const firstCombattant = combattantsAdapter[0];
            console.log('   Clés disponibles:', Object.keys(firstCombattant));
            console.log('   equipeId:', firstCombattant.equipeId || firstCombattant.equipe_id);
            console.log('   equipe_nom:', firstCombattant.equipe_nom);
        }

        console.log('\n✅ TOUS LES TESTS SONT PASSÉS !');
        console.log('👉 Si le serveur ne fonctionne toujours pas, vérifiez les logs au démarrage.');

    } catch (error) {
        console.error('\n❌ ERREUR:', error.message);
        console.error(error.stack);
    } finally {
        await postgresService.close();
    }
}

// Lancer le test
testCombattants().then(() => {
    console.log('\n✨ Test terminé');
    process.exit(0);
}).catch(error => {
    console.error('❌ Erreur fatale:', error);
    process.exit(1);
});
