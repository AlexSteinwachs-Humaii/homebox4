package v1

import (
	"errors"
	"github.com/google/uuid"
	"github.com/hay-kot/httpkit/errchain"
	"github.com/hay-kot/httpkit/server"
	"github.com/sysadminsmedia/homebox/backend/internal/core/services"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent"
	"github.com/sysadminsmedia/homebox/backend/internal/data/repo"
	"github.com/sysadminsmedia/homebox/backend/internal/sys/validate"
	"github.com/sysadminsmedia/homebox/backend/internal/web/adapters"
	"net/http"
	"time"
)

// EntityOffboardRequest uses an explicit calendar date, not a timestamp.
type EntityOffboardRequest struct {
	Outcome       string `json:"outcome" enums:"sold,donated,disposed,recycled,lost,custom"`
	EffectiveDate string `json:"effectiveDate" example:"2026-10-09"`
	CustomReason  string `json:"customReason"`
	Notes         string `json:"notes"`
}

func (b EntityOffboardRequest) transition() (repo.EntityOffboard, error) {
	date, err := time.Parse("2006-01-02", b.EffectiveDate)
	if err != nil {
		return repo.EntityOffboard{}, validate.NewRequestError(errors.New("effectiveDate must be YYYY-MM-DD"), http.StatusBadRequest)
	}
	data := repo.EntityOffboard{Outcome: b.Outcome, EffectiveDate: date, CustomReason: b.CustomReason, Notes: b.Notes}
	if err := data.Validate(); err != nil {
		return data, validate.NewRequestError(err, http.StatusBadRequest)
	}
	return data, nil
}
func lifecycleError(err error) error {
	switch {
	case err == nil:
		return nil
	case ent.IsNotFound(err):
		return validate.NewRequestError(errors.New("asset not found"), http.StatusNotFound)
	case errors.Is(err, repo.ErrInvalidOffboarding):
		return validate.NewRequestError(err, http.StatusBadRequest)
	case errors.Is(err, repo.ErrInvalidLifecycleTransition):
		return validate.NewRequestError(err, http.StatusConflict)
	default:
		return err
	}
}

// Ownership is checked before mutation; conditional transactional writes still
// enforce the state transition after this check.
func (ctrl *V1Controller) lifecycleTarget(ctx services.Context, id uuid.UUID) error {
	asset, err := ctrl.repo.Entities.GetOneByGroup(ctx, ctx.GID, id)
	if err != nil {
		return lifecycleError(err)
	}
	if asset.EntityType != nil && asset.EntityType.IsLocation {
		return validate.NewRequestError(errors.New("locations cannot be offboarded or reactivated"), http.StatusBadRequest)
	}
	return nil
}

// HandleEntityOffboard godoc
// @Summary Offboard an active asset
// @Tags Entities
// @Accept json
// @Produce json
// @Param id path string true "Entity ID"
// @Param payload body EntityOffboardRequest true "Offboarding record"
// @Success 201 {object} repo.EntityOffboardingRecord
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 409 {object} map[string]string
// @Router /v1/entities/{id}/offboard [POST]
// @Security Bearer
func (ctrl *V1Controller) HandleEntityOffboard() errchain.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) error {
		id, err := adapters.RouteUUID(r, "id")
		if err != nil {
			return err
		}
		body, err := adapters.DecodeBody[EntityOffboardRequest](r)
		if err != nil {
			return validate.NewRequestError(err, http.StatusBadRequest)
		}
		data, err := body.transition()
		if err != nil {
			return err
		}
		ctx := services.NewContext(r.Context())
		if err := ctrl.lifecycleTarget(ctx, id); err != nil {
			return err
		}
		record, err := ctrl.svc.Entities.Offboard(ctx, id, data)
		if err != nil {
			return lifecycleError(err)
		}
		return server.JSON(w, http.StatusCreated, repo.MapOffboardingRecord(record))
	}

}

// HandleEntityReactivate godoc
// @Summary Reactivate an offboarded asset without changing archive state
// @Tags Entities
// @Param id path string true "Entity ID"
// @Success 204
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 409 {object} map[string]string
// @Router /v1/entities/{id}/reactivate [POST]
// @Security Bearer
func (ctrl *V1Controller) HandleEntityReactivate() errchain.HandlerFunc {
	return adapters.CommandID("id", func(r *http.Request, id uuid.UUID) (any, error) {
		ctx := services.NewContext(r.Context())
		if err := ctrl.lifecycleTarget(ctx, id); err != nil {
			return nil, err
		}
		return nil, lifecycleError(ctrl.svc.Entities.Reactivate(ctx, id))
	}, http.StatusNoContent)
}

// HandleEntityOffboardingHistory godoc
// @Summary Get retained asset offboarding history, oldest recorded first
// @Tags Entities
// @Produce json
// @Param id path string true "Entity ID"
// @Success 200 {array} repo.EntityOffboardingRecord
// @Failure 404 {object} map[string]string
// @Router /v1/entities/{id}/offboarding-history [GET]
// @Security Bearer
func (ctrl *V1Controller) HandleEntityOffboardingHistory() errchain.HandlerFunc {
	return adapters.CommandID("id", func(r *http.Request, id uuid.UUID) ([]repo.EntityOffboardingRecord, error) {
		records, err := ctrl.svc.Entities.OffboardingHistory(services.NewContext(r.Context()), id)
		if err != nil {
			return nil, lifecycleError(err)
		}
		out := make([]repo.EntityOffboardingRecord, 0, len(records))
		for _, record := range records {
			out = append(out, repo.MapOffboardingRecord(record))
		}
		return out, nil
	}, http.StatusOK)
}
