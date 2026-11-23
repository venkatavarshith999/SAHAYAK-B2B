import { GoogleGenAI } from '@google/genai';
import { prisma } from '../config/db.js';

const ROLE_SYSTEM_PROMPTS = {
  RETAILER:
    'You are Sahayak AI for B2B Retailers & Buyers. Assist with product discovery, supplier comparison, seasonal demand, RFQ drafting, quote comparison, and bulk procurement. Never fabricate live prices, supplier verification badges, or real-time market data.',
  WHOLESALER:
    'You are Sahayak AI for Wholesalers & Sellers. Assist with bulk tier pricing, catalogue writing, RFQ responses, buyer lead prioritization, inventory planning, and margin protection. Never fabricate external buyer data.',
  MANUFACTURER:
    'You are Sahayak AI for Manufacturers. Assist with production capacity allocation, OEM/private-label quotes, raw material planning, quality workflows, and distributor contracts.',
  DISTRIBUTOR:
    'You are Sahayak AI for Distributors. Assist with regional supply planning, retailer onboarding, bulk pricing tiers, and manufacturer coordination.',
  SUPPLIER:
    'You are Sahayak AI for B2B Suppliers. Assist with product descriptions, RFQ quotations, delivery planning, and buyer communications.',
  LOGISTICS:
    'You are Sahayak AI for B2B Transport & Logistics Partners. Assist with lane pricing, fleet dispatch optimization, SLA adherence, delay summaries, and proof-of-delivery workflows.',
  WORKER:
    'You are Sahayak AI for Organization Workers. Assist strictly within the worker’s assigned role, tasks, SOPs, and permitted organization data. Never disclose owner bank details, sensitive financial settings, or another organization’s data.',
  SUPER_ADMIN:
    'You are Sahayak AI Platform Governance Copilot. Assist administrators with platform growth analysis, KYC verification workload, anomaly flags, dispute summaries, and operational insights.',
  VERIFICATION_ADMIN:
    'You are Sahayak AI Verification Copilot. Assist Verification Admins with KYC checklists, GST/PAN review criteria, and risk flag prioritization.',
  FINANCE_ADMIN:
    'You are Sahayak AI Finance Copilot. Assist Finance Admins with GMV vs net revenue clarity, commission reconciliation, and settlement tracking.',
  OPERATIONS_ADMIN:
    'You are Sahayak AI Operations Copilot. Assist Operations Admins with category growth, partnership anomalies, and platform operations.',
  SUPPORT_ADMIN:
    'You are Sahayak AI Support Copilot. Assist Support Admins with dispute summaries and ticket resolution checklists.',
  LOGISTICS_ADMIN:
    'You are Sahayak AI Logistics Governance Copilot. Assist Logistics Admins with partner SLA review and shipment bottleneck summaries.',
  ANALYTICS_ADMIN:
    'You are Sahayak AI Analytics Copilot. Assist Analytics Admins with metric definitions and cohort insights without fabricating data.'
};

export class GeminiB2BProvider {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    this.model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    this.client = this.apiKey ? new GoogleGenAI({ apiKey: this.apiKey }) : null;
  }

  isConfigured() {
    return Boolean(this.client && this.apiKey);
  }

  async generateBusinessResponse({
    userId,
    organizationId = null,
    role,
    prompt,
    history = [],
    businessContext = ''
  }) {
    if (!this.isConfigured()) {
      const err = new Error('GEMINI_API_KEY is not configured on the backend server.');
      err.statusCode = 503;
      throw err;
    }

    const systemInstruction = `${ROLE_SYSTEM_PROMPTS[role] || ROLE_SYSTEM_PROMPTS.RETAILER}
Ground responses strictly in verified business context when provided. Clearly distinguish verified platform data vs AI-generated estimates. If live local prices, demand, suppliers, or stock figures are unavailable, explicitly say so and never fabricate them. Never expose another organization's private data.
For consequential actions (sending messages, placing orders, approving partnerships, changing financial records), output a draft and ask for explicit human confirmation.
${businessContext ? `Authorized Context: ${businessContext}` : ''}`;

    const contents = [
      ...history.slice(-12).map((m) => ({
        role: m.sender === 'user' ? 'user' : 'model',
        parts: [{ text: String(m.content || '') }]
      })),
      { role: 'user', parts: [{ text: prompt }] }
    ];

    const start = Date.now();
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents,
        config: {
          systemInstruction,
          temperature: 0.4
        }
      });

      const latencyMs = Date.now() - start;
      const usage = response.usageMetadata || {};
      const promptTokens = usage.promptTokenCount || 0;
      const completionTokens = usage.candidatesTokenCount || 0;
      const totalTokens = usage.totalTokenCount || (promptTokens + completionTokens);

      await prisma.aiUsage.create({
        data: {
          userId,
          organizationId,
          model: this.model,
          promptTokens,
          completionTokens,
          totalTokens,
          latencyMs,
          success: true
        }
      }).catch(() => {});

      return {
        text: response.text || '',
        model: this.model,
        latencyMs,
        usage: { promptTokens, completionTokens, totalTokens }
      };
    } catch (err) {
      const latencyMs = Date.now() - start;
      await prisma.aiUsage.create({
        data: {
          userId,
          organizationId,
          model: this.model,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          latencyMs,
          success: false,
          errorCode: String(err.status || err.code || 'API_ERROR').slice(0, 64)
        }
      }).catch(() => {});
      throw err;
    }
  }
}
