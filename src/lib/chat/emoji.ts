// Chat page: the emoji picker's set (common emoji in six tabs) and its
// "Recent" row, kept per browser. Storage can be missing or blocked
// (private windows), so every read and write is guarded.

export const EMOJI_GROUPS = [
  {
    key: "smileys",
    label: "Smileys",
    icon: "😀",
    emoji: "😀 😃 😄 😁 😆 😅 😂 🤣 😊 🙂 🙃 😉 😌 😍 🥰 😘 😗 😋 😛 😜 🤪 😝 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😮‍💨 🤥 😴 😪 😷 🤒 🤕 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬".split(" "),
  },
  {
    key: "gestures",
    label: "Gestures",
    icon: "👍",
    emoji: "👍 👎 👌 🤌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💪 🫡 🫶 🙋 🙆 🙅 🤷 🤦 🙇".split(" "),
  },
  {
    key: "hearts",
    label: "Hearts",
    icon: "❤️",
    emoji: "❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ♥️".split(" "),
  },
  {
    key: "celebration",
    label: "Celebration",
    icon: "🎉",
    emoji: "🎉 🎊 🥳 🎈 🎂 🍰 🧁 🎁 🏆 🥇 🥈 🥉 🏅 🎖️ ⭐ 🌟 ✨ 💫 🔥 💯 🙌 🍾 🥂 🍻 🎯 🚀".split(" "),
  },
  {
    key: "objects",
    label: "Objects",
    icon: "💼",
    emoji: "💼 📁 📂 📄 📝 📌 📎 🖇️ 📅 📆 🗓️ ⏰ ⌛ 💻 🖥️ 📱 ⌨️ 🖱️ 🖨️ 📷 🎥 🎨 🖌️ ✏️ 🔍 💡 🔔 📣 📢 ☕ 🍵 🍕 🍔 🍪 🚗 ✈️ 🏠 🏢".split(" "),
  },
  {
    key: "symbols",
    label: "Symbols",
    icon: "✅",
    emoji: "✅ ☑️ ✔️ ❌ ❎ ⚠️ ❗ ❓ ‼️ ⁉️ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ ➡️ ⬅️ ⬆️ ⬇️ 🔁 🔄 ➕ ➖ 💲 ⏳ 🆗 🆕 🆙 🔝 🚫 ⛔ 💤".split(" "),
  },
] as const;

const RECENT_KEY = "hcm.chat.recentEmoji";
const RECENT_MAX = 16;

type Store = Pick<Storage, "getItem" | "setItem">;

function browserStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function recentEmoji(store: Store | null = browserStore()): string[] {
  try {
    const value = JSON.parse(store?.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

/** Moves `emoji` to the front of the Recent row; returns the new row. */
export function rememberEmoji(emoji: string, store: Store | null = browserStore()): string[] {
  const next = [emoji, ...recentEmoji(store).filter((item) => item !== emoji)].slice(0, RECENT_MAX);
  try {
    store?.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: the row still works for this visit.
  }
  return next;
}
