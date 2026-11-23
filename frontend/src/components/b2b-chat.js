/**
 * SAHAYAK B2B — Phase D Module 4: Shared B2B Business Chat Component
 * Organization-isolated conversations, PDF/image attachments, entity refs, search & live refresh.
 */

import { api } from '../api.js';
import { store } from '../store.js';
import { showToast } from './toast.js';
import { esc, fmtDate } from '../utils/sanitize.js';

let chatPollTimer = null;

export function stopB2bChatPolling() {
  if (chatPollTimer) {
    clearInterval(chatPollTimer);
    chatPollTimer = null;
  }
}

export async function renderB2bChatPanel(onRefresh) {
  stopB2bChatPolling();
  const [{ conversations = [] }, { organizations = [] }] = await Promise.all([
    api.getB2bConversations(),
    api.discoverPartners().catch(() => ({ organizations: [] }))
  ]);

  if (!window.__activeChatConvId && conversations.length > 0) {
    window.__activeChatConvId = conversations[0].id;
  }
  const activeConv = conversations.find((c) => c.id === window.__activeChatConvId) || conversations[0] || null;
  let messages = [];
  if (activeConv) {
    const res = await api.getB2bMessages(activeConv.id, window.__chatSearch || '');
    messages = res.messages || [];
  }

  const myOrgId = store.user?.organization?.id;

  window.__selectChatConv = (id) => {
    window.__activeChatConvId = id;
    window.__chatSearch = '';
    onRefresh();
  };

  window.__startNewChat = async (e) => {
    e.preventDefault();
    const targetOrgId = document.getElementById('chat-new-org')?.value;
    if (!targetOrgId) return;
    try {
      const { conversation } = await api.openB2bConversation(targetOrgId);
      window.__activeChatConvId = conversation.id;
      onRefresh();
    } catch (err) { showToast(err.message, 'error'); }
  };

  window.__searchChatMsgs = (e) => {
    e.preventDefault();
    window.__chatSearch = document.getElementById('chat-msg-search')?.value.trim() || '';
    onRefresh();
  };

  window.__sendB2bMsg = async (e, convId) => {
    e.preventDefault();
    const body = document.getElementById('b2b-msg-input')?.value.trim() || '';
    const file = document.getElementById('b2b-msg-file')?.files?.[0] || null;
    const refType = document.getElementById('b2b-ref-type')?.value || null;
    const refLabel = document.getElementById('b2b-ref-label')?.value.trim() || null;
    if (!body && !file) return;
    try {
      await api.sendB2bMessage(convId, { body, file, refType, refLabel });
      onRefresh();
    } catch (err) { showToast(err.message || 'Failed to send message.', 'error'); }
  };

  // Gentle 12s auto-refresh while chat panel is mounted
  if (activeConv) {
    chatPollTimer = setInterval(async () => {
      const listEl = document.getElementById('b2b-messages-list');
      if (!listEl) { stopB2bChatPolling(); return; }
      try {
        const res = await api.getB2bMessages(activeConv.id, window.__chatSearch || '');
        if ((res.messages || []).length !== messages.length) {
          messages = res.messages || [];
          listEl.innerHTML = renderMessagesHTML(messages, myOrgId);
          listEl.scrollTop = listEl.scrollHeight;
        }
      } catch {}
    }, 12000);
  }

  return `
    <div class="animate-fadeInUp" style="display:flex;flex-direction:column;gap:16px;">
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:12px;">
        <div><h1>💬 B2B Business Chat</h1><p>Secure organization-to-organization messaging with PDF/image sharing and RFQ/Order references.</p></div>
        ${organizations.length ? `
          <form onsubmit="window.__startNewChat(event)" style="display:flex;gap:8px;flex-wrap:wrap;">
            <select id="chat-new-org" class="input-field select-field" style="width:220px;">
              ${organizations.map((o) => `<option value="${esc(o.id)}">${esc(o.name)} (${esc(o.businessType)})</option>`).join('')}
            </select>
            <button type="submit" class="btn btn-primary btn-sm">+ Message Business</button>
          </form>
        ` : ''}
      </div>

      <div style="display:grid;grid-template-columns:280px 1fr;gap:16px;min-height:520px;">
        <!-- Conversations List -->
        <div class="card-soft p-4" style="display:flex;flex-direction:column;gap:8px;overflow-y:auto;max-height:600px;">
          <div style="font-size:var(--text-xs);font-weight:800;color:var(--color-text-muted);text-transform:uppercase;padding:4px 8px;">Conversations (${conversations.length})</div>
          ${conversations.map((c) => `
            <button onclick="window.__selectChatConv('${esc(c.id)}')" style="text-align:left;padding:12px;border-radius:var(--radius-md);border:1px solid ${activeConv?.id === c.id ? 'var(--color-primary)' : 'var(--color-border)'};background:${activeConv?.id === c.id ? 'var(--color-brand-50,#f5f3ff)' : '#fff'};cursor:pointer;">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                <strong style="font-size:var(--text-sm);">${esc(c.counterparty?.name)}</strong>
                ${c.unreadCount > 0 ? `<span class="badge badge-brand">${esc(c.unreadCount)}</span>` : ''}
              </div>
              <div style="font-size:11px;color:var(--color-text-muted);">${esc(c.counterparty?.businessType)} · ${esc(c.counterparty?.city)}</div>
              ${c.latestMessage ? `<div style="font-size:11px;color:var(--color-text-secondary);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(c.latestMessage.body)}</div>` : ''}
            </button>`).join('') || `<p style="font-size:var(--text-xs);color:var(--color-text-muted);padding:12px;">No conversations yet. Select a verified business above to start chatting.</p>`}
        </div>

        <!-- Active Chat Thread -->
        <div class="card-soft p-5" style="display:flex;flex-direction:column;min-width:0;max-height:600px;">
          ${activeConv ? `
            <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;border-bottom:1px solid var(--color-border);gap:10px;flex-wrap:wrap;">
              <div>
                <strong style="font-size:var(--text-base);">${esc(activeConv.counterparty?.name)}</strong>
                <div style="font-size:11px;color:var(--color-text-muted);">${esc(activeConv.counterparty?.businessType)} · ${esc(activeConv.counterparty?.city)}</div>
              </div>
              <form onsubmit="window.__searchChatMsgs(event)" style="display:flex;gap:6px;">
                <input id="chat-msg-search" class="input-field" placeholder="Search messages…" value="${esc(window.__chatSearch || '')}" style="width:160px;padding:6px 10px;" />
                <button type="submit" class="btn btn-ghost btn-sm">🔍</button>
              </form>
            </div>

            <div id="b2b-messages-list" style="flex:1;overflow-y:auto;padding:16px 4px;display:flex;flex-direction:column;gap:10px;">
              ${renderMessagesHTML(messages, myOrgId)}
            </div>

            <form onsubmit="window.__sendB2bMsg(event, '${esc(activeConv.id)}')" style="padding-top:12px;border-top:1px solid var(--color-border);display:flex;flex-direction:column;gap:8px;">
              <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <select id="b2b-ref-type" class="input-field select-field" style="width:140px;padding:6px 8px;font-size:12px;">
                  <option value="">No Reference</option>
                  <option value="RFQ">Ref: RFQ</option>
                  <option value="QUOTATION">Ref: Quotation</option>
                  <option value="ORDER">Ref: Order</option>
                  <option value="PRODUCT">Ref: Product</option>
                </select>
                <input id="b2b-ref-label" class="input-field" placeholder="Ref code/label (optional)" style="width:180px;padding:6px 10px;font-size:12px;" />
                <input id="b2b-msg-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" class="input-field" style="flex:1;padding:5px;font-size:12px;" />
              </div>
              <div style="display:flex;gap:8px;">
                <input id="b2b-msg-input" class="input-field" placeholder="Write a business message…" style="flex:1;" />
                <button type="submit" class="btn btn-primary">Send →</button>
              </div>
            </form>
          ` : `<div style="margin:auto;text-align:center;color:var(--color-text-muted);">Select or start a business conversation on the left.</div>`}
        </div>
      </div>
    </div>`;
}

function renderMessagesHTML(messages, myOrgId) {
  if (!messages.length) {
    return `<div style="text-align:center;color:var(--color-text-muted);font-size:var(--text-sm);margin:auto;">No messages yet. Say hello or share an RFQ / document.</div>`;
  }
  return messages.map((m) => {
    const mine = m.senderOrgId === myOrgId;
    return `
      <div style="align-self:${mine ? 'flex-end' : 'flex-start'};max-width:78%;">
        <div style="font-size:10px;color:var(--color-text-muted);margin-bottom:3px;text-align:${mine ? 'right' : 'left'};">
          ${esc(m.senderName)} · ${esc(fmtDate(m.createdAt))}
        </div>
        <div style="padding:10px 14px;border-radius:12px;background:${mine ? 'var(--color-primary)' : 'var(--color-bg,#f3f4f6)'};color:${mine ? '#fff' : 'var(--color-text-primary)'};font-size:var(--text-sm);">
          ${m.refType ? `<div style="font-size:11px;font-weight:700;margin-bottom:4px;opacity:0.9;">🔗 ${esc(m.refType)}${m.refLabel ? ': ' + esc(m.refLabel) : ''}</div>` : ''}
          <div>${esc(m.body)}</div>
          ${m.attachmentFileName ? `<div style="margin-top:6px;"><a href="/api/chat/messages/${esc(m.id)}/attachment" target="_blank" style="color:${mine ? '#e0e7ff' : 'var(--color-primary)'};font-weight:700;font-size:12px;">📎 ${esc(m.attachmentFileName)}</a></div>` : ''}
        </div>
      </div>`;
  }).join('');
}
