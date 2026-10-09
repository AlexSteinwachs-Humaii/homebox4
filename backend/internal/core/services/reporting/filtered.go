package reporting

import (
	"bytes"
	"encoding/csv"
	"strconv"

	"github.com/sysadminsmedia/homebox/backend/internal/data/repo"
)

// FilteredCSV encodes the dashboard query result. Column presentation is kept
// separate from result selection so it can evolve without changing filters.
func FilteredCSV(items []repo.EntitySummary) ([]byte, error) {
	var out bytes.Buffer
	writer := csv.NewWriter(&out)
	if err := writer.Write([]string{"ID", "Asset ID", "Name", "Description", "Quantity", "Purchase Price"}); err != nil {
		return nil, err
	}
	for _, item := range items {
		if err := writer.Write([]string{
			item.ID.String(), strconv.FormatInt(int64(item.AssetID), 10), item.Name, item.Description,
			strconv.FormatFloat(item.Quantity, 'f', -1, 64), strconv.FormatFloat(item.PurchasePrice, 'f', -1, 64),
		}); err != nil {
			return nil, err
		}
	}
	writer.Flush()
	return out.Bytes(), writer.Error()
}
