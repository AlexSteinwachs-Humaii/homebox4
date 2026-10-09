package repo

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent/attachment"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent/entity"
)

// Compare the entire legacy asset graph across the embedded SQL upgrade, not
// just the archive flag. This also catches accidental changes to unrelated
// purchase/sale fields, hierarchy FKs and attachment/thumbnail associations.
func TestLifecycleMigrationPreservesLegacyAssetGraph(t *testing.T) {
	dialects := []string{"sqlite3"}
	if os.Getenv("OFFBOARDING_POSTGRES_DSN") != "" {
		dialects = append(dialects, "postgres")
	}
	for _, dialect := range dialects {
		t.Run(dialect, func(t *testing.T) {
			ctx := context.Background()
			lifecycleDatabaseWithLegacyFixture(t, dialect, func(client *ent.Client, id uuid.UUID) func() {
				asset, err := client.Entity.Get(ctx, id)
				require.NoError(t, err)
				typeID, err := asset.QueryEntityType().OnlyID(ctx)
				require.NoError(t, err)
				groupID, err := asset.QueryGroup().OnlyID(ctx)
				require.NoError(t, err)
				parent, err := client.Entity.Create().SetName("legacy parent").SetGroupID(groupID).SetEntityTypeID(typeID).Save(ctx)
				require.NoError(t, err)
				_, err = client.Entity.Create().SetName("legacy child").SetGroupID(groupID).SetEntityTypeID(typeID).SetParentID(id).Save(ctx)
				require.NoError(t, err)
				_, err = client.Entity.UpdateOneID(id).
					SetParentID(parent.ID).SetPurchaseDate(time.Date(2020, 2, 29, 0, 0, 0, 0, time.UTC)).
					SetPurchaseFrom("original supplier").SetPurchasePrice(123.45).
					SetSoldDate(time.Date(2025, 8, 15, 0, 0, 0, 0, time.UTC)).SetSoldNotes("legacy sale notes").Save(ctx)
				require.NoError(t, err)
				thumb, err := client.Attachment.Create().SetEntityID(id).SetType(attachment.TypeThumbnail).
					SetTitle("preview").SetPath("legacy/preview.jpg").SetMimeType("image/jpeg").Save(ctx)
				require.NoError(t, err)
				_, err = client.Attachment.Create().SetEntityID(id).SetType(attachment.TypeReceipt).
					SetTitle("purchase receipt").SetPath("legacy/receipt.png").SetMimeType("image/png").
					SetPrimary(true).SetThumbnailID(thumb.ID).Save(ctx)
				require.NoError(t, err)

				snapshot := func() string {
					t.Helper()
					graph, err := client.Entity.Query().Where(entity.ID(id)).WithParent().WithChildren().
						WithAttachments(func(q *ent.AttachmentQuery) {
							q.Order(ent.Asc(attachment.FieldID)).WithThumbnail()
						}).Only(ctx)
					require.NoError(t, err)
					require.True(t, graph.Archived)
					require.False(t, graph.Offboarded)
					require.Equal(t, parent.ID, graph.Edges.Parent.ID)
					require.Len(t, graph.Edges.Children, 1)
					require.Len(t, graph.Edges.Attachments, 2)
					data, err := json.Marshal(graph)
					require.NoError(t, err)
					return string(data)
				}
				before := snapshot()
				return func() {
					require.JSONEq(t, before, snapshot(), "upgrade must preserve the complete legacy asset graph")
					history, err := client.EntityOffboarding.Query().Count(ctx)
					require.NoError(t, err)
					require.Zero(t, history, "archive and sale fields must not fabricate lifecycle outcomes")
				}
			})
		})
	}
}
