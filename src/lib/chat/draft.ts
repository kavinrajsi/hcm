// Chat page: the unsent text in each chat's message box, kept for this
// browser tab (sessionStorage) so switching chats, or going to Basecamp to
// connect, doesn't lose it. Storage can be missing or blocked, so every
// call is guarded.

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const key = (chatId: string) => `hcm.chat.draft.${chatId}`;

function tabStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadDraft(chatId: string, store: Store | null = tabStore()): string {
  try {
    return store?.getItem(key(chatId)) ?? "";
  } catch {
    return "";
  }
}

export function saveDraft(chatId: string, text: string, store: Store | null = tabStore()) {
  try {
    if (text) store?.setItem(key(chatId), text);
    else store?.removeItem(key(chatId));
  } catch {
    // Full or blocked: the draft just isn't kept.
  }
}

export function clearDraft(chatId: string, store: Store | null = tabStore()) {
  saveDraft(chatId, "", store);
}
