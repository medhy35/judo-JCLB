-- Migration: Ajouter l'état 'pause' à la contrainte
BEGIN;

-- Supprimer l'ancienne contrainte
ALTER TABLE combats DROP CONSTRAINT IF EXISTS combats_etat_check;

-- Ajouter la nouvelle contrainte avec 'pause'
ALTER TABLE combats ADD CONSTRAINT combats_etat_check
    CHECK (etat IN ('prévu', 'en cours', 'pause', 'terminé', 'annulé'));

COMMIT;

-- Vérification
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'combats_etat_check';
