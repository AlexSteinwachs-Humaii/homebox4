package v1

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/hay-kot/httpkit/errchain"
	"github.com/sysadminsmedia/homebox/backend/internal/core/services"
	"github.com/sysadminsmedia/homebox/backend/internal/core/services/reporting"
	"github.com/sysadminsmedia/homebox/backend/internal/sys/validate"
)

// HandleBillOfMaterialsExport godoc
//
//	@Summary	Export Bill of Materials
//	@Tags		Reporting
//	@Produce	json
//	@Success	200	{string}	string	"text/csv"
//	@Router		/v1/reporting/bill-of-materials [GET]
//	@Security	Bearer
func (ctrl *V1Controller) HandleBillOfMaterialsExport() errchain.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) error {
		tenant := services.UseTenantCtx(r.Context())

		if tenant == uuid.Nil {
			return validate.NewRequestError(errors.New("tenant required"), http.StatusBadRequest)
		}

		csv, err := ctrl.svc.Entities.ExportBillOfMaterialsCSV(r.Context(), tenant)
		if err != nil {
			return err
		}

		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", "attachment; filename=bill-of-materials.csv")
		_, err = w.Write(csv)
		return err
	}
}

// HandleFilteredReportingExport godoc
//
// @Summary Export all filtered reporting results
// @Description Accepts the same query parameters as GET /v1/entities; page and pageSize are ignored. Collection access is resolved by authenticated tenant middleware.
// @Tags Reporting
// @Produce text/csv
// @Param presentation query string false "JSON CSVPresentation: allowlisted visible columns with translated labels, currency and short-date formatting captured from the table"
// @Param q query string false "Search string (including #asset ID)"
// @Param orderBy query string false "Dashboard order: name, assetId, createdAt or updatedAt"
// @Param tags query []string false "Tag IDs" collectionFormat(multi)
// @Param parentIds query []string false "Parent IDs" collectionFormat(multi)
// @Param fields query []string false "Custom field name=value pairs" collectionFormat(multi)
// @Param negateTags query bool false "Exclude selected tags"
// @Param includeArchived query bool false "Include archived entities"
// @Param onlyWithoutPhoto query bool false "Only entities without a primary photo"
// @Param onlyWithPhoto query bool false "Only entities with a primary photo"
// @Param isLocation query bool false "Locations only when true; otherwise items"
// @Param filterChildren query bool false "Only root entities"
// @Success 200 {string} string "text/csv"
// @Router /v1/reporting/filtered [GET]
// @Security Bearer
func (ctrl *V1Controller) HandleFilteredReportingExport() errchain.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) error {
		ctx := services.NewContext(r.Context())
		if ctx.GID == uuid.Nil || ctx.UID == uuid.Nil {
			return validate.NewRequestError(errors.New("authenticated collection required"), http.StatusUnauthorized)
		}
		presentation, err := parseCSVPresentation(r)
		if err != nil {
			return validate.NewRequestError(err, http.StatusBadRequest)
		}
		// Parse once: later dashboard changes cannot mutate this request's inputs.
		query := extractEntityQuery(r)
		items, err := ctrl.repo.Entities.QueryAllByGroup(ctx, ctx.GID, query)
		if err != nil {
			return err
		}
		data, err := reporting.FilteredCSV(items, presentation)
		if err != nil {
			return err
		}
		_, err = writeFilteredCSV(w, data, time.Now())
		return err
	}
}

func parseCSVPresentation(r *http.Request) (reporting.CSVPresentation, error) {
	p := reporting.DefaultCSVPresentation()
	raw := r.URL.Query().Get("presentation")
	if raw != "" {
		if len(raw) > 8192 {
			return p, errors.New("export presentation too large")
		}
		if err := json.Unmarshal([]byte(raw), &p); err != nil {
			return p, errors.New("invalid export presentation")
		}
	}
	return p, p.Validate()
}

func writeFilteredCSV(w http.ResponseWriter, data []byte, now time.Time) (int, error) {
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=filtered-report-"+now.UTC().Format("2006-01-02")+".csv")
	return w.Write(data)
}
