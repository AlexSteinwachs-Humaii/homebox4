package reporting

import (
	"encoding/csv"
	"math"
	"strings"
	"testing"
	"time"

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
		require.Equal(t, items[i].Name, rows[i+1][0])
	}
}

func TestFilteredCSVPresentationAndEscaping(t *testing.T) {
	p := DefaultCSVPresentation()
	p.Columns = []CSVColumn{{"location", "Location"}, {"name", "Nom"}, {"quantity", "Quantity"}, {"purchasePrice", "Price"}, {"createdAt", "Created"}, {"insured", "Insured"}, {"updatedAt", "Updated"}, {"assetId", "Asset ID"}, {"archived", "Archived"}}
	p.CurrencyPrefix = ""
	p.CurrencySuffix = " €"
	p.DecimalSeparator = ","
	p.GroupSeparator = "."
	p.DateLayout = "02.01.2006"
	p.TimeZone = "America/Los_Angeles"
	item := repo.EntitySummary{Name: "雪, \"café\"\nsecond line", Quantity: -2.5, PurchasePrice: -1234.5, CreatedAt: time.Date(2026, 1, 2, 2, 0, 0, 0, time.UTC), Parent: &repo.EntitySummary{Name: "@SUM(1,2)"}}
	data, err := FilteredCSV([]repo.EntitySummary{item}, p)
	require.NoError(t, err)
	rows, err := csv.NewReader(strings.NewReader(string(data))).ReadAll()
	require.NoError(t, err)
	require.Equal(t, []string{"Location", "Nom", "Quantity", "Price", "Created", "Insured", "Updated", "Asset ID", "Archived"}, rows[0])
	require.Equal(t, []string{"'@SUM(1,2)", item.Name, "-2.5", "-1.234,50 €", "01.01.2026", "false", "", "0", "false"}, rows[1])
	require.Contains(t, string(data), "\"雪, \"\"café\"\"\nsecond line\"")
}

func TestCSVFormulaTextAndTypedNumbers(t *testing.T) {
	for _, s := range []string{"=SUM(A1)", "+cmd", "-123", "@cmd", "  =cmd", "\t=cmd", "\rfoo", "\nfoo", "\u00a0@cmd", "\x00=cmd"} {
		require.Equal(t, "'"+s, safeCSVText(s))
	}
	for _, s := range []string{"", "normal", "雪", "hello\nworld", "<b>literal text</b>"} {
		require.Equal(t, s, safeCSVText(s))
	}
	p := DefaultCSVPresentation()
	p.Columns = []CSVColumn{{"name", "=header"}, {"quantity", "Quantity"}, {"purchasePrice", "Price"}}
	data, err := FilteredCSV([]repo.EntitySummary{{Name: "-10", Quantity: -10, PurchasePrice: -10}}, p)
	require.NoError(t, err)
	rows, err := csv.NewReader(strings.NewReader(string(data))).ReadAll()
	require.NoError(t, err)
	require.Equal(t, []string{"'-10", "-10", "-$10.00"}, rows[1])
	require.Equal(t, "'=header", rows[0][0])
}

func TestCSVRejectsInvalidPresentationAndNumbers(t *testing.T) {
	for _, columns := range [][]CSVColumn{{{"select", "Select"}}, {{"actions", "Actions"}}, {{"description", "Description"}}, {{"name", "Name"}, {"name", "Name"}}, {}} {
		p := DefaultCSVPresentation()
		p.Columns = columns
		_, err := FilteredCSV(nil, p)
		require.Error(t, err)
	}
	p := DefaultCSVPresentation()
	p.CurrencyPrefix = "=cmd"
	_, err := FilteredCSV(nil, p)
	require.Error(t, err)
	_, err = FilteredCSV([]repo.EntitySummary{{Quantity: math.NaN()}})
	require.Error(t, err)
}

func TestCSVIndianCurrencyGrouping(t *testing.T) {
	p := DefaultCSVPresentation()
	p.SecondaryGroupSize = 2
	p.CurrencyPrefix = "₹"
	require.Equal(t, "₹12,34,567.89", p.money(1234567.89))
}

func TestCSVLocalizedCurrencyDigits(t *testing.T) {
	p := DefaultCSVPresentation()
	p.Digits = "٠١٢٣٤٥٦٧٨٩"
	p.DecimalSeparator = "٫"
	p.GroupSeparator = "٬"
	p.CurrencyPrefix = ""
	p.CurrencySuffix = " ج.م."
	require.Equal(t, "١٬٢٣٤٫٥٠ ج.م.", p.money(1234.5))
	p.Digits = "0000000000"
	require.Error(t, p.Validate())
}
