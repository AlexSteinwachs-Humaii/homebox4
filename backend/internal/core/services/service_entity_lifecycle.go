package services

import (
	"github.com/google/uuid"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent"
	"github.com/sysadminsmedia/homebox/backend/internal/data/repo"
)

// Lifecycle transitions always use the authenticated context's collection, not
// a collection identifier supplied by a request body.
func (svc *EntityService) Offboard(ctx Context, id uuid.UUID, data repo.EntityOffboard) (*ent.EntityOffboarding, error) {
	return svc.repo.Entities.OffboardByGroup(ctx, ctx.GID, id, data)
}

func (svc *EntityService) Reactivate(ctx Context, id uuid.UUID) error {
	return svc.repo.Entities.ReactivateByGroup(ctx, ctx.GID, id)
}

func (svc *EntityService) OffboardingHistory(ctx Context, id uuid.UUID) ([]*ent.EntityOffboarding, error) {
	return svc.repo.Entities.OffboardingHistoryByGroup(ctx, ctx.GID, id)
}
