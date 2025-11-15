-- =============================================
-- SCHÉMA BASE DE DONNÉES TOURNOI JUDO
-- PostgreSQL
-- =============================================

-- Extension pour UUID (optionnel, si vous voulez utiliser des UUID)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- TABLE: equipes
-- =============================================
CREATE TABLE equipes (
                         id VARCHAR(50) PRIMARY KEY,
                         nom VARCHAR(100) NOT NULL,
                         couleur VARCHAR(20) DEFAULT 'primary',
                         date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                         victoires INTEGER DEFAULT 0,
                         points INTEGER DEFAULT 0,
                         score_global INTEGER DEFAULT 0
);

-- Index pour recherche par nom
CREATE INDEX idx_equipes_nom ON equipes(nom);

-- =============================================
-- TABLE: combattants
-- =============================================
CREATE TABLE combattants (
                             id SERIAL PRIMARY KEY,
                             nom VARCHAR(100) NOT NULL,
                             sexe CHAR(1) CHECK (sexe IN ('M', 'F')),
                             poids VARCHAR(10) NOT NULL,
                             equipe_id VARCHAR(50) REFERENCES equipes(id) ON DELETE CASCADE,
                             date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour recherche par équipe
CREATE INDEX idx_combattants_equipe ON combattants(equipe_id);
-- Index pour recherche par catégorie
CREATE INDEX idx_combattants_categorie ON combattants(sexe, poids);

-- =============================================
-- TABLE: tatamis
-- =============================================
CREATE TABLE tatamis (
                         id SERIAL PRIMARY KEY,
                         nom VARCHAR(50) NOT NULL,
                         etat VARCHAR(20) DEFAULT 'libre' CHECK (etat IN ('libre', 'occupé', 'pause')),
                         index_combat_actuel INTEGER DEFAULT 0,
                         date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                         score_rouge INTEGER DEFAULT 0,
                         score_bleu INTEGER DEFAULT 0
);

-- =============================================
-- TABLE: combats
-- =============================================
CREATE TABLE combats (
                         id BIGINT PRIMARY KEY,
                         tatami_id INTEGER REFERENCES tatamis(id) ON DELETE SET NULL,

    -- Combattants
                         rouge_id INTEGER REFERENCES combattants(id),
                         rouge_nom VARCHAR(100),
                         rouge_equipe_id VARCHAR(50),
                         rouge_equipe_nom VARCHAR(100),

                         bleu_id INTEGER REFERENCES combattants(id),
                         bleu_nom VARCHAR(100),
                         bleu_equipe_id VARCHAR(50),
                         bleu_equipe_nom VARCHAR(100),

    -- Scores
                         rouge_ippon INTEGER DEFAULT 0,
                         rouge_wazari INTEGER DEFAULT 0,
                         rouge_yuko INTEGER DEFAULT 0,
                         rouge_shido INTEGER DEFAULT 0,
                         rouge_points INTEGER DEFAULT 0,

                         bleu_ippon INTEGER DEFAULT 0,
                         bleu_wazari INTEGER DEFAULT 0,
                         bleu_yuko INTEGER DEFAULT 0,
                         bleu_shido INTEGER DEFAULT 0,
                         bleu_points INTEGER DEFAULT 0,

    -- État du combat
                         etat VARCHAR(20) DEFAULT 'prévu' CHECK (etat IN ('prévu', 'en cours', 'terminé', 'annulé')),
                         vainqueur VARCHAR(10) CHECK (vainqueur IN ('rouge', 'bleu', 'nul', NULL)),
                         duree_combat INTEGER,
                         temps_ecoule INTEGER DEFAULT 0,

    -- Métadonnées
                         date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                         date_debut TIMESTAMP,
                         date_fin TIMESTAMP,

    -- Osaekomi
                         osaekomi_actif BOOLEAN DEFAULT FALSE,
                         osaekomi_cote VARCHAR(10),
                         osaekomi_debut TIMESTAMP,

    -- Catégorie
                         categorie VARCHAR(20)
);

-- Index pour recherches fréquentes
CREATE INDEX idx_combats_tatami ON combats(tatami_id);
CREATE INDEX idx_combats_etat ON combats(etat);
CREATE INDEX idx_combats_equipes ON combats(rouge_equipe_id, bleu_equipe_id);
CREATE INDEX idx_combats_combattants ON combats(rouge_id, bleu_id);

-- =============================================
-- TABLE: tatamis_combats (relation many-to-many)
-- Ordre des combats assignés à un tatami
-- =============================================
CREATE TABLE tatamis_combats (
                                 id SERIAL PRIMARY KEY,
                                 tatami_id INTEGER REFERENCES tatamis(id) ON DELETE CASCADE,
                                 combat_id BIGINT REFERENCES combats(id) ON DELETE CASCADE,
                                 ordre INTEGER NOT NULL,
                                 UNIQUE(tatami_id, combat_id)
);

CREATE INDEX idx_tatamis_combats_tatami ON tatamis_combats(tatami_id, ordre);

-- =============================================
-- TABLE: poules
-- =============================================
CREATE TABLE poules (
                        id SERIAL PRIMARY KEY,
                        nom VARCHAR(50) NOT NULL,
                        date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        derniere_mise_a_jour TIMESTAMP
);

-- =============================================
-- TABLE: poules_equipes (relation many-to-many)
-- =============================================
CREATE TABLE poules_equipes (
                                id SERIAL PRIMARY KEY,
                                poule_id INTEGER REFERENCES poules(id) ON DELETE CASCADE,
                                equipe_id VARCHAR(50) REFERENCES equipes(id) ON DELETE CASCADE,
                                UNIQUE(poule_id, equipe_id)
);

-- =============================================
-- TABLE: rencontres
-- Confrontations entre deux équipes dans une poule
-- =============================================
CREATE TABLE rencontres (
                            id BIGINT PRIMARY KEY,
                            poule_id INTEGER REFERENCES poules(id) ON DELETE CASCADE,
                            equipe_a_id VARCHAR(50) REFERENCES equipes(id),
                            equipe_b_id VARCHAR(50) REFERENCES equipes(id),
                            etat VARCHAR(20) DEFAULT 'prevue' CHECK (etat IN ('prevue', 'assignee', 'en_cours', 'terminee')),
                            resultat VARCHAR(20),
                            date_creation TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_rencontres_poule ON rencontres(poule_id);

-- =============================================
-- TABLE: rencontres_combats (relation many-to-many)
-- Combats faisant partie d'une rencontre
-- =============================================
CREATE TABLE rencontres_combats (
                                    id SERIAL PRIMARY KEY,
                                    rencontre_id BIGINT REFERENCES rencontres(id) ON DELETE CASCADE,
                                    combat_id BIGINT REFERENCES combats(id) ON DELETE CASCADE,
                                    UNIQUE(rencontre_id, combat_id)
);

-- =============================================
-- TABLE: classements_poules
-- Classement des équipes dans chaque poule
-- =============================================
CREATE TABLE classements_poules (
                                    id SERIAL PRIMARY KEY,
                                    poule_id INTEGER REFERENCES poules(id) ON DELETE CASCADE,
                                    equipe_id VARCHAR(50) REFERENCES equipes(id) ON DELETE CASCADE,
                                    points INTEGER DEFAULT 0,
                                    victoires INTEGER DEFAULT 0,
                                    defaites INTEGER DEFAULT 0,
                                    egalites INTEGER DEFAULT 0,
                                    confrontations_jouees INTEGER DEFAULT 0,
                                    points_marques INTEGER DEFAULT 0,
                                    points_encaisses INTEGER DEFAULT 0,
                                    differentiel INTEGER DEFAULT 0,
                                    UNIQUE(poule_id, equipe_id)
);

CREATE INDEX idx_classements_poule ON classements_poules(poule_id, points DESC);

-- =============================================
-- TABLE: historique_tatamis
-- Historique des actions sur les tatamis
-- =============================================
CREATE TABLE historique_tatamis (
                                    id SERIAL PRIMARY KEY,
                                    tatami_id INTEGER REFERENCES tatamis(id) ON DELETE CASCADE,
                                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                    action VARCHAR(50) NOT NULL,
                                    donnees JSONB,
                                    ancien_index INTEGER,
                                    nouveau_index INTEGER
);

CREATE INDEX idx_historique_tatami ON historique_tatamis(tatami_id, timestamp DESC);

-- =============================================
-- TABLE: logs
-- Logs système
-- =============================================
CREATE TABLE logs (
                      id SERIAL PRIMARY KEY,
                      message TEXT NOT NULL,
                      donnees JSONB,
                      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_logs_timestamp ON logs(timestamp DESC);

-- =============================================
-- TABLE: config
-- Configuration système (clé-valeur)
-- =============================================
CREATE TABLE config (
                        cle VARCHAR(100) PRIMARY KEY,
                        valeur JSONB NOT NULL,
                        description TEXT,
                        derniere_modification TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- TABLE: tableau_eliminatoire
-- Phases éliminatoires
-- =============================================
CREATE TABLE tableau_eliminatoire (
                                      id SERIAL PRIMARY KEY,
                                      phase VARCHAR(20) NOT NULL CHECK (phase IN ('seizieme', 'huitieme', 'quart', 'demi', 'finale', 'petite_finale')),
                                      position INTEGER NOT NULL,
                                      equipe_a_id VARCHAR(50) REFERENCES equipes(id),
                                      equipe_b_id VARCHAR(50) REFERENCES equipes(id),
                                      vainqueur_id VARCHAR(50) REFERENCES equipes(id),
                                      combat_id BIGINT REFERENCES combats(id),
                                      UNIQUE(phase, position)
);

-- =============================================
-- VUES UTILES
-- =============================================

-- Vue: Combats avec détails complets
CREATE VIEW v_combats_details AS
SELECT
    c.*,
    er.nom as rouge_equipe_nom_full,
    er.couleur as rouge_equipe_couleur,
    eb.nom as bleu_equipe_nom_full,
    eb.couleur as bleu_equipe_couleur,
    t.nom as tatami_nom,
    t.etat as tatami_etat
FROM combats c
         LEFT JOIN equipes er ON c.rouge_equipe_id = er.id
         LEFT JOIN equipes eb ON c.bleu_equipe_id = eb.id
         LEFT JOIN tatamis t ON c.tatami_id = t.id;

-- Vue: Statistiques par équipe
CREATE VIEW v_stats_equipes AS
SELECT
    e.id,
    e.nom,
    COUNT(DISTINCT cbt.id) as nb_combattants,
    COUNT(DISTINCT CASE WHEN c.etat = 'terminé' THEN c.id END) as nb_combats_termines,
    COUNT(DISTINCT CASE WHEN c.vainqueur = 'rouge' AND c.rouge_equipe_id = e.id THEN c.id
                        WHEN c.vainqueur = 'bleu' AND c.bleu_equipe_id = e.id THEN c.id END) as victoires,
    COUNT(DISTINCT CASE WHEN c.vainqueur = 'rouge' AND c.bleu_equipe_id = e.id THEN c.id
                        WHEN c.vainqueur = 'bleu' AND c.rouge_equipe_id = e.id THEN c.id END) as defaites,
    SUM(CASE WHEN c.rouge_equipe_id = e.id THEN c.rouge_points
             WHEN c.bleu_equipe_id = e.id THEN c.bleu_points
             ELSE 0 END) as total_points
FROM equipes e
         LEFT JOIN combattants cbt ON cbt.equipe_id = e.id
         LEFT JOIN combats c ON (c.rouge_equipe_id = e.id OR c.bleu_equipe_id = e.id)
GROUP BY e.id, e.nom;

-- Vue: Combats en cours par tatami
CREATE VIEW v_combats_en_cours AS
SELECT
    t.id as tatami_id,
    t.nom as tatami_nom,
    c.*
FROM tatamis t
         JOIN tatamis_combats tc ON tc.tatami_id = t.id AND tc.ordre = t.index_combat_actuel
         JOIN combats c ON c.id = tc.combat_id
WHERE t.etat = 'occupé';

-- =============================================
-- FONCTIONS UTILES
-- =============================================

-- Fonction: Mettre à jour le classement d'une poule
CREATE OR REPLACE FUNCTION update_classement_poule(p_poule_id INTEGER)
RETURNS void AS $$
BEGIN
    -- Recalculer les statistiques pour chaque équipe de la poule
UPDATE classements_poules cp
SET
    victoires = (
        SELECT COUNT(*)
        FROM rencontres r
                 JOIN rencontres_combats rc ON rc.rencontre_id = r.id
                 JOIN combats c ON c.id = rc.combat_id
        WHERE r.poule_id = p_poule_id
          AND (
            (c.rouge_equipe_id = cp.equipe_id AND c.vainqueur = 'rouge')
                OR (c.bleu_equipe_id = cp.equipe_id AND c.vainqueur = 'bleu')
            )
    ),
    defaites = (
        SELECT COUNT(*)
        FROM rencontres r
                 JOIN rencontres_combats rc ON rc.rencontre_id = r.id
                 JOIN combats c ON c.id = rc.combat_id
        WHERE r.poule_id = p_poule_id
          AND (
            (c.rouge_equipe_id = cp.equipe_id AND c.vainqueur = 'bleu')
                OR (c.bleu_equipe_id = cp.equipe_id AND c.vainqueur = 'rouge')
            )
    ),
    derniere_mise_a_jour = CURRENT_TIMESTAMP
WHERE cp.poule_id = p_poule_id;
END;
$$ LANGUAGE plpgsql;

-- Fonction: Nettoyer les anciens logs
CREATE OR REPLACE FUNCTION clean_old_logs(days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
deleted_count INTEGER;
BEGIN
DELETE FROM logs
WHERE timestamp < CURRENT_TIMESTAMP - (days || ' days')::INTERVAL;

GET DIAGNOSTICS deleted_count = ROW_COUNT;
RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- TRIGGERS
-- =============================================

-- Trigger: Mettre à jour derniere_mise_a_jour sur les poules
CREATE OR REPLACE FUNCTION update_poule_timestamp()
RETURNS TRIGGER AS $$
BEGIN
UPDATE poules
SET derniere_mise_a_jour = CURRENT_TIMESTAMP
WHERE id = NEW.poule_id;
RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_classement_poule
    AFTER INSERT OR UPDATE ON classements_poules
                        FOR EACH ROW
                        EXECUTE FUNCTION update_poule_timestamp();

-- =============================================
-- DONNÉES INITIALES (Configuration par défaut)
-- =============================================
INSERT INTO config (cle, valeur, description) VALUES
                                                  ('combat.dureeParDefaut', '300', 'Durée par défaut d''un combat en secondes'),
                                                  ('combat.enableGoldenScore', 'false', 'Activer le golden score'),
                                                  ('combat.points.ippon', '100', 'Points pour un ippon'),
                                                  ('combat.points.wazari', '10', 'Points pour un wazari'),
                                                  ('combat.points.yuko', '1', 'Points pour un yuko')
    ON CONFLICT (cle) DO NOTHING;

-- =============================================
-- COMMENTAIRES
-- =============================================
COMMENT ON TABLE equipes IS 'Table des équipes participantes au tournoi';
COMMENT ON TABLE combattants IS 'Table des combattants (judokas) appartenant aux équipes';
COMMENT ON TABLE tatamis IS 'Table des tatamis (surfaces de combat)';
COMMENT ON TABLE combats IS 'Table des combats individuels';
COMMENT ON TABLE poules IS 'Table des poules de qualification';
COMMENT ON TABLE rencontres IS 'Table des rencontres entre équipes (contenant plusieurs combats)';
COMMENT ON TABLE classements_poules IS 'Classement des équipes dans chaque poule';
COMMENT ON TABLE logs IS 'Historique des événements système';
COMMENT ON TABLE config IS 'Configuration du système';