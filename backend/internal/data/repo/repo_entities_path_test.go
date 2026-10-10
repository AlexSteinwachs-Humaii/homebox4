package repo

import (
 "context"
 "testing"

 "github.com/google/uuid"
 "github.com/stretchr/testify/require"
)

func TestEntityRepository_PathPreservesEntityTypesAndTenant(t *testing.T) {
 ctx := context.Background()
 group, err := tRepos.Groups.GroupCreate(ctx, "path-context", uuid.Nil)
 require.NoError(t, err)
 locationType, err := tRepos.EntityTypes.GetDefault(ctx, group.ID, true)
 require.NoError(t, err)
 itemType, err := tRepos.EntityTypes.GetDefault(ctx, group.ID, false)
 require.NoError(t, err)
 location, err := tRepos.Entities.Create(ctx, group.ID, EntityCreate{Name: "Garage", EntityTypeID: locationType.ID})
 require.NoError(t, err)
 parent, err := tRepos.Entities.Create(ctx, group.ID, EntityCreate{Name: "Toolbox", EntityTypeID: itemType.ID, ParentID: location.ID})
 require.NoError(t, err)
 child, err := tRepos.Entities.Create(ctx, group.ID, EntityCreate{Name: "Drill", EntityTypeID: itemType.ID, ParentID: parent.ID})
 require.NoError(t, err)
 path, err := tRepos.Entities.PathForEntity(ctx, group.ID, child.ID)
 require.NoError(t, err)
 require.Equal(t, []EntityPath{
  {ID: location.ID, Name: location.Name, Type: EntityPathTypeLocation},
  {ID: parent.ID, Name: parent.Name, Type: EntityPathTypeItem},
  {ID: child.ID, Name: child.Name, Type: EntityPathTypeItem},
 }, path)
 foreignPath, err := tRepos.Entities.PathForEntity(ctx, tGroup.ID, child.ID)
 require.NoError(t, err)
 require.Empty(t, foreignPath)
}
