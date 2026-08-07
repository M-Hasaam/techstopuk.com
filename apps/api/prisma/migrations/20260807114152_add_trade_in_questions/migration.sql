-- CreateTable
CREATE TABLE "trade_in_questions" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trade_in_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_in_question_options" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "image" TEXT,
    "icon" TEXT,
    "tone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trade_in_question_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trade_in_questions_category_idx" ON "trade_in_questions"("category");

-- CreateIndex
CREATE UNIQUE INDEX "trade_in_questions_category_key_key" ON "trade_in_questions"("category", "key");

-- CreateIndex
CREATE INDEX "trade_in_question_options_questionId_idx" ON "trade_in_question_options"("questionId");

-- AddForeignKey
ALTER TABLE "trade_in_question_options" ADD CONSTRAINT "trade_in_question_options_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "trade_in_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
