-- Migration complète pour ajouter toutes les colonnes manquantes
BEGIN;

ALTER TABLE combats
    ADD COLUMN IF NOT EXISTS raison_fin VARCHAR(50);

-- 3. Vérifier et ajouter d'autres colonnes potentiellement manquantes
ALTER TABLE combats
    ADD COLUMN IF NOT EXISTS duree_combat INTEGER;

COMMIT;

-- Vérification
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'combats'
ORDER BY column_name;