-- +goose Up
-- Existing assets remain active; legacy archive and sold data are not lifecycle history.
ALTER TABLE entities ADD COLUMN offboarded boolean NOT NULL DEFAULT false;
CREATE INDEX entity_offboarded ON entities (offboarded);
CREATE TABLE entity_offboardings (
    id uuid NOT NULL PRIMARY KEY,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    outcome varchar(255) NOT NULL CHECK (outcome IN ('sold', 'donated', 'disposed', 'recycled', 'lost', 'custom')),
    custom_reason varchar(255),
    effective_date timestamptz NOT NULL,
    notes varchar(1000),
    reactivated_at timestamptz,
    entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    CHECK (outcome <> 'custom' OR (custom_reason IS NOT NULL AND length(trim(custom_reason)) > 0))
);
CREATE INDEX entityoffboarding_entity_id_created_at ON entity_offboardings(entity_id, created_at);
-- A cycle can be open only once, independently of application-level state checks.
CREATE UNIQUE INDEX entityoffboarding_open_cycle ON entity_offboardings(entity_id) WHERE reactivated_at IS NULL;

-- +goose Down
DROP TABLE entity_offboardings;
DROP INDEX entity_offboarded;
ALTER TABLE entities DROP COLUMN offboarded;
