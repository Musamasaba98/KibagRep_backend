-- AlterTable
ALTER TABLE "_FacilityToUser" ADD CONSTRAINT "_FacilityToUser_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_FacilityToUser_AB_unique";

-- AlterTable
ALTER TABLE "_MonthlyPlanToTeam" ADD CONSTRAINT "_MonthlyPlanToTeam_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_MonthlyPlanToTeam_AB_unique";

-- AlterTable
ALTER TABLE "_productsDetailed" ADD CONSTRAINT "_productsDetailed_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_productsDetailed_AB_unique";
