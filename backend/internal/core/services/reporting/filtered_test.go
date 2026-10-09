package reporting

import (
	"encoding/csv"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/sysadminsmedia/homebox/backend/internal/data/repo"
)

func TestFilteredCSVHeaderOnly(t *testing.T) {
	data, err := FilteredCSV(nil)
	require.NoError(t, err)
	rows, err := csv.NewReader(strings.NewReader(string(data))).ReadAll()
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Contains(t, rows[0], "Name")
}

func TestFilteredCSVRetainsAllRowsInOrder(t *testing.T) {
	items := make([]repo.EntitySummary, 37)
	for i := range items {
		items[i].Name = strings.Repeat("a", i+1)
	}
	data, err := FilteredCSV(items)
	require.NoError(t, err)
	rows, err := csv.NewReader(strings.NewReader(string(data))).ReadAll()
	require.NoError(t, err)
	require.Len(t, rows, 38)
	for i := range items {
		require.Equal(t, items[i].Name, rows[i+1][2])
	}
}
