-- CreateTable: TerritoryTeam junction (team ↔ territory many-to-many)
CREATE TABLE IF NOT EXISTS "TerritoryTeam" (
    "territory_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TerritoryTeam_pkey" PRIMARY KEY ("territory_id","team_id")
);

-- AddForeignKey
ALTER TABLE "TerritoryTeam" ADD CONSTRAINT "TerritoryTeam_territory_id_fkey"
  FOREIGN KEY ("territory_id") REFERENCES "Territory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerritoryTeam" ADD CONSTRAINT "TerritoryTeam_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
