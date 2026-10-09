package reporting

import (
	"bytes"
	"encoding/csv"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/sysadminsmedia/homebox/backend/internal/data/repo"
)

// CSVColumn is an allowlisted table data column, not a database expression.
type CSVColumn struct {
	ID    string `json:"id"`
	Label string `json:"label"`
}

// CSVPresentation captures the table's display settings at request time. Currency
// affixes/separators come from Intl.NumberFormat; DateLayout describes the short
// date shown in the table (the relative-age tooltip/decoration is not exported).
type CSVPresentation struct {
	Columns            []CSVColumn `json:"columns"`
	Digits             string      `json:"digits"`
	CurrencyPrefix     string      `json:"currencyPrefix"`
	CurrencySuffix     string      `json:"currencySuffix"`
	DecimalSeparator   string      `json:"decimalSeparator"`
	GroupSeparator     string      `json:"groupSeparator"`
	GroupSize          int         `json:"groupSize"`
	SecondaryGroupSize int         `json:"secondaryGroupSize"`
	CurrencyDecimals   int         `json:"currencyDecimals"`
	DateLayout         string      `json:"dateLayout"`
	TimeZone           string      `json:"timeZone"`
}

func DefaultCSVPresentation() CSVPresentation {
	return CSVPresentation{Columns: []CSVColumn{{"name", "Name"}, {"quantity", "Quantity"}, {"insured", "Insured"}, {"purchasePrice", "Purchase Price"}}, CurrencyPrefix: "$", DecimalSeparator: ".", GroupSeparator: ",", CurrencyDecimals: 2, Digits: "0123456789", GroupSize: 3, SecondaryGroupSize: 3, DateLayout: "01/02/2006", TimeZone: "UTC"}
}

func (p CSVPresentation) Validate() error {
	digits := []rune(p.Digits)
	seenDigits := map[rune]bool{}
	if len(digits) != 10 {
		return fmt.Errorf("invalid currency digits")
	}
	for _, r := range digits {
		if !unicode.IsDigit(r) || seenDigits[r] {
			return fmt.Errorf("invalid currency digits")
		}
		seenDigits[r] = true
	}
	allowed := map[string]bool{"assetId": true, "name": true, "quantity": true, "insured": true, "purchasePrice": true, "location": true, "archived": true, "createdAt": true, "updatedAt": true}
	seen := map[string]bool{}
	if len(p.Columns) == 0 || len(p.Columns) > len(allowed) {
		return fmt.Errorf("invalid export columns")
	}
	for _, c := range p.Columns {
		if !allowed[c.ID] || seen[c.ID] || strings.TrimSpace(c.Label) == "" || len(c.Label) > 200 {
			return fmt.Errorf("invalid export column %q", c.ID)
		}
		seen[c.ID] = true
	}
	if p.GroupSize < 1 || p.GroupSize > 4 || p.SecondaryGroupSize < 1 || p.SecondaryGroupSize > 4 {
		return fmt.Errorf("invalid grouping size")
	}
	if p.CurrencyDecimals < 0 || p.CurrencyDecimals > 4 {
		return fmt.Errorf("invalid currency precision")
	}
	for _, s := range []string{p.CurrencyPrefix, p.CurrencySuffix, p.DecimalSeparator, p.GroupSeparator} {
		if len(s) > 32 || strings.ContainsAny(s, "\r\n\t=+-@") || strings.ContainsAny(s, "<>") {
			return fmt.Errorf("invalid currency formatting")
		}
	}
	if p.DecimalSeparator == "" {
		return fmt.Errorf("decimal separator required")
	}
	// Short-date patterns are presentation only; no database expressions or HTML.
	if len(p.DateLayout) == 0 || len(p.DateLayout) > 64 || strings.ContainsAny(p.DateLayout, "<>\r\n\t=+@") {
		return fmt.Errorf("invalid date layout")
	}
	if _, err := time.LoadLocation(p.TimeZone); err != nil {
		return fmt.Errorf("invalid time zone: %w", err)
	}
	return nil
}

// Protect text, not typed numeric values. Leading whitespace/control characters
// are ignored by spreadsheet importers, so inspect past them as well.
func safeCSVText(s string) string {
	trimmed := strings.TrimLeftFunc(s, func(r rune) bool { return unicode.IsSpace(r) || unicode.IsControl(r) || unicode.Is(unicode.Cf, r) })
	if strings.HasPrefix(s, "\t") || strings.HasPrefix(s, "\r") || strings.HasPrefix(s, "\n") || (len(trimmed) > 0 && strings.ContainsRune("=+-@", rune(trimmed[0]))) {
		return "'" + s
	}
	return s
}

func (p CSVPresentation) money(n float64) string {
	negative := n < 0
	s := strconv.FormatFloat(math.Abs(n), 'f', p.CurrencyDecimals, 64)
	parts := strings.SplitN(s, ".", 2)
	integer := parts[0]
	for i := len(integer) - p.GroupSize; i > 0; i -= p.SecondaryGroupSize {
		integer = integer[:i] + p.GroupSeparator + integer[i:]
	}
	s = integer
	if len(parts) == 2 {
		s += p.DecimalSeparator + parts[1]
	}
	digits := []rune(p.Digits)
	s = strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return digits[r-'0']
		}
		return r
	}, s)
	s = p.CurrencyPrefix + s + p.CurrencySuffix
	if negative {
		s = "-" + s
	}
	return s
}

// FilteredCSV encodes only table data, in captured visible-column order.
// Serialization finishes before the handler sets successful download headers.
func FilteredCSV(items []repo.EntitySummary, options ...CSVPresentation) ([]byte, error) {
	p := DefaultCSVPresentation()
	if len(options) > 0 {
		p = options[0]
	}
	if err := p.Validate(); err != nil {
		return nil, err
	}
	zone, _ := time.LoadLocation(p.TimeZone)
	date := func(t time.Time) string {
		if t.IsZero() || t.Year() < 1000 {
			return ""
		}
		return t.In(zone).Format(p.DateLayout)
	}
	var out bytes.Buffer
	w := csv.NewWriter(&out)
	headers := make([]string, len(p.Columns))
	for i, c := range p.Columns {
		headers[i] = safeCSVText(c.Label)
	}
	if err := w.Write(headers); err != nil {
		return nil, err
	}
	for _, item := range items {
		if math.IsNaN(item.Quantity) || math.IsInf(item.Quantity, 0) || math.IsNaN(item.PurchasePrice) || math.IsInf(item.PurchasePrice, 0) {
			return nil, fmt.Errorf("invalid report numeric value")
		}
		row := make([]string, len(p.Columns))
		for i, c := range p.Columns {
			switch c.ID {
			case "assetId":
				row[i] = strconv.FormatInt(int64(item.AssetID), 10)
			case "name":
				row[i] = safeCSVText(item.Name)
			case "quantity":
				row[i] = strconv.FormatFloat(item.Quantity, 'f', -1, 64)
			case "insured":
				row[i] = strconv.FormatBool(item.Insured)
			case "purchasePrice":
				row[i] = p.money(item.PurchasePrice)
			case "location":
				if item.Parent != nil {
					row[i] = safeCSVText(item.Parent.Name)
				}
			case "archived":
				row[i] = strconv.FormatBool(item.Archived)
			case "createdAt":
				row[i] = safeCSVText(date(item.CreatedAt))
			case "updatedAt":
				row[i] = safeCSVText(date(item.UpdatedAt))
			}
		}
		if err := w.Write(row); err != nil {
			return nil, err
		}
	}
	w.Flush()
	return out.Bytes(), w.Error()
}
