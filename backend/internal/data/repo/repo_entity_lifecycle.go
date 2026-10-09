package repo

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent/entity"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent/entityoffboarding"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent/entitytype"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent/group"
)

var ErrInvalidLifecycleTransition = errors.New("invalid asset lifecycle transition")
var ErrInvalidOffboarding = errors.New("invalid offboarding record")

// EntityOffboard is deliberately separate from ordinary entity write DTOs. Those
// DTOs cannot set lifecycle state, including stale edits, CSV patches and copies.
type EntityOffboard struct {
	Outcome       string    `json:"outcome"`
	EffectiveDate time.Time `json:"effectiveDate"`
	CustomReason  string    `json:"customReason"`
	Notes         string    `json:"notes"`
}

func (data EntityOffboard) Validate() error {
	switch data.Outcome {
	case "sold", "donated", "disposed", "recycled", "lost", "custom":
	default:
		return fmt.Errorf("%w: unsupported outcome", ErrInvalidOffboarding)
	}
	if data.Outcome == "custom" && strings.TrimSpace(data.CustomReason) == "" {
		return fmt.Errorf("%w: custom reason is required", ErrInvalidOffboarding)
	}
	if utf8.RuneCountInString(data.CustomReason) > 255 || utf8.RuneCountInString(data.Notes) > 1000 {
		return fmt.Errorf("%w: reason or notes exceeds limit", ErrInvalidOffboarding)
	}
	// Accept an explicit date, not a timestamp accidentally supplied by a caller.
	if data.EffectiveDate.IsZero() || data.EffectiveDate.Year() < 1 || data.EffectiveDate.Year() > 9999 || data.EffectiveDate.Hour() != 0 || data.EffectiveDate.Minute() != 0 || data.EffectiveDate.Second() != 0 || data.EffectiveDate.Nanosecond() != 0 {
		return fmt.Errorf("%w: effective date is required and must be date-only", ErrInvalidOffboarding)
	}
	return nil
}

// OffboardByGroup claims active state with a conditional UPDATE before creating
// history. PostgreSQL serializes competing writers on the entity row; SQLite
// serializes writers on the database. A loser fails or affects zero rows. Both
// state and history roll back on any error (including commit failure).
func (r *EntityRepository) OffboardByGroup(ctx context.Context, gid, id uuid.UUID, data EntityOffboard) (*ent.EntityOffboarding, error) {
	if err := data.Validate(); err != nil {
		return nil, err
	}
	tx, err := r.db.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	n, err := tx.Entity.Update().Where(entity.ID(id), entity.HasGroupWith(group.ID(gid)), entity.HasEntityTypeWith(entitytype.IsLocation(false)), entity.Offboarded(false)).SetOffboarded(true).Save(ctx)
	if err != nil {
		return nil, err
	}
	if n != 1 {
		return nil, ErrInvalidLifecycleTransition
	}
	record, err := tx.EntityOffboarding.Create().SetEntityID(id).
		SetOutcome(entityoffboarding.Outcome(data.Outcome)).
		SetEffectiveDate(time.Date(data.EffectiveDate.Year(), data.EffectiveDate.Month(), data.EffectiveDate.Day(), 0, 0, 0, 0, time.UTC)).
		SetCustomReason(strings.TrimSpace(data.CustomReason)).SetNotes(data.Notes).Save(ctx)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	record.Unwrap()
	r.publishMutationEvent(gid)
	return record, nil
}

func (r *EntityRepository) ReactivateByGroup(ctx context.Context, gid, id uuid.UUID) error {
	tx, err := r.db.Tx(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	n, err := tx.Entity.Update().Where(entity.ID(id), entity.HasGroupWith(group.ID(gid)), entity.HasEntityTypeWith(entitytype.IsLocation(false)), entity.Offboarded(true)).SetOffboarded(false).Save(ctx)
	if err != nil {
		return err
	}
	if n != 1 {
		return ErrInvalidLifecycleTransition
	}
	n, err = tx.EntityOffboarding.Update().Where(entityoffboarding.EntityID(id), entityoffboarding.ReactivatedAtIsNil()).SetReactivatedAt(time.Now().UTC()).Save(ctx)
	if err != nil {
		return err
	}
	if n != 1 {
		return fmt.Errorf("%w: expected exactly one open cycle", ErrInvalidLifecycleTransition)
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	r.publishMutationEvent(gid)
	return nil
}

// OffboardingHistoryByGroup is tenant scoped even when called without the API.
// The recorded timestamp plus UUID provides deterministic ordering for ties.
func (r *EntityRepository) OffboardingHistoryByGroup(ctx context.Context, gid, id uuid.UUID) ([]*ent.EntityOffboarding, error) {
	if _, err := r.db.Entity.Query().Where(entity.ID(id), entity.HasGroupWith(group.ID(gid))).Only(ctx); err != nil {
		return nil, err
	}
	return r.db.EntityOffboarding.Query().Where(entityoffboarding.EntityID(id), entityoffboarding.HasEntityWith(entity.HasGroupWith(group.ID(gid)))).Order(ent.Asc(entityoffboarding.FieldCreatedAt), ent.Asc(entityoffboarding.FieldID)).All(ctx)
}
