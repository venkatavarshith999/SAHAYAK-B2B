-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "orderId" TEXT;

-- CreateTable
CREATE TABLE "PartnershipRequest" (
    "id" TEXT NOT NULL,
    "requesterOrgId" TEXT NOT NULL,
    "targetOrgId" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL,
    "message" TEXT,
    "commercialTerms" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedInfoNote" TEXT,
    "reviewedById" TEXT,
    "reviewerNotes" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "history" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnershipRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rfq" (
    "id" TEXT NOT NULL,
    "rfqNumber" TEXT NOT NULL,
    "buyerOrgId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'units',
    "specifications" TEXT,
    "targetMinPrice" DOUBLE PRECISION,
    "targetMaxPrice" DOUBLE PRECISION,
    "deliveryCity" TEXT NOT NULL,
    "requiredBy" TIMESTAMP(3),
    "paymentPreference" TEXT,
    "targetSellerOrgIds" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rfq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "sellerOrgId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "availableQty" INTEGER NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "bulkPrice" DOUBLE PRECISION,
    "moq" INTEGER NOT NULL DEFAULT 1,
    "taxRatePct" DOUBLE PRECISION NOT NULL DEFAULT 18,
    "deliveryCharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "estimatedDeliveryDays" INTEGER NOT NULL DEFAULT 7,
    "paymentTerms" TEXT NOT NULL DEFAULT 'Net 15 Days',
    "validUntil" TIMESTAMP(3),
    "conditions" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NegotiationSession" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT,
    "quotationId" TEXT,
    "buyerOrgId" TEXT NOT NULL,
    "sellerOrgId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'units',
    "round" INTEGER NOT NULL DEFAULT 1,
    "maxRounds" INTEGER NOT NULL DEFAULT 5,
    "currentBuyerOffer" DOUBLE PRECISION NOT NULL,
    "currentSellerAsk" DOUBLE PRECISION NOT NULL,
    "sellerFloorPrice" DOUBLE PRECISION NOT NULL,
    "buyerMaxPrice" DOUBLE PRECISION,
    "deliveryTerms" TEXT,
    "paymentTerms" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "buyerConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "sellerConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "agreedUnitPrice" DOUBLE PRECISION,
    "agreedTotalValue" DOUBLE PRECISION,
    "agreedTermsSnapshot" JSONB,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NegotiationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NegotiationRound" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "actorOrgId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorSide" TEXT NOT NULL,
    "proposedPrice" DOUBLE PRECISION NOT NULL,
    "proposedQty" INTEGER NOT NULL,
    "deliveryTerms" TEXT,
    "paymentTerms" TEXT,
    "kaenStatus" TEXT,
    "kaenCounterPrice" DOUBLE PRECISION,
    "rationale" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NegotiationRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessConversation" (
    "id" TEXT NOT NULL,
    "orgAId" TEXT NOT NULL,
    "orgBId" TEXT NOT NULL,
    "subject" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderOrgId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attachmentStorageKey" TEXT,
    "attachmentFileName" TEXT,
    "attachmentMimeType" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "refLabel" TEXT,
    "readByOrgIds" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "buyerOrgId" TEXT NOT NULL,
    "sellerOrgId" TEXT NOT NULL,
    "rfqId" TEXT,
    "quotationId" TEXT,
    "negotiationSessionId" TEXT,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'units',
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "taxRatePct" DOUBLE PRECISION NOT NULL DEFAULT 18,
    "taxAmount" DOUBLE PRECISION NOT NULL,
    "deliveryCharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "deliveryCity" TEXT NOT NULL,
    "deliveryAddress" TEXT,
    "paymentTerms" TEXT NOT NULL DEFAULT 'Net 15 Days',
    "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "cancellationReason" TEXT,
    "cancelledById" TEXT,
    "timeline" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnershipRequest_requesterOrgId_status_idx" ON "PartnershipRequest"("requesterOrgId", "status");

-- CreateIndex
CREATE INDEX "PartnershipRequest_targetOrgId_status_idx" ON "PartnershipRequest"("targetOrgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Rfq_rfqNumber_key" ON "Rfq"("rfqNumber");

-- CreateIndex
CREATE INDEX "Rfq_buyerOrgId_status_idx" ON "Rfq"("buyerOrgId", "status");

-- CreateIndex
CREATE INDEX "Rfq_category_status_idx" ON "Rfq"("category", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_quoteNumber_key" ON "Quotation"("quoteNumber");

-- CreateIndex
CREATE INDEX "Quotation_rfqId_status_idx" ON "Quotation"("rfqId", "status");

-- CreateIndex
CREATE INDEX "Quotation_sellerOrgId_status_idx" ON "Quotation"("sellerOrgId", "status");

-- CreateIndex
CREATE INDEX "NegotiationSession_buyerOrgId_status_idx" ON "NegotiationSession"("buyerOrgId", "status");

-- CreateIndex
CREATE INDEX "NegotiationSession_sellerOrgId_status_idx" ON "NegotiationSession"("sellerOrgId", "status");

-- CreateIndex
CREATE INDEX "NegotiationRound_sessionId_roundNumber_idx" ON "NegotiationRound"("sessionId", "roundNumber");

-- CreateIndex
CREATE INDEX "BusinessConversation_orgAId_lastMessageAt_idx" ON "BusinessConversation"("orgAId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "BusinessConversation_orgBId_lastMessageAt_idx" ON "BusinessConversation"("orgBId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessConversation_orgAId_orgBId_key" ON "BusinessConversation"("orgAId", "orgBId");

-- CreateIndex
CREATE INDEX "BusinessMessage_conversationId_createdAt_idx" ON "BusinessMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_buyerOrgId_status_idx" ON "Order"("buyerOrgId", "status");

-- CreateIndex
CREATE INDEX "Order_sellerOrgId_status_idx" ON "Order"("sellerOrgId", "status");

-- CreateIndex
CREATE INDEX "Shipment_orderId_idx" ON "Shipment"("orderId");

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnershipRequest" ADD CONSTRAINT "PartnershipRequest_requesterOrgId_fkey" FOREIGN KEY ("requesterOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnershipRequest" ADD CONSTRAINT "PartnershipRequest_targetOrgId_fkey" FOREIGN KEY ("targetOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_buyerOrgId_fkey" FOREIGN KEY ("buyerOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_sellerOrgId_fkey" FOREIGN KEY ("sellerOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegotiationSession" ADD CONSTRAINT "NegotiationSession_buyerOrgId_fkey" FOREIGN KEY ("buyerOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegotiationSession" ADD CONSTRAINT "NegotiationSession_sellerOrgId_fkey" FOREIGN KEY ("sellerOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegotiationSession" ADD CONSTRAINT "NegotiationSession_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegotiationSession" ADD CONSTRAINT "NegotiationSession_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegotiationRound" ADD CONSTRAINT "NegotiationRound_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "NegotiationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessConversation" ADD CONSTRAINT "BusinessConversation_orgAId_fkey" FOREIGN KEY ("orgAId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessConversation" ADD CONSTRAINT "BusinessConversation_orgBId_fkey" FOREIGN KEY ("orgBId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessMessage" ADD CONSTRAINT "BusinessMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "BusinessConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_buyerOrgId_fkey" FOREIGN KEY ("buyerOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_sellerOrgId_fkey" FOREIGN KEY ("sellerOrgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_negotiationSessionId_fkey" FOREIGN KEY ("negotiationSessionId") REFERENCES "NegotiationSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
