-- CreateTable
CREATE TABLE "ClientCase" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientCase_pkey" PRIMARY KEY ("id")
);
