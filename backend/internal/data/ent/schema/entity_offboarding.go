package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"github.com/google/uuid"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent/schema/mixins"
)

// EntityOffboarding retains one lifecycle cycle, including its eventual reactivation.
type EntityOffboarding struct{ ent.Schema }

func (EntityOffboarding) Mixin() []ent.Mixin { return []ent.Mixin{mixins.BaseMixin{}} }
func (EntityOffboarding) Fields() []ent.Field {
	return []ent.Field{
		field.UUID("entity_id", uuid.UUID{}).Immutable(),
		field.Enum("outcome").Values("sold", "donated", "disposed", "recycled", "lost", "custom").Immutable(),
		field.String("custom_reason").MaxLen(255).Optional().Immutable(),
		field.Time("effective_date").Immutable(),
		field.String("notes").MaxLen(1000).Optional().Immutable(),
		field.Time("reactivated_at").Optional().Nillable(),
	}
}
func (EntityOffboarding) Edges() []ent.Edge {
	return []ent.Edge{edge.From("entity", Entity.Type).Ref("offboarding_records").Field("entity_id").Unique().Required().Immutable()}
}
func (EntityOffboarding) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("entity_id", "created_at"),
		index.Fields("entity_id").Unique().StorageKey("entityoffboarding_open_cycle").Annotations(entsql.IndexWhere("reactivated_at IS NULL")),
	}
}
