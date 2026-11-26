/**
 * SAHAYAK B2B — AI Co-Pilot Panel (Gemini-powered)
 * Routes ALL AI calls through backend /api/ai/chat.
 * Preserves existing purple-and-white Co-Pilot design while ensuring clean error states,
 * retry actions, loading guards, and role-aware suggestions.
 */

import { store } from '../store.js';
import { api } from '../api.js';

const ROLE_SUGGESTIONS = {
  RETAILER: [
    '📈 Trending products in my area?',
    '🏭 Find wholesale clothing suppliers',
    '💰 Compare quotations for 500 shirts',
    '📅 School season demand forecast',
    '🤝 Help me negotiate bulk pricing',
  ],
  WHOLESALER: [
    '📊 Analyze my top buyers',
    '💡 Pricing strategy for bulk orders',
    '📋 Draft a quotation response',
    '🌱 New product categories to stock',
    '🔄 Manage slow-moving inventory',
  ],
  MANUFACTURER: [
    '🏭 Optimize production capacity',
    '🤝 Find new distributor partners',
    '📦 Bulk order cost estimation',
    '📋 Draft OEM supply agreement',
    '📊 Demand planning for Q1',
  ],
  DISTRIBUTOR: [
    '🏬 Optimize regional stock distribution',
    '🤝 Strengthen manufacturer ties',
    '💡 Wholesale tier margin strategy',
    '📋 Draft distributor supply offer',
    '📦 Reduce slow-moving warehouse SKUs',
  ],
  SUPPLIER: [
    '📋 Draft a winning RFQ quotation',
    '💡 Competitive bulk pricing tiers',
    '🤝 Prepare a KAEN negotiation plan',
    '📦 Catalogue optimization checklist',
    '📈 Improve repeat buyer retention',
  ],
  LOGISTICS: [
    '🗺️ Optimize my delivery routes',
    '💰 Competitive lane pricing',
    '📋 SLA compliance checklist',
    '🚚 Fleet utilization analysis',
    '📍 POD process improvement',
  ],
  WORKER: [
    '✅ Prioritize my assigned tasks',
    '📋 Shift handover checklist',
    '📦 Warehouse dispatch best practices',
    '🗓️ Summarize my workflow responsibilities',
    '🛡️ Safety & compliance reminders',
  ],
  SUPER_ADMIN: [
    '📊 Platform health summary',
    '🚨 Suspicious account activity',
    '✅ KYC queue prioritization',
    '📈 Revenue trend analysis',
    '🛡️ Security audit checklist',
  ],
};

function getFriendlyAiError(err) {
  const code = err?.data?.code || '';
  if (err?.status === 401) {
    return 'Please sign in to use SAHAYAK AI.';
  }
  if (err?.status === 403) {
    return 'Your account must be active and verified to use SAHAYAK AI.';
  }
  if (code === 'AI_NOT_CONFIGURED') {
    return 'SAHAYAK AI is not configured on this server yet. Please contact platform support.';
  }
  if (err?.status === 429 || code === 'AI_RATE_LIMITED') {
    return 'SAHAYAK AI is receiving too many requests right now. Please wait a moment and try again.';
  }
  if (err?.status === 504 || code === 'AI_TIMEOUT') {
    return 'SAHAYAK AI took too long to respond. Please try again.';
  }
  if (err?.status === 400 || code === 'AI_EMPTY_PROMPT' || code === 'AI_INVALID_REQUEST') {
    return 'Please enter a clear business question for SAHAYAK AI.';
  }
  return 'SAHAYAK AI is temporarily unavailable. Please try again.';
}

export class AICopilot {
  constructor(container) {
    this.container = container;
    this.messages = [
      {
        sender: 'ai',
        text: `Hello${store.user?.fullName ? ', ' + store.user.fullName.split(' ')[0] : ''}! 👋 I'm your Sahayak AI Business Assistant.\n\nI can help you with supplier discovery, market insights, negotiation strategies, and more. What would you like to explore today?`,
        time: new Date()
      }
    ];
    this.loading = false;
    this.conversationId = null;
    this.render();
    this.hydrateRecentConversation();
  }

  getSuggestions() {
    const bizType = store.user?.organization?.businessType;
    const role = store.user?.role;
    return ROLE_SUGGESTIONS[bizType] || ROLE_SUGGESTIONS[role] || ROLE_SUGGESTIONS.RETAILER;
  }

  async hydrateRecentConversation() {
    if (store.demoMode || !store.user) return;
    try {
      const convs = await api.getConversations();
      if (!Array.isArray(convs) || convs.length === 0) return;
      const latest = convs[0];
      if (!latest?.id) return;
      const msgs = await api.getMessages(latest.id);
      if (!Array.isArray(msgs) || msgs.length === 0) return;
      this.conversationId = latest.id;
      this.messages = [
        this.messages[0],
        ...msgs.slice(-14).map((m) => ({
          sender: m.sender === 'user' ? 'user' : 'ai',
          text: String(m.content || ''),
          time: m.createdAt ? new Date(m.createdAt) : new Date()
        }))
      ];
      this.updateMessages();
    } catch {
      // Keep default welcome message cleanly if history cannot be loaded
    }
  }

  formatTime(date) {
    return new Date(date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  renderMessages() {
    return this.messages.map((m, idx) => `
      <div class="chat-message ${m.sender === 'user' ? 'user' : ''}">
        <div class="chat-bubble ${m.sender === 'user' ? 'user' : 'ai'}">
          ${escapeHtml(m.text).replace(/\n/g, '<br>')}
          ${m.isError && m.retryPrompt ? `
            <div style="margin-top:8px;">
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                onclick="window.__copilotRetry(${idx})"
                style="font-size:11px;padding:4px 10px;"
                ${this.loading ? 'disabled' : ''}
              >
                ↻ Retry
              </button>
            </div>
          ` : ''}
        </div>
        <div class="chat-timestamp" style="text-align:${m.sender === 'user' ? 'right' : 'left'}">
          ${this.formatTime(m.time)}
        </div>
      </div>
    `).join('');
  }

  render() {
    const suggestions = this.getSuggestions();
    this.container.innerHTML = `
      <aside class="copilot-panel" id="copilot-panel">
        <div class="copilot-header">
          <div class="copilot-ai-icon">🤖</div>
          <div>
            <div style="font-size:var(--text-sm);font-weight:700;color:var(--color-primary)">Sahayak AI Co-Pilot</div>
            <div style="font-size:var(--text-xs);color:var(--color-text-muted)">Powered by Gemini</div>
          </div>
          <button class="btn btn-icon btn-ghost btn-sm" onclick="window.__copilotClose()" style="margin-left:auto;" data-tooltip="Close">
            ✕
          </button>
        </div>

        <div class="copilot-messages" id="copilot-messages">
          ${this.renderMessages()}
          ${this.loading ? this.renderTypingBubble() : ''}
        </div>

        <div class="copilot-suggestions" id="copilot-suggestions">
          ${suggestions.map(s => `
            <button class="suggestion-chip" onclick="window.__copilotSuggest('${escapeAttr(s)}')">
              ${escapeHtml(s)}
            </button>
          `).join('')}
        </div>

        <div class="copilot-input">
          <input
            id="copilot-input"
            class="input-field"
            placeholder="Ask Sahayak AI…"
            onkeydown="if(event.key==='Enter')window.__copilotSend()"
          />
          <button id="copilot-send-btn" class="btn btn-primary btn-sm btn-icon" onclick="window.__copilotSend()" style="border-radius:var(--radius-md);" aria-label="Send message">
            ➤
          </button>
        </div>
      </aside>
    `;

    this.bindEvents();
    this.scrollToBottom();
  }

  renderTypingBubble() {
    return `
      <div class="chat-message">
        <div class="chat-bubble ai">
          <div class="typing-indicator" aria-label="Sahayak AI is typing">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    window.__copilotSend = () => this.sendMessage();
    window.__copilotSuggest = (text) => this.sendMessage(text);
    window.__copilotRetry = (msgIndex) => this.retryMessage(msgIndex);
    window.__copilotClose = () => {
      const panel = document.getElementById('copilot-panel');
      if (panel) panel.style.transform = 'translateX(100%)';
    };
  }

  scrollToBottom() {
    requestAnimationFrame(() => {
      const msgContainer = document.getElementById('copilot-messages');
      if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;
    });
  }

  setInputDisabled(disabled) {
    const input = document.getElementById('copilot-input');
    const sendBtn = document.getElementById('copilot-send-btn');
    if (input) input.disabled = disabled;
    if (sendBtn) sendBtn.disabled = disabled;
  }

  async retryMessage(errorIndex) {
    if (this.loading) return;
    const failed = this.messages[errorIndex];
    if (!failed || !failed.retryPrompt) return;
    const prompt = failed.retryPrompt;
    // Remove the failed error bubble before re-sending the exact prompt
    this.messages.splice(errorIndex, 1);
    await this.sendMessage(prompt, { skipUserPush: true });
  }

  async sendMessage(text = null, { skipUserPush = false } = {}) {
    if (this.loading) return;
    const input = document.getElementById('copilot-input');
    const prompt = String(text ?? (input ? input.value : '')).trim();
    if (!prompt) return;

    if (input && !skipUserPush) input.value = '';

    if (!skipUserPush) {
      this.messages.push({ sender: 'user', text: prompt, time: new Date() });
    }
    this.loading = true;
    this.setInputDisabled(true);
    this.updateMessages();

    try {
      // Route through backend — never call Gemini directly from browser
      const result = await api.chat(prompt, this.getHistory(), this.conversationId);
      if (!result?.text) {
        throw Object.assign(new Error('Empty response'), { status: 502, data: { code: 'AI_MALFORMED_RESPONSE', retryable: true } });
      }
      this.messages.push({
        sender: 'ai',
        text: result.text,
        time: new Date()
      });
      if (result.conversationId) this.conversationId = result.conversationId;
    } catch (err) {
      const friendlyMsg = getFriendlyAiError(err);
      const retryable = err?.data?.retryable !== false && err?.status !== 401 && err?.status !== 403;
      this.messages.push({
        sender: 'ai',
        text: `⚠️ ${friendlyMsg}`,
        time: new Date(),
        isError: true,
        retryPrompt: retryable ? prompt : null
      });
    } finally {
      this.loading = false;
      this.setInputDisabled(false);
      this.updateMessages();
    }
  }

  getHistory() {
    // Exclude failed error bubbles and the current user message passed separately as `prompt`
    return this.messages
      .slice(0, -1)
      .filter((m) => !m.isError)
      .slice(-8)
      .map((m) => ({
        sender: m.sender,
        content: m.text
      }));
  }

  updateMessages() {
    const container = document.getElementById('copilot-messages');
    if (!container) { this.render(); return; }
    container.innerHTML = this.renderMessages() + (this.loading ? this.renderTypingBubble() : '');
    this.scrollToBottom();
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escapeAttr(str) {
  return String(str).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}
