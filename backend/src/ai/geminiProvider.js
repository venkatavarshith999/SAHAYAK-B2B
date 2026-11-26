import { GoogleGenAI } from '@google/genai';
import { prisma } from '../config/db.js';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';
export const DEFAULT_FALLBACK_MODELS = ['gemini-3.5-flash', 'gemini-3.5-flash-lite'];
const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 500;

const ROLE_SYSTEM_PROMPTS = {
  RETAILER:
    'You are Sahayak AI for B2B Retailers & Buyers. Assist with supplier discovery, RFQs, quotation comparison, seasonal demand planning, and bulk procurement. Never fabricate live prices, supplier verification badges, or real-time market data.',
  WHOLESALER:
    'You are Sahayak AI for Wholesalers & Sellers. Assist with products, inventory, bulk tier pricing, RFQ responses, sales, customers, and negotiation. Never fabricate external buyer data.',
  MANUFACTURER:
    'You are Sahayak AI for Manufacturers. Assist with production scheduling, capacity allocation, raw materials, quality workflows, OEM/private-label quotes, and distributor supply.',
  DISTRIBUTOR:
    'You are Sahayak AI for Traders & Distributors. Assist with supplier relationships, regional distribution, inventory planning, bulk pricing tiers, and manufacturer coordination.',
  SUPPLIER:
    'You are Sahayak AI for B2B Suppliers. Assist with product descriptions, inventory, RFQ quotations, delivery planning, and buyer communications.',
  LOGISTICS:
    'You are Sahayak AI for B2B Transport & Logistics Partners. Assist with shipments, drivers, fleet dispatch optimization, lane pricing, SLA adherence, and proof-of-delivery workflows.',
  WORKER:
    'You are Sahayak AI for Organization Workers. Assist strictly within the worker’s assigned tasks, role permissions, SOPs, and authorized organization data. Never disclose owner bank details, sensitive financial settings, or another organization’s data.',
  SUPER_ADMIN:
    'You are Sahayak AI Platform Governance Copilot for Super Admins. Assist with platform analytics, KYC verification workload, revenue clarity, anomaly flags, and operational insights.',
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

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractHttpStatus(err) {
  const direct = Number(err?.status || err?.statusCode || err?.code);
  if (direct >= 100 && direct <= 599) return direct;
  const msg = String(err?.message || '');
  const jsonCode = msg.match(/"code"\s*:\s*(\d{3})/);
  if (jsonCode) return Number(jsonCode[1]);
  return 0;
}

function extractRetryAfterMs(err) {
  const raw = err?.headers?.get?.('retry-after') || err?.headers?.['retry-after'] || err?.retryAfter;
  if (!raw) return null;
  const seconds = Number(raw);
  if (!Number.isNaN(seconds) && seconds > 0) {
    return Math.min(seconds * 1000, 10000);
  }
  return null;
}

export function classifyGeminiError(err) {
  const status = extractHttpStatus(err);
  const rawMsg = String(err?.message || '');
  const lower = rawMsg.toLowerCase();

  if (err?.errorCode === 'AI_NOT_CONFIGURED') {
    return {
      statusCode: 503,
      errorCode: 'AI_NOT_CONFIGURED',
      userMessage: 'SAHAYAK AI is not configured on this server. Please contact your administrator.',
      retryable: false,
      tryFallbackModel: false
    };
  }

  if (err?.name === 'AbortError' || err?.errorCode === 'AI_TIMEOUT' || lower.includes('timed out') || lower.includes('timeout')) {
    return {
      statusCode: 504,
      errorCode: 'AI_TIMEOUT',
      userMessage: 'SAHAYAK AI took too long to respond. Please try again.',
      retryable: true,
      tryFallbackModel: true
    };
  }

  if (status === 401 || status === 403 || lower.includes('api key not valid') || lower.includes('api_key_invalid') || lower.includes('permission_denied')) {
    return {
      statusCode: 502,
      errorCode: 'AI_AUTH_ERROR',
      userMessage: 'SAHAYAK AI could not authenticate with the AI service. Please contact platform support.',
      retryable: false,
      tryFallbackModel: false
    };
  }

  if (status === 400 || lower.includes('invalid_argument')) {
    return {
      statusCode: 400,
      errorCode: 'AI_INVALID_REQUEST',
      userMessage: 'Your message could not be processed by SAHAYAK AI. Please rephrase and try again.',
      retryable: false,
      tryFallbackModel: false
    };
  }

  if (status === 404 || lower.includes('not_found') || lower.includes('no longer available')) {
    return {
      statusCode: 503,
      errorCode: 'AI_MODEL_UNAVAILABLE',
      userMessage: 'SAHAYAK AI is temporarily unavailable. Please try again shortly.',
      retryable: false,
      tryFallbackModel: true
    };
  }

  if (status === 429 || lower.includes('resource_exhausted') || lower.includes('rate limit') || lower.includes('quota')) {
    return {
      statusCode: 429,
      errorCode: 'AI_RATE_LIMITED',
      userMessage: 'SAHAYAK AI is currently busy due to rate limits. Please wait a moment and try again.',
      retryable: true,
      tryFallbackModel: true
    };
  }

  if ([500, 502, 503, 504].includes(status) || lower.includes('unavailable') || lower.includes('high demand') || lower.includes('overloaded')) {
    return {
      statusCode: 503,
      errorCode: 'AI_TEMPORARILY_UNAVAILABLE',
      userMessage: 'SAHAYAK AI is temporarily unavailable. Please try again.',
      retryable: true,
      tryFallbackModel: true
    };
  }

  if (err?.errorCode === 'AI_MALFORMED_RESPONSE') {
    return {
      statusCode: 502,
      errorCode: 'AI_MALFORMED_RESPONSE',
      userMessage: 'SAHAYAK AI returned an incomplete response. Please try again.',
      retryable: true,
      tryFallbackModel: false
    };
  }

  return {
    statusCode: 503,
    errorCode: 'AI_PROVIDER_ERROR',
    userMessage: 'SAHAYAK AI is temporarily unavailable. Please try again.',
    retryable: true,
    tryFallbackModel: false
  };
}

export function estimateGeminiCostUsd(promptTokens = 0, completionTokens = 0) {
  // Approximate Flash-tier token pricing (USD per 1M tokens: $0.15 input / $0.60 output)
  const cost = (promptTokens * 0.15 + completionTokens * 0.6) / 1_000_000;
  return Number(cost.toFixed(6));
}

export class GeminiB2BProvider {
  constructor(options = {}) {
    this.apiKey = options.apiKey !== undefined ? options.apiKey : process.env.GEMINI_API_KEY;
    this.model = options.model || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
    const rawFallbacks =
      options.fallbackModels !== undefined
        ? options.fallbackModels
        : process.env.GEMINI_FALLBACK_MODELS !== undefined
          ? String(process.env.GEMINI_FALLBACK_MODELS)
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : DEFAULT_FALLBACK_MODELS;
    this.fallbackModels = rawFallbacks.filter((m) => m && m !== this.model);
    this.timeoutMs = Number(options.timeoutMs ?? process.env.GEMINI_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
    this.maxRetries = Number(options.maxRetries ?? process.env.GEMINI_MAX_RETRIES ?? DEFAULT_MAX_RETRIES);
    this.baseDelayMs = Number(options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS);
    this.sleepFn = options.sleepFn || defaultSleep;
    this.usageLogger = options.usageLogger || null;
    this.client = options.client !== undefined
      ? options.client
      : (this.apiKey ? new GoogleGenAI({ apiKey: this.apiKey }) : null);
  }

  isConfigured() {
    const key = String(this.apiKey || '').trim();
    return Boolean(this.client && key && !key.includes('your-gemini'));
  }

  async logUsage(record) {
    if (this.usageLogger) {
      await Promise.resolve(this.usageLogger(record)).catch(() => {});
      return;
    }
    await prisma.aiUsage.create({ data: record }).catch(() => {});
  }

  async callWithTimeout(model, contents, systemInstruction) {
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const timeoutErr = new Error(`Gemini request timed out after ${this.timeoutMs}ms.`);
        timeoutErr.errorCode = 'AI_TIMEOUT';
        timeoutErr.statusCode = 504;
        reject(timeoutErr);
      }, this.timeoutMs);
    });

    try {
      return await Promise.race([
        this.client.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            temperature: 0.4
          }
        }),
        timeoutPromise
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async generateBusinessResponse({
    userId,
    organizationId = null,
    role,
    prompt,
    history = [],
    businessContext = ''
  }) {
    const cleanPrompt = String(prompt || '').trim();
    if (!cleanPrompt) {
      const err = new Error('Prompt is required.');
      err.statusCode = 400;
      err.errorCode = 'AI_EMPTY_PROMPT';
      err.userMessage = 'Please enter a message for SAHAYAK AI.';
      err.retryable = false;
      throw err;
    }

    if (!this.isConfigured()) {
      const err = new Error('GEMINI_API_KEY is not configured on the backend server.');
      err.statusCode = 503;
      err.errorCode = 'AI_NOT_CONFIGURED';
      err.userMessage = 'SAHAYAK AI is not configured on this server. Please contact your administrator.';
      err.retryable = false;
      throw err;
    }

    const systemInstruction = `${ROLE_SYSTEM_PROMPTS[role] || ROLE_SYSTEM_PROMPTS.RETAILER}
Ground responses strictly in verified business context when provided. Clearly distinguish verified platform data vs AI-generated estimates. If live local prices, demand, suppliers, or stock figures are unavailable, explicitly say so and never fabricate them. Never expose another organization's private data.
For consequential actions (sending messages, placing orders, approving partnerships, changing financial records), output a draft and ask for explicit human confirmation.
${businessContext ? `Authorized Context: ${businessContext}` : ''}`;

    const sanitizedHistory = (Array.isArray(history) ? history : [])
      .filter((m) => m && typeof m.content === 'string' && m.content.trim())
      .slice(-12)
      .map((m) => ({
        role: m.sender === 'user' ? 'user' : 'model',
        parts: [{ text: m.content.trim().slice(0, 2000) }]
      }));

    const contents = [
      ...sanitizedHistory,
      { role: 'user', parts: [{ text: cleanPrompt.slice(0, 4000) }] }
    ];

    const candidateModels = [this.model, ...this.fallbackModels];
    const start = Date.now();
    let lastClassified = null;
    let lastModelTried = this.model;

    for (let modelIdx = 0; modelIdx < candidateModels.length; modelIdx++) {
      const activeModel = candidateModels[modelIdx];
      lastModelTried = activeModel;
      const attemptsAllowed = modelIdx === 0 ? Math.max(1, this.maxRetries + 1) : 1;

      for (let attempt = 1; attempt <= attemptsAllowed; attempt++) {
        try {
          const response = await this.callWithTimeout(activeModel, contents, systemInstruction);
          const text = typeof response?.text === 'string' ? response.text.trim() : '';

          if (!text) {
            const malformed = new Error('Gemini returned an empty or malformed response.');
            malformed.errorCode = 'AI_MALFORMED_RESPONSE';
            throw malformed;
          }

          const latencyMs = Date.now() - start;
          const usage = response.usageMetadata || {};
          const promptTokens = Number(usage.promptTokenCount || 0);
          const completionTokens = Number(usage.candidatesTokenCount || 0);
          const totalTokens = Number(usage.totalTokenCount || (promptTokens + completionTokens));
          const estimatedCostUsd = estimateGeminiCostUsd(promptTokens, completionTokens);

          await this.logUsage({
            userId,
            organizationId,
            model: activeModel,
            promptTokens,
            completionTokens,
            totalTokens,
            latencyMs,
            success: true
          });

          return {
            text,
            model: activeModel,
            fallbackUsed: modelIdx > 0,
            latencyMs,
            usage: {
              promptTokens,
              completionTokens,
              totalTokens,
              estimatedCostUsd
            }
          };
        } catch (err) {
          const classified = classifyGeminiError(err);
          lastClassified = classified;

          console.error('[Gemini AI Error]', {
            model: activeModel,
            attempt,
            statusCode: classified.statusCode,
            errorCode: classified.errorCode,
            retryable: classified.retryable,
            latencyMs: Date.now() - start
          });

          // Never retry permanent auth/validation errors
          if (!classified.retryable) {
            if (classified.tryFallbackModel && modelIdx < candidateModels.length - 1) {
              break;
            }
            const latencyMs = Date.now() - start;
            await this.logUsage({
              userId,
              organizationId,
              model: activeModel,
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
              latencyMs,
              success: false,
              errorCode: classified.errorCode.slice(0, 64)
            });
            const safeErr = new Error(classified.userMessage);
            safeErr.statusCode = classified.statusCode;
            safeErr.errorCode = classified.errorCode;
            safeErr.userMessage = classified.userMessage;
            safeErr.retryable = false;
            throw safeErr;
          }

          if (attempt < attemptsAllowed) {
            const retryAfter = extractRetryAfterMs(err);
            const jitter = Math.floor(Math.random() * 200);
            const backoff = retryAfter ?? Math.min(this.baseDelayMs * (2 ** (attempt - 1)) + jitter, 5000);
            await this.sleepFn(backoff);
          } else if (!classified.tryFallbackModel) {
            break;
          }
        }
      }

      if (lastClassified && !lastClassified.tryFallbackModel) {
        break;
      }
    }

    const finalInfo = lastClassified || {
      statusCode: 503,
      errorCode: 'AI_TEMPORARILY_UNAVAILABLE',
      userMessage: 'SAHAYAK AI is temporarily unavailable. Please try again.',
      retryable: true
    };
    const latencyMs = Date.now() - start;
    await this.logUsage({
      userId,
      organizationId,
      model: lastModelTried,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      latencyMs,
      success: false,
      errorCode: String(finalInfo.errorCode).slice(0, 64)
    });

    const safeErr = new Error(finalInfo.userMessage);
    safeErr.statusCode = finalInfo.statusCode;
    safeErr.errorCode = finalInfo.errorCode;
    safeErr.userMessage = finalInfo.userMessage;
    safeErr.retryable = finalInfo.retryable;
    throw safeErr;
  }
}
