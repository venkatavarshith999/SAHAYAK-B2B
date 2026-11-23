/**
 * SAHAYAK B2B — AI Co-Pilot Panel (Gemini-powered)
 * Routes ALL AI calls through backend /api/ai/chat
 */

import { store, setState } from '../store.js';
import { api } from '../api.js';
import { showToast } from './toast.js';

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
  LOGISTICS: [
    '🗺️ Optimize my delivery routes',
    '💰 Competitive lane pricing',
    '📋 SLA compliance checklist',
    '🚚 Fleet utilization analysis',
    '📍 POD process improvement',
  ],
  SUPER_ADMIN: [
    '📊 Platform health summary',
    '🚨 Suspicious account activity',
    '✅ KYC queue prioritization',
    '📈 Revenue trend analysis',
    '🛡️ Security audit checklist',
  ],
};

export class AICopilot {
  constructor(container, options = {}) {
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
  }

  getSuggestions() {
    return ROLE_SUGGESTIONS[store.user?.role] || ROLE_SUGGESTIONS.RETAILER;
  }

  formatTime(date) {
    return new Date(date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  renderMessages() {
    return this.messages.map(m => `
      <div class="chat-message ${m.sender === 'user' ? 'user' : ''}">
        <div class="chat-bubble ${m.sender === 'user' ? 'user' : 'ai'}">
          ${escapeHtml(m.text).replace(/\n/g, '<br>')}
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
          ${this.loading ? `
            <div class="chat-message">
              <div class="chat-bubble ai">
                <div class="typing-indicator">
                  <div class="typing-dot"></div>
                  <div class="typing-dot"></div>
                  <div class="typing-dot"></div>
                </div>
              </div>
            </div>
          ` : ''}
        </div>

        <div class="copilot-suggestions" id="copilot-suggestions">
          ${suggestions.map(s => `
            <button class="suggestion-chip" onclick="window.__copilotSuggest('${escapeAttr(s)}')">
              ${s}
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
          <button class="btn btn-primary btn-sm btn-icon" onclick="window.__copilotSend()" style="border-radius:var(--radius-md);">
            ➤
          </button>
        </div>
      </aside>
    `;

    this.bindEvents();
    this.scrollToBottom();
  }

  bindEvents() {
    window.__copilotSend = () => this.sendMessage();
    window.__copilotSuggest = (text) => this.sendMessage(text);
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

  async sendMessage(text = null) {
    const input = document.getElementById('copilot-input');
    const prompt = text || (input ? input.value.trim() : '');
    if (!prompt) return;

    if (input) input.value = '';

    this.messages.push({ sender: 'user', text: prompt, time: new Date() });
    this.loading = true;
    this.updateMessages();

    try {
      // Route through backend — never call Gemini directly from browser
      const result = await api.chat(prompt, this.getHistory(), this.conversationId);
      this.messages.push({
        sender: 'ai',
        text: result.text || 'I received your message but could not generate a response.',
        time: new Date()
      });
      if (result.conversationId) this.conversationId = result.conversationId;
    } catch (err) {
      let errorMsg;
      if (err.status === 503) {
        errorMsg = '⚠️ Sahayak AI is not configured. The backend GEMINI_API_KEY environment variable is missing.\n\nTo enable AI: add your Gemini API key to the backend .env file.';
      } else if (err.status === 401) {
        errorMsg = '🔒 Please sign in to use the AI assistant.';
      } else if (err.status === 429) {
        errorMsg = '⏱️ AI rate limit reached. Please wait a moment and try again.';
      } else {
        errorMsg = `❌ AI assistant is temporarily unavailable. ${err.message || ''}`;
      }
      this.messages.push({ sender: 'ai', text: errorMsg, time: new Date() });
    }

    this.loading = false;
    this.updateMessages();
  }

  getHistory() {
    // Exclude the most recently pushed user message because `prompt` is passed separately
    return this.messages.slice(0, -1).slice(-8).map(m => ({
      sender: m.sender,
      content: m.text
    }));
  }

  updateMessages() {
    const container = document.getElementById('copilot-messages');
    if (!container) { this.render(); return; }
    container.innerHTML = this.renderMessages() + (this.loading ? `
      <div class="chat-message">
        <div class="chat-bubble ai">
          <div class="typing-indicator">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
          </div>
        </div>
      </div>
    ` : '');
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
